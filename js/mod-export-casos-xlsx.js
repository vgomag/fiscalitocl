/* ═══════════════════════════════════════════════════════════════════
   MOD-EXPORT-CASOS-XLSX.JS — Exportar "Mis Casos" a Excel · Fiscalito
   v1.2 · 2026-04-28
   - Hoja 1 «Mis Casos» (19 columnas operativas)
   - Hoja 2 «Gestión»  (Planilla A/B/C como la PDF de muestra)
   No depende de ningún CDN extra: usa el XLSX que ya está en index.html.
   Si carga «xlsx-js-style» previamente, se aplican colores; si no, el
   archivo sale igual con todos los datos (sólo sin colores).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  console.log('[export-casos-xlsx] cargando módulo…');

  /* ── Helpers ─────────────────────────────────────────────────────── */
  const X = () => (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : null;

  const fmtArr = v => {
    if (v === null || v === undefined || v === '') return '';
    if (Array.isArray(v)) return v.filter(Boolean).join(', ');
    try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter(Boolean).join(', ') : String(v); }
    catch { return String(v); }
  };

  const fmtBool = v => {
    if (v === true || v === 'true' || v === 'si' || v === 'Sí' || v === 1) return 'Sí';
    if (v === false || v === 'false' || v === 'no' || v === 'No' || v === 0) return 'No';
    return '';
  };

  const fmtFecha = v => {
    if (!v) return '';
    const m = String(v).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
    const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    return String(v);
  };

  const fechaCorteLarga = () => {
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  };

  const getFiscalNombre = () => {
    const u = (window.session && window.session.user) || {};
    const meta = u.user_metadata || {};
    const nombre = meta.full_name || meta.name || meta.nombre || '';
    if (nombre) return String(nombre).toUpperCase();
    if (u.email) return String(u.email).split('@')[0].replace(/[._-]/g, ' ').toUpperCase();
    return 'FISCAL';
  };

  /* Mismo getEtapaKey que mod-vistas-casos pero con regex segura */
  function getEtapaKey(c) {
    if (typeof window.getEtapaKey === 'function') {
      try { return window.getEtapaKey(c); } catch {}
    }
    const ep = (c.estado_procedimiento || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (ep.indexOf('indagat')  >= 0) return 'indagatoria';
    if (ep.indexOf('cargo')    >= 0) return 'cargos';
    if (ep.indexOf('descargo') >= 0) return 'descargos';
    if (ep.indexOf('prueba')   >= 0) return 'prueba';
    if (ep.indexOf('vista')    >= 0) return 'vista';
    if (ep.indexOf('resol')    >= 0) return 'resolucion';
    if (ep.indexOf('final')    >= 0) return 'finalizacion';
    return 'sin_etapa';
  }

  function pickCasesToExport() {
    if (typeof window.getFilteredCases === 'function') {
      try { const r = window.getFilteredCases(); if (Array.isArray(r) && r.length) return r; } catch {}
    }
    const all = Array.isArray(window.allCases) ? window.allCases.slice() : [];
    if (typeof window._applyAdvancedFilters === 'function') {
      try { return window._applyAdvancedFilters(all); } catch {}
    }
    return all;
  }
  function pickAllCases() { return Array.isArray(window.allCases) ? window.allCases.slice() : []; }

  /* ── HOJA 1: «Mis Casos» (19 columnas) ───────────────────────────── */
  const HEADERS = [
    'EXP.', 'Resolución', 'Fecha Resolución', 'Fecha denuncia',
    'Fecha de recepción fiscalía', 'Procedimiento', 'Denunciante',
    'Estamento Denunciante', 'Denunciado/a', 'Estamento denunciado/a',
    'Memos', 'Reservados', 'Protocolo aplicable', 'Origen', 'Materia',
    'Judicializada', 'Medida Cautelar', '¿Cuál?', 'Observaciones'
  ];

  function caseToRow(c) {
    return [
      c.name || c.numero_expediente || '',
      c.nueva_resolucion || c.resolucion || '',
      fmtFecha(c.fecha_resolucion),
      fmtFecha(c.fecha_denuncia),
      fmtFecha(c.fecha_recepcion_fiscalia),
      c.tipo_procedimiento || '',
      fmtArr(c.denunciantes),
      fmtArr(c.estamentos_denunciante),
      fmtArr(c.denunciados),
      fmtArr(c.estamentos_denunciado),
      c.memos != null ? c.memos : (c.num_memos != null ? c.num_memos : ''),
      c.reservados != null ? c.reservados : (c.num_reservados != null ? c.num_reservados : ''),
      c.protocolo || '',
      c.origen || '',
      c.materia || '',
      fmtBool(c.judicializada),
      fmtBool(c.medida_cautelar),
      c.medida_cautelar_detalle || c.medida_cual || '',
      c.observaciones || ''
    ];
  }

  const COL_WIDTHS_CASOS = [
    14, 14, 14, 14, 18, 22, 28, 22, 28, 22,
    8, 10, 22, 18, 28, 12, 14, 28, 40
  ].map(w => ({ wch: w }));

  /* ── Estilos (sólo se aplican si la lib lo soporta — xlsx-js-style) */
  const ST = {
    titulo:    { font:{bold:true,color:{rgb:'FFFFFF'},sz:13}, fill:{fgColor:{rgb:'1F4E78'}}, alignment:{horizontal:'center',vertical:'center'} },
    fecha:     { font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, fill:{fgColor:{rgb:'2E75B6'}}, alignment:{horizontal:'center',vertical:'center'} },
    seccion:   { font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, fill:{fgColor:{rgb:'305496'}}, alignment:{horizontal:'center',vertical:'center'} },
    th:        { font:{bold:true,color:{rgb:'FFFFFF'},sz:11}, fill:{fgColor:{rgb:'1F4E78'}}, alignment:{horizontal:'center',vertical:'center',wrapText:true} },
    td:        { font:{sz:10}, fill:{fgColor:{rgb:'DDEBF7'}}, alignment:{vertical:'center',wrapText:true} },
    tdNum:     { font:{sz:10}, fill:{fgColor:{rgb:'DDEBF7'}}, alignment:{horizontal:'center',vertical:'center'} },
    total:     { font:{bold:true,sz:11}, fill:{fgColor:{rgb:'FFC000'}}, alignment:{horizontal:'center',vertical:'center'} }
  };

  function setCell(ws, r, c, value, style) {
    const xx = X();
    const ref = xx.utils.encode_cell({ r, c });
    const isNum = typeof value === 'number';
    ws[ref] = { t: isNum ? 'n' : 's', v: isNum ? value : (value == null ? '' : String(value)) };
    if (style) ws[ref].s = style;
    return ref;
  }

  function buildCasosSheet(casos) {
    const xx = X();
    const aoa = [HEADERS, ...casos.map(caseToRow)];
    const ws = xx.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COL_WIDTHS_CASOS;
    if (aoa.length > 0) {
      ws['!autofilter'] = { ref: xx.utils.encode_range({ s:{r:0,c:0}, e:{r: aoa.length-1, c: HEADERS.length-1} }) };
    }
    /* estilo encabezado */
    for (let c = 0; c < HEADERS.length; c++) {
      const ref = xx.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = ST.th;
    }
    return ws;
  }

  /* ── HOJA 2: «Gestión» ───────────────────────────────────────────── */
  const ETAPA_MAP = [
    { label: 'Indagatoria',              keys: ['indagatoria'],         obs: 'En investigación inicial' },
    { label: 'Término Etapa Indagatoria',keys: ['cargos'],              obs: 'Próxima resolución de cierre' },
    { label: 'Discusión y Prueba',       keys: ['descargos','prueba'],  obs: 'Etapa de rendición de pruebas' },
    { label: 'Preparación de Vista',     keys: ['vista'],               obs: 'En preparación de vista sumario' },
    { label: 'Decisión',                 keys: ['resolucion'],          obs: 'Resolución pendiente del fiscal' },
    { label: 'Terminada',                keys: ['finalizacion'],        obs: 'Causa concluida' }
  ];

  const TIPO_MAP = [
    { label: 'Investigación Sumaria',     match: t => /investigaci[oó]n\s*sumaria/i.test(t),  norma: 'Estatuto Administrativo / Protocolo' },
    { label: 'Sumario Administrativo',    match: t => /sumario\s*administrativo/i.test(t),    norma: 'Estatuto Administrativo / Protocolo' },
    { label: 'Procedimiento Disciplinario',match: t => /procedimiento\s*disciplinario/i.test(t), norma: 'Reglamento de Estudiante / Protocolo' },
    { label: 'Sumario (sin clasificar)',  match: t => !t || /^\s*sumario\s*$/i.test(String(t)), norma: 'Estatuto Administrativo' }
  ];

  function clasificarTipo(tipo) {
    const t = (tipo || '').trim();
    for (const m of TIPO_MAP) if (m.match(t)) return m;
    return null;
  }

  function buildGestionSheet(todos) {
    const xx = X();
    const ws = {};
    const merges = [];
    const NCOLS = 4;

    /* Título y fecha de corte */
    setCell(ws, 0, 0, `PLANILLA DE GESTIÓN – FISCAL ${getFiscalNombre()}`, ST.titulo);
    for (let c = 1; c < NCOLS; c++) setCell(ws, 0, c, '', ST.titulo);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

    setCell(ws, 1, 0, `Fecha de corte: ${fechaCorteLarga()}`, ST.fecha);
    for (let c = 1; c < NCOLS; c++) setCell(ws, 1, c, '', ST.fecha);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

    let r = 3;

    /* A) ETAPA */
    setCell(ws, r, 0, 'A) CASOS POR ETAPA DE TRAMITACIÓN', ST.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', ST.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'ETAPA',       ST.th);
    setCell(ws, r, 1, 'N° CASOS',    ST.th);
    setCell(ws, r, 2, '% DEL TOTAL', ST.th);
    setCell(ws, r, 3, 'OBSERVACIÓN', ST.th);
    r++;

    const conteoEtapa = {};
    let totalEtapa = 0;
    for (const c of todos) {
      let key = (c.status === 'terminado') ? 'finalizacion' : getEtapaKey(c);
      conteoEtapa[key] = (conteoEtapa[key] || 0) + 1;
      if (key !== 'sin_etapa') totalEtapa++;
    }

    for (const fila of ETAPA_MAP) {
      const n = fila.keys.reduce((a, k) => a + (conteoEtapa[k] || 0), 0);
      const pct = totalEtapa > 0 ? (n / totalEtapa) * 100 : 0;
      setCell(ws, r, 0, fila.label, ST.td);
      setCell(ws, r, 1, n,          ST.tdNum);
      setCell(ws, r, 2, pct.toFixed(1).replace('.', ',') + '%', ST.tdNum);
      setCell(ws, r, 3, fila.obs,   ST.td);
      r++;
    }
    setCell(ws, r, 0, 'TOTAL',       ST.total);
    setCell(ws, r, 1, totalEtapa,    ST.total);
    setCell(ws, r, 2, '',            ST.total);
    setCell(ws, r, 3, '',            ST.total);
    r += 2;

    /* B) TIPO DE PROCEDIMIENTO */
    setCell(ws, r, 0, 'B) CASOS POR MATERIA (TIPO DE PROCEDIMIENTO)', ST.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', ST.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'TIPO DE PROCEDIMIENTO', ST.th);
    setCell(ws, r, 1, 'N° CASOS',              ST.th);
    setCell(ws, r, 2, '% DEL TOTAL',           ST.th);
    setCell(ws, r, 3, 'NORMA APLICABLE',       ST.th);
    r++;

    const activos = todos.filter(c => c.status !== 'terminado');
    const conteoTipo = {};
    let totalTipo = 0;
    for (const c of activos) {
      const m = clasificarTipo(c.tipo_procedimiento);
      if (!m) continue;
      conteoTipo[m.label] = (conteoTipo[m.label] || 0) + 1;
      totalTipo++;
    }

    for (const m of TIPO_MAP) {
      const n = conteoTipo[m.label] || 0;
      const pct = totalTipo > 0 ? (n / totalTipo) * 100 : 0;
      setCell(ws, r, 0, m.label, ST.td);
      setCell(ws, r, 1, n,       ST.tdNum);
      setCell(ws, r, 2, pct.toFixed(1).replace('.', ',') + '%', ST.tdNum);
      setCell(ws, r, 3, m.norma, ST.td);
      r++;
    }
    setCell(ws, r, 0, 'TOTAL',    ST.total);
    setCell(ws, r, 1, totalTipo,  ST.total);
    setCell(ws, r, 2, '',         ST.total);
    setCell(ws, r, 3, '',         ST.total);
    r += 2;

    /* C) TERMINADOS */
    setCell(ws, r, 0, 'C) CASOS TERMINADOS', ST.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', ST.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'N° CAUSA',           ST.th);
    setCell(ws, r, 1, 'CARATULADO',         ST.th);
    setCell(ws, r, 2, 'TIPO PROCEDIMIENTO', ST.th);
    setCell(ws, r, 3, 'NORMA',              ST.th);
    r++;

    const terminados = todos.filter(c => c.status === 'terminado');
    if (!terminados.length) {
      setCell(ws, r, 0, '— sin casos terminados —', ST.td);
      for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', ST.td);
      merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
      r++;
    } else {
      for (const c of terminados) {
        const tipo = c.tipo_procedimiento || 'Sumario (sin clasificar)';
        const m = clasificarTipo(tipo);
        const norma = m ? m.norma : (c.protocolo || '');
        setCell(ws, r, 0, c.name || c.numero_expediente || '', ST.td);
        setCell(ws, r, 1, c.caratula || '',                    ST.td);
        setCell(ws, r, 2, tipo,                                ST.td);
        setCell(ws, r, 3, norma,                               ST.td);
        r++;
      }
    }

    ws['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 38 }];
    ws['!merges'] = merges;
    ws['!ref'] = xx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: NCOLS - 1 } });
    return ws;
  }

  /* ── Función pública ─────────────────────────────────────────────── */
  async function exportarMisCasosXLSX() {
    console.log('[export-casos-xlsx] click → iniciando export');

    const xx = X();
    if (!xx || !xx.utils || typeof xx.writeFile !== 'function') {
      const msg = 'La librería XLSX no está disponible. Recarga la página.';
      console.error('[export-casos-xlsx]', msg);
      if (typeof showToast === 'function') showToast('⚠ ' + msg);
      else alert(msg);
      return;
    }
    if (typeof showToast === 'function') showToast('📊 Generando Excel…');

    const casosVisibles = pickCasesToExport();
    const todos = pickAllCases();
    console.log('[export-casos-xlsx] visibles:', casosVisibles.length, '· todos:', todos.length);

    if (!casosVisibles.length && !todos.length) {
      const msg = 'No hay casos para exportar.';
      if (typeof showToast === 'function') showToast('⚠ ' + msg);
      else alert(msg);
      return;
    }
    const casosParaHoja1 = casosVisibles.length ? casosVisibles : todos;

    try {
      const wb = xx.utils.book_new();
      xx.utils.book_append_sheet(wb, buildCasosSheet(casosParaHoja1), 'Mis Casos');
      xx.utils.book_append_sheet(wb, buildGestionSheet(todos),        'Gestión');

      const fecha   = new Date().toISOString().slice(0, 10);
      const usuario = ((window.session && window.session.user && window.session.user.email) || '').split('@')[0] || 'usuario';
      const filename = `Mis-Casos_${usuario}_${fecha}.xlsx`;
      xx.writeFile(wb, filename);
      console.log('[export-casos-xlsx] OK →', filename);
      if (typeof showToast === 'function') showToast('✓ ' + filename + ' descargado');
    } catch (e) {
      console.error('[export-casos-xlsx] error:', e);
      if (typeof showToast === 'function') showToast('⚠ Error al exportar: ' + e.message);
      else alert('Error al exportar: ' + e.message);
    }
  }

  /* ── Inserción del botón ─────────────────────────────────────────── */
  function injectExportButton() {
    const toolbar = document.querySelector('.casos-toolbar');
    if (!toolbar) { console.log('[export-casos-xlsx] .casos-toolbar aún no existe'); return false; }
    if (toolbar.dataset.exportXlsxInjected) return true;

    const btn = document.createElement('button');
    btn.id = 'btnExportXlsx';
    btn.className = 'btn-sm';
    btn.title = 'Exportar a Excel: 1) Mis Casos · 2) Planilla de Gestión';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;background:#107C41;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500';
    btn.innerHTML = '📊 Exportar Excel';
    btn.addEventListener('click', exportarMisCasosXLSX);

    /* Insertar antes del + Nuevo caso (que está dentro del div con margin-left:auto) */
    const right = toolbar.querySelector('div[style*="margin-left"]');
    if (right) right.insertBefore(btn, right.firstChild);
    else toolbar.appendChild(btn);

    toolbar.dataset.exportXlsxInjected = 'true';
    console.log('[export-casos-xlsx] ✅ botón insertado');
    return true;
  }

  function init(retries) {
    retries = retries || 0;
    if (injectExportButton()) return;
    if (retries > 50) { console.warn('[export-casos-xlsx] no se pudo insertar el botón tras 50 intentos'); return; }
    setTimeout(() => init(retries + 1), 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  /* ── API global ──────────────────────────────────────────────────── */
  window.exportarMisCasosXLSX = exportarMisCasosXLSX;
})();
