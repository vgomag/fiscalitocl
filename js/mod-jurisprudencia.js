/* ================================================================
   MOD-JURISPRUDENCIA.JS — Análisis Jurisprudencial Avanzado (F10)
   Búsqueda semántica Qdrant + portales web + 3 modos IRAC
   ================================================================
   v2.0 · 2026-03-25 · Fiscalito / UMAG
   ================================================================
   EDGE FUNCTIONS (Supabase, ya desplegadas):
     analyze-jurisprudencia → búsqueda Qdrant + web + generación IA
   TABLAS SUPABASE (crear si no existen):
     jurisprudencia_analyses  — análisis guardados
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   1 · DATOS BASE
   ──────────────────────────────────────────────────────────────── */

// Sinónimos jurídicos para expansión de términos (client-side preview)
const LEGAL_SYNONYMS = {
  'sumario':            ['sumario administrativo','procedimiento disciplinario','investigación sumaria','proceso sancionador'],
  'suspensión':         ['medida de suspensión','apartamiento del cargo','inhabilitación temporal','cese temporal'],
  'destitución':        ['remoción','despido','separación del cargo','exoneración','término de funciones'],
  'amonestación':       ['amonestación escrita','reprensión','advertencia formal'],
  'multa':              ['multa administrativa','sanción pecuniaria','multa disciplinaria'],
  'debido proceso':     ['garantías procesales','derecho de defensa','tutela judicial efectiva','procedimiento regular'],
  'notificación':       ['comunicación','emplazamiento','citación','puesta en conocimiento'],
  'descargos':          ['defensa','contestación de cargos','alegaciones','respuesta a cargos'],
  'nulidad':            ['invalidez','anulación','nulidad de derecho público','inexistencia jurídica'],
  'prescripción':       ['caducidad','extinción por el tiempo','plazo de prescripción'],
  'recurso de protección': ['acción de protección','amparo constitucional','recurso constitucional'],
  'proporcionalidad':   ['principio de proporcionalidad','adecuación de la sanción','ponderación'],
  'probidad':           ['probidad administrativa','integridad funcionaria','ética pública'],
  'dictamen':           ['pronunciamiento','dictamen CGR','jurisprudencia administrativa'],
  'funcionario':        ['servidor público','funcionario público','empleado fiscal','agente público'],
  'incompetencia':      ['falta de competencia','actuación fuera de atribuciones'],
};

// Categorías temáticas para detección automática
const LEGAL_CATEGORIES = {
  procedimientos: { label:'Procedimientos Disciplinarios',  keywords:['sumario','investigación','fiscal','actuario','cargos','descargos'],        collections:['administrative_discipline','rulings'] },
  sanciones:      { label:'Sanciones Administrativas',      keywords:['destitución','suspensión','multa','censura','amonestación'],                collections:['rulings','administrative_discipline'] },
  garantias:      { label:'Garantías y Debido Proceso',     keywords:['debido proceso','defensa','notificación','plazo','prescripción','nulidad'], collections:['relevant_jurisprudence','rulings'] },
  recursos:       { label:'Recursos e Impugnaciones',       keywords:['recurso','apelación','reposición','protección','reclamación'],              collections:['relevant_jurisprudence','rulings'] },
  funcionarios:   { label:'Régimen Funcionario',            keywords:['funcionario','estatuto','contrata','planta','honorarios','probidad'],       collections:['administrative_discipline','reference_books'] },
  contraloria:    { label:'Jurisprudencia CGR',             keywords:['dictamen','toma de razón','contraloría','pronunciamiento'],                 collections:['rulings','administrative_discipline'] },
};

// Definición de modos y secciones
const ANALYSIS_MODES = {
  jurisprudencial: {
    label: '📋 Jurisprudencial',
    desc:  'Análisis doctrinal con sistematización de criterios CGR y tribunales',
    sections: [
      { id:'conceptualizacion',       title:'I. Conceptualización del Instituto' },
      { id:'fuentes_normativas',      title:'II. Fuentes Normativas Aplicables' },
      { id:'criterios_jurisprudenciales', title:'III. Criterios Jurisprudenciales' },
      { id:'desarrollo_jurisprudencial',  title:'IV. Desarrollo Jurisprudencial' },
      { id:'estandar_validez',        title:'V. Estándar de Validez' },
    ]
  },
  defensa: {
    label: '🛡 Defensa Institucional',
    desc:  'Informe de defensa para recursos administrativos y judiciales',
    sections: [
      { id:'resumen_ejecutivo',           title:'I. Resumen Ejecutivo' },
      { id:'antecedentes_procedimiento',  title:'II. Antecedentes del Procedimiento' },
      { id:'respuesta_argumentos',        title:'III. Respuesta a los Argumentos' },
      { id:'debido_proceso',              title:'IV. Garantías del Debido Proceso' },
      { id:'fundamentos_juridicos',       title:'V. Fundamentos Jurídicos' },
      { id:'conclusiones_petitorio',      title:'VI. Conclusiones y Petitorio' },
    ]
  },
  recurso_proteccion: {
    label: '⚖️ Recurso de Protección',
    desc:  'Informe especializado para Cortes con jurisprudencia de garantías',
    sections: [
      { id:'identificacion_recurso',          title:'I. Identificación del Recurso' },
      { id:'analisis_admisibilidad',          title:'II. Análisis de Admisibilidad' },
      { id:'hechos_alegados_vs_acreditados',  title:'III. Hechos Alegados vs. Acreditados' },
      { id:'analisis_garantias',              title:'IV. Garantías Constitucionales' },
      { id:'jurisprudencia_aplicable',        title:'V. Jurisprudencia Aplicable' },
      { id:'defensa_estrategica',             title:'VI. Defensa Estratégica' },
      { id:'petitorio_informe',               title:'VII. Petitorio del Informe' },
    ]
  },
};

// Portales de búsqueda web
const SEARCH_PORTALS = {
  cgr:  { label:'CGR Contraloría',        url:'https://www.contraloria.cl/web/guest/dictamenes', icon:'🏛' },
  pjud: { label:'PJUD Sentencias',        url:'https://juris.pjud.cl/juris/unificada/',          icon:'⚖️' },
  dc:   { label:'Diario Constitucional',  url:'https://www.diarioconstitucional.cl/',             icon:'📰' },
};

// Estado global del módulo
const juri = {
  mode:          'jurisprudencial',
  viewPanel:     'skill',      // 'skill' | 'completo'
  topic:         '',
  sections:      {},          // { sectionId: { content, status } }
  searchResults: '',
  searchLoading: false,
  generating:    false,
  currentSection: null,
  progress:      0,
  // Search panel state
  searchTab:     'semantica',  // semantica | cgr | pjud | manual
  searchPortals: new Set(['cgr']),
  expandTerms:   true,
  searchCategory:null,
  manualContext: '',
  addedDocs:     [],           // docs added to context
  savedAnalyses: [],
  activeAnalysisId: null,
  // SKILL state
  skillKeywords: '',
  skillSources:  new Set(['cgr','pjud','qdrant']),
  skillCount:    10,
  skillLoading:  false,
  skillResults:  [],     // [{title, source, date, snippet, url, selected}]
  skillFolder:   '',
  // AI usage guard (set by mod-seguridad)
  aiBlocked:     false,
};

/* ────────────────────────────────────────────────────────────────
   1b · HELPERS — Netlify RAG + streaming IA
   ──────────────────────────────────────────────────────────────── */

/**
 * Busca en Qdrant vía /.netlify/functions/rag (Netlify function, ya funcional).
 * @param {string} query - Texto a buscar
 * @param {string} folder - 'todos' o alias de colección
 * @returns {Promise<{context:string, sources:string[], count:number}>}
 */
async function _juriSearchRAG(query, folder = 'todos') {
  const _fetchFn = typeof authFetch === 'function' ? authFetch : fetch;
  const resp = await _fetchFn('/.netlify/functions/rag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, folder })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('RAG HTTP ' + resp.status + ': ' + errText.substring(0, 200));
  }
  return resp.json();
}

/**
 * Busca dictámenes en CGR vía /.netlify/functions/cgr-search.
 * @param {string} query - Texto a buscar
 * @param {string} source - Tipo de fuente (dictamenes, auditoria, etc.)
 * @param {number} count - Número de resultados (max 20)
 * @returns {Promise<{totalCount:number, count:number, results:Array}>}
 */
async function _juriSearchCGR(query, source = 'dictamenes', count = 10) {
  const _fetchFn = typeof authFetch === 'function' ? authFetch : fetch;
  const resp = await _fetchFn('/.netlify/functions/cgr-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source, count })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('CGR HTTP ' + resp.status + ': ' + errText.substring(0, 200));
  }
  return resp.json();
}

/**
 * Busca sentencias en PJUD vía /.netlify/functions/pjud-search.
 * @param {string} query - Texto a buscar
 * @param {string} court - Tipo de corte (Corte_Suprema, Corte_de_Apelaciones, Laborales, etc.)
 * @param {number} count - Número de resultados (max 20)
 * @returns {Promise<{totalCount:number, count:number, court:string, results:Array}>}
 */
