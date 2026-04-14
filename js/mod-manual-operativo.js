/**
 * MOD-MANUAL-OPERATIVO.JS
 * Genera y descarga el Manual Operativo de Fiscalito en PDF.
 * Dependencia: jsPDF (CDN en index.html)
 */
const MANUAL_VERSION='3.0',MANUAL_DATE='Abril 2026';
const MANUAL={
  title:'MANUAL OPERATIVO',appName:'Fiscalito',
  subtitle:'Asistente Jurídico para Procedimientos Disciplinarios',
  institution:'Fiscalía Universitaria — Universidad de Magallanes',
  desc:'Fiscalito es un asistente jurídico basado en inteligencia artificial, diseñado para apoyar la gestión integral de procedimientos disciplinarios administrativos en la Fiscalía Universitaria de la Universidad de Magallanes (UMAG). Integra herramientas de análisis, redacción, gestión documental, seguimiento procesal, búsqueda jurisprudencial con RAG y generación automatizada de resoluciones en una sola plataforma.',
  techDesc:'Fiscalito es una Single-Page Application (SPA) construida con HTML, CSS y JavaScript vanilla. La navegación se controla mediante una barra lateral con secciones colapsables y la función showView() que alterna entre vistas. El backend utiliza Supabase (PostgreSQL + Auth + Storage) y Qdrant como base de datos vectorial para búsqueda semántica (RAG). La IA se integra vía API de Anthropic (Claude) con streaming en tiempo real. Los módulos se organizan como archivos JS independientes bajo /js/ usando IIFE y variables globales window.*. La arquitectura modular permite que cada vista (Biblioteca, Jurisprudencia, Cuestionarios, etc.) sea autónoma pero interoperable a través del estado global compartido.',
  deployment:{
    url:'https://fiscalitocl.netlify.app/',
    repo:'https://github.com/vgomag/fiscalitocl',
    db:'Supabase — PostgreSQL (proyecto zgoxrzbkftzulsphmtfk)',
    hosting:'Netlify (CDN global, deploy automático desde GitHub)',
    model:'Software como Servicio (SaaS) — modelo basado en la nube donde la aplicación se ejecuta en servidores del proveedor y se accede vía navegador web. Arquitectura multiinquilino optimizada para múltiples usuarios con suscripción, actualizaciones automáticas, mantenimiento centralizado y acceso desde cualquier dispositivo con conexión a internet.',
  },
  ipProtection:{
    copyright:{
      law:'Ley 17.336 sobre Propiedad Intelectual',
      art8:'Art. 8° inc. 2°: Tratándose de programas computacionales, serán titulares del derecho de autor las personas naturales o jurídicas cuyos dependientes, en el desempeño de sus funciones laborales, los hubiesen producido, salvo estipulación escrita en contrario.',
      art10:'Art. 10°: La protección dura toda la vida del autor y 70 años más. Para personas jurídicas empleadoras (art. 8° inc. 2°), 70 años desde la primera publicación.',
      registro:'Inscripción en DDI (propiedadintelectual.gob.cl): código fuente, manual de funcionamiento, licencias de terceros si aplica, y declaración de autoría.',
    },
    trademark:{
      law:'Ley 19.039 sobre Propiedad Industrial (INAPI)',
      desc:'El nombre, logo y denominaciones distintivas del software se protegen mediante registro de marca ante INAPI.',
      niza:[
        {clase:9,desc:'Software, aplicaciones informáticas, programas de computación descargables (app móvil, software de escritorio, plugins).'},
        {clase:42,desc:'Servicios tecnológicos: diseño de software, desarrollo web, plataformas de computación en la nube, SaaS, API, servicios de IA.'},
        {clase:41,desc:'Servicios de educación, entretenimiento, plataformas e-learning (aplicable si el software tiene funciones educativas).'},
      ],
      nota:'DDI protege el código fuente (derecho de autor). INAPI protege el nombre y la identidad visual (marca). Son registros distintos y ambos son necesarios para protección completa.',
    },
  },
  architecture:{
    sidebar:[
      {section:'Gestión',items:['Dashboard — Estadísticas en tiempo real con gráficos de casos activos, terminados, por fase y por tipo de procedimiento','Mis Casos — Tabla de expedientes filtrable por categoría (IS/SA/PD) con acceso al detalle completo','Plantillas y Actas — Cuestionarios institucionales, actas de consentimiento, y 44 resoluciones de mero trámite organizadas por fase (Indagatoria/Discusión) y tipo de procedimiento','Transcripción de Audio — Función F11 integrada: transcripción automática con diarización de hablantes y generación de acta formal','Ley 21.369 — Módulo de cumplimiento normativo con checklist interactivo basado en el Protocolo 2022 UMAG']},
      {section:'Funciones IA',items:['F0 Consulta General — Análisis jurídico adaptativo con contexto del caso vinculado','F2 Redacción y Estilo — Mejora de redacción, evaluación de tono, neutralidad y corrección formal','F3 Cuestionario Inculpado — Generación de cuestionario estructurado en 5 bloques temáticos','F4 Cuestionario Testigos — Preguntas exploratorias estratégicas basadas en los hechos del caso','F5 Análisis IRAC — Estructura Issue, Rule, Application, Conclusion para análisis jurídico sistemático','F6 Formulación de Cargos — Resolución de cargos con hechos imputados y normas infringidas verificadas','F7 Vista Fiscal — Informe final con estructura Vistos, Considerandos, Por Tanto con inyección de contexto RAG','F8 Informe en Derecho — Informe académico profundo con dictámenes CGR, doctrina y jurisprudencia','F9 Chat con Plantillas — Chat IA contextual con documentos formales: resoluciones, actas y oficios','F10 Chat Jurisprudencial — Búsqueda de dictámenes CGR con sistema anti-alucinación y niveles de confianza']},
      {section:'Recursos',items:['Biblioteca — 8 pestañas unificadas: Libros, Normas, Normativa Interna UMAG, Párrafos Tipo, Modelos RAG, Herramientas Drive, Herramientas PDF y Chat IA','Análisis Jurisprudencial — 3 modos de análisis: Jurisprudencial (dictámenes CGR), Defensa Institucional y Recurso de Protección, con búsqueda semántica Qdrant y generación streaming','Oficios y Comunicaciones — Función F12 para generación de oficios, memorándums y comunicaciones formales','Casos Externos — Análisis comparativo de casos externos con IA','Escritos Judiciales — Redacción asistida de escritos para sede judicial']},
    ],
    modules:[
      {file:'mod-biblioteca.js',desc:'Biblioteca unificada con 8 pestañas. Renderiza tabs dinámicamente con renderBibliotecaView() y switchBibTab(). Integra catálogos de normas, libros, normativa interna, párrafos tipo reutilizables, modelos RAG embebidos, acceso a Drive/Qdrant, herramientas PDF y chat IA.'},
      {file:'mod-modelos-rag.js',desc:'Catálogo de documentos RAG (Retrieval-Augmented Generation). Permite seleccionar resoluciones propias como contexto para F7/F9. Embebido en Biblioteca mediante renderRAGEmbedded(). Los documentos seleccionados (rag.selectedIds) se inyectan como contexto en el chat.'},
      {file:'mod-plantillas-merotramite.js',desc:'44 plantillas de resolución de mero trámite organizadas en 2 fases: Indagatoria (32 plantillas, MT-IND-01 a MT-IND-32) y Discusión (12 plantillas, MT-DIS-01 a MT-DIS-12). Incluye protocolos UMAG, tipos de procedimiento (IS/SA/PD) y bloques de firma diferenciados: IS = solo investigador/a; SA/PD = Fiscal + Actuaria. Expone getMeroTramitePlantillas() y resolveTemplate().'},
      {file:'mod-cuestionarios.js',desc:'Módulo IIFE con sistema de tabs: Cuestionarios/Actas y Resoluciones Mero Trámite. Incluye wizard de llenado con auto-relleno de variables {variable} desde datos del caso. Integra las 44 plantillas de mod-plantillas-merotramite.js con filtros por fase, tipo de procedimiento y búsqueda libre.'},
      {file:'mod-jurisprudencia.js',desc:'Análisis jurisprudencial con 3 modos (ANALYSIS_MODES): jurisprudencial, defensa institucional y recurso de protección. Búsqueda semántica en Qdrant, generación streaming con Claude, vista independiente viewJurisprudencia.'},
      {file:'mod-manual-operativo.js',desc:'Genera y descarga el Manual Operativo en PDF usando jsPDF con diseño editorial profesional.'},
    ],
    procTypes:[
      {code:'IS',name:'Investigación Sumaria',firma:'Solo investigador/a fiscal'},
      {code:'SA',name:'Sumario Administrativo',firma:'Fiscal + Actuaria'},
      {code:'PD',name:'Procedimiento Disciplinario',firma:'Fiscal + Actuaria'},
    ],
  },
  features:[
    'Asistencia mediante IA (Claude) para redacción, análisis y consultas jurídicas con streaming en tiempo real',
    'Gestión de expedientes con seguimiento de etapas procesales, checklist y pendientes con vencimiento',
    'Dashboard con estadísticas en tiempo real de casos activos y terminados',
    'Sincronización con Google Drive para base documental mediante service account',
    'Adjuntar documentos al chat para análisis contextual',
    'Análisis estructurado IRAC de investigaciones',
    'Módulo Ley 21.369 con checklist de cumplimiento basado en Protocolo UMAG 2022',
    'Análisis jurisprudencial con 3 modos y verificación anti-alucinación',
    'Biblioteca unificada con 8 pestañas: Libros, Normas, Normativa, Párrafos, Modelos RAG, Drive, PDF, Chat IA',
    '44 plantillas de resolución de mero trámite con firmas diferenciadas por tipo de procedimiento',
    'Herramientas PDF: comprimir, dividir, fusionar y OCR',
    'Transcripción automática de audio y video con diarización',
    'Generación de extractos de diligencias con IA',
    'Párrafos modelo estilo Vista Fiscal con 3 niveles de detalle',
    'Modelos RAG con inyección de contexto en F7/F9',
    'Historial de chat IA aislado por expediente',
    'Oficios y comunicaciones formales automatizados',
    'Análisis de casos externos con IA',
    'Escritos judiciales asistidos',
    'Manual Operativo descargable en PDF',
  ],
  legalFramework:[
    'Estatuto Administrativo (Ley 18.834 / DFL 29)',
    'Ley 19.880 — Procedimientos Administrativos',
    'Ley 18.575 — Bases Administración del Estado',
    'Ley 21.369 — Acoso Sexual/Violencia Género en IES',
    'Ley 21.643 (Karin) — Prevención Acoso Laboral',
    'Ley 20.005 — Acoso Sexual','Ley 20.607 — Acoso Laboral',
    'Ley 21.094 — Universidades Estatales',
    'Dictámenes CGR','Jurisprudencia judicial',
  ],
  functions:[
    {c:'F0',n:'Consulta General',d:'Análisis jurídico adaptativo con contexto del caso vinculado. Responde consultas libres sobre derecho administrativo, procedimientos disciplinarios y normativa aplicable.'},
    {c:'F2',n:'Redacción y Estilo',d:'Mejora la redacción de textos jurídicos. Evalúa tono, neutralidad, corrección gramatical y consistencia formal. Sugiere alternativas con lenguaje institucional apropiado.'},
    {c:'F3',n:'Cuestionario Inculpado',d:'Genera cuestionario estructurado en 5 bloques temáticos: identificación, hechos imputados, descargos, contexto laboral y declaración final. Auto-rellena variables del caso.'},
    {c:'F4',n:'Cuestionario Testigos',d:'Genera preguntas exploratorias estratégicas basadas en los hechos del caso. Adapta el nivel de profundidad según el rol del testigo y la relación con los hechos investigados.'},
    {c:'F5',n:'Análisis IRAC',d:'Estructura Issue (problema jurídico), Rule (norma aplicable), Application (subsunción) y Conclusion (decisión). Metodología estándar para análisis jurídico sistemático.'},
    {c:'F6',n:'Formulación de Cargos',d:'Genera resolución de cargos con hechos imputados, normas infringidas verificadas, calificación de la falta y sanción propuesta. Incluye fundamento normativo detallado.'},
    {c:'F7',n:'Vista Fiscal',d:'Informe final con estructura: Vistos (antecedentes procesales), Considerandos (análisis jurídico-fáctico) y Por Tanto (propuesta de sanción o absolución). Soporta inyección de contexto RAG desde Modelos seleccionados.'},
    {c:'F8',n:'Informe en Derecho',d:'Informe académico profundo con dictámenes CGR, doctrina administrativa, jurisprudencia judicial y análisis comparativo. Estructura obligatoria con citas verificables y estilo formal humano.'},
    {c:'F9',n:'Chat con Plantillas',d:'Chat IA contextual para generación de documentos formales: resoluciones, actas, oficios. Soporta inyección de contexto RAG. Las plantillas de mero trámite están disponibles en la sección Plantillas y Actas.'},
    {c:'F10',n:'Chat Jurisprudencial',d:'Búsqueda conversacional de dictámenes CGR con sistema anti-alucinación. Niveles de confianza: [CERTEZA ALTA], [VERIFICAR], [NO ENCONTRADA]. Diferente del Análisis Jurisprudencial que tiene 3 modos especializados.'},
    {c:'F11',n:'Transcripción',d:'Transcripción automática de audio y video a acta formal con diarización de hablantes. Accesible desde sidebar como "Transcripción de Audio". Genera acta estructurada lista para incorporar al expediente.'},
    {c:'F12',n:'Oficios y Comunicaciones',d:'Generación de oficios, memorándums y comunicaciones institucionales formales. Accesible desde sidebar en la sección Recursos como "Oficios y Comunicaciones".'},
  ],
  tabs:[
    {n:'Participantes',d:'Intervinientes del expediente: inculpado, denunciante, testigos, abogados.'},
    {n:'Checklist',d:'Verificación por fase procesal con indicadores de cumplimiento.'},
    {n:'Pendientes',d:'Acciones programadas con fechas de vencimiento y alertas.'},
    {n:'Notas',d:'Notas internas y notas generadas automáticamente desde chat IA.'},
    {n:'Modelos',d:'Documentos generados desde resoluciones propias para uso como modelos RAG.'},
    {n:'Drive',d:'Vinculación de carpeta Google Drive con sincronización automática.'},
    {n:'Diligencias',d:'Importación masiva desde Drive, OCR con Claude, extractos de texto y párrafos modelo estilo Vista Fiscal.'},
    {n:'Chat IA',d:'Conversación vinculada al caso con historial aislado por expediente. Soporta funciones F0-F12 y adjuntos.'},
  ],
  biblioteca:[
    {tab:'Libros',d:'Catálogo de libros jurídicos digitales con búsqueda y lectura.'},
    {tab:'Normas',d:'Colección de leyes, reglamentos y normativa vigente.'},
    {tab:'Normativa Interna',d:'Decretos, protocolos y reglamentos internos de la UMAG.'},
    {tab:'Párrafos Tipo',d:'Repositorio de párrafos modelo reutilizables para resoluciones y vistas fiscales.'},
    {tab:'Modelos RAG',d:'Catálogo de resoluciones propias para inyección de contexto en F7/F9. Permite seleccionar documentos que se incorporan como referencia en la generación IA.'},
    {tab:'Drive',d:'Acceso directo a la integración con Google Drive y Qdrant para búsqueda semántica en la base documental.'},
    {tab:'PDF',d:'Herramientas de manipulación de PDFs: comprimir, dividir, fusionar y OCR.'},
    {tab:'Chat IA',d:'Chat integrado dentro de la Biblioteca para consultas rápidas sobre normativa y doctrina.'},
  ],
  analisisJuris:[
    {modo:'Jurisprudencial',d:'Búsqueda semántica en Qdrant de dictámenes CGR relevantes al caso. Genera análisis estructurado con citas verificables y niveles de confianza.'},
    {modo:'Defensa Institucional',d:'Análisis orientado a la posición de la institución. Identifica argumentos de defensa, precedentes favorables y estrategia procesal.'},
    {modo:'Recurso de Protección',d:'Análisis específico para recursos de protección. Evalúa procedencia, derechos afectados, medidas cautelares y jurisprudencia de Cortes de Apelaciones.'},
  ],
  plantillasMT:{
    desc:'44 resoluciones de mero trámite predefinidas, organizadas por fase procesal y compatibles con los 3 tipos de procedimiento (IS, SA, PD).',
    fases:[
      {fase:'Indagatoria',count:32,desc:'Desde la resolución que ordena investigar hasta la formulación de cargos. Incluye: designaciones, notificaciones, citaciones, prórrogas, acumulaciones, declaraciones, peritajes, medidas cautelares, secreto y reserva.'},
      {fase:'Discusión',count:12,desc:'Desde la notificación de cargos hasta el cierre. Incluye: notificación de cargos, término probatorio, medidas para mejor resolver, vista fiscal, elevación al Rector y cierre del procedimiento.'},
    ],
    firmas:'IS = solo investigador/a fiscal. SA y PD = Fiscal + Actuaria. La función resolveTemplate() genera automáticamente el bloque de firma según el tipo de procedimiento.',
  },
  bestDo:[
    'Vincule el expediente antes de consultar para obtener contexto automático',
    'Sea específico en sus consultas al chat IA — incluya normas y hechos relevantes',
    'Revise SIEMPRE las respuestas de la IA antes de incorporarlas a documentos formales',
    'Verifique dictámenes CGR en contraloria.cl antes de citarlos',
    'Importe diligencias desde Drive para generar extractos automáticos',
    'Genere párrafos modelo desde diligencias procesadas para la Vista Fiscal',
    'Seleccione modelos RAG relevantes antes de usar F7 o F9 para mejorar la calidad de generación',
    'Use las plantillas de mero trámite desde Plantillas y Actas para resoluciones rutinarias',
    'Aproveche los 3 modos de Análisis Jurisprudencial según el tipo de análisis requerido',
  ],
  bestAvoid:[
    'Confiar sin revisar las respuestas de la IA',
    'Usar dictámenes sin verificar existencia real en contraloria.cl',
    'Consultas ambiguas o muy generales — la IA rinde mejor con contexto específico',
    'Ignorar marcas [VERIFICAR] en respuestas — indican referencias probables pero no confirmadas',
    'Generar Vista Fiscal sin haber importado y procesado las diligencias del caso',
    'Confundir F10 (Chat Jurisprudencial) con Análisis Jurisprudencial — son módulos distintos',
  ],
  trouble:[
    {p:'Sesión expirada',s:'Inicie sesión nuevamente con sus credenciales Supabase.'},
    {p:'Drive falla',s:'Verifique conexión a Internet y permisos de la service account.'},
    {p:'Error 400 chat',s:'El archivo adjunto excede el límite. Divida en partes menores usando Herramientas PDF.'},
    {p:'Dictamen inventado',s:'Verifique en contraloria.cl. Use el nivel de confianza como guía.'},
    {p:'Sin texto en diligencia',s:'Verifique que drive.js esté actualizado y que el PDF tenga texto extraíble (use OCR si es imagen).'},
    {p:'Chat de otro caso',s:'Recargue la página — el historial se vincula al expediente activo.'},
    {p:'Plantilla mero trámite no muestra firma correcta',s:'Verifique que el tipo de procedimiento (IS/SA/PD) esté seleccionado en los filtros.'},
    {p:'Modelos RAG no aparecen en F7/F9',s:'Vaya a Biblioteca > Modelos RAG y seleccione los documentos antes de usar el chat.'},
    {p:'Análisis Jurisprudencial sin resultados',s:'Verifique que Qdrant esté accesible. Intente con términos de búsqueda más amplios.'},
  ],
};
const CC={p:[79,70,229],pl:[99,102,241],dk:[17,24,39],tx:[31,41,55],mu:[107,114,128],lt:[156,163,175],bd:[229,231,235],bg:[249,250,251],wh:[255,255,255],gn:[5,150,105],rd:[239,68,68]};

