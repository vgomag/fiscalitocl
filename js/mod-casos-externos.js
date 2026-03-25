/* ================================================================
   MOD-CASOS-EXTERNOS.JS — Análisis de Casos Externos
   Análisis jurídico externo · Disciplinario y Laboral · IA
   ================================================================
   v1.0 · 2026-03-25 · Fiscalito / UMAG
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   1 · DATOS Y CONFIGURACIÓN
   ──────────────────────────────────────────────────────────────── */

const CE_MODES = [
  { value:'disciplinario', label:'Proc. Disciplinario', icon:'⚖️',  desc:'Investigación sumaria · Sumario administrativo' },
  { value:'laboral',       label:'Derecho Laboral',     icon:'👷',  desc:'Tutela · Despido · Accidentes · Prestaciones' },
];

const CE_CASE_TYPES = {
  disciplinario:[
    { value:'acoso_laboral',      label:'Acoso Laboral' },
    { value:'acoso_sexual',       label:'Acoso Sexual' },
    { value:'discriminacion',     label:'Discriminación' },
    { value:'negligencia',        label:'Negligencia Administrativa' },
    { value:'falta_probidad',     label:'Falta de Probidad' },
    { value:'incumplimiento',     label:'Incumplimiento de Deberes' },
    { value:'maltrato',           label:'Maltrato Laboral' },
    { value:'otro',               label:'Otro' },
  ],
  laboral:[
    { value:'tutela_laboral',           label:'Tutela Laboral' },
    { value:'despido_injustificado',    label:'Despido Injustificado' },
    { value:'despido_indirecto',        label:'Despido Indirecto (Autodespido)' },
    { value:'accidente_trabajo',        label:'Accidente del Trabajo' },
    { value:'enfermedad_profesional',   label:'Enfermedad Profesional' },
    { value:'practicas_antisindicales', label:'Prácticas Antisindicales' },
    { value:'vulneracion_derechos',     label:'Vulneración de Derechos Fundamentales' },
    { value:'cobro_prestaciones',       label:'Cobro de Prestaciones Laborales' },
    { value:'otro_laboral',             label:'Otro' },
  ],
};

const CE_INSTITUTIONS = [
  { value:'carabineros',           label:'Carabineros de Chile' },
  { value:'pdi',                   label:'Policía de Investigaciones' },
  { value:'ffaa_ejercito',         label:'Ejército de Chile' },
  { value:'ffaa_armada',           label:'Armada de Chile' },
  { value:'ffaa_fach',             label:'Fuerza Aérea de Chile' },
  { value:'gendarmeria',           label:'Gendarmería de Chile' },
  { value:'salud_fonasa',          label:'FONASA' },
  { value:'salud_hospital',        label:'Hospital Público' },
  { value:'educacion_mineduc',     label:'MINEDUC' },
  { value:'educacion_universidad', label:'Universidad Estatal' },
  { value:'municipalidad',         label:'Municipalidad' },
  { value:'empresa_privada',       label:'Empresa Privada' },
  { value:'otro',                  label:'Otra Institución' },
];

const CE_FOCUS = {
  disciplinario:[
    { value:'acoso_laboral',    label:'Acoso Laboral',
      tmpl:'Analizar si los hechos configuran acoso laboral según el art. 2° CT. Evaluar: 1) conductas reiteradas de hostigamiento, 2) menoscabo o humillación, 3) perjuicio en la situación laboral, 4) relación de poder entre las partes, 5) indicadores de sistematicidad.' },
    { value:'acoso_sexual',     label:'Acoso Sexual',
      tmpl:'Evaluar la configuración de acoso sexual conforme al art. 2° inc. 2° CT. Verificar: 1) requerimientos de carácter sexual, 2) conducta no consentida, 3) amenaza o perjuicio a la situación laboral, 4) contexto y circunstancias, 5) enfoque de género en el análisis.' },
    { value:'negligencia',      label:'Negligencia Administrativa',
      tmpl:'Determinar negligencia según art. 119 letra e) EA. Evaluar: 1) deber funcionario incumplido, 2) falta de diligencia debida, 3) resultado dañoso o riesgo creado, 4) relación causal omisión-resultado, 5) circunstancias atenuantes o agravantes.' },
    { value:'proporcionalidad', label:'Proporcionalidad de la Sanción',
      tmpl:'Analizar proporcionalidad de la sanción según principios del derecho administrativo sancionador. Evaluar: 1) gravedad objetiva de la falta, 2) atenuantes y agravantes, 3) hoja de vida del funcionario, 4) perjuicio causado al servicio, 5) comparación con jurisprudencia CGR.' },
    { value:'debido_proceso',   label:'Debido Proceso',
      tmpl:'Verificar cumplimiento del debido proceso administrativo. Evaluar: 1) notificación oportuna de cargos, 2) plazo efectivo para descargos, 3) recepción de pruebas ofrecidas, 4) fundamentación de la resolución, 5) cumplimiento de plazos legales, 6) imparcialidad del fiscal instructor.' },
    { value:'falta_probidad',   label:'Falta de Probidad',
      tmpl:'Analizar falta de probidad según art. 62 Ley 18.575 y art. 119 letra a) EA. Evaluar: 1) conducta contraria a la honestidad, 2) afectación al interés público, 3) uso indebido del cargo, 4) obtención de beneficios indebidos, 5) precedentes CGR sobre probidad.' },
    { value:'prescripcion',     label:'Prescripción',
      tmpl:'Analizar prescripción de la acción disciplinaria conforme art. 157 EA. Evaluar: 1) fecha de conocimiento por la autoridad, 2) cómputo del plazo de 4 años, 3) causales de interrupción o suspensión, 4) jurisprudencia CGR sobre dies a quo, 5) efectos en el procedimiento.' },
  ],
  laboral:[
    { value:'tutela_laboral',        label:'Tutela Laboral',
      tmpl:'Analizar procedencia de acción de tutela laboral conforme arts. 485 y ss. CT. Evaluar: 1) derechos fundamentales vulnerados, 2) indicios suficientes de vulneración, 3) aplicación de la prueba indiciaria art. 493 CT, 4) garantía de indemnidad, 5) medidas reparatorias y sancionatorias procedentes.' },
    { value:'despido_injustificado', label:'Despido Injustificado',
      tmpl:'Evaluar justificación del despido conforme arts. 159, 160 y 161 CT. Analizar: 1) causal invocada y hechos fundantes, 2) proporcionalidad falta-sanción, 3) inmediatez del despido, 4) formalidades art. 162 CT, 5) cotizaciones previsionales Ley Bustos, 6) indemnizaciones y recargos legales.' },
    { value:'despido_indirecto',     label:'Autodespido',
      tmpl:'Analizar despido indirecto conforme art. 171 CT. Evaluar: 1) causales del art. 160 N°1, 5 o 7 aplicables al empleador, 2) gravedad del incumplimiento patronal, 3) oportunidad de la renuncia, 4) acumulación con tutela art. 489 CT, 5) indemnizaciones y recargos procedentes.' },
    { value:'accidente_trabajo',     label:'Accidente del Trabajo',
      tmpl:'Analizar responsabilidad conforme Ley N°16.744 y art. 184 CT. Evaluar: 1) deber de protección del empleador, 2) culpa o dolo art. 69 letra b) Ley 16.744, 3) nexo causal, 4) medidas de seguridad incumplidas D.S. 594, 5) lucro cesante y daño moral, 6) prestaciones de la Ley 16.744.' },
    { value:'practicas_antisindicales', label:'Prácticas Antisindicales',
      tmpl:'Evaluar existencia de prácticas antisindicales conforme arts. 289 y ss. CT. Analizar: 1) conductas que atentan contra la libertad sindical, 2) fuero sindical y sus efectos, 3) procedimiento de tutela aplicable, 4) multas y sanciones procedentes, 5) dictámenes de la Dirección del Trabajo.' },
    { value:'cobro_prestaciones',    label:'Cobro de Prestaciones',
      tmpl:'Determinar procedencia de cobro de prestaciones adeudadas. Evaluar: 1) remuneraciones impagas, 2) horas extraordinarias no compensadas, 3) feriado legal y proporcional, 4) gratificaciones arts. 46-50 CT, 5) intereses y reajustes art. 63 CT, 6) prescripción de derechos laborales art. 510 CT.' },
  ],
};