async function _juriSearchPJUD(query, court = 'Corte_Suprema', count = 10) {
  const _fetchFn = typeof authFetch === 'function' ? authFetch : fetch;
  const resp = await _fetchFn('/.netlify/functions/pjud-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, court, count })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('PJUD HTTP ' + resp.status + ': ' + errText.substring(0, 200));
  }
  return resp.json();
}

/**
 * Obtiene auth token de sesión Supabase.
 */
async function _juriGetAuthToken() {
  try {
    if (typeof session !== 'undefined' && session?.access_token) return session.access_token;
    const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    if (sb) {
      const { data: sessData } = await sb.auth.getSession();
      return sessData?.session?.access_token || '';
    }
  } catch (e) {}
  return '';
}

/**
 * Genera texto vía /api/chat-stream (edge function SSE, sin timeout).
 * @param {Object} opts - { systemPrompt, userMsg, maxTokens, onProgress(text) }
 * @returns {Promise<string>}
 */
async function _juriStreamGenerate({ systemPrompt, userMsg, maxTokens, onProgress }) {
  const authToken = await _juriGetAuthToken();
  if (!authToken) throw new Error('Sesión no activa. Inicia sesión para usar esta función.');

  const resp = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
    body: JSON.stringify({
      model: typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if (!resp.ok) {
    const ct = resp.headers.get('content-type') || '';
    let errMsg = 'HTTP ' + resp.status;
    try {
      if (ct.includes('json')) { const d = await resp.json(); errMsg = d.error || errMsg; }
      else { const t = await resp.text(); errMsg = t.substring(0, 200) || errMsg; }
    } catch (e) {}
    if (resp.status === 401) throw new Error('Sesión expirada. Recarga la página e inicia sesión.');
    throw new Error('Error: ' + errMsg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          accumulated += evt.delta.text;
          if (onProgress) onProgress(accumulated);
        }
      } catch (e) { /* ignorar líneas no-JSON */ }
    }
  }

  if (!accumulated.trim()) throw new Error('La IA no generó texto.');
  return accumulated;
}

/* ────────────────────────────────────────────────────────────────
   2 · APERTURA
   ──────────────────────────────────────────────────────────────── */
function openAnalisisJuris() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el=>el.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewJurisprudencia');
  juri.sections = {};
  juri.searchResults = '';
  juri.addedDocs = [];
  renderJuriView();
  loadSavedAnalyses();
}

/* ────────────────────────────────────────────────────────────────
   3 · RENDER PRINCIPAL
   ──────────────────────────────────────────────────────────────── */
function renderJuriView() {
  const main = document.getElementById('juriMain');
  if (!main) return;

  // Panel switcher header
  const switcher = `
  <div class="juri-panel-switcher">
    <button class="juri-panel-btn ${juri.viewPanel==='skill'?'active':''}" onclick="juriSetPanel('skill')">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="6" r="4"/><line x1="9.5" y1="9.5" x2="14" y2="14"/></svg>
      Búsqueda SKILL
    </button>
    <button class="juri-panel-btn ${juri.viewPanel==='completo'?'active':''}" onclick="juriSetPanel('completo')">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="3" width="12" height="10" rx="1"/><line x1="5" y1="7" x2="11" y2="7"/><line x1="5" y1="10" x2="9" y2="10"/></svg>
      Análisis Completo
    </button>
  </div>`;

  if (juri.viewPanel === 'skill') {
    main.innerHTML = switcher + renderSkillPanel();
    return;
  }

  // ── Completo mode (original) ──
  const mode = ANALYSIS_MODES[juri.mode];
  const sections = mode.sections;
  const generated = sections.filter(s => juri.sections[s.id]?.status === 'done').length;
  const pct = sections.length ? Math.round(generated / sections.length * 100) : 0;

  const kpiHtml = `<div class="juri-kpi-row">
    <div class="juri-kpi-card">
      <div class="juri-kpi-val" style="color:var(--gold)">${sections.length}</div>
      <div class="juri-kpi-label">Secciones · ${mode.label}</div>
    </div>
    <div class="juri-kpi-card">
      <div class="juri-kpi-val" style="color:var(--green)">${generated}</div>
      <div class="juri-kpi-label">Generadas</div>
    </div>
    <div class="juri-kpi-card">
      <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--gold-dim),var(--gold));transition:width .4s"></div>
      </div>
      <div class="juri-kpi-label">Progreso: ${pct}%</div>
    </div>
    <div class="juri-kpi-card" style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
      ${Object.entries(ANALYSIS_MODES).map(([k,m])=>`
        <button class="btn-sm ${juri.mode===k?'juri-mode-active':''}" onclick="juriSetMode('${k}')" style="font-size:10.5px">
          ${m.label}
        </button>`).join('')}
    </div>
  </div>`;

  main.innerHTML = switcher + kpiHtml + `
  <div class="juri-layout">
    <div class="juri-left" id="juriLeft">
      ${renderSearchPanel()}
    </div>
    <div class="juri-right" id="juriRight">
      ${renderSectionEditor(mode)}
    </div>
  </div>`;
}

function juriSetPanel(panel) {
  juri.viewPanel = panel;
  renderJuriView();
}

/* ── Modo ── */
function juriSetMode(mode) {
  juri.mode = mode;
  juri.sections = {};
  renderJuriView();
}

/* ────────────────────────────────────────────────────────────────
   PANEL SKILL — Búsqueda IA simplificada
   Navega CGR/PJUD, filtra por palabras clave, descarga,
   organiza, resume e incorpora al documento
   ──────────────────────────────────────────────────────────────── */
