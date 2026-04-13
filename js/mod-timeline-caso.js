/**
 * MOD-TIMELINE-CASO.JS — Línea temporal visual del expediente
 * ────────────────────────────────────────────────────────────
 * Agrega pestaña "📅 Timeline" al detalle del caso que muestra:
 *   - Hitos cronológicos (denuncia, resolución, cargos, etc.)
 *   - Diligencias ordenadas por fecha
 *   - Etapas procesales como bandas de color
 *   - Notas y acciones pendientes en su fecha
 *   - Zoom por período (todo, último mes, última semana)
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-timeline-caso';
  const TAB_ID = 'tabTimeline';

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function parseDate(s){
    if(!s) return null;
    // Intenta DD/MM/YYYY y DD-MM-YYYY primero
    const m = String(s).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(m){
      /* MEDIUM#6 FIX: Validar rangos de día (1-31) y mes (1-12) */
      const day=parseInt(m[1],10), mon=parseInt(m[2],10), yr=parseInt(m[3],10);
      if(mon<1||mon>12||day<1||day>31) return null;
      const dt=new Date(yr, mon-1, day);
      /* Verificar que la fecha sea real (ej. 31/02 se convierte en marzo) */
      if(dt.getDate()!==day||dt.getMonth()!==mon-1) return null;
      return dt;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(d){
    if(!d) return '—';
    return d.toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
  }

  function daysBetween(a,b){
    return Math.round((b.getTime()-a.getTime())/86400000);
  }

  const STAGE_COLORS = {
    indagatoria:'#3b82f6', cargos:'#8b5cf6', descargos:'#f59e0b',
    prueba:'#06b6d4', vista:'#ec4899', resolucion:'#059669', cerrado:'#6b7280'
  };

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .tl-container { padding:16px; overflow-y:auto; }
      .tl-controls { display:flex; gap:8px; margin-bottom:14px; align-items:center; flex-wrap:wrap; }
      .tl-btn { padding:4px 12px; border:1px solid var(--border2); border-radius:var(--radius); background:var(--surface2); color:var(--text-dim); font-size:11px; cursor:pointer; transition:all .15s; font-family:var(--font-body); }
      .tl-btn.active, .tl-btn:hover { background:var(--gold); color:#fff; border-color:var(--gold); }
      .tl-track { position:relative; padding-left:28px; }
      .tl-line { position:absolute; left:12px; top:0; bottom:0; width:2px; background:var(--border); }
      .tl-event { position:relative; margin-bottom:16px; padding:10px 14px; background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); transition:border-color .15s; }
      .tl-event:hover { border-color:var(--gold); }
      .tl-dot { position:absolute; left:-22px; top:14px; width:12px; height:12px; border-radius:50%; border:2px solid var(--surface); z-index:1; }
      .tl-date { font-size:10px; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:3px; }
      .tl-title { font-size:12.5px; font-weight:600; margin-bottom:2px; }
      .tl-desc { font-size:11.5px; color:var(--text-dim); line-height:1.5; }
      .tl-badge { display:inline-block; padding:1px 7px; border-radius:8px; font-size:9.5px; font-weight:600; margin-left:6px; vertical-align:middle; }
      .tl-stage-band { padding:6px 14px; margin-bottom:12px; border-radius:6px; font-size:11px; font-weight:600; color:#fff; display:flex; align-items:center; gap:8px; position:relative; }
      .tl-stage-band .dur { font-weight:400; opacity:.8; font-size:10px; }
      .tl-empty { text-align:center; padding:40px; color:var(--text-muted); }
      .tl-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:16px; }
      .tl-summary-card { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:10px; text-align:center; }
      .tl-summary-card .val { font-size:18px; font-weight:700; font-family:var(--font-mono); color:var(--gold); }
      .tl-summary-card .lbl { font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.04em; }
    `;
    document.head.appendChild(s);
  }

  /* ── Inyectar tab ── */
  function injectTab(){
    const tabs = document.getElementById('caseTabs');
    if(!tabs || tabs.querySelector('[data-tab="'+TAB_ID+'"]')) return;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = TAB_ID;
    tab.textContent = '📅 Timeline';
    tab.onclick = function(){ if(typeof showTab==='function') showTab(TAB_ID); };
    tabs.appendChild(tab);
  }

  function injectContent(){
    if(document.getElementById(TAB_ID)) return;
    const viewCase = document.getElementById('viewCase');
    if(!viewCase) return;
    const div = document.createElement('div');
    div.className = 'tab-content';
    div.id = TAB_ID;
    div.style.display = 'none';
    viewCase.appendChild(div);
  }

  /* ── Recoger todos los eventos del caso ── */
  async function collectEvents(caseData){
    const events = [];
    const c = caseData;

    // Hitos del caso
    const milestones = [
      { field:'fecha_denuncia', label:'Denuncia recibida', icon:'📨', color:'#3b82f6' },
      { field:'fecha_resolucion', label:'Resolución instructora', icon:'📋', color:'#8b5cf6' },
      { field:'fecha_recepcion_fiscalia', label:'Recepción en fiscalía', icon:'🏛️', color:'#06b6d4' },
      { field:'fecha_vista', label:'Vista fiscal', icon:'📄', color:'#ec4899' },
      { field:'fecha_resolucion_termino', label:'Resolución de término', icon:'✅', color:'#059669' },
      { field:'created_at', label:'Caso creado en sistema', icon:'💾', color:'#9ca3af' }
    ];

    milestones.forEach(function(m){
      const d = parseDate(c[m.field]);
      if(d) events.push({ date:d, type:'milestone', label:m.label, icon:m.icon, color:m.color, detail:fmtDate(d) });
    });

    // Diligencias
    try {
      const { data } = await sb.from('diligencias')
        .select('id,diligencia_label,file_name,fecha_diligencia,ai_summary')
        .eq('case_id', c.id)
        .order('fecha_diligencia',{ascending:true});
      if(data) data.forEach(function(d){
        const dt = parseDate(d.fecha_diligencia);
        if(dt) events.push({
          date:dt, type:'diligencia', label:d.diligencia_label||d.file_name||'Diligencia',
          icon:'📎', color:'#f59e0b',
          detail: d.ai_summary ? d.ai_summary.substring(0,120)+'…' : ''
        });
      });
    } catch(e){}

    // Etapas procesales
    try {
      const { data } = await sb.from('etapas')
        .select('stage_name,started_at,completed_at,is_current')
        .eq('case_id', c.id)
        .order('started_at',{ascending:true});
      if(data) data.forEach(function(e){
        const dt = parseDate(e.started_at);
        if(dt){
          events.push({
            date:dt, type:'stage', label:'Etapa: '+escH(e.stage_name),
            icon: e.is_current?'▶️':'✔️',
            color: STAGE_COLORS[e.stage_name]||'#6b7280',
            detail: e.completed_at ? 'Completada '+fmtDate(parseDate(e.completed_at)) : (e.is_current?'En curso':''),
            stageName: e.stage_name,
            stageEnd: parseDate(e.completed_at),
            isCurrent: e.is_current
          });
        }
      });
    } catch(e){}

    // Notas
    try {
      const { data } = await sb.from('case_notes')
        .select('content,created_at')
        .eq('case_id', c.id)
        .order('created_at',{ascending:true});
      if(data) data.forEach(function(n){
        const dt = parseDate(n.created_at);
        if(dt) events.push({
          date:dt, type:'note', label:'Nota',
          icon:'📝', color:'#64748b',
          detail: (n.content||'').substring(0,100)
        });
      });
    } catch(e){}

    // Ordenar cronológicamente
    events.sort(function(a,b){ return a.date.getTime()-b.date.getTime(); });
    return events;
  }

  /* ── Filtrar por período ── */
  function filterEvents(events, period){
    if(period==='all') return events;
    const now = new Date();
    const cutoff = new Date(now);
    if(period==='month') cutoff.setDate(cutoff.getDate()-30);
    else if(period==='week') cutoff.setDate(cutoff.getDate()-7);
    else if(period==='quarter') cutoff.setDate(cutoff.getDate()-90);
    return events.filter(function(e){ return e.date >= cutoff; });
  }

  /* ── Render ── */
  let allEvents = [];
  let currentPeriod = 'all';

  async function renderTimeline(){
    const el = document.getElementById(TAB_ID);
    if(!el) return;
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ el.innerHTML='<div class="tl-empty">Seleccione un caso</div>'; return; }

    el.innerHTML = '<div class="tl-container"><div style="text-align:center;padding:20px;color:var(--text-muted)">⏳ Cargando línea temporal…</div></div>';

    allEvents = await collectEvents(c);
    renderWithFilter();
  }

  function renderWithFilter(){
    const el = document.getElementById(TAB_ID);
    if(!el) return;
    const events = filterEvents(allEvents, currentPeriod);

    // Summary
    const milestones = allEvents.filter(function(e){return e.type==='milestone';}).length;
    const diligencias = allEvents.filter(function(e){return e.type==='diligencia';}).length;
    const stages = allEvents.filter(function(e){return e.type==='stage';}).length;
    const totalDays = allEvents.length>=2 ? daysBetween(allEvents[0].date, allEvents[allEvents.length-1].date) : 0;

    let html = '<div class="tl-container">';

    // Summary cards
    html += `<div class="tl-summary">
      <div class="tl-summary-card"><div class="val">${allEvents.length}</div><div class="lbl">Eventos</div></div>
      <div class="tl-summary-card"><div class="val">${diligencias}</div><div class="lbl">Diligencias</div></div>
      <div class="tl-summary-card"><div class="val">${stages}</div><div class="lbl">Etapas</div></div>
      <div class="tl-summary-card"><div class="val">${totalDays}d</div><div class="lbl">Duración</div></div>
    </div>`;

    // Controls
    html += '<div class="tl-controls">';
    ['all','quarter','month','week'].forEach(function(p){
      var labels = {all:'Todo',quarter:'3 meses',month:'Último mes',week:'Semana'};
      html += '<button class="tl-btn'+(currentPeriod===p?' active':'')+'" onclick="window._timeline.filter(\''+p+'\')">'+labels[p]+'</button>';
    });
    html += '<span style="font-size:10px;color:var(--text-muted);margin-left:auto">'+events.length+' de '+allEvents.length+' eventos</span>';
    html += '</div>';

    if(!events.length){
      html += '<div class="tl-empty">No hay eventos en este período</div>';
    } else {
      html += '<div class="tl-track"><div class="tl-line"></div>';
      let lastMonth = '';

      events.forEach(function(ev){
        const month = ev.date.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
        if(month !== lastMonth){
          lastMonth = month;
          html += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 8px;padding-left:4px">'+escH(month)+'</div>';
        }

        if(ev.type==='stage'){
          html += '<div class="tl-stage-band" style="background:'+ev.color+'"><span>'+ev.icon+' '+escH(ev.label)+'</span>';
          if(ev.isCurrent) html += '<span class="tl-badge" style="background:rgba(255,255,255,.25)">Actual</span>';
          if(ev.detail) html += '<span class="dur">'+escH(ev.detail)+'</span>';
          html += '</div>';
        } else {
          html += '<div class="tl-event">';
          html += '<div class="tl-dot" style="background:'+ev.color+'"></div>';
          html += '<div class="tl-date">'+fmtDate(ev.date);
          html += ' <span class="tl-badge" style="background:'+(ev.color||'var(--gold)')+'22;color:'+ev.color+'">'+ev.type+'</span></div>';
          html += '<div class="tl-title">'+ev.icon+' '+escH(ev.label)+'</div>';
          if(ev.detail) html += '<div class="tl-desc">'+escH(ev.detail)+'</div>';
          html += '</div>';
        }
      });

      html += '</div>';
    }

    html += '</div>';
    el.innerHTML = html;
  }

  /* ── Hook showTab ── */
  const _origShowTab = window.showTab;
  window.showTab = function(tabId){
    if(typeof _origShowTab==='function') _origShowTab(tabId);
    if(tabId===TAB_ID) renderTimeline();
  };

  /* ── API pública ── */
  window._timeline = {
    filter: function(p){ currentPeriod=p; renderWithFilter(); },
    refresh: renderTimeline
  };

  /* ── Init ── */
  function init(){ injectTab(); injectContent(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