// Secciones IRAC para cada modo (con prompts completos del módulo original)
const CE_SECTIONS = {
  disciplinario:[
    { id:'hechos',
      title:'I. Hechos Relevantes',
      desc:'Cronología, hechos acreditados y participantes',
      prompt:`## I. HECHOS RELEVANTES
Analiza los antecedentes del expediente y presenta:
1. Cronología de los hechos (fechas, lugares, participantes)
2. Hechos acreditados vs alegaciones (evidencia de sustento)
3. Participantes clave (víctima, denunciado, testigos)
4. Contexto institucional (marco organizacional, cadena de mando)` },
    { id:'derecho',
      title:'II. Derecho Aplicable',
      desc:'Marco normativo y jurisprudencia',
      prompt:`## II. DERECHO APLICABLE
Identifica y explica:
A. Normativa General (CPR, CT, Ley 19.880)
B. Normativa Especial según Institución (estatutos, reglamentos)
C. Normativa sobre la Materia Específica (Ley 20.607, 20.005, 20.609)
D. Jurisprudencia Relevante (CGR, sentencias judiciales)` },
    { id:'analisis',
      title:'III. Análisis Jurídico',
      desc:'Calificación jurídica y responsabilidad',
      prompt:`## III. ANÁLISIS JURÍDICO
A. Calificación Jurídica (subsunción, elementos configurativos, gravedad)
B. Responsabilidad Administrativa (determinación, participación, atenuantes/agravantes)
C. Debido Proceso (garantías, plazos, defensa)
D. Proporcionalidad (relación infracción-sanción, precedentes)
E. Fortalezas y Debilidades del Caso` },
    { id:'conclusion',
      title:'IV. Conclusiones',
      desc:'Recomendaciones y propuesta de sanción',
      prompt:`## IV. CONCLUSIONES Y RECOMENDACIONES
A. Conclusión Principal (síntesis, responsabilidades, calificación)
B. Recomendaciones Procesales (diligencias, medidas cautelares)
C. Recomendaciones de Sanción (propuesta fundamentada, proporcionalidad)
D. Prevención (medidas, mejora institucional, capacitación)` },
  ],
  laboral:[
    { id:'antecedentes',
      title:'I. Antecedentes del Caso',
      desc:'Relación laboral, hechos y contexto',
      prompt:`## I. ANTECEDENTES DEL CASO
1. Relación Laboral (partes, contrato, cargo, remuneración)
2. Hechos Relevantes (cronología, documentación, contexto)
3. Conflicto Laboral (descripción, derechos afectados, actuaciones previas)
4. Término de la Relación (forma, causal, formalidades)` },
    { id:'marco_normativo',
      title:'II. Marco Normativo Laboral',
      desc:'Código del Trabajo y leyes especiales',
      prompt:`## II. MARCO NORMATIVO LABORAL
A. Código del Trabajo (artículos aplicables, tutela arts. 485-495)
B. Legislación Complementaria (Ley 16.744, 20.607, 20.005, 20.348, Ley Karin, Ley Bustos)
C. Normativa Reglamentaria (D.S. 594, reglamento interno, convenios colectivos)
D. Jurisprudencia Laboral (JLT, Cortes, CS, DT)` },
    { id:'analisis_laboral',
      title:'III. Análisis Jurídico Laboral',
      desc:'Subsunción, prueba indiciaria y viabilidad',
      prompt:`## III. ANÁLISIS JURÍDICO LABORAL
A. Calificación Jurídica (subsunción, tipificación, pretensiones)
B. Prueba Indiciaria art. 493 CT (indicios, carga probatoria, proporcionalidad)
C. Análisis de Causales (procedencia, gravedad, inmediatez, formalidades art. 162)
D. Daño y Perjuicio (indemnizaciones legales, lucro cesante, daño moral, recargos art. 168)
E. Fortalezas y Debilidades (prueba disponible, riesgos, jurisprudencia)` },
    { id:'estrategia',
      title:'IV. Estrategia y Pretensiones',
      desc:'Acciones procedentes e indemnizaciones',
      prompt:`## IV. ESTRATEGIA Y PRETENSIONES
A. Acción Procesal Recomendada (tipo, competencia, plazos, acumulación)
B. Pretensiones Específicas (nulidad, indemnizaciones, tutela 6-11 rem., daño moral, cotizaciones)
C. Prueba a Rendir (documental, testimonial, confesional, pericial)
D. Medidas Cautelares (protección, reincorporación, innovativas)` },
    { id:'conclusion_laboral',
      title:'V. Conclusiones',
      desc:'Síntesis y recomendaciones',
      prompt:`## V. CONCLUSIONES Y RECOMENDACIONES
A. Síntesis del Análisis (hechos probados, marco normativo, procedencia)
B. Viabilidad del Caso (probabilidades, factores, riesgos)
C. Recomendaciones (acción sugerida, diligencias previas, estimación montos, plazo)
D. Consideraciones Adicionales (Ley Karin, género, precedentes clave)` },
  ],
};

// System prompts exactos del módulo original
const CE_SYS = {
  disciplinario:`Eres un asistente jurídico-administrativo experto en procedimientos disciplinarios y sancionatorios de la Administración Pública chilena. Tu análisis debe: ser técnico, preciso y fundamentado en la normativa aplicable; considerar la jurisprudencia de la Contraloría General de la República; respetar el debido proceso y las garantías fundamentales; aplicar perspectiva de género cuando sea pertinente; ser proporcional y objetivo en las conclusiones. PROTECCIÓN DE DATOS: No revelar nombres, RUT, correos, teléfonos. Usar roles genéricos.`,
  laboral:`Eres un abogado laboralista experto en derecho del trabajo chileno. Tu análisis debe: ser técnico, preciso y fundamentado en el Código del Trabajo y legislación laboral; citar artículos específicos del CT y leyes complementarias; considerar jurisprudencia de JLT, Cortes de Apelaciones y Corte Suprema; aplicar la prueba indiciaria del art. 493 CT cuando corresponda; considerar Ley Karin (Ley 21.643) cuando sea pertinente; aplicar perspectiva de género y derechos fundamentales; ser estratégico y orientado a la acción procesal; citar fuentes (Fuente: <documento>, <sección>); marcar [NO CONSTA EN ANTECEDENTES] cuando falte información.`,
};

const CE_ESCRITOS_TYPES = [
  { id:'demanda',            label:'Demanda',               icon:'⚖️' },
  { id:'recurso_proteccion', label:'Recurso de Protección', icon:'🛡️' },
  { id:'contestacion',       label:'Contestación',          icon:'📋' },
  { id:'apelacion',          label:'Apelación',             icon:'⬆️' },
  { id:'tutela',             label:'Tutela Laboral',        icon:'🤝' },
  { id:'otro',               label:'Otro escrito',          icon:'📝' },
];

/* ────────────────────────────────────────────────────────────────
   2 · ESTADO GLOBAL
   ──────────────────────────────────────────────────────────────── */
const ce = {
  // Vista actual
  tab: 'config',          // config | extraccion | analisis | chat
  // Caso activo
  analysisId:    null,
  caseName:      '',
  caseMode:      'disciplinario',
  caseType:      '',
  institution:   '',
  focusSelected: [],      // array de values
  focusFreeText: '',
  // Documentos cargados localmente
  docs: [],               // [{name, text, size}]
  // Resultados de extracción
  extractedFacts: [],     // [{text, relevance:'alta'|'media'|'baja'}]
  chronology:     [],     // [{date, event}]
  participants:   [],     // [{name, role, estamento}]
  // Secciones generadas
  sections:            {},// {sectionId: content}
  sectionsGenerating:  {},// {sectionId: true/false}
  allGenerating:   false,
  // Chat
  chatMessages: [],
  chatLoading:  false,
  // Escritos desde el chat
  escritosType:   null,
  escritosDraft:  null,   // {title, content}
  escritosGenerating: false,
  escritosPanelOpen: false,
  // Sidebar
  savedCases: [],
  // Proceso
  extracting: false,
};

/* ────────────────────────────────────────────────────────────────
   3 · APERTURA
   ──────────────────────────────────────────────────────────────── */