async function downloadManualOperativo(){
  showToast('📥 Generando Manual Operativo…');
  try{
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const W=210,H=297,M=22,pw=W-2*M;
    let y=0,pn=0;
    const rgb=c=>{doc.setTextColor(c[0],c[1],c[2]);};
    const addP=()=>{doc.addPage();pn++;y=M;};
    const chk=n=>{if(y+n>H-M){addP();return true;}return false;};
    const sect=t=>{chk(16);doc.setFillColor(...CC.p);doc.rect(M,y,3,10,'F');doc.setFontSize(14);doc.setFont('helvetica','bold');rgb(CC.dk);doc.text(t,M+8,y+7);y+=16;};
    const sub=t=>{chk(10);doc.setFontSize(11);doc.setFont('helvetica','bold');rgb(CC.tx);doc.text(t,M,y+5);y+=10;};
    const par=t=>{doc.setFontSize(9.5);doc.setFont('helvetica','normal');rgb(CC.mu);doc.splitTextToSize(t,pw).forEach(l=>{chk(6);doc.text(l,M,y+4);y+=5.5;});y+=3;};
    const bul=t=>{doc.setFillColor(...CC.p);chk(6);doc.circle(M+2,y+3,1,'F');doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(CC.tx);doc.splitTextToSize(t,pw-8).forEach((l,i)=>{if(i>0){y+=5;chk(5.5);}doc.text(l,M+6,y+4);});y+=6.5;};
    const num=(n,t,d)=>{chk(12);doc.setFontSize(10);doc.setFont('helvetica','bold');rgb(CC.p);doc.text(n+'.',M,y+4);rgb(CC.dk);doc.text(t,M+8,y+4);y+=6;if(d){doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(CC.mu);doc.splitTextToSize(d,pw-8).forEach(l=>{chk(5);doc.text(l,M+8,y+3);y+=5;});y+=2;}};
    const box=(t,c)=>{const cl=c==='warn'?CC.rd:c==='tip'?CC.gn:CC.p;doc.setFontSize(9);doc.setFont('helvetica','normal');const ls=doc.splitTextToSize(t,pw-12);const h=ls.length*5.5+8;chk(h);doc.setFillColor(...cl);doc.rect(M,y,2.5,h,'F');doc.setFillColor(...CC.bg);doc.rect(M+2.5,y,pw-2.5,h,'F');rgb(CC.tx);ls.forEach((l,i)=>doc.text(l,M+8,y+6+i*5.5));y+=h+4;};

    /* PORTADA */
    doc.setFillColor(...CC.dk);doc.rect(0,0,W,H,'F');
    doc.setFillColor(...CC.p);doc.rect(0,110,W,4,'F');
    doc.setFontSize(42);doc.setFont('helvetica','bold');doc.setTextColor(255,255,255);
    doc.text(MANUAL.title,W/2,80,{align:'center'});
    doc.setFontSize(18);doc.setFont('helvetica','normal');doc.setTextColor(...CC.pl);
    doc.text(MANUAL.appName,W/2,95,{align:'center'});
    doc.setFontSize(11);doc.setTextColor(200,200,210);
    doc.text(MANUAL.subtitle,W/2,130,{align:'center'});
    doc.setFontSize(9);doc.setTextColor(160,160,170);
    doc.splitTextToSize(MANUAL.desc,140).forEach((l,i)=>doc.text(l,W/2,148+i*5,{align:'center'}));
    doc.setFillColor(...CC.p);doc.roundedRect(W/2-25,200,50,12,3,3,'F');
    doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(255,255,255);
    doc.text('v'+MANUAL_VERSION+' — '+MANUAL_DATE,W/2,207.5,{align:'center'});

    /* ÍNDICE */
    addP();sect('Índice de Contenidos');
    ['1. Introducción','2. Arquitectura Técnica','3. Despliegue e Infraestructura','4. Acceso al Sistema','5. Interfaz Principal — Sidebar','6. Funciones del Asistente IA (F0-F12)','7. Gestión de Expedientes','8. Biblioteca (8 pestañas)','9. Plantillas y Actas','10. Análisis Jurisprudencial (3 modos)','11. Diligencias y Extractos','12. Google Drive','13. Directiva Anti-Alucinación','14. Buenas Prácticas','15. Solución de Problemas','16. Propiedad Intelectual','17. Novedades v'+MANUAL_VERSION].forEach(t=>{doc.setFontSize(10);doc.setFont('helvetica','normal');rgb(CC.tx);chk(7);doc.text(t,M+4,y+4);y+=7;});

    /* 1 */ addP();sect('1. Introducción');par(MANUAL.desc);sub('Características principales');MANUAL.features.forEach(f=>bul(f));sub('Marco normativo');MANUAL.legalFramework.forEach(f=>bul(f));

    /* 2 */ addP();sect('2. Arquitectura Técnica');par(MANUAL.techDesc);
    sub('Módulos del sistema');MANUAL.architecture.modules.forEach((m,i)=>num(i+1,m.file,m.desc));
    sub('Tipos de procedimiento');MANUAL.architecture.procTypes.forEach((p,i)=>num(i+1,p.code+' — '+p.name,'Firma: '+p.firma+'.'));

    /* 3 */ addP();sect('3. Despliegue e Infraestructura');
    sub('URLs y servicios');
    bul('Aplicación web: '+MANUAL.deployment.url);
    bul('Repositorio: '+MANUAL.deployment.repo);
    bul('Base de datos: '+MANUAL.deployment.db);
    bul('Hosting: '+MANUAL.deployment.hosting);
    sub('Modelo SaaS');par(MANUAL.deployment.model);

    /* 4 */ sect('4. Acceso al Sistema');par('Fiscalito utiliza autenticación mediante Supabase Auth. El acceso está restringido a usuarios autorizados de la Fiscalía Universitaria.');box('El registro está deshabilitado. Contacte al administrador para credenciales.','info');

    /* 5 */ addP();sect('5. Interfaz Principal — Sidebar');par('La interfaz se organiza mediante una barra lateral con 3 secciones principales. Cada sección agrupa funcionalidades relacionadas:');
    MANUAL.architecture.sidebar.forEach(s=>{sub(s.section);s.items.forEach(i=>bul(i));});

    /* 6 */ addP();sect('6. Funciones del Asistente IA (F0-F12)');par('12 funciones especializadas accesibles desde la pestaña Chat IA del expediente y desde la sección Funciones IA del sidebar:');MANUAL.functions.forEach((f,i)=>num(i+1,f.c+' — '+f.n,f.d));box('Todas las funciones operan bajo la Directiva Anti-Alucinación. F11 y F12 no aparecen en la lista de Funciones IA del sidebar; se acceden directamente desde Gestión (Transcripción) y Recursos (Oficios).','warn');

    /* 7 */ addP();sect('7. Gestión de Expedientes');par('Cada expediente se organiza en pestañas dentro del panel central:');MANUAL.tabs.forEach((t,i)=>num(i+1,t.n,t.d));

    /* 8 */ addP();sect('8. Biblioteca (8 pestañas)');par('La Biblioteca unifica en una sola vista todos los recursos documentales, normativos y herramientas auxiliares. Se accede desde Recursos > Biblioteca en el sidebar.');MANUAL.biblioteca.forEach((b,i)=>num(i+1,b.tab,b.d));

    /* 9 */ addP();sect('9. Plantillas y Actas');par(MANUAL.plantillasMT.desc);
    sub('Fases procesales');MANUAL.plantillasMT.fases.forEach((f,i)=>num(i+1,f.fase+' ('+f.count+' plantillas)',f.desc));
    sub('Sistema de firmas');par(MANUAL.plantillasMT.firmas);
    box('Las plantillas se acceden desde Gestión > Plantillas y Actas, pestaña "Resoluciones Mero Trámite". Incluyen filtros por fase, tipo de procedimiento y búsqueda libre.','tip');

    /* 10 */ addP();sect('10. Análisis Jurisprudencial (3 modos)');par('Módulo especializado con búsqueda semántica en Qdrant y generación streaming con IA. Diferente de F10 (Chat Jurisprudencial) que es conversacional. Se accede desde Recursos > Análisis Jurisprudencial.');MANUAL.analisisJuris.forEach((a,i)=>num(i+1,a.modo,a.d));

    /* 11 */ addP();sect('11. Diligencias y Extractos');par('Importa documentos desde Drive, clasifica automáticamente, extrae texto con IA (OCR para PDFs) y genera resúmenes.');sub('Flujo de trabajo');bul('1. Vincular carpeta Drive al caso.');bul('2. Importar desde Drive — auto-clasifica cada archivo.');bul('3. Procesar con IA: descarga PDF → Claude extrae texto → resumen.');bul('4. Generar Párrafos Modelo estilo Vista Fiscal.');sub('Párrafos Modelo');par('Genera párrafos formales con "Que," e indicación de fojas. Nivel 1 (3-5 oraciones), Nivel 2 (5-8), Nivel 3 (10-20 oraciones para declaraciones).');

    /* 12 */ sect('12. Google Drive');par('Conexión mediante service account. Estructura de carpetas: dictámenes, normativa, jurisprudencia, doctrina, libros, temáticas, casos y modelos. Sincronización desde la pestaña Drive del expediente o desde Biblioteca > Drive.');

    /* 13 */ addP();sect('13. Directiva Anti-Alucinación');sub('Hechos');bul('Solo afirma hechos del expediente. Marca [NO CONSTA] si falta.');sub('Normativa');bul('Solo cita artículos y leyes reales. Prioriza Biblioteca.');bul('Dictámenes CGR: solo con certeza. Marca [VERIFICAR] ante duda.');sub('Confianza');bul('[CERTEZA ALTA] — fuente verificada.');bul('[VERIFICAR] — referencia probable.');bul('[NO ENCONTRADA] — no localizado.');box('REVISE SIEMPRE las respuestas antes de incorporarlas a documentos formales.','warn');

    /* 14 */ addP();sect('14. Buenas Prácticas');sub('Recomendaciones');MANUAL.bestDo.forEach(d=>bul(d));sub('Evitar');MANUAL.bestAvoid.forEach(a=>{doc.setFillColor(...CC.rd);chk(6);doc.circle(M+2,y+3,1,'F');doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(CC.tx);doc.splitTextToSize(a,pw-8).forEach((l,i)=>{if(i>0){y+=5;chk(5.5);}doc.text(l,M+6,y+4);});y+=6.5;});

    /* 15 */ addP();sect('15. Solución de Problemas');MANUAL.trouble.forEach(t=>{chk(14);doc.setFontSize(9.5);doc.setFont('helvetica','bold');rgb(CC.tx);doc.text('• '+t.p,M,y+4);y+=6;doc.setFont('helvetica','normal');rgb(CC.gn);doc.text('  → '+t.s,M+4,y+4);y+=8;});

    /* 16 */ addP();sect('16. Propiedad Intelectual del Software');
    sub('Derecho de Autor — '+MANUAL.ipProtection.copyright.law);par(MANUAL.ipProtection.copyright.art8);par(MANUAL.ipProtection.copyright.art10);
    sub('Registro de inscripción (DDI)');par(MANUAL.ipProtection.copyright.registro);
    sub('Registro de Marca — '+MANUAL.ipProtection.trademark.law);par(MANUAL.ipProtection.trademark.desc);
    sub('Clasificación de Niza aplicable');MANUAL.ipProtection.trademark.niza.forEach(n=>bul('Clase '+n.clase+': '+n.desc));
    box(MANUAL.ipProtection.trademark.nota,'info');

    /* 17 */ addP();sect('17. Novedades v'+MANUAL_VERSION);
    bul('Biblioteca unificada con 8 pestañas (Libros, Normas, Normativa, Párrafos, Modelos RAG, Drive, PDF, Chat IA).');
    bul('44 plantillas de resolución de mero trámite integradas en Plantillas y Actas.');
    bul('Análisis Jurisprudencial restaurado con 3 modos especializados.');
    bul('Sidebar reestructurado: Gestión, Funciones IA y Recursos.');
    bul('F7 dedicado exclusivamente a Vista Fiscal.');
    bul('Modelos RAG con inyección de contexto en F7/F9.');
    bul('Firmas diferenciadas por tipo de procedimiento (IS vs SA/PD).');
    bul('Descripción técnica de arquitectura SPA y módulos.');
    bul('Sección de propiedad intelectual: Ley 17.336 y registro de marca INAPI.');
    bul('Manual Operativo actualizado a v'+MANUAL_VERSION+'.');

    /* FOOTER */
    const tot=doc.internal.getNumberOfPages();
    for(let i=1;i<=tot;i++){doc.setPage(i);doc.setDrawColor(...CC.bd);doc.line(M,H-14,W-M,H-14);doc.setFontSize(7.5);rgb(CC.lt);doc.text('Fiscalito — Manual Operativo v'+MANUAL_VERSION,M,H-10);doc.text('Página '+i+' de '+tot,W-M,H-10,{align:'right'});}

    doc.save('Manual_Operativo_Fiscalito_v'+MANUAL_VERSION+'.pdf');
    showToast('✅ Manual descargado');
  }catch(e){console.error('Manual error:',e);showToast('⚠️ Error: '+e.message);}
}
