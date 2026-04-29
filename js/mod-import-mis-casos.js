/* ═══════════════════════════════════════════════════════════════════
   MOD-IMPORT-MIS-CASOS.JS  ·  Fiscalito
   v1.0 · 2026-04-28
   - Botón "📥 Importar Mis Casos (completo)": carga un .xlsx con la
     misma estructura que genera la app (6 hojas: Mis Casos, Gestión,
     Carta Gantt, Pendientes Actuarias, Plazos, Feriados) y vuelca a
     la BD lo accionable de las hojas "Mis Casos" y "Carta Gantt".
   - Match por EXP. (cases.name).
   - Actualiza SOLO campos vacíos para no sobrescribir nada.
   - La actuaria se persiste vía window.fiscalitoUMAG.setActuariaCaso
     (BD si existe la columna, localStorage como fallback automático).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[import-mis-casos] cargando…');

  /* ── Helpers globals ──────────────────────────────────────────── */
  const _readGlobal = (name) => {
    try {
      return (new Function(
        'try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined; } catch(e){ return undefined; }'
      ))();
    } catch { return undefined; }
  };
  const X = () => (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : null;
  const SB = () => window.sb || _readGlobal('sb');

  function _normCol(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  }
  function _normExp(s){
    return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[\/–—-]/g,'-');
  }
  function _isoDate(v){
    if(!v) return null;
    if(v instanceof Date) return v.toISOString().slice(0,10);
    const s=String(v).trim();
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[0];
    m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    const d=new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
    return null;
  }

  /* ── Mapeo Etapa visible → estado_procedimiento estándar ─────── */
  const ETAPA_TO_ESTADO = {
    'indagatoria':                'Indagatoria',
    'termino etapa indagatoria':  'Término Etapa Indagatoria',
    'término etapa indagatoria':  'Término Etapa Indagatoria',
    'discusion y prueba':         'Discusión y Prueba',
    'discusión y prueba':         'Discusión y Prueba',
    'preparacion de vista':       'Preparación de Vista',
    'preparación de vista':       'Preparación de Vista',
    'decision':                   'Decisión',
    'decisión':                   'Decisión',
    'finalizacion':               'Finalización',
    'finalización':               'Finalización',
    'terminada':                  'Finalización'
  };
  function mapEtapa(v){
    if(!v) return '';
    return ETAPA_TO_ESTADO[_normCol(v)] || String(v).trim();
  }

  /* ── Detección de columnas en una hoja ────────────────────────── */
  const COL_ALIASES_MIS_CASOS = {
    exp:                       ['exp','exp.','expediente'],
    etapa:                     ['etapa','etapa actual','estado'],
    resolucion:                ['resolucion','resolucion inicio'],
    fecha_resolucion:          ['fecha resolucion','fecha de resolucion','fecha res. inicio'],
    fecha_denuncia:            ['fecha denuncia','fecha de denuncia'],
    fecha_recepcion_fiscalia:  ['fecha de recepcion fiscalia','fecha recepcion','fecha de recepcion','fecha recepcion fiscalia'],
    tipo_procedimiento:        ['procedimiento','tipo de procedimiento','tipo procedimiento'],
    denunciante:               ['denunciante','denunciantes'],
    estamento_denunciante:     ['estamento denunciante','estamentos denunciante'],
    denunciado:                ['denunciado/a','denunciado','denunciada','denunciados'],
    estamento_denunciado:      ['estamento denunciado/a','estamento denunciado','estamentos denunciado'],
    protocolo:                 ['protocolo aplicable','protocolo','norma'],
    materia:                   ['materia'],
    observaciones:             ['observaciones','observacion'],
    actuaria:                  ['actuaria asignada','actuaria']
  };
  const COL_ALIASES_GANTT = {
    exp:                       ['exp','exp.','expediente'],
    actuaria:                  ['actuaria','actuaria asignada'],
    etapa:                     ['etapa actual','etapa'],
    tipo_procedimiento:        ['procedimiento','tipo de procedimiento'],
    protocolo:                 ['protocolo aplicable','protocolo'],
    denunciado:                ['denunciado/a','denunciado'],
    fecha_recepcion_fiscalia:  ['fecha recepcion','fecha de recepcion'],
    ultima_resolucion:         ['ultima resolucion','última resolución','ultima resol.','última resol.']
  };

  function _findHeaderRow(ws, aliases, requiredKeys){
    const xx=X();
    const ref = ws['!ref']; if (!ref) return null;
    const range = xx.utils.decode_range(ref);
    for (let r=range.s.r; r<=Math.min(range.s.r+10, range.e.r); r++){
      const colNames={};
      for (let c=range.s.c; c<=range.e.c; c++){
        const cell = ws[xx.utils.encode_cell({r,c})];
        if (!cell) continue;
        const v = _normCol(cell.v);
        for (const [key, list] of Object.entries(aliases)){
          if (list.includes(v)){ colNames[key]=c; break; }
        }
      }
      const hasAll = requiredKeys.every(k => k in colNames);
      if (hasAll) return { headerRow: r, cols: colNames };
    }
    return null;
  }
  function _readRows(ws, hdr){
    const xx=X();
    const range = xx.utils.decode_range(ws['!ref']);
    const out=[];
    for (let r=hdr.headerRow+1; r<=range.e.r; r++){
      const row={};
      for (const [key, c] of Object.entries(hdr.cols)){
        const cell = ws[xx.utils.encode_cell({r,c})];
        row[key] = cell ? cell.v : null;
      }
      /* Necesitamos al menos EXP. */
      if (!row.exp) continue;
      /* Saltarse separadores tipo "━━━ NOMBRE ━━━" o "▸ Etapa: …" */
      const e = String(row.exp).trim();
      if (e.startsWith('━') || e.startsWith('▸') || e.startsWith('  ▸')) continue;
      out.push(row);
    }
    return out;
  }

  /* ── Picking de casos ─────────────────────────────────────────── */
  function pickAllCases() {
    try {
      if (typeof allCases !== 'undefined' && Array.isArray(allCases)) return allCases.slice();
    } catch {}
    if (Array.isArray(window.allCases)) return window.allCases.slice();
    const v = _readGlobal('allCases');
    if (Array.isArray(v)) return v.slice();
    return [];
  }

  /* ── Construir update por caso (campos vacíos) ────────────────── */
  function buildUpdate(caso, mc, gantt){
    const upd = {};
    /* Helpers */
    function setIfEmpty(field, value, transform){
      if (value === null || value === undefined || value === '') return;
      const cur = caso[field];
      const isEmpty = cur === null || cur === undefined || cur === '' ||
        (Array.isArray(cur) && cur.length===0);
      if (!isEmpty) return;
      const v = transform ? transform(value) : value;
      if (v !== null && v !== undefined && v !== '') upd[field] = v;
    }

    /* === Desde hoja "Mis Casos" === */
    if (mc) {
      setIfEmpty('nueva_resolucion', mc.resolucion, v => String(v).trim());
      setIfEmpty('fecha_resolucion',          mc.fecha_resolucion,         _isoDate);
      setIfEmpty('fecha_denuncia',            mc.fecha_denuncia,           _isoDate);
      setIfEmpty('fecha_recepcion_fiscalia',  mc.fecha_recepcion_fiscalia, _isoDate);
      setIfEmpty('tipo_procedimiento',        mc.tipo_procedimiento,       v => String(v).trim());
      setIfEmpty('protocolo',                 mc.protocolo,                v => String(v).trim());
      setIfEmpty('materia',                   mc.materia,                  v => String(v).trim());
      setIfEmpty('observaciones',             mc.observaciones,            v => String(v).trim());
      setIfEmpty('estado_procedimiento',      mc.etapa,                    mapEtapa);
      /* Denunciantes y denunciados → arrays */
      if (mc.denunciante) {
        const cur = caso.denunciantes;
        const empty = !cur || (Array.isArray(cur) && cur.length===0);
        if (empty) upd.denunciantes = [String(mc.denunciante).trim()];
      }
      if (mc.denunciado) {
        const cur = caso.denunciados;
        const empty = !cur || (Array.isArray(cur) && cur.length===0);
        if (empty) upd.denunciados = [String(mc.denunciado).trim()];
      }
      /* Estamentos */
      if (mc.estamento_denunciante) {
        const cur = caso.estamentos_denunciante;
        const empty = !cur || (Array.isArray(cur) && cur.length===0);
        if (empty) upd.estamentos_denunciante = [String(mc.estamento_denunciante).trim()];
      }
      if (mc.estamento_denunciado) {
        const cur = caso.estamentos_denunciado;
        const empty = !cur || (Array.isArray(cur) && cur.length===0);
        if (empty) upd.estamentos_denunciado = [String(mc.estamento_denunciado).trim()];
      }
    }
    /* === Desde "Carta Gantt": completar lo que falta === */
    if (gantt) {
      setIfEmpty('estado_procedimiento',      gantt.etapa,                 mapEtapa);
      setIfEmpty('tipo_procedimiento',        gantt.tipo_procedimiento,    v => String(v).trim());
      setIfEmpty('protocolo',                 gantt.protocolo,             v => String(v).trim());
      setIfEmpty('fecha_recepcion_fiscalia',  gantt.fecha_recepcion_fiscalia, _isoDate);
      setIfEmpty('fecha_resolucion',          gantt.ultima_resolucion,     _isoDate);
      if (gantt.denunciado) {
        const cur = caso.denunciados;
        const empty = !cur || (Array.isArray(cur) && cur.length===0);
        if (empty) upd.denunciados = [String(gantt.denunciado).trim()];
      }
    }
    return upd;
  }

  /* ─────────────────────────────────────────────────────────────
     IMPORT principal
     ───────────────────────────────────────────────────────────── */
  function importMisCasosCompleto(){
    const xx = X();
    if (!xx) {
      const m='La librería XLSX no está disponible. Recarga la página.';
      if (typeof showToast==='function') showToast('⚠ '+m); else alert(m); return;
    }
    let input = document.getElementById('imp-mis-casos-file');
    if (input) input.remove();
    input = document.createElement('input');
    input.type='file';
    input.id='imp-mis-casos-file';
    input.accept='.xlsx,.xls';
    input.style.display='none';
    document.body.appendChild(input);

    input.addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = xx.read(buf, { type:'array', cellDates:true });

        /* Localizar hojas (case-insensitive) */
        function findSheet(re){
          const name = wb.SheetNames.find(n => re.test(n));
          return name ? wb.Sheets[name] : null;
        }
        const wsMC    = findSheet(/^mis\s*casos$/i);
        const wsGantt = findSheet(/^carta\s*gantt$|^gantt$/i);
        if (!wsMC && !wsGantt){
          alert('No encontré las hojas "Mis Casos" ni "Carta Gantt" en este archivo.');
          return;
        }

        /* Detectar headers y leer filas */
        const hdrMC    = wsMC    ? _findHeaderRow(wsMC,    COL_ALIASES_MIS_CASOS, ['exp','etapa']) : null;
        const hdrGantt = wsGantt ? _findHeaderRow(wsGantt, COL_ALIASES_GANTT,     ['exp','actuaria']) : null;
        const rowsMC    = hdrMC    ? _readRows(wsMC,    hdrMC)    : [];
        const rowsGantt = hdrGantt ? _readRows(wsGantt, hdrGantt) : [];

        /* Construir mapas por EXP. */
        const byExpMC    = new Map(); for (const r of rowsMC)    byExpMC.set(_normExp(r.exp), r);
        const byExpGantt = new Map(); for (const r of rowsGantt) byExpGantt.set(_normExp(r.exp), r);

        /* Match contra casos del usuario */
        const all = pickAllCases();
        if (!all.length) { alert('No tengo cargada tu lista de casos. Abre Estadísticas o Mis Casos primero.'); return; }
        const byCasoExp = new Map();
        for (const c of all) {
          if (c.name) byCasoExp.set(_normExp(c.name), c);
          /* También por numero_exp_interno como fallback */
          if (c.numero_exp_interno) byCasoExp.set(_normExp(c.numero_exp_interno), c);
        }

        /* Construir lista de updates a aplicar */
        const allExps = new Set([...byExpMC.keys(), ...byExpGantt.keys()]);
        const plan = [];        /* { caso, update, actuariaNueva } */
        const noMatch = [];
        const fieldStats = {};
        let actuariaCount = 0;

        for (const exp of allExps){
          const caso = byCasoExp.get(exp);
          const mc    = byExpMC.get(exp);
          const gantt = byExpGantt.get(exp);
          if (!caso) { noMatch.push(exp); continue; }
          const update = buildUpdate(caso, mc, gantt);
          /* Actuaria se maneja aparte (vía fiscalitoUMAG) */
          let actuariaNueva = '';
          const a = (mc && mc.actuaria) || (gantt && gantt.actuaria) || '';
          if (a && !caso.actuaria){
            actuariaNueva = String(a).trim();
            actuariaCount++;
          }
          if (Object.keys(update).length===0 && !actuariaNueva) continue;
          plan.push({ caso, update, actuariaNueva });
          for (const k of Object.keys(update)) fieldStats[k] = (fieldStats[k]||0)+1;
        }

        /* Resumen */
        const fieldLines = Object.entries(fieldStats).sort().map(([k,v])=>`  · ${k}: ${v}`).join('\n') || '  (ninguno)';
        const msg = `Resumen de la importación
─────────────────────────
Filas en archivo:
  · Mis Casos:    ${rowsMC.length}
  · Carta Gantt:  ${rowsGantt.length}
EXP. distintos:    ${allExps.size}
Coincidentes:      ${plan.length+0}
Sin coincidencia:  ${noMatch.length}

Campos a escribir (solo en campos vacíos):
${fieldLines}
  · actuaria: ${actuariaCount} (vía fiscalitoUMAG con fallback localStorage)

¿Aplicar a la base de datos?
(No sobreescribirá datos que ya tengas)`;
        if (!confirm(msg)) return;

        const sb = SB();
        if (!sb || typeof sb.from !== 'function') { alert('Supabase no disponible.'); return; }

        /* Panel de progreso flotante */
        const panelId = 'impMisCasosPanel';
        let panel = document.getElementById(panelId);
        if (panel) panel.remove();
        panel = document.createElement('div');
        panel.id = panelId;
        panel.style.cssText='position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:14px 16px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:9999;min-width:340px;max-width:440px;font-family:var(--font-body);font-size:12px';
        panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>📥 Importando Mis Casos…</strong><button onclick="document.getElementById(\''+panelId+'\').remove()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#666">×</button></div><div id="'+panelId+'-status" style="color:#374151;margin-bottom:6px">Iniciando…</div><div style="background:#e5e7eb;border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px"><div id="'+panelId+'-bar" style="background:#0f766e;height:100%;width:0%;transition:width .3s"></div></div><div id="'+panelId+'-log" style="max-height:160px;overflow-y:auto;font-size:11px;color:#6b7280;font-family:var(--font-mono)"></div>';
        document.body.appendChild(panel);
        const setStatus=s=>{const el=document.getElementById(panelId+'-status');if(el)el.textContent=s;};
        const setBar=p=>{const el=document.getElementById(panelId+'-bar');if(el)el.style.width=Math.round(p)+'%';};
        const log=msg=>{const el=document.getElementById(panelId+'-log');if(el){el.innerHTML+='<div>'+String(msg).replace(/[<>&]/g,m=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[m]))+'</div>';el.scrollTop=el.scrollHeight;}};

        let okCnt=0, errCnt=0, done=0;
        for (const item of plan){
          const { caso, update, actuariaNueva } = item;
          const lbl = caso.name || caso.id;
          setStatus(`(${done+1}/${plan.length}) ${lbl}`);
          try {
            if (Object.keys(update).length){
              update.updated_at = new Date().toISOString();
              const r = await sb.from('cases').update(update).eq('id', caso.id);
              if (r.error){ errCnt++; log('⚠ '+lbl+': '+r.error.message); }
              else {
                okCnt++;
                Object.assign(caso, update);
                const fields = Object.keys(update).filter(k=>k!=='updated_at');
                log('✓ '+lbl+': '+fields.join(', '));
              }
            }
            /* Actuaria: usar el helper del módulo Gantt si existe */
            if (actuariaNueva){
              try {
                const fu = window.fiscalitoUMAG;
                if (fu && typeof fu.setActuariaCaso === 'function'){
                  await fu.setActuariaCaso(caso.id, actuariaNueva);
                  log('  ↳ actuaria: '+actuariaNueva);
                } else {
                  /* Fallback: intentar update directo (puede fallar si la columna no existe) */
                  const r2 = await sb.from('cases').update({ actuaria: actuariaNueva, updated_at:new Date().toISOString() }).eq('id', caso.id);
                  if (!r2.error){ caso.actuaria = actuariaNueva; log('  ↳ actuaria: '+actuariaNueva+' (BD)'); }
                  else { log('  ↳ actuaria (LS-only): '+actuariaNueva); /* Última opción: localStorage */
                    try {
                      const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign')||'{}');
                      map[caso.id] = actuariaNueva;
                      localStorage.setItem('fiscalito_actuarias_assign', JSON.stringify(map));
                    } catch {}
                  }
                }
              } catch (e) { log('  ⚠ actuaria err: '+e.message); }
            }
          } catch (e) {
            errCnt++; log('⚠ '+lbl+': '+e.message);
          }
          done++;
          setBar(100*done/plan.length);
        }

        setStatus(`Completado · ${okCnt} actualizados · ${errCnt} con error · sin match: ${noMatch.length}`);
        if (typeof showToast==='function') showToast('✓ Import completado: '+okCnt+' casos');
        if (noMatch.length){
          log('— EXP. sin match en tu BD —');
          for (const e of noMatch.slice(0,20)) log('  '+e);
          if (noMatch.length>20) log('  …y '+(noMatch.length-20)+' más');
        }
        /* Refrescar */
        try { if (typeof window.loadStats === 'function') await window.loadStats(); } catch {}
      } catch(e){
        console.error('[import-mis-casos]', e);
        alert('Error al procesar el archivo: '+e.message);
      } finally {
        input.value='';
      }
    }, { once:true });
    input.click();
  }

  /* ─────────────────────────────────────────────────────────────
     INYECCIÓN DEL BOTÓN en la cabecera de Estadísticas
     ───────────────────────────────────────────────────────────── */
  function injectButton() {
    if (typeof window.renderDashboard !== 'function') return false;
    if (window._impMisCasosPatched) return true;
    const orig = window.renderDashboard;
    window.renderDashboard = function(){
      orig.apply(this, arguments);
      try {
        const toolbar = document.querySelector('#viewDashboard div[style*="display:flex;gap:6px"]');
        if (toolbar && !toolbar.querySelector('[data-imp-mis-casos]')){
          const btn = document.createElement('button');
          btn.className='btn-sm';
          btn.dataset.impMisCasos='1';
          btn.title='Importar TODO desde un Excel con la estructura "Mis Casos + Carta Gantt" (6 hojas). Llena solo campos vacíos.';
          btn.style.cssText='background:#0f766e;color:#fff;font-weight:700;font-size:11.5px;padding:5px 12px;border-radius:6px;border:none;cursor:pointer';
          btn.innerHTML='📥 Importar Mis Casos';
          btn.onclick = ()=>importMisCasosCompleto();
          /* Insertar al final de la toolbar */
          toolbar.appendChild(btn);
        }
      } catch(e){ console.warn('[imp-mis-casos] inject err:', e.message); }
    };
    window._impMisCasosPatched = true;
    console.log('[import-mis-casos] botón inyectado en Estadísticas');
    return true;
  }
  function tryInject(retries){
    retries = retries||0;
    if (injectButton()) return;
    if (retries>50) return console.warn('[import-mis-casos] no se pudo inyectar tras 50 intentos');
    setTimeout(()=>tryInject(retries+1), 200);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>tryInject());
  else tryInject();

  /* ── API ──────────────────────────────────────────────────── */
  window.importMisCasosCompleto = importMisCasosCompleto;

  console.log('%c📥 Módulo Import Mis Casos cargado','color:#0f766e;font-weight:bold');
})();
