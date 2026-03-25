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
  funcionarios:   { label:'Régimen Funcionario',            keywords:['funcionario','estatuto','contrata','planta','honorarios','probidad'],       collections:['administrative_discipline','administrative_book'] },
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
  // AI usage guard (set by mod-seguridad)
  aiBlocked:     false,
};

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

  const mode = ANALYSIS_MODES[juri.mode];
  const isBusy = juri.generating || juri.searchLoading;

  // KPI row
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

  // Layout: izquierda search, derecha editor
  main.innerHTML = kpiHtml + `
  <div class="juri-layout">
    <!-- PANEL IZQUIERDO: búsqueda y contexto -->
    <div class="juri-left" id="juriLeft">
      ${renderSearchPanel()}
    </div>
    <!-- PANEL DERECHO: editor de secciones -->
    <div class="juri-right" id="juriRight">
      ${renderSectionEditor(mode)}
    </div>
  </div>`;
}

/* ── Modo ── */
function juriSetMode(mode) {
  juri.mode = mode;
  juri.sections = {};
  renderJuriView();
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

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) { juri.searchLoading = false; return; }

  const expandTerms = document.getElementById('juriExpandTerms')?.checked ?? true;
  const category = juri.searchCategory || juriDetectCategory(query);
  const portals = [...juri.searchPortals];

  try {
    const { data, error } = await sb.functions.invoke('analyze-jurisprudencia', {
      body: {
        action:         'semantic_search',
        topic:          query,
        expandTerms,
        category:       category || undefined,
        searchQdrant:   true,
        searchWeb:      portals.length > 0,
        searchPortals:  portals.map(p => p === 'dc' ? 'diarioconstitucional' : p),
      }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    // Format results
    const qdrantPart = data?.qdrantResults?.length
      ? `## 📚 Biblioteca Qdrant (${data.qdrantResults.length} resultados)\n\n` +
        data.qdrantResults.slice(0,10).map((r, i) =>
          `**${i+1}. ${r.title}** _(${r.collection}, score: ${(r.score*100).toFixed(0)}%)_\n${r.content?.substring(0,400) || ''}…`
        ).join('\n\n---\n\n')
      : '';

    const webPart = data?.webResults?.length
      ? `\n\n## 🌐 Portales Web\n\n` +
        data.webResults.flatMap(p =>
          p.results?.slice(0,3).map((r,i) =>
            `**${p.portal.toUpperCase()} ${i+1}. ${r.title||'Sin título'}**\n${r.description||r.text||''}…`
          ) || []
        ).join('\n\n---\n\n')
      : '';

    juri.searchResults = (qdrantPart + webPart) ||
      data?.results ||
      '⚠ Sin resultados para esta búsqueda. Intenta términos más específicos.';

    if (category) {
      showToast(`🎯 Categoría detectada: ${LEGAL_CATEGORIES[category]?.label || category}`);
    }

  } catch (err) {
    console.error('juriSemanticSearch:', err);
    juri.searchResults = `⚠ Error al buscar: ${err.message}\n\nVerifica que la edge function \`analyze-jurisprudencia\` esté desplegada.`;
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
  res.innerHTML = '<div class="loading">Buscando ROL en PJUD…</div>';

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  try {
    const { data, error } = await sb?.functions.invoke('analyze-jurisprudencia', {
      body: { action: 'search', topic: `ROL ${rol}`, searchQdrant: false, searchWeb: true, searchPortals: ['pjud'] }
    }) || {};
    if (error) throw error;
    const results = data?.webResults?.[0]?.results || [];
    if (!results.length) { res.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Sin resultados para este ROL.</div>'; return; }
    res.innerHTML = results.slice(0,5).map((r,i)=>`
      <div class="juri-rol-result">
        <div style="font-size:11.5px;font-weight:500">${juriEsc(r.title||'Sentencia')}</div>
        <div style="font-size:10.5px;color:var(--text-muted)">${juriEsc(r.description?.substring(0,80)||'')}</div>
        <div style="display:flex;gap:5px;margin-top:5px">
          ${r.url?`<a href="${juriEsc(r.url)}" target="_blank" class="btn-sm" style="font-size:10px">Ver →</a>`:''}
          <button class="btn-sm" style="font-size:10px" onclick="juriAddDoc('${juriEsc(r.title||'Sentencia PJUD')}','${juriEsc((r.description||'').substring(0,300))}')">+ Contexto</button>
        </div>
      </div>`).join('');
  } catch (err) {
    res.innerHTML = `<div style="font-size:11px;color:var(--red)">Error: ${juriEsc(err.message)}</div>`;
  }
}

async function juriExtractUrl(type) {
  const id = type === 'cgr' ? 'juriCgrUrl' : 'juriPjudUrl';
  const url = document.getElementById(id)?.value.trim();
  if (!url) { showToast('⚠ Ingresa una URL'); return; }
  showToast('⏳ Extrayendo contenido…');
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  try {
    const { data, error } = await sb?.functions.invoke('analyze-jurisprudencia', {
      body: { action: 'search', topic: url, searchQdrant: false, searchWeb: true, searchPortals: [type==='cgr'?'cgr':'pjud'] }
    }) || {};
    if (error) throw error;
    const extracted = data?.webResults?.[0]?.results?.[0];
    if (extracted) {
      juriAddDoc(extracted.title || url, extracted.description || extracted.markdown || '');
      showToast(`✓ Documento extraído y añadido al contexto`);
    } else {
      showToast('⚠ No se pudo extraer contenido de esa URL');
    }
  } catch (err) {
    showToast('⚠ Error al extraer: ' + err.message);
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

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  const mode = ANALYSIS_MODES[juri.mode];
  const sectionDef = mode.sections.find(s => s.id === sectionId);
  const searchContext = juriGetFullContext();
  const previousSections = mode.sections
    .filter(s => juri.sections[s.id]?.status === 'done')
    .map(s => ({ title: s.title, content: juri.sections[s.id].content }))
    .slice(-3); // ultimas 3 para contexto

  try {
    const { data, error } = await sb.functions.invoke('analyze-jurisprudencia', {
      body: {
        action:           'generate',
        topic:            juri.topic,
        section:          sectionId,
        mode:             juri.mode,
        searchContext,
        previousSections,
        attachedFilesContext: juri.addedDocs.map(d => d.content).join('\n\n').substring(0, 50000),
      }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const content = data?.content || data?.section_content || '⚠ Sin contenido generado.';
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
        <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">Búsqueda semántica Qdrant · 3 modos IRAC · Portales CGR y PJUD</div>
      </div>
    </div>
    <div id="juriMain" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
      <div class="loading">Cargando…</div>
    </div>`;
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();
