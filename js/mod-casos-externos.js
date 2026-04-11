/**
 * =====================================================================
 * MÓDULO COMPLETO: ANÁLISIS DE CASOS EXTERNOS
 * Vanilla JS — adaptado de la referencia React/Supabase
 * =====================================================================
 */
(function () {
  'use strict';

  // ─── CONFIGURACIÓN Y CONSTANTES ─────────────────────────────────

  // Endpoint: Netlify function (replaces missing Supabase edge function)
  const CE_NETLIFY_FN = '/.netlify/functions';

  const ANALYSIS_MODES = [
    { value: 'disciplinario', label: 'Procedimiento Disciplinario', description: 'Investigación sumaria o sumario administrativo' },
    { value: 'laboral', label: 'Derecho Laboral', description: 'Tutela, despido, accidentes, etc.' }
  ];

  const CASE_TYPES = {
    disciplinario: [
      { value: 'acoso_laboral', label: 'Acoso Laboral' },
      { value: 'acoso_sexual', label: 'Acoso Sexual' },
      { value: 'discriminacion', label: 'Discriminación' },
      { value: 'negligencia', label: 'Negligencia Administrativa' },
      { value: 'falta_probidad', label: 'Falta de Probidad' },
      { value: 'incumplimiento', label: 'Incumplimiento de Deberes' },
      { value: 'maltrato', label: 'Maltrato Laboral' },
      { value: 'otro', label: 'Otro' }
    ],
    laboral: [
      { value: 'tutela_laboral', label: 'Tutela Laboral' },
      { value: 'despido_injustificado', label: 'Despido Injustificado' },
      { value: 'despido_indirecto', label: 'Despido Indirecto (Autodespido)' },
      { value: 'accidente_trabajo', label: 'Accidente del Trabajo' },
      { value: 'enfermedad_profesional', label: 'Enfermedad Profesional' },
      { value: 'practicas_antisindicales', label: 'Prácticas Antisindicales' },
      { value: 'vulneracion_derechos', label: 'Vulneración de Derechos Fundamentales' },
      { value: 'cobro_prestaciones', label: 'Cobro de Prestaciones Laborales' },
      { value: 'otro_laboral', label: 'Otro' }
    ]
  };

  const INSTITUTIONS = [
    { value: 'carabineros', label: 'Carabineros de Chile' },
    { value: 'pdi', label: 'Policía de Investigaciones' },
    { value: 'ffaa_ejercito', label: 'Ejército de Chile' },
    { value: 'ffaa_armada', label: 'Armada de Chile' },
    { value: 'ffaa_fach', label: 'Fuerza Aérea de Chile' },
    { value: 'gendarmeria', label: 'Gendarmería de Chile' },
    { value: 'salud_fonasa', label: 'FONASA' },
    { value: 'salud_hospital', label: 'Hospital Público' },
    { value: 'educacion_mineduc', label: 'MINEDUC' },
    { value: 'educacion_universidad', label: 'Universidad Estatal' },
    { value: 'municipalidad', label: 'Municipalidad' },
    { value: 'empresa_privada', label: 'Empresa Privada' },
    { value: 'otro', label: 'Otra Institución' }
  ];

  const FOCUS_TEMPLATES = {
    disciplinario: [
      { value: 'acoso_laboral', label: 'Acoso Laboral', template: 'Analizar si los hechos configuran acoso laboral según el artículo 2° del Código del Trabajo. Evaluar: 1) Existencia de conductas reiteradas de hostigamiento, 2) Menoscabo o humillación al trabajador, 3) Perjuicio en su situación laboral u oportunidades de empleo, 4) Relación de poder entre las partes, 5) Indicadores de sistematicidad de la conducta.' },
      { value: 'acoso_sexual', label: 'Acoso Sexual', template: 'Evaluar la configuración de acoso sexual conforme al artículo 2° inciso 2° del Código del Trabajo. Verificar: 1) Existencia de requerimientos de carácter sexual, 2) Conducta no consentida por la víctima, 3) Amenaza o perjuicio a la situación laboral, 4) Contexto y circunstancias de los hechos, 5) Aplicación del enfoque de género en el análisis.' },
      { value: 'negligencia', label: 'Negligencia Administrativa', template: 'Determinar si existe negligencia administrativa según el artículo 119 letra e) del Estatuto Administrativo. Evaluar: 1) Existencia de un deber funcionario incumplido, 2) Falta de diligencia debida, 3) Resultado dañoso o riesgo creado, 4) Relación causal entre la omisión y el resultado, 5) Circunstancias atenuantes o agravantes.' },
      { value: 'proporcionalidad', label: 'Proporcionalidad de la Sanción', template: 'Analizar la proporcionalidad de la sanción aplicada conforme a los principios del derecho administrativo sancionador. Evaluar: 1) Gravedad objetiva de la falta, 2) Circunstancias atenuantes y agravantes, 3) Hoja de vida del funcionario, 4) Perjuicio causado al servicio, 5) Comparación con sanciones aplicadas en casos similares según jurisprudencia de CGR.' },
      { value: 'debido_proceso', label: 'Debido Proceso', template: 'Verificar el cumplimiento del debido proceso administrativo. Evaluar: 1) Notificación oportuna de cargos, 2) Plazo efectivo para presentar descargos, 3) Recepción de pruebas ofrecidas, 4) Fundamentación de la resolución, 5) Cumplimiento de plazos legales del procedimiento, 6) Imparcialidad del fiscal instructor.' },
      { value: 'falta_probidad', label: 'Falta de Probidad', template: 'Analizar si los hechos constituyen falta de probidad según el artículo 62 de la Ley 18.575 y artículo 119 letra a) del Estatuto Administrativo. Evaluar: 1) Conducta contraria a la honestidad, 2) Afectación al interés público, 3) Uso indebido del cargo, 4) Obtención de beneficios indebidos, 5) Precedentes de CGR sobre probidad administrativa.' },
      { value: 'prescripcion', label: 'Prescripción', template: 'Analizar la prescripción de la acción disciplinaria conforme al artículo 157 del Estatuto Administrativo. Evaluar: 1) Fecha de conocimiento de los hechos por la autoridad, 2) Cómputo del plazo de 4 años, 3) Causales de interrupción o suspensión, 4) Aplicación de jurisprudencia de CGR sobre dies a quo, 5) Efectos de la prescripción en el procedimiento.' }
    ],
    laboral: [
      { value: 'tutela_laboral', label: 'Tutela Laboral', template: 'Analizar la procedencia de acción de tutela laboral conforme a los artículos 485 y siguientes del Código del Trabajo. Evaluar: 1) Derechos fundamentales vulnerados (art. 485 CT), 2) Indicios suficientes de vulneración, 3) Aplicación de la prueba indiciaria (art. 493 CT), 4) Garantía de indemnidad, 5) Medidas reparatorias y sancionatorias procedentes, 6) Jurisprudencia relevante.' },
      { value: 'despido_injustificado', label: 'Despido Injustificado', template: 'Evaluar la justificación del despido conforme al artículo 159, 160 y 161 del Código del Trabajo. Analizar: 1) Causal invocada y hechos fundantes, 2) Proporcionalidad entre falta y sanción, 3) Oportunidad del despido (inmediatez), 4) Formalidades del aviso de despido (art. 162 CT), 5) Cotizaciones previsionales adeudadas (Ley Bustos), 6) Procedencia de indemnizaciones y recargos legales.' },
      { value: 'despido_indirecto', label: 'Autodespido', template: 'Analizar la configuración de despido indirecto conforme al artículo 171 del Código del Trabajo. Evaluar: 1) Causales del art. 160 N°1, 5 o 7 aplicables al empleador, 2) Gravedad del incumplimiento patronal, 3) Oportunidad de la renuncia, 4) Acumulación con tutela laboral (art. 489 CT), 5) Indemnizaciones procedentes y recargos.' },
      { value: 'accidente_trabajo', label: 'Accidente del Trabajo', template: 'Analizar responsabilidad por accidente del trabajo conforme a la Ley N° 16.744 y artículo 184 del Código del Trabajo. Evaluar: 1) Deber de protección del empleador, 2) Culpa o dolo del empleador (art. 69 letra b Ley 16.744), 3) Nexo causal, 4) Medidas de seguridad incumplidas (D.S. 594), 5) Lucro cesante y daño moral, 6) Prestaciones de la Ley 16.744.' },
      { value: 'practicas_antisindicales', label: 'Prácticas Antisindicales', template: 'Evaluar existencia de prácticas antisindicales conforme a los artículos 289 y siguientes del Código del Trabajo. Analizar: 1) Conductas que atentan contra la libertad sindical, 2) Fuero sindical y sus efectos, 3) Procedimiento de tutela aplicable, 4) Multas y sanciones procedentes, 5) Dictámenes de la Dirección del Trabajo.' },
      { value: 'cobro_prestaciones', label: 'Cobro de Prestaciones', template: 'Determinar procedencia de cobro de prestaciones laborales adeudadas. Evaluar: 1) Remuneraciones impagas, 2) Horas extraordinarias no compensadas, 3) Feriado legal y proporcional, 4) Gratificaciones (art. 46-50 CT), 5) Intereses y reajustes (art. 63 CT), 6) Prescripción de derechos laborales (art. 510 CT).' }
    ]
  };

  const DISCIPLINARY_SECTIONS = [
    { id: 'hechos', title: 'I. Hechos Relevantes', description: 'Cronología, hechos acreditados y participantes' },
    { id: 'derecho_aplicable', title: 'II. Derecho Aplicable', description: 'Marco normativo general, especial y jurisprudencia' },
    { id: 'analisis', title: 'III. Análisis Jurídico', description: 'Calificación jurídica, responsabilidad y proporcionalidad' },
    { id: 'conclusion', title: 'IV. Conclusiones', description: 'Conclusiones, recomendaciones y propuesta de sanción' }
  ];

  const LABOR_SECTIONS = [
    { id: 'antecedentes_laborales', title: 'I. Antecedentes del Caso', description: 'Relación laboral, hechos y contexto fáctico' },
    { id: 'marco_normativo_laboral', title: 'II. Marco Normativo Laboral', description: 'Código del Trabajo, leyes especiales y reglamentos' },
    { id: 'analisis_laboral', title: 'III. Análisis Jurídico Laboral', description: 'Subsunción, prueba indiciaria y jurisprudencia' },
    { id: 'estrategia_laboral', title: 'IV. Estrategia y Pretensiones', description: 'Acciones procedentes, indemnizaciones y medidas' },
    { id: 'conclusion_laboral', title: 'V. Conclusiones', description: 'Síntesis, recomendaciones y viabilidad' }
  ];

  const IRAC_PROMPTS = {
    hechos: '## I. HECHOS RELEVANTES\nAnaliza los antecedentes del expediente y presenta:\n1. Cronología de los hechos (fechas, lugares, participantes)\n2. Hechos acreditados vs alegaciones (evidencia de sustento)\n3. Participantes clave (víctima, denunciado, testigos)\n4. Contexto institucional (marco organizacional, cadena de mando)',
    derecho_aplicable: '## II. DERECHO APLICABLE\nIdentifica y explica:\nA. Normativa General (CPR, CT, Ley 19.880)\nB. Normativa Especial según Institución (estatutos, reglamentos)\nC. Normativa sobre la Materia Específica (Ley 20.607, 20.005, 20.609)\nD. Jurisprudencia Relevante (CGR, sentencias judiciales)',
    analisis: '## III. ANÁLISIS JURÍDICO\nA. Calificación Jurídica (subsunción, elementos configurativos, gravedad)\nB. Responsabilidad Administrativa (determinación, participación, atenuantes/agravantes)\nC. Debido Proceso (garantías, plazos, defensa)\nD. Proporcionalidad (relación infracción-sanción, precedentes)\nE. Fortalezas y Debilidades del Caso',
    conclusion: '## IV. CONCLUSIONES Y RECOMENDACIONES\nA. Conclusión Principal (síntesis, responsabilidades, calificación)\nB. Recomendaciones Procesales (diligencias, medidas cautelares)\nC. Recomendaciones de Sanción (propuesta fundamentada, proporcionalidad)\nD. Prevención (medidas, mejora institucional, capacitación)'
  };

  const LABOR_PROMPTS = {
    antecedentes_laborales: '## I. ANTECEDENTES DEL CASO\n1. Relación Laboral Detallada:\n   - Partes (empleador, trabajador, representantes)\n   - Tipo de contrato (definido, indefinido, honorarios, suplencia)\n   - Duración de la relación laboral y períodos relevantes\n   - Remuneración (bruta, líquida, comisiones, bonificaciones)\n   - Jornada de trabajo (art. 22 CT: ordinaria, extraordinaria, distribución)\n   - Fueros especiales (sindical art. 235-244 CT, maternal art. 194 CT, enfermedad art. 6 LSP)\n   - Subordinación y dependencia (elementos contrato trabajo art. 7 CT)\n   - Cotizaciones al día (previsión, seguro, impuestos)\n   - Ius variandi abusivo (cambios funciones, remuneración, horario)\n2. Hechos Relevantes (cronología, documentación, contexto)\n3. Conflicto Laboral (descripción, derechos fundamentales afectados, actuaciones previas)\n4. Término de la Relación (forma, causal, formalidades, indemnizaciones pagadas)',
    marco_normativo_laboral: '## II. MARCO NORMATIVO LABORAL\nA. Código del Trabajo (DFL 1/2003):\n   - Tutela laboral arts. 485-495 CT (procedimiento, plazos 60 días art. 510, indicios art. 493)\n   - Art. 162 CT (formalidades despido, aviso previo)\n   - Art. 168 CT (indemnizaciones: años de servicio con recargo 80%, desahucio)\n   - Art. 171 CT (autodespido: renuncia por incumplimientos graves)\n   - Art. 184 CT (deber de protección empleador: integridad física y psíquica)\n   - Art. 2° CT (prohibiciones: acoso, discriminación, trato discriminatorio)\n   - Art. 10 DFL 1/2003 (cotizaciones obligatorias)\nB. Ley 21.643 (Ley Karin - Acoso y violencia laboral):\n   - Art. 1 (definiciones: acoso laboral, sexual, violencia en trabajo)\n   - Art. 2 (protocolo prevención y respuesta)\n   - Arts. 211-A a 211-E CT (procedimiento investigación acoso)\nC. Jurisprudencia Clave:\n   - "Indicios suficientes" Corte Suprema en tutela: prueba indiciaria del art. 493 CT\n   - Doctrina: Sergio Gamonal, José Luis Ugarte, Irene Rojas\nD. Legislación Complementaria (Ley 16.744, 20.607, 20.005, 20.348, Ley Bustos)\nE. Normativa Reglamentaria (D.S. 594, reglamento interno, convenios colectivos)',
    analisis_laboral: '## III. ANÁLISIS JURÍDICO LABORAL\nA. Calificación Jurídica:\n   - Subsunción normativa de hechos en tipos laborales\n   - Tipificación de causal de término (art. 161 CT y siguientes)\n   - Pretensiones procedentes\nB. Derechos Fundamentales Vulnerados (art. 19 CPR):\n   - N°1: Integridad física y psíquica\n   - N°4: Vida privada, honra, inviolabilidad comunicaciones\n   - N°6: Libertad de conciencia\n   - N°12: Libertad de expresión\n   - N°16: Libertad de trabajo, no discriminación\nC. Análisis de Indicios (art. 493 CT - nunca exigir prueba directa):\n   - Indicios disponibles: correos, mensajes, testigos, informes médicos\n   - Licencias médicas (frecuencia, diagnóstico, causalidad con hechos)\n   - Cambios funcionales discriminatorios\n   - Evaluaciones de desempeño injustas\n   - Cambios remuneracionales sin causa\n   - Constancia de comportamientos discriminatorios\nD. Test de Proporcionalidad:\n   - Medida es idónea para fin perseguido\n   - Necesaria (no hay alternativa menos restrictiva)\n   - Proporcional stricto sensu (beneficio vs. vulneración)\nE. Causalidad:\n   - Nexo causal entre hechos y términación\n   - Pretexto vs. causa verdadera\nF. Garantía de Indemnidad (art. 485 inc. 3° CT):\n   - Prohibición represalias post-tutela\n   - Prohibición cambios condiciones laborales\nG. Fortalezas y Debilidades (prueba disponible, riesgos jurisprudenciales)',
    estrategia_laboral: '## IV. ESTRATEGIA Y PRETENSIONES\nA. Acción Procesal Recomendada:\n   - Tutela laboral (art. 485-495 CT): 60 días hábiles desde separación (art. 510)\n   - Demanda laboral acumulada (art. 480 CT): despido injustificado\n   - Competencia territorial (domicilio demandado o donde se ejecutó trabajo)\nB. Pretensiones Específicas:\n   - Nulidad del despido (art. 489 inc. 2° CT)\n   - Indemnización tutela: 6-11 remuneraciones (art. 489 inc. 3° CT)\n   - Indemnización sustitutiva aviso previo (art. 162 CT)\n   - Años de servicio con recargo 80% (art. 168 letra c CT)\n   - Indemnización perjuicio moral (art. 1556 CC, cuantificación razonable)\n   - Lucro cesante (remuneraciones dejadas de percibir hasta juicio)\n   - Cotizaciones previsionales y de seguro (Ley Bustos art. 162 inc. 5°-7° CT)\n   - Reincorporación al trabajo (art. 489 inc. 2° CT)\nC. Acumulación de Acciones:\n   - Tutela laboral como principal\n   - Despido injustificado como acumulativa\nD. Prueba a Rendir:\n   - Documental: contrato, correos, resoluciones, licencias médicas\n   - Testimonial: compañeros, jefes directos, testigos presenciales\n   - Confesional: declaración demandado\n   - Pericial: médico (daño psicológico), contable (lucro cesante)\nE. Medidas Cautelares:\n   - Prohibición represalias\n   - Protección de pruebas\n   - Innovativa: reincorporación provisional',
    conclusion_laboral: '## V. CONCLUSIONES Y RECOMENDACIONES\nA. Síntesis del Análisis:\n   - Hechos probados o con indicios suficientes\n   - Marco normativo aplicable y vulneraciones configuradas\n   - Procedencia de la tutela laboral\nB. Viabilidad del Caso:\n   - Probabilidad de éxito basada en indicios (art. 493 CT)\n   - Análisis jurisprudencia: tendencia Cortes hacia protección derechos fundamentales\n   - Riesgos procesales (carga probatoria, plazos, prescripción)\nC. Estimación de Montos:\n   - Cálculo tutela: 6-11 remuneraciones (base remuneración promedio últimos 3 meses)\n   - Cálculo años servicio: valor remuneración mensual x años x 1.80\n   - Estimación daño moral (doctrina: 1-3 meses remuneración como base)\n   - Lucro cesante: desde separación hasta sentencia (estimado)\n   - Total indemnización estimada\nD. Plazos Críticos:\n   - Prescripción tutela: 60 días hábiles desde separación (art. 510 CT)\n   - Prescripción despido injustificado: 2 años (art. 510 CT)\nE. Recomendaciones:\n   - Acción sugerida (tutela y/o demanda)\n   - Diligencias previas (notificación, copia documental)\n   - Estrategia de prueba prioritaria\n   - Medidas cautelares a solicitar\nF. Consideraciones Adicionales:\n   - Aplicación Ley 21.643 (Ley Karin) si hay acoso/violencia\n   - Perspectiva de género si hay discriminación basada en sexo\n   - Precedentes jurisprudenciales clave Corte Suprema\n   - Doctrina laboralista aplicable (Gamonal, Ugarte, Rojas)'
  };

  const SECTION_SYSTEM_PROMPTS = {
    disciplinario: 'Eres un asistente jurídico-administrativo experto en procedimientos disciplinarios y sancionatorios de la Administración Pública chilena.\nTu análisis debe:\n- Ser técnico, preciso y fundamentado en la normativa aplicable\n- Considerar la jurisprudencia de la Contraloría General de la República\n- Respetar el debido proceso y las garantías fundamentales\n- Aplicar perspectiva de género cuando sea pertinente\n- Ser proporcional y objetivo en las conclusiones\n- PROTECCIÓN DE DATOS: No revelar nombres, RUT, correos, teléfonos. Usar roles genéricos.',
    laboral: 'Eres un abogado laboralista experto en derecho del trabajo chileno con enfoque en tutela laboral.\nTu análisis debe:\n- Ser técnico, preciso y fundamentado en el Código del Trabajo (DFL 1/2003) y legislación laboral específica\n- Citar artículos en formato: art. X del Código del Trabajo / art. X de la Ley N° XXXX\n- Citar jurisprudencia con formato: Corte Suprema, Rol N° XXXX-XXXX, fecha, considerando X\n- Para tutela laboral: SIEMPRE aplicar análisis de indicios del art. 493 CT. NUNCA exigir prueba directa al trabajador\n- Considerar Ley 21.643 (Ley Karin) para casos de acoso laboral, sexual o violencia en el trabajo\n- Aplicar derechos fundamentales art. 19 CPR (integridad, vida privada, libertad de expresión, no discriminación)\n- Aplicar test de proporcionalidad para verificar vulneraciones\n- Fundamentar con doctrina de autores: Sergio Gamonal, José Luis Ugarte, Irene Rojas, Javier Lizama\n- Ser estratégico y orientado a la acción procesal: indicar pretensiones específicas, plazos, montos estimados\n- Aplicar perspectiva de género cuando corresponda\n- En prescripción: recordar 60 días hábiles tutela desde separación (art. 510 CT), 2 años despido injustificado'
  };

  const WRITING_TEMPLATES = [
    { id: 'demanda', label: 'Demanda', description: 'Demanda laboral o civil' },
    { id: 'recurso_proteccion', label: 'Recurso de Protección', description: 'Recurso ante Corte de Apelaciones' },
    { id: 'contestacion', label: 'Contestación', description: 'Contestación de demanda' },
    { id: 'apelacion', label: 'Apelación', description: 'Recurso de apelación' },
    { id: 'tutela', label: 'Tutela Laboral', description: 'Acción de tutela laboral' },
    { id: 'otro', label: 'Otro escrito', description: 'Escrito judicial personalizado' }
  ];

  // ─── MODULE STATE ────────────────────────────────────────────────

  const ce = {
    // UI
    activeTab: 'documentos',
    sidebarOpen: true,
    // Case identification
    analysisMode: 'disciplinario',
    caseName: '',
    caseType: '',
    institution: '',
    estamento: '',
    focusTemplates: [],
    focusFree: '',
    driveLink: '',
    // Case folder (Drive)
    caseFolderId: null,
    caseFolderUrl: null,
    caseFolderFiles: [],
    caseFolderLoading: false,
    // Documents
    documents: [],
    documentsContext: '',
    // Collections
    selectedBaseCollections: ['jurisprudencia', 'doctrina', 'normativa'],
    collectionMode: 'priority',
    customCollections: [],
    priorityCollections: [],
    // Search sources
    searchSources: { qdrant: true, pjud: true, cgr: true, biblioteca: true },
    // Extraction
    extractedFacts: [],
    chronology: [],
    participants: [],
    mentionedNorms: [],
    extracting: false,
    // Library
    libraryResults: { jurisprudencia: '', doctrina: '', normativa: '', custom_collections: '' },
    searching: false,
    // Analysis sections
    analysisSections: {},
    generatingSection: null,
    generatingAll: false,
    // Chat
    chatMessages: [],
    chatInput: '',
    chatLoading: false,
    chatFiles: [],
    // Writings
    writingTemplate: '',
    writingInstructions: '',
    writingResult: '',
    writingLoading: false,
    showWritingsPanel: false,
    // Persistence
    analysisId: null,
    savedCases: [],
    loadingCases: false,
    saving: false,
    _active: false
  };

  // ─── HELPERS ─────────────────────────────────────────────────────

  function _sb() { return typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null); }
  function _session() { return typeof session !== 'undefined' ? session : null; }
  function _token() { var s = _session(); return s ? s.access_token : ''; }
  function _userId() { var s = _session(); return s && s.user ? s.user.id : null; }

  async function _ceFetch(url, body) {
    var token = _token();
    var r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'x-auth-token': token
      },
      body: JSON.stringify(body)
    });
    return r;
  }

  async function _ceFetchJSON(url, body) {
    var r = await _ceFetch(url, body);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // Stream helper: calls /api/chat-stream (edge function, no timeout limit)
  // Returns full accumulated text. onChunk(text) called for each delta.
  var CHAT_STREAM_URL = '/api/chat-stream';
  async function _ceStreamClaude(system, userContent, opts) {
    opts = opts || {};
    var onChunk = opts.onChunk || function () {};
    var maxTokens = opts.maxTokens || 4096;
    var token = _token();
    var r = await fetch(CHAT_STREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({
        system: system,
        messages: [{ role: 'user', content: userContent }],
        max_tokens: maxTokens
      })
    });
    if (!r.ok) throw new Error('Stream HTTP ' + r.status);
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    var full = '';
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data: ')) continue;
        var payload = line.substring(6);
        if (payload === '[DONE]') continue;
        try {
          var parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            full += parsed.delta.text;
            onChunk(parsed.delta.text);
          }
        } catch (e) { /* skip */ }
      }
    }
    return full;
  }

  function _escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _truncate(s, max) {
    if (!s || s.length <= max) return s || '';
    return s.substring(0, max) + '…';
  }

  function _formatDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    return dt.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function _getSections() {
    return ce.analysisMode === 'laboral' ? LABOR_SECTIONS : DISCIPLINARY_SECTIONS;
  }

  function _getPrompts() {
    return ce.analysisMode === 'laboral' ? LABOR_PROMPTS : IRAC_PROMPTS;
  }

  // ─── TEXT EXTRACTION ─────────────────────────────────────────────

  async function _extractTextFromFile(file) {
    var ext = (file.name || '').split('.').pop().toLowerCase();
    var buf = await file.arrayBuffer();

    if (ext === 'txt') {
      return new TextDecoder('utf-8').decode(buf);
    }
    if (ext === 'pdf' && typeof pdfjsLib !== 'undefined') {
      try {
        var pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        var pages = [];
        for (var i = 1; i <= pdf.numPages; i++) {
          var page = await pdf.getPage(i);
          var content = await page.getTextContent();
          pages.push(content.items.map(function (it) { return it.str; }).join(' '));
        }
        return pages.join('\n\n');
      } catch (e) { console.warn('PDF extraction error:', e); return ''; }
    }
    if ((ext === 'docx' || ext === 'doc') && typeof mammoth !== 'undefined') {
      try {
        var result = await mammoth.extractRawText({ arrayBuffer: buf });
        return result.value || '';
      } catch (e) { console.warn('DOCX extraction error:', e); return ''; }
    }
    return '';
  }

  // ─── CUSTOM COLLECTIONS LOADER ───────────────────────────────────

  async function _loadCustomCollections() {
    var db = _sb();
    if (!db || !_userId()) return;
    try {
      var res = await db.from('custom_qdrant_collections').select('*').eq('user_id', _userId());
      ce.customCollections = (res.data || []).map(function (c) {
        return { value: c.collection_name, label: c.display_name || c.collection_name, id: c.id };
      });
    } catch (e) { console.warn('Custom collections error:', e); }
  }

  // ─── PERSISTENCE (Supabase) ──────────────────────────────────────

  async function _loadSavedCases() {
    var db = _sb();
    if (!db || !_userId()) return;
    ce.loadingCases = true;
    _renderSidebar();
    try {
      var res = await db.from('external_case_analyses')
        .select('id,case_name,case_type,analysis_mode,institution,updated_at')
        .eq('user_id', _userId())
        .order('updated_at', { ascending: false })
        .limit(20);
      ce.savedCases = res.data || [];
    } catch (e) { console.warn('Load saved cases error:', e); }
    ce.loadingCases = false;
    _renderSidebar();
  }

  async function _saveAnalysis() {
    var db = _sb();
    if (!db || !_userId()) return;
    if (!ce.caseName.trim()) { showToast('⚠ Ingresa un nombre para el caso'); return; }
    ce.saving = true;
    _renderHeader();
    try {
      var payload = {
        user_id: _userId(),
        case_name: ce.caseName,
        case_type: ce.caseType,
        analysis_mode: ce.analysisMode,
        institution: ce.institution,
        estamento: ce.estamento,
        focus_templates: ce.focusTemplates,
        focus_free: ce.focusFree,
        drive_link: ce.driveLink,
        case_folder_id: ce.caseFolderId,
        case_folder_url: ce.caseFolderUrl,
        documents_context: (ce.documentsContext || '').substring(0, 200000),
        extracted_facts: ce.extractedFacts,
        chronology: ce.chronology,
        participants: ce.participants,
        mentioned_norms: ce.mentionedNorms,
        analysis_sections: ce.analysisSections,
        library_results: ce.libraryResults,
        selected_base_collections: ce.selectedBaseCollections,
        collection_mode: ce.collectionMode,
        priority_collections: ce.priorityCollections,
        search_sources: ce.searchSources,
        current_step: ce.activeTab,
        updated_at: new Date().toISOString()
      };
      if (ce.analysisId) {
        await db.from('external_case_analyses').update(payload).eq('id', ce.analysisId);
      } else {
        var res = await db.from('external_case_analyses').insert(payload).select('id').single();
        if (res.data) ce.analysisId = res.data.id;
      }
      showToast('✓ Análisis guardado');
      _loadSavedCases();
    } catch (e) {
      console.error('Save error:', e);
      showToast('✗ Error al guardar');
    }
    ce.saving = false;
    _renderHeader();
  }

  async function _loadAnalysis(id) {
    var db = _sb();
    if (!db) return;
    try {
      var res = await db.from('external_case_analyses').select('*').eq('id', id).eq('user_id', _userId()).single();
      if (!res.data) { showToast('✗ Análisis no encontrado'); return; }
      var d = res.data;
      ce.analysisId = d.id;
      ce.caseName = d.case_name || '';
      ce.caseType = d.case_type || '';
      ce.analysisMode = d.analysis_mode || 'disciplinario';
      ce.institution = d.institution || '';
      ce.estamento = d.estamento || '';
      ce.focusTemplates = d.focus_templates || [];
      ce.focusFree = d.focus_free || '';
      ce.driveLink = d.drive_link || '';
      ce.caseFolderId = d.case_folder_id || null;
      ce.caseFolderUrl = d.case_folder_url || null;
      ce.caseFolderFiles = [];
      ce.documentsContext = d.documents_context || '';
      ce.extractedFacts = d.extracted_facts || [];
      ce.chronology = d.chronology || [];
      ce.participants = d.participants || [];
      ce.mentionedNorms = d.mentioned_norms || [];
      ce.analysisSections = d.analysis_sections || {};
      ce.libraryResults = d.library_results || { jurisprudencia: '', doctrina: '', normativa: '', custom_collections: '' };
      ce.selectedBaseCollections = d.selected_base_collections || ['jurisprudencia', 'doctrina', 'normativa'];
      ce.searchSources = d.search_sources || { qdrant: true, pjud: true, cgr: true, biblioteca: true };
      ce.collectionMode = d.collection_mode || 'priority';
      ce.priorityCollections = d.priority_collections || [];
      ce.activeTab = d.current_step || 'documentos';
      ce.documents = [];
      ce.chatMessages = [];
      // Load chat messages
      await _loadChatMessages();
      showToast('✓ Caso cargado');
      _renderAll();
      // Auto-load Drive folder files if linked
      if (ce.caseFolderId) { _ceRefreshFolder(); }
    } catch (e) { console.error('Load analysis error:', e); showToast('✗ Error al cargar'); }
  }

  async function _deleteAnalysis(id) {
    if (!confirm('¿Eliminar este análisis? Esta acción no se puede deshacer.')) return;
    var db = _sb();
    if (!db) return;
    try {
      await db.from('external_case_messages').delete().eq('analysis_id', id);
      await db.from('external_case_analyses').delete().eq('id', id);
      if (ce.analysisId === id) _newCase();
      showToast('✓ Análisis eliminado');
      _loadSavedCases();
    } catch (e) { showToast('✗ Error al eliminar'); }
  }

  function _newCase() {
    ce.analysisId = null;
    ce.caseName = '';
    ce.caseType = '';
    ce.analysisMode = 'disciplinario';
    ce.institution = '';
    ce.estamento = '';
    ce.focusTemplates = [];
    ce.focusFree = '';
    ce.driveLink = '';
    ce.caseFolderId = null;
    ce.caseFolderUrl = null;
    ce.caseFolderFiles = [];
    ce.caseFolderLoading = false;
    ce.documents = [];
    ce.documentsContext = '';
    ce.selectedBaseCollections = ['jurisprudencia', 'doctrina', 'normativa'];
    ce.collectionMode = 'priority';
    ce.priorityCollections = [];
    ce.searchSources = { qdrant: true, pjud: true, cgr: true, biblioteca: true };
    ce.extractedFacts = [];
    ce.chronology = [];
    ce.participants = [];
    ce.mentionedNorms = [];
    ce.libraryResults = { jurisprudencia: '', doctrina: '', normativa: '', custom_collections: '' };
    ce.analysisSections = {};
    ce.generatingSection = null;
    ce.generatingAll = false;
    ce.chatMessages = [];
    ce.chatInput = '';
    ce.writingResult = '';
    ce.showWritingsPanel = false;
    ce.activeTab = 'documentos';
    _renderAll();
  }

  // ─── CHAT PERSISTENCE ───────────────────────────────────────────

  async function _loadChatMessages() {
    if (!ce.analysisId) return;
    var db = _sb();
    if (!db) return;
    try {
      var res = await db.from('external_case_messages')
        .select('*')
        .eq('analysis_id', ce.analysisId)
        .eq('user_id', _userId())
        .order('created_at', { ascending: true })
        .limit(50);
      ce.chatMessages = (res.data || []).map(function (m) {
        return { id: m.id, role: m.role, content: m.content };
      });
    } catch (e) { console.warn('Load chat error:', e); }
  }

  async function _saveChatMessage(role, content, msgIdx) {
    if (!ce.analysisId) return;
    var db = _sb();
    if (!db) return;
    try {
      var res = await db.from('external_case_messages').insert({
        analysis_id: ce.analysisId,
        user_id: _userId(),
        role: role,
        content: content
      }).select('id').single();
      // Store the DB id on the message object
      if (res.data && res.data.id && typeof msgIdx === 'number' && ce.chatMessages[msgIdx]) {
        ce.chatMessages[msgIdx].id = res.data.id;
      }
    } catch (e) { console.warn('Save chat msg error:', e); }
  }

  // ─── EXTRACT FACTS ──────────────────────────────────────────────

  function _getDriveFolderContext() {
    if (!ce.caseFolderFiles || !ce.caseFolderFiles.length) return '';
    var ctx = '\n\n=== ARCHIVOS EN CARPETA DRIVE DEL CASO ===\n';
    ctx += 'La carpeta Drive del caso contiene los siguientes archivos como antecedentes:\n';
    ce.caseFolderFiles.forEach(function (f) {
      var sizeStr = f.size ? ' (' + (parseInt(f.size) / 1024).toFixed(0) + ' KB)' : '';
      ctx += '- ' + (f._path || f.name) + sizeStr + '\n';
    });
    ctx += '=== FIN ARCHIVOS DRIVE ===\n';
    return ctx;
  }

  async function _extractFacts() {
    var hasDocs = ce.documentsContext && ce.documentsContext.length >= 50;
    var hasDriveFiles = ce.caseFolderFiles && ce.caseFolderFiles.length > 0;
    if (!hasDocs && !hasDriveFiles) {
      showToast('⚠ Carga documentos o vincula una carpeta de Drive primero');
      return;
    }
    ce.extracting = true;
    _renderTab();
    try {
      var system = 'Eres un experto jurídico chileno especializado en análisis de expedientes administrativos y laborales.\n'
        + 'Tu tarea es extraer información estructurada de documentos de un caso.\n'
        + 'Responde SIEMPRE en formato JSON válido, sin markdown ni bloques de código.\n'
        + 'PROTECCIÓN DE DATOS: No incluyas nombres reales, RUT, correos ni teléfonos. Usa roles genéricos.';
      var userPrompt = 'Analiza los siguientes documentos de un caso'
        + (ce.caseType ? ' de tipo "' + ce.caseType + '"' : '')
        + (ce.institution ? ' en la institución "' + ce.institution + '"' : '') + '.\n\n'
        + 'DOCUMENTOS:\n' + (ce.documentsContext || '').substring(0, 50000) + _getDriveFolderContext()
        + '\n\nExtrae la siguiente información en formato JSON con esta estructura exacta:\n'
        + '{\n  "facts": [\n    {"fact": "descripción del hecho", "relevance": "alta|media|baja", "source": "fuente"}\n  ],\n'
        + '  "chronology": [\n    {"date": "fecha o período", "event": "descripción del evento"}\n  ],\n'
        + '  "participants": [\n    {"name": "rol genérico (NO nombre real)", "role": "rol procesal", "estamento": "estamento si aplica"}\n  ],\n'
        + '  "mentioned_norms": ["Ley X art. Y", "DFL Z"]\n}\n\n'
        + 'REGLAS:\n- Identifica TODOS los hechos relevantes, ordenados por importancia\n'
        + '- La cronología debe estar en orden temporal\n'
        + '- Clasifica relevancia como "alta", "media" o "baja"\n'
        + '- Para participantes, usa roles genéricos en vez de nombres reales\n'
        + '- Incluye TODAS las normas mencionadas o aplicables';

      if (ce.driveLink) {
        userPrompt += '\n\nNOTA: El usuario tiene normativa específica vinculada en: ' + ce.driveLink + '. Considérala al identificar normas aplicables.';
      }

      var text = await _ceStreamClaude(system, userPrompt, { maxTokens: 4096 });

      // Parse JSON from response
      var parsed = {};
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        var m = text.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = {}; } }
      }
      ce.extractedFacts = parsed.facts || [];
      ce.chronology = parsed.chronology || [];
      ce.participants = parsed.participants || [];
      ce.mentionedNorms = parsed.mentioned_norms || [];
      ce.activeTab = 'extraccion';
      showToast('✓ Hechos extraídos: ' + ce.extractedFacts.length);
    } catch (e) {
      console.error('Extract facts error:', e);
      showToast('✗ Error al extraer hechos');
    }
    ce.extracting = false;
    _renderAll();
  }

  // ─── SEARCH LIBRARY ─────────────────────────────────────────────

  async function _searchLibrary() {
    var topic = (ce.focusFree || ce.focusTemplates.map(function (t) { return t; }).join(', ')).substring(0, 500);
    if (!topic && ce.extractedFacts.length) {
      topic = ce.extractedFacts.slice(0, 3).map(function (f) { return typeof f === 'string' ? f : (f.fact || f.description || ''); }).join('. ');
    }
    if (!topic) { showToast('⚠ Define un enfoque o extrae hechos primero'); return; }

    ce.searching = true;
    _renderTab();
    try {
      var data = await _ceFetchJSON(CE_NETLIFY_FN + '/analyze-external-case', {
        action: 'search_library',
        topic: topic,
        caseType: ce.caseType,
        institution: ce.institution,
        analysisMode: ce.analysisMode,
        priorityCollections: ce.priorityCollections,
        collectionMode: ce.collectionMode,
        selectedBaseCollections: ce.selectedBaseCollections,
        sources: ce.searchSources,
        extractedFacts: ce.extractedFacts.slice(0, 5).map(function (f) { return typeof f === 'string' ? f : (f.fact || ''); }).join('. '),
        driveLink: ce.driveLink
      });
      ce.libraryResults = {
        jurisprudencia: data.jurisprudencia || '',
        doctrina: data.doctrina || '',
        normativa: data.normativa || '',
        custom_collections: data.custom_collections || ''
      };
      ce.activeTab = 'biblioteca';
      showToast('✓ Búsqueda completada');
    } catch (e) {
      console.error('Search library error:', e);
      showToast('✗ Error en búsqueda');
    }
    ce.searching = false;
    _renderAll();
  }

  // ─── GENERATE SECTION (SSE streaming) ────────────────────────────

  async function _generateSection(sectionId) {
    var sections = _getSections();
    var prompts = _getPrompts();
    var section = sections.find(function (s) { return s.id === sectionId; });
    if (!section) return;

    ce.generatingSection = sectionId;
    ce.analysisSections[sectionId] = '';
    _renderTab();

    // Build additional context
    var additionalCtx = '';
    if (ce.extractedFacts.length) {
      additionalCtx += '\n\nHECHOS EXTRAÍDOS:\n' + ce.extractedFacts.map(function (f, i) {
        return (i + 1) + '. ' + (typeof f === 'string' ? f : (f.fact || f.description || ''));
      }).join('\n');
    }
    if (ce.chronology && ce.chronology.length) {
      additionalCtx += '\n\nCRONOLOGÍA:\n' + ce.chronology.map(function (c) {
        return '- ' + (c.date || '') + ': ' + (c.event || c.description || '');
      }).join('\n');
    }
    if (ce.libraryResults.jurisprudencia) additionalCtx += '\n\nJURISPRUDENCIA:\n' + ce.libraryResults.jurisprudencia.substring(0, 20000);
    if (ce.libraryResults.doctrina) additionalCtx += '\n\nDOCTRINA:\n' + ce.libraryResults.doctrina.substring(0, 20000);
    if (ce.libraryResults.normativa) additionalCtx += '\n\nNORMATIVA:\n' + ce.libraryResults.normativa.substring(0, 20000);
    if (ce.libraryResults.custom_collections) additionalCtx += '\n\nCOLECCIONES PERSONALIZADAS:\n' + ce.libraryResults.custom_collections.substring(0, 20000);

    // Focus context
    var focusCtx = '';
    if (ce.focusFree) focusCtx += '\nENFOQUE DEL ANÁLISIS: ' + ce.focusFree;
    if (ce.focusTemplates.length) {
      var tmps = FOCUS_TEMPLATES[ce.analysisMode] || [];
      ce.focusTemplates.forEach(function (tv) {
        var t = tmps.find(function (x) { return x.value === tv; });
        if (t) focusCtx += '\n' + t.template;
      });
    }
    if (ce.driveLink) focusCtx += '\nNORMATIVA ESPECÍFICA (Drive): ' + ce.driveLink;

    // Previously generated sections as context
    var prevSections = '';
    sections.forEach(function (s) {
      if (s.id !== sectionId && ce.analysisSections[s.id]) {
        prevSections += '\n\n--- ' + s.title + ' ---\n' + ce.analysisSections[s.id].substring(0, 15000);
      }
    });

    try {
      var system = SECTION_SYSTEM_PROMPTS[ce.analysisMode] || SECTION_SYSTEM_PROMPTS.disciplinario;
      var userPrompt = (prompts[sectionId] || 'Genera la sección "' + sectionId + '" del análisis.');
      if (ce.documentsContext) userPrompt += '\n\nDOCUMENTOS DEL EXPEDIENTE:\n' + ce.documentsContext.substring(0, 40000);
      userPrompt += _getDriveFolderContext();
      if (ce.caseType) userPrompt += '\n\nTIPO DE CASO: ' + ce.caseType;
      if (ce.institution) userPrompt += '\nINSTITUCIÓN: ' + ce.institution;
      if (ce.estamento) userPrompt += '\nESTAMENTO: ' + ce.estamento;
      if (focusCtx) userPrompt += '\n\n' + focusCtx;
      if (additionalCtx) userPrompt += '\n\n' + additionalCtx;
      if (prevSections) userPrompt += '\n\nSECCIONES PREVIAS GENERADAS:\n' + prevSections.substring(0, 30000);

      await _ceStreamClaude(system, userPrompt, {
        maxTokens: 8192,
        onChunk: function (text) {
          ce.analysisSections[sectionId] = (ce.analysisSections[sectionId] || '') + text;
          _renderSectionContent(sectionId);
        }
      });
    } catch (e) {
      console.error('Generate section error:', e);
      showToast('✗ Error generando ' + section.title);
    }

    ce.generatingSection = null;
    if (ce.generatingAll) {
      // Generate next section
      var allSections = _getSections();
      var idx = allSections.findIndex(function (s) { return s.id === sectionId; });
      if (idx < allSections.length - 1) {
        _generateSection(allSections[idx + 1].id);
      } else {
        ce.generatingAll = false;
        showToast('✓ Análisis completo generado');
        _renderTab();
      }
    } else {
      _renderTab();
    }
  }

  async function _generateAllSections() {
    var sections = _getSections();
    if (!sections.length) return;
    ce.generatingAll = true;
    _generateSection(sections[0].id);
  }

  function _renderSectionContent(sectionId) {
    var el = document.getElementById('ce-section-content-' + sectionId);
    if (el) {
      el.innerHTML = _markdownToHtml(ce.analysisSections[sectionId] || '');
      el.scrollTop = el.scrollHeight;
    }
  }

  function _markdownToHtml(md) {
    if (!md) return '<span style="color:var(--text-muted);font-style:italic;">Sin contenido generado</span>';
    var html = _escHtml(md);
    html = html.replace(/^### (.+)$/gm, '<h4 style="font-family:var(--font-serif);font-size:15px;margin:12px 0 6px;color:var(--text);">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 style="font-family:var(--font-serif);font-size:17px;margin:16px 0 8px;color:var(--text);">$1</h3>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  // ─── CHAT ────────────────────────────────────────────────────────

  async function _sendChatMessage() {
    var msg = ce.chatInput.trim();
    if (!msg && !ce.chatFiles.length) return;
    if (!ce.analysisId) { showToast('⚠ Guarda el análisis antes de usar el chat'); return; }

    // Append file content
    var fileCtx = '';
    if (ce.chatFiles.length) {
      for (var i = 0; i < ce.chatFiles.length; i++) {
        var txt = await _extractTextFromFile(ce.chatFiles[i]);
        if (txt) fileCtx += '\n\n[Documento adjunto: ' + ce.chatFiles[i].name + ']\n' + txt.substring(0, 30000);
      }
      ce.chatFiles = [];
    }

    var fullMsg = msg + fileCtx;
    ce.chatMessages.push({ role: 'user', content: fullMsg });
    var userMsgIdx = ce.chatMessages.length - 1;
    ce.chatInput = '';
    ce.chatLoading = true;
    _renderChat();

    // Save user message
    _saveChatMessage('user', fullMsg, userMsgIdx);

    try {
      var chatSystem = (SECTION_SYSTEM_PROMPTS[ce.analysisMode] || SECTION_SYSTEM_PROMPTS.disciplinario)
        + '\n\nContexto del caso:\n'
        + (ce.caseType ? 'Tipo: ' + ce.caseType + '\n' : '')
        + (ce.institution ? 'Institución: ' + ce.institution + '\n' : '')
        + (ce.documentsContext ? 'Documentos (resumen):\n' + ce.documentsContext.substring(0, 20000) + '\n' : '')
        + _getDriveFolderContext()
        + (ce.extractedFacts.length ? 'Hechos extraídos:\n' + ce.extractedFacts.map(function (f, i) {
            return (i + 1) + '. ' + (typeof f === 'string' ? f : (f.fact || ''));
          }).join('\n') + '\n' : '');

      // Build messages array for multi-turn chat
      var messages = ce.chatMessages.slice(-15).map(function (m) {
        return { role: m.role, content: m.content.substring(0, 5000) };
      });

      // Stream response via chat-stream edge function
      ce.chatMessages.push({ role: 'assistant', content: '' });
      var idx = ce.chatMessages.length - 1;
      var token = _token();
      var r = await fetch(CHAT_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({
          system: chatSystem,
          messages: messages,
          max_tokens: 4096
        })
      });
      if (!r.ok) throw new Error('Chat HTTP ' + r.status);

      var reader = r.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        buf += decoder.decode(result.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j].trim();
          if (!line.startsWith('data: ')) continue;
          var payload = line.substring(6);
          if (payload === '[DONE]') continue;
          try {
            var parsed = JSON.parse(payload);
            if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
              ce.chatMessages[idx].content += parsed.delta.text;
            }
          } catch (e) { /* skip */ }
          _renderChatMessages();
        }
      }

      // Save assistant response
      _saveChatMessage('assistant', ce.chatMessages[idx].content, idx);
    } catch (e) {
      console.error('Chat error:', e);
      ce.chatMessages.push({ role: 'assistant', content: '✗ Error al procesar la consulta. Intenta de nuevo.' });
    }
    ce.chatLoading = false;
    _renderChat();
  }

  async function _clearChat() {
    if (!confirm('¿Limpiar todo el historial de chat?')) return;
    if (ce.analysisId) {
      var db = _sb();
      if (db) await db.from('external_case_messages').delete().eq('analysis_id', ce.analysisId);
    }
    ce.chatMessages = [];
    _renderChat();
    showToast('✓ Chat limpiado');
  }

  // ─── WRITINGS PANEL ──────────────────────────────────────────────

  async function _generateWriting() {
    if (!ce.writingTemplate) { showToast('⚠ Selecciona un tipo de escrito'); return; }
    if (!ce.analysisId) { showToast('⚠ Guarda el análisis primero'); return; }

    var tpl = WRITING_TEMPLATES.find(function (t) { return t.id === ce.writingTemplate; });
    var prompt = 'Necesito que redactes un escrito judicial de tipo "' + (tpl ? tpl.label : ce.writingTemplate) + '".\n\n'
      + 'INSTRUCCIONES ESPECÍFICAS DEL USUARIO:\n' + (ce.writingInstructions || 'Genera el escrito completo basado en los antecedentes del caso.')
      + '\n\nIMPORTANTE: Utiliza como modelo los escritos judiciales de la biblioteca "Material de Consulta" que tengas disponibles. '
      + 'Replica fielmente la estructura, formato, fórmulas procesales y estilo de los modelos. '
      + 'Adapta únicamente los datos del caso actual.\n\n'
      + 'Genera el escrito completo, listo para revisión, con todas las secciones formales que correspondan (encabezado, suma, cuerpo, petitorio, etc.).';

    ce.writingLoading = true;
    ce.writingResult = '';
    _renderWritings();

    try {
      var writingSystem = (SECTION_SYSTEM_PROMPTS[ce.analysisMode] || SECTION_SYSTEM_PROMPTS.disciplinario)
        + '\nEres además un experto en redacción de escritos judiciales chilenos.'
        + (ce.documentsContext ? '\n\nDocumentos del caso (resumen):\n' + ce.documentsContext.substring(0, 20000) : '')
        + _getDriveFolderContext()
        + (ce.extractedFacts.length ? '\n\nHechos extraídos:\n' + ce.extractedFacts.map(function (f, i) {
            return (i + 1) + '. ' + (typeof f === 'string' ? f : (f.fact || ''));
          }).join('\n') : '');

      await _ceStreamClaude(writingSystem, prompt, {
        maxTokens: 8192,
        onChunk: function (text) {
          ce.writingResult += text;
          var el = document.getElementById('ce-writing-result');
          if (el) { el.innerHTML = _markdownToHtml(ce.writingResult); el.scrollTop = el.scrollHeight; }
        }
      });
      showToast('✓ Escrito generado');
    } catch (e) {
      console.error('Writing generation error:', e);
      showToast('✗ Error al generar escrito');
    }
    ce.writingLoading = false;
    _renderWritings();
  }

  // ─── EXPORT TO WORD ──────────────────────────────────────────────

  async function _exportAnalysisToWord() {
    var sections = _getSections();

    // Validate there's content to export
    var hasContent = sections.some(function (s) { return ce.analysisSections[s.id]; });
    if (!hasContent && !ce.extractedFacts.length) {
      showToast('⚠ No hay secciones generadas para exportar');
      return;
    }

    showToast('📄 Generando análisis en Word…');
    try {
      // Get docx library
      var d = await _waitDocx();
      // Section props SIN logo para casos externos
      var sectionProps = {
        properties: {
          page: {
            size: { width: WORD_FORMAT.pageWidth, height: WORD_FORMAT.pageHeight },
            margin: {
              top: WORD_FORMAT.marginTop, bottom: WORD_FORMAT.marginBottom,
              left: WORD_FORMAT.marginLeft, right: WORD_FORMAT.marginRight,
            },
          },
        },
        footers: { default: makeWordDocFooter(d) },
      };

      var children = [];

      // Title
      children.push(makeHeading('ANÁLISIS JURÍDICO', d, 1));

      // Case metadata line
      var metadataStr = (ce.caseName || 'Sin nombre');
      if (ce.analysisMode) metadataStr += ' — Modo: ' + ce.analysisMode;
      if (ce.caseType) metadataStr += ' | Tipo: ' + ce.caseType;
      if (ce.institution) metadataStr += ' | Institución: ' + ce.institution;
      children.push(makePara(metadataStr, d, { center: true, after: 60 }));

      var fechaStr = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
      children.push(makePara('Fecha: ' + fechaStr, d, { center: true, after: 240 }));

      // Extracted facts section (if available)
      if (ce.extractedFacts && ce.extractedFacts.length) {
        children.push(makeHeading('HECHOS EXTRAÍDOS', d, 2));
        ce.extractedFacts.forEach(function (fact, idx) {
          var factText = typeof fact === 'string' ? fact : (fact.fact || fact.description || fact);
          children.push(makePara((idx + 1) + '. ' + factText, d, { indent: true, before: 60, after: 60 }));
        });
        children.push(makePara('', d)); // spacing
      }

      // Analysis sections
      sections.forEach(function (s) {
        if (ce.analysisSections[s.id]) {
          children.push(makeHeading(s.title, d, 2));

          var content = ce.analysisSections[s.id];
          // Parse content into paragraphs, handling markdown
          var paragraphs = content.split('\n').filter(function (p) { return p.trim(); });

          paragraphs.forEach(function (para) {
            var trimmed = para.trim();

            // Skip markdown section headers (### ...) - they're already in section title
            if (/^#{1,3}\s+/.test(trimmed)) {
              var cleanText = trimmed.replace(/^#+\s*/, '');
              var level = trimmed.match(/^#+/)[0].length;
              if (level >= 3) {
                children.push(makeHeading(cleanText, d, 3));
              }
              return;
            }

            // Numbered items (1. 2. A. B. etc.)
            if (/^\d+[\.\)]\s|^[A-Z][\.\)]\s|^-\s/.test(trimmed)) {
              children.push(makePara(trimmed, d, { indent: true, before: 60, after: 60 }));
            }
            // Regular paragraph with bold and formatting
            else if (trimmed.length > 0) {
              children.push(makePara(trimmed, d, { indent: true, before: 0, after: 120 }));
            }
          });

          children.push(makePara('', d)); // spacing between sections
        }
      });

      // Library results section (if available)
      var hasLibraryResults = ce.libraryResults && (ce.libraryResults.jurisprudencia || ce.libraryResults.doctrina || ce.libraryResults.normativa || ce.libraryResults.custom_collections);
      if (hasLibraryResults) {
        children.push(makeHeading('FUENTES CONSULTADAS', d, 2));

        if (ce.libraryResults.normativa) {
          children.push(makeHeading('Normativa', d, 3));
          children.push(makePara(ce.libraryResults.normativa.substring(0, 2000), d, { indent: true }));
          children.push(makePara('', d));
        }

        if (ce.libraryResults.jurisprudencia) {
          children.push(makeHeading('Jurisprudencia', d, 3));
          children.push(makePara(ce.libraryResults.jurisprudencia.substring(0, 2000), d, { indent: true }));
          children.push(makePara('', d));
        }

        if (ce.libraryResults.doctrina) {
          children.push(makeHeading('Doctrina', d, 3));
          children.push(makePara(ce.libraryResults.doctrina.substring(0, 2000), d, { indent: true }));
          children.push(makePara('', d));
        }

        if (ce.libraryResults.custom_collections) {
          children.push(makeHeading('Colecciones Personalizadas', d, 3));
          children.push(makePara(ce.libraryResults.custom_collections.substring(0, 2000), d, { indent: true }));
          children.push(makePara('', d));
        }
      }

      // Create document
      var doc = new d.Document({
        styles: {
          default: {
            document: {
              run: { font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor },
            },
          },
        },
        sections: [{
          ...sectionProps,
          children: children,
        }],
      });

      // Generate and download
      var buffer = await d.Packer.toBlob(doc);
      var filename = 'analisis_' + (ce.caseName || 'caso').replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.docx';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(buffer);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      showToast('✅ ' + filename + ' descargado');

    } catch (err) {
      console.error('exportAnalysisToWord:', err);
      showToast('⚠ Error al generar Word: ' + err.message);
    }
  }

  function _copyAllSections() {
    var sections = _getSections();
    var text = '';
    sections.forEach(function (s) {
      if (ce.analysisSections[s.id]) {
        text += s.title + '\n\n' + ce.analysisSections[s.id] + '\n\n';
      }
    });
    if (!text) { showToast('⚠ No hay secciones generadas'); return; }
    navigator.clipboard.writeText(text).then(function () { showToast('✓ Copiado al portapapeles'); });
  }

  // ─── CASE FOLDER (DRIVE) ─────────────────────────────────────────

  async function _ceLinkFolder() {
    var url = (document.getElementById('ce-folder-url') || {}).value || '';
    if (!url.trim()) { showToast('⚠ Ingresa un enlace de Google Drive'); return; }
    var folderId = typeof extractFolderIdFromUrl === 'function' ? extractFolderIdFromUrl(url) : null;
    if (!folderId) { showToast('⚠ No se pudo extraer el ID de la carpeta. Verifica el enlace.'); return; }
    ce.caseFolderId = folderId;
    ce.caseFolderUrl = url.trim();
    showToast('✓ Carpeta vinculada');
    _renderTab();
    _ceRefreshFolder();
  }

  function _ceUnlinkFolder() {
    if (!confirm('¿Desvincular la carpeta del caso?')) return;
    ce.caseFolderId = null;
    ce.caseFolderUrl = null;
    ce.caseFolderFiles = [];
    _renderTab();
    showToast('✓ Carpeta desvinculada');
  }

  async function _ceCreateFolder() {
    var name = prompt('Nombre de la carpeta:', ce.caseName || 'Caso Externo');
    if (!name) return;
    try {
      showToast('Creando carpeta en Drive…');
      var r = await callDrive({ action: 'createFolder', caseId: ce.analysisId || 'ce-temp', folderName: name });
      ce.caseFolderId = r.folder.id;
      ce.caseFolderUrl = 'https://drive.google.com/drive/folders/' + r.folder.id;
      showToast('✓ Carpeta creada');
      _renderTab();
      _ceRefreshFolder();
    } catch (e) {
      showToast('✗ Error al crear carpeta: ' + e.message);
    }
  }

  async function _ceRefreshFolder() {
    if (!ce.caseFolderId) return;
    ce.caseFolderLoading = true;
    _renderCaseFolderFiles();
    try {
      var r = await callDrive({ action: 'list', folderId: ce.caseFolderId, recursive: true, maxDepth: 3 });
      ce.caseFolderFiles = r.files || [];
      showToast('✓ ' + ce.caseFolderFiles.length + ' archivo(s) encontrados');
    } catch (e) {
      console.warn('[CE] Drive folder error:', e.message);
      ce.caseFolderFiles = [];
    }
    ce.caseFolderLoading = false;
    _renderCaseFolderFiles();
  }

  function _renderCaseFolderFiles() {
    var el = document.getElementById('ce-folder-files');
    if (!el) return;
    if (ce.caseFolderLoading) {
      el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">⏳ Cargando archivos…</div>';
      return;
    }
    if (!ce.caseFolderFiles.length) {
      el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">📂 Carpeta vacía'
        + (ce.caseFolderUrl ? '<br><a href="' + _escHtml(ce.caseFolderUrl) + '" target="_blank" style="color:var(--gold);font-size:11px;">Abrir en Drive ↗</a>' : '')
        + '</div>';
      return;
    }
    // Group files by path
    var byPath = {};
    ce.caseFolderFiles.forEach(function (f) {
      var parts = (f._path || f.name).split('/');
      var folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Raíz';
      if (!byPath[folder]) byPath[folder] = [];
      byPath[folder].push(f);
    });
    var folderNames = Object.keys(byPath).sort(function (a, b) {
      if (a === 'Raíz') return -1;
      if (b === 'Raíz') return 1;
      return a.localeCompare(b);
    });
    function _fileIcon(f) {
      var m = f.mimeType || '';
      if (m.includes('pdf')) return '📕';
      if (m.includes('spreadsheet')) return '📊';
      if (m.includes('document')) return '📝';
      if (m.includes('presentation')) return '📙';
      if (m.includes('image')) return '🖼';
      return '📄';
    }
    var html = '<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:6px;font-weight:500;">' + ce.caseFolderFiles.length + ' archivo(s) en ' + folderNames.length + ' carpeta(s)</div>';
    folderNames.forEach(function (folder) {
      var flist = byPath[folder];
      html += '<div style="margin-bottom:8px;">';
      html += '<div style="font-size:10px;font-weight:600;color:var(--gold);padding:3px 0;border-bottom:1px solid var(--border);margin-bottom:3px;">📁 ' + _escHtml(folder) + '</div>';
      flist.forEach(function (f) {
        var link = f.webViewLink || '#';
        var sizeStr = f.size ? (parseInt(f.size) / 1024).toFixed(0) + ' KB' : 'Doc';
        html += '<a href="' + _escHtml(link) + '" target="_blank" style="display:flex;align-items:center;gap:6px;padding:4px 8px;text-decoration:none;color:var(--text);border-radius:4px;transition:background 0.1s;" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'\'">';
        html += '<span style="font-size:13px;">' + _fileIcon(f) + '</span>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(f.name) + '</div>';
        html += '<div style="font-size:9px;color:var(--text-muted);">' + sizeStr + '</div>';
        html += '</div>';
        html += '<span style="font-size:9px;color:var(--text-muted);">↗</span>';
        html += '</a>';
      });
      html += '</div>';
    });
    el.innerHTML = html;
  }

  // ─── DOCUMENT UPLOAD HANDLER ─────────────────────────────────────

  async function _handleDocUpload(e) {
    var files = e.target.files;
    if (!files || !files.length) return;

    var maxFiles = 10;
    var newFiles = Array.from(files).slice(0, maxFiles - ce.documents.length);
    if (!newFiles.length) { showToast('⚠ Máximo ' + maxFiles + ' documentos'); return; }

    showToast('Extrayendo texto de ' + newFiles.length + ' archivo(s)…');

    for (var i = 0; i < newFiles.length; i++) {
      var f = newFiles[i];
      var text = await _extractTextFromFile(f);
      ce.documents.push({ name: f.name, size: f.size, text: text });
    }

    ce.documentsContext = ce.documents.map(function (d) {
      return '=== DOCUMENTO: ' + d.name + ' ===\n' + (d.text || '[Sin texto extraído]');
    }).join('\n\n');

    showToast('✓ ' + newFiles.length + ' documento(s) cargado(s)');
    _renderTab();
    e.target.value = '';
  }

  function _removeDoc(idx) {
    ce.documents.splice(idx, 1);
    ce.documentsContext = ce.documents.map(function (d) {
      return '=== DOCUMENTO: ' + d.name + ' ===\n' + (d.text || '');
    }).join('\n\n');
    _renderTab();
  }

  // ─── CHAT FILE UPLOAD ────────────────────────────────────────────

  function _handleChatFileUpload(e) {
    var files = e.target.files;
    if (!files) return;
    ce.chatFiles = Array.from(files).slice(0, 3);
    _renderChat();
    e.target.value = '';
  }

  // ─── RENDER ENGINE ───────────────────────────────────────────────

  function _renderAll() {
    _renderHeader();
    _renderTabs();
    _renderTab();
    _renderSidebar();
  }

  function _renderHeader() {
    var el = document.getElementById('ce-header');
    if (!el) return;
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">'
      + '<div>'
      + '<div style="font-family:var(--font-serif);font-size:22px;font-weight:400;color:var(--text);">Análisis de Casos Externos</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Analiza casos externos con IA: extracción, biblioteca jurídica, análisis IRAC y chat especializado</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<button onclick="window._ceSave()" style="padding:6px 14px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;"'
      + (ce.saving ? ' disabled' : '') + '>' + (ce.saving ? 'Guardando…' : '💾 Guardar') + '</button>'
      + '<button onclick="window._ceExportWord()" style="padding:6px 14px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:5px;font-size:12px;cursor:pointer;font-family:inherit;">📄 Word</button>'
      + '<button onclick="window._ceCopyAll()" style="padding:6px 14px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:5px;font-size:12px;cursor:pointer;font-family:inherit;">📋 Copiar</button>'
      + '</div></div>';
  }

  function _renderTabs() {
    var el = document.getElementById('ce-tabs');
    if (!el) return;
    var tabs = [
      { id: 'documentos', label: '📁 Documentos', num: ce.documents.length },
      { id: 'extraccion', label: '🔍 Extracción', num: ce.extractedFacts.length },
      { id: 'biblioteca', label: '📚 Biblioteca' },
      { id: 'analisis', label: '⚖️ Análisis' },
      { id: 'chat', label: '💬 Chat', disabled: !ce.analysisId }
    ];
    el.innerHTML = '<div style="display:flex;gap:2px;overflow-x:auto;">' + tabs.map(function (t) {
      var active = ce.activeTab === t.id;
      var dis = t.disabled;
      return '<button onclick="window._ceTab(\'' + t.id + '\')" style="padding:8px 16px;border:none;border-bottom:2px solid ' + (active ? 'var(--gold)' : 'transparent') + ';background:' + (active ? 'var(--gold-glow)' : 'transparent') + ';color:' + (dis ? 'var(--text-muted)' : (active ? 'var(--gold)' : 'var(--text-dim)')) + ';font-size:12px;font-weight:' + (active ? '600' : '500') + ';cursor:' + (dis ? 'not-allowed' : 'pointer') + ';font-family:inherit;white-space:nowrap;transition:all 0.2s;"'
        + (dis ? ' disabled title="Guarda el análisis para habilitar el chat"' : '') + '>'
        + t.label + (t.num ? ' <span style="background:var(--gold);color:#fff;padding:1px 6px;border-radius:10px;font-size:10px;margin-left:4px;">' + t.num + '</span>' : '')
        + '</button>';
    }).join('') + '</div>';
  }

  function _renderSidebar() {
    var el = document.getElementById('ce-sidebar');
    if (!el) return;
    var html = '<div style="padding:12px;">'
      + '<button onclick="window._ceNewCase()" style="width:100%;padding:8px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:12px;">+ Nuevo Caso</button>'
      + '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Casos Guardados</div>';

    if (ce.loadingCases) {
      html += '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">Cargando…</div>';
    } else if (!ce.savedCases.length) {
      html += '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:11px;">Sin casos guardados</div>';
    } else {
      ce.savedCases.forEach(function (c) {
        var isActive = ce.analysisId === c.id;
        html += '<div onclick="window._ceLoadCase(\'' + c.id + '\')" style="padding:8px 10px;margin-bottom:4px;border-radius:5px;cursor:pointer;border:1px solid ' + (isActive ? 'var(--gold)' : 'var(--border)') + ';background:' + (isActive ? 'var(--gold-glow)' : 'var(--surface)') + ';transition:all 0.2s;" onmouseover="this.style.borderColor=\'var(--gold)\'" onmouseout="this.style.borderColor=\'' + (isActive ? 'var(--gold)' : 'var(--border)') + '\'">'
          + '<div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(c.case_name || 'Sin nombre') + '</div>'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">'
          + '<span style="font-size:10px;color:var(--text-muted);">' + (c.analysis_mode === 'laboral' ? '👷 Laboral' : '⚖️ Disciplinario') + '</span>'
          + '<button onclick="event.stopPropagation();window._ceDeleteCase(\'' + c.id + '\')" style="border:none;background:none;color:var(--red);font-size:11px;cursor:pointer;padding:2px 4px;" title="Eliminar">✕</button>'
          + '</div>'
          + '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + _formatDate(c.updated_at) + '</div>'
          + '</div>';
      });
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // ─── TAB CONTENT RENDERERS ───────────────────────────────────────

  function _renderTab() {
    var el = document.getElementById('ce-tab-content');
    if (!el) return;

    switch (ce.activeTab) {
      case 'documentos': _renderTabDocumentos(el); break;
      case 'extraccion': _renderTabExtraccion(el); break;
      case 'biblioteca': _renderTabBiblioteca(el); break;
      case 'analisis': _renderTabAnalisis(el); break;
      case 'chat': _renderTabChat(el); break;
      default: _renderTabDocumentos(el);
    }
  }

  // ── TAB: DOCUMENTOS ──
  function _renderTabDocumentos(el) {
    var modeOpts = ANALYSIS_MODES.map(function (m) {
      return '<label style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid ' + (ce.analysisMode === m.value ? 'var(--gold)' : 'var(--border)') + ';border-radius:6px;cursor:pointer;background:' + (ce.analysisMode === m.value ? 'var(--gold-glow)' : 'var(--surface)') + ';transition:all 0.2s;">'
        + '<input type="radio" name="ceMode" value="' + m.value + '" ' + (ce.analysisMode === m.value ? 'checked' : '') + ' onchange="window._ceSetMode(this.value)" style="margin-top:2px;">'
        + '<div><div style="font-size:13px;font-weight:500;color:var(--text);">' + m.label + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);">' + m.description + '</div></div></label>';
    }).join('');

    var caseTypeOpts = '<option value="">— Seleccionar —</option>' + (CASE_TYPES[ce.analysisMode] || []).map(function (t) {
      return '<option value="' + t.value + '"' + (ce.caseType === t.value ? ' selected' : '') + '>' + t.label + '</option>';
    }).join('');

    var instOpts = '<option value="">— Seleccionar —</option>' + INSTITUTIONS.map(function (i) {
      return '<option value="' + i.value + '"' + (ce.institution === i.value ? ' selected' : '') + '>' + i.label + '</option>';
    }).join('');

    // Focus templates
    var focusTmpls = (FOCUS_TEMPLATES[ce.analysisMode] || []).map(function (t) {
      var checked = ce.focusTemplates.indexOf(t.value) >= 0;
      return '<label style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border:1px solid ' + (checked ? 'var(--gold)' : 'var(--border)') + ';border-radius:5px;cursor:pointer;background:' + (checked ? 'var(--gold-glow)' : 'var(--surface)') + ';font-size:12px;transition:all 0.2s;">'
        + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="window._ceToggleFocus(\'' + t.value + '\')" style="margin-top:1px;">'
        + '<div><div style="font-weight:500;color:var(--text);">' + t.label + '</div>'
        + '<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">' + _truncate(t.template, 100) + '</div></div></label>';
    }).join('');

    // Collections
    var baseColls = [
      { value: 'jurisprudencia', label: 'Jurisprudencia' },
      { value: 'doctrina', label: 'Doctrina' },
      { value: 'normativa', label: 'Normativa' }
    ];
    var collHtml = baseColls.map(function (c) {
      var checked = ce.selectedBaseCollections.indexOf(c.value) >= 0;
      return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="window._ceToggleBaseColl(\'' + c.value + '\')">' + c.label + '</label>';
    }).join('');

    if (ce.customCollections.length) {
      collHtml += '<div style="margin-top:8px;font-size:11px;font-weight:600;color:var(--text-muted);">Personalizadas:</div>';
      ce.customCollections.forEach(function (c) {
        var checked = ce.priorityCollections.indexOf(c.value) >= 0;
        collHtml += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);"><input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="window._ceTogglePrioColl(\'' + c.value + '\')">' + _escHtml(c.label) + '</label>';
      });
    }

    // Documents list
    var docsHtml = '';
    if (ce.documents.length) {
      docsHtml = ce.documents.map(function (d, i) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:12px;">'
          + '<div style="display:flex;align-items:center;gap:8px;min-width:0;">'
          + '<span>📄</span>'
          + '<div style="min-width:0;"><div style="color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(d.name) + '</div>'
          + '<div style="color:var(--text-muted);font-size:10px;">' + (d.text ? d.text.length.toLocaleString() + ' caracteres' : 'Sin texto') + '</div></div>'
          + '</div>'
          + '<button onclick="window._ceRemoveDoc(' + i + ')" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;" title="Eliminar">✕</button>'
          + '</div>';
      }).join('');
    }

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:20px;max-width:800px;">'
      // Mode selection
      + '<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Modo de Análisis</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + modeOpts + '</div></div>'
      // Case identification
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Nombre del Caso</label>'
      + '<input type="text" value="' + _escHtml(ce.caseName) + '" onchange="ce_state.caseName=this.value" oninput="ce_state.caseName=this.value" placeholder="Ej: Caso Sumario 2024-001" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;"></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Tipo de Caso</label>'
      + '<select onchange="ce_state.caseType=this.value" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;">' + caseTypeOpts + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Institución</label>'
      + '<select onchange="ce_state.institution=this.value" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;">' + instOpts + '</select></div>'
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Estamento</label>'
      + '<input type="text" value="' + _escHtml(ce.estamento) + '" onchange="ce_state.estamento=this.value" oninput="ce_state.estamento=this.value" placeholder="Ej: Funcionario grado 12°" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;"></div>'
      + '</div>'
      // Focus
      + '<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Enfoque de Análisis</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' + focusTmpls + '</div>'
      + '<textarea onchange="ce_state.focusFree=this.value" oninput="ce_state.focusFree=this.value" placeholder="O describe libremente el enfoque del análisis…" style="width:100%;min-height:60px;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text);background:var(--surface);font-family:inherit;resize:vertical;box-sizing:border-box;">' + _escHtml(ce.focusFree) + '</textarea></div>'
      // Drive link
      + '<div><label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px;">Enlace Google Drive (normativa, opcional)</label>'
      + '<input type="text" value="' + _escHtml(ce.driveLink) + '" onchange="ce_state.driveLink=this.value" placeholder="https://drive.google.com/..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;"></div>'
      // Case Folder (Drive)
      + '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--surface);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
      + '<div style="font-size:13px;font-weight:600;color:var(--text);">📁 Carpeta del Caso (Drive)</div>'
      + (ce.caseFolderId ? '<div style="display:flex;gap:6px;">'
        + '<button onclick="window._ceRefreshFolder()" style="padding:4px 10px;border:1px solid var(--border);background:var(--surface);border-radius:4px;font-size:11px;cursor:pointer;color:var(--text);font-family:inherit;" title="Actualizar">🔄</button>'
        + '<button onclick="window._ceUnlinkFolder()" style="padding:4px 10px;border:1px solid var(--red);background:none;border-radius:4px;font-size:11px;cursor:pointer;color:var(--red);font-family:inherit;" title="Desvincular">✕ Desvincular</button>'
        + '</div>' : '')
      + '</div>'
      + (ce.caseFolderId
        ? '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:var(--gold-glow);border:1px solid var(--gold);border-radius:5px;">'
          + '<span style="font-size:14px;">✓</span>'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:12px;font-weight:500;color:var(--gold);">Carpeta vinculada</div>'
          + '<a href="' + _escHtml(ce.caseFolderUrl || '') + '" target="_blank" style="font-size:10px;color:var(--text-muted);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">Abrir en Drive ↗</a>'
          + '</div></div>'
          + '<div id="ce-folder-files" style="max-height:250px;overflow-y:auto;"></div>'
        : '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Vincula una carpeta de Google Drive para subir y gestionar los antecedentes del caso.</div>'
          + '<div style="display:flex;gap:8px;margin-bottom:8px;">'
          + '<input type="text" id="ce-folder-url" placeholder="https://drive.google.com/drive/folders/..." style="flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text);background:var(--surface);font-family:inherit;box-sizing:border-box;">'
          + '<button onclick="window._ceLinkFolder()" style="padding:7px 14px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;">Vincular</button>'
          + '</div>'
          + '<div style="text-align:center;margin-top:4px;"><button onclick="window._ceCreateFolder()" style="padding:6px 14px;background:none;color:var(--gold);border:1px solid var(--gold);border-radius:5px;font-size:11px;cursor:pointer;font-family:inherit;">+ Crear carpeta nueva</button></div>'
      )
      + '</div>'
      // Documents upload
      + '<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Documentos del Expediente</div>'
      + '<div style="border:2px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor=\'var(--gold)\'" onmouseout="this.style.borderColor=\'var(--border)\'" onclick="document.getElementById(\'ce-doc-input\').click()">'
      + '<div style="font-size:24px;margin-bottom:6px;">📁</div>'
      + '<div style="font-size:12px;color:var(--text-muted);">Arrastra archivos o haz clic para seleccionar</div>'
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">PDF, Word (.docx), TXT — Máximo 10 archivos</div>'
      + '</div>'
      + '<input type="file" id="ce-doc-input" multiple accept=".pdf,.docx,.doc,.txt" onchange="window._ceDocUpload(event)" style="display:none;">'
      + (docsHtml ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">' + docsHtml + '</div>' : '')
      + '</div>'
      // Collections
      + '<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Colecciones para Búsqueda</div>'
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;">' + collHtml + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);"><input type="radio" name="ceCollMode" value="priority" ' + (ce.collectionMode === 'priority' ? 'checked' : '') + ' onchange="ce_state.collectionMode=\'priority\'"> Priorizar seleccionadas</label>'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted);"><input type="radio" name="ceCollMode" value="exclusive" ' + (ce.collectionMode === 'exclusive' ? 'checked' : '') + ' onchange="ce_state.collectionMode=\'exclusive\'"> Solo seleccionadas</label>'
      + '</div></div>'
      // Search sources
      + '<div><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Fuentes de Búsqueda</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">'
      + [
          { key: 'qdrant', label: 'Qdrant (Base interna)', icon: '🗄️' },
          { key: 'pjud', label: 'PJUD (Poder Judicial)', icon: '⚖️' },
          { key: 'cgr', label: 'CGR (Contraloría)', icon: '🏛️' },
          { key: 'biblioteca', label: 'Biblioteca Jurídica', icon: '📚' }
        ].map(function (s) {
          var checked = ce.searchSources[s.key] !== false;
          return '<label style="display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid ' + (checked ? 'var(--gold)' : 'var(--border)') + ';border-radius:5px;cursor:pointer;background:' + (checked ? 'var(--gold-glow)' : 'var(--surface)') + ';transition:all 0.2s;font-size:12px;">'
            + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="window._ceToggleSource(\'' + s.key + '\')">'
            + '<span>' + s.icon + ' ' + s.label + '</span></label>';
        }).join('')
      + '</div>'
      + '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">Selecciona las fuentes a consultar al buscar en biblioteca</div>'
      + '</div>'
      // Action buttons
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + '<button onclick="window._ceExtractFacts()" style="padding:10px 20px;background:var(--gold);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;" ' + (ce.extracting ? 'disabled' : '') + '>' + (ce.extracting ? '⏳ Extrayendo…' : '🔍 Extraer Hechos') + '</button>'
      + '<button onclick="window._ceSearchLibrary()" style="padding:10px 20px;background:var(--surface);color:var(--gold);border:2px solid var(--gold);border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;" ' + (ce.searching ? 'disabled' : '') + '>' + (ce.searching ? '⏳ Buscando…' : '📚 Buscar en Biblioteca') + '</button>'
      + '</div>'
      + '</div>';
  }

  // ── TAB: EXTRACCIÓN ──
  function _renderTabExtraccion(el) {
    if (!ce.extractedFacts.length && !ce.chronology.length && !ce.participants.length) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);"><div style="font-size:28px;margin-bottom:8px;">🔍</div>'
        + '<div style="font-size:14px;margin-bottom:4px;">Sin datos extraídos</div>'
        + '<div style="font-size:12px;">Carga documentos y haz clic en "Extraer Hechos" en la pestaña Documentos</div></div>';
      return;
    }

    var factsHtml = ce.extractedFacts.map(function (f, i) {
      var fact = typeof f === 'string' ? f : (f.fact || f.description || '');
      var relevance = typeof f === 'object' ? (f.relevance || f.relevancia || 'media') : 'media';
      var color = relevance === 'alta' ? 'var(--red)' : (relevance === 'media' ? 'var(--gold)' : 'var(--text-muted)');
      var bgColor = relevance === 'alta' ? 'rgba(239,68,68,0.1)' : (relevance === 'media' ? 'rgba(79,70,229,0.1)' : 'rgba(156,163,175,0.1)');
      return '<div style="display:flex;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:5px;border-left:3px solid ' + color + ';">'
        + '<span style="font-size:11px;font-weight:600;color:var(--text-muted);min-width:20px;">' + (i + 1) + '</span>'
        + '<div style="flex:1;font-size:12px;color:var(--text);line-height:1.5;">' + _escHtml(fact) + '</div>'
        + '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:' + bgColor + ';color:' + color + ';white-space:nowrap;height:fit-content;">' + relevance + '</span>'
        + '</div>';
    }).join('');

    var chronHtml = ce.chronology.length ? ce.chronology.map(function (c) {
      return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">'
        + '<span style="font-size:11px;font-weight:600;color:var(--gold);min-width:90px;">' + _escHtml(c.date || c.fecha || '') + '</span>'
        + '<span style="font-size:12px;color:var(--text);">' + _escHtml(c.event || c.evento || c.description || '') + '</span>'
        + '</div>';
    }).join('') : '<div style="font-size:12px;color:var(--text-muted);">Sin cronología extraída</div>';

    var partHtml = ce.participants.length ? ce.participants.map(function (p) {
      return '<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">'
        + '<span style="font-weight:500;color:var(--text);min-width:120px;">' + _escHtml(p.name || p.nombre || p.rol || '') + '</span>'
        + '<span style="color:var(--text-muted);">' + _escHtml(p.role || p.rol || '') + '</span>'
        + (p.estamento ? '<span style="color:var(--text-muted);">— ' + _escHtml(p.estamento) + '</span>' : '')
        + '</div>';
    }).join('') : '<div style="font-size:12px;color:var(--text-muted);">Sin participantes identificados</div>';

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:20px;max-width:800px;">'
      + '<div><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px;">Hechos Extraídos (' + ce.extractedFacts.length + ')</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;">' + factsHtml + '</div></div>'
      + '<div><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px;">Cronología</div>' + chronHtml + '</div>'
      + '<div><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px;">Participantes</div>' + partHtml + '</div>'
      + (ce.mentionedNorms && ce.mentionedNorms.length ? '<div><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px;">Normas Mencionadas</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + ce.mentionedNorms.map(function (n) {
          return '<span style="padding:4px 10px;background:var(--gold-glow);border:1px solid var(--gold);border-radius:4px;font-size:11px;color:var(--gold);">' + _escHtml(typeof n === 'string' ? n : (n.norm || n.norma || '')) + '</span>';
        }).join('') + '</div></div>' : '')
      + '</div>';
  }

  // ── TAB: BIBLIOTECA ──
  function _renderTabBiblioteca(el) {
    var hasResults = ce.libraryResults.jurisprudencia || ce.libraryResults.doctrina || ce.libraryResults.normativa || ce.libraryResults.custom_collections;

    if (!hasResults) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);"><div style="font-size:28px;margin-bottom:8px;">📚</div>'
        + '<div style="font-size:14px;margin-bottom:4px;">Sin resultados de biblioteca</div>'
        + '<div style="font-size:12px;">Define un enfoque y haz clic en "Buscar en Biblioteca" en la pestaña Documentos</div></div>';
      return;
    }

    var sections = [
      { key: 'jurisprudencia', label: 'Jurisprudencia', icon: '⚖️' },
      { key: 'doctrina', label: 'Doctrina', icon: '📖' },
      { key: 'normativa', label: 'Normativa', icon: '📜' },
      { key: 'custom_collections', label: 'Colecciones Personalizadas', icon: '📂' }
    ];

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;max-width:800px;">'
      + sections.filter(function (s) { return ce.libraryResults[s.key]; }).map(function (s) {
        return '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;">'
          + '<div style="padding:10px 14px;background:var(--surface2);border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text);">'
          + s.icon + ' ' + s.label + '</div>'
          + '<div style="padding:12px 14px;font-size:12px;color:var(--text-dim);line-height:1.6;max-height:400px;overflow-y:auto;white-space:pre-wrap;">'
          + _escHtml(ce.libraryResults[s.key]).substring(0, 15000) + '</div></div>';
      }).join('')
      + '</div>';
  }

  // ── TAB: ANÁLISIS ──
  function _renderTabAnalisis(el) {
    var sections = _getSections();

    var sectionsHtml = sections.map(function (s) {
      var content = ce.analysisSections[s.id] || '';
      var isGenerating = ce.generatingSection === s.id;
      return '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:12px;">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border-bottom:1px solid var(--border);cursor:pointer;" onclick="window._ceToggleSection(\'' + s.id + '\')">'
        + '<div><div style="font-size:14px;font-weight:600;color:var(--text);">' + s.title + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);">' + s.description + '</div></div>'
        + '<div style="display:flex;align-items:center;gap:8px;">'
        + (content ? '<span style="font-size:10px;padding:3px 8px;background:rgba(5,150,105,0.1);color:var(--green);border-radius:10px;">✓ Completada</span>' : '')
        + '<button onclick="event.stopPropagation();window._ceGenerateSection(\'' + s.id + '\')" style="padding:5px 12px;background:var(--gold);color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;" ' + (isGenerating ? 'disabled' : '') + '>'
        + (isGenerating ? '⏳ Generando…' : '▶ Generar') + '</button>'
        + '</div></div>'
        + '<div id="ce-section-content-' + s.id + '" style="padding:14px;font-size:13px;color:var(--text);line-height:1.7;max-height:500px;overflow-y:auto;' + (!content && !isGenerating ? 'display:none;' : '') + '">'
        + (content ? _markdownToHtml(content) : (isGenerating ? '<span style="color:var(--text-muted);font-style:italic;">Generando contenido…</span>' : ''))
        + '</div></div>';
    }).join('');

    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;max-width:900px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
      + '<div style="font-size:14px;font-weight:600;color:var(--text);">Secciones del Análisis (' + (ce.analysisMode === 'laboral' ? 'Laboral' : 'IRAC Disciplinario') + ')</div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button onclick="window._ceGenerateAll()" style="padding:7px 16px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;" ' + (ce.generatingAll ? 'disabled' : '') + '>' + (ce.generatingAll ? '⏳ Generando todas…' : '▶▶ Generar Todas') + '</button>'
      + '</div></div>'
      + sectionsHtml + '</div>';
  }

  // ── TAB: CHAT ──
  function _renderTabChat(el) {
    el.innerHTML = '<div style="display:flex;height:100%;gap:0;overflow:hidden;">'
      // Chat panel
      + '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;' + (ce.showWritingsPanel ? 'border-right:1px solid var(--border);' : '') + '">'
      + '<div id="ce-chat-messages" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;"></div>'
      // Chat toolbar
      + '<div style="padding:8px 12px;border-top:1px solid var(--border);display:flex;gap:6px;align-items:center;flex-shrink:0;">'
      + '<button onclick="window._ceToggleWritings()" style="padding:5px 10px;border:1px solid ' + (ce.showWritingsPanel ? 'var(--gold)' : 'var(--border)') + ';background:' + (ce.showWritingsPanel ? 'var(--gold-glow)' : 'var(--surface)') + ';border-radius:4px;font-size:11px;cursor:pointer;color:var(--text);font-family:inherit;" title="Escritos Judiciales">📝 Escritos</button>'
      + '<button onclick="window._ceClearChat()" style="padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:4px;font-size:11px;cursor:pointer;color:var(--text-muted);font-family:inherit;" title="Limpiar chat">🗑️</button>'
      + '<div style="flex:1;"></div>'
      + '<span style="font-size:10px;color:var(--text-muted);">' + ce.chatMessages.length + ' mensajes</span>'
      + '</div>'
      // Chat input
      + '<div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-end;flex-shrink:0;">'
      + '<label style="cursor:pointer;padding:6px;" title="Adjuntar archivo"><input type="file" accept=".pdf,.docx,.doc,.txt" multiple onchange="window._ceChatFileUpload(event)" style="display:none;">📎</label>'
      + '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">'
      + (ce.chatFiles.length ? '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + ce.chatFiles.map(function (f) { return '<span style="font-size:10px;padding:2px 6px;background:var(--gold-glow);border-radius:3px;color:var(--gold);">📄 ' + _escHtml(f.name) + '</span>'; }).join('') + '</div>' : '')
      + '<textarea id="ce-chat-input" rows="2" placeholder="Escribe tu consulta sobre el caso…" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;color:var(--text);background:var(--surface);font-family:inherit;resize:none;box-sizing:border-box;" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();window._ceSendChat()}">' + _escHtml(ce.chatInput) + '</textarea>'
      + '</div>'
      + '<button onclick="window._ceSendChat()" style="padding:8px 16px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;" ' + (ce.chatLoading ? 'disabled' : '') + '>' + (ce.chatLoading ? '⏳' : '➤ Enviar') + '</button>'
      + '</div></div>'
      // Writings panel (conditional)
      + (ce.showWritingsPanel ? '<div id="ce-writings-panel" style="width:380px;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0;"></div>' : '')
      + '</div>';

    _renderChatMessages();
    if (ce.showWritingsPanel) _renderWritings();
  }

  function _renderChatMessages() {
    var el = document.getElementById('ce-chat-messages');
    if (!el) return;

    if (!ce.chatMessages.length) {
      el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);margin:auto;">'
        + '<div style="font-size:28px;margin-bottom:8px;">💬</div>'
        + '<div style="font-size:14px;font-weight:500;">Chat del Caso</div>'
        + '<div style="font-size:12px;margin-top:4px;">Consulta sobre los antecedentes, pide análisis adicionales o genera borradores de escritos.</div>'
        + '</div>';
      return;
    }

    el.innerHTML = ce.chatMessages.map(function (m, idx) {
      var isUser = m.role === 'user';
      return '<div style="display:flex;justify-content:' + (isUser ? 'flex-end' : 'flex-start') + ';">'
        + '<div style="max-width:80%;padding:10px 14px;border-radius:' + (isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px') + ';background:' + (isUser ? 'var(--gold)' : 'var(--surface2)') + ';color:' + (isUser ? '#fff' : 'var(--text)') + ';font-size:13px;line-height:1.6;border:' + (isUser ? 'none' : '1px solid var(--border)') + ';">'
        + (isUser ? _escHtml(m.content) : _markdownToHtml(m.content))
        + '<div style="margin-top:6px;display:flex;gap:6px;">'
        + (!isUser && m.content ? '<button onclick="window._ceCopyMsg(' + idx + ')" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:10px;">📋 Copiar</button><button onclick="window._ceExportChatMsgWord(' + idx + ')" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:10px;">📄 Word</button>' : '')
        + '<button onclick="window._ceDeleteMsg(' + idx + ')" style="border:none;background:none;color:var(--text-muted);cursor:pointer;font-size:10px;" title="Eliminar mensaje">🗑️ Eliminar</button>'
        + '</div>'
        + '</div></div>';
    }).join('');

    el.scrollTop = el.scrollHeight;
  }

  function _renderChat() {
    var el = document.getElementById('ce-tab-content');
    if (el && ce.activeTab === 'chat') _renderTabChat(el);
  }

  // ── WRITINGS PANEL ──
  function _renderWritings() {
    var el = document.getElementById('ce-writings-panel');
    if (!el) return;

    var tplBtns = WRITING_TEMPLATES.map(function (t) {
      var active = ce.writingTemplate === t.id;
      return '<button onclick="ce_state.writingTemplate=\'' + t.id + '\';window._ceRenderWritings()" style="padding:6px 10px;border:1px solid ' + (active ? 'var(--gold)' : 'var(--border)') + ';background:' + (active ? 'var(--gold-glow)' : 'var(--surface)') + ';border-radius:4px;font-size:11px;cursor:pointer;color:' + (active ? 'var(--gold)' : 'var(--text)') + ';font-family:inherit;text-align:left;">'
        + '<div style="font-weight:500;">' + t.label + '</div>'
        + '<div style="font-size:10px;color:var(--text-muted);">' + t.description + '</div></button>';
    }).join('');

    el.innerHTML = '<div style="padding:12px;border-bottom:1px solid var(--border);flex-shrink:0;">'
      + '<div style="font-size:14px;font-weight:600;color:var(--text);">📝 Escritos Judiciales</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Genera borradores basados en modelos de Material de Consulta</div>'
      + '</div>'
      + '<div style="padding:12px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;">'
      + '<div style="display:flex;flex-direction:column;gap:4px;">' + tplBtns + '</div>'
      + '<textarea onchange="ce_state.writingInstructions=this.value" oninput="ce_state.writingInstructions=this.value" placeholder="Instrucciones específicas para el escrito…" style="width:100%;min-height:60px;padding:8px;border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text);background:var(--surface);font-family:inherit;resize:vertical;box-sizing:border-box;">' + _escHtml(ce.writingInstructions) + '</textarea>'
      + '<button onclick="window._ceGenerateWriting()" style="padding:8px;background:var(--gold);color:#fff;border:none;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;" ' + (ce.writingLoading ? 'disabled' : '') + '>' + (ce.writingLoading ? '⏳ Generando escrito…' : '▶ Generar Escrito') + '</button>'
      + (ce.writingResult ? '<div id="ce-writing-result" style="padding:10px;border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--text);line-height:1.6;max-height:400px;overflow-y:auto;">' + _markdownToHtml(ce.writingResult) + '</div>'
        + '<div style="display:flex;gap:6px;"><button onclick="navigator.clipboard.writeText(ce_state.writingResult);showToast(\'✓ Copiado\')" style="padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:4px;font-size:11px;cursor:pointer;color:var(--text);font-family:inherit;">📋 Copiar</button>'
        + '<button onclick="window._ceExportWritingWord()" style="padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:4px;font-size:11px;cursor:pointer;color:var(--text);font-family:inherit;">📄 Word</button></div>' : '')
      + '</div>';
  }

  // ─── VIEW CREATION ───────────────────────────────────────────────

  function _createView() {
    var main = document.querySelector('.main');
    if (!main || document.getElementById('viewCasosExternos')) return;

    var div = document.createElement('div');
    div.id = 'viewCasosExternos';
    div.className = 'view';
    div.style.cssText = 'flex-direction:column;overflow:hidden;';

    div.innerHTML =
      '<div id="ce-header" style="padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;"></div>'
      + '<div id="ce-tabs" style="padding:0 20px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;"></div>'
      + '<div style="flex:1;display:flex;overflow:hidden;min-height:0;">'
      // Main content
      + '<div id="ce-tab-content" style="flex:1;overflow-y:auto;padding:16px 20px;"></div>'
      // Sidebar
      + '<div id="ce-sidebar" style="width:220px;border-left:1px solid var(--border);overflow-y:auto;background:var(--surface2);flex-shrink:0;"></div>'
      + '</div>';

    main.appendChild(div);
  }

  // ─── TOGGLE HELPERS ──────────────────────────────────────────────

  function _toggleFocus(val) {
    var idx = ce.focusTemplates.indexOf(val);
    if (idx >= 0) ce.focusTemplates.splice(idx, 1);
    else ce.focusTemplates.push(val);
    _renderTab();
  }

  function _toggleBaseColl(val) {
    var idx = ce.selectedBaseCollections.indexOf(val);
    if (idx >= 0) ce.selectedBaseCollections.splice(idx, 1);
    else ce.selectedBaseCollections.push(val);
    _renderTab();
  }

  function _togglePrioColl(val) {
    var idx = ce.priorityCollections.indexOf(val);
    if (idx >= 0) ce.priorityCollections.splice(idx, 1);
    else ce.priorityCollections.push(val);
    _renderTab();
  }

  function _toggleSection(id) {
    var el = document.getElementById('ce-section-content-' + id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  }

  // ─── PUBLIC API (window) ─────────────────────────────────────────

  // Expose state for inline handlers
  window.ce_state = ce;

  window._ceTab = function (id) {
    if (id === 'chat' && !ce.analysisId) { showToast('⚠ Guarda el análisis primero para usar el chat'); return; }
    ce.activeTab = id;
    _renderTabs();
    _renderTab();
  };
  window._ceSetMode = function (v) {
    ce.analysisMode = v;
    ce.caseType = '';
    ce.focusTemplates = [];
    ce.analysisSections = {};
    _renderTab();
  };
  window._ceToggleFocus = _toggleFocus;
  window._ceToggleBaseColl = _toggleBaseColl;
  window._ceTogglePrioColl = _togglePrioColl;
  window._ceToggleSource = function (key) {
    ce.searchSources[key] = !ce.searchSources[key];
    _renderTab();
  };
  window._ceToggleSection = _toggleSection;
  window._ceDocUpload = _handleDocUpload;
  window._ceRemoveDoc = _removeDoc;
  window._ceLinkFolder = _ceLinkFolder;
  window._ceUnlinkFolder = _ceUnlinkFolder;
  window._ceCreateFolder = _ceCreateFolder;
  window._ceRefreshFolder = _ceRefreshFolder;
  window._ceChatFileUpload = _handleChatFileUpload;
  window._ceExtractFacts = _extractFacts;
  window._ceSearchLibrary = _searchLibrary;
  window._ceGenerateSection = _generateSection;
  window._ceGenerateAll = _generateAllSections;
  window._ceSendChat = function () {
    var inp = document.getElementById('ce-chat-input');
    if (inp) ce.chatInput = inp.value;
    _sendChatMessage();
  };
  window._ceClearChat = _clearChat;
  window._ceCopyMsg = function (idx) {
    var msg = ce.chatMessages[idx];
    if (msg && msg.content) {
      navigator.clipboard.writeText(msg.content).then(function () { showToast('✓ Copiado'); });
    }
  };
  window._ceDeleteMsg = async function (idx) {
    var msg = ce.chatMessages[idx];
    if (!msg) return;
    if (!confirm('¿Eliminar este mensaje?')) return;
    // Delete from Supabase if it has an id
    if (msg.id) {
      var db = _sb();
      if (db) {
        try {
          await db.from('external_case_messages').delete().eq('id', msg.id);
        } catch (e) { console.warn('Delete chat msg error:', e); }
      }
    }
    // Remove from local array
    ce.chatMessages.splice(idx, 1);
    _renderChatMessages();
    showToast('✓ Mensaje eliminado');
  };
  window._ceExportChatMsgWord = async function (idx) {
    var msg = ce.chatMessages[idx];
    if (!msg || !msg.content) { showToast('⚠ Sin contenido para exportar'); return; }

    showToast('📄 Generando Word…');
    try {
      var d = await _waitDocx();

      // Section props SIN logo — solo márgenes y footer con paginación
      var sectionPropsNoLogo = {
        properties: {
          page: {
            size: { width: WORD_FORMAT.pageWidth, height: WORD_FORMAT.pageHeight },
            margin: {
              top: WORD_FORMAT.marginTop, bottom: WORD_FORMAT.marginBottom,
              left: WORD_FORMAT.marginLeft, right: WORD_FORMAT.marginRight,
            },
          },
        },
        footers: { default: makeWordDocFooter(d) },
      };

      var children = [];

      // Title
      children.push(makeHeading('CONSULTA — CASO EXTERNO', d, 1));

      // Case metadata
      if (ce.caseName) {
        children.push(makePara('Caso: ' + ce.caseName, d, { center: true, after: 60 }));
      }
      children.push(makePara('Fecha: ' + new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), d, { center: true, after: 240 }));

      // Parse message content
      var content = msg.content;
      var paragraphs = content.split('\n').filter(function (p) { return p.trim(); });

      paragraphs.forEach(function (para) {
        var trimmed = para.trim();

        if (/^#{1,3}\s+/.test(trimmed)) {
          var cleanText = trimmed.replace(/^#+\s*/, '');
          var level = trimmed.match(/^#+/)[0].length;
          children.push(makeHeading(cleanText, d, Math.min(level, 3)));
        } else if (/^#{4,6}\s+/.test(trimmed)) {
          children.push(makeHeading(trimmed.replace(/^#+\s*/, ''), d, 3));
        } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
          children.push(makeHeading(trimmed.replace(/\*\*/g, ''), d, 2));
        } else if (/^\d+[\.\)]\s|^[A-Z][\.\)]\s|^[-•]\s/.test(trimmed)) {
          children.push(makePara(trimmed, d, { indent: true, before: 60, after: 60 }));
        } else if (trimmed.length > 0) {
          children.push(makePara(trimmed, d, { indent: true, before: 0, after: 120 }));
        }
      });

      var doc = new d.Document({
        styles: {
          default: {
            document: {
              run: { font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor },
            },
          },
        },
        sections: [{
          ...sectionPropsNoLogo,
          children: children,
        }],
      });

      var buffer = await d.Packer.toBlob(doc);
      var filename = 'chat_' + (ce.caseName || 'caso').replace(/\s+/g, '_') + '_msg' + (idx + 1) + '_' + new Date().toISOString().slice(0, 10) + '.docx';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(buffer);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      showToast('✅ ' + filename + ' descargado');
    } catch (err) {
      console.error('exportChatMsgWord:', err);
      showToast('⚠ Error al generar Word: ' + err.message);
    }
  };
  window._ceToggleWritings = function () { ce.showWritingsPanel = !ce.showWritingsPanel; _renderChat(); };
  window._ceRenderWritings = _renderWritings;
  window._ceGenerateWriting = _generateWriting;
  window._ceSave = _saveAnalysis;
  window._ceExportWord = _exportAnalysisToWord;
  window._ceCopyAll = _copyAllSections;
  window._ceNewCase = _newCase;
  window._ceLoadCase = _loadAnalysis;
  window._ceDeleteCase = _deleteAnalysis;
  window._ceExportWritingWord = async function () {
    if (!ce.writingResult) {
      showToast('⚠ No hay escrito para exportar');
      return;
    }

    showToast('📄 Generando escrito en Word…');
    try {
      // Get docx library
      var d = await _waitDocx();
      // Section props SIN logo para casos externos
      var sectionProps = {
        properties: {
          page: {
            size: { width: WORD_FORMAT.pageWidth, height: WORD_FORMAT.pageHeight },
            margin: {
              top: WORD_FORMAT.marginTop, bottom: WORD_FORMAT.marginBottom,
              left: WORD_FORMAT.marginLeft, right: WORD_FORMAT.marginRight,
            },
          },
        },
        footers: { default: makeWordDocFooter(d) },
      };

      var tpl = WRITING_TEMPLATES.find(function (t) { return t.id === ce.writingTemplate; });
      var docTitle = (tpl ? tpl.label : 'Escrito Judicial').toUpperCase();

      var children = [];

      // Title
      children.push(makeHeading(docTitle, d, 1));

      // Metadata if available
      if (ce.caseName) {
        children.push(makePara('Caso: ' + ce.caseName, d, { center: true, after: 120 }));
      }
      children.push(makePara('Fecha: ' + new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }), d, { center: true, after: 240 }));

      // Parse writing result content into paragraphs, handling markdown and structure
      var content = ce.writingResult;
      var paragraphs = content.split('\n').filter(function (p) { return p.trim(); });

      paragraphs.forEach(function (para) {
        var trimmed = para.trim();

        // Markdown headings (# ## ###)
        if (/^#+\s+/.test(trimmed)) {
          var level = trimmed.match(/^#+/)[0].length;
          var cleanText = trimmed.replace(/^#+\s*/, '');
          children.push(makeHeading(cleanText, d, Math.min(level, 3)));
        }
        // Section markers (VISTOS, CONSIDERANDO, POR TANTO, etc.)
        else if (/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|SE PROPONE|PARTE DISPOSITIVA)[\s:]?/i.test(trimmed)) {
          children.push(makeHeading(trimmed, d, 2));
        }
        // Numbered items or "Que," paragraphs
        else if (/^\d+[\.\)°]|^Que,|^[A-Z][\.\)]/i.test(trimmed)) {
          children.push(makePara(trimmed, d, { indent: true, before: 60, after: 60 }));
        }
        // Regular paragraphs
        else if (trimmed.length > 0) {
          children.push(makePara(trimmed, d, { indent: true, before: 0, after: 120 }));
        }
      });

      // Signature section
      children.push(makePara('', d)); // spacing
      children.push(...makeSignatureLine('[ABOGADO/A]', 'Letrado/a Patrocinante', d));

      // Create document
      var doc = new d.Document({
        styles: {
          default: {
            document: {
              run: { font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor },
            },
          },
        },
        sections: [{
          ...sectionProps,
          children: children,
        }],
      });

      // Generate and download
      var buffer = await d.Packer.toBlob(doc);
      var fname = 'escrito_' + (tpl ? tpl.id : 'judicial') + '_' + new Date().toISOString().slice(0, 10) + '.docx';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(buffer);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);

      showToast('✅ ' + fname + ' descargado');

    } catch (err) {
      console.error('ceExportWritingWord:', err);
      showToast('⚠ Error al generar Word: ' + err.message);
    }
  };

  // Main entry point
  window.openAnalisisCasosExternos = function () {
    document.querySelectorAll('.sidebar-nav-item').forEach(function (el) { el.classList.remove('active'); });
    if (typeof event !== 'undefined' && event && event.currentTarget) event.currentTarget.classList.add('active');
    if (typeof currentCase !== 'undefined') currentCase = null;

    ce._active = true;
    _createView();
    showView('viewCasosExternos');
    _loadCustomCollections();
    _loadSavedCases();
    _renderAll();
  };

  // Also expose CE_SYS for the patch module
  window.CE_SYS = SECTION_SYSTEM_PROMPTS;

  console.log('%c⚖️ Módulo Casos Externos cargado (completo)', 'color:#4f46e5;font-weight:bold');

})();
