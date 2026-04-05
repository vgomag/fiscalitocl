/**
 * MOD-INTELIGENCIA.JS — Panel de Inteligencia IA
 * ────────────────────────────────────────────────
 * Integra las 4 Netlify Functions de IA en la UI del caso:
 *   1. Auto-avance de etapas (auto-advance)
 *   2. Generación de vista fiscal (generate-vista)
 *   3. OCR en lote (ocr-batch)
 *   4. Análisis de prescripción (analyze-prescription)
 *
 * Añade una pestaña "🤖 IA" al detalle del caso con sub-paneles.
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-inteligencia';
  const TAB_ID = 'tabInteligencia';
  const API_BASE = '/.netlify/functions';

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function getAuthToken(){
    try { return typeof session!=='undefined' && session?.access_token ? session.access_token : ''; }
    catch{ return ''; }
  }

  async function apiFetch(fn, body){
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-auth-token': token },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const style = document.createElement('style');
    style.id = MOD_ID+'-css';
    style.textContent = `
      #${TAB_ID} { padding: 16px; }
      .ia-section { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:14px; }
      .ia-section h3 { font-family:var(--font-serif); font-size:15px; font-weight:600; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
      .ia-section p.desc { font-size:11.5px; color:var(--text-dim); margin:0 0 12px; line-height:1.5; }
      .ia-btn { background:var(--gold); color:#fff; border:none; padding:8px 16px; border-radius:var(--radius); font-size:12px; font-family:var(--font-body); cursor:pointer; transition:opacity .15s; display:inline-flex; align-items:center; gap:6px; }
      .ia-btn:hover { opacity:.85; }
      .ia-btn:disabled { opacity:.5; cursor:not-allowed; }
      .ia-btn-secondary { background:transparent; color:var(--gold); border:1px solid var(--gold); }
      .ia-result { margin-top:12px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); font-size:12px; line-height:1.6; max-height:400px; overflow-y:auto; white-space:pre-wrap; }
      .ia-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
      .ia-badge.ok { background:rgba(34,197,94,.12); color:#16a34a; }
      .ia-badge.warning { background:rgba(245,158,11,.12); color:#d97706; }
      .ia-badge.critical { background:rgba(239,68,68,.12); color:#dc2626; }
      .ia-badge.expired { background:rgba(239,68,68,.25); color:#991b1b; }
      .ia-timeline-bar { height:8px; border-radius:4px; background:var(--border); overflow:hidden; margin:6px 0; }
      .ia-timeline-fill { height:100%; border-radius:4px; transition:width .3s; }
      .ia-alert-item { padding:8px 10px; border-radius:6px; font-size:11.5px; margin-bottom:6px; line-height:1.5; }
      .ia-alert-item.critical { background:rgba(239,68,68,.08); border-left:3px solid #dc2626; }
      .ia-alert-item.warning { background:rgba(245,158,11,.08); border-left:3px solid #d97706; }
      .ia-alert-item.info { background:rgba(59,130,246,.08); border-left:3px solid #3b82f6; }
      .ia-spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:ia-spin .6s linear infinite; }
      @keyframes ia-spin { to { transform:rotate(360deg); } }
      .ia-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      @media(max-width:768px){ .ia-grid { grid-template-columns:1fr; } }
      .ia-select { background:var(--surface2); border:1px solid var(--border2); color:var(--text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:var(--font-body); }

      /* ── Sub-pestañas Vista Fiscal ── */
      .vf-tabs-container { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:14px; overflow:hidden; }
      .vf-tabs-header { display:flex; border-bottom:1px solid var(--border); overflow-x:auto; padding:0; background:var(--surface); }
      .vf-tabs-header::-webkit-scrollbar { height:3px; }
      .vf-tabs-header::-webkit-scrollbar-thumb { background:var(--border2); border-radius:3px; }
      .vf-tab-btn { padding:10px 14px; font-size:11px; font-family:var(--font-body); cursor:pointer; border:none; background:transparent; color:var(--text-dim); border-bottom:2px solid transparent; white-space:nowrap; transition:all .15s; flex-shrink:0; }
      .vf-tab-btn:hover { color:var(--text); background:rgba(255,255,255,.03); }
      .vf-tab-btn.active { color:var(--gold); border-bottom-color:var(--gold); font-weight:600; }
      .vf-tab-body { padding:16px; display:none; }
      .vf-tab-body.active { display:block; }
      .vf-section-desc { font-size:11.5px; color:var(--text-dim); line-height:1.6; margin-bottom:14px; padding:10px 12px; background:var(--bg); border-radius:var(--radius); border-left:3px solid var(--gold); }
      .vf-gen-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
      .vf-parrafos-toggle { margin-top:14px; border-top:1px solid var(--border); padding-top:12px; }
      .vf-parrafos-toggle-btn { display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 12px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); cursor:pointer; font-size:11.5px; color:var(--text-dim); font-family:var(--font-body); transition:all .15s; }
      .vf-parrafos-toggle-btn:hover { border-color:var(--gold-dim); color:var(--text); }
      .vf-parrafos-list { margin-top:8px; }
      .vf-parr-item { background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); padding:8px 10px; margin-bottom:5px; cursor:pointer; transition:all .12s; }
      .vf-parr-item:hover { border-color:var(--gold-dim); }
      .vf-parr-item.selected { background:var(--gold-glow); border-color:var(--gold-dim); }
      .vf-parr-label { font-size:11.5px; font-weight:500; color:var(--text); margin-bottom:3px; }
      .vf-parr-preview { font-size:10px; color:var(--text-muted); line-height:1.4; }
      .vf-unified-section { margin-top:12px; }
      .vf-unified-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
      .vf-section-tag { display:inline-block; padding:2px 8px; border-radius:10px; font-size:9px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-right:6px; }
      .vf-status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
      .vf-status-dot.empty { background:var(--border2); }
      .vf-status-dot.done { background:#16a34a; }
      .vf-status-dot.loading { background:var(--gold); animation:ia-spin 1s linear infinite; }
    `;
    document.head.appendChild(style);
  }

  /* ── Inyectar pestaña en caseTabs ── */
  function injectTab(){
    const tabs = document.getElementById('caseTabs');
    if(!tabs || tabs.querySelector(`[data-tab="${TAB_ID}"]`)) return;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = TAB_ID;
    tab.textContent = '🤖 IA';
    tab.onclick = function(){ if(typeof showTab==='function') showTab(TAB_ID); };
    tabs.appendChild(tab);
  }

  /* ── Inyectar contenedor de contenido ── */
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

  /* ── Estado de las secciones de vista fiscal ── */
  const vfState = {
    activeTab: 'completa',
    sections: {
      completa: { text: '', modelsUsed: [], usage: null },
      vistos: { text: '', modelsUsed: [], usage: null },
      hechos: { text: '', modelsUsed: [], usage: null },
      sancion: { text: '', modelsUsed: [], usage: null },
      sobreseimiento: { text: '', modelsUsed: [], usage: null },
      estrategias: { text: '', modelsUsed: [], usage: null },
      genero: { text: '', modelsUsed: [], usage: null },
      art129: { text: '', modelsUsed: [], usage: null }
    },
    parrafosOpen: {}
  };

  /* ── Definición de las sub-pestañas ── */
  const VF_TABS = [
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

  /* ── Mapeo de categorías de párrafos a colores ── */
  const PARR_CAT_COLORS = {
    antecedentes:'#4f46e5', hechos:'#059669', valoracion:'#0891b2', analisis:'#7c3aed',
    sancion:'#dc2626', sobreseimiento:'#ca8a04', por_tanto:'#1d4ed8', genero:'#be185d', eximentes:'#15803d'
  };
  const PARR_CAT_LABELS = {
    antecedentes:'Antecedentes procesales', hechos:'Hechos acreditados', valoracion:'Valoración de la prueba',
    analisis:'Análisis jurídico', sancion:'Propuesta de sanción', sobreseimiento:'Sobreseimiento',
    por_tanto:'Por Tanto', genero:'Perspectiva de género', eximentes:'Eximentes y atenuantes'
  };

  /* ── Construir párrafos filtrados para una pestaña ── */
  function buildFilteredParrafos(tabId, parrafosCats) {
    if (!parrafosCats || !parrafosCats.length) return '';
    const PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    const filteredParrs = PARRAFOS_DB_REF.filter(function(p){ return parrafosCats.indexOf(p.cat) !== -1; });
    if (!filteredParrs.length) return '';

    const isOpen = vfState.parrafosOpen[tabId] || false;
    let html = '<div class="vf-parrafos-toggle">';
    html += '<button class="vf-parrafos-toggle-btn" onclick="window._ia.toggleVfParrafos(\'' + tabId + '\')">';
    html += '<span>📝 Párrafos modelo (' + filteredParrs.length + ' disponibles)</span>';
    html += '<span style="font-size:10px;color:var(--gold)">' + (isOpen ? 'Ocultar ↑' : 'Ver párrafos →') + '</span>';
    html += '</button>';

    if (isOpen) {
      html += '<div class="vf-parrafos-list">';
      // Agrupar por categoría
      parrafosCats.forEach(function(catId) {
        var catParrs = filteredParrs.filter(function(p){ return p.cat === catId; });
        if (!catParrs.length) return;
        var color = PARR_CAT_COLORS[catId] || '#888';
        var label = PARR_CAT_LABELS[catId] || catId;
        html += '<div style="margin-top:8px;margin-bottom:4px">';
        html += '<div style="font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:' + color + ';border-bottom:2px solid ' + color + ';padding-bottom:2px;margin-bottom:6px;font-family:\'DM Mono\',monospace">' + label + '</div>';
        catParrs.forEach(function(p) {
          html += '<div class="vf-parr-item" onclick="window._ia.useParrafoInSection(\'' + p.id + '\',\'' + tabId + '\')">';
          html += '<div style="display:flex;justify-content:space-between;align-items:center">';
          html += '<div class="vf-parr-label">' + escH(p.label) + '</div>';
          html += '<div style="display:flex;gap:4px">';
          html += '<button class="ia-btn ia-btn-secondary" style="padding:2px 8px;font-size:10px" onclick="event.stopPropagation();window._ia.copyParrafoText(\'' + p.id + '\')">📋</button>';
          html += '<button class="ia-btn ia-btn-secondary" style="padding:2px 8px;font-size:10px" onclick="event.stopPropagation();window._ia.sendParrafoToChat(\'' + p.id + '\')">💬</button>';
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

  /* ── Construir contenido de una sub-pestaña ── */
  function buildVfTabContent(tab) {
    var state = vfState.sections[tab.id];
    var html = '';

    // Descripción de la sección
    html += '<div class="vf-section-desc">' + tab.icon + ' ' + escH(tab.desc) + '</div>';

    // Barra de generación
    html += '<div class="vf-gen-bar">';
    html += '<button class="ia-btn" onclick="window._ia.generateSection(\'' + tab.id + '\')">';
    html += (tab.id === 'completa' ? '📄 Generar vista completa' : '✨ Generar esta sección');
    html += '</button>';
    if (state.text) {
      html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.generateSection(\'' + tab.id + '\')" style="margin-left:4px">🔄 Regenerar</button>';
      html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.copySection(\'' + tab.id + '\')" style="margin-left:4px">📋 Copiar</button>';
      html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.sendSectionToChat(\'' + tab.id + '\')" style="margin-left:4px">💬 Chat</button>';
    }
    html += '</div>';

    // Resultado
    html += '<div id="iaVfResult_' + tab.id + '">';
    if (state.text) {
      html += '<div class="ia-result">';
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
        html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.copyUnified()" style="padding:4px 10px;font-size:10px">📋 Copiar todo</button>';
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
        html += '<div class="ia-result" style="max-height:600px">';
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

  /* ── Render principal del panel IA ── */
  function renderPanel(){
    const el = document.getElementById(TAB_ID);
    if(!el) return;
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">Seleccione un caso</div>'; return; }

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <h2 style="font-family:var(--font-serif);font-size:18px;margin:0 0 4px">🤖 Panel de Inteligencia</h2>
        <p style="font-size:11.5px;color:var(--text-muted);margin:0">Herramientas de IA para el expediente <strong>${escH(c.name||'')}</strong></p>
      </div>

      <div class="ia-grid">
        <!-- 1. Prescripción -->
        <div class="ia-section" id="iaSecPrescripcion">
          <h3>⏰ Prescripción</h3>
          <p class="desc">Analiza los plazos de prescripción según Arts. 152-153 del Estatuto Administrativo y normativa aplicable.</p>
          <button class="ia-btn" onclick="window._ia.analyzePrescription()">Analizar plazos</button>
          <button class="ia-btn ia-btn-secondary" onclick="window._ia.analyzePrescription(true)" style="margin-left:6px">+ Recomendación IA</button>
          <div id="iaPrescripcionResult"></div>
        </div>

        <!-- 2. Auto-avance -->
        <div class="ia-section" id="iaSecAutoAdvance">
          <h3>📊 Auto-avance de etapa</h3>
          <p class="desc">Analiza las diligencias del caso y sugiere en qué etapa procesal se encuentra.</p>
          <button class="ia-btn" onclick="window._ia.analyzeStage()">Analizar etapa</button>
          <div id="iaAutoAdvanceResult"></div>
        </div>

        <!-- 3. OCR en lote (movido de posición 4 a 3) -->
        <div class="ia-section">
          <h3>🔍 OCR / Extracción de Texto</h3>
          <p class="desc">Extrae texto de las diligencias mediante OCR con Claude Vision.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="ia-btn" onclick="window._ia.runOcrBatch()">OCR este caso</button>
            <button class="ia-btn ia-btn-secondary" onclick="window._ia.runOcrMasivo()">🚀 OCR masivo (todos los casos)</button>
          </div>
          <div id="iaOcrResult"></div>
        </div>

        <!-- 4. Medida cautelar Art. 129 -->
        <div class="ia-section">
          <h3>🚨 Medida Cautelar (Art. 129)</h3>
          <p class="desc">Genera solicitud de medida cautelar: suspensión preventiva, cambio de funciones u otra medida urgente.</p>
          <button class="ia-btn" onclick="window._ia.generateSection('art129')">Generar solicitud</button>
          <div id="iaVfResult_art129"></div>
        </div>
      </div>

      <!-- ═══ VISTA FISCAL: Sistema de sub-pestañas ═══ -->
      <div class="vf-tabs-container" id="iaVistaFiscalPanel">
        <div style="padding:12px 16px 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h3 style="font-family:var(--font-serif);font-size:15px;font-weight:600;margin:0 0 4px;display:flex;align-items:center;gap:8px">📝 Vista Fiscal / Informe de la Investigadora</h3>
            <p style="font-size:11px;color:var(--text-dim);margin:0 0 8px">Desarrolla cada sección de la vista fiscal por separado consultando modelos de expedientes terminados similares (${escH(c.tipo_procedimiento||'—')} / ${escH(c.protocolo||'—')})</p>
          </div>
        </div>
        <div class="vf-tabs-header" id="iaVfTabsHeader">
          ${VF_TABS.map(function(t){
            var isDone = vfState.sections[t.id] && vfState.sections[t.id].text;
            return '<button class="vf-tab-btn ' + (vfState.activeTab === t.id ? 'active' : '') + '" data-vftab="' + t.id + '" onclick="window._ia.switchVfTab(\'' + t.id + '\')">' +
              (isDone ? '<span class="vf-status-dot done" style="margin-right:4px"></span>' : '') +
              t.icon + ' ' + escH(t.label) + '</button>';
          }).join('')}
        </div>
        ${VF_TABS.map(function(t){
          return '<div class="vf-tab-body ' + (vfState.activeTab === t.id ? 'active' : '') + '" id="iaVfTab_' + t.id + '">' +
            buildVfTabContent(t) + '</div>';
        }).join('')}
      </div>
    `;
  }

  /* ── Cambiar sub-pestaña ── */
  function switchVfTab(tabId) {
    vfState.activeTab = tabId;
    // Toggle active class on buttons
    document.querySelectorAll('.vf-tab-btn').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.vftab === tabId);
    });
    // Toggle active class on bodies
    VF_TABS.forEach(function(t){
      var body = document.getElementById('iaVfTab_' + t.id);
      if(body) body.classList.toggle('active', t.id === tabId);
    });
  }

  /* ── Toggle párrafos dentro de pestaña ── */
  function toggleVfParrafos(tabId) {
    vfState.parrafosOpen[tabId] = !vfState.parrafosOpen[tabId];
    // Re-render only the tab content
    var tab = VF_TABS.find(function(t){ return t.id === tabId; });
    var body = document.getElementById('iaVfTab_' + tabId);
    if (tab && body) body.innerHTML = buildVfTabContent(tab);
  }

  /* ── Generar sección ── */
  async function generateSection(sectionId){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }

    // Determinar el modo del backend
    var tab = VF_TABS.find(function(t){ return t.id === sectionId; });
    var mode = tab ? tab.mode : sectionId; // 'art129' no tiene tab, usa sectionId directo

    var el = document.getElementById('iaVfResult_' + sectionId);
    if(!el) return;

    var isFullDoc = (mode === 'informe' || mode === 'hechos');
    var loadingLabel = tab ? tab.label : 'sección';
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Generando ' + escH(loadingLabel) + '… (esto puede tomar hasta ' + (isFullDoc ? '2 minutos' : '1 minuto') + ')<br><span style="font-size:10px">Buscando automáticamente modelos de expedientes terminados similares</span></div>';

    try {
      // Determinar campos de diligencias según modo
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
        el.innerHTML = '<div class="ia-result" style="color:var(--red)">Error: ' + escH(result.error) + '</div>';
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
        var body = document.getElementById('iaVfTab_' + sectionId);
        if (body) body.innerHTML = buildVfTabContent(tab);
        // Actualizar indicadores en los botones de pestañas
        updateVfTabIndicators();
      } else {
        // Para art129 que no tiene tab
        var html = '<div class="ia-result">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<span style="font-weight:600">Medida Cautelar Art. 129</span>';
        html += '<div style="display:flex;gap:6px">';
        html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.copySection(\'art129\')" style="padding:4px 10px;font-size:11px">📋 Copiar</button>';
        html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.sendSectionToChat(\'art129\')" style="padding:4px 10px;font-size:11px">💬 Chat</button>';
        html += '</div></div>';
        html += '<div style="white-space:pre-wrap">' + escH(result.vista||'') + '</div>';
        if(result.usage) html += '<div style="margin-top:8px;font-size:10px;color:var(--text-muted);text-align:right">Tokens: '+(result.usage.inputTokens||0)+' in / '+(result.usage.outputTokens||0)+' out</div>';
        html += '</div>';
        el.innerHTML = html;
      }

      if(typeof showToast==='function') showToast('✓ ' + escH(loadingLabel) + ' generada','success');

    } catch(err){
      el.innerHTML = '<div class="ia-result" style="color:var(--red)">Error: ' + escH(err.message) + '</div>';
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
    var input = document.getElementById('chatInput');
    if(input){
      input.value = 'Revisa y mejora esta sección de la vista fiscal:\n\n' + state.text.substring(0,3000);
      input.dispatchEvent(new Event('input'));
    }
  }

  /* ── Usar párrafo en sección (insertar en chat con contexto) ── */
  function useParrafoInSection(parrafoId, tabId){
    var PARRAFOS_DB_REF = typeof PARRAFOS_DB !== 'undefined' ? PARRAFOS_DB : [];
    var p = PARRAFOS_DB_REF.find(function(x){ return x.id === parrafoId; });
    if(!p) return;
    var c = typeof currentCase!=='undefined'? currentCase : null;
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
    var c = typeof currentCase!=='undefined'? currentCase : null;
    if(typeof showTab==='function') showTab('tabChat');
    var input = document.getElementById('chatInput') || document.getElementById('inputBox');
    if(input){
      input.value = 'Adapta este párrafo modelo para el expediente' + (c ? ' ' + c.name : '') + ':\n\n' + p.text;
      input.dispatchEvent(new Event('input'));
    }
    if(typeof showToast==='function') showToast('✓ Párrafo enviado al chat');
  }

  /* ── Hook showTab para renderizar al activar ── */
  const _origShowTab = window.showTab;
  window.showTab = function(tabId){
    if(typeof _origShowTab==='function') _origShowTab(tabId);
    if(tabId===TAB_ID) renderPanel();
  };

  /* ── API: Análisis de prescripción ── */
  async function analyzePrescription(includeAI){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaPrescripcionResult');
    if(!el) return;
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Analizando plazos…</div>';

    try {
      // Cargar etapas del caso
      let etapas = [];
      try {
        const { data } = await sb.from('etapas').select('*').eq('case_id', c.id).order('started_at',{ascending:true});
        if(data) etapas = data;
      } catch(e){}

      const result = await apiFetch('analyze-prescription', {
        caseId: c.id,
        caseData: c,
        etapas,
        includeAI: !!includeAI
      });

      let html = `<div class="ia-result" style="white-space:normal">`;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="ia-badge ${result.riskLevel||'ok'}">${({ok:'Sin riesgo',warning:'Atención',critical:'Crítico',expired:'Prescrito'})[result.riskLevel]||result.riskLevel}</span>
        <span style="font-size:11px;color:var(--text-muted)">${escH(result.normativa||'')}</span>
      </div>`;

      // Timeline bars
      if(result.timeline && result.timeline.length){
        result.timeline.forEach(function(t){
          const pct = t.porcentaje||0;
          const color = pct>=90?'#dc2626':pct>=70?'#d97706':'#16a34a';
          const restantes = t.diasRestantes!=null? t.diasRestantes : (t.diasHabilesRestantes!=null? t.diasHabilesRestantes+' háb.' : '?');
          html += `<div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:500;margin-bottom:2px">${escH(t.label)}</div>
            <div class="ia-timeline-bar"><div class="ia-timeline-fill" style="width:${pct}%;background:${color}"></div></div>
            <div style="font-size:10px;color:var(--text-muted);display:flex;justify-content:space-between">
              <span>Inicio: ${escH(t.fechaInicio||'?')}</span>
              <span>${pct}% — ${restantes} días restantes</span>
            </div>
          </div>`;
        });
      }

      // Alerts
      if(result.alerts && result.alerts.length){
        html += '<div style="margin-top:8px">';
        result.alerts.forEach(function(a){
          html += `<div class="ia-alert-item ${a.severity||'info'}">${escH(a.message)}</div>`;
        });
        html += '</div>';
      }

      // AI Recommendation
      if(result.aiRecommendation){
        html += `<div style="margin-top:12px;padding:10px;background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.15);border-radius:6px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);margin-bottom:6px;font-weight:600">Recomendación IA</div>
          <div style="font-size:12px;line-height:1.6;white-space:pre-wrap">${escH(result.aiRecommendation)}</div>
        </div>`;
      }

      html += '</div>';
      el.innerHTML = html;
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── API: Auto-avance de etapa ── */
  async function analyzeStage(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaAutoAdvanceResult');
    if(!el) return;
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Analizando diligencias…</div>';

    try {
      // Cargar diligencias
      let diligencias = [];
      try {
        const { data } = await sb.from('diligencias').select('id,file_name,diligencia_label,ai_summary,extracted_text,fecha_diligencia').eq('case_id', c.id);
        if(data) diligencias = data;
      } catch(e){}

      if(!diligencias.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">No hay diligencias con texto extraído para analizar. Ejecute OCR primero.</div>';
        return;
      }

      const result = await apiFetch('auto-advance', {
        caseId: c.id,
        action: 'analyze',
        diligencias
      });

      const STAGE_LABELS = {indagatoria:'Indagatoria',cargos:'Cargos',descargos:'Descargos',prueba:'Prueba',vista:'Vista Fiscal',resolucion:'Resolución',cerrado:'Cerrado'};
      const STAGE_ICONS = {indagatoria:'🔍',cargos:'📋',descargos:'📝',prueba:'⚖️',vista:'📄',resolucion:'✅',cerrado:'🔒'};

      let html = '<div class="ia-result" style="white-space:normal">';
      if(result.suggestedStage){
        const stg = result.suggestedStage;
        html += `<div style="text-align:center;padding:10px 0">
          <div style="font-size:24px;margin-bottom:6px">${STAGE_ICONS[stg]||'📊'}</div>
          <div style="font-size:14px;font-weight:600">${escH(STAGE_LABELS[stg]||stg)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Etapa sugerida según análisis de documentos</div>
        </div>`;

        if(result.aiSuggestion){
          html += `<div style="margin-top:8px;padding:8px;background:rgba(79,70,229,.05);border-radius:6px;font-size:11.5px">
            <strong>IA:</strong> ${escH(result.aiSuggestion.reason||'')}
            <span class="ia-badge ${result.aiSuggestion.confidence==='alta'?'ok':result.aiSuggestion.confidence==='media'?'warning':'critical'}" style="margin-left:6px">${escH(result.aiSuggestion.confidence||'')}</span>
          </div>`;
        }

        if(result.metadata && Object.keys(result.metadata).length){
          html += '<div style="margin-top:10px;font-size:11px"><strong>Metadata detectada:</strong><ul style="margin:4px 0 0 16px;padding:0">';
          Object.entries(result.metadata).forEach(function(kv){
            html += `<li>${escH(kv[0])}: ${escH(kv[1])}</li>`;
          });
          html += '</ul></div>';
        }
      } else {
        html += '<div style="color:var(--text-muted);text-align:center;padding:8px">No se pudo determinar la etapa a partir de los documentos disponibles.</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── API: OCR en lote ── */
  async function runOcrBatch(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaOcrResult');
    if(!el) return;

    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Cargando diligencias…</div>';

    try {
      // Obtener diligencias sin texto extraído
      const { data: diligencias } = await sb.from('diligencias')
        .select('id,file_name,diligencia_label,drive_file_id,mime_type,extracted_text')
        .eq('case_id', c.id);

      if(!diligencias || !diligencias.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">No hay diligencias en este caso.</div>';
        return;
      }

      const sinTexto = diligencias.filter(function(d){ return !d.extracted_text && d.drive_file_id; });
      const conTexto = diligencias.filter(function(d){ return !!d.extracted_text; });

      if(!sinTexto.length){
        el.innerHTML = `<div class="ia-result" style="color:var(--text-muted)">Todas las diligencias ya tienen texto extraído (${conTexto.length}/${diligencias.length}).</div>`;
        return;
      }

      el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Procesando OCR de ${sinTexto.length} archivo(s)… (máx. 10 por lote)</div>`;

      const files = sinTexto.slice(0,10).map(function(d){
        return { driveFileId: d.drive_file_id, fileName: d.file_name || d.diligencia_label, mimeType: d.mime_type || 'application/pdf' };
      });

      const result = await apiFetch('ocr-batch', { files, caseId: c.id });

      // Guardar textos extraídos en Supabase
      let saved = 0;
      if(result.results){
        for(const r of result.results){
          if(r.status==='success' && r.driveFileId && r.text){
            try {
              const match = sinTexto.find(function(d){ return d.drive_file_id === r.driveFileId; });
              if(match){
                await sb.from('diligencias').update({ extracted_text: r.text }).eq('id', match.id);
                saved++;
              }
            } catch(e){}
          }
        }
      }

      let html = '<div class="ia-result" style="white-space:normal">';
      html += `<div style="font-weight:600;margin-bottom:8px">Resultados OCR</div>`;
      html += `<div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px">
        <span style="color:var(--green)">✅ ${result.processed||0} procesados</span>
        <span style="color:var(--red)">❌ ${result.failed||0} fallidos</span>
        <span style="color:var(--text-muted)">💾 ${saved} guardados</span>
      </div>`;

      if(result.results){
        result.results.forEach(function(r){
          const icon = r.status==='success'?'✅':'❌';
          const preview = r.text? r.text.substring(0,150)+'…' : (r.error||'');
          html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11.5px">
            ${icon} <strong>${escH(r.fileName||'?')}</strong>
            ${r.textLength? `<span style="color:var(--text-muted);margin-left:4px">(${r.textLength} chars)</span>` : ''}
            <div style="color:var(--text-dim);margin-top:2px;font-size:11px">${escH(preview)}</div>
          </div>`;
        });
      }

      if(result.usage){
        html += `<div style="margin-top:8px;font-size:10px;color:var(--text-muted);text-align:right">Tokens: ${result.usage.inputTokens||0} in / ${result.usage.outputTokens||0} out</div>`;
      }
      html += '</div>';
      el.innerHTML = html;

      if(saved>0 && typeof showToast==='function'){
        showToast(`OCR completado: ${saved} diligencia(s) actualizada(s)`,'success');
      }
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── OCR masivo: procesar TODOS los casos con diligencias sin texto ── */
  async function runOcrMasivo(){
    const el = document.getElementById('iaOcrResult');
    if(!el) return;
    if(!session){if(typeof showToast==='function') showToast('Sin sesión','error');return;}

    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Buscando diligencias sin texto en todos los casos…</div>';

    try {
      // Buscar TODAS las diligencias sin extracted_text que tengan drive_file_id
      const { data: sinTexto, error } = await sb.from('diligencias')
        .select('id,case_id,file_name,diligencia_label,drive_file_id,mime_type')
        .is('extracted_text', null)
        .not('drive_file_id', 'is', null)
        .limit(200);

      if(error) throw error;
      if(!sinTexto || !sinTexto.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">✅ Todas las diligencias de todos los casos ya tienen texto extraído.</div>';
        return;
      }

      // Agrupar por caso
      const byCaseId = {};
      sinTexto.forEach(d => {
        if(!byCaseId[d.case_id]) byCaseId[d.case_id] = [];
        byCaseId[d.case_id].push(d);
      });
      const caseCount = Object.keys(byCaseId).length;

      el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Procesando ${sinTexto.length} diligencias sin texto en ${caseCount} caso(s)… (lotes de 10, esto puede tomar varios minutos)</div>`;

      let totalProcessed = 0, totalFailed = 0, totalSaved = 0;
      const resultsByCaso = {};

      // Procesar en lotes de 10
      for(let i = 0; i < sinTexto.length; i += 10){
        const batch = sinTexto.slice(i, i + 10);
        const files = batch.map(d => ({
          driveFileId: d.drive_file_id,
          fileName: d.file_name || d.diligencia_label,
          mimeType: d.mime_type || 'application/pdf'
        }));

        try {
          const batchResult = await apiFetch('ocr-batch', { files, caseId: batch[0].case_id });
          if(batchResult.results){
            for(const r of batchResult.results){
              if(r.status==='success' && r.driveFileId && r.text){
                const match = batch.find(d => d.drive_file_id === r.driveFileId);
                if(match){
                  try {
                    await sb.from('diligencias').update({ extracted_text: r.text }).eq('id', match.id);
                    totalSaved++;
                    if(!resultsByCaso[match.case_id]) resultsByCaso[match.case_id] = 0;
                    resultsByCaso[match.case_id]++;
                  } catch(e){}
                }
                totalProcessed++;
              } else { totalFailed++; }
            }
          }
        } catch(e){ totalFailed += batch.length; }

        // Actualizar progreso
        el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Progreso: ${Math.min(i+10, sinTexto.length)}/${sinTexto.length} — ${totalSaved} guardadas, ${totalFailed} fallidas</div>`;
      }

      // Resultado final
      let html = '<div class="ia-result" style="white-space:normal">';
      html += '<div style="font-weight:600;margin-bottom:8px">📊 Resultado OCR Masivo</div>';
      html += `<div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px">
        <span style="color:var(--green)">✅ ${totalProcessed} procesadas</span>
        <span style="color:var(--red)">❌ ${totalFailed} fallidas</span>
        <span style="color:var(--gold)">💾 ${totalSaved} guardadas</span>
        <span style="color:var(--text-muted)">📁 ${caseCount} casos</span>
      </div>`;

      // Desglose por caso
      const caseNames = typeof allCases !== 'undefined' ? allCases : [];
      Object.entries(resultsByCaso).forEach(function(kv){
        const cn = caseNames.find(c => c.id === kv[0]);
        html += `<div style="font-size:11px;padding:2px 0">📋 ${escH(cn?.name||kv[0])}: ${kv[1]} diligencia(s) extraída(s)</div>`;
      });

      html += '</div>';
      el.innerHTML = html;
      if(totalSaved>0 && typeof showToast==='function') showToast(`OCR masivo: ${totalSaved} diligencias extraídas en ${caseCount} casos`,'success');
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── Exponer API global ── */
  window._ia = {
    analyzePrescription: analyzePrescription,
    analyzeStage: analyzeStage,
    generateSection: generateSection,
    switchVfTab: switchVfTab,
    toggleVfParrafos: toggleVfParrafos,
    copySection: copySection,
    copyUnified: copyUnified,
    sendSectionToChat: sendSectionToChat,
    useParrafoInSection: useParrafoInSection,
    copyParrafoText: copyParrafoText,
    sendParrafoToChat: sendParrafoToChat,
    runOcrBatch: runOcrBatch,
    runOcrMasivo: runOcrMasivo,
    // Backward compatibility
    generateVista: function(){ generateSection('completa'); },
    copyVista: function(){ copySection('completa'); },
    sendVistaToChat: function(){ sendSectionToChat('completa'); }
  };

  /* ── Init ── */
  function init(){
    injectTab();
    injectContent();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
