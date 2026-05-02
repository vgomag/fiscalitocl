/* ═══════════════════════════════════════════════════════════════════
   MOD-PENDIENTES-MONDAY.JS  ·  Fiscalito
   v1.0 · 2026-05-01
   ───────────────────────────────────────────────────────────────────
   Atajo desde Pendientes para mandar avisos a las actuarias en Monday:
   A) Botón "📤 Enviar a Monday" en la toolbar — envío MASIVO que
      respeta los filtros activos (categoría, estado, búsqueda, caso,
      actuaria). Para cada caso visible postea un update en su item
      Monday con la lista de pendientes y @mention a la actuaria.
   B) Mini-botón 📤 por cada grupo de caso — abre openMondayBridge(id)
      con el modal completo (revisar y enviar).
   Reusa /.netlify/functions/monday (mismo endpoint que mod-monday-bridge).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[pendientes-monday] cargando…');

  const ENDPOINT = '/.netlify/functions/monday';
  const _MONDAY_BOARD_ID = '9728211031';

  function _toast(m){ if(typeof showToast==='function') showToast(m); else console.log('[monday]', m); }
  function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function _sb(){ return window.sb || window.supabaseClient; }

  async function _api(action, payload){
    const _doFetch = (typeof authFetch==='function') ? authFetch : fetch;
    const r = await _doFetch(ENDPOINT, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action, ...(payload||{}) })
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'HTTP '+r.status);
    return data;
  }

  /* ── Cargar mapping case→monday_item_id en bulk ───────────────── */
  async function loadMappings(caseIds){
    const sb = _sb(); if (!sb) return new Map();
    const { data } = await sb.from('monday_mappings')
      .select('case_id, monday_item_id, monday_item_name, monday_board_id')
      .in('case_id', caseIds);
    const map = new Map();
    (data||[]).forEach(r => map.set(r.case_id, r));
    return map;
  }

  /* ── Construir HTML del update para un caso ──────────────────── */
  function buildUpdateHTML(caso, pendientes, mentionUserId){
    const lines = [];
    lines.push('<p>📋 <strong>Pendientes para '+_esc(caso.name||'caso')+'</strong>');
    if (caso.nueva_resolucion) lines.push(' · <em>'+_esc(caso.nueva_resolucion)+'</em>');
    lines.push('</p>');
    if (mentionUserId) lines.push('<p>👤 <a href="https://monday.com/users/'+mentionUserId+'" data-mention-type="User" data-mention-id="'+mentionUserId+'">@actuaria</a></p>');
    if (!pendientes.length) {
      lines.push('<p><em>Sin pendientes activos en Fiscalito.</em></p>');
    } else {
      lines.push('<p><strong>Acciones pendientes:</strong></p><ul>');
      pendientes.slice(0,12).forEach(p => {
        const due = p.due_date ? ' (vence '+_esc(p.due_date)+')' : '';
        const desc = p.description ? ' — '+_esc(String(p.description).slice(0,140)) : '';
        const urg = (p.priority==='alta'||p.priority==='urgente') ? ' ⚠️' : '';
        lines.push('<li><strong>'+_esc(p.title||'Pendiente')+'</strong>'+due+desc+urg+'</li>');
      });
      lines.push('</ul>');
      if (pendientes.length>12) lines.push('<p><em>(+'+(pendientes.length-12)+' acciones más en Fiscalito)</em></p>');
    }
    lines.push('<p><sub>Enviado desde Fiscalito · '+new Date().toLocaleString('es-CL')+'</sub></p>');
    return lines.join('');
  }

  /* ── Buscar usuario Monday por nombre de actuaria ─────────────── */
  let _mondayUsersCache = null;
  async function findMondayUserByName(name){
    if (!name) return null;
    if (!_mondayUsersCache) {
      try { const r = await _api('list_users'); _mondayUsersCache = r.users || []; }
      catch { _mondayUsersCache = []; }
    }
    const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
    const target = norm(name);
    /* Match por nombre completo, luego por apellido + nombre */
    let u = _mondayUsersCache.find(x => norm(x.name)===target);
    if (u) return u;
    const partsT = target.split(' ');
    u = _mondayUsersCache.find(x => {
      const n = norm(x.name);
      return partsT.every(p => n.includes(p));
    });
    return u || null;
  }

  /* ── Helpers para filtrar como hace pend ──────────────────────── */
  function getActuariaFor(c){
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
      const all = (typeof allCases!=='undefined' && Array.isArray(allCases)) ? allCases : (window.allCases||[]);
      const r = all.find(x=>x.id===c.id);
      if (r && r.actuaria) return String(r.actuaria);
    } catch {}
    try {
      const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign') || '{}');
      if (map && map[c.id]) return String(map[c.id]);
    } catch {}
    return '';
  }

  /* ── Panel de progreso flotante ─────────────────────────────── */
  function makePanel(){
    const id = 'pendMondayPanel';
    let p = document.getElementById(id); if (p) p.remove();
    p = document.createElement('div');
    p.id = id;
    p.style.cssText='position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:14px 16px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:10000;min-width:340px;max-width:460px;font-family:var(--font-body);font-size:12px';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>📤 Enviando a Monday…</strong><button onclick="document.getElementById(\''+id+'\').remove()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#666">×</button></div>'
      + '<div id="'+id+'-status" style="color:#374151;margin-bottom:6px">Iniciando…</div>'
      + '<div style="background:#e5e7eb;border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px"><div id="'+id+'-bar" style="background:#0f766e;height:100%;width:0%;transition:width .3s"></div></div>'
      + '<div id="'+id+'-log" style="max-height:180px;overflow-y:auto;font-size:11px;color:#6b7280;font-family:var(--font-mono,monospace)"></div>';
    document.body.appendChild(p);
    return {
      status: s => { const el=document.getElementById(id+'-status'); if(el) el.textContent=s; },
      bar: pct => { const el=document.getElementById(id+'-bar'); if(el) el.style.width=Math.round(pct)+'%'; },
      log: m => { const el=document.getElementById(id+'-log'); if(el) { const d=document.createElement('div'); d.textContent=m; el.appendChild(d); el.scrollTop=el.scrollHeight; } }
    };
  }

  /* ── ENVÍO MASIVO — opción A ─────────────────────────────────── */
  async function bulkSendToMonday(){
    if (typeof window.pendGetFiltered !== 'function') { _toast('⚠ pendGetFiltered no disponible'); return; }
    const all = window.pendGetFiltered();
    /* Filtrar solo los no-completados (no tiene sentido avisar de tareas hechas) */
    const acts = all.filter(a => a.status !== 'completado');
    if (!acts.length) { _toast('⚠ No hay pendientes activos para enviar'); return; }
    /* Agrupar por caso */
    const byCase = new Map();
    acts.forEach(a => { if(!byCase.has(a.case_id)) byCase.set(a.case_id, []); byCase.get(a.case_id).push(a); });
    const cases = (window.pend && window.pend.cases) || {};

    const totalCasos = byCase.size;
    const totalAcciones = acts.length;
    const ok = confirm(
      'Vas a enviar a Monday:\n\n'
      +'  · '+totalCasos+' casos\n'
      +'  · '+totalAcciones+' acciones pendientes\n\n'
      +'Cada caso recibirá UN mensaje en su item de Monday con la lista de pendientes y @mention a la actuaria asignada.\n\n¿Continuar?'
    );
    if (!ok) return;

    const panel = makePanel();
    panel.status('Cargando mappings…');
    const caseIds = [...byCase.keys()];
    const mappings = await loadMappings(caseIds);

    let okCnt=0, skip=0, err=0, done=0;
    for (const [cid, items] of byCase){
      const c = cases[cid] || {id:cid};
      const lbl = c.name || cid;
      done++;
      panel.status('('+done+'/'+totalCasos+') '+lbl);
      panel.bar(100*done/totalCasos);
      const mapping = mappings.get(cid);
      if (!mapping || !mapping.monday_item_id) {
        skip++;
        panel.log('⊘ '+lbl+' · sin mapping a Monday (abre el caso → 📤 para vincularlo)');
        continue;
      }
      try {
        const actuaria = getActuariaFor(c);
        let mentionUserId = null;
        if (actuaria) {
          const u = await findMondayUserByName(actuaria);
          if (u) mentionUserId = u.id;
        }
        const html = buildUpdateHTML(c, items, mentionUserId);
        await _api('create_update', { itemId: mapping.monday_item_id, body: html, mentionUserIds: mentionUserId ? [mentionUserId] : [] });
        /* Actualizar last_message_at */
        try {
          const sb = _sb();
          if (sb) await sb.from('monday_mappings').update({ last_message_at: new Date().toISOString() }).eq('case_id', cid);
        } catch {}
        okCnt++;
        panel.log('✓ '+lbl+' · '+items.length+' pend.'+(actuaria?' → '+actuaria:''));
      } catch (e) {
        err++;
        panel.log('⚠ '+lbl+' · '+e.message);
      }
    }
    panel.status('Completado · '+okCnt+' enviados · '+skip+' sin mapping · '+err+' errores');
    _toast('✓ '+okCnt+' mensajes enviados a Monday'+(skip?' · '+skip+' sin vincular':''));
  }

  /* ── INYECCIÓN DE BOTONES ────────────────────────────────────── */
  function injectToolbarButton(){
    const topbar = document.querySelector('#viewPendientes .pt-topbar');
    if (!topbar) return;
    const right = topbar.querySelector('div[style*="display:flex;gap:8px"]');
    if (!right || right.querySelector('.pt-btn-monday')) return;
    const btn = document.createElement('button');
    btn.className = 'pt-btn-monday';
    btn.title = 'Enviar a Monday los pendientes que estás viendo (respeta filtros). Cada caso recibe un update con sus pendientes y @mention a la actuaria.';
    btn.style.cssText = 'display:flex;align-items:center;gap:5px;padding:6px 12px;font-size:11.5px;background:#ff3d57;color:#fff;border:none;border-radius:7px;cursor:pointer;font-family:inherit;font-weight:600';
    btn.innerHTML = '📤 Enviar a Monday';
    btn.onclick = bulkSendToMonday;
    right.insertBefore(btn, right.firstChild);
  }

  function injectGroupButtons(){
    const groups = document.querySelectorAll('#viewPendientes .pt-group');
    groups.forEach(g => {
      if (g.dataset.mondayBtn === '1') return;
      const header = g.querySelector('.pt-gh');
      if (!header) return;
      const right = header.querySelector('div[style*="flex-shrink:0"]');
      if (!right) return;
      const m = (header.getAttribute('onclick')||'').match(/pendToggleCase\('([^']+)'\)/);
      if (!m) return;
      const cid = m[1];
      const btn = document.createElement('button');
      btn.title = 'Abrir bridge a Monday para este caso (revisar y enviar)';
      btn.style.cssText = 'background:none;border:none;cursor:pointer;color:#ff3d57;padding:3px 5px;border-radius:4px;display:flex;align-items:center;font-size:13px';
      btn.innerHTML = '📤';
      btn.onclick = (e) => { e.stopPropagation(); if (typeof window.openMondayBridge==='function') window.openMondayBridge(cid); else _toast('⚠ Recarga la página para activar el bridge'); };
      /* Insertar antes del último botón (el de "abrir caso") */
      const openBtn = right.querySelector('button[title="Abrir caso"]');
      if (openBtn) right.insertBefore(btn, openBtn);
      else right.appendChild(btn);
      g.dataset.mondayBtn = '1';
    });
  }

  function patchRender(){
    if (typeof window.pendRender !== 'function') return false;
    if (window.__pendMondayRenderPatched) return true;
    const orig = window.pendRender;
    window.pendRender = function(){
      orig.apply(this, arguments);
      try { injectToolbarButton(); injectGroupButtons(); } catch(e){ console.warn('[pend-monday]', e.message); }
    };
    window.__pendMondayRenderPatched = true;
    return true;
  }

  function tryPatch(retries){
    retries = retries || 0;
    if (patchRender()) {
      console.log('%c📤 Pendientes → Monday (A+B) cargado', 'color:#ff3d57;font-weight:bold');
      try { if (typeof window.pendRender==='function' && document.querySelector('#viewPendientes .pt-group')) window.pendRender(); } catch {}
      injectToolbarButton(); injectGroupButtons();
      return;
    }
    if (retries > 80) return console.warn('[pendientes-monday] no se enganchó');
    setTimeout(() => tryPatch(retries+1), 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tryPatch());
  else tryPatch();

  /* API pública */
  window.pendBulkSendToMonday = bulkSendToMonday;
})();
