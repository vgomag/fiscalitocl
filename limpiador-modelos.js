/* ═══════════════════════════════════════════════════════════════════
   LIMPIADOR-MODELOS.JS — Operación de un solo uso
   v1.0 · 2026-05-07 · Fiscalito
   ═══════════════════════════════════════════════════════════════════
   PROPÓSITO
     Limpiar tu biblioteca de modelos en `case_resolution_models`:
       1. Detectar duplicados (por nombre normalizado y similitud)
          y mantener solo el más completo de cada grupo.
       2. Anonimizar nombres en los TÍTULOS (ej: "ACTA DE ENTREVISTA
          BENJI 79 G" → "ACTA DE ENTREVISTA").
       3. Anonimizar el CONTENIDO de las plantillas: reemplaza nombres
          propios, RUTs, emails, teléfonos y fechas específicas con
          placeholders ([DENUNCIANTE], [DENUNCIADO], [RUT], etc.).

   FLUJO
     1. El script abre un overlay con TRES secciones:
          - Duplicados detectados (con cuál se queda)
          - Modelos con datos personales en el título
          - Modelos con PII en el contenido (preview del cambio)
     2. Revisas cada sección, des-marcas lo que NO quieras tocar.
     3. Apretas "Aplicar limpieza" → ejecuta DELETE + UPDATE en
        Supabase con tu sesión activa.

   USO
     1. Abre Fiscalito y loguéate.
     2. F12 → pestaña Console.
     3. Pega TODO este archivo y presiona Enter.
     4. Revisa el overlay y aplica.
     5. Refresca la pestaña Modelos para ver los cambios.

   SEGURIDAD
     - DELETE y UPDATE son destructivos. Hace falta tu confirmación
       explícita en la UI antes de tocar nada.
     - Las modificaciones de contenido se hacen vía Claude Haiku (~5
       llamadas) para anonimizar inteligentemente respetando el
       formato institucional.
     - Tras correrlo, puedes borrar este archivo.
   ═══════════════════════════════════════════════════════════════════ */

