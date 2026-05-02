/* ═══════════════════════════════════════════════════════════════════
   MOD-ACTUARIA-TABLA.JS  ·  Fiscalito
   v1.0 · 2026-05-01
   ───────────────────────────────────────────────────────────────────
   Inyecta una columna "Actuaria" en la vista de tabla de "Mis Casos"
   (renderTabla en index.html) sin tocar el código original.
   También agrega un campo "Actuaria asignada" en el detalle del caso
   (renderCaseHeader). Lee el nombre desde:
     1) c.actuaria  (columna en BD si existe)
     2) window.fiscalitoUMAG.getActuariaCaso(c) (Gantt + localStorage)
     3) localStorage 'fiscalito_actuarias_assign'  (fallback)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[actuaria-tabla] cargando…');

  /* ── Helpers ──────────────────────────────────────────────────── */
  function getActuariaFor(c) {
    if (!c) return '';
    if (c.actuaria) return String(c.actuaria);
    try {
      const fu = window.fiscalitoUMAG;
      if (fu && typeof fu.getActuariaCaso === 'function') {
        const v = fu.getActuariaCaso(c);
        if (v) return String(v);
      }
    } catch {}
    try {
      const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign') || '{}');
      if (map && map[c.id]) return String(map[c.id]);
    } catch {}
    return '';
  }

  function actuariaBadge(name) {
    if (!name) return '<span style="color:var(--text-muted)">—</span>';
    /* Color estable por hash del nombre (paleta sobria, legible) */
    const PALETTE = ['#0f766e','#7c3aed','#0369a1','#b45309','#be185d','#15803d','#9333ea','#1d4ed8'];
    let h = 0; for (let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
    const c = PALETTE[h % PALETTE.length];
    /* Iniciales */
    const parts = name.trim().split(/\s+/);
    const ini = ((parts[0]||'')[0]||'') + ((parts[1]||'')[0]||'');
    return '<span title="'+escAttr(name)+'" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:'+c+';font-weight:500;white-space:nowrap">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:'+c+'20;color:'+c+';font-weight:700;font-size:9.5px">'+escHTML(ini.toUpperCase())+'</span>'
      + escHTML(name)
      + '</span>';
  }
  function escHTML(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escAttr(s){return escHTML(s);}

  /* ── PATCH renderTabla: agrega columna "Actuaria" ──────────────── */
  function patchRenderTabla() {
    if (typeof window.renderTabla !== 'function') return false;
    if (window.__renderTablaActuariaPatched) return true;
    const orig = window.renderTabla;
    window.renderTabla = function (searchOverride) {
      orig.apply(this, arguments);
      try { injectActuariaColumn(); } catch (e) { console.warn('[actuaria-tabla] inject err:', e.message); }
    };
    window.__renderTablaActuariaPatched = true;
    return true;
  }

  function injectActuariaColumn() {
    const table = document.querySelector('.tabla-casos');
    if (!table) return;
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;
    if (thead.dataset.actuariaCol === '1') {
      /* Ya inyectado en este render — no hacer nada */
    } else {
      /* Detectar tipo de vista por encabezados existentes */
      const ths = [...thead.querySelectorAll('th')];
      const headerTexts = ths.map(t => (t.textContent || '').trim().toLowerCase());
      const isTerminado = headerTexts.some(t => t.startsWith('res. instruye') || t.startsWith('res. término') || t.startsWith('res. termino'));

      /* Posición destino:
         · Vista normal: justo después de la columna "Etapa"
         · Vista terminados: justo después de "Procedimiento" */
      let insertAfterIdx = -1;
      if (isTerminado) {
        insertAfterIdx = headerTexts.findIndex(t => t.startsWith('procedimiento'));
      } else {
        insertAfterIdx = headerTexts.findIndex(t => t.startsWith('etapa'));
      }
      if (insertAfterIdx < 0) insertAfterIdx = Math.max(0, headerTexts.length - 2);

      const newTh = document.createElement('th');
      newTh.innerHTML = 'Actuaria';
      newTh.style.whiteSpace = 'nowrap';
      newTh.title = 'Actuaria asignada al caso (asignación gestionada en Gantt)';
      const refTh = ths[insertAfterIdx];
      if (refTh && refTh.nextSibling) thead.insertBefore(newTh, refTh.nextSibling);
      else thead.appendChild(newTh);

      /* Marca para no repetir en este render */
      thead.dataset.actuariaCol = '1';
      thead.dataset.actuariaInsertIdx = String(insertAfterIdx + 1);
    }

    /* Insertar la celda en cada fila usando el índice marcado */
    const insertIdx = parseInt(thead.dataset.actuariaInsertIdx || '0', 10);
    const all = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : (window.allCases || []);
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      if (tr.dataset.actuariaCol === '1') return;
      /* Saltar fila de empty-state (un único td con colspan) */
      const tds = tr.querySelectorAll('td');
      if (tds.length === 1 && tds[0].hasAttribute('colspan')) {
        const cs = parseInt(tds[0].getAttribute('colspan')||'1', 10);
        tds[0].setAttribute('colspan', String(cs + 1));
        tr.dataset.actuariaCol = '1';
        return;
      }
      const cid = tr.dataset.caseid;
      const c = all.find(x => x.id === cid);
      const name = getActuariaFor(c);
      const td = document.createElement('td');
      td.innerHTML = actuariaBadge(name);
      const ref = tds[insertIdx - 1];
      if (ref && ref.nextSibling) tr.insertBefore(td, ref.nextSibling);
      else tr.appendChild(td);
      tr.dataset.actuariaCol = '1';
    });
  }

  /* ── PATCH renderCaseHeader: agrega campo "Actuaria asignada" ── */
  function patchRenderCaseHeader() {
    if (typeof window.renderCaseHeader !== 'function') return false;
    if (window.__renderCaseHeaderActuariaPatched) return true;
    const orig = window.renderCaseHeader;
    window.renderCaseHeader = function () {
      orig.apply(this, arguments);
      try { injectActuariaInHeader(); } catch (e) { console.warn('[actuaria-tabla] header inject err:', e.message); }
    };
    window.__renderCaseHeaderActuariaPatched = true;
    return true;
  }

  function injectActuariaInHeader() {
    const c = window.currentCase;
    if (!c) return;
    const grid = document.querySelector('#caseDetailsGrid > div');
    if (!grid) return;
    if (grid.querySelector('[data-fld=actuaria]')) return;
    const name = getActuariaFor(c);
    if (!name) return;
    const div = document.createElement('div');
    div.dataset.fld = 'actuaria';
    div.innerHTML =
      '<div style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Actuaria asignada</div>'
      + '<div style="font-weight:500">'+actuariaBadge(name)+'</div>';
    /* Insertar antes del campo Procedimiento si existe, sino al final */
    const labels = [...grid.children];
    const refIdx = labels.findIndex(el => /procedimiento/i.test(el.textContent||''));
    if (refIdx >= 0) grid.insertBefore(div, labels[refIdx]);
    else grid.appendChild(div);
  }

  /* ── BOOTSTRAP ─────────────────────────────────────────────────── */
  function tryPatch(retries) {
    retries = retries || 0;
    const a = patchRenderTabla();
    const b = patchRenderCaseHeader();
    if (a && b) {
      console.log('%c👩‍💼 Módulo Actuaria-Tabla cargado (columna + header)', 'color:#0f766e;font-weight:bold');
      /* Forzar un re-render si hay tabla actualmente visible */
      try {
        if (typeof window.renderTabla === 'function' &&
            document.querySelector('.tabla-casos tbody tr')) {
          window.renderTabla();
        }
      } catch {}
      return;
    }
    if (retries > 50) return console.warn('[actuaria-tabla] no se pudo enganchar tras 50 intentos');
    setTimeout(() => tryPatch(retries + 1), 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tryPatch());
  else tryPatch();

  /* ── API pública ─────────────────────────────────────────────── */
  window.getActuariaFor = getActuariaFor;
  window.actuariaBadge = actuariaBadge;
})();