function openAnalisisCasosExternos() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewCasosExternos');
  loadCESavedCases();
  renderCEFull();
}

/* ────────────────────────────────────────────────────────────────
   4 · RENDER MAESTRO
   ──────────────────────────────────────────────────────────────── */
function renderCEFull() {
  renderCESidebar();
  renderCEMain();
}

function renderCEMain() {
  const wrap = document.getElementById('ceMainWrap');
  if (!wrap) return;

  const sections  = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const hasExtract= ce.extractedFacts.length > 0 || ce.chronology.length > 0;
  const hasDocs   = ce.docs.length > 0;
  const hasSects  = Object.keys(ce.sections).filter(k => ce.sections[k]).length > 0;

  const TABS = [
    { id:'config',    label:'📋 Configuración' },
    { id:'extraccion',label:'🔍 Extracción',  dim: !hasDocs },
    { id:'analisis',  label:'⚖️ Análisis',     dim: !hasDocs && !hasExtract },
    { id:'chat',      label:'💬 Chat IA' },
  ];

  const tabsHtml = `<div class="ce-tabs">
    ${TABS.map(t => `<button
      class="ce-tab ${ce.tab === t.id ? 'active' : ''} ${t.dim ? 'dim' : ''}"
      onclick="ceSwitchTab('${t.id}')">${t.label}</button>`).join('')}
    ${hasSects ? `<button class="btn-sm ce-export-btn" onclick="ceExportFull()" title="Exportar análisis completo">⬇ Exportar</button>` : ''}
  </div>`;

  let body = '';
  if      (ce.tab === 'config')     body = renderCEConfig();
  else if (ce.tab === 'extraccion') body = renderCEExtraccion();
  else if (ce.tab === 'analisis')   body = renderCEAnalisis();
  else if (ce.tab === 'chat')       body = renderCEChat();

  wrap.innerHTML = tabsHtml + `<div class="ce-body">${body}</div>`;
}

function ceSwitchTab(tab) {
  ce.tab = tab;
  renderCEMain();
}

/* ────────────────────────────────────────────────────────────────
   5 · TAB CONFIGURACIÓN
   ──────────────────────────────────────────────────────────────── */