function renderSkillPanel() {
  const sources = [
    { id:'cgr',    icon:'🏛', label:'CGR Contraloría' },
    { id:'pjud',   icon:'⚖️',  label:'PJUD Sentencias' },
    { id:'qdrant', icon:'📚', label:'Biblioteca Qdrant' },
  ];

  const hasResults = juri.skillResults.length > 0;
  const selected   = juri.skillResults.filter(r=>r.selected);

  return `
  <div class="skill-wrap">

    <!-- ── BUSCADOR ── -->
    <div class="skill-search-card">
      <div class="skill-section-label">🎯 Búsqueda inteligente de jurisprudencia</div>

      <!-- Keywords -->
      <div class="skill-field">
        <label>Palabras clave <span class="skill-hint">separadas por coma</span></label>
        <textarea class="skill-input" id="skillKeywords" rows="2"
          placeholder="Ej: acoso laboral, proporcionalidad sanción, prescripción disciplinaria…"
          oninput="juri.skillKeywords=this.value;juriUpdateSearchBtn()"
        >${juriEsc(juri.skillKeywords)}</textarea>
      </div>

      <!-- Sources row -->
      <div class="skill-field">
        <label>Fuentes a consultar</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${sources.map(s=>`
            <button class="skill-source-btn ${juri.skillSources.has(s.id)?'active':''}"
              onclick="juriToggleSkillSource('${s.id}')">
              ${s.icon} ${s.label}
            </button>`).join('')}
        </div>
      </div>

      <!-- Count + Folder row -->
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div class="skill-field" style="flex:0 0 140px">
          <label>Cantidad de resultados</label>
          <select class="skill-select" onchange="juri.skillCount=+this.value">
            <option value="5" ${juri.skillCount===5?'selected':''}>5 resultados</option>
            <option value="10" ${juri.skillCount===10?'selected':''}>10 resultados</option>
            <option value="20" ${juri.skillCount===20?'selected':''}>20 resultados</option>
            <option value="30" ${juri.skillCount===30?'selected':''}>30 resultados</option>
          </select>
        </div>
        <div class="skill-field" style="flex:1;min-width:150px">
          <label>Carpeta / etiqueta de organización <span class="skill-hint">opcional</span></label>
          <input class="skill-input" id="skillFolder" placeholder="Ej: Acoso Laboral 2025, Caso 87G…"
            value="${juriEsc(juri.skillFolder)}" oninput="juri.skillFolder=this.value"/>
        </div>
      </div>

      <!-- Search button -->
      <button class="skill-search-btn" onclick="juriSkillSearch()"
        ${juri.skillLoading||!juri.skillKeywords.trim()?'disabled':''}>
        ${juri.skillLoading
          ? '<span class="juri-spinner" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></span> Buscando…'
          : '🔍 Buscar con IA en todas las fuentes'}
      </button>

      ${juri.skillLoading ? `
      <div class="skill-progress-bar">
        <div class="skill-progress-fill"></div>
      </div>` : ''}
    </div>

    <!-- ── RESULTADOS ── -->
    ${hasResults ? `
    <div class="skill-results-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <span class="skill-section-label" style="margin-bottom:0">${juri.skillResults.length} resultado(s) encontrados</span>
          ${juri.skillFolder ? `<span style="font-size:10px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:1px 8px;border-radius:8px;margin-left:8px">📁 ${juriEsc(juri.skillFolder)}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" style="font-size:10.5px" onclick="juriSkillSelectAll()">☑ Todos</button>
          <button class="btn-sm" style="font-size:10.5px" onclick="juriSkillSelectNone()">☐ Ninguno</button>
        </div>
      </div>

      <div class="skill-results-list">
        ${juri.skillResults.map((r,i)=>`
        <div class="skill-result-item ${r.selected?'selected':''}">
          <input type="checkbox" class="skill-check" ${r.selected?'checked':''}
            onchange="juri.skillResults[${i}].selected=this.checked;updateSkillResultsUI()"/>
          <div class="skill-result-body">
            <div class="skill-result-title">${juriEsc(r.title)}</div>
            <div class="skill-result-meta">
              <span class="skill-source-tag skill-src-${r.source}">${r.sourceIcon||'📄'} ${r.source?.toUpperCase()}</span>
              ${r.date?`<span style="color:var(--text-muted)">${juriEsc(r.date)}</span>`:''}
              ${r.url?`<a href="${juriEsc(r.url)}" target="_blank" class="skill-link">Ver fuente →</a>`:''}
            </div>
            ${r.snippet?`<div class="skill-result-snippet">${juriEsc(r.snippet.substring(0,220))}${r.snippet.length>220?'…':''}</div>`:''}
          </div>
        </div>`).join('')}
      </div>

      <!-- Acciones -->
      <div class="skill-actions">
        <div style="font-size:11px;color:var(--text-muted)">
          ${selected.length} seleccionado(s)
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-sm" onclick="juriSkillSummarize()" ${!selected.length?'disabled':''}>
            📊 Resumir seleccionados
          </button>
          <button class="btn-sm" onclick="juriSkillAddToAnalysis()" ${!selected.length?'disabled':''}>
            ➕ Agregar al análisis
          </button>
          <button class="btn-sm" onclick="juriSkillSendToChat()" ${!selected.length?'disabled':''}>
            💬 Enviar al Chat
          </button>
          <button class="btn-sm" onclick="juriSkillExport()" ${!selected.length?'disabled':''}>
            ⬇ Exportar
          </button>
        </div>
      </div>

      <!-- Resumen generado -->
      <div id="skillSummaryBox" style="display:none;margin-top:10px"></div>
    </div>` : `
    <div class="skill-empty">
      <div style="font-size:32px;margin-bottom:8px">⚖️</div>
      <div style="font-size:13px;font-weight:500;color:var(--text-dim);margin-bottom:5px">
        Búsqueda inteligente de jurisprudencia
      </div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.6;max-width:380px">
        Ingresa palabras clave, selecciona las fuentes y la cantidad de resultados.<br>
        El agente buscará en CGR Contraloría, PJUD Sentencias y la Biblioteca Qdrant,
        organizará los resultados y podrá resumirlos e incorporarlos a tu documento.
      </div>
      <div class="skill-portal-links">
        <a href="https://www.contraloria.cl/web/cgr/buscar-jurisprudencia" target="_blank" class="skill-portal-btn-link">
          🏛 Abrir CGR →
        </a>
        <a href="https://www.pjud.cl/portal-unificado-sentencias" target="_blank" class="skill-portal-btn-link">
          ⚖️ Abrir PJUD →
        </a>
      </div>
    </div>`}
  </div>`;
}

/* ── SKILL Actions ── */
function juriToggleSkillSource(src) {
  if (juri.skillSources.has(src)) juri.skillSources.delete(src);
  else juri.skillSources.add(src);
  const wrap = document.querySelector('.skill-wrap');
  if (wrap) wrap.innerHTML = renderSkillPanel().replace('<div class="skill-wrap">','').replace(/^<div class="skill-wrap">/, '').slice(0, -6);
  renderJuriView();  // full re-render to update buttons
}

function juriUpdateSearchBtn() {
  const btn = document.querySelector('.skill-search-btn');
  if (btn) btn.disabled = juri.skillLoading || !juri.skillKeywords.trim();
}

function updateSkillResultsUI() {
  const selected = juri.skillResults.filter(r=>r.selected);
  const actionDiv = document.querySelector('.skill-actions div:first-child');
  if (actionDiv) actionDiv.textContent = selected.length + ' seleccionado(s)';
  document.querySelectorAll('.skill-actions button').forEach(btn => {
    if (!btn.onclick?.toString()?.includes('SelectAll') && !btn.onclick?.toString()?.includes('SelectNone')) {
      btn.disabled = selected.length === 0;
    }
  });
}

function juriSkillSelectAll() {
  juri.skillResults.forEach(r => r.selected = true);
  renderJuriView();
}
function juriSkillSelectNone() {
  juri.skillResults.forEach(r => r.selected = false);
  renderJuriView();
}

async function juriSkillSearch() {
  const keywords = juri.skillKeywords.trim();
  if (!keywords) { showToast('⚠ Ingresa palabras clave'); return; }
  if (juri.aiBlocked) { showToast('⚠ Límite de uso IA alcanzado'); return; }
  if (juri.skillSources.size === 0) { showToast('⚠ Selecciona al menos una fuente'); return; }

  juri.skillLoading = true;
  juri.skillResults = [];
  renderJuriView();

  const searchQdrant = juri.skillSources.has('qdrant');
  const searchPjud   = juri.skillSources.has('pjud');
  const searchCgr    = juri.skillSources.has('cgr');

  try {
    const results = [];
    const promises = [];

    // Búsqueda Qdrant vía Netlify RAG
    if (searchQdrant) {
      promises.push(
        _juriSearchRAG(keywords, juri.skillFolder || 'todos')
          .then(ragData => {
            if (ragData.context && ragData.count > 0) {
              const blocks = ragData.context.split('\n\n---\n\n');
              blocks.forEach((block, i) => {
                const headerMatch = block.match(/\[Fuente:\s*(.+?)\s*\|\s*Colección:\s*(.+?)\s*\|\s*Relevancia:\s*(\d+)%\]/);
                const content = headerMatch ? block.substring(headerMatch[0].length).trim() : block;
                results.push({
                  title:     headerMatch ? headerMatch[1] : `Resultado ${i + 1}`,
                  source:    'qdrant',
                  sourceIcon:'📚',
                  date:      '',
                  snippet:   content.substring(0, 400),
                  url:       '',
                  score:     headerMatch ? parseInt(headerMatch[3]) / 100 : 0,
                  selected:  false,
                  content:   content,
                });
              });
            }
          })
          .catch(err => console.warn('Qdrant search error:', err.message))
      );
    }

    // Búsqueda PJUD vía Netlify pjud-search
    if (searchPjud) {
      promises.push(
        _juriSearchPJUD(keywords, 'Corte_Suprema', juri.skillCount)
          .then(pjudData => {
            if (pjudData.results && pjudData.results.length > 0) {
              pjudData.results.forEach((r, i) => {
                const title = r.rol
                  ? `ROL ${r.rol} — ${r.caratulado || 'Sin caratulado'}`
                  : r.caratulado || `Sentencia PJUD ${i + 1}`;
                const meta = [r.fecha, r.sala, r.tipoRecurso, r.resultado].filter(Boolean).join(' | ');
                results.push({
                  title:     title,
                  source:    'pjud',
                  sourceIcon:'⚖️',
                  date:      r.fecha || '',
                  snippet:   (meta ? meta + '\n' : '') + (r.preview || '').substring(0, 400),
                  url:       r.url || '',
                  score:     0.8 - (i * 0.02),
                  selected:  false,
                  content:   (meta ? '--- ' + meta + ' ---\n\n' : '') + (r.fullText || r.preview || ''),
                });
              });
            }
          })
          .catch(err => {
            console.warn('PJUD search error:', err.message);
            showToast('⚠ Error buscando en PJUD: ' + err.message);
          })
      );
    }

    // Búsqueda CGR vía Netlify cgr-search
    if (searchCgr) {
      promises.push(
        _juriSearchCGR(keywords, 'dictamenes', juri.skillCount)
          .then(cgrData => {
            if (cgrData.results && cgrData.results.length > 0) {
              cgrData.results.forEach((r, i) => {
                const title = r.nDictamen
                  ? `Dictamen N° ${r.nDictamen} (${r.fecha || r.fechaISO?.substring(0,10) || ''})`
                  : r.docId || `Dictamen CGR ${i + 1}`;
                const meta = [r.origen, r.descriptores, r.fuentes].filter(Boolean).join(' | ');
                results.push({
                  title:     title,
                  source:    'cgr',
                  sourceIcon:'🏛',
                  date:      r.fecha || '',
                  snippet:   (r.materia ? r.materia + '\n' : '') + (meta ? meta + '\n' : '') + (r.docCompleto || '').substring(0, 300),
                  url:       r.url || '',
                  score:     0.85 - (i * 0.02),
                  selected:  false,
                  content:   (r.materia ? '📋 MATERIA: ' + r.materia + '\n\n' : '')
                           + (r.descriptores ? '🏷 DESCRIPTORES: ' + r.descriptores + '\n' : '')
                           + (r.fuentes ? '📖 FUENTES LEGALES: ' + r.fuentes + '\n' : '')
                           + (meta ? '---\n\n' : '')
                           + (r.docCompleto || ''),
                });
              });
            }
          })
          .catch(err => {
            console.warn('CGR search error:', err.message);
            showToast('⚠ Error buscando en CGR: ' + err.message);
          })
      );
    }

    // Esperar todas las búsquedas en paralelo
    if (promises.length > 0) {
      await Promise.all(promises);
    }

    // Ordenar: PJUD por fecha (más recientes primero), Qdrant por score
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!results.length) {
      results.push({
        title:     `Sin resultados para: ${keywords}`,
        source:    'ia',
        sourceIcon:'🤖',
        snippet:   'La búsqueda no devolvió resultados directos. Intenta términos más específicos o abre los portales manualmente.',
        url:       '',
        selected:  false,
        content:   '',
      });
    }

    juri.skillResults = results.slice(0, juri.skillCount * 3);

  } catch (err) {
    console.error('juriSkillSearch:', err);
    showToast('⚠ Error al buscar: ' + err.message);
  } finally {
    juri.skillLoading = false;
    renderJuriView();
  }
}

async function juriSkillSummarize() {
  const selected = juri.skillResults.filter(r => r.selected);
  if (!selected.length) return;

  const box = document.getElementById('skillSummaryBox');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div class="juri-gen-progress"><span class="juri-spinner"></span><span style="font-size:11.5px;color:var(--gold)">Generando resumen con IA…</span></div>';

  const folder = juri.skillFolder ? ` (carpeta: ${juri.skillFolder})` : '';

  try {
    const docsText = selected.map((r,i) =>
      `### ${i+1}. ${r.title} [${r.source?.toUpperCase()}]\n${r.snippet || r.content || '(sin contenido)'}`
    ).join('\n\n---\n\n');

    const reply = await _juriStreamGenerate({
      systemPrompt: `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG). Genera un resumen ejecutivo de la jurisprudencia seleccionada${folder}.
Estructura el resumen abordando: criterios jurisprudenciales principales, tendencias doctrinales detectadas, dictámenes o sentencias más relevantes, y aplicación práctica al caso disciplinario.

ESTILO: Redacción indistinguible de un profesional jurídico humano. Prosa continua con conectores naturales (sin embargo, no obstante, a mayor abundamiento). Vocabulario jurídico-administrativo chileno preciso. NUNCA uses marcas de IA ("Es importante destacar", "Cabe mencionar", emojis). NUNCA markdown.
PRECISIÓN: SOLO cita dictámenes, sentencias y normas cuya existencia puedas confirmar de las fuentes proporcionadas. Si no estás seguro: [VERIFICAR].`,
      userMsg: `Resume esta jurisprudencia para uso en un procedimiento disciplinario:\n\n${docsText}`,
      maxTokens: 2000,
      onProgress: (text) => {
        box.innerHTML = `
          <div class="skill-summary-wrap">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:11px;font-weight:600;color:var(--gold)">📊 Generando resumen… (${selected.length} fuente(s))</div>
            </div>
            <div class="skill-summary-content">${typeof md === 'function' ? md(text) : text}</div>
          </div>`;
      }
    });

    box.innerHTML = `
      <div class="skill-summary-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;color:var(--gold)">📊 Resumen ejecutivo de ${selected.length} fuente(s)</div>
          <div style="display:flex;gap:5px">
            <button class="btn-sm" style="font-size:10px" onclick="navigator.clipboard.writeText(this.closest('.skill-summary-wrap').querySelector('.skill-summary-content').textContent);showToast('✓ Copiado')">📋 Copiar</button>
            <button class="btn-del" onclick="document.getElementById('skillSummaryBox').style.display='none'">✕</button>
          </div>
        </div>
        <div class="skill-summary-content">${typeof md === 'function' ? md(reply) : reply}</div>
      </div>`;
  } catch (err) {
    box.innerHTML = `<div style="color:var(--red);font-size:11.5px">⚠ Error: ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

function juriSkillAddToAnalysis() {
  const selected = juri.skillResults.filter(r => r.selected);
  if (!selected.length) return;
  selected.forEach(r => {
    juri.addedDocs.push({ title: r.title, content: r.content || r.snippet || '' });
  });
  juri.viewPanel = 'completo';
  renderJuriView();
  showToast(`✓ ${selected.length} fuente(s) agregadas al análisis completo`);
}

function juriSkillSendToChat() {
  const selected = juri.skillResults.filter(r => r.selected);
  if (!selected.length) return;
  const ctx = selected.map(r => `[${r.sourceIcon} ${r.source?.toUpperCase()}] ${r.title}\n${r.snippet||r.content||''}`).join('\n\n---\n\n');
  if (typeof showTab === 'function') showTab('tabChat');
  setTimeout(() => {
    const inp = document.getElementById('inputBox');
    if (inp) inp.value = `Analiza esta jurisprudencia y su aplicación al expediente activo:\n\n${ctx.substring(0,3000)}`;
  }, 300);
  showToast('✓ Enviando al Chat IA');
}

function juriSkillExport() {
  const selected = juri.skillResults.filter(r => r.selected);
  if (!selected.length) return;
  const folder = juri.skillFolder ? `Carpeta: ${juri.skillFolder}\n` : '';
  const text = `# Jurisprudencia exportada\n${folder}Fecha: ${new Date().toLocaleDateString('es-CL')}\n\n---\n\n` +
    selected.map((r,i) =>
      `## ${i+1}. ${r.title}\n**Fuente:** ${r.sourceIcon} ${r.source?.toUpperCase()}${r.date?' | **Fecha:** '+r.date:''}${r.url?' | [Ver fuente]('+r.url+')':''}\n\n${r.snippet||r.content||''}\n`
    ).join('\n---\n\n');
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const fname = (juri.skillFolder || 'jurisprudencia').replace(/[^a-zA-Z0-9_-]/g,'_');
  a.download = `${fname}_${Date.now()}.md`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('✓ Exportado');
}


