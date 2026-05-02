/* ═══════════════════════════════════════════════════════════════════
   MOD-ACTUARIA-TABLA.JS  ·  Fiscalito
   v1.2 · 2026-05-01
   - Columna Actuaria en tabla Mis Casos (vista normal y Terminados)
   - Campo Actuaria en detalle del caso
   - Tabla AUTO-AJUSTABLE al ancho disponible
   - Columnas redimensionables (drag · doble-clic restaura)
   - Botón "↔ Auto-ajustar" en la toolbar
   - Editor INLINE: clic en la celda Actuaria abre un dropdown con las
     actuarias disponibles (+ "+ Nueva actuaria…")
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[actuaria-tabla] cargando…');

  /* ── Catálogo de actuarias ─────────────────────────────────────── */
  const ACTUARIAS_DEFAULT = ['Roxana Pacheco Hernández','Alejandra Mayorga Trujillo'];
  function getActuariasList() {
    try {
      if (window.fiscalitoUMAG && typeof window.fiscalitoUMAG.getActuarias === 'function') {
        const arr = window.fiscalitoUMAG.getActuarias();
        if (Array.isArray(arr) && arr.length) return arr.slice();
      }
    } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem('fiscalito_actuarias') || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return ACTUARIAS_DEFAULT.slice();
  }
  function saveActuariasList(list) {
    try {
      if (window.fiscalitoUMAG && typeof window.fiscalitoUMAG.setActuarias === 'function') {
        window.fiscalitoUMAG.setActuarias(list);
      } else {
        localStorage.setItem('fiscalito_actuarias', JSON.stringify(list));
      }
    } catch {}
  }

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

  async function persistActuaria(caseId, nombre) {
    try {
      if (window.fiscalitoUMAG && typeof window.fiscalitoUMAG.setActuariaCaso === 'function') {
        await window.fiscalitoUMAG.setActuariaCaso(caseId, nombre || '');
        return true;
      }
    } catch {}
    /* Fallback BD directo */
    try {
      const sb = window.sb || window.supabaseClient;
      if (sb && sb.from) {
        const r = await sb.from('cases').update({ actuaria: nombre || null, updated_at: new Date().toISOString() }).eq('id', caseId);
        if (!r.error) return true;
      }
    } catch {}
    /* Último recurso: localStorage */
    try {
      const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign') || '{}');
      if (nombre) map[caseId] = nombre; else delete map[caseId];
      localStorage.setItem('fiscalito_actuarias_assign', JSON.stringify(map));
      return true;
    } catch { return false; }
  }

  function escHTML(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escAttr(s){return escHTML(s);}

  function actuariaBadge(name) {
    if (!name) {
      return '<span class="actuaria-empty" style="color:var(--text-muted);font-size:11px;font-style:italic;cursor:pointer" title="Clic para asignar actuaria">— asignar</span>';
    }
    const PALETTE = ['#0f766e','#7c3aed','#0369a1','#b45309','#be185d','#15803d','#9333ea','#1d4ed8'];
    let h = 0; for (let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
    const c = PALETTE[h % PALETTE.length];
    const parts = name.trim().split(/\s+/);
    const ini = ((parts[0]||'')[0]||'') + ((parts[1]||'')[0]||'');
    return '<span title="'+escAttr(name)+' · clic para cambiar" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:'+c+';font-weight:500;white-space:nowrap;cursor:pointer">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:'+c+'20;color:'+c+';font-weight:700;font-size:9.5px">'+escHTML(ini.toUpperCase())+'</span>'
      + escHTML(name) + '</span>';
  }

  /* ── Editor inline (popover dropdown) ─────────────────────────── */
  function closeAllPopovers() {
    document.querySelectorAll('.actuaria-popover').forEach(p => p.remove());
  }
  function openActuariaEditor(td, caseId, currentName) {
    closeAllPopovers();
    const rect = td.getBoundingClientRect();
    const list = getActuariasList();
    const pop = document.createElement('div');
    pop.className = 'actuaria-popover';
    pop.style.cssText =
      'position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;'
      +'background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:8px;'
      +'box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:9999;'
      +'min-width:220px;max-width:300px;font-family:var(--font-body);'
      +'padding:6px;font-size:12px;';
    pop.innerHTML =
      '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;padding:4px 8px 6px">Asignar actuaria</div>'
      + list.map(n =>
          '<div class="actuaria-opt" data-name="'+escAttr(n)+'" style="padding:6px 8px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;'
          + (n===currentName?'background:rgba(15,118,110,.08);color:#0f766e;font-weight:600;':'')
          + '">'
          + (n===currentName?'<span style="color:#0f766e">✓</span>':'<span style="width:8px"></span>')
          + escHTML(n) + '</div>'
        ).join('')
      + (currentName ? '<div class="actuaria-clear" style="padding:6px 8px;border-radius:6px;cursor:pointer;color:#dc2626;border-top:1px solid rgba(0,0,0,.06);margin-top:4px">✕ Quitar asignación</div>' : '')
      + '<div class="actuaria-add" style="padding:6px 8px;border-radius:6px;cursor:pointer;color:#0369a1;border-top:1px solid rgba(0,0,0,.06);margin-top:4px">+ Nueva actuaria…</div>';
    document.body.appendChild(pop);

    /* Hover */
    pop.querySelectorAll('.actuaria-opt,.actuaria-clear,.actuaria-add').forEach(el => {
      el.addEventListener('mouseenter', () => { if (!el.style.background.includes('118,110')) el.style.background = 'rgba(0,0,0,.04)'; });
      el.addEventListener('mouseleave', () => { if (!el.style.background.includes('118,110')) el.style.background = ''; });
    });

    pop.querySelectorAll('.actuaria-opt').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        const nombre = el.dataset.name;
        await assignActuaria(caseId, nombre);
        closeAllPopovers();
      });
    });
    const clearEl = pop.querySelector('.actuaria-clear');
    if (clearEl) clearEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      await assignActuaria(caseId, '');
      closeAllPopovers();
    });
    const addEl = pop.querySelector('.actuaria-add');
    if (addEl) addEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const nombre = prompt('Nombre de la nueva actuaria (apellidos + nombres):');
      if (!nombre || !nombre.trim()) return;
      const cur = getActuariasList();
      const limpio = nombre.trim();
      if (!cur.includes(limpio)) { cur.push(limpio); cur.sort(); saveActuariasList(cur); }
      assignActuaria(caseId, limpio).then(closeAllPopovers);
    });

    /* Cerrar al hacer clic fuera o ESC */
    setTimeout(() => {
      const onDoc = (e) => { if (!pop.contains(e.target)) { closeAllPopovers(); document.removeEventListener('mousedown', onDoc); } };
      const onEsc = (e) => { if (e.key === 'Escape') { closeAllPopovers(); document.removeEventListener('keydown', onEsc); } };
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onEsc);
    }, 50);
  }

  async function assignActuaria(caseId, nombre) {
    const ok = await persistActuaria(caseId, nombre);
    if (!ok) { if (typeof showToast==='function') showToast('⚠ No se pudo guardar la actuaria'); return; }
    /* Actualizar in-memory */
    try {
      const all = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : (window.allCases || []);
      const c = all.find(x => x.id === caseId);
      if (c) c.actuaria = nombre || null;
    } catch {}
    /* Re-render */
    try { if (typeof window.renderTabla === 'function') window.renderTabla(); } catch {}
    try { if (window.currentCase && window.currentCase.id === caseId && typeof window.renderCaseHeader === 'function') window.renderCaseHeader(); } catch {}
    if (typeof showToast === 'function') showToast(nombre ? '✓ Actuaria: '+nombre : '↻ Actuaria removida');
  }

  /* ── PATCH renderTabla: agrega columna "Actuaria" ──────────────── */
  function patchRenderTabla() {
    if (typeof window.renderTabla !== 'function') return false;
    if (window.__renderTablaActuariaPatched) return true;
    const orig = window.renderTabla;
    window.renderTabla = function () {
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
    if (thead.dataset.actuariaCol !== '1') {
      const ths = [...thead.querySelectorAll('th')];
      const headerTexts = ths.map(t => (t.textContent || '').trim().toLowerCase());
      const isTerminado = headerTexts.some(t => t.startsWith('res. instruye') || t.startsWith('res. término') || t.startsWith('res. termino'));
      let insertAfterIdx = isTerminado
        ? headerTexts.findIndex(t => t.startsWith('procedimiento'))
        : headerTexts.findIndex(t => t.startsWith('etapa'));
      if (insertAfterIdx < 0) insertAfterIdx = Math.max(0, headerTexts.length - 2);
      const newTh = document.createElement('th');
      newTh.innerHTML = 'Actuaria';
      newTh.style.whiteSpace = 'nowrap';
      newTh.title = 'Actuaria asignada · clic en la celda para cambiar';
      const refTh = ths[insertAfterIdx];
      if (refTh && refTh.nextSibling) thead.insertBefore(newTh, refTh.nextSibling);
      else thead.appendChild(newTh);
      thead.dataset.actuariaCol = '1';
      thead.dataset.actuariaInsertIdx = String(insertAfterIdx + 1);
    }
    const insertIdx = parseInt(thead.dataset.actuariaInsertIdx || '0', 10);
    const all = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : (window.allCases || []);
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      if (tr.dataset.actuariaCol === '1') return;
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
      td.className = 'actuaria-cell';
      td.dataset.caseid = cid;
      td.dataset.actuaria = name || '';
      td.style.cursor = 'pointer';
      td.innerHTML = actuariaBadge(name);
      td.addEventListener('click', (e) => {
        e.stopPropagation(); /* no abrir el caso al editar la actuaria */
        openActuariaEditor(td, cid, name);
      });
      const ref = tds[insertIdx - 1];
      if (ref && ref.nextSibling) tr.insertBefore(td, ref.nextSibling);
      else tr.appendChild(td);
      tr.dataset.actuariaCol = '1';
    });
  }

  function patchRenderCaseHeader() {
    if (typeof window.renderCaseHeader !== 'function') return false;
    if (window.__renderCaseHeaderActuariaPatched) return true;
    const orig = window.renderCaseHeader;
    window.renderCaseHeader = function () {
      orig.apply(this, arguments);
      try { injectActuariaInHeader(); } catch (e) { console.warn('[actuaria-tabla] header err:', e.message); }
    };
    window.__renderCaseHeaderActuariaPatched = true;
    return true;
  }

  function injectActuariaInHeader() {
    const c = window.currentCase;
    if (!c) return;
    const grid = document.querySelector('#caseDetailsGrid > div');
    if (!grid || grid.querySelector('[data-fld=actuaria]')) return;
    const name = getActuariaFor(c);
    const div = document.createElement('div');
    div.dataset.fld = 'actuaria';
    div.style.cursor = 'pointer';
    div.innerHTML = '<div style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Actuaria asignada</div><div style="font-weight:500">'+actuariaBadge(name)+'</div>';
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      openActuariaEditor(div, c.id, name);
    });
    const labels = [...grid.children];
    const refIdx = labels.findIndex(el => /procedimiento/i.test(el.textContent||''));
    if (refIdx >= 0) grid.insertBefore(div, labels[refIdx]);
    else grid.appendChild(div);
  }

  function injectResponsiveCSS() {
    if (document.getElementById('mod-actuaria-tabla-css')) return;
    const css = ''
      + '#viewTabla{display:flex;flex-direction:column;min-width:0;}'
      + '#viewTabla .tabla-wrap{flex:1 1 auto !important;width:100% !important;min-width:0 !important;overflow-x:auto;overflow-y:auto;}'
      + '#viewTabla .tabla-casos{width:100% !important;min-width:100% !important;table-layout:auto !important;}'
      + '#viewTabla .tabla-casos .materia-cell{max-width:none !important;white-space:normal !important;line-height:1.35;word-break:break-word;}'
      + '#viewTabla .tabla-casos .proto-cell{white-space:normal !important;line-height:1.35;}'
      + '#viewTabla .tabla-casos .proc-badge,#viewTabla .tabla-casos .jud-badge,#viewTabla .tabla-casos .no-badge,#viewTabla .tabla-casos .mc-badge{white-space:nowrap;}'
      + '#viewTabla .tabla-casos .acciones-cell{flex-wrap:nowrap;}'
      + '#viewTabla .tabla-casos thead th{position:sticky;top:0;z-index:2;}'
      + '@media (max-width:1180px){#viewTabla .tabla-casos{min-width:1180px;}}'
      + '#viewTabla .tabla-casos th{position:relative;}'
      + '#viewTabla .tabla-casos th .col-resizer{position:absolute;top:0;right:0;width:6px;height:100%;cursor:col-resize;user-select:none;background:transparent;transition:background .15s;}'
      + '#viewTabla .tabla-casos th .col-resizer:hover,#viewTabla .tabla-casos th .col-resizer.dragging{background:rgba(15,118,110,.35);}'
      + '#viewTabla .tabla-casos td.actuaria-cell:hover{background:rgba(15,118,110,.05);}'
      + '#viewTabla .tabla-casos td.actuaria-cell .actuaria-empty:hover{color:#0f766e;}'
      + '.casos-toolbar .btn-autofit{background:none;border:1px solid var(--border);color:var(--text-muted);padding:5px 9px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:4px;margin-left:6px;}'
      + '.casos-toolbar .btn-autofit:hover{border-color:var(--gold-dim);color:var(--gold);}';
    const s = document.createElement('style');
    s.id = 'mod-actuaria-tabla-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Resizers + persistencia ──────────────────────────────────── */
  const LS_WIDTHS = 'fiscalito_tabla_col_widths';
  function loadColWidths() { try { return JSON.parse(localStorage.getItem(LS_WIDTHS)||'{}')||{}; } catch { return {}; } }
  function saveColWidths(m) { try { localStorage.setItem(LS_WIDTHS, JSON.stringify(m||{})); } catch {} }
  function colKey(th) { return (th.textContent||'').trim().toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'').slice(0,40); }
  function applyStoredWidths() {
    const ths = document.querySelectorAll('#viewTabla .tabla-casos thead th');
    const widths = loadColWidths();
    ths.forEach(th => { const k = colKey(th); if (widths[k]) th.style.width = widths[k]+'px'; });
  }
  function attachResizers() {
    const ths = document.querySelectorAll('#viewTabla .tabla-casos thead th');
    ths.forEach(th => {
      if (th.querySelector('.col-resizer')) return;
      const r = document.createElement('div');
      r.className = 'col-resizer';
      r.title = 'Arrastra para redimensionar · doble-clic restaura';
      th.appendChild(r);
      let startX = 0, startW = 0;
      const onMove = (e) => {
        const dx = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - startX;
        th.style.width = Math.max(40, startW + dx) + 'px';
      };
      const onUp = () => {
        r.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const widths = loadColWidths();
        widths[colKey(th)] = parseInt(th.style.width, 10);
        saveColWidths(widths);
      };
      r.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        startX = e.clientX;
        startW = th.getBoundingClientRect().width;
        r.classList.add('dragging');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      r.addEventListener('dblclick', (e) => {
        e.preventDefault(); e.stopPropagation();
        th.style.width = '';
        const widths = loadColWidths();
        delete widths[colKey(th)];
        saveColWidths(widths);
      });
      r.addEventListener('click', e => e.stopPropagation());
    });
  }

  function injectAutofitButton() {
    const toolbar = document.querySelector('#viewTabla .casos-toolbar div[style*="margin-left"]');
    if (!toolbar || toolbar.querySelector('.btn-autofit')) return;
    const btn = document.createElement('button');
    btn.className = 'btn-autofit';
    btn.title = 'Restaurar el ancho automático de todas las columnas';
    btn.innerHTML = '↔ Auto-ajustar';
    btn.onclick = () => {
      saveColWidths({});
      document.querySelectorAll('#viewTabla .tabla-casos thead th').forEach(th => { th.style.width = ''; });
      if (typeof window.renderTabla === 'function') window.renderTabla();
    };
    toolbar.insertBefore(btn, toolbar.firstChild);
  }

  function patchRenderTablaForResize() {
    if (typeof window.renderTabla !== 'function') return false;
    if (window.__renderTablaResizePatched) return true;
    const orig = window.renderTabla;
    window.renderTabla = function () {
      orig.apply(this, arguments);
      try { attachResizers(); applyStoredWidths(); } catch (e) { console.warn('[actuaria-tabla] resize err:', e.message); }
    };
    window.__renderTablaResizePatched = true;
    return true;
  }

  function tryPatch(retries) {
    retries = retries || 0;
    injectResponsiveCSS();
    const a = patchRenderTabla();
    const b = patchRenderCaseHeader();
    const c = patchRenderTablaForResize();
    if (a && b && c) {
      console.log('%c👩‍💼 Módulo Actuaria-Tabla v1.2 (auto-ajuste + resize + editor inline)', 'color:#0f766e;font-weight:bold');
      injectAutofitButton();
      try {
        if (typeof window.renderTabla === 'function' && document.querySelector('.tabla-casos tbody tr')) {
          window.renderTabla();
        } else {
          attachResizers(); applyStoredWidths();
        }
      } catch {}
      return;
    }
    if (retries > 50) return console.warn('[actuaria-tabla] no se pudo enganchar tras 50 intentos');
    setTimeout(() => tryPatch(retries + 1), 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tryPatch());
  else tryPatch();

  /* ── API pública ──────────────────────────────────────────────── */
  window.getActuariaFor = getActuariaFor;
  window.actuariaBadge = actuariaBadge;
  window.misCasosAutoFit = () => {
    saveColWidths({});
    document.querySelectorAll('#viewTabla .tabla-casos thead th').forEach(th => { th.style.width = ''; });
    if (typeof window.renderTabla === 'function') window.renderTabla();
  };
  window.misCasosAsignarActuaria = assignActuaria;
})();