function renderCEConfig() {
  const caseTypes = CE_CASE_TYPES[ce.caseMode] || [];
  const focusTpls = CE_FOCUS[ce.caseMode]      || [];

  return `
  <!-- MODO -->
  <div class="ce-card">
    <div class="ce-card-label">Modo de análisis</div>
    <div class="ce-mode-row">
      ${CE_MODES.map(m => `<button class="ce-mode-btn ${ce.caseMode === m.value ? 'active' : ''}"
        onclick="ceSetMode('${m.value}')">
        <span style="font-size:22px">${m.icon}</span>
        <strong style="font-size:12.5px">${m.label}</strong>
        <span style="font-size:10.5px;color:var(--text-muted)">${m.desc}</span>
      </button>`).join('')}
    </div>
  </div>

  <!-- IDENTIFICACIÓN -->
  <div class="ce-card">
    <div class="ce-card-label">Identificación del caso</div>
    <div style="margin-bottom:8px">
      <label class="ce-field-label">Nombre del caso *</label>
      <input class="ce-input" id="ceNameInp"
        value="${ceEsc(ce.caseName)}"
        placeholder="Ej: García vs. Municipalidad de Punta Arenas — Acoso Laboral 2025"
        onchange="ce.caseName = this.value"/>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div>
        <label class="ce-field-label">Tipo de caso</label>
        <select class="ce-select" onchange="ce.caseType = this.value">
          <option value="">— Seleccionar —</option>
          ${caseTypes.map(t => `<option value="${t.value}" ${ce.caseType === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="ce-field-label">Institución / Empleador</label>
        <select class="ce-select" onchange="ce.institution = this.value">
          <option value="">— Seleccionar —</option>
          ${CE_INSTITUTIONS.map(i => `<option value="${i.value}" ${ce.institution === i.value ? 'selected' : ''}>${i.label}</option>`).join('')}
        </select>
      </div>
    </div>
  </div>

  <!-- ENFOQUE -->
  <div class="ce-card">
    <div class="ce-card-label">Enfoque del análisis
      <span style="font-size:9px;font-weight:400;color:var(--text-muted);margin-left:5px">Selecciona uno o varios · combina para análisis integral</span>
    </div>
    <div class="ce-focus-grid" id="ceFocusGrid">
      ${focusTpls.map(f => `<button class="ce-focus-pill ${ce.focusSelected.includes(f.value) ? 'active' : ''}"
        onclick="ceToggleFocus('${f.value}',this)" title="${ceEsc(f.tmpl)}">${f.label}</button>`).join('')}
    </div>
    <textarea class="ce-textarea" rows="2" placeholder="Instrucciones adicionales (opcional)…"
      onchange="ce.focusFreeText = this.value">${ceEsc(ce.focusFreeText)}</textarea>
  </div>

  <!-- DOCUMENTOS -->
  <div class="ce-card">
    <div class="ce-card-label" style="display:flex;align-items:center;justify-content:space-between">
      Documentos del expediente
      <span style="font-size:9.5px;color:var(--text-muted)">${ce.docs.length} cargado(s)</span>
    </div>
    <label class="ce-upload-label">
      📄 Cargar documentos (PDF · Word · TXT)
      <input type="file" multiple accept=".pdf,.docx,.doc,.txt" style="display:none"
        onchange="ceHandleFileUpload(this)"/>
    </label>
    ${ce.docs.length ? `<div class="ce-docs-list">
      ${ce.docs.map((d, i) => `<div class="ce-doc-row">
        <span style="font-size:13px">${d.name.endsWith('.pdf') ? '📕' : '📘'}</span>
        <div style="flex:1;min-width:0">
          <div class="ce-doc-name">${ceEsc(d.name)}</div>
          <div class="ce-doc-meta">${(d.text.length / 1000).toFixed(0)}K chars · ${(d.size / 1024).toFixed(0)} KB</div>
        </div>
        <button class="btn-del" onclick="ceRemoveDoc(${i})">✕</button>
      </div>`).join('')}
    </div>` : `<p style="font-size:11px;color:var(--text-muted);margin-top:6px">Sin documentos. Sube PDFs, documentos Word o texto plano del expediente.</p>`}
  </div>

  <!-- ACCIONES -->
  <div class="ce-actions-bar">
    <button class="btn-save" style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px"
      onclick="ceExtractAndContinue()"
      ${ce.extracting || ce.docs.length === 0 ? 'disabled' : ''}>
      ${ce.extracting
        ? '<span style="width:8px;height:8px;border-radius:50%;background:#fff;animation:pulse 1.4s infinite;display:inline-block"></span> Extrayendo…'
        : '🔍 Extraer hechos y continuar →'}
    </button>
    <button class="btn-cancel" onclick="ceSaveDraft()" title="Guardar borrador">💾 Guardar</button>
    ${ce.docs.length > 0 ? `<button class="btn-sm" onclick="ce.tab='analisis';renderCEMain()">→ Ir al análisis</button>` : ''}
  </div>`;
}

function ceSetMode(mode) {
  ce.caseMode      = mode;
  ce.caseType      = '';
  ce.focusSelected = [];
  ce.sections      = {};
  renderCEMain();
}

function ceToggleFocus(val, btn) {
  const idx = ce.focusSelected.indexOf(val);
  if (idx === -1) ce.focusSelected.push(val);
  else ce.focusSelected.splice(idx, 1);
  btn.classList.toggle('active', ce.focusSelected.includes(val));
}

async function ceHandleFileUpload(input) {
  const files = Array.from(input.files || []);
  for (const f of files) {
    let text = '';
    try {
      if (f.type === 'text/plain' || f.name.endsWith('.txt')) {
        text = await f.text();
      } else {
        // Best-effort for PDF/DOCX — full extraction handled server-side
        text = await f.text().catch(() => `[${f.name}]`);
        // Clean up binary garbage
        text = text.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\uFFFF]/g, ' ').replace(/\s{3,}/g, ' ');
      }
    } catch (_) {
      text = `[Archivo: ${f.name}]`;
    }
    ce.docs.push({ name: f.name, text: text.substring(0, 200000), size: f.size });
  }
  input.value = '';
  renderCEMain();
}

function ceRemoveDoc(i) {
  ce.docs.splice(i, 1);
  renderCEMain();
}

/* ────────────────────────────────────────────────────────────────
   6 · EXTRACCIÓN DE HECHOS
   ──────────────────────────────────────────────────────────────── */
async function ceExtractAndContinue() {
  const nameInp = document.getElementById('ceNameInp');
  if (nameInp) ce.caseName = nameInp.value.trim();
  if (!ce.caseName) {
    alert('Ingresa un nombre para el caso antes de continuar.');
    document.getElementById('ceNameInp')?.focus();
    return;
  }
  if (!ce.docs.length) return;

  ce.extracting = true;
  ce.tab        = 'extraccion';
  renderCEMain();

  const docsCtx   = ce.docs.map(d => `=== ${d.name} ===\n${d.text.substring(0, 20000)}`).join('\n\n');
  const focusLabels = ce.focusSelected
    .map(v => (CE_FOCUS[ce.caseMode] || []).find(f => f.value === v)?.label)
    .filter(Boolean).join(', ');
  const modeLabel = CE_MODES.find(m => m.value === ce.caseMode)?.label || ce.caseMode;

  const prompt = `Analiza los documentos del caso "${ce.caseName}" (${modeLabel}${focusLabels ? ', foco: ' + focusLabels : ''}).

DOCUMENTOS:
${docsCtx}

Extrae en JSON con exactamente esta estructura:
{
  "facts": [{"text":"descripción concisa del hecho","relevance":"alta|media|baja"}],
  "chronology": [{"date":"DD-MM-YYYY o período","event":"descripción del evento"}],
  "participants": [{"name":"nombre o rol genérico","role":"denunciante|denunciado|testigo|fiscal|actuario|empleador|trabajador|otro","estamento":"funcionario|estudiante|honorarios|trabajador|empleador|otro"}]
}

Responde ÚNICAMENTE con el JSON. Sin texto adicional, sin bloques de código, sin backticks.`;

  try {
    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: 'Eres un asistente jurídico experto. Extraes hechos, cronología y participantes de expedientes jurídicos. Respondes ÚNICAMENTE con JSON válido y bien estructurado sin ningún texto adicional.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data  = await resp.json();
    const raw   = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed = {};
    try { parsed = JSON.parse(clean); } catch (_) {
      // Try to extract JSON object from string
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    ce.extractedFacts = Array.isArray(parsed.facts)       ? parsed.facts       : [];
    ce.chronology     = Array.isArray(parsed.chronology)  ? parsed.chronology  : [];
    ce.participants   = Array.isArray(parsed.participants) ? parsed.participants: [];

    const total = ce.extractedFacts.length + ce.chronology.length + ce.participants.length;
    showToast(`✓ Extraídos ${ce.extractedFacts.length} hechos · ${ce.chronology.length} eventos · ${ce.participants.length} participantes`);
    await ceSaveDraft();
  } catch (err) {
    ce.extractedFacts = [{ text: 'Error al procesar — continúa manualmente al análisis', relevance: 'alta' }];
    showToast('⚠ Extracción parcial. Puedes continuar al análisis.');
  } finally {
    ce.extracting = false;
    renderCEMain();
  }
}

function renderCEExtraccion() {
  if (ce.extracting) {
    return `<div class="ce-loading-wrap">
      <div class="typing"><div class="da"></div><div class="da"></div><div class="da"></div></div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">Extrayendo hechos, cronología y participantes de ${ce.docs.length} documento(s)…<br><span style="font-size:10px;color:var(--text-muted)">Esto puede tomar entre 15–60 segundos</span></div>
    </div>`;
  }

  if (!ce.extractedFacts.length && !ce.chronology.length) {
    return `<div class="ley-empty">
      <p style="margin-bottom:10px">Sin datos extraídos.</p>
      <button class="btn-sm" onclick="ce.tab='config';renderCEMain()">← Volver a Configuración</button>
    </div>`;
  }

  const relevColor = r => ({ alta:'var(--red)', media:'#f59e0b', baja:'var(--text-muted)' })[r] || 'var(--text-muted)';
  const roleIcon   = r => ({ denunciante:'👤', denunciado:'⚠️', testigo:'👁', fiscal:'⚖️', actuario:'📋', empleador:'🏢', trabajador:'👷', otro:'👥' })[r] || '👥';

  return `
  <div class="ce-ext-grid">
    ${ce.extractedFacts.length ? `<div class="ce-ext-block">
      <div class="ce-ext-block-title">📌 Hechos Relevantes <span style="font-size:9.5px;font-weight:400;color:var(--text-muted)">(${ce.extractedFacts.length})</span></div>
      ${ce.extractedFacts.map(f => `<div class="ce-ext-item">
        <span class="ce-relevance-badge" style="border-color:${relevColor(f.relevance)};color:${relevColor(f.relevance)}">${f.relevance}</span>
        <span style="font-size:12px;line-height:1.55">${ceEsc(f.text)}</span>
      </div>`).join('')}
    </div>` : ''}

    ${ce.chronology.length ? `<div class="ce-ext-block">
      <div class="ce-ext-block-title">📅 Cronología <span style="font-size:9.5px;font-weight:400;color:var(--text-muted)">(${ce.chronology.length} eventos)</span></div>
      ${ce.chronology.map(e => `<div class="ce-ext-item">
        <span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--gold-dim);flex-shrink:0;min-width:88px;margin-top:1px">${ceEsc(e.date || '—')}</span>
        <span style="font-size:12px;line-height:1.55">${ceEsc(e.event)}</span>
      </div>`).join('')}
    </div>` : ''}

    ${ce.participants.length ? `<div class="ce-ext-block">
      <div class="ce-ext-block-title">👥 Participantes <span style="font-size:9.5px;font-weight:400;color:var(--text-muted)">(${ce.participants.length})</span></div>
      ${ce.participants.map(p => `<div class="ce-ext-item" style="gap:9px">
        <span style="font-size:16px;flex-shrink:0">${roleIcon(p.role)}</span>
        <div>
          <div style="font-size:12px;font-weight:500">${ceEsc(p.name || '—')}</div>
          <div style="font-size:10px;color:var(--text-muted)">${p.role || '—'}${p.estamento ? ' · ' + p.estamento : ''}</div>
        </div>
      </div>`).join('')}
    </div>` : ''}
  </div>

  <div class="ce-actions-bar" style="margin-top:14px">
    <button class="btn-save" style="flex:1" onclick="ce.tab='analisis';renderCEMain()">→ Ir al Análisis</button>
    <button class="btn-sm" onclick="ceExtractAndContinue()">↺ Re-extraer</button>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   7 · TAB ANÁLISIS (IRAC / LABORAL)
   ──────────────────────────────────────────────────────────────── */
function renderCEAnalisis() {
  const sections  = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const completed = sections.filter(s => ce.sections[s.id]).length;
  const allDone   = completed === sections.length;

  const modeLabel = CE_MODES.find(m => m.value === ce.caseMode)?.label || '';
  const typeLabel = (CE_CASE_TYPES[ce.caseMode] || []).find(t => t.value === ce.caseType)?.label || '';
  const instLabel = CE_INSTITUTIONS.find(i => i.value === ce.institution)?.label || '';

  return `
  <div class="ce-analisis-bar">
    <div style="min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ce.caseName || 'Caso sin nombre'}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${modeLabel}${typeLabel ? ' · ' + typeLabel : ''}${instLabel ? ' · ' + instLabel : ''} · ${completed}/${sections.length} secciones</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
      <button class="btn-save" style="padding:6px 13px"
        onclick="ceGenerateAll()" ${ce.allGenerating ? 'disabled' : ''}>
        ${ce.allGenerating ? '<span style="width:7px;height:7px;border-radius:50%;background:#fff;animation:pulse 1.4s infinite;display:inline-block;margin-right:3px"></span>Generando…' : '✨ Generar todo'}
      </button>
      ${completed > 0 ? `<button class="btn-cancel" onclick="ceCopyAll()">📋 Copiar</button>` : ''}
      ${allDone ? `<button class="btn-cancel" onclick="ceExportFull()">⬇ Exportar</button>` : ''}
    </div>
  </div>

  <div class="ce-sections-list">
    ${sections.map(s => ceSectionCard(s)).join('')}
  </div>`;
}

function ceSectionCard(s) {
  const content = ce.sections[s.id] || '';
  const isGen   = !!ce.sectionsGenerating[s.id];
  const hasContent = !!content;
  const mdFn = typeof md === 'function' ? md : t => `<pre style="white-space:pre-wrap;font-size:12px">${t}</pre>`;

  return `<div class="ce-sec-card" id="ceSecCard-${s.id}">
    <div class="ce-sec-header">
      <div>
        <div class="ce-sec-title">${s.title}</div>
        <div class="ce-sec-desc">${s.desc}</div>
      </div>
      <div style="display:flex;gap:5px;align-items:center;flex-shrink:0">
        ${hasContent ? `<button class="btn-sm" onclick="ceCopySection('${s.id}')" title="Copiar sección">📋</button>` : ''}
        <button class="btn-save" style="padding:5px 11px;font-size:11px"
          onclick="ceGenSection('${s.id}')" ${isGen ? 'disabled' : ''}>
          ${isGen
            ? '<span style="width:7px;height:7px;border-radius:50%;background:#fff;animation:pulse 1.4s infinite;display:inline-block;margin-right:2px"></span>'
            : hasContent ? '↺ ' : '✨ '}${hasContent ? 'Regen.' : 'Generar'}
        </button>
      </div>
    </div>
    ${isGen
      ? `<div class="ce-sec-streaming"><div class="typing"><div class="da"></div><div class="da"></div><div class="da"></div></div><span style="font-size:11.5px;color:var(--text-muted);margin-left:10px">Generando ${s.title}…</span></div>`
      : hasContent
        ? `<div class="ce-sec-content">${mdFn(content)}</div>`
        : ''}
  </div>`;
}

/* ── Generar sección individual ── */
async function ceGenSection(sectionId) {
  const sections = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const s        = sections.find(x => x.id === sectionId);
  if (!s) return;

  ce.sectionsGenerating[sectionId] = true;
  // Re-render only this card to avoid full refresh
  const card = document.getElementById('ceSecCard-' + sectionId);
  if (card) card.outerHTML = ceSectionCard(s);
  else renderCEMain();

  try {
    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: CE_SYS[ce.caseMode] || CE_SYS.disciplinario,
        messages: [{ role: 'user', content: ceBuildSectionPrompt(s) }],
      }),
    });

    const data    = await resp.json();
    const content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    ce.sections[sectionId] = content;
    await ceSaveDraft();
  } catch (err) {
    ce.sections[sectionId] = `⚠️ Error al generar: ${err.message}`;
  } finally {
    ce.sectionsGenerating[sectionId] = false;
    renderCEMain();
  }
}

