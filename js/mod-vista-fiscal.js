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
    parrafosOpen: {},
    /* Nueva configuración — tipo de documento y modelo de referencia */
    docType: 'auto',        // 'auto' | 'vista_fiscal' | 'informe_investigadora'
    referenceModelId: '',   // UUID de caso terminado, o '' para auto-match
    referenceModelName: '', // Nombre/resolución del caso para mostrar
    terminadosLoaded: false,
    terminadosList: []      // [{id, name, nueva_resolucion, tipo_procedimiento, resultado}]
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

    // Barra de configuración (tipo de documento + caso de referencia)
    var configBarHtml = '<div id="vfConfigBar">' + buildVfConfigBarContent() + '</div>';

    // Sub-pestañas de la vista fiscal
    var vfHtml = configBarHtml + '<div class="vf-tabs-container">' +
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

  /* ══════════════════════════════════
     CASOS TERMINADOS — carga para picker de modelo
     ══════════════════════════════════ */
  async function loadTerminados(forceReload){
    if (vfState.terminadosLoaded && !forceReload) return vfState.terminadosList;
    try {
      if (typeof sb === 'undefined' || !sb) return [];
      var r = await sb.from('cases')
        .select('id,name,nueva_resolucion,tipo_procedimiento,protocolo,resultado,informe_final')
        .eq('categoria','terminado')
        .not('informe_final','is',null)
        .order('nueva_resolucion', {ascending:false})
        .limit(200);
      var list = (r && r.data) ? r.data.filter(function(c){ return c.informe_final && c.informe_final.length > 500; }) : [];
      vfState.terminadosList = list;
      vfState.terminadosLoaded = true;
      return list;
    } catch(e){
      console.warn('[VF] loadTerminados:', e);
      vfState.terminadosList = [];
      vfState.terminadosLoaded = true;
      return [];
    }
  }

  /* ── Cambiar tipo de documento (Vista Fiscal / Informe / Auto) ── */
  function setDocType(dt){
    if (['auto','vista_fiscal','informe_investigadora'].indexOf(dt) === -1) return;
    vfState.docType = dt;
    // Re-render header para reflejar la selección
    var cfgBar = document.getElementById('vfConfigBar');
    if (cfgBar) cfgBar.innerHTML = buildVfConfigBarContent();
  }

  /* ── Seleccionar caso de referencia ── */
  function setReferenceModel(caseId, caseName){
    vfState.referenceModelId = caseId || '';
    vfState.referenceModelName = caseName || '';
    var cfgBar = document.getElementById('vfConfigBar');
    if (cfgBar) cfgBar.innerHTML = buildVfConfigBarContent();
  }

  /* ── Mostrar picker de modelo de referencia ── */
  async function openReferenceModelPicker(){
    var pickerBox = document.getElementById('vfRefPicker');
    if (!pickerBox) return;
    pickerBox.style.display = 'block';
    pickerBox.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--text-muted)">Cargando casos terminados…</div>';
    var list = await loadTerminados(false);
    if (!list.length){
      pickerBox.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--text-muted)">No hay casos terminados con informe final disponible.</div>';
      return;
    }
    var html = '<div style="padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);max-height:260px;overflow-y:auto">';
    html += '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">';
    html += '<input id="vfRefFilter" type="text" placeholder="🔍 Filtrar por nombre, rol, tipo..." oninput="window._vf._filterRefList()" style="flex:1;padding:4px 8px;font-size:11px;background:var(--surface);border:1px solid var(--border);border-radius:3px;color:var(--text);font-family:var(--font-body)">';
    html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.closeReferenceModelPicker()" style="padding:4px 8px;font-size:10px">✕</button>';
    html += '</div>';
    html += '<div id="vfRefList">';
    html += '<div class="vf-ref-item" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px" onclick="window._vf.setReferenceModel(\'\',\'\');window._vf.closeReferenceModelPicker()">';
    html += '<strong style="color:var(--gold)">↻ Auto (match automático)</strong>';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">El sistema buscará el mejor modelo similar al caso actual.</div>';
    html += '</div>';
    list.forEach(function(cs){
      var nm = escH(cs.name || cs.nueva_resolucion || cs.id);
      var res = escH(cs.nueva_resolucion || '');
      var tp = escH(cs.tipo_procedimiento || '—');
      var prot = escH(cs.protocolo || '');
      var rs = escH(cs.resultado || '');
      var searchKey = (cs.name + ' ' + cs.nueva_resolucion + ' ' + cs.tipo_procedimiento + ' ' + cs.protocolo + ' ' + cs.resultado).toLowerCase();
      html += '<div class="vf-ref-item" data-search="' + escH(searchKey) + '" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px" onclick="window._vf.setReferenceModel(\'' + escH(cs.id) + '\',\'' + nm + '\');window._vf.closeReferenceModelPicker()">';
      html += '<div><strong>' + nm + '</strong>' + (res ? ' · <span style="color:var(--gold)">' + res + '</span>' : '') + '</div>';
      html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + tp + (prot ? ' / ' + prot : '') + (rs ? ' — ' + rs : '') + '</div>';
      html += '</div>';
    });
    html += '</div></div>';
    pickerBox.innerHTML = html;
  }

  function closeReferenceModelPicker(){
    var pickerBox = document.getElementById('vfRefPicker');
    if (pickerBox){ pickerBox.style.display = 'none'; pickerBox.innerHTML = ''; }
  }

  function _filterRefList(){
    var q = (document.getElementById('vfRefFilter') || {}).value || '';
    q = q.toLowerCase().trim();
    var items = document.querySelectorAll('#vfRefList .vf-ref-item');
    items.forEach(function(el){
      var key = el.getAttribute('data-search') || '';
      var firstItem = !el.hasAttribute('data-search'); // "Auto" no tiene search
      if (!q || firstItem || key.indexOf(q) !== -1){ el.style.display = ''; }
      else { el.style.display = 'none'; }
    });
  }

  /* ── Contenido de la barra de configuración (tipo + modelo) ── */
  function buildVfConfigBarContent(){
    var dtLabel = vfState.docType === 'vista_fiscal' ? 'Vista Fiscal (Sumario Administrativo)'
      : vfState.docType === 'informe_investigadora' ? 'Informe de la Investigadora (Investigación Sumaria)'
      : 'Auto (según tipo del expediente)';
    var dtColor = vfState.docType === 'auto' ? 'var(--text-dim)' : 'var(--gold)';

    var refLabel = vfState.referenceModelId
      ? escH(vfState.referenceModelName || 'Caso seleccionado')
      : 'Auto (match automático)';
    var refColor = vfState.referenceModelId ? 'var(--gold)' : 'var(--text-dim)';

    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);margin:10px 0;font-size:11px">';

    /* Tipo de documento */
    html += '<div>';
    html += '<label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">📝 Tipo de documento</label>';
    html += '<select onchange="window._vf.setDocType(this.value)" style="width:100%;padding:5px 8px;font-size:11px;background:var(--surface);border:1px solid var(--border);border-radius:3px;color:var(--text);font-family:var(--font-body)">';
    html += '<option value="auto"' + (vfState.docType==='auto'?' selected':'') + '>Auto — detectar por tipo del caso</option>';
    html += '<option value="vista_fiscal"' + (vfState.docType==='vista_fiscal'?' selected':'') + '>Vista Fiscal (Sumario Administrativo)</option>';
    html += '<option value="informe_investigadora"' + (vfState.docType==='informe_investigadora'?' selected':'') + '>Informe de la Investigadora (Investigación Sumaria)</option>';
    html += '</select>';
    html += '<div style="font-size:9.5px;color:' + dtColor + ';margin-top:4px">Actual: <strong>' + escH(dtLabel) + '</strong></div>';
    html += '</div>';

    /* Modelo de referencia */
    html += '<div>';
    html += '<label style="display:block;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">📚 Caso de referencia</label>';
    html += '<div style="display:flex;gap:4px">';
    html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.openReferenceModelPicker()" style="flex:1;padding:5px 8px;font-size:11px;text-align:left">';
    html += (vfState.referenceModelId ? '📌 ' : '🔍 ') + escH((vfState.referenceModelName && vfState.referenceModelName.length > 30) ? vfState.referenceModelName.slice(0,30)+'…' : (vfState.referenceModelName || 'Elegir caso terminado…'));
    html += '</button>';
    if (vfState.referenceModelId){
      html += '<button class="vf-ia-btn vf-ia-btn-secondary" onclick="window._vf.setReferenceModel(\'\',\'\')" title="Limpiar selección" style="padding:5px 8px;font-size:11px">✕</button>';
    }
    html += '</div>';
    html += '<div style="font-size:9.5px;color:' + refColor + ';margin-top:4px">Actual: <strong>' + refLabel + '</strong></div>';
    html += '</div>';

    html += '</div>';
    /* Contenedor del picker (se rellena al abrir) */
    html += '<div id="vfRefPicker" style="display:none;margin-top:-4px;margin-bottom:10px"></div>';
    return html;
  }

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

  /* ── SSE stream reader — parsea events de generate-vista-stream ── */
  async function _readVistaStream(response, onProgress){
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var accumulated = '';
    var meta = {};
    var currentEvent = '';

    while(true){
      var chunk = await reader.read();
      if(chunk.done) break;

      buffer += decoder.decode(chunk.value, {stream:true});
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for(var i=0; i<lines.length; i++){
        var line = lines[i];
        if(line.indexOf('event: ')===0){
          currentEvent = line.substring(7).trim();
        } else if(line.indexOf('data: ')===0){
          var dataStr = line.substring(6);
          if(currentEvent==='meta'){
            try{ meta=JSON.parse(dataStr); }catch(e){}
          } else {
            try{
              var parsed=JSON.parse(dataStr);
              if(parsed.type==='content_block_delta' && parsed.delta && parsed.delta.type==='text_delta'){
                accumulated += parsed.delta.text;
                if(onProgress) onProgress(accumulated);
              }
            }catch(e){/* ignore non-JSON */}
          }
          currentEvent='';
        }
      }
    }
    return { text: accumulated, meta: meta };
  }

  /* ── Generar sección con STREAMING (replica Lovable v1) ── */
  async function generateSection(sectionId){
    var c = typeof currentCase !== 'undefined' ? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }

    var tab = VF_TABS.find(function(t){ return t.id === sectionId; });
    var mode = tab ? tab.mode : sectionId;

    var el = document.getElementById('vfResult_' + sectionId);
    if(!el) return;

    var isFullDoc = (mode === 'informe' || mode === 'hechos');
    var loadingLabel = tab ? tab.label : 'sección';
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="vf-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Generando ' + escH(loadingLabel) + '… (streaming activo, puede tomar 1-3 min)<br><span id="vfProgress_' + sectionId + '" style="font-size:10px">Buscando modelos de expedientes terminados similares…</span></div>';

    try {
      var diligenciaFields = isFullDoc
        ? 'diligencia_label,file_name,fecha_diligencia,ai_summary,extracted_text,fojas'
        : 'diligencia_label,file_name,fecha_diligencia,ai_summary';

      var results = await Promise.all([
        sb.from('diligencias').select(diligenciaFields).eq('case_id', c.id).order('fecha_diligencia',{ascending:true}),
        sb.from('case_participants').select('name,role,estamento,carrera').eq('case_id', c.id),
        sb.from('cronologia').select('event_date,event_type,description').eq('case_id', c.id).order('event_date',{ascending:true})
      ]);

      var progressEl = document.getElementById('vfProgress_' + sectionId);

      /* ── Llamada STREAMING a generate-vista-stream (ESM) ── */
      var token = getAuthToken();
      var res = await fetch(API_BASE + '/generate-vista-stream', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          caseId: c.id,
          caseData: c,
          diligencias: results[0].data || [],
          participants: results[1].data || [],
          chronology: (results[2].data || []).map(function(cr){
            return { event_date: cr.event_date, title: cr.event_type || cr.description || '', description: cr.description || '' };
          }),
          mode: mode,
          /* Nuevos parámetros: tipo de documento y modelo de referencia prioritario */
          docType: vfState.docType || 'auto',
          referenceModelId: vfState.referenceModelId || ''
        })
      });

      if(!res.ok){
        var errText = '';
        try { errText = await res.text(); } catch(e){}
        var errMsg = 'HTTP ' + res.status;
        try { var ej=JSON.parse(errText); errMsg += ' — ' + (ej.error||ej.message||errText); } catch(e){ errMsg += ' — ' + (errText||'sin detalle'); }
        throw new Error(errMsg);
      }

      /* ── Leer stream SSE con progreso visual ── */
      var streamResult = await _readVistaStream(res, function(partial){
        if(progressEl){
          var kb = (partial.length/1024).toFixed(1);
          progressEl.textContent = 'Recibiendo… ' + kb + ' KB generados';
        }
      });

      var vistaText = streamResult.text || '';
      var vistaModels = (streamResult.meta && streamResult.meta.modelsUsed) || [];

      if(!vistaText || vistaText.length < 30){
        throw new Error('No se generó contenido (respuesta vacía)');
      }

      // Guardar en estado
      if (vfState.sections[sectionId]) {
        vfState.sections[sectionId].text = vistaText;
        vfState.sections[sectionId].modelsUsed = vistaModels;
        vfState.sections[sectionId].usage = null;
      }

      // Re-render pestaña actual
      if (tab) {
        var body = document.getElementById('vfTab_' + sectionId);
        if (body) body.innerHTML = buildVfTabContent(tab);
        updateVfTabIndicators();
      }

      console.log('Vista fiscal [' + mode + '] generada:', vistaText.length, 'chars, modelos:', vistaModels);
      if(typeof showToast==='function') showToast('✓ ' + escH(loadingLabel) + ' generada','success');

    } catch(err){
      console.error('generateSection error [' + mode + ']:', err);
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
    }).catch(function(){
      if(typeof showToast==='function') showToast('No se pudo copiar (permiso denegado)','error');
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
    }).catch(function(){
      if(typeof showToast==='function') showToast('No se pudo copiar (permiso denegado)','error');
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
    }).catch(function(){
      if(typeof showToast==='function') showToast('⚠️ No se pudo copiar (permiso denegado)');
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
    sendParrafoToChat: sendParrafoToChat,
    /* Nuevas funciones: tipo de documento y modelo de referencia */
    setDocType: setDocType,
    setReferenceModel: setReferenceModel,
    openReferenceModelPicker: openReferenceModelPicker,
    closeReferenceModelPicker: closeReferenceModelPicker,
    _filterRefList: _filterRefList,
    loadTerminados: loadTerminados
  };

  /* Exponer renderF7Panel globalmente para que showFnPanel la delegue */
  window.renderF7Panel = renderF7Panel;

})();
