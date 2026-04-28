/* ═══════════════════════════════════════════════════════════════════
   MOD-EXPORT-CASOS-XLSX.JS — Exportar "Mis Casos" a Excel · Fiscalito
   v1.1 · 2026-04-28
   - Hoja 1 «Mis Casos»: 19 columnas operativas.
   - Hoja 2 «Gestión»  : Planilla de gestión con
        A) Casos por etapa de tramitación
        B) Casos por materia (tipo de procedimiento)
        C) Casos terminados
   Carga «xlsx-js-style» (drop-in con estilos) la primera vez que se usa.
   Si falla la carga, cae al XLSX que ya está en la app (sin estilos).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── CDN del fork con estilos ─────────────────────────────────────── */
  const XLSX_STYLE_CDN = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
  let _xlsxLib = null; /* referencia activa (xlsx-js-style si carga, si no XLSX) */

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      const t = setTimeout(() => { s.onerror(new Error('CDN timeout')); }, 12000);
      s.onload = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function getXLSX() {
    if (_xlsxLib) return _xlsxLib;
    /* xlsx-js-style se registra como window.XLSX (sobreescribe el básico, igual API). */
    try {
      await loadScript(XLSX_STYLE_CDN);
      if (window.XLSX && typeof window.XLSX.utils?.book_new === 'function') {
        _xlsxLib = window.XLSX;
        return _xlsxLib;
      }
    } catch (e) {
      console.warn('[mod-export-casos-xlsx] xlsx-js-style no cargó, usando XLSX sin estilos:', e.message);
    }
    if (typeof XLSX !== 'undefined') { _xlsxLib = XLSX; return _xlsxLib; }
    throw new Error('XLSX no disponible');
  }

  /* ── Helpers de formato ──────────────────────────────────────────── */
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
    const u = window.session?.user || {};
    const meta = u.user_metadata || {};
    const nombre = meta.full_name || meta.name || meta.nombre || '';
    if (nombre) return nombre.toUpperCase();
    if (u.email) return u.email.split('@')[0].replace(/[._-]/g, ' ').toUpperCase();
    return 'FISCAL';
  };

  /* ── Selección de casos ──────────────────────────────────────────── */
  function pickCasesToExport() {
    if (typeof window.getFilteredCases === 'function') {
      try { const r = window.getFilteredCases(); if (Array.isArray(r) && r.length) return r; } catch {}
    }
    const all = Array.isArray(window.allCases) ? window.allCases : [];
    if (typeof window._applyAdvancedFilters === 'function') {
      try { return window._applyAdvancedFilters(all.slice()); } catch {}
    }
    return all;
  }

  function pickAllCases() {
    return Array.isArray(window.allCases) ? window.allCases.slice() : [];
  }

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
      c.memos ?? c.num_memos ?? '',
      c.reservados ?? c.num_reservados ?? '',
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

  /* ── Estilos reutilizables ───────────────────────────────────────── */
  const STYLE = {
    titulo: {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 13, name: 'Calibri' },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top:{style:'thin',color:{rgb:'1F4E78'}}, bottom:{style:'thin',color:{rgb:'1F4E78'}},
                left:{style:'thin',color:{rgb:'1F4E78'}}, right:{style:'thin',color:{rgb:'1F4E78'}} }
    },
    fechaCorte: {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
      fill: { fgColor: { rgb: '2E75B6' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    },
    seccion: {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
      fill: { fgColor: { rgb: '305496' } },
      alignment: { horizontal: 'center', vertical: 'center' }
    },
    headerTabla: {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: { top:{style:'thin',color:{rgb:'BFBFBF'}}, bottom:{style:'thin',color:{rgb:'BFBFBF'}},
                left:{style:'thin',color:{rgb:'BFBFBF'}}, right:{style:'thin',color:{rgb:'BFBFBF'}} }
    },
    celda: {
      font: { sz: 10, name: 'Calibri' },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { vertical: 'center', wrapText: true },
      border: { top:{style:'thin',color:{rgb:'BFBFBF'}}, bottom:{style:'thin',color:{rgb:'BFBFBF'}},
                left:{style:'thin',color:{rgb:'BFBFBF'}}, right:{style:'thin',color:{rgb:'BFBFBF'}} }
    },
    celdaNum: {
      font: { sz: 10, name: 'Calibri' },
      fill: { fgColor: { rgb: 'DDEBF7' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top:{style:'thin',color:{rgb:'BFBFBF'}}, bottom:{style:'thin',color:{rgb:'BFBFBF'}},
                left:{style:'thin',color:{rgb:'BFBFBF'}}, right:{style:'thin',color:{rgb:'BFBFBF'}} }
    },
    total: {
      font: { bold: true, sz: 11, name: 'Calibri' },
      fill: { fgColor: { rgb: 'FFC000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top:{style:'thin',color:{rgb:'BF9000'}}, bottom:{style:'thin',color:{rgb:'BF9000'}},
                left:{style:'thin',color:{rgb:'BF9000'}}, right:{style:'thin',color:{rgb:'BF9000'}} }
    },
    headerCasos: {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11, name: 'Calibri' },
      fill: { fgColor: { rgb: '1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
    }
  };

  function applyStyle(ws, ref, style) { if (ws[ref]) ws[ref].s = style; }
  function setCell(ws, r, c, value, style) {
    const ref = (window.XLSX || _xlsxLib).utils.encode_cell({ r, c });
    ws[ref] = { t: typeof value === 'number' ? 'n' : 's', v: value };
    if (style) ws[ref].s = style;
    return ref;
  }

  /* ── HOJA 2: «Gestión» ───────────────────────────────────────────── */
  /* Mapeo de la etapa interna → fila de la planilla */
  const ETAPA_MAP = [
    { label: 'Indagatoria',             keys: ['indagatoria'],          obs: 'En investigación inicial' },
    { label: 'Término Etapa Indagatoria',keys: ['cargos'],              obs: 'Próxima resolución de cierre' },
    { label: 'Discusión y Prueba',      keys: ['descargos','prueba'],   obs: 'Etapa de rendición de pruebas' },
    { label: 'Preparación de Vista',    keys: ['vista'],                obs: 'En preparación de vista sumario' },
    { label: 'Decisión',                keys: ['resolucion'],           obs: 'Resolución pendiente del fiscal' },
    { label: 'Terminada',               keys: ['finalizacion'],         obs: 'Causa concluida', incluyeTerminado: true }
  ];

  const TIPO_MAP = [
    { label: 'Investigación Sumaria',     match: t => /investigaci[oó]n\s*sumaria/i.test(t),                norma: 'Estatuto Administrativo / Protocolo' },
    { label: 'Sumario Administrativo',    match: t => /sumario\s*administrativo/i.test(t),                  norma: 'Estatuto Administrativo / Protocolo' },
    { label: 'Procedimiento Disciplinario', match: t => /procedimiento\s*disciplinario/i.test(t),           norma: 'Reglamento de Estudiante / Protocolo' },
    { label: 'Sumario (sin clasificar)',  match: t => !t || /^sumario$/i.test(String(t).trim()),            norma: 'Estatuto Administrativo' }
  ];

  function clasificarTipo(tipo) {
    for (const m of TIPO_MAP) if (m.match(tipo || '')) return m;
    return null; /* fuera de la planilla */
  }

  function buildGestionSheet(X, todosLosCasos) {
    const ws = {};
    const merges = [];
    const NCOLS = 4; /* la planilla tiene 4 columnas */

    /* Fila 0: Título */
    setCell(ws, 0, 0, `PLANILLA DE GESTIÓN – FISCAL ${getFiscalNombre()}`, STYLE.titulo);
    for (let c = 1; c < NCOLS; c++) setCell(ws, 0, c, '', STYLE.titulo);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NCOLS - 1 } });

    /* Fila 1: Fecha de corte */
    setCell(ws, 1, 0, `Fecha de corte: ${fechaCorteLarga()}`, STYLE.fechaCorte);
    for (let c = 1; c < NCOLS; c++) setCell(ws, 1, c, '', STYLE.fechaCorte);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NCOLS - 1 } });

    let r = 3;

    /* ═══ A) CASOS POR ETAPA DE TRAMITACIÓN ═══ */
    setCell(ws, r, 0, 'A) CASOS POR ETAPA DE TRAMITACIÓN', STYLE.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', STYLE.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'ETAPA',       STYLE.headerTabla);
    setCell(ws, r, 1, 'N° CASOS',    STYLE.headerTabla);
    setCell(ws, r, 2, '% DEL TOTAL', STYLE.headerTabla);
    setCell(ws, r, 3, 'OBSERVACIÓN', STYLE.headerTabla);
    r++;

    /* Conteo por etapa */
    const conteoEtapa = {};
    let totalEtapa = 0;
    for (const c of todosLosCasos) {
      let key;
      if (c.status === 'terminado') key = 'finalizacion';
      else key = (typeof window.getEtapaKey === 'function')
        ? window.getEtapaKey(c)
        : (() => {
            const ep = (c.estado_procedimiento || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
            if (ep.includes('indagat')) return 'indagatoria';
            if (ep.includes('cargo'))   return 'cargos';
            if (ep.includes('descargo'))return 'descargos';
            if (ep.includes('prueba'))  return 'prueba';
            if (ep.includes('vista'))   return 'vista';
            if (ep.includes('resol'))   return 'resolucion';
            if (ep.includes('final'))   return 'finalizacion';
            return 'sin_etapa';
          })();
      conteoEtapa[key] = (conteoEtapa[key] || 0) + 1;
      if (key !== 'sin_etapa') totalEtapa++;
    }

    for (const fila of ETAPA_MAP) {
      const n = fila.keys.reduce((a, k) => a + (conteoEtapa[k] || 0), 0);
      const pct = totalEtapa > 0 ? (n / totalEtapa) * 100 : 0;
      setCell(ws, r, 0, fila.label, STYLE.celda);
      setCell(ws, r, 1, n,          STYLE.celdaNum);
      setCell(ws, r, 2, `${pct.toFixed(1).replace('.', ',')}%`, STYLE.celdaNum);
      setCell(ws, r, 3, fila.obs,   STYLE.celda);
      r++;
    }
    setCell(ws, r, 0, 'TOTAL',      STYLE.total);
    setCell(ws, r, 1, totalEtapa,   STYLE.total);
    setCell(ws, r, 2, '',           STYLE.total);
    setCell(ws, r, 3, '',           STYLE.total);
    r += 2;

    /* ═══ B) CASOS POR MATERIA (TIPO DE PROCEDIMIENTO) ═══ */
    setCell(ws, r, 0, 'B) CASOS POR MATERIA (TIPO DE PROCEDIMIENTO)', STYLE.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', STYLE.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'TIPO DE PROCEDIMIENTO', STYLE.headerTabla);
    setCell(ws, r, 1, 'N° CASOS',              STYLE.headerTabla);
    setCell(ws, r, 2, '% DEL TOTAL',           STYLE.headerTabla);
    setCell(ws, r, 3, 'NORMA APLICABLE',       STYLE.headerTabla);
    r++;

    /* Solo casos activos para el conteo por tipo (excluye terminados) */
    const casosActivos = todosLosCasos.filter(c => c.status !== 'terminado');
    const conteoTipo = {};
    let totalTipo = 0;
    for (const c of casosActivos) {
      const m = clasificarTipo(c.tipo_procedimiento);
      if (!m) continue;
      conteoTipo[m.label] = (conteoTipo[m.label] || 0) + 1;
      totalTipo++;
    }

    for (const m of TIPO_MAP) {
      const n = conteoTipo[m.label] || 0;
      const pct = totalTipo > 0 ? (n / totalTipo) * 100 : 0;
      setCell(ws, r, 0, m.label, STYLE.celda);
      setCell(ws, r, 1, n,       STYLE.celdaNum);
      setCell(ws, r, 2, `${pct.toFixed(1).replace('.', ',')}%`, STYLE.celdaNum);
      setCell(ws, r, 3, m.norma, STYLE.celda);
      r++;
    }
    setCell(ws, r, 0, 'TOTAL',   STYLE.total);
    setCell(ws, r, 1, totalTipo, STYLE.total);
    setCell(ws, r, 2, '',        STYLE.total);
    setCell(ws, r, 3, '',        STYLE.total);
    r += 2;

    /* ═══ C) CASOS TERMINADOS ═══ */
    setCell(ws, r, 0, 'C) CASOS TERMINADOS', STYLE.seccion);
    for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', STYLE.seccion);
    merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
    r++;

    setCell(ws, r, 0, 'N° CAUSA',          STYLE.headerTabla);
    setCell(ws, r, 1, 'CARATULADO',        STYLE.headerTabla);
    setCell(ws, r, 2, 'TIPO PROCEDIMIENTO',STYLE.headerTabla);
    setCell(ws, r, 3, 'NORMA',             STYLE.headerTabla);
    r++;

    const terminados = todosLosCasos.filter(c => c.status === 'terminado');
    if (terminados.length === 0) {
      setCell(ws, r, 0, '— sin casos terminados —', { ...STYLE.celda, alignment: { horizontal: 'center', vertical: 'center' } });
      for (let c = 1; c < NCOLS; c++) setCell(ws, r, c, '', STYLE.celda);
      merges.push({ s: { r, c: 0 }, e: { r, c: NCOLS - 1 } });
      r++;
    } else {
      for (const c of terminados) {
        const tipo = c.tipo_procedimiento || 'Sumario (sin clasificar)';
        const m = clasificarTipo(tipo);
        const norma = m ? m.norma : (c.protocolo || '');
        setCell(ws, r, 0, c.name || c.numero_expediente || '', STYLE.celda);
        setCell(ws, r, 1, c.caratula || '',                    STYLE.celda);
        setCell(ws, r, 2, tipo,                                STYLE.celda);
        setCell(ws, r, 3, norma,                               STYLE.celda);
        r++;
      }
    }

    /* Anchos y rango */
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 38 }];
    ws['!merges'] = merges;
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: NCOLS - 1 } });
    /* Filas con un poco más de alto en encabezados de sección */
    ws['!rows'] = []; ws['!rows'][0] = { hpt: 24 };

    return ws;
  }

  /* ── HOJA 1 estilizada ───────────────────────────────────────────── */
  function buildCasosSheet(X, casos) {
    const aoa = [HEADERS, ...casos.map(caseToRow)];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COL_WIDTHS_CASOS;
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: HEADERS.length - 1 } }) };
    /* Negrita y fondo en encabezados */
    for (let c = 0; c < HEADERS.length; c++) {
      const ref = X.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = STYLE.headerCasos;
    }
    return ws;
  }

  /* ── Función pública ─────────────────────────────────────────────── */
  async function exportarMisCasosXLSX() {
    if (typeof showToast === 'function') showToast('📊 Generando Excel…');
    let X;
    try { X = await getXLSX(); }
    catch (e) { alert('No se pudo cargar la librería XLSX. Recarga la página.'); return; }

    const casosVisibles = pickCasesToExport();
    if (!casosVisibles.length) {
      if (typeof showToast === 'function') showToast('⚠ No hay casos para exportar');
      else alert('No hay casos para exportar');
      return;
    }
    const todos = pickAllCases();

    try {
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, buildCasosSheet(X, casosVisibles), 'Mis Casos');
      X.utils.book_append_sheet(wb, buildGestionSheet(X, todos),       'Gestión');

      const fecha = new Date().toISOString().slice(0, 10);
      const usuario = (window.session?.user?.email || '').split('@')[0] || 'usuario';
      const filename = `Mis-Casos_${usuario}_${fecha}.xlsx`;
      X.writeFile(wb, filename);
      if (typeof showToast === 'function') showToast('✓ ' + filename + ' descargado');
    } catch (e) {
      console.error('[mod-export-casos-xlsx] error:', e);
      if (typeof showToast === 'function') showToast('⚠ Error al exportar: ' + e.message);
      else alert('Error al exportar: ' + e.message);
    }
  }

  /* ── Botón en la barra de herramientas de casos ──────────────────── */
  function injectExportButton() {
    const toolbar = document.querySelector('.casos-toolbar');
    if (!toolbar || toolbar.dataset.exportXlsxInjected) return;
    toolbar.dataset.exportXlsxInjected = 'true';

    const btn = document.createElement('button');
    btn.id = 'btnExportXlsx';
    btn.className = 'btn-sm';
    btn.title = 'Exportar a Excel: 1) Mis Casos · 2) Planilla de Gestión';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;background:#107C41;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9V2z"/><path d="M9 6h3M9 9h3M9 12h3"/><path d="M2 4l4 4-4 4"/></svg> Exportar Excel';
    btn.onclick = exportarMisCasosXLSX;

    const vistaSel = toolbar.querySelector('.vista-selector');
    if (vistaSel && vistaSel.parentNode) vistaSel.parentNode.insertBefore(btn, vistaSel);
    else toolbar.appendChild(btn);
  }

  function init() {
    const tablaView = document.getElementById('viewTabla');
    if (!tablaView || !document.querySelector('.casos-toolbar')) {
      setTimeout(init, 200);
      return;
    }
    injectExportButton();
    const obs = new MutationObserver(() => injectExportButton());
    obs.observe(tablaView, { childList: true, subtree: true });
    console.log('[mod-export-casos-xlsx] Botón "Exportar Excel" listo (Mis Casos + Gestión)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }

  /* ── API global ──────────────────────────────────────────────────── */
  window.exportarMisCasosXLSX = exportarMisCasosXLSX;
})();
