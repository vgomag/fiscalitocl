/* ═══════════════════════════════════════════════════════════════════
   MOD-ACTUARIA-PENDIENTES.JS  ·  Fiscalito
   v1.0 · 2026-05-01
   ───────────────────────────────────────────────────────────────────
   Inyecta soporte de Actuaria en el panel de Pendientes:
     1) Carga el campo `actuaria` en el SELECT de pend.cases
     2) Muestra un badge de actuaria al lado del nombre del caso
     3) Agrega un filtro "Por actuaria" en la toolbar (todas / Roxana / …)
     4) Permite asignar/cambiar la actuaria desde el agrupador del caso
        (clic en el badge → mismo popover del editor de la tabla)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[actuaria-pendientes] cargando…');

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
    /* Fallback: buscar en allCases por id */
    try {
      const all = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : (window.allCases||[]);
      const row = all.find(x => x.id === c.id);
      if (row && row.actuaria) return String(row.actuaria);
    } catch {}
    /* Último: localStorage */
    try {
      const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign') || '{}');
      if (map && map[c.id]) return String(map[c.id]);
    } catch {}
    return '';
  }

  function escHTML(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escAttr(s){return escHTML(s);}

  function actuariaBadgeMini(name) {
    if (!name) return '<span class="pt-act-empty" style="font-size:10px;color:#9ca3af;font-style:italic;cursor:pointer" title="Clic para asignar actuaria">— actuaria</span>';
    const PALETTE = ['#0f766e','#7c3aed','#0369a1','#b45309','#be185d','#15803d','#9333ea','#1d4ed8'];
    let h = 0; for (let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
    const c = PALETTE[h % PALETTE.length];
    const parts = name.trim().split(/\s+/);
    const ini = ((parts[0]||'')[0]||'') + ((parts[1]||'')[0]||'');
    return '<span class="pt-act-badge" title="'+escAttr(name)+' · clic para cambiar" style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:'+c+';font-weight:500;white-space:nowrap;cursor:pointer;background:'+c+'12;padding:2px 7px;border-radius:10px;border:1px solid '+c+'40">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:'+c+';color:#fff;font-weight:700;font-size:8.5px">'+escHTML(ini.toUpperCase())+'</span>'
      + escHTML(name) + '</span>';
  }

  /* Estado del módulo */
  const state = { actuariaFilter: 'all' };

  /* ── Patch 1: incluir actuaria en el SELECT de loadPendientesData ── */
  function patchLoadData() {
    if (typeof window.loadPendientesData !== 'function') return false;
    if (window.__pendActuariaLoadPatched) return true;
    const orig = window.loadPendientesData;
    window.loadPendientesData = async function () {
      await orig.apply(this, arguments);
      /* Enriquecer pend.cases con actuaria desde fiscalitoUMAG/allCases */
      try {
        const cases = (window.pend && window.pend.cases) || {};
        Object.values(cases).forEach(c => {
          if (!c.actuaria) {
            const a = getActuariaFor(c);
            if (a) c.actuaria = a;
          }
        });
        /* Re-render para reflejar */
        if (typeof window.pendRender === 'function') window.pendRender();
      } catch (e) { console.warn('[actuaria-pendientes] enrich err:', e.message); }
    };
    window.__pendActuariaLoadPatched = true;
    return true;
  }

  /* ── Patch 2: pendGetFiltered → aplicar filtro por actuaria ── */
  function patchGetFiltered() {
    if (typeof window.pendGetFiltered !== 'function') return false;
    if (window.__pendActuariaFilterPatched) return true;
    const orig = window.pendGetFiltered;
    window.pendGetFiltered = function () {
      let list = orig.apply(this, arguments);
      if (state.actuariaFilter && state.actuariaFilter !== 'all') {
        const cases = (window.pend && window.pend.cases) || {};
        list = list.filter(a => {
          const c = cases[a.case_id];
          const act = getActuariaFor(c);
          return act === state.actuariaFilter;
        });
      }
      return list;
    };
    window.__pendActuariaFilterPatched = true;
    return true;
  }

  /* ── Patch 3: pendRender → agregar dropdown de filtro + badges ── */
  function patchRender() {
    if (typeof window.pendRender !== 'function') return false;
    if (window.__pendActuariaRenderPatched) return true;
    const orig = window.pendRender;
    window.pendRender = function () {
      orig.apply(this, arguments);
      try {
        injectActuariaFilter();
        injectActuariaBadges();
      } catch (e) { console.warn('[actuaria-pendientes] render err:', e.message); }
    };
    window.__pendActuariaRenderPatched = true;
    return true;
  }

  function injectActuariaFilter() {
    /* Selector "Por actuaria" — se inserta junto a los otros selectors */
    const toolbar = document.querySelector('#viewPendientes .pt-toolbar div[style*="display:flex;align-items:center"]');
    if (!toolbar) return;
    if (toolbar.querySelector('.pt-act-filter')) return;
    const list = getActuariasList();
    const sel = document.createElement('select');
    sel.className = 'pt-sel pt-act-filter';
    sel.title = 'Filtrar pendientes por actuaria asignada';
    sel.innerHTML = '<option value="all"'+(state.actuariaFilter==='all'?' selected':'')+'>👥 Todas las actuarias</option>'
      + list.map(n => '<option value="'+escAttr(n)+'"'+(state.actuariaFilter===n?' selected':'')+'>👤 '+escHTML(n)+'</option>').join('')
      + '<option value="__none"'+(state.actuariaFilter==='__none'?' selected':'')+'>⚪ Sin asignar</option>';
    sel.onchange = (e) => {
      const v = e.target.value;
      if (v === '__none') {
        /* Filtro especial: casos sin actuaria */
        if (typeof window.pendGetFiltered === 'function' && !window.__pendNoneActuariaPatched) {
          /* parche extra: agregar lógica de "sin asignar" */
          const origF = window.pendGetFiltered;
          window.pendGetFiltered = function () {
            let l = origF.apply(this, arguments);
            if (state.actuariaFilter === '__none') {
              const cases = (window.pend && window.pend.cases) || {};
              l = l.filter(a => !getActuariaFor(cases[a.case_id]));
            }
            return l;
          };
          window.__pendNoneActuariaPatched = true;
        }
      }
      state.actuariaFilter = v;
      if (typeof window.pendRender === 'function') window.pendRender();
    };
    /* Insertar antes del primer botón de vista */
    const refBtnGroup = toolbar.querySelector('div[style*="display:flex;border:1px solid"]');
    if (refBtnGroup) toolbar.insertBefore(sel, refBtnGroup);
    else toolbar.appendChild(sel);
  }

  function injectActuariaBadges() {
    const groups = document.querySelectorAll('#viewPendientes .pt-group');
    const cases = (window.pend && window.pend.cases) || {};
    groups.forEach(g => {
      if (g.dataset.actBadged === '1') return;
      const header = g.querySelector('.pt-gh');
      if (!header) return;
      const left = header.querySelector('div[style*="flex:1"]');
      if (!left) return;
      /* Obtener case_id desde el onclick del header: pendToggleCase('xxx') */
      const m = (header.getAttribute('onclick')||'').match(/pendToggleCase\('([^']+)'\)/);
      if (!m) return;
      const cid = m[1];
      const c = cases[cid];
      const name = getActuariaFor(c);
      const badge = document.createElement('span');
      badge.className = 'pt-act-wrap';
      badge.style.cssText = 'flex-shrink:0;margin-left:8px;display:inline-flex';
      badge.innerHTML = actuariaBadgeMini(name);
      badge.addEventListener('click', (e) => {
        e.stopPropagation(); /* no togglear el grupo */
        openActuariaPopover(badge, cid, name);
      });
      left.appendChild(badge);
      g.dataset.actBadged = '1';
    });
  }

  /* ── Popover de asignación (igual al de la tabla, simplificado) ── */
  function openActuariaPopover(anchor, caseId, currentName) {
    document.querySelectorAll('.actuaria-popover').forEach(p=>p.remove());
    const rect = anchor.getBoundingClientRect();
    const list = getActuariasList();
    const pop = document.createElement('div');
    pop.className = 'actuaria-popover';
    pop.style.cssText =
      'position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;'
      +'background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:8px;'
      +'box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:9999;'
      +'min-width:220px;max-width:300px;font-family:var(--font-body);'
      +'padding:6px;font-size:12px';
    pop.innerHTML =
      '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;padding:4px 8px 6px">Asignar actuaria</div>'
      + list.map(n =>
          '<div class="actuaria-opt" data-name="'+escAttr(n)+'" style="padding:6px 8px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;'
          + (n===currentName?'background:rgba(15,118,110,.08);color:#0f766e;font-weight:600;':'')
          + '">'
          + (n===currentName?'<span style="color:#0f766e">✓</span>':'<span style="width:8px"></span>')
          + escHTML(n) + '</div>'
        ).join('')
      + (currentName ? '<div class="actuaria-clear" style="padding:6px 8px;border-radius:6px;cursor:pointer;color:#dc2626;border-top:1px solid rgba(0,0,0,.06);margin-top:4px">✕ Quitar asignación</div>' : '');
    document.body.appendChild(pop);

    pop.querySelectorAll('.actuaria-opt,.actuaria-clear').forEach(el => {
      el.addEventListener('mouseenter', () => { if (!el.style.background.includes('118,110')) el.style.background = 'rgba(0,0,0,.04)'; });
      el.addEventListener('mouseleave', () => { if (!el.style.background.includes('118,110')) el.style.background = ''; });
    });
    pop.querySelectorAll('.actuaria-opt').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.stopPropagation();
        await assignActuaria(caseId, el.dataset.name);
        document.querySelectorAll('.actuaria-popover').forEach(p=>p.remove());
      });
    });
    const clearEl = pop.querySelector('.actuaria-clear');
    if (clearEl) clearEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      await assignActuaria(caseId, '');
      document.querySelectorAll('.actuaria-popover').forEach(p=>p.remove());
    });

    setTimeout(() => {
      const onDoc = (e) => { if (!pop.contains(e.target)) { document.querySelectorAll('.actuaria-popover').forEach(p=>p.remove()); document.removeEventListener('mousedown', onDoc); } };
      const onEsc = (e) => { if (e.key === 'Escape') { document.querySelectorAll('.actuaria-popover').forEach(p=>p.remove()); document.removeEventListener('keydown', onEsc); } };
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onEsc);
    }, 50);
  }

  async function assignActuaria(caseId, nombre) {
    /* Persistir vía fiscalitoUMAG (y fallbacks) */
    let ok = false;
    try {
      if (window.fiscalitoUMAG && typeof window.fiscalitoUMAG.setActuariaCaso === 'function') {
        await window.fiscalitoUMAG.setActuariaCaso(caseId, nombre || '');
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        const sb = window.sb || window.supabaseClient;
        if (sb && sb.from) {
          const r = await sb.from('cases').update({ actuaria: nombre || null, updated_at: new Date().toISOString() }).eq('id', caseId);
          if (!r.error) ok = true;
        }
      } catch {}
    }
    if (!ok) {
      try {
        const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign') || '{}');
        if (nombre) map[caseId] = nombre; else delete map[caseId];
        localStorage.setItem('fiscalito_actuarias_assign', JSON.stringify(map));
        ok = true;
      } catch {}
    }
    if (!ok) { if (typeof showToast==='function') showToast('⚠ No se pudo guardar'); return; }
    /* Actualizar memoria local */
    try {
      const cases = (window.pend && window.pend.cases) || {};
      if (cases[caseId]) cases[caseId].actuaria = nombre || null;
      const all = (typeof allCases!=='undefined' && Array.isArray(allCases)) ? allCases : (window.allCases||[]);
      const row = all.find(x=>x.id===caseId);
      if (row) row.actuaria = nombre || null;
    } catch {}
    /* Re-render pendientes y tabla */
    try { if (typeof window.pendRender === 'function') window.pendRender(); } catch {}
    try { if (typeof window.renderTabla === 'function') window.renderTabla(); } catch {}
    if (typeof showToast === 'function') showToast(nombre ? '✓ Actuaria: '+nombre : '↻ Actuaria removida');
  }

  /* ── BOOTSTRAP ── */
  function tryPatch(retries) {
    retries = retries || 0;
    const a = patchLoadData();
    const b = patchGetFiltered();
    const c = patchRender();
    if (a && b && c) {
      console.log('%c👩‍💼 Pendientes: badge actuaria + filtro v1.0', 'color:#0f766e;font-weight:bold');
      try { if (typeof window.pendRender === 'function' && document.querySelector('#viewPendientes .pt-group')) window.pendRender(); } catch {}
      return;
    }
    if (retries > 80) return console.warn('[actuaria-pendientes] no se pudo enganchar tras 80 intentos');
    setTimeout(() => tryPatch(retries+1), 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tryPatch());
  else tryPatch();
})();