/* ── Generar todas ── */
async function ceGenerateAll() {
  if (ce.allGenerating) return;
  ce.allGenerating = true;
  renderCEMain();

  const sections = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  for (const s of sections) {
    if (!ce.sections[s.id]) await ceGenSection(s.id);
  }
  ce.allGenerating = false;
  renderCEMain();
  showToast('✓ Análisis completo generado');
}

/* ── Construir prompt de sección ── */
function ceBuildSectionPrompt(s) {
  const modeLabel = CE_MODES.find(m => m.value === ce.caseMode)?.label || '';
  const typeLabel = (CE_CASE_TYPES[ce.caseMode] || []).find(t => t.value === ce.caseType)?.label || '';
  const instLabel = CE_INSTITUTIONS.find(i => i.value === ce.institution)?.label || '';

  const docsCtx = ce.docs
    .map(d => `=== ${d.name} ===\n${d.text.substring(0, 10000)}`)
    .join('\n\n');

  const factsCtx = ce.extractedFacts
    .map(f => `[${f.relevance.toUpperCase()}] ${f.text}`)
    .join('\n');

  const chronoCtx = ce.chronology
    .map(e => `${e.date}: ${e.event}`)
    .join('\n');

  const partsCtx = ce.participants
    .map(p => `${p.role}: ${p.name} (${p.estamento || '—'})`)
    .join('\n');

  const focusCtx = ce.focusSelected
    .map(v => {
      const tpl = (CE_FOCUS[ce.caseMode] || []).find(f => f.value === v);
      return tpl ? `• ${tpl.label}: ${tpl.tmpl}` : null;
    })
    .filter(Boolean).join('\n');

  // Previous sections as context
  const sections  = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const prevCtx   = sections
    .filter(x => x.id !== s.id && ce.sections[x.id])
    .map(x => `### ${x.title}\n${ce.sections[x.id].substring(0, 1500)}`)
    .join('\n\n');

  return `CASO: ${ce.caseName}
MODO: ${modeLabel}${typeLabel ? ' · ' + typeLabel : ''}${instLabel ? ' · Institución: ' + instLabel : ''}
${focusCtx ? `\nENFOQUE DE ANÁLISIS:\n${focusCtx}` : ''}
${factsCtx ? `\nHECHOS EXTRAÍDOS:\n${factsCtx}` : ''}
${chronoCtx ? `\nCRONOLOGÍA:\n${chronoCtx}` : ''}
${partsCtx ? `\nPARTICIPANTES:\n${partsCtx}` : ''}
${docsCtx ? `\nDOCUMENTOS DEL EXPEDIENTE:\n${docsCtx}` : ''}
${prevCtx ? `\nSECCIONES YA GENERADAS (contexto):\n${prevCtx}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERA AHORA LA SIGUIENTE SECCIÓN:

${s.prompt}

Usa lenguaje jurídico formal. Cita artículos específicos. Estructura con sub-secciones Markdown (##, ###). Sé completo y preciso.`;
}

/* ── Exportar / Copiar ── */
function ceExportFull() {
  const sections = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const modeLabel= CE_MODES.find(m => m.value === ce.caseMode)?.label || '';
  const typeLabel= (CE_CASE_TYPES[ce.caseMode] || []).find(t => t.value === ce.caseType)?.label || '';
  const instLabel= CE_INSTITUTIONS.find(i => i.value === ce.institution)?.label || '';

  const sectionTexts = sections
    .filter(s => ce.sections[s.id])
    .map(s => `${s.title}\n${'═'.repeat(60)}\n${ce.sections[s.id]}`)
    .join('\n\n');

  if (!sectionTexts) { showToast('Sin contenido para exportar'); return; }

  const full = `ANÁLISIS JURÍDICO
${'═'.repeat(60)}
Caso: ${ce.caseName}
Modalidad: ${modeLabel}${typeLabel ? ' · ' + typeLabel : ''}${instLabel ? ' · ' + instLabel : ''}
Fecha: ${new Date().toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' })}
${'═'.repeat(60)}

${sectionTexts}`;

  const blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `analisis_${(ce.caseName || 'caso').replace(/[^a-z0-9]/gi, '_').substring(0, 40)}_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('✓ Análisis exportado como .txt');
}

function ceCopyAll() {
  const sections = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const text = sections
    .filter(s => ce.sections[s.id])
    .map(s => `${s.title}\n${ce.sections[s.id]}`)
    .join('\n\n---\n\n');
  if (!text) { showToast('Sin contenido'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('✓ Análisis completo copiado'));
}

function ceCopySection(id) {
  const content = ce.sections[id];
  if (!content) return;
  navigator.clipboard.writeText(content).then(() => {
    const sec = (CE_SECTIONS[ce.caseMode] || []).find(s => s.id === id);
    showToast(`✓ "${sec?.title || 'Sección'}" copiada`);
  });
}

/* ────────────────────────────────────────────────────────────────
   8 · TAB CHAT IA (+ Panel Escritos Judiciales)
   ──────────────────────────────────────────────────────────────── */
function renderCEChat() {
  const mdFn = typeof md === 'function' ? md : t => t;

  const messagesHtml = ce.chatMessages.length
    ? ce.chatMessages.map(m => `<div class="ley-chat-msg ${m.role}"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${m.role === 'user' ? ceEsc(m.content) : mdFn(m.content)}</div></div></div>`).join('')
    : `<div class="ley-chat-msg assistant"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">
        <strong>Asistente de Casos Externos</strong><br>
        Hola 👋 Tengo acceso al contexto completo de este caso${ce.caseName ? ': <strong>' + ceEsc(ce.caseName) + '</strong>' : ''}. Puedo ayudarte a profundizar el análisis, buscar jurisprudencia aplicable, redactar secciones o escritos judiciales, y responder consultas jurídicas específicas. ¿Qué necesitas?
      </div></div></div>`;

  const chips = [
    '¿Cuál es la principal debilidad jurídica del caso?',
    'Resume los hechos más relevantes',
    'Propón una estrategia procesal',
    ce.caseMode === 'laboral' ? 'Calcula las indemnizaciones procedentes' : 'Evalúa la proporcionalidad de la sanción',
    'Busca jurisprudencia CGR aplicable',
  ];

  // Panel de Escritos Judiciales
  const escritosPanel = ce.escritosPanelOpen ? `
    <div class="ce-escritos-panel">
      <div class="ce-card-label" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span>✍️ Escritos Judiciales</span>
        <button class="btn-sm" onclick="ce.escritosPanelOpen=false;renderCEMain()">✕ Cerrar</button>
      </div>
      <div class="ce-escritos-grid">
        ${CE_ESCRITOS_TYPES.map(t => `<button class="ce-focus-pill ${ce.escritosType === t.id ? 'active' : ''}"
          onclick="ce.escritosType='${t.id}';ceUpdateEscritos()">${t.icon} ${t.label}</button>`).join('')}
      </div>
      <textarea class="ce-textarea" id="ceEscritosInstr" rows="3"
        placeholder="Describe las partes, hechos, pretensiones, tribunal competente…" style="margin-top:8px"></textarea>
      <button class="btn-save" style="width:100%;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px"
        onclick="ceGenerateEscrito()" ${ce.escritosGenerating || !ce.escritosType ? 'disabled' : ''}>
        ${ce.escritosGenerating ? '<span style="width:7px;height:7px;border-radius:50%;background:#fff;animation:pulse 1.4s infinite;display:inline-block;margin-right:3px"></span>Generando…' : '✍️ Generar Escrito'}
      </button>
      ${ce.escritosDraft ? `<div style="margin-top:10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:11.5px;font-weight:600">${ceEsc(ce.escritosDraft.title)}</span>
          <div style="display:flex;gap:5px">
            <button class="btn-sm" onclick="navigator.clipboard.writeText(ce.escritosDraft.content).then(()=>showToast('✓ Copiado'))">📋</button>
            <button class="btn-sm" onclick="ceDownloadEscrito()">⬇</button>
          </div>
        </div>
        <div class="ce-sec-content" style="max-height:300px">${mdFn(ce.escritosDraft.content)}</div>
      </div>` : ''}
    </div>` : '';

  return `
  <div class="ley-chat-chips" style="padding:6px 0 8px">
    ${chips.map(c => `<button class="ley-chat-chip" onclick="ceChatSend('${ceEsc(c).replace(/'/g,'&#39;')}')">${ceEsc(c)}</button>`).join('')}
    <button class="ley-chat-chip" onclick="ce.escritosPanelOpen=!ce.escritosPanelOpen;renderCEMain()" style="margin-left:4px;border-color:var(--gold-dim);color:var(--gold)">✍️ Escritos</button>
    <button class="btn-sm" onclick="clearCEChat()" style="margin-left:auto" title="Limpiar chat">↺</button>
  </div>
  ${escritosPanel}
  <div class="ley-chat-msgs" id="ceChatMsgs" style="max-height:380px">${messagesHtml}</div>
  <div class="ley-chat-input-row" style="padding:10px 0 0">
    <textarea class="ley-chat-input" id="ceChatInput" placeholder="Consulta sobre el caso…" rows="1"
      onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendCEChat()}"
      oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
    <button class="send-btn" onclick="sendCEChat()" id="ceChatSendBtn" ${ce.chatLoading ? 'disabled' : ''}>
      <svg viewBox="0 0 16 16"><path d="M14.5 8L1.5 1.5l2 6.5-2 6.5z"/></svg>
    </button>
  </div>`;
}

function ceChatSend(text) {
  const inp = document.getElementById('ceChatInput');
  if (inp) inp.value = text;
  sendCEChat();
}

function clearCEChat() {
  ce.chatMessages = [];
  renderCEMain();
}

function ceUpdateEscritos() {
  // Refresh panel state after type selection
  const panel = document.querySelector('.ce-escritos-panel');
  if (!panel) { renderCEMain(); return; }
  panel.querySelectorAll('.ce-focus-pill').forEach(btn => {
    const t = CE_ESCRITOS_TYPES.find(x => btn.textContent.includes(x.label));
    if (t) btn.classList.toggle('active', t.id === ce.escritosType);
  });
}

async function sendCEChat() {
  const input = document.getElementById('ceChatInput');
  if (!input || !input.value.trim() || ce.chatLoading) return;
  const text = input.value.trim();
  input.value = '';
  input.style.height = 'auto';

  ce.chatMessages.push({ role: 'user', content: text });

  const msgBox = document.getElementById('ceChatMsgs');
  if (msgBox) {
    msgBox.innerHTML += `<div class="ley-chat-msg user"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${ceEsc(text)}</div></div></div>`;
    const typing = document.createElement('div');
    typing.className = 'ley-chat-msg assistant';
    typing.id = 'ceChatTyping';
    typing.innerHTML = '<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub"><div class="typing"><div class="da"></div><div class="da"></div><div class="da"></div></div></div></div>';
    msgBox.appendChild(typing);
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  ce.chatLoading = true;
  const btn = document.getElementById('ceChatSendBtn');
  if (btn) btn.disabled = true;

  const sections = CE_SECTIONS[ce.caseMode] || CE_SECTIONS.disciplinario;
  const docsSnip = ce.docs.map(d => `=== ${d.name} ===\n${d.text.substring(0, 4000)}`).join('\n\n');
  const factsSnip= ce.extractedFacts.map(f => `[${f.relevance}] ${f.text}`).join('\n');
  const sectSnip = sections
    .filter(s => ce.sections[s.id])
    .map(s => `### ${s.title}\n${ce.sections[s.id].substring(0, 2000)}`)
    .join('\n\n');

  const modeLabel = CE_MODES.find(m => m.value === ce.caseMode)?.label || '';
  const typeLabel = (CE_CASE_TYPES[ce.caseMode] || []).find(t => t.value === ce.caseType)?.label || '';
  const instLabel = CE_INSTITUTIONS.find(i => i.value === ce.institution)?.label || '';

  try {
    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        system: `${CE_SYS[ce.caseMode] || CE_SYS.disciplinario}

CONTEXTO DEL CASO:
Nombre: ${ce.caseName || 'Sin nombre'}
Modalidad: ${modeLabel}${typeLabel ? ' · ' + typeLabel : ''}${instLabel ? ' · Institución: ' + instLabel : ''}
${factsSnip ? '\nHECHOS EXTRAÍDOS:\n' + factsSnip : ''}
${docsSnip  ? '\nDOCUMENTOS:\n' + docsSnip  : ''}
${sectSnip  ? '\nANÁLISIS GENERADO:\n' + sectSnip : ''}

Solo usar antecedentes proporcionados. No inventar hechos, normas ni jurisprudencia. Citar fuentes. Marcar [NO CONSTA EN ANTECEDENTES] cuando falte información.`,
        messages: ce.chatMessages.slice(-14),
      }),
    });

    const data  = await resp.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || 'Sin respuesta.';
    ce.chatMessages.push({ role: 'assistant', content: reply });

    const typing = document.getElementById('ceChatTyping');
    const mdFn   = typeof md === 'function' ? md : t => t;
    if (typing) typing.innerHTML = `<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${mdFn(reply)}</div></div>`;
    if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

    await saveCEMessages();
  } catch (err) {
    const typing = document.getElementById('ceChatTyping');
    if (typing) typing.innerHTML = `<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub" style="color:var(--red)">⚠️ Error: ${ceEsc(err.message)}</div></div>`;
  } finally {
    ce.chatLoading = false;
    if (btn) btn.disabled = false;
  }
}