/* ────────────────────────────────────────────────────────────────
   4 · PANEL DE BÚSQUEDA (izquierda)
   ──────────────────────────────────────────────────────────────── */
function renderSearchPanel() {
  const tabs = [
    { id:'semantica', label:'🔍 Semántica' },
    { id:'cgr',       label:'🏛 CGR' },
    { id:'pjud',      label:'⚖️ PJUD' },
    { id:'manual',    label:'📋 Manual' },
  ];

  return `
  <div class="juri-search-panel">
    <div class="juri-panel-title">📚 Contexto y Fuentes</div>

    <!-- Docs añadidos -->
    ${juri.addedDocs.length ? `
    <div class="juri-docs-added">
      <div style="font-size:10px;color:var(--gold);font-weight:600;margin-bottom:5px">
        📎 ${juri.addedDocs.length} doc(s) en contexto
      </div>
      ${juri.addedDocs.map((d,i)=>`
        <div class="juri-doc-chip">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;font-size:10.5px">${juriEsc(d.title.substring(0,50))}</span>
          <button onclick="juriRemoveDoc(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:0 2px">✕</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Tabs búsqueda -->
    <div class="juri-search-tabs">
      ${tabs.map(t=>`<button class="juri-search-tab ${juri.searchTab===t.id?'active':''}" onclick="juriSwitchSearchTab('${t.id}')">${t.label}</button>`).join('')}
    </div>

    <!-- Tab: Búsqueda Semántica -->
    <div id="juriTabSemantica" style="${juri.searchTab==='semantica'?'':'display:none'}">
      <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:7px;line-height:1.4">
        Busca en las 4 colecciones Qdrant (dictámenes CGR, normativa, jurisprudencia, doctrina) con expansión automática de sinónimos jurídicos.
      </div>
      <textarea class="juri-input" id="juriSemanticQuery" rows="2"
        placeholder="Ej: proporcionalidad de sanciones disciplinarias, nulidad notificación..."
        oninput="juriPreviewExpansion(this.value)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();juriSemanticSearch()}"
      ></textarea>

      <!-- Preview expansión -->
      <div id="juriExpansionPreview" style="display:none;margin-bottom:7px"></div>

      <!-- Opciones -->
      <div class="juri-search-opts">
        <label class="juri-checkbox-label">
          <input type="checkbox" id="juriExpandTerms" ${juri.expandTerms?'checked':''} onchange="juri.expandTerms=this.checked"/>
          Expandir sinónimos
        </label>
        <div style="flex:1"></div>
        <select class="juri-select" id="juriCatFilter" onchange="juri.searchCategory=this.value||null" style="font-size:11px">
          <option value="">Todas las categorías</option>
          ${Object.entries(LEGAL_CATEGORIES).map(([k,c])=>`<option value="${k}" ${juri.searchCategory===k?'selected':''}>${c.label}</option>`).join('')}
        </select>
      </div>

      <!-- Portales web -->
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:5px;font-weight:600">Portales web (adicional):</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${Object.entries(SEARCH_PORTALS).map(([k,p])=>`
            <button class="juri-portal-btn ${juri.searchPortals.has(k)?'active':''}" onclick="juriTogglePortal('${k}')">
              ${p.icon} ${p.label}
            </button>`).join('')}
        </div>
      </div>

      <button class="juri-search-btn" onclick="juriSemanticSearch()" ${juri.searchLoading?'disabled':''}>
        ${juri.searchLoading ? '<span class="juri-spinner"></span> Buscando…' : '🔍 Buscar en Qdrant + Web'}
      </button>
    </div>

    <!-- Tab: CGR -->
    <div id="juriTabCgr" style="${juri.searchTab==='cgr'?'':'display:none'}">
      <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">
        Busca directamente en el portal de Contraloría General de la República o extrae por URL.
      </div>
      <div class="juri-row">
        <input class="juri-input" id="juriCgrUrl" placeholder="URL de dictamen CGR…" style="flex:1"/>
        <button class="btn-sm" onclick="juriExtractUrl('cgr')">Extraer</button>
      </div>
      <a href="https://www.contraloria.cl/web/guest/dictamenes" target="_blank" class="juri-portal-link">
        🏛 Abrir Buscador de Dictámenes CGR →
      </a>
    </div>

    <!-- Tab: PJUD -->
    <div id="juriTabPjud" style="${juri.searchTab==='pjud'?'':'display:none'}">
      <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">
        Busca sentencias por ROL o extrae desde URL del portal PJUD.
      </div>
      <div class="juri-row" style="margin-bottom:7px">
        <input class="juri-input" id="juriRolNum" placeholder="ROL (ej: 1234-2024)" style="flex:1"/>
        <button class="btn-sm" onclick="juriRolSearch()">Buscar ROL</button>
      </div>
      <div class="juri-row">
        <input class="juri-input" id="juriPjudUrl" placeholder="URL sentencia PJUD…" style="flex:1"/>
        <button class="btn-sm" onclick="juriExtractUrl('pjud')">Extraer</button>
      </div>
      <div id="juriRolResults" style="margin-top:8px"></div>
      <a href="https://juris.pjud.cl/juris/unificada/" target="_blank" class="juri-portal-link">
        ⚖️ Abrir Buscador Unificado PJUD →
      </a>
    </div>

    <!-- Tab: Manual -->
    <div id="juriTabManual" style="${juri.searchTab==='manual'?'':'display:none'}">
      <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:7px">
        Pega texto de dictámenes, sentencias o resoluciones:
      </div>
      <textarea class="juri-input" id="juriManualText" rows="6"
        placeholder="Pega aquí el contenido del dictamen, sentencia o resolución…"
        style="min-height:120px"></textarea>
      <div class="juri-row" style="margin-top:7px">
        <input class="juri-input" id="juriManualTitle" placeholder="Título / N° referencia" style="flex:1"/>
        <button class="btn-sm" onclick="juriAddManual()">+ Agregar</button>
      </div>
    </div>

    <!-- Resultados de búsqueda -->
    ${juri.searchResults ? `
    <div class="juri-results-area" id="juriResultsArea">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <div style="font-size:10.5px;font-weight:600;color:var(--gold)">📋 Resultados</div>
        <button class="btn-sm" onclick="juriAddAllToContext()">+ Usar todo</button>
      </div>
      <div class="juri-results-body">${md(juri.searchResults)}</div>
    </div>` : ''}
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   5 · EDITOR DE SECCIONES (derecha)
   ──────────────────────────────────────────────────────────────── */
function renderSectionEditor(mode) {
  const isBusy = juri.generating;

  return `
  <div class="juri-editor">
    <div class="juri-editor-header">
      <textarea class="juri-topic-input" id="juriTopicInput"
        placeholder="Tema del análisis (ej: notificaciones en sumario administrativo, proporcionalidad de sanciones…)"
        rows="2" oninput="juri.topic=this.value"
      >${juriEsc(juri.topic)}</textarea>
      <div class="juri-editor-actions">
        <button class="btn-save" style="padding:6px 14px;font-size:11.5px"
          onclick="juriGenerateAll()" ${isBusy||!juri.topic.trim()?'disabled':''}>
          ${juri.generating ? '<span class="juri-spinner" style="margin-right:5px"></span>Generando…' : '▶ Generar análisis completo'}
        </button>
        <button class="btn-sm" onclick="juriClearAll()">↺ Limpiar</button>
        <button class="btn-sm" onclick="juriSaveAnalysis()" title="Guardar análisis">💾</button>
        <button class="btn-sm" onclick="juriExportMarkdown()" title="Exportar Markdown">↓ MD</button>
      </div>
    </div>

    <!-- Indicador de progreso global -->
    ${juri.generating ? `
    <div class="juri-gen-progress">
      <span class="juri-spinner"></span>
      <span style="font-size:11.5px;color:var(--gold)">
        ${juri.currentSection ? 'Generando: '+juriEsc(juri.currentSection)+'…' : 'Iniciando…'}
      </span>
    </div>` : ''}

    <!-- Secciones -->
    <div class="juri-sections">
      ${mode.sections.map(s => renderSection(s)).join('')}
    </div>

    <!-- Análisis guardados -->
    ${juri.savedAnalyses.length ? `
    <div class="juri-saved-section">
      <div style="font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Análisis guardados</div>
      ${juri.savedAnalyses.slice(0,5).map(a=>`
        <div class="juri-saved-row" onclick="juriLoadAnalysis('${a.id}')">
          <div style="flex:1;min-width:0">
            <div style="font-size:11.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${juriEsc(a.topic?.substring(0,60)||'Sin tema')}</div>
            <div style="font-size:10px;color:var(--text-muted)">${a.mode||'—'} · ${new Date(a.created_at).toLocaleDateString('es-CL')}</div>
          </div>
          <button class="btn-del" onclick="event.stopPropagation();juriDeleteAnalysis('${a.id}')" title="Eliminar">✕</button>
        </div>`).join('')}
    </div>` : ''}
  </div>`;
}

function renderSection(s) {
  const state = juri.sections[s.id] || { status:'pending', content:'' };
  const isGenerating = state.status === 'generating';
  const isDone = state.status === 'done';
  const hasContent = isDone && state.content;

  return `
  <div class="juri-section ${isDone?'done':''}" id="sec-${s.id}">
    <div class="juri-section-header" onclick="juriToggleSection('${s.id}')">
      <div style="display:flex;align-items:center;gap:8px">
        <span class="juri-status-dot ${isDone?'done':isGenerating?'loading':''}"></span>
        <span style="font-size:12px;font-weight:${isDone?600:500}">${s.title}</span>
      </div>
      <div style="display:flex;gap:5px;align-items:center">
        ${isDone ? `<button class="btn-sm" style="font-size:10px;padding:2px 8px" onclick="event.stopPropagation();juriCopySection('${s.id}')" title="Copiar">📋</button>` : ''}
        <button class="btn-sm" style="font-size:10px;padding:2px 8px"
          onclick="event.stopPropagation();juriGenerateSection('${s.id}')"
          ${isGenerating||(!juri.topic.trim())?'disabled':''}>
          ${isGenerating ? '<span class="juri-spinner" style="width:8px;height:8px"></span>' : isDone ? '↻ Regen.' : '▶ Generar'}
        </button>
      </div>
    </div>
    ${hasContent ? `
    <div class="juri-section-body" id="secbody-${s.id}" style="display:${state.expanded?'block':'none'}">
      <div class="juri-section-content">${md(state.content)}</div>
    </div>` : isGenerating ? `
    <div class="juri-section-body" id="secbody-${s.id}" style="display:block">
      <div class="juri-generating-line">
        <span class="juri-spinner"></span>
        <span style="font-size:11.5px;color:var(--text-muted)">Generando con IA…</span>
      </div>
    </div>` : ''}
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   6 · BÚSQUEDA SEMÁNTICA
   ──────────────────────────────────────────────────────────────── */
function juriPreviewExpansion(query) {
  const preview = document.getElementById('juriExpansionPreview');
  if (!preview || !query.trim()) { if(preview)preview.style.display='none'; return; }
  const expanded = juriExpandTerms(query);
  if (expanded.length <= 1) { preview.style.display='none'; return; }
  preview.style.display='block';
  preview.innerHTML=`<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Sinónimos detectados:</div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${expanded.slice(1,6).map(t=>`<span style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:10px;padding:1px 8px;font-size:10px;color:var(--gold)">${juriEsc(t)}</span>`).join('')}
    </div>`;
}

function juriExpandTerms(query) {
  const expanded = new Set([query]);
  const lower = query.toLowerCase();
  for (const [key, syns] of Object.entries(LEGAL_SYNONYMS)) {
    if (lower.includes(key.toLowerCase())) syns.forEach(s => expanded.add(s));
  }
  return Array.from(expanded).slice(0, 8);
}

function juriDetectCategory(query) {
  const lower = query.toLowerCase();
  let best = null, bestScore = 0;
  for (const [key, cat] of Object.entries(LEGAL_CATEGORIES)) {
    const score = cat.keywords.filter(kw => lower.includes(kw.toLowerCase())).length;
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return best;
}

async function juriSemanticSearch() {
  const query = document.getElementById('juriSemanticQuery')?.value.trim();
  if (!query) { showToast('⚠ Ingresa un término de búsqueda'); return; }
  if (juri.searchLoading) return;

  // AI usage guard
  if (juri.aiBlocked) { showToast('⚠ Límite de uso IA alcanzado. Contacta al administrador.'); return; }

  juri.searchLoading = true;
  juri.searchResults = '';
  renderJuriSearchPanel();

  const category = juri.searchCategory || juriDetectCategory(query);

  try {
    // Búsqueda Qdrant vía Netlify RAG (funcional y sin timeout)
    const ragData = await _juriSearchRAG(query, 'todos');

    if (ragData.context && ragData.count > 0) {
      juri.searchResults = `## 📚 Biblioteca Qdrant (${ragData.count} resultados)\n\n` + ragData.context;
    } else {
      juri.searchResults = '⚠ Sin resultados para esta búsqueda. Intenta términos más específicos.';
    }

    if (category) {
      showToast(`🎯 Categoría detectada: ${LEGAL_CATEGORIES[category]?.label || category}`);
    }

  } catch (err) {
    console.error('juriSemanticSearch:', err);
    juri.searchResults = `⚠ Error al buscar: ${err.message}`;
  } finally {
    juri.searchLoading = false;
    renderJuriView();
  }
}

// Re-renderiza solo el panel izquierdo durante la búsqueda
function renderJuriSearchPanel() {
  const left = document.getElementById('juriLeft');
  if (left) left.innerHTML = renderSearchPanel();
}

/* ────────────────────────────────────────────────────────────────
   7 · BÚSQUEDA POR ROL PJUD
   ──────────────────────────────────────────────────────────────── */
async function juriRolSearch() {
  const rol = document.getElementById('juriRolNum')?.value.trim();
  if (!rol) { showToast('⚠ Ingresa un número de ROL'); return; }
  const res = document.getElementById('juriRolResults');
  if (!res) return;
  res.innerHTML = '<div class="loading">Buscando ROL en biblioteca…</div>';

  try {
    // Buscar en Qdrant con el ROL como query
    const ragData = await _juriSearchRAG('ROL ' + rol, 'todos');
    if (!ragData.context || !ragData.count) {
      res.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Sin resultados para este ROL. Puedes buscarlo directamente en <a href="https://juris.pjud.cl/juris/unificada/" target="_blank">PJUD</a>.</div>';
      return;
    }
    const blocks = ragData.context.split('\n\n---\n\n').slice(0, 5);
    res.innerHTML = blocks.map((block, i) => {
      const headerMatch = block.match(/\[Fuente:\s*(.+?)\s*\|/);
      const title = headerMatch ? headerMatch[1] : `Resultado ${i+1}`;
      const content = headerMatch ? block.substring(block.indexOf(']') + 1).trim() : block;
      return `<div class="juri-rol-result">
        <div style="font-size:11.5px;font-weight:500">${juriEsc(title)}</div>
        <div style="font-size:10.5px;color:var(--text-muted)">${juriEsc(content.substring(0, 120))}…</div>
        <div style="display:flex;gap:5px;margin-top:5px">
          <button class="btn-sm" style="font-size:10px" onclick="juriAddDoc('${juriEsc(title)}','${juriEsc(content.substring(0,500).replace(/'/g,"\\'"))}')">+ Contexto</button>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    res.innerHTML = `<div style="font-size:11px;color:var(--red)">Error: ${juriEsc(err.message)}</div>`;
  }
}

async function juriExtractUrl(type) {
  const id = type === 'cgr' ? 'juriCgrUrl' : 'juriPjudUrl';
  const url = document.getElementById(id)?.value.trim();
  if (!url) { showToast('⚠ Ingresa una URL'); return; }

  if (type === 'pjud') {
    // Intentar extraer ROL de la URL para buscar en PJUD
    const rolMatch = url.match(/(\d{1,7}[-–]\d{4})/);
    if (rolMatch) {
      showToast('🔍 Buscando ROL ' + rolMatch[1] + ' en PJUD...');
      try {
        const data = await _juriSearchPJUD(rolMatch[1], 'Corte_Suprema', 5);
        if (data.results && data.results.length > 0) {
          data.results.forEach(r => {
            const title = `ROL ${r.rol || rolMatch[1]} — ${r.caratulado || 'PJUD'}`;
            const meta = [r.fecha, r.sala, r.tipoRecurso].filter(Boolean).join(' | ');
            juriAddDoc(title, (meta ? meta + '\n\n' : '') + (r.fullText || r.preview || ''));
          });
          showToast('✓ ' + data.results.length + ' sentencia(s) añadida(s) al contexto');
          return;
        }
      } catch (err) {
        console.warn('PJUD extract error:', err);
      }
    }
    showToast('ℹ No se encontró el ROL. Pega el contenido manualmente en "Texto libre".');
  } else if (type === 'cgr') {
    // Intentar extraer número de dictamen de la URL o texto
    const dictMatch = url.match(/(?:D|OF|E)?\s*(\d{1,6})(?:N\d{2})?/i);
    if (dictMatch) {
      showToast('🔍 Buscando dictamen ' + dictMatch[0] + ' en CGR...');
      try {
        const data = await _juriSearchCGR(dictMatch[0], 'dictamenes', 5);
        if (data.results && data.results.length > 0) {
          data.results.forEach(r => {
            const title = `Dictamen CGR N° ${r.nDictamen || dictMatch[0]} (${r.fecha || ''})`;
            const meta = [r.materia, r.descriptores, r.fuentes].filter(Boolean).join('\n');
            juriAddDoc(title, (meta ? meta + '\n\n' : '') + (r.docCompleto || ''));
          });
          showToast('✓ ' + data.results.length + ' dictamen(es) añadido(s) al contexto');
          return;
        }
      } catch (err) {
        console.warn('CGR extract error:', err);
      }
    }
    showToast('ℹ No se encontró el dictamen. Pega el contenido manualmente en "Texto libre".');
  }
}

/* ────────────────────────────────────────────────────────────────
   8 · GESTIÓN DE DOCS EN CONTEXTO
   ──────────────────────────────────────────────────────────────── */
function juriAddManual() {
  const text  = document.getElementById('juriManualText')?.value.trim();
  const title = document.getElementById('juriManualTitle')?.value.trim() || 'Documento manual';
  if (!text) { showToast('⚠ Pega texto primero'); return; }
  juriAddDoc(title, text);
  const el = document.getElementById('juriManualText'); if(el) el.value = '';
  const ti = document.getElementById('juriManualTitle'); if(ti) ti.value = '';
}

function juriAddDoc(title, content) {
  juri.addedDocs.push({ title, content, added: new Date().toISOString() });
  renderJuriView();
  showToast(`✓ "${title.substring(0,30)}" añadido al análisis`);
}

function juriRemoveDoc(idx) {
  juri.addedDocs.splice(idx, 1);
  renderJuriView();
}

function juriAddAllToContext() {
  if (!juri.searchResults) return;
  juriAddDoc('Resultados de búsqueda', juri.searchResults);
}

function juriGetFullContext() {
  const docs = juri.addedDocs.map((d,i)=>`[FUENTE ${i+1}: ${d.title}]\n${d.content}`).join('\n\n---\n\n');
  return [juri.searchResults, docs].filter(Boolean).join('\n\n---\n\n');
}

/* ────────────────────────────────────────────────────────────────
   9 · GENERACIÓN DE SECCIONES
   ──────────────────────────────────────────────────────────────── */
async function juriGenerateSection(sectionId) {
  if (!juri.topic.trim()) { showToast('⚠ Ingresa el tema del análisis primero'); return; }
  if (juri.aiBlocked) { showToast('⚠ Límite de uso IA alcanzado'); return; }

  // Marcar como generando
  juri.sections[sectionId] = { status: 'generating', content: '', expanded: true };
  juri.currentSection = sectionId;
  updateSectionUI(sectionId);

  const mode = ANALYSIS_MODES[juri.mode];
  const sectionDef = mode.sections.find(s => s.id === sectionId);
  const searchContext = juriGetFullContext();
  const previousSections = mode.sections
    .filter(s => juri.sections[s.id]?.status === 'done')
    .map(s => ({ title: s.title, content: juri.sections[s.id].content }))
    .slice(-3);

  // Construir prompt de sistema para generación
  const systemPrompt = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).
Genera la sección "${sectionDef?.title || sectionId}" de un análisis ${mode.label} sobre el tema indicado.

MODO: ${juri.mode}
SECCIONES DEL ANÁLISIS: ${mode.sections.map(s => s.title).join(' | ')}

CONTEXTO DE BÚSQUEDA (fuentes relevantes encontradas):
${searchContext.substring(0, 12000) || '(Sin contexto de búsqueda disponible)'}

${previousSections.length ? 'SECCIONES YA GENERADAS:\n' + previousSections.map(s => `${s.title}:\n${s.content}`).join('\n\n---\n\n').substring(0, 8000) : ''}

${juri.addedDocs.length ? 'DOCUMENTOS ADJUNTOS:\n' + juri.addedDocs.map(d => d.content).join('\n\n').substring(0, 10000) : ''}

INSTRUCCIONES:
- Genera SOLO la sección solicitada, no las demás
- Usa un tono formal, claro y preciso propio de un documento jurídico
- Cita fuentes normativas y jurisprudenciales cuando sea posible
- Si no hay contexto suficiente, indica qué información faltaría
- Responde en español

ESTILO OBLIGATORIO:
- Redacción indistinguible de un profesional jurídico humano. Varía la longitud de oraciones
- Prosa continua con conectores naturales: "sin embargo", "no obstante", "a mayor abundamiento", "en lo pertinente"
- NUNCA uses marcas de IA: "Es importante destacar", "Cabe mencionar", "En este contexto", "En resumen"
- NUNCA emojis, NUNCA frases de chatbot. NUNCA formato Markdown
- SOLO cita dictámenes, sentencias y normas cuya existencia puedas confirmar de las fuentes. Si no estás seguro: [VERIFICAR]`;

  const userMsg = `Genera la sección "${sectionDef?.title || sectionId}" del análisis ${mode.label} sobre:\n\n${juri.topic}`;

  try {
    const content = await _juriStreamGenerate({
      systemPrompt,
      userMsg,
      maxTokens: 4000,
      onProgress: (text) => {
        juri.sections[sectionId] = { status: 'generating', content: text, expanded: true };
        updateSectionUI(sectionId);
      }
    });

    juri.sections[sectionId] = { status: 'done', content, expanded: true };

    // Registrar uso IA si módulo de seguridad disponible
    if (typeof trackAIUsage === 'function') trackAIUsage('F10', sectionId);

  } catch (err) {
    console.error('juriGenerateSection:', err);
    juri.sections[sectionId] = { status: 'error', content: `⚠ Error al generar: ${err.message}`, expanded: true };
  } finally {
    juri.currentSection = null;
    updateSectionUI(sectionId);
  }
}

async function juriGenerateAll() {
  if (!juri.topic.trim()) { showToast('⚠ Ingresa el tema del análisis'); return; }
  if (juri.aiBlocked) { showToast('⚠ Límite de uso IA alcanzado'); return; }
  if (juri.generating) return;
  juri.generating = true;

  const mode = ANALYSIS_MODES[juri.mode];

  // Primero buscar contexto semántico si no hay
  if (!juri.searchResults && !juri.addedDocs.length) {
    juri.searchLoading = true;
    renderJuriView();
    const el = document.getElementById('juriSemanticQuery');
    if (el) el.value = juri.topic;
    await juriSemanticSearch();
    juri.searchLoading = false;
  }

  renderJuriView();

  for (const section of mode.sections) {
    if (juri.sections[section.id]?.status === 'done') continue; // skip ya generadas
    await juriGenerateSection(section.id);
    await new Promise(r => setTimeout(r, 500)); // pausa entre secciones
  }

  juri.generating = false;
  renderJuriView();
  showToast('✓ Análisis completo generado');
  await juriSaveAnalysis();
}

// Actualizar solo la sección afectada (sin re-render completo)
function updateSectionUI(sectionId) {
  const container = document.getElementById(`sec-${sectionId}`);
  if (!container) { renderJuriView(); return; }
  const mode = ANALYSIS_MODES[juri.mode];
  const s = mode.sections.find(x => x.id === sectionId);
  if (s) container.outerHTML = renderSection(s);
  // update gen-progress bar
  const bar = document.querySelector('.juri-gen-progress span:last-child');
  if (bar && juri.currentSection) bar.textContent = 'Generando: ' + juri.currentSection + '…';
}

/* ────────────────────────────────────────────────────────────────
   10 · ACCIONES DE SECCIÓN
   ──────────────────────────────────────────────────────────────── */
function juriToggleSection(id) {
  if (!juri.sections[id]?.content) return;
  juri.sections[id].expanded = !juri.sections[id].expanded;
  const body = document.getElementById(`secbody-${id}`);
  if (body) body.style.display = juri.sections[id].expanded ? 'block' : 'none';
}

function juriCopySection(id) {
  const content = juri.sections[id]?.content;
  if (!content) return;
  navigator.clipboard.writeText(content);
  showToast('✓ Sección copiada al portapapeles');
}

function juriClearAll() {
  juri.sections = {};
  juri.searchResults = '';
  juri.addedDocs = [];
  juri.topic = '';
  renderJuriView();
}

function juriExportMarkdown() {
  const mode = ANALYSIS_MODES[juri.mode];
  const parts = [
    `# Análisis Jurisprudencial: ${juri.topic}\n`,
    `**Modo:** ${mode.label}  `,
    `**Fecha:** ${new Date().toLocaleDateString('es-CL')}\n\n---\n`,
  ];
  mode.sections.forEach(s => {
    const c = juri.sections[s.id]?.content;
    if (c) parts.push(`\n## ${s.title}\n\n${c}\n`);
  });
  const blob = new Blob([parts.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analisis_juridico_${Date.now()}.md`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('✓ Análisis exportado');
}

/* ────────────────────────────────────────────────────────────────
   11 · PERSISTENCIA EN SUPABASE
   ──────────────────────────────────────────────────────────────── */
async function juriSaveAnalysis() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || !juri.topic.trim()) return;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const payload = {
    user_id:    user.id,
    topic:      juri.topic,
    mode:       juri.mode,
    sections:   JSON.stringify(juri.sections),
    context:    juri.searchResults?.substring(0, 10000) || null,
    updated_at: new Date().toISOString(),
  };

  if (juri.activeAnalysisId) {
    await sb.from('jurisprudencia_analyses').update(payload).eq('id', juri.activeAnalysisId);
  } else {
    const { data } = await sb.from('jurisprudencia_analyses').insert(payload).select('id').single();
    if (data?.id) juri.activeAnalysisId = data.id;
  }
  showToast('💾 Análisis guardado');
  loadSavedAnalyses();
}

async function loadSavedAnalyses() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb.from('jurisprudencia_analyses')
      .select('id, topic, mode, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    juri.savedAnalyses = data || [];
    // Re-render saved list only
    const el = document.querySelector('.juri-saved-section');
    if (el && juri.savedAnalyses.length) {
      el.innerHTML = `
        <div style="font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Análisis guardados</div>
        ${juri.savedAnalyses.slice(0,5).map(a=>`
          <div class="juri-saved-row" onclick="juriLoadAnalysis('${a.id}')">
            <div style="flex:1;min-width:0">
              <div style="font-size:11.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${juriEsc(a.topic?.substring(0,60)||'Sin tema')}</div>
              <div style="font-size:10px;color:var(--text-muted)">${a.mode||'—'} · ${new Date(a.created_at).toLocaleDateString('es-CL')}</div>
            </div>
            <button class="btn-del" onclick="event.stopPropagation();juriDeleteAnalysis('${a.id}')" title="Eliminar">✕</button>
          </div>`).join('')}`;
    }
  } catch (err) {
    console.error('loadSavedAnalyses:', err);
  }
}

async function juriLoadAnalysis(id) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { data } = await sb.from('jurisprudencia_analyses').select('*').eq('id', id).single();
  if (!data) return;
  juri.topic    = data.topic;
  juri.mode     = data.mode || 'jurisprudencial';
  juri.sections = JSON.parse(data.sections || '{}');
  juri.searchResults = data.context || '';
  juri.activeAnalysisId = id;
  renderJuriView();
  showToast('✓ Análisis cargado');
}

async function juriDeleteAnalysis(id) {
  if (!confirm('¿Eliminar este análisis guardado?')) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  await sb?.from('jurisprudencia_analyses').delete().eq('id', id);
  if (juri.activeAnalysisId === id) { juri.activeAnalysisId = null; juri.sections = {}; }
  loadSavedAnalyses();
  showToast('✓ Análisis eliminado');
}

/* ────────────────────────────────────────────────────────────────
   12 · TABS + PORTALES
   ──────────────────────────────────────────────────────────────── */
function juriSwitchSearchTab(tab) {
  juri.searchTab = tab;
  renderJuriSearchPanel();
}

function juriTogglePortal(portal) {
  if (juri.searchPortals.has(portal)) juri.searchPortals.delete(portal);
  else juri.searchPortals.add(portal);
  renderJuriSearchPanel();
}

/* ────────────────────────────────────────────────────────────────
   13 · UTILIDADES
   ──────────────────────────────────────────────────────────────── */
function juriEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ────────────────────────────────────────────────────────────────
   14 · CSS
   ──────────────────────────────────────────────────────────────── */
(function injectJuriCSS() {
  if (document.getElementById('juri-css')) return;
  const s = document.createElement('style');
  s.id = 'juri-css';
  s.textContent = `
/* KPI */
.juri-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 14px;flex-shrink:0;}
.juri-kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;}
.juri-kpi-val{font-family:'EB Garamond',serif;font-size:26px;line-height:1;margin-bottom:2px;}
.juri-kpi-label{font-size:10px;color:var(--text-muted);}
/* Layout */
.juri-layout{display:grid;grid-template-columns:320px 1fr;gap:0;flex:1;overflow:hidden;min-height:0;}
.juri-left{overflow-y:auto;border-right:1px solid var(--border);padding:12px;}
.juri-right{overflow-y:auto;padding:12px;}
/* Search panel */
.juri-search-panel{display:flex;flex-direction:column;gap:8px;}
.juri-panel-title{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;}
.juri-search-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:8px;}
.juri-search-tab{padding:5px 10px;font-size:11px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',sans-serif;white-space:nowrap;}
.juri-search-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:500;}
.juri-input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12px;outline:none;transition:border-color .15s;resize:vertical;}
.juri-input:focus{border-color:var(--gold-dim);}
.juri-select{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:11px;outline:none;}
.juri-search-opts{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
.juri-checkbox-label{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-dim);cursor:pointer;}
.juri-portal-btn{background:none;border:1px solid var(--border2);color:var(--text-muted);padding:3px 10px;border-radius:10px;font-size:10.5px;cursor:pointer;transition:all .15s;font-family:'Inter',sans-serif;}
.juri-portal-btn.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);}
.juri-search-btn{width:100%;background:var(--gold);border:none;color:#fff;padding:8px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:7px;}
.juri-search-btn:hover{background:var(--gold-dim);}
.juri-search-btn:disabled{opacity:.5;cursor:not-allowed;}
.juri-portal-link{display:block;font-size:11px;color:var(--gold);text-decoration:none;padding:6px 10px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);margin-top:7px;}
.juri-portal-link:hover{background:rgba(79,70,229,.12);}
.juri-row{display:flex;gap:6px;align-items:center;}
.juri-results-area{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-top:8px;max-height:320px;overflow-y:auto;}
.juri-results-body{font-size:11.5px;line-height:1.65;color:var(--text-dim);}
.juri-docs-added{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:8px 10px;margin-bottom:8px;}
.juri-doc-chip{display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid rgba(79,70,229,.1);}
.juri-rol-result{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;margin-bottom:6px;}
/* Editor */
.juri-editor{display:flex;flex-direction:column;gap:8px;}
.juri-editor-header{display:flex;flex-direction:column;gap:7px;}
.juri-topic-input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:8px 11px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:13px;outline:none;resize:vertical;transition:border-color .15s;}
.juri-topic-input:focus{border-color:var(--gold-dim);}
.juri-editor-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;}
.juri-gen-progress{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(79,70,229,.06);border:1px solid var(--gold-dim);border-radius:var(--radius);}
.juri-mode-active{background:var(--gold-glow)!important;border-color:var(--gold-dim)!important;color:var(--gold)!important;}
/* Sections */
.juri-sections{display:flex;flex-direction:column;gap:5px;}
.juri-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);transition:border-color .15s;}
.juri-section.done{border-left:3px solid var(--gold);}
.juri-section-header{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;cursor:pointer;}
.juri-section-header:hover{background:var(--surface2);}
.juri-section-body{padding:0 12px 12px;border-top:1px solid var(--border);}
.juri-section-content{font-size:12.5px;line-height:1.7;color:var(--text-dim);}
.juri-status-dot{width:8px;height:8px;border-radius:50%;background:var(--border2);flex-shrink:0;}
.juri-status-dot.done{background:var(--gold);}
.juri-status-dot.loading{background:var(--blue);animation:pulse 1s ease-in-out infinite;}
.juri-generating-line{display:flex;align-items:center;gap:8px;padding:12px 0;color:var(--text-muted);font-size:12px;}
/* Saved */
.juri-saved-section{margin-top:14px;border-top:1px solid var(--border);padding-top:10px;}
.juri-saved-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--radius);cursor:pointer;border:1px solid transparent;transition:all .14s;margin-bottom:4px;}
.juri-saved-row:hover{background:var(--surface2);border-color:var(--border);}
/* Spinner */
.juri-spinner{width:10px;height:10px;border:2px solid var(--gold-dim);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block;flex-shrink:0;}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
/* ── Panel switcher ── */
.juri-panel-switcher{display:flex;gap:0;padding:0 14px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.juri-panel-btn{display:flex;align-items:center;gap:6px;padding:9px 16px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border:none;border-bottom:2px solid transparent;background:none;font-family:var(--font-body,'Inter',sans-serif);transition:all .12s;}
.juri-panel-btn:hover{color:var(--text);}
.juri-panel-btn.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:600;}
/* ── SKILL panel ── */
.skill-wrap{padding:14px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;}
.skill-search-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;}
.skill-results-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;}
.skill-section-label{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;display:block;}
.skill-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.skill-field label{font-size:10.5px;font-weight:600;color:var(--text-muted);}
.skill-hint{font-weight:400;color:var(--text-muted);font-size:10px;margin-left:5px;}
.skill-input{background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12.5px;outline:none;transition:border-color .15s;resize:vertical;width:100%;}
.skill-input:focus{border-color:var(--gold-dim);background:var(--surface);}
.skill-select{background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:6px 10px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;width:100%;}
.skill-source-btn{padding:5px 12px;border-radius:18px;border:1px solid var(--border2);background:none;color:var(--text-muted);cursor:pointer;font-size:11.5px;font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.skill-source-btn:hover{color:var(--text);border-color:var(--border);}
.skill-source-btn.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:500;}
.skill-search-btn{width:100%;background:var(--gold);border:none;color:#fff;padding:11px;border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:700;font-family:var(--font-body,'Inter',sans-serif);display:flex;align-items:center;justify-content:center;gap:8px;margin-top:4px;transition:background .15s;}
.skill-search-btn:hover{background:var(--gold-dim);}
.skill-search-btn:disabled{opacity:.45;cursor:not-allowed;}
.skill-progress-bar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:8px;}
.skill-progress-fill{height:100%;width:60%;background:var(--gold);border-radius:2px;animation:skillProgress 1.5s ease-in-out infinite;}
@keyframes skillProgress{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}
/* Results */
.skill-results-list{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;max-height:460px;overflow-y:auto;}
.skill-result-item{display:flex;align-items:flex-start;gap:9px;padding:9px 11px;border:1px solid var(--border);border-radius:var(--radius);transition:all .1s;cursor:default;}
.skill-result-item:hover{background:var(--surface2);}
.skill-result-item.selected{background:var(--gold-glow);border-color:var(--gold-dim);}
.skill-check{width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0;margin-top:2px;}
.skill-result-body{flex:1;min-width:0;}
.skill-result-title{font-size:12.5px;font-weight:500;color:var(--text);margin-bottom:4px;line-height:1.4;}
.skill-result-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;}
.skill-source-tag{font-size:10px;font-weight:600;padding:1px 7px;border-radius:8px;}
.skill-src-cgr{background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.2);color:var(--green);}
.skill-src-pjud{background:rgba(79,70,229,.07);border:1px solid rgba(79,70,229,.18);color:var(--gold);}
.skill-src-qdrant{background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);color:#d97706;}
.skill-src-ia,.skill-src-web{background:var(--surface2);border:1px solid var(--border);color:var(--text-muted);}
.skill-link{font-size:10.5px;color:var(--gold);text-decoration:none;}
.skill-link:hover{text-decoration:underline;}
.skill-result-snippet{font-size:11.5px;color:var(--text-dim);line-height:1.55;}
/* Actions */
.skill-actions{display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid var(--border);flex-wrap:wrap;gap:8px;}
/* Summary */
.skill-summary-wrap{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:14px;}
.skill-summary-content{font-size:12.5px;line-height:1.7;color:var(--text-dim);}
.skill-summary-content h1,.skill-summary-content h2,.skill-summary-content h3{font-family:var(--font-serif,'EB Garamond',serif);color:var(--gold);margin:8px 0 4px;}
/* Empty */
.skill-empty{text-align:center;padding:48px 24px;color:var(--text-muted);}
.skill-portal-links{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;}
.skill-portal-btn-link{display:inline-flex;align-items:center;gap:5px;padding:7px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);font-size:12px;color:var(--gold);text-decoration:none;transition:all .12s;}
.skill-portal-btn-link:hover{background:var(--gold-glow);border-color:var(--gold-dim);}
`;
  document.head.appendChild(s);
})();

/* ────────────────────────────────────────────────────────────────
   15 · INYECCIÓN DE VISTA
   ──────────────────────────────────────────────────────────────── */
(function injectJuriView() {
  if (document.getElementById('viewJurisprudencia')) return;
  const view = document.createElement('div');
  view.id = 'viewJurisprudencia';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';
  view.innerHTML = `
    <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;display:flex;align-items:baseline;justify-content:space-between">
      <div>
        <div style="font-family:'EB Garamond',serif;font-size:21px;font-weight:400">⚖️ Análisis Jurisprudencial</div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">Búsqueda SKILL · Análisis IRAC · CGR · PJUD · Qdrant</div>
      </div>
    </div>
    <div id="juriMain" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
      <div class="loading">Cargando…</div>
    </div>`;
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();
