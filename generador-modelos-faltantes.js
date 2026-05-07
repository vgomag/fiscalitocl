/* ═══════════════════════════════════════════════════════════════════
   GENERADOR-MODELOS-FALTANTES.JS — Operación de un solo uso
   v1.0 · 2026-05-06 · Fiscalito
   ═══════════════════════════════════════════════════════════════════
   PROPÓSITO
     Tomar los modelos que ya tienes cargados en `case_resolution_models`
     y generar — vía Claude — los que faltan para completar la matriz:

         26 categorías × 3 tipos de procedimiento
         (Investigación Sumaria, Sumario Administrativo, Procedimiento
          Disciplinario)

     Replica el formato, encabezados, fórmulas y estilo institucional de
     los modelos que ya cargaste. Inserta los generados con
     `is_global = TRUE` para que estén disponibles en todos tus casos.

   USO (una sola vez, manual)
     1. Abre la app Fiscalito en el navegador y loguéate.
     2. Abre un caso cualquiera (para que `currentCase` esté seteado;
        los modelos generados se asocian a ese case_id pero quedan
        globales).
     3. Abre DevTools → pestaña Console (F12).
     4. Copia TODO el contenido de este archivo y pégalo en la consola.
     5. Pulsa Enter. El script abre un overlay y te muestra:
          - Modelos existentes (por categoría × procedimiento)
          - Celdas faltantes que se van a generar
          - Botones "Generar TODO" / "Cancelar"
     6. Confirma. El script genera por lotes (≈3-4 lotes, ~1-3 min).
     7. Cuando termine, refresca la pestaña "Modelos" del caso para
        ver los nuevos modelos.

   SEGURIDAD
     - No guarda datos fuera de tu Supabase.
     - Usa tu sesión activa (window.session, window.sb, authFetch).
     - Llama a /.netlify/functions/chat (rate-limit 60 req/h, este
       script hace ≤15 calls).
     - Tras correrlo, puedes borrar este archivo.
   ═══════════════════════════════════════════════════════════════════ */

