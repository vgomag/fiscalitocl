/**
 * MOD-VISTA-FISCAL.JS — Panel F7: Vista Fiscal / Informe de la Investigadora
 * ═══════════════════════════════════════════════════════════════════════════
 * Sistema de sub-pestañas para desarrollar cada sección de la vista fiscal
 * por separado, consultando modelos de expedientes terminados similares.
 *
 * Se integra en el panel F7 (fnPanel) mediante renderF7Panel().
 * Reemplaza el antiguo sistema que estaba dentro del tab IA.
 */
(function(){
  'use strict';

  const API_BASE = '/.netlify/functions';

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function getAuthToken(){
    try { return typeof session!=='undefined' && session?.access_token ? session.access_token : ''; }
    catch{ return ''; }
  }

  async function apiFetch(fn, body){
    const token = getAuthToken();
    const res = await fetch(API_BASE + '/' + fn, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-auth-token': token },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ══════════════════════════════════
     CSS — Sub-pestañas Vista Fiscal
     ══════════════════════════════════ */
  if(!document.getElementById('mod-vf-css')){
    var style = document.createElement('style');
    style.id = 'mod-vf-css';
    style.textContent = [
      '.vf-tabs-container{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-top:10px;}',
      '.vf-tabs-header{display:flex;border-bottom:1px solid var(--border);overflow-x:auto;padding:0;background:var(--surface);}',
      '.vf-tabs-header::-webkit-scrollbar{height:3px;}',
      '.vf-tabs-header::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px;}',
      '.vf-tab-btn{padding:10px 14px;font-size:11px;font-family:var(--font-body);cursor:pointer;border:none;background:transparent;color:var(--text-dim);border-bottom:2px solid transparent;white-space:nowrap;transition:all .15s;flex-shrink:0;}',
      '.vf-tab-btn:hover{color:var(--text);background:rgba(255,255,255,.03);}',
      '.vf-tab-btn.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:600;}',
      '.vf-tab-body{padding:16px;display:none;}',
      '.vf-tab-body.active{display:block;}',
      '.vf-section-desc{font-size:11.5px;color:var(--text-dim);line-height:1.6;margin-bottom:14px;padding:10px 12px;background:var(--bg);border-radius:var(--radius);border-left:3px solid var(--gold);}',
      '.vf-gen-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}',
      '.vf-parrafos-toggle{margin-top:14px;border-top:1px solid var(--border);padding-top:12px;}',
      '.vf-parrafos-toggle-btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11.5px;color:var(--text-dim);font-family:var(--font-body);transition:all .15s;}',
      '.vf-parrafos-toggle-btn:hover{border-color:var(--gold-dim);color:var(--text);}',
      '.vf-parrafos-list{margin-top:8px;}',
      '.vf-parr-item{background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:5px;cursor:pointer;transition:all .12s;}',
      '.vf-parr-item:hover{border-color:var(--gold-dim);}',
      '.vf-parr-item.selected{background:var(--gold-glow);border-color:var(--gold-dim);}',
      '.vf-parr-label{font-size:11.5px;font-weight:500;color:var(--text);margin-bottom:3px;}',
      '.vf-parr-preview{font-size:10px;color:var(--text-muted);line-height:1.4;}',
      '.vf-unified-section{margin-top:12px;}',
      '.vf-unified-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}',
      '.vf-section-tag{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-right:6px;}',
      '.vf-status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;}',
      '.vf-status-dot.empty{background:var(--border2);}',
      '.vf-status-dot.done{background:#16a34a;}',
      '.vf-status-dot.loading{background:var(--gold);animation:ia-spin 1s linear infinite;}',
      '.vf-ia-btn{background:var(--gold);color:#fff;border:none;padding:8px 16px;border-radius:var(--radius);font-size:12px;font-family:var(--font-body);cursor:pointer;transition:opacity .15s;display:inline-flex;align-items:center;gap:6px;}',
      '.vf-ia-btn:hover{opacity:.85;}',
      '.vf-ia-btn:disabled{opacity:.5;cursor:not-allowed;}',
      '.vf-ia-btn-secondary{background:transparent;color:var(--gold);border:1px solid var(--gold);}',
      '.vf-ia-result{margin-top:12px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);font-size:12px;line-height:1.6;max-height:400px;overflow-y:auto;white-space:pre-wrap;}',
      '.vf-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:ia-spin .6s linear infinite;}',
      '@keyframes ia-spin{to{transform:rotate(360deg);}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════
     ESTADO
     ══════════════════════════════════ */
  var vfState = {
    activeTab: 'completa',
    sections: {
      completa:       { text: '', modelsUsed: [], usage: null },
      vistos:         { text: '', modelsUsed: [], usage: null },
      hechos:         { text: '', modelsUsed: [], usage: null },
      sancion:        { text: '', modelsUsed: [], usage: null },
      sobreseimiento: { text: '', modelsUsed: [], usage: null },
      estrategias:    { text: '', modelsUsed: [], usage: null },
      genero:         { text: '', modelsUsed: [], usage: null }
    },
    parrafosOpen: {}
  };

  /* ══════════════════════════════════
     DEFINICIÓN DE SUB-PESTAÑAS
     ══════════════════════════════════ */
  var VF_TABS = [
    { id:'completa', label:'Vista fiscal completa', icon:'📄', mode:'informe',
      desc:'Genera el documento completo (Vistos, Considerandos, Análisis y Propuesta) o visualiza el resultado unificado de todas las secciones editadas por separado.',
      parrafosCats: ['antecedentes','hechos','valoracion','analisis','sancion','sobreseimiento','eximentes','por_tanto','genero'] },
    { id:'vistos', label:'Normativa y Vistos', icon:'⚖️', mode:'vistos',
      desc:'Sección inicial: identificación del expediente, resolución instructora, y enumeración exhaustiva de toda la normativa aplicable (Estatuto Administrativo, Ley 19.880, protocolos UMAG, etc.).',
      parrafosCats: ['antecedentes'] },
    { id:'hechos', label:'Hechos acreditados y prueba', icon:'🔍', mode:'hechos',
      desc:'Considerandos detallados: un numeral por cada diligencia del expediente siguiendo el orden de fojas. Incluye declaraciones, prueba documental, cargos y descargos.',
      parrafosCats: ['hechos','valoracion'] },
    { id:'sancion', label:'Propuesta de sanción', icon:'⚠️', mode:'sancion',
      desc:'Calificación jurídica, circunstancias atenuantes/agravantes, y propuesta fundamentada de sanción disciplinaria conforme al art. 121 del EA.',
      parrafosCats: ['analisis','eximentes','sancion','por_tanto'] },
    { id:'sobreseimiento', label:'Propuesta de sobreseimiento', icon:'✅', mode:'sobreseimiento',
      desc:'Fundamentos del sobreseimiento: inexistencia de hechos, insuficiencia probatoria, prescripción, o causal eximente de responsabilidad.',
      parrafosCats: ['sobreseimiento','por_tanto'] },
    { id:'estrategias', label:'Estrategias preventivas', icon:'🛡️', mode:'estrategias',
      desc:'Análisis de factores de riesgo institucional, recomendaciones preventivas, plan de implementación y mecanismos de seguimiento.',
      parrafosCats: [] },
    { id:'genero', label:'Con perspectiva de género', icon:'♀️', mode:'genero',
      desc:'Análisis con enfoque de género: marco normativo (CEDAW, Ley 21.369, Ley Karin), relaciones asimétricas de poder, debida diligencia y recomendaciones.',
      parrafosCats: ['genero'] }
  ];

  /* ── Mapeo de categorías de párrafos ── */
  var PARR_CAT_COLORS = {
    antecedentes:'#4f46e5', hechos:'#059669', valoracion:'#0891b2', analisis:'#7c3aed',
    sancion:'#dc2626', sobreseimiento:'#ca8a04', por_tanto:'#1d4ed8', genero:'#be185d', eximentes:'#15803d'
  };
  var PARR_CAT_LABELS = {
    antecedentes:'Antecedentes procesales', hechos:'Hechos acreditados', valoracion:'Valoración de la prueba',
    analisis:'Análisis jurídico', sancion:'Propuesta de sanción', sobreseimiento:'Sobreseimiento',
    por_tanto:'Por Tanto', genero:'Perspectiva de género', eximentes:'Eximentes y atenuantes'
  };

  /* ══════════════════════════════════
     CONSTRUIR PÁRRAFOS FILTRADOS
     ══════════════════════════════════ */
  function buildFilteredParrafos(tabId, parrafosCats) {
    if (!parrafosCats || !parrafosCats.length) return '';
    var PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    var filteredParrs = PARRAFOS_DB_REF.filter(function(p){ return parrafosCats.indexOf(p.cat) !== -1; });
    if (!filteredParrs.length) return '';

    var isOpen = vfState.parrafosOpen[tabId] || false;
    var html = '<div class="vf-parrafos-toggle">';
    html += '<button class="vf-parrafos-toggle-btn" onclick="window._vf.toggleVfParrafos(\'' + tabId + '\')">';
    html += '<span>📝 Párrafos modelo (' + filteredParrs.length + ' disponibles)</span>';
    html += '<span style="font-size:10px;color:var(--gold)">' + (isOpen ? 'Ocultar ↑' : 'Ver párrafos →') + '</span>';
    html += '</button>';

    if (isOpen) {
      html += '<div class="vf-parrafos-list">';
      parrafosCats.forEach(function(catId) {
        var catParrs = filteredParrs.filter(function(p){ return p.cat === catId; });
        if (!catParrs.length) return;
        var color = PARR_CAT_COLORS[catId] || '#888';
        var label = PARR_CAT_LABELS[catId] || catId;
        html += '<div style="margin-top:8px;margin-bottom:4px">';
        html += '<div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:' + color + ';border-bottom:2px solid ' + color + ';padding-bottom:2px;margin-bottom:6px;font-family:\'DM Mono\',monospace">' + label + '</div>';
        catParrs.forEach(function(p) {
          html += '<div class="vf-parr-item" onclick="window._vf.useParrafoInSection(\'' + p.id + '\',\'' + tabId + '\')">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center">';
          html += '<div class="vf-parr-label">' + escH(p.label) + '</div>';
          html += '<div style="display:flex;gap:4px">';
          html += '<button class="vf-ia-btn vf-ia-btn-secondary" style="padding:2px 8px;font-size:10px" onclick="event.stopPropagation();window._vf.copyParrafoText(\'' + p.id + '\')">📋</button>';
          html += '<button class="vf-ia-btn vf-ia-btn-secondary" style="padding:2px 8px;font-size:10px" onclick="event.stopPropagation();window._vf.sendParrafoToChat(\'' + p.id + '\')">💬</button>';
          html += '</div></div>';
          html += '<div class="vf-parr-preview">' + escH(p.text.substring(0, 150)) + '…</div>';
          html += '</div>';
        });
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ══════════════════════════════════
     CONSTRUIR CONTENIDO DE SUB-PESTAÑA
     ══════════════════════════════════ */
  function buildVfTabContent(tab) {
    var state = vfState.sections[tab.id];
    var html = '';

    // Descripción de la sección
    html += '<div class="vf-section-desc">' + tab.icon + ' ' + escH(tab.desc) + '</div>';

    // Barra de generación
    html += '<div class="vf-gen-bar">';
    html += '<button class="vf-ia-btn" onclick="window._vf.generateSection(\'' + tab.id + '\')">';
    html += (tab.id === 'completa' ? '📄 Generar vista completa' : '✨ Generar esta sección');
    html += '</button>';
    if (state.text) {
      html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.generateSection(\'' + tab.id + '\')" style="margin-left:4px">🔄 Regenerar</button>';
      html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.copySection(\'' + tab.id + '\')" style="margin-left:4px">📋 Copiar</button>';
      html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.sendSectionToChat(\'' + tab.id + '\')" style="margin-left:4px">💬 Chat</button>';
    }
    html += '</div>';

    // Resultado
    html += '<div id="vfResult_' + tab.id + '">';
    if (state.text) {
      html += '<div class="vf-ia-result">';
      if (state.modelsUsed && state.modelsUsed.length) {
        html += '<div style="margin-bottom:8px;padding:6px 10px;background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.12);border-radius:6px;font-size:10px;color:var(--text-dim)">';
        html += '📚 Modelos de estilo: <strong>' + state.modelsUsed.map(function(m){ return escH(m); }).join(', ') + '</strong>';
        html += '</div>';
      }
      html += '<div style="white-space:pre-wrap">' + escH(state.text) + '</div>';
      if (state.usage) {
        html += '<div style="margin-top:8px;font-size:10px;color:var(--text-muted);text-align:right">Tokens: ' + (state.usage.inputTokens||0) + ' in / ' + (state.usage.outputTokens||0) + ' out</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Vista unificada (solo en pestaña "completa")
    if (tab.id === 'completa') {
      var hasAnySections = Object.keys(vfState.sections).some(function(k){ return k !== 'completa' && vfState.sections[k].text; });
      if (hasAnySections) {
        html += '<div class="vf-unified-section">';
        html += '<div class="vf-unified-header">';
        html += '<div style="font-size:13px;font-weight:600;color:var(--text)">📋 Vista unificada de secciones</div>';
        html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.copyUnified()" style="padding:4px 10px;font-size:10px">📋 Copiar todo</button>';
        html += '</div>';
        html += '<div style="font-size:10px;color:var(--text-muted);margin-bottom:8px">Resultado combinado de las secciones generadas individualmente:</div>';
        // Indicadores de estado
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
        VF_TABS.forEach(function(t){
          if (t.id === 'completa') return;
          var hasTxt = !!vfState.sections[t.id].text;
          html += '<span style="font-size:10px;display:flex;align-items:center;gap:4px">';
          html += '<span class="vf-status-dot ' + (hasTxt ? 'done' : 'empty') + '"></span>';
          html += escH(t.label);
          html += '</span>';
        });
        html += '</div>';
        // Texto unificado
        html += '<div class="vf-ia-result" style="max-height:600px">';
        var sectionOrder = ['vistos','hechos','sancion','sobreseimiento','estrategias','genero'];
        sectionOrder.forEach(function(sId){
          var st = vfState.sections[sId];
          if (!st.text) return;
          var tabDef = VF_TABS.find(function(t){ return t.id === sId; });
          if (!tabDef) return;
          html += '<div style="margin-bottom:16px">';
          html += '<div style="font-size:11px;font-weight:600;color:var(--gold);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">' + tabDef.icon + ' ' + escH(tabDef.label) + '</div>';
          html += '<div style="white-space:pre-wrap">' + escH(st.text) + '</div>';
          html += '</div>';
        });
        html += '</div>';
        html += '</div>';
      }
    }

    // Párrafos modelo filtrados
    html += buildFilteredParrafos(tab.id, tab.parrafosCats);

    return html;
  }

  /* ══════════════════════════════════
     RENDER F7 PANEL
     ══════════════════════════════════ */
  function renderF7Panel(){
    var panel = document.getElementById('fnPanel');
    var msgs = document.getElementById('msgs');
    if(!panel) return;

    // Si hay mensajes de chat, no mostrar panel
    if(msgs && msgs.children.length > 0){
      panel.style.display = 'none';
      if(msgs) msgs.style.display = 'flex';
      return;
    }
    if(msgs) msgs.style.display = 'none';
    panel.style.display = 'flex';

    var c = typeof currentCase !== 'undefined' ? currentCase : null;
    var fn = typeof FNS !== 'undefined' ? FNS.find(function(f){ return f.code === 'F7'; }) : null;
    var p = typeof FN_PANELS !== 'undefined' ? FN_PANELS['F7'] : null;

    // Cabecera del panel F7 (info del caso + descripción)
    var caseLink = '';
    if(c){
      caseLink = '<div style="display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:8px;font-size:11px;color:var(--gold)">' +
        '<div style="display:flex;align-items:center;gap:5px">' +
        '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6z"/></svg>' +
        'Caso activo: <strong>' + escH(c.name) + '</strong>' + (c.nueva_resolucion ? ' · ' + escH(c.nueva_resolucion) : '') +
        '</div>' +
        '<button class="btn-sm" onclick="fnShowCaseSelector()" style="font-size:10px;padding:3px 8px">Cambiar</button>' +
        '</div>';
    } else {
      caseLink = '<div style="margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;color:var(--text-muted)">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span>⚠️ Sin caso vinculado</span>' +
        (typeof buildCaseSelectorHTML === 'function' ? buildCaseSelectorHTML('fnLinkCase') : '') +
        '</div></div>';
    }

    var headerHtml = '<div class="fn-panel-link" style="cursor:default;background:var(--surface2);">' +
      '<div style="display:flex;flex-direction:column;gap:5px;width:100%">' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<span style="background:var(--gold);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:var(--font-mono)">F7</span>' +
      '<span style="font-size:13px;font-weight:600;color:var(--text)">' + (fn ? fn.name : 'Vista / Informe Final') + '</span>' +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-dim);line-height:1.5">' + (p ? p.desc : 'Elabora el informe final o vista fiscal.') + '</p>' +
      (p && p.note ? '<div style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:4px;padding:7px 10px;font-size:11.5px;color:var(--text-dim);margin-top:4px">' + (p.noteIcon||'ℹ️') + ' ' + p.note + '</div>' : '') +
      caseLink +
      '</div></div>';

    // Sub-pestañas de la vista fiscal
    var vfHtml = '<div class="vf-tabs-container">' +
      '<div style="padding:12px 16px 0;display:flex;justify-content:space-between;align-items:center">' +
      '<div>' +
      '<h3 style="font-family:var(--font-serif);font-size:15px;font-weight:600;margin:0 0 4px;display:flex;align-items:center;gap:8px">📝 Vista Fiscal / Informe de la Investigadora</h3>' +
      '<p style="font-size:11px;color:var(--text-dim);margin:0 0 8px">Desarrolla cada sección por separado consultando modelos de expedientes terminados similares' +
      (c ? ' (' + escH(c.tipo_procedimiento||'—') + ' / ' + escH(c.protocolo||'—') + ')' : '') + '</p>' +
      '</div></div>' +
      '<div class="vf-tabs-header" id="vfTabsHeader">';

    VF_TABS.forEach(function(t){
      var isDone = vfState.sections[t.id] && vfState.sections[t.id].text;
      vfHtml += '<button class="vf-tab-btn ' + (vfState.activeTab === t.id ? 'active' : '') + '" data-vftab="' + t.id + '" onclick="window._vf.switchVfTab(\'' + t.id + '\')">' +
        (isDone ? '<span class="vf-status-dot done" style="margin-right:4px"></span>' : '') +
        t.icon + ' ' + escH(t.label) + '</button>';
    });

    vfHtml += '</div>';

    VF_TABS.forEach(function(t){
      vfHtml += '<div class="vf-tab-body ' + (vfState.activeTab === t.id ? 'active' : '') + '" id="vfTab_' + t.id + '">' +
        buildVfTabContent(t) + '</div>';
    });

    vfHtml += '</div>';

    panel.innerHTML = headerHtml + vfHtml;
  }

  /* ══════════════════════════════════
     INTERACCIONES
     ══════════════════════════════════ */

  /* ── Cambiar sub-pestaña ── */
  function switchVfTab(tabId) {
    vfState.activeTab = tabId;
    document.querySelectorAll('.vf-tab-btn').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.vftab === tabId);
    });
    VF_TABS.forEach(function(t){
      var body = document.getElementById('vfTab_' + t.id);
      if(body) body.classList.toggle('active', t.id === tabId);
    });
  }

  /* ── Toggle párrafos dentro de pestaña ── */
  function toggleVfParrafos(tabId) {
    vfState.parrafosOpen[tabId] = !vfState.parrafosOpen[tabId];
    var tab = VF_TABS.find(function(t){ return t.id === tabId; });
    var body = document.getElementById('vfTab_' + tabId);
    if (tab && body) body.innerHTML = buildVfTabContent(tab);
  }

  /* ── Generar sección ── */
  async function generateSection(sectionId){
    var c = typeof currentCase !== 'undefined' ? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }

    var tab = VF_TABS.find(function(t){ return t.id === sectionId; });
    var mode = tab ? tab.mode : sectionId;

    var el = document.getElementById('vfResult_' + sectionId);
    if(!el) return;

    var isFullDoc = (mode === 'informe' || mode === 'hechos');
    var loadingLabel = tab ? tab.label : 'sección';
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="vf-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Generando ' + escH(loadingLabel) + '… (esto puede tomar hasta ' + (isFullDoc ? '2 minutos' : '1 minuto') + ')<br><span style="font-size:10px">Buscando automáticamente modelos de expedientes terminados similares</span></div>';

    try {
      var diligenciaFields = isFullDoc
        ? 'diligencia_label,file_name,fecha_diligencia,ai_summary,extracted_text,fojas'
        : 'diligencia_label,file_name,fecha_diligencia,ai_summary';

      var results = await Promise.all([
        sb.from('diligencias').select(diligenciaFields).eq('case_id', c.id).order('fecha_diligencia',{ascending:true}),
        sb.from('case_participants').select('name,role,estamento,carrera').eq('case_id', c.id),
        sb.from('cronologia').select('event_date,title,description').eq('case_id', c.id).order('event_date',{ascending:true})
      ]);

      var result = await apiFetch('generate-vista', {
        caseId: c.id,
        caseData: c,
        diligencias: results[0].data || [],
        participants: results[1].data || [],
        chronology: results[2].data || [],
        mode: mode
      });

      if(result.error){
        el.innerHTML = '<div class="vf-ia-result" style="color:var(--red)">Error: ' + escH(result.error) + '</div>';
        return;
      }

      // Guardar en estado
      if (vfState.sections[sectionId]) {
        vfState.sections[sectionId].text = result.vista || '';
        vfState.sections[sectionId].modelsUsed = result.modelsUsed || [];
        vfState.sections[sectionId].usage = result.usage || null;
      }

      // Re-render pestaña actual
      if (tab) {
        var body = document.getElementById('vfTab_' + sectionId);
        if (body) body.innerHTML = buildVfTabContent(tab);
        updateVfTabIndicators();
      }

      if(typeof showToast==='function') showToast('✓ ' + escH(loadingLabel) + ' generada','success');

    } catch(err){
      el.innerHTML = '<div class="vf-ia-result" style="color:var(--red)">Error: ' + escH(err.message) + '</div>';
    }
  }

  /* ── Actualizar indicadores de estado en pestañas ── */
  function updateVfTabIndicators(){
    document.querySelectorAll('.vf-tab-btn').forEach(function(btn){
      var tabId = btn.dataset.vftab;
      if(!tabId) return;
      var hasTxt = vfState.sections[tabId] && vfState.sections[tabId].text;
      var dot = btn.querySelector('.vf-status-dot');
      if(hasTxt && !dot){
        var newDot = document.createElement('span');
        newDot.className = 'vf-status-dot done';
        newDot.style.marginRight = '4px';
        btn.insertBefore(newDot, btn.firstChild);
      }
    });
  }

  /* ── Copiar sección ── */
  function copySection(sectionId){
    var state = vfState.sections[sectionId];
    if(!state || !state.text){ if(typeof showToast==='function') showToast('No hay contenido para copiar','error'); return; }
    navigator.clipboard.writeText(state.text).then(function(){
      if(typeof showToast==='function') showToast('Sección copiada al portapapeles','success');
    });
  }

  /* ── Copiar vista unificada ── */
  function copyUnified(){
    var sectionOrder = ['vistos','hechos','sancion','sobreseimiento','estrategias','genero'];
    var texts = [];
    sectionOrder.forEach(function(sId){
      var st = vfState.sections[sId];
      if(!st.text) return;
      var tabDef = VF_TABS.find(function(t){ return t.id === sId; });
      if(tabDef) texts.push(st.text);
    });
    if(!texts.length){ if(typeof showToast==='function') showToast('No hay secciones generadas','error'); return; }
    navigator.clipboard.writeText(texts.join('\n\n')).then(function(){
      if(typeof showToast==='function') showToast('Vista unificada copiada','success');
    });
  }

  /* ── Enviar sección al chat ── */
  function sendSectionToChat(sectionId){
    var state = vfState.sections[sectionId];
    if(!state || !state.text) return;
    if(typeof showTab==='function') showTab('tabChat');
    var input = document.getElementById('chatInput') || document.getElementById('inputBox');
    if(input){
      input.value = 'Revisa y mejora esta sección de la vista fiscal:\n\n' + state.text.substring(0,3000);
      input.dispatchEvent(new Event('input'));
    }
  }

  /* ── Usar párrafo en sección ── */
  function useParrafoInSection(parrafoId, tabId){
    var PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    var p = PARRAFOS_DB_REF.find(function(x){ return x.id === parrafoId; });
    if(!p) return;
    var c = typeof currentCase !== 'undefined' ? currentCase : null;
    var inputBox = document.getElementById('inputBox') || document.getElementById('chatInput');
    if(inputBox){
      inputBox.value = 'Adapta el siguiente párrafo modelo al expediente' + (c ? ' ' + c.name : '') + '. Reemplaza los placeholders con los datos reales del caso:\n\n' + p.text;
      inputBox.dispatchEvent(new Event('input'));
    }
    if(typeof showTab==='function') showTab('tabChat');
    if(typeof showToast==='function') showToast('✓ Párrafo "' + p.label + '" enviado al chat');
  }

  /* ── Copiar texto de párrafo ── */
  function copyParrafoText(parrafoId){
    var PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    var p = PARRAFOS_DB_REF.find(function(x){ return x.id === parrafoId; });
    if(!p) return;
    navigator.clipboard.writeText(p.text).then(function(){
      if(typeof showToast==='function') showToast('✓ "' + p.label + '" copiado');
    });
  }

  /* ── Enviar párrafo al chat ── */
  function sendParrafoToChat(parrafoId){
    var PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    var p = PARRAFOS_DB_REF.find(function(x){ return x.id === parrafoId; });
    if(!p) return;
    var c = typeof currentCase !== 'undefined' ? currentCase : null;
    if(typeof showTab==='function') showTab('tabChat');
    var input = document.getElementById('chatInput') || document.getElementById('inputBox');
    if(input){
      input.value = 'Adapta este párrafo modelo para el expediente' + (c ? ' ' + c.name : '') + ':\n\n' + p.text;
      input.dispatchEvent(new Event('input'));
    }
    if(typeof showToast==='function') showToast('✓ Párrafo enviado al chat');
  }

  /* ══════════════════════════════════
     EXPONER API GLOBAL
     ══════════════════════════════════ */
  window._vf = {
    renderF7Panel: renderF7Panel,
    generateSection: generateSection,
    switchVfTab: switchVfTab,
    toggleVfParrafos: toggleVfParrafos,
    copySection: copySection,
    copyUnified: copyUnified,
    sendSectionToChat: sendSectionToChat,
    useParrafoInSection: useParrafoInSection,
    copyParrafoText: copyParrafoText,
    sendParrafoToChat: sendParrafoToChat
  };

  /* Exponer renderF7Panel globalmente para que showFnPanel la delegue */
  window.renderF7Panel = renderF7Panel;

})();
