/* ═══════════════════════════════════════════════════════════════════
   MOD-EXPORT-CASOS-XLSX.JS — Exportar "Mis Casos" a Excel · Fiscalito
   v1.0 · 2026-04-28
   Genera un .xlsx con las columnas de gestión de procedimientos
   disciplinarios solicitadas por la fiscal:
     EXP. · Resolución · Fecha Resolución · Fecha denuncia ·
     Fecha de recepción fiscalía · Procedimiento · Denunciante ·
     Estamento Denunciante · Denunciado/a · Estamento denunciado/a ·
     Memos · Reservados · Protocolo aplicable · Origen · Materia ·
     Judicializada · Medida Cautelar · ¿Cuál? · Observaciones
   Requiere: SheetJS (XLSX) — ya cargado en index.html.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────── */
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
    /* Si ya viene en formato dd-mm-yyyy o dd/mm/yyyy, dejar tal cual */
    const m = String(v).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
    /* Si es ISO (yyyy-mm-dd…), convertir a dd-mm-yyyy */
    const iso = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    return String(v);
  };

  /* ── Selección de casos a exportar ───────────────────────────────── */
  function pickCasesToExport() {
    /* Priorizar la vista actualmente filtrada en el módulo de vistas */
    if (typeof window.getFilteredCases === 'function') {
      try { const r = window.getFilteredCases(); if (Array.isArray(r) && r.length) return r; } catch {}
    }
    /* Si hay filtros avanzados expuestos, aplicarlos sobre allCases */
    const all = Array.isArray(window.allCases) ? window.allCases : [];
    if (typeof window._applyAdvancedFilters === 'function') {
      try { return window._applyAdvancedFilters(all.slice()); } catch {}
    }
    return all;
  }

  /* ── Construcción de la hoja ─────────────────────────────────────── */
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

  /* Anchos sugeridos por columna (en "caracteres" de Excel) */
  const COL_WIDTHS = [
    14, 14, 14, 14, 18, 22, 28, 22, 28, 22,
    8, 10, 22, 18, 28, 12, 14, 28, 40
  ].map(w => ({ wch: w }));

  /* ── Función pública ─────────────────────────────────────────────── */
  async function exportarMisCasosXLSX() {
    if (typeof XLSX === 'undefined') {
      alert('La librería XLSX no está disponible. Recarga la página e intenta nuevamente.');
      return;
    }
    const cases = pickCasesToExport();
    if (!cases.length) {
      if (typeof showToast === 'function') showToast('⚠ No hay casos para exportar');
      else alert('No hay casos para exportar');
      return;
    }

    if (typeof showToast === 'function') showToast('📊 Generando Excel…');

    /* AOA = array of arrays — encabezado + filas */
    const aoa = [HEADERS, ...cases.map(caseToRow)];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = COL_WIDTHS;
    /* Congelar la primera fila (encabezados) */
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: HEADERS.length - 1 } }) };

    /* Negrita en encabezados (sólo aplica si XLSX styles está disponible). */
    for (let c = 0; c < HEADERS.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mis Casos');

    const fecha = new Date().toISOString().slice(0, 10);
    const usuario = (window.session?.user?.email || '').split('@')[0] || 'usuario';
    const filename = `Mis-Casos_${usuario}_${fecha}.xlsx`;

    try {
      XLSX.writeFile(wb, filename);
      if (typeof showToast === 'function') showToast('✓ ' + filename + ' descargado');
    } catch (e) {
      console.error('[mod-export-casos-xlsx] error:', e);
      if (typeof showToast === 'function') showToast('⚠ Error al exportar: ' + e.message);
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
    btn.title = 'Exportar a Excel los casos visibles (respeta filtros y pestaña activa)';
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;padding:5px 10px;background:#107C41;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500';
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h9V2z"/><path d="M9 6h3M9 9h3M9 12h3"/><path d="M2 4l4 4-4 4"/></svg> Exportar Excel';
    btn.onclick = exportarMisCasosXLSX;

    /* Insertar antes del selector de vista si existe, o al final */
    const vistaSel = toolbar.querySelector('.vista-selector');
    if (vistaSel && vistaSel.parentNode) vistaSel.parentNode.insertBefore(btn, vistaSel);
    else toolbar.appendChild(btn);
  }

  function init() {
    /* Esperar a que la barra de casos exista */
    const tablaView = document.getElementById('viewTabla');
    if (!tablaView || !document.querySelector('.casos-toolbar')) {
      setTimeout(init, 200);
      return;
    }
    injectExportButton();
    /* Re-inyectar si algún render reemplaza la toolbar */
    const obs = new MutationObserver(() => injectExportButton());
    obs.observe(tablaView, { childList: true, subtree: true });
    console.log('[mod-export-casos-xlsx] Botón "Exportar Excel" listo');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }

  /* ── Exponer API global ──────────────────────────────────────────── */
  window.exportarMisCasosXLSX = exportarMisCasosXLSX;
})();