(async function generadorModelosFaltantes() {
  'use strict';

  /* ── 0. PRE-CHECKS ─────────────────────────────────────────── */
  if (!window.sb || !window.session) {
    alert('⚠ Tienes que estar logueado/a en la app antes de correr este script.');
    return;
  }
  if (!window.currentCase || !window.currentCase.id) {
    if (!confirm('⚠ No hay un caso abierto. Los modelos generados se asociarán al primer caso activo de tu lista. ¿Continuar?')) return;
  }

  /* ── 1. CONSTANTES ─────────────────────────────────────────── */
  const CATEGORIES = {
    citacion:                     'Citación',
    notificacion:                 'Notificación',
    acta_declaracion:             'Acta de Declaración',
    acta_ratificacion:            'Acta de Ratificación',
    acta_entrevista:              'Acta de Entrevista',
    acta_notificacion:            'Acta de Notificación',
    resolucion_acepta_cargo:      'Resolución Acepta Cargo',
    resolucion_cita_declarar:     'Resolución Cita a Declarar',
    resolucion_medida_resguardo:  'Medida de Resguardo',
    resolucion_decreta_diligencia:'Decreta Diligencia',
    resolucion_general:           'Resolución General',
    oficio:                       'Oficio',
    cuestionario:                 'Cuestionario',
    constancia:                   'Constancia',
    consentimiento:               'Consentimiento',
    certificacion:                'Certificación',
    acuerdo_alejamiento:          'Acuerdo de Alejamiento',
    formulacion_cargos:           'Formulación de Cargos',
    descargos:                    'Descargos',
    provee_descargos:             'Provee Descargos',
    informe:                      'Informe',
    vista_fiscal:                 'Vista Fiscal',
    incorpora_antecedentes:       'Incorpora Antecedentes',
    denuncia:                     'Denuncia',
    memo:                         'Memo',
  };

  const PROCEDURE_TYPES = {
    investigacion_sumaria:       'Investigación Sumaria',
    sumario_administrativo:      'Sumario Administrativo',
    procedimiento_disciplinario: 'Procedimiento Disciplinario',
  };

  const CHAT_ENDPOINT_LOCAL = '/.netlify/functions/chat';
  const MODEL = 'claude-sonnet-4-20250514';
  const MAX_TOKENS = 8000;
  const BATCH_SIZE = 6;          // categorías por llamada a Claude
  const THROTTLE_MS = 1500;      // pausa entre llamadas
  const MAX_REF_MODELS = 6;      // ejemplos de estilo por prompt
  const MAX_REF_CHARS = 2500;    // chars por ejemplo

  const sb = window.sb;
  const session = window.session;
  const uid = session.user.id;
  const fetcher = (typeof window.authFetch === 'function') ? window.authFetch : fetch;
  const targetCaseId = (window.currentCase && window.currentCase.id)
    || (Array.isArray(window.allCases) && window.allCases[0]?.id);
  if (!targetCaseId) {
    alert('⚠ No se encontró ningún caso para asociar los modelos. Crea o abre un caso primero.');
    return;
  }

  /* ── 2. CARGAR MODELOS EXISTENTES ──────────────────────────── */
  console.log('[gen] Cargando modelos existentes…');
  const { data: existing, error: e1 } = await sb
    .from('case_resolution_models')
    .select('id,name,resolution_category,procedure_type,extracted_text,is_global,case_id')
    .eq('user_id', uid);
  if (e1) {
    alert('⚠ Error cargando modelos: ' + (e1.message || e1));
    return;
  }
  console.log(`[gen] ${existing?.length || 0} modelos existentes encontrados.`);

  /* ── 3. CALCULAR MATRIZ FALTANTES ──────────────────────────── */
  const have = new Set();    // claves "categoria|procedure_type" cubiertas
  const byCat = {};          // categoria → [modelos] (cualquier procedure_type)
  for (const m of (existing || [])) {
    if (!m.resolution_category) continue;
    const proc = m.procedure_type || 'investigacion_sumaria';
    have.add(`${m.resolution_category}|${proc}`);
    if (proc === 'ambos') {
      have.add(`${m.resolution_category}|investigacion_sumaria`);
      have.add(`${m.resolution_category}|sumario_administrativo`);
      have.add(`${m.resolution_category}|procedimiento_disciplinario`);
    }
    (byCat[m.resolution_category] = byCat[m.resolution_category] || []).push(m);
  }
  const missing = [];
  for (const procKey of Object.keys(PROCEDURE_TYPES)) {
    for (const catKey of Object.keys(CATEGORIES)) {
      if (!have.has(`${catKey}|${procKey}`)) {
        missing.push({ category: catKey, procedure_type: procKey });
      }
    }
  }
  console.table(missing.slice(0, 30));
  console.log(`[gen] ${missing.length} celdas faltantes en la matriz 26 × 3.`);
  if (!missing.length) {
    alert('✓ Tu matriz ya está completa. No hay modelos faltantes.');
    return;
  }

  /* ── 4. UI OVERLAY ─────────────────────────────────────────── */
  const ovId = '__genModelosOverlay';
  document.getElementById(ovId)?.remove();
  const ov = document.createElement('div');
  ov.id = ovId;
  ov.innerHTML = `
    <style>
      #${ovId}{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
      #${ovId} .gm-card{background:#fff;border-radius:12px;width:min(720px,92vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)}
      #${ovId} .gm-head{padding:16px 20px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
      #${ovId} .gm-title{font-size:15px;font-weight:700;color:#111}
      #${ovId} .gm-x{cursor:pointer;font-size:18px;color:#888;background:none;border:0;padding:0 4px}
      #${ovId} .gm-body{padding:14px 20px;overflow:auto;flex:1;font-size:12.5px;color:#333;line-height:1.55}
      #${ovId} .gm-stat{background:#f5f5f7;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:12px}
      #${ovId} .gm-prog{height:6px;background:#eee;border-radius:99px;overflow:hidden;margin:8px 0}
      #${ovId} .gm-prog-bar{height:100%;background:#4f46e5;width:0%;transition:width .3s}
      #${ovId} .gm-log{font-family:ui-monospace,monospace;font-size:11px;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:8px;margin-top:8px;max-height:240px;overflow:auto;white-space:pre-wrap}
      #${ovId} .gm-log .ok{color:#059669}
      #${ovId} .gm-log .err{color:#ef4444}
      #${ovId} .gm-foot{padding:12px 20px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end}
      #${ovId} .gm-btn{padding:8px 14px;border-radius:6px;border:0;cursor:pointer;font-weight:600;font-size:12px;font-family:inherit}
      #${ovId} .gm-btn-pri{background:#4f46e5;color:#fff}
      #${ovId} .gm-btn-pri:disabled{background:#9ca3af;cursor:not-allowed}
      #${ovId} .gm-btn-sec{background:#f5f5f7;color:#111}
      #${ovId} table{border-collapse:collapse;font-size:11px;margin:6px 0;width:100%}
      #${ovId} td,#${ovId} th{border:1px solid #eee;padding:4px 8px;text-align:left}
      #${ovId} th{background:#fafafa}
    </style>
    <div class="gm-card">
      <div class="gm-head">
        <div class="gm-title">🧩 Generador de modelos faltantes</div>
        <button class="gm-x" id="gmClose">✕</button>
      </div>
      <div class="gm-body">
        <div class="gm-stat" id="gmStat"></div>
        <div id="gmMatrix"></div>
        <div class="gm-prog"><div class="gm-prog-bar" id="gmBar"></div></div>
        <div class="gm-log" id="gmLog"></div>
      </div>
      <div class="gm-foot">
        <button class="gm-btn gm-btn-sec" id="gmCancel">Cancelar</button>
        <button class="gm-btn gm-btn-pri" id="gmGo">Generar ${missing.length} modelos</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  const $ = id => document.getElementById(id);
  $('gmClose').onclick = () => ov.remove();
  $('gmCancel').onclick = () => ov.remove();

  /* Render preview de la matriz */
  const procs = Object.keys(PROCEDURE_TYPES);
  const matrixHTML = `
    <div class="gm-stat">
      <strong>${existing.length}</strong> modelos existentes ·
      <strong>${missing.length}</strong> faltantes ·
      ${BATCH_SIZE} por lote · ≈${Math.ceil(missing.length / BATCH_SIZE)} lotes
    </div>
    <table>
      <thead><tr><th>Categoría</th>${procs.map(p=>`<th>${PROCEDURE_TYPES[p]}</th>`).join('')}</tr></thead>
      <tbody>
        ${Object.keys(CATEGORIES).map(c => `
          <tr>
            <td>${CATEGORIES[c]}</td>
            ${procs.map(p => `
              <td style="text-align:center;color:${have.has(`${c}|${p}`)?'#059669':'#ef4444'}">
                ${have.has(`${c}|${p}`)?'✓':'✱'}
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="font-size:11px;color:#666;margin-top:6px">
      ✓ existe · <span style="color:#ef4444">✱</span> falta — se generará
    </div>
  `;
  $('gmMatrix').innerHTML = matrixHTML;

  function log(msg, cls='') {
    const el = $('gmLog');
    if (!el) return;
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
    console.log('[gen]', msg);
  }
  function progress(done, total) {
    const pct = Math.round((done / total) * 100);
    const bar = $('gmBar'); if (bar) bar.style.width = pct + '%';
  }

  /* ── 5. PROMPT BUILDER ─────────────────────────────────────── */
  function buildPrompt(batch, refModels, procKey) {
    const procLabel = PROCEDURE_TYPES[procKey];
    const refsText = refModels
      .slice(0, MAX_REF_MODELS)
      .map((m, i) => {
        const cat = CATEGORIES[m.resolution_category] || m.resolution_category;
        const proc = PROCEDURE_TYPES[m.procedure_type] || m.procedure_type;
        const txt = (m.extracted_text || '').slice(0, MAX_REF_CHARS);
        return `--- EJEMPLO ${i+1} (${cat} · ${proc}) ---\nNombre: ${m.name}\n${txt}\n`;
      })
      .join('\n');

    const requestList = batch.map((b, i) =>
      `${i+1}. category="${b.category}" → ${CATEGORIES[b.category]}`
    ).join('\n');

    const system = `Eres un asistente jurídico especializado en derecho administrativo disciplinario chileno, específicamente en procedimientos disciplinarios universitarios (Universidad de Magallanes).

Tu tarea: a partir de los modelos institucionales reales que la usuaria ha cargado, generar plantillas para las categorías solicitadas, replicando ESTRICTAMENTE su formato, encabezados, fórmulas y estilo institucional.

REGLAS:
1. Replica encabezados ("UNIVERSIDAD DE MAGALLANES", "FISCALÍA UNIVERSITARIA", etc.), preámbulos y fórmulas de cierre exactamente como aparecen en los ejemplos.
2. Usa placeholders en MAYÚSCULAS y entre corchetes para datos del caso: [NOMBRE_DENUNCIANTE], [NOMBRE_DENUNCIADO], [RUT_DENUNCIADO], [FECHA], [HECHOS], [N°_EXPEDIENTE], [N°_RESOLUCIÓN], [FISCAL_INSTRUCTOR], [ACTUARIA], etc.
3. Cada plantilla debe ser texto plano (sin markdown), autónoma, lista para ser editada.
4. Adapta las referencias normativas y nomenclatura al tipo de procedimiento solicitado (Investigación Sumaria, Sumario Administrativo o Procedimiento Disciplinario estudiantil).
5. Respeta el lenguaje institucional formal — sin valoraciones, sin opiniones.
6. Devuelve EXCLUSIVAMENTE un JSON válido sin texto adicional, sin markdown, sin backticks. Estructura exacta:

{"templates":[{"category":"<key>","procedure_type":"<key>","name":"<nombre humano>","text":"<contenido plantilla>"}]}`;

    const user = `EJEMPLOS DE ESTILO INSTITUCIONAL DE LA USUARIA:

${refsText || '(no hay ejemplos disponibles para esta categoría — usa estilo formal estándar de fiscalía universitaria chilena)'}

══════════════════════════════════════════════════════════════════
GENERA PLANTILLAS PARA — Tipo de procedimiento: ${procLabel}
══════════════════════════════════════════════════════════════════

${requestList}

Para cada categoría devuelve un objeto en "templates" con:
- category: la key exacta de la lista (ej: "${batch[0].category}")
- procedure_type: "${procKey}"
- name: nombre humano descriptivo (ej: "${CATEGORIES[batch[0].category]} (${procLabel})")
- text: contenido completo de la plantilla con placeholders

Responde SOLO con el JSON. Nada más.`;

    return { system, messages: [{ role: 'user', content: user }] };
  }

  /* ── 6. PICK REFERENCIAS POR PROCEDURE ─────────────────────── */
  function pickRefs(procKey) {
    /* Prioriza modelos del mismo procedure_type, luego cualquier otro,
       y diversifica categorías para que el LLM vea variedad de estilos. */
    const all = existing || [];
    const same = all.filter(m => m.procedure_type === procKey && m.extracted_text);
    const others = all.filter(m => m.procedure_type !== procKey && m.extracted_text);
    const pool = [...same, ...others];
    /* Dedupe por categoría: 1 ejemplo por categoría hasta llenar MAX_REF_MODELS */
    const seen = new Set(); const picks = [];
    for (const m of pool) {
      const k = m.resolution_category;
      if (seen.has(k)) continue;
      seen.add(k); picks.push(m);
      if (picks.length >= MAX_REF_MODELS) break;
    }
    return picks;
  }

  /* ── 7. CALL CLAUDE ────────────────────────────────────────── */
  async function callClaude({ system, messages }) {
    const res = await fetcher(CHAT_ENDPOINT_LOCAL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system, messages }),
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status}: ${t.slice(0,200)}`);
    }
    const data = await res.json();
    const txt = data?.content?.[0]?.text || data?.content || '';
    return typeof txt === 'string' ? txt : JSON.stringify(txt);
  }

  function parseTemplates(raw) {
    let t = (raw || '').trim();
    /* Permitir backticks por si Claude los pone igual */
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    /* Encontrar el primer "{" y el último "}" para tolerar texto extra */
    const i = t.indexOf('{'); const j = t.lastIndexOf('}');
    if (i < 0 || j < 0) throw new Error('No se encontró JSON en la respuesta');
    const obj = JSON.parse(t.slice(i, j + 1));
    if (!obj || !Array.isArray(obj.templates)) throw new Error('Formato JSON inválido (falta "templates")');
    return obj.templates;
  }

  /* ── 8. INSERT EN SUPABASE ─────────────────────────────────── */
  async function insertTemplate(tpl) {
    /* Validaciones */
    if (!tpl || !tpl.category || !CATEGORIES[tpl.category]) {
      throw new Error(`category inválida: ${tpl?.category}`);
    }
    if (!tpl.procedure_type || !PROCEDURE_TYPES[tpl.procedure_type]) {
      throw new Error(`procedure_type inválido: ${tpl?.procedure_type}`);
    }
    const text = String(tpl.text || '').trim();
    if (text.length < 100) throw new Error('texto < 100 chars');

    const procLabel = PROCEDURE_TYPES[tpl.procedure_type];
    const catLabel  = CATEGORIES[tpl.category];
    const name = (tpl.name && String(tpl.name).trim()) || `${catLabel} (${procLabel}) — IA`;

    const payload = {
      case_id: targetCaseId,
      user_id: uid,
      name,
      file_name: `modelo-ia-${tpl.category}-${tpl.procedure_type}.txt`,
      extracted_text: text,
      model_type: 'resolucion',
      resolution_category: tpl.category,
      procedure_type: tpl.procedure_type,
      is_global: true,
      description: `Generado por IA · plantilla institucional de ${catLabel} para ${procLabel}.`,
    };
    const { error } = await sb.from('case_resolution_models').insert(payload);
    if (error) throw new Error(error.message || 'INSERT falló');
  }

  /* ── 9. EJECUTAR EN LOTES ──────────────────────────────────── */
  $('gmGo').onclick = async () => {
    $('gmGo').disabled = true; $('gmCancel').disabled = true;
    log(`▶ Iniciando generación: ${missing.length} modelos en ${Math.ceil(missing.length/BATCH_SIZE)} lotes…`);

    /* Agrupar faltantes por procedure_type para reutilizar referencias */
    const byProc = {};
    for (const m of missing) (byProc[m.procedure_type] = byProc[m.procedure_type] || []).push(m);

    let done = 0, ok = 0, fail = 0;
    const total = missing.length;

    for (const [procKey, items] of Object.entries(byProc)) {
      const refs = pickRefs(procKey);
      log(`──── ${PROCEDURE_TYPES[procKey]} (${items.length} faltantes, ${refs.length} ejemplos de estilo)`);

      /* Lotes de BATCH_SIZE */
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        log(`  → lote ${Math.floor(i/BATCH_SIZE)+1}: ${batch.map(b=>b.category).join(', ')}`);
        try {
          const { system, messages } = buildPrompt(batch, refs, procKey);
          const raw = await callClaude({ system, messages });
          const templates = parseTemplates(raw);

          for (const tpl of templates) {
            done++;
            try {
              await insertTemplate(tpl);
              ok++;
              log(`    ✓ ${tpl.category} · ${tpl.procedure_type}`, 'ok');
            } catch (e) {
              fail++;
              log(`    ✗ ${tpl.category}: ${e.message}`, 'err');
            }
            progress(done, total);
          }
          /* Si Claude devolvió menos templates que pedimos, contar el resto como fallidos */
          const returnedKeys = new Set(templates.map(t => t.category));
          for (const b of batch) {
            if (!returnedKeys.has(b.category)) {
              done++; fail++;
              log(`    ✗ ${b.category}: no devuelto por la IA`, 'err');
              progress(done, total);
            }
          }
        } catch (e) {
          /* Lote completo fallido */
          for (const b of batch) {
            done++; fail++;
            log(`    ✗ ${b.category}: ${e.message}`, 'err');
            progress(done, total);
          }
        }
        /* throttle */
        await new Promise(r => setTimeout(r, THROTTLE_MS));
      }
    }

    log(`══ Listo. ✓ ${ok} insertados · ✗ ${fail} fallidos de ${total} ══`, ok===total?'ok':'');
    $('gmCancel').textContent = 'Cerrar';
    $('gmCancel').disabled = false;
    $('gmCancel').onclick = () => ov.remove();

    /* Refrescar badge de modelos en sidebar */
    if (typeof window.loadModelCounts === 'function') window.loadModelCounts();
  };

  console.log('[gen] Generador listo. Revisa el overlay y pulsa "Generar".');
})();