/* ── Escritos Judiciales ── */
async function ceGenerateEscrito() {
  if (!ce.escritosType || ce.escritosGenerating) return;
  const instr = document.getElementById('ceEscritosInstr')?.value.trim();
  if (!instr) { showToast('⚠ Describe las instrucciones del escrito'); return; }

  const tpl  = CE_ESCRITOS_TYPES.find(t => t.id === ce.escritosType);
  const modeLabel = CE_MODES.find(m => m.value === ce.caseMode)?.label || '';
  const typeLabel = (CE_CASE_TYPES[ce.caseMode] || []).find(t => t.value === ce.caseType)?.label || '';
  const docsSnip  = ce.docs.map(d => `=== ${d.name} ===\n${d.text.substring(0, 6000)}`).join('\n\n');

  ce.escritosGenerating = true;
  renderCEMain();

  const prompt = `Necesito que redactes un escrito judicial de tipo "${tpl?.label || ce.escritosType}".

INSTRUCCIONES DEL USUARIO:
${instr}

CASO: ${ce.caseName}${typeLabel ? ' · ' + typeLabel : ''}
${docsSnip ? '\nANTECEDENTES DEL CASO:\n' + docsSnip : ''}

REQUISITOS:
- Utiliza estructura formal completa (encabezado, suma, cuerpo, petitorio, otrosí si corresponde)
- Incluye fórmulas procesales apropiadas para tribunales chilenos
- Cita artículos del CT, CPC u otras normas pertinentes
- Genera el documento completo, listo para revisión del abogado`;

  try {
    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `Eres Fiscalito, asistente jurídico especializado en escritos judiciales chilenos. Generas documentos formales completos con estructura procesal correcta, citas normativas precisas y lenguaje institucional formal.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data    = await resp.json();
    const content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    ce.escritosDraft = {
      title:   `${tpl?.label || ce.escritosType} — ${new Date().toLocaleDateString('es-CL')}`,
      content,
    };
    showToast('✓ Escrito generado');
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    ce.escritosGenerating = false;
    renderCEMain();
  }
}

function ceDownloadEscrito() {
  if (!ce.escritosDraft) return;
  const blob = new Blob([ce.escritosDraft.content], { type: 'text/plain;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = ce.escritosDraft.title.replace(/[^a-z0-9\s]/gi, '_') + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ────────────────────────────────────────────────────────────────
   9 · SIDEBAR — ANÁLISIS GUARDADOS
   ──────────────────────────────────────────────────────────────── */
function renderCESidebar() {
  const sidebar = document.getElementById('ceSidebar');
  if (!sidebar) return;

  const modeIcon = m => CE_MODES.find(x => x.value === m)?.icon || '📋';
  const ago = d => {
    const m = Math.floor((Date.now() - new Date(d)) / 60000);
    if (m < 60)   return m + 'm';
    if (m < 1440) return Math.floor(m / 60) + 'h';
    return Math.floor(m / 1440) + 'd';
  };

  sidebar.innerHTML = `
    <div class="ce-sb-header">
      <span style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Mis análisis</span>
      <button class="btn-save" style="padding:4px 10px;font-size:10.5px" onclick="ceNewCase()">+ Nuevo</button>
    </div>
    <div class="ce-sb-list">
      ${ce.savedCases.length
        ? ce.savedCases.map(c => `<div class="ce-sb-item ${ce.analysisId === c.id ? 'active' : ''}"
            onclick="ceLoadAnalysis('${c.id}')">
            <span style="font-size:14px;flex-shrink:0">${modeIcon(c.analysis_mode)}</span>
            <div style="flex:1;min-width:0">
              <div class="ce-sb-name">${ceEsc(c.case_name || 'Sin nombre')}</div>
              <div class="ce-sb-meta">${ago(c.updated_at)} · ${CE_MODES.find(m => m.value === c.analysis_mode)?.label || c.analysis_mode}</div>
            </div>
            <button class="btn-del" onclick="event.stopPropagation();ceDeleteAnalysis('${c.id}','${ceEsc(c.case_name || 'este caso')}')" title="Eliminar">✕</button>
          </div>`)
          .join('')
        : `<div style="font-size:11px;color:var(--text-muted);padding:12px;text-align:center;line-height:1.5">Sin análisis guardados.<br>Crea un nuevo caso.</div>`}
    </div>`;
}

async function loadCESavedCases() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data } = await sb.from('external_case_analyses')
      .select('id,case_name,analysis_mode,updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);
    ce.savedCases = data || [];
    renderCESidebar();
  } catch (_) { /* tabla puede no existir */ }
}

async function ceLoadAnalysis(id) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data } = await sb.from('external_case_analyses').select('*').eq('id', id).single();
    if (!data) return;

    ce.analysisId    = data.id;
    ce.caseName      = data.case_name      || '';
    ce.caseMode      = data.analysis_mode  || 'disciplinario';
    ce.caseType      = data.case_type      || '';
    ce.institution   = data.institution    || '';
    ce.focusSelected = JSON.parse(data.focus_selected  || '[]');
    ce.focusFreeText = data.focus_free_text|| '';
    ce.docs          = [];
    ce.extractedFacts= JSON.parse(data.extracted_facts || '[]');
    ce.chronology    = JSON.parse(data.chronology      || '[]');
    ce.participants  = JSON.parse(data.participants    || '[]');
    ce.sections      = JSON.parse(data.analysis_sections || '{}');
    ce.tab           = Object.keys(ce.sections).some(k => ce.sections[k]) ? 'analisis' : 'config';
    ce.chatMessages  = [];
    ce.escritosDraft = null;

    // Load chat history
    const { data: msgs } = await sb.from('external_case_messages')
      .select('role,content')
      .eq('analysis_id', id)
      .order('created_at', { ascending: true })
      .limit(50);
    ce.chatMessages = msgs || [];

    renderCEFull();
    showToast(`✓ ${ce.caseName}`);
  } catch (err) {
    showToast('⚠ Error al cargar: ' + err.message);
  }
}

async function ceDeleteAnalysis(id, name) {
  if (!confirm(`¿Eliminar el análisis "${name}"?`)) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (sb) await sb.from('external_case_analyses').delete().eq('id', id);
  if (ce.analysisId === id) ceNewCase();
  else loadCESavedCases();
  showToast('✓ Análisis eliminado');
}

function ceNewCase() {
  Object.assign(ce, {
    analysisId:null, caseName:'', caseMode:'disciplinario', caseType:'',
    institution:'', focusSelected:[], focusFreeText:'', docs:[],
    extractedFacts:[], chronology:[], participants:[], sections:{},
    sectionsGenerating:{}, allGenerating:false, chatMessages:[],
    chatLoading:false, escritosType:null, escritosDraft:null,
    escritosGenerating:false, escritosPanelOpen:false, tab:'config',
  });
  renderCEFull();
}

/* ────────────────────────────────────────────────────────────────
   10 · PERSISTENCIA
   ──────────────────────────────────────────────────────────────── */
async function ceSaveDraft() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return;

  const payload = {
    user_id:          user.id,
    case_name:        ce.caseName || 'Sin nombre',
    analysis_mode:    ce.caseMode,
    case_type:        ce.caseType    || null,
    institution:      ce.institution || null,
    focus_selected:   JSON.stringify(ce.focusSelected),
    focus_free_text:  ce.focusFreeText || null,
    documents_context:JSON.stringify(ce.docs.map(d => ({ name: d.name, size: d.size }))),
    extracted_facts:  JSON.stringify(ce.extractedFacts),
    chronology:       JSON.stringify(ce.chronology),
    participants:     JSON.stringify(ce.participants),
    analysis_sections:JSON.stringify(ce.sections),
    updated_at:       new Date().toISOString(),
  };

  try {
    if (ce.analysisId) {
      await sb.from('external_case_analyses').update(payload).eq('id', ce.analysisId);
    } else {
      const { data, error } = await sb.from('external_case_analyses').insert(payload).select('id').single();
      if (!error && data) {
        ce.analysisId = data.id;
        loadCESavedCases();
      }
    }
  } catch (_) { /* silencioso — tabla puede no existir */ }
}

async function saveCEMessages() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || !ce.analysisId) return;
  const { data: { user } } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return;
  try {
    await sb.from('external_case_messages').delete().eq('analysis_id', ce.analysisId);
    const rows = ce.chatMessages.map((m, i) => ({
      analysis_id: ce.analysisId,
      user_id: user.id,
      role: m.role,
      content: m.content,
      created_at: new Date(Date.now() + i).toISOString(),
    }));
    if (rows.length) await sb.from('external_case_messages').insert(rows);
  } catch (_) { /* silencioso */ }
}

/* ────────────────────────────────────────────────────────────────
   11 · UTILIDAD
   ──────────────────────────────────────────────────────────────── */
function ceEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ────────────────────────────────────────────────────────────────
   12 · CSS
   ──────────────────────────────────────────────────────────────── */
(function injectCECSS() {
  if (document.getElementById('ce-css')) return;
  const s = document.createElement('style');
  s.id = 'ce-css';
  s.textContent = `
/* ── Layout general ── */
#viewCasosExternos{flex-direction:column;}
.ce-layout{display:flex;flex:1;overflow:hidden;}
.ce-sidebar{width:214px;min-width:214px;border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;}
.ce-sb-header{display:flex;align-items:center;justify-content:space-between;padding:7px 9px;border-bottom:1px solid var(--border);flex-shrink:0;}
.ce-sb-list{flex:1;overflow-y:auto;padding:4px;}
.ce-sb-item{display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:var(--radius);cursor:pointer;transition:all .14s;border:1px solid transparent;margin-bottom:2px;}
.ce-sb-item:hover{background:var(--surface2);}
.ce-sb-item.active{background:var(--gold-glow);border-color:var(--gold-dim);}
.ce-sb-name{font-size:11.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:1px;}
.ce-sb-meta{font-size:9.5px;color:var(--text-muted);}
.ce-main-wrap{flex:1;display:flex;flex-direction:column;overflow:hidden;}
#ceMainWrap{flex:1;display:flex;flex-direction:column;overflow:hidden;}

/* ── Tabs ── */
.ce-tabs{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 14px;flex-shrink:0;align-items:center;}
.ce-tab{padding:8px 11px;font-size:11.5px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .14s;white-space:nowrap;font-family:'Inter',sans-serif;background:none;border-top:none;border-left:none;border-right:none;}
.ce-tab:hover{color:var(--text);}
.ce-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:500;}
.ce-tab.dim{opacity:.5;}
.ce-export-btn{margin-left:auto;padding:4px 10px;font-size:10.5px;}
.ce-body{flex:1;overflow-y:auto;padding:14px 16px;}

/* ── Cards de formulario ── */
.ce-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px;margin-bottom:11px;}
.ce-card-label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--text-muted);font-weight:600;margin-bottom:9px;}
.ce-field-label{display:block;font-size:10.5px;color:var(--text-dim);margin-bottom:4px;font-weight:500;}
.ce-input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12.5px;outline:none;transition:border-color .14s;}
.ce-input:focus{border-color:var(--gold-dim);}
.ce-select{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12px;outline:none;cursor:pointer;appearance:none;transition:border-color .14s;}
.ce-select:focus{border-color:var(--gold-dim);}
.ce-textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12.5px;outline:none;resize:vertical;transition:border-color .14s;line-height:1.5;}
.ce-textarea:focus{border-color:var(--gold-dim);}