(async function limpiadorModelos() {
  'use strict';

  /* ── 0. PRE-CHECKS ─────────────────────────────────────────── */
  let _sb, _session, _authFetch;
  try {
    _sb        = (typeof sb !== 'undefined') ? sb : (window.sb || null);
    _session   = (typeof session !== 'undefined') ? session : (window.session || null);
    _authFetch = (typeof authFetch === 'function') ? authFetch : (window.authFetch || fetch);
  } catch (e) {
    alert('⚠ Pega este script en la consola de la app Fiscalito (DevTools → Console).');
    return;
  }
  if (!_sb || !_session) {
    alert('⚠ Tienes que estar logueado/a en Fiscalito.');
    return;
  }

  const sb = _sb, session = _session;
  const uid = session.user.id;
  const fetcher = _authFetch;
  const CHAT_ENDPOINT_LOCAL = '/.netlify/functions/chat';
  const MODEL = 'claude-haiku-4-5-20251001';

  /* ── 1. CARGAR MODELOS ─────────────────────────────────────── */
  console.log('[limp] Cargando modelos…');
  const { data: models, error } = await sb
    .from('case_resolution_models')
    .select('id,name,file_name,resolution_category,procedure_type,extracted_text,is_global,case_id,created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) { alert('⚠ Error: ' + error.message); return; }
  console.log(`[limp] ${models.length} modelos encontrados.`);

  /* ── 2. DETECCIÓN DE DUPLICADOS ────────────────────────────── */
  /* Normaliza el nombre: lowercase, sin tildes, sin tokens-PII obvios. */
  function normName(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      /* Quitar nombres propios típicos (mayúsculas seguidas) */
      .replace(/\b[A-Z][a-z]{2,}\b/g, '')
      /* Quitar números */
      .replace(/\d+/g, '')
      /* Quitar puntuación */
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Agrupar por nombre normalizado */
  const groups = {};
  for (const m of models) {
    const k = `${m.resolution_category||'otro'}|${m.procedure_type||'-'}|${normName(m.name)}`;
    (groups[k] = groups[k] || []).push(m);
  }
  /* Keep groups with > 1 */
  const dupGroups = Object.entries(groups)
    .filter(([k, arr]) => arr.length > 1)
    .map(([k, arr]) => ({
      key: k,
      members: arr.sort((a, b) => (b.extracted_text?.length || 0) - (a.extracted_text?.length || 0)),
    }));
  /* El primero (más largo) es el "keeper", el resto se borran */
  let toDelete = [];
  for (const g of dupGroups) {
    g.keeper = g.members[0];
    g.toDelete = g.members.slice(1);
    toDelete.push(...g.toDelete);
  }

  /* ── 3. DETECCIÓN DE PII EN NOMBRES ────────────────────────── */
  /* Patrones: palabras en MAYÚSCULAS de 3+ chars que no son palabras
     comunes del vocabulario procedimental, o nombres comunes chilenos. */
  const COMMON_WORDS = new Set([
    'RESOLUCION','RESOLUCIÓN','ACTA','OFICIO','MEMO','MEDIDA','PROTECCION','PROTECCIÓN',
    'NOTIFICACION','NOTIFICACIÓN','CITACION','CITACIÓN','CERTIFICACION','CERTIFICACIÓN',
    'CERTIFICADO','RATIFICACION','RATIFICACIÓN','DENUNCIA','DECLARACION','DECLARACIÓN',
    'INCORPORACION','INCORPORACIÓN','INCORPORA','INSTRUYE','EXENTA','VISTOS','CONSIDERANDO',
    'RESUELVO','UMAG','UNIVERSIDAD','MAGALLANES','FISCALIA','FISCALÍA','UNIVERSITARIA',
    'INVESTIGADORA','INVESTIGADOR','ACTUARIA','ACTUARIO','FISCAL','SUMARIO','SUMARIA',
    'INVESTIGACION','INVESTIGACIÓN','PROCEDIMIENTO','DISCIPLINARIO','ADMINISTRATIVO',
    'CARGO','CARGOS','RESGUARDO','DILIGENCIA','TRAMITE','TRÁMITE','MERO','VISTA','INFORME',
    'INCULPADO','INCULPADA','TESTIGO','PERSONA','DENUNCIADA','DENUNCIADO','DENUNCIANTE',
    'CONSENTIMIENTO','GRABACION','GRABACIÓN','ENTREVISTA','ALEJAMIENTO','ACUERDO',
    'ANTECEDENTES','REMITIDOS','PRESENCIALMENTE','LABORALES','RECEPCION','RECEPCIÓN',
    'CARGO','ACEPTA','SOLICITA','OFICIAL','BUSQUEDAS','BÚSQUEDAS','FRUSTRADAS',
    'REGISTRESE','REGÍSTRESE','NOTIFIQUESE','NOTIFÍQUESE','TENGASE','TÉNGASE','PRESENTE',
    'EN','DE','LA','EL','LAS','LOS','POR','CON','PARA','UN','UNA','UNOS','UNAS','Y','O','A',
    'AL','DEL','SIN','SOBRE','ANTE','HASTA','DESDE','ENTRE','TRAS','SEGUN','SEGÚN','SI','NO',
    'CALIDAD','BENJAMIN','SUSANA',
  ]);
  function piiTokensInName(name) {
    const tokens = String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().split(/[^A-ZÑ0-9]+/).filter(t => t.length >= 2);
    /* Marcar tokens como sospechosos si: NO son palabras comunes Y son alfabéticos puros (probablemente nombres) */
    return tokens.filter(t => !COMMON_WORDS.has(t) && /^[A-ZÑ]+$/.test(t) && t.length >= 3);
  }

  const namesWithPii = models
    .filter(m => piiTokensInName(m.name).length > 0)
    .map(m => ({ ...m, _pii: piiTokensInName(m.name) }));

  /* ── 4. UI OVERLAY ─────────────────────────────────────────── */
  document.getElementById('__limpModelosOverlay')?.remove();
  const ovId = '__limpModelosOverlay';
  const ov = document.createElement('div');
  ov.id = ovId;
  ov.innerHTML = `
    <style>
      #${ovId}{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
      #${ovId} .lc{background:#fff;border-radius:12px;width:min(880px,95vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
      #${ovId} .lc-h{padding:14px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
      #${ovId} .lc-t{font-size:15px;font-weight:700;color:#111}
      #${ovId} .lc-x{cursor:pointer;font-size:18px;color:#888;background:none;border:0}
      #${ovId} .lc-b{padding:14px 20px;overflow:auto;flex:1;font-size:12.5px;color:#333;line-height:1.5}
      #${ovId} .lc-sec{margin-bottom:18px;border:1px solid #eee;border-radius:8px}
      #${ovId} .lc-sec-h{padding:10px 14px;background:#fafafa;border-bottom:1px solid #eee;font-weight:700;font-size:13px;display:flex;justify-content:space-between;align-items:center}
      #${ovId} .lc-sec-c{padding:8px 14px;max-height:340px;overflow:auto}
      #${ovId} table{border-collapse:collapse;width:100%;font-size:11.5px}
      #${ovId} td,#${ovId} th{border:1px solid #eee;padding:6px 8px;text-align:left;vertical-align:top}
      #${ovId} th{background:#f5f5f7;font-weight:600}
      #${ovId} .pill{font-size:10px;padding:1px 6px;border-radius:99px;background:#f5f5f7;color:#555}
      #${ovId} .pill-keep{background:#dcfce7;color:#166534}
      #${ovId} .pill-del{background:#fee2e2;color:#b91c1c}
      #${ovId} .pii-tok{display:inline-block;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;font-size:10px;margin:0 2px}
      #${ovId} .lc-foot{padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end}
      #${ovId} .btn{padding:8px 14px;border-radius:6px;border:0;cursor:pointer;font-weight:600;font-size:12px;font-family:inherit}
      #${ovId} .btn-pri{background:#dc2626;color:#fff}
      #${ovId} .btn-pri:disabled{background:#9ca3af;cursor:not-allowed}
      #${ovId} .btn-sec{background:#f5f5f7;color:#111}
      #${ovId} .lc-log{font-family:ui-monospace,monospace;font-size:11px;background:#fafafa;border:1px solid #eee;border-radius:6px;padding:8px;margin-top:8px;max-height:160px;overflow:auto;white-space:pre-wrap}
    </style>
    <div class="lc">
      <div class="lc-h">
        <div class="lc-t">🧹 Limpieza de modelos</div>
        <button class="lc-x" id="lcClose">✕</button>
      </div>
      <div class="lc-b">

        <div class="lc-sec">
          <div class="lc-sec-h">
            <span>1️⃣ Duplicados detectados (${dupGroups.length} grupos · ${toDelete.length} a borrar)</span>
            <label style="font-size:11px;font-weight:500;cursor:pointer"><input type="checkbox" id="lcDupAll" checked> aplicar todo</label>
          </div>
          <div class="lc-sec-c" id="lcDupList">
            ${dupGroups.length === 0 ? '<div style="color:#888;padding:8px">Sin duplicados — todos los modelos son únicos.</div>' : `
              <table>
                <tr><th>Mantener</th><th>Borrar</th><th>Categoría</th></tr>
                ${dupGroups.map((g, i) => `
                  <tr>
                    <td>
                      <label style="cursor:pointer;display:flex;align-items:flex-start;gap:6px">
                        <span class="pill pill-keep">📌 Keeper</span>
                        <span><strong>${escHtml(g.keeper.name)}</strong><br>
                        <span style="font-size:10px;color:#666">${(g.keeper.extracted_text||'').length} chars · ${escHtml(g.keeper.id.slice(0,8))}</span></span>
                      </label>
                    </td>
                    <td>
                      ${g.toDelete.map(m => `
                        <label style="cursor:pointer;display:flex;align-items:flex-start;gap:6px;margin-bottom:4px">
                          <input type="checkbox" class="lc-dup-cb" data-id="${m.id}" checked>
                          <span class="pill pill-del">🗑</span>
                          <span>${escHtml(m.name)}<br>
                          <span style="font-size:10px;color:#666">${(m.extracted_text||'').length} chars</span></span>
                        </label>
                      `).join('')}
                    </td>
                    <td><span class="pill">${escHtml(g.keeper.resolution_category)}</span><br><span style="font-size:10px;color:#666">${escHtml(g.keeper.procedure_type||'-')}</span></td>
                  </tr>
                `).join('')}
              </table>
            `}
          </div>
        </div>

        <div class="lc-sec">
          <div class="lc-sec-h">
            <span>2️⃣ Nombres con datos personales (${namesWithPii.length} modelos)</span>
            <label style="font-size:11px;font-weight:500;cursor:pointer"><input type="checkbox" id="lcNameAll" checked> aplicar todo</label>
          </div>
          <div class="lc-sec-c" id="lcNameList">
            ${namesWithPii.length === 0 ? '<div style="color:#888;padding:8px">Sin nombres con PII detectada.</div>' : `
              <table>
                <tr><th>Actual</th><th>→ Propuesto</th><th>PII detectada</th></tr>
                ${namesWithPii.map(m => {
                  const cleanName = cleanNameOf(m);
                  return `
                    <tr>
                      <td>
                        <label style="cursor:pointer;display:flex;align-items:flex-start;gap:6px">
                          <input type="checkbox" class="lc-name-cb" data-id="${m.id}" data-new="${escAttr(cleanName)}" checked>
                          <span>${escHtml(m.name)}</span>
                        </label>
                      </td>
                      <td><strong>${escHtml(cleanName)}</strong></td>
                      <td>${m._pii.map(t=>`<span class="pii-tok">${escHtml(t)}</span>`).join('')}</td>
                    </tr>
                  `;
                }).join('')}
              </table>
            `}
          </div>
        </div>

        <div class="lc-sec">
          <div class="lc-sec-h">
            <span>3️⃣ Anonimización de contenido (con Claude Haiku)</span>
            <label style="font-size:11px;font-weight:500;cursor:pointer"><input type="checkbox" id="lcContentAll"> activar</label>
          </div>
          <div class="lc-sec-c">
            <div style="font-size:11.5px;color:#555;line-height:1.5">
              Si activas esta opción, Claude Haiku reescribirá el <strong>extracted_text</strong> de cada
              modelo (excluyendo los marcados para borrar) reemplazando nombres propios, RUTs,
              direcciones, fechas específicas, números de oficio reales, etc., con
              placeholders genéricos como <code>{nombre_denunciante}</code>,
              <code>{rut_denunciado}</code>, <code>{fecha}</code>.
              <br><br>
              <strong>Costo:</strong> ${models.length - toDelete.length} llamadas a Claude (~30 segundos).
              <br>
              <strong>Reversible:</strong> los originales NO se respaldan automáticamente. Si quieres
              respaldo previo, hazlo manualmente desde Supabase antes de aplicar.
            </div>
          </div>
        </div>

        <div id="lcLog" class="lc-log" style="display:none"></div>
      </div>
      <div class="lc-foot">
        <button class="btn btn-sec" id="lcCancel">Cancelar</button>
        <button class="btn btn-pri" id="lcApply">⚠ Aplicar limpieza</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  function escHtml(s) {
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escAttr(s) { return escHtml(s).replace(/"/g,'&quot;'); }

  function cleanNameOf(m) {
    /* Quita los tokens PII detectados, normaliza espacios, capitaliza */
    let n = String(m.name || '');
    for (const t of m._pii) {
      const re = new RegExp('\\b' + t.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&') + '\\b', 'gi');
      n = n.replace(re, '');
    }
    /* Limpiar números sueltos al final (ej "BENJI 79 G" → "ACTA DE ENTREVISTA 79 G" → quitamos "79 G") */
    n = n.replace(/\b\d+\s*[A-Z]\b/gi, '');
    n = n.replace(/[,;]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    n = n.replace(/[\s,;-]+$/g, '');
    return n || 'Modelo sin nombre';
  }

  const $ = id => document.getElementById(id);
  $('lcClose').onclick = () => ov.remove();
  $('lcCancel').onclick = () => ov.remove();

  /* Toggle "aplicar todo" para cada sección */
  $('lcDupAll')?.addEventListener('change', e => {
    document.querySelectorAll('.lc-dup-cb').forEach(cb => cb.checked = e.target.checked);
  });
  $('lcNameAll')?.addEventListener('change', e => {
    document.querySelectorAll('.lc-name-cb').forEach(cb => cb.checked = e.target.checked);
  });

  function log(msg, color) {
    const el = $('lcLog');
    el.style.display = 'block';
    const line = document.createElement('div');
    if (color) line.style.color = color;
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    console.log('[limp]', msg);
  }

  /* ── 5. APLICAR LIMPIEZA ──────────────────────────────────── */
  $('lcApply').onclick = async () => {
    if (!confirm('Vas a borrar duplicados y modificar contenido. Esta acción NO se puede deshacer fácilmente. ¿Continuar?')) return;

    $('lcApply').disabled = true; $('lcCancel').disabled = true;
    $('lcApply').textContent = 'Aplicando…';

    /* (a) Borrar duplicados */
    const idsToDelete = [...document.querySelectorAll('.lc-dup-cb:checked')].map(cb => cb.dataset.id);
    if (idsToDelete.length) {
      log(`▶ Borrando ${idsToDelete.length} duplicados…`);
      try {
        const { error } = await sb.from('case_resolution_models').delete().in('id', idsToDelete).eq('user_id', uid);
        if (error) throw error;
        log(`  ✓ ${idsToDelete.length} duplicados borrados`, 'green');
      } catch (e) {
        log(`  ✗ Error borrando: ${e.message}`, 'red');
      }
    }

    /* (b) Renombrar modelos con PII en el título */
    const renames = [...document.querySelectorAll('.lc-name-cb:checked')].map(cb => ({ id: cb.dataset.id, newName: cb.dataset.new }));
    if (renames.length) {
      log(`▶ Renombrando ${renames.length} modelos…`);
      let ok = 0;
      for (const r of renames) {
        try {
          const { error } = await sb.from('case_resolution_models').update({ name: r.newName }).eq('id', r.id).eq('user_id', uid);
          if (error) throw error;
          ok++;
        } catch (e) {
          log(`  ✗ ${r.id.slice(0,8)}: ${e.message}`, 'red');
        }
      }
      log(`  ✓ ${ok}/${renames.length} renombrados`, 'green');
    }

    /* (c) Anonimizar contenido (opcional, usando Claude Haiku) */
    if ($('lcContentAll').checked) {
      const survivors = models.filter(m => !idsToDelete.includes(m.id));
      log(`▶ Anonimizando contenido de ${survivors.length} modelos vía Claude Haiku…`);
      let ok = 0, fail = 0;
      for (let i = 0; i < survivors.length; i++) {
        const m = survivors[i];
        try {
          if (!m.extracted_text || m.extracted_text.length < 100) { continue; }

          const system = `Eres un asistente que anonimiza plantillas jurídicas chilenas. Recibirás un texto de plantilla institucional. Tu tarea: reemplazar TODOS los datos personales específicos (nombres propios, apellidos, RUTs, direcciones particulares, números de teléfono, emails, fechas concretas como "15 de marzo de 2024", números de oficio o resolución específicos) con placeholders genéricos en formato {clave}. Mantén EXACTAMENTE el resto del texto: encabezados institucionales (UMAG, Fiscalía Universitaria, etc.), fórmulas legales, estructura, gramática, citas normativas. Reemplazos sugeridos:
- Nombres de denunciantes → {nombre_denunciante}
- Nombres de denunciados → {nombre_denunciado}
- Nombres de testigos → {nombre_testigo}
- Nombres de fiscales/investigadores → {nombre_fiscal_investigador}
- Nombres de actuarios → {nombre_actuaria}
- RUTs → {rut_denunciante} / {rut_denunciado} / {rut_testigo} según contexto
- Fechas específicas → {fecha} o {fecha_evento_descriptivo}
- N° de resolución específico → {numero_resolucion}
- Direcciones, salas, oficinas → {lugar} o {dependencia}
- Decretos institucionales (ej "Decreto N°30/SU/2022") → MANTENER tal cual (son normativa)
- Cargos institucionales genéricos (Fiscal, Actuaria, Investigador) → MANTENER

Devuelve SOLO el texto anonimizado, sin explicaciones, sin markdown, sin backticks.`;

          const res = await fetcher(CHAT_ENDPOINT_LOCAL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 4000,
              system,
              messages: [{ role: 'user', content: m.extracted_text }],
            }),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          const cleaned = data?.content?.[0]?.text || '';
          if (!cleaned || cleaned.length < 50) throw new Error('respuesta vacía');

          const { error } = await sb.from('case_resolution_models')
            .update({ extracted_text: cleaned })
            .eq('id', m.id).eq('user_id', uid);
          if (error) throw error;
          ok++;
          log(`  ✓ ${i+1}/${survivors.length}: ${m.name.slice(0,40)}`, 'green');
          /* throttle */
          await new Promise(r => setTimeout(r, 800));
        } catch (e) {
          fail++;
          log(`  ✗ ${i+1}/${survivors.length}: ${e.message}`, 'red');
        }
      }
      log(`▶ Anonimización: ✓ ${ok} · ✗ ${fail}`, ok===survivors.length?'green':'orange');
    }

    log('══ Listo. Refresca la pestaña Modelos para ver los cambios ══', 'green');
    $('lcApply').textContent = 'Cerrar';
    $('lcApply').disabled = false;
    $('lcApply').onclick = () => ov.remove();
    $('lcCancel').textContent = 'Cerrar';
    $('lcCancel').disabled = false;

    /* Refrescar conteo en sidebar */
    if (typeof window.loadModelCounts === 'function') window.loadModelCounts();
  };

  console.log('[limp] Overlay listo. Revisa y aprieta "Aplicar limpieza".');
})();