/* ── Modo ── */
.ce-mode-row{display:flex;gap:8px;}
.ce-mode-btn{flex:1;display:flex;flex-direction:column;gap:3px;padding:11px 13px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--surface2);cursor:pointer;transition:all .14s;font-family:'Inter',sans-serif;text-align:left;}
.ce-mode-btn:hover,.ce-mode-btn.active{border-color:var(--gold-dim);background:var(--gold-glow);}

/* ── Enfoque pills ── */
.ce-focus-grid{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
.ce-focus-pill{padding:4px 12px;border-radius:14px;border:1px solid var(--border2);background:var(--surface2);color:var(--text-dim);font-size:11.5px;cursor:pointer;transition:all .14s;font-family:'Inter',sans-serif;}
.ce-focus-pill:hover{border-color:var(--gold-dim);color:var(--gold);}
.ce-focus-pill.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);}

/* ── Documentos ── */
.ce-upload-label{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border:1px dashed var(--border2);border-radius:var(--radius);background:var(--surface2);color:var(--text-muted);font-size:11.5px;cursor:pointer;transition:all .14s;font-family:'Inter',sans-serif;margin-bottom:8px;}
.ce-upload-label:hover{border-color:var(--gold-dim);color:var(--gold);}
.ce-docs-list{display:flex;flex-direction:column;gap:4px;}
.ce-doc-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);}
.ce-doc-name{font-size:11.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ce-doc-meta{font-size:10px;color:var(--text-muted);}

/* ── Acciones bar ── */
.ce-actions-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:2px;}

/* ── Extracción ── */
.ce-loading-wrap{text-align:center;padding:50px 20px;color:var(--text-muted);}
.ce-ext-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.ce-ext-block{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.ce-ext-block-title{font-size:11px;font-weight:600;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface2);}
.ce-ext-item{display:flex;align-items:flex-start;gap:8px;padding:7px 11px;border-bottom:1px solid var(--border);font-size:12px;line-height:1.5;}
.ce-ext-item:last-child{border-bottom:none;}
.ce-relevance-badge{font-size:9px;padding:1px 5px;border-radius:8px;border:1px solid;white-space:nowrap;flex-shrink:0;margin-top:2px;}

/* ── Análisis secciones ── */
.ce-analisis-bar{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;gap:10px;flex-wrap:wrap;}
.ce-sections-list{display:flex;flex-direction:column;gap:9px;}
.ce-sec-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:border-color .14s;}
.ce-sec-card:hover{border-color:var(--border2);}
.ce-sec-header{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-bottom:1px solid var(--border);background:var(--surface2);gap:10px;}
.ce-sec-title{font-size:12.5px;font-weight:600;color:var(--text);margin-bottom:2px;}
.ce-sec-desc{font-size:10px;color:var(--text-muted);}
.ce-sec-content{padding:13px 15px;font-size:12.5px;line-height:1.75;color:var(--text);max-height:520px;overflow-y:auto;}
.ce-sec-content h1,.ce-sec-content h2,.ce-sec-content h3{font-family:'EB Garamond',serif;color:var(--gold);margin:10px 0 4px;}
.ce-sec-content h1{font-size:18px;} .ce-sec-content h2{font-size:15px;} .ce-sec-content h3{font-size:13px;}
.ce-sec-content p{margin-bottom:6px;} .ce-sec-content ul,.ce-sec-content ol{padding-left:18px;margin:4px 0;} .ce-sec-content li{margin-bottom:2px;}
.ce-sec-content strong{color:var(--text);} .ce-sec-content hr{border:none;border-top:1px solid var(--border);margin:10px 0;}
.ce-sec-streaming{display:flex;align-items:center;padding:13px 15px;color:var(--text-muted);}

/* ── Chat / Escritos ── */
.ce-escritos-panel{background:var(--surface);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:13px 15px;margin-bottom:12px;}
.ce-escritos-grid{display:flex;flex-wrap:wrap;gap:5px;}
`;
  document.head.appendChild(s);
})();

/* ────────────────────────────────────────────────────────────────
   13 · INYECCIÓN DE VISTA
   ──────────────────────────────────────────────────────────────── */
(function injectCEView() {
  if (document.getElementById('viewCasosExternos')) return;

  const view = document.createElement('div');
  view.id        = 'viewCasosExternos';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';
  view.innerHTML = `
    <div style="padding:12px 18px 8px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <div style="font-family:'EB Garamond',serif;font-size:22px;font-weight:400;color:var(--text)">Análisis de Casos Externos</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Análisis jurídico con IA · Procedimientos disciplinarios · Derecho Laboral</div>
    </div>
    <div class="ce-layout">
      <div class="ce-sidebar" id="ceSidebar">
        <div class="ce-sb-header">
          <span style="font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)">Mis análisis</span>
          <button class="btn-save" style="padding:4px 10px;font-size:10.5px" onclick="ceNewCase()">+ Nuevo</button>
        </div>
        <div class="ce-sb-list" style="padding:10px;color:var(--text-muted);font-size:11px;text-align:center">Cargando…</div>
      </div>
      <div class="ce-main-wrap">
        <div id="ceMainWrap" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
      </div>
    </div>`;

  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();
