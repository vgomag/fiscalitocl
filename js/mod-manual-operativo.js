/**
 * MOD-MANUAL-OPERATIVO.JS
 * Genera y descarga el Manual Operativo de Fiscalito en PDF.
 * Dependencia: jsPDF (CDN en index.html)
 */
const MANUAL_VERSION='2.1',MANUAL_DATE='Marzo 2026';
const MANUAL={
  title:'MANUAL OPERATIVO',appName:'Fiscalito',
  subtitle:'Asistente Jurídico para Procedimientos Disciplinarios',
  institution:'Sistema de Gestión Disciplinaria',
  desc:'Fiscalito es un asistente jurídico basado en inteligencia artificial, diseñado para apoyar la gestión integral de procedimientos disciplinarios administrativos. Integra herramientas de análisis, redacción, gestión documental y seguimiento procesal en una sola plataforma.',
  features:[
    'Asistencia mediante IA para redacción, análisis y consultas jurídicas',
    'Gestión de expedientes con seguimiento de etapas procesales y checklist',
    'Dashboard con estadísticas en tiempo real de casos activos y terminados',
    'Sincronización con Google Drive para base documental',
    'Adjuntar documentos al chat para análisis contextual',
    'Análisis estructurado IRAC de investigaciones',
    'Módulo Ley 21.369 con checklist de cumplimiento',
    'Análisis jurisprudencial con verificación anti-alucinación',
    'Herramientas PDF: comprimir, dividir, fusionar y OCR',
    'Transcripción automática de audio y video',
    'Biblioteca de párrafos modelo reutilizables',
    'Generación de extractos de diligencias con IA',
    'Párrafos modelo estilo Vista Fiscal',
    'Historial de chat IA aislado por expediente',
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
    {c:'F0',n:'Consulta General',d:'Análisis jurídico adaptativo.'},
    {c:'F2',n:'Redacción y Estilo',d:'Mejora redacción, evalúa tono y neutralidad.'},
    {c:'F3',n:'Cuestionario Inculpado',d:'Cuestionario estructurado 5 bloques.'},
    {c:'F4',n:'Cuestionario Testigos',d:'Preguntas exploratorias estratégicas.'},
    {c:'F5',n:'Análisis IRAC',d:'Issue, Rule, Application, Conclusion.'},
    {c:'F6',n:'Formulación de Cargos',d:'Resolución con hechos y normas verificados.'},
    {c:'F7',n:'Vista Fiscal',d:'Informe final: Vistos, Considerandos, Por Tanto.'},
    {c:'F8',n:'Informe en Derecho',d:'Informe académico con dictámenes, doctrina y jurisprudencia.'},
    {c:'F9',n:'Plantillas',d:'Documentos formales: resoluciones, actas, oficios.'},
    {c:'F10',n:'Jurisprudencia',d:'Búsqueda dictámenes CGR con anti-alucinación.'},
    {c:'F11',n:'Transcripción',d:'Audio/video a acta formal con diarización.'},
  ],
  tabs:[
    {n:'Participantes',d:'Intervinientes del expediente.'},
    {n:'Checklist',d:'Verificación por fase procesal.'},
    {n:'Pendientes',d:'Acciones con fechas de vencimiento.'},
    {n:'Notas',d:'Notas internas y generadas desde chat.'},
    {n:'Modelos',d:'Documentos generados desde resoluciones propias.'},
    {n:'Drive',d:'Vinculación carpeta Google Drive.'},
    {n:'Diligencias',d:'Importación, OCR, extractos y párrafos modelo.'},
    {n:'Chat IA',d:'Conversación vinculada al caso, historial aislado.'},
  ],
  bestDo:[
    'Vincule el expediente antes de consultar',
    'Sea específico en sus consultas al chat IA',
    'Revise SIEMPRE las respuestas antes de usarlas',
    'Verifique dictámenes CGR en contraloria.cl',
    'Importe diligencias desde Drive para tener extractos',
    'Genere párrafos modelo desde diligencias procesadas',
  ],
  bestAvoid:[
    'Confiar sin revisar las respuestas de la IA',
    'Usar dictámenes sin verificar existencia real',
    'Consultas ambiguas o muy generales',
    'Ignorar marcas [VERIFICAR] en respuestas',
  ],
  trouble:[
    {p:'Sesión expirada',s:'Inicie sesión nuevamente.'},
    {p:'Drive falla',s:'Verifique conexión y permisos.'},
    {p:'Error 400 chat',s:'Archivo excede límite. Divida.'},
    {p:'Dictamen inventado',s:'Verifique en contraloria.cl.'},
    {p:'Sin texto en diligencia',s:'Verifique drive.js actualizado.'},
    {p:'Chat de otro caso',s:'Recargue página.'},
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
    const bul=t=>{doc.setFillColor(...CC.p);chk(6);doc.circle(M+2,y+3,1,'F');doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(CC.tx);doc.splitTextToSize(t,pw-8).forEach((l,i)=>{chk(5.5);doc.text(l,M+6,y+4);if(i>0)y+=5;});y+=6.5;};
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
    ['1. Introducción','2. Acceso al Sistema','3. Interfaz Principal','4. Funciones del Asistente IA','5. Gestión de Expedientes','6. Diligencias y Extractos','7. Google Drive','8. Módulos Especializados','9. Biblioteca de Normas','10. Directiva Anti-Alucinación','11. Buenas Prácticas','12. Solución de Problemas','13. Novedades v'+MANUAL_VERSION].forEach(t=>{doc.setFontSize(10);doc.setFont('helvetica','normal');rgb(CC.tx);chk(7);doc.text(t,M+4,y+4);y+=7;});

    /* 1 */ addP();sect('1. Introducción');par(MANUAL.desc);sub('Características principales');MANUAL.features.forEach(f=>bul(f));sub('Marco normativo');MANUAL.legalFramework.forEach(f=>bul(f));

    /* 2 */ addP();sect('2. Acceso al Sistema');par('Fiscalito utiliza autenticación mediante Supabase Auth. El acceso está restringido a usuarios autorizados.');box('El registro está deshabilitado. Contacte al administrador para credenciales.','info');

    /* 3 */ sect('3. Interfaz Principal');par('La interfaz se divide en: Barra lateral (navegación), Panel central (detalle del expediente con pestañas) y Panel de lista (tabla de expedientes filtrable por categoría).');

    /* 4 */ addP();sect('4. Funciones del Asistente IA');par('11 funciones especializadas desde la pestaña Chat IA:');MANUAL.functions.forEach((f,i)=>num(i+1,f.c+' — '+f.n,f.d));box('Todas las funciones operan bajo la Directiva Anti-Alucinación.','warn');

    /* 5 */ addP();sect('5. Gestión de Expedientes');par('Cada expediente se organiza en pestañas:');MANUAL.tabs.forEach((t,i)=>num(i+1,t.n,t.d));

    /* 6 */ addP();sect('6. Diligencias y Extractos');par('Importa documentos desde Drive, clasifica automáticamente, extrae texto con IA (OCR para PDFs) y genera resúmenes.');sub('Flujo de trabajo');bul('1. Vincular carpeta Drive al caso.');bul('2. Importar desde Drive — auto-clasifica cada archivo.');bul('3. Procesar con IA: descarga PDF → Claude extrae texto → resumen.');bul('4. Generar Párrafos Modelo estilo Vista Fiscal.');sub('Párrafos Modelo');par('Genera párrafos formales con "Que," e indicación de fojas. Nivel 1 (3-5 oraciones), Nivel 2 (5-8), Nivel 3 (10-20 oraciones para declaraciones).');

    /* 7 */ addP();sect('7. Google Drive');par('Conexión mediante service account. Estructura de carpetas: dictámenes, normativa, jurisprudencia, doctrina, libros, temáticas, casos y modelos.');

    /* 8 */ sect('8. Módulos Especializados');num(1,'Ley 21.369','Checklist de cumplimiento.');num(2,'Jurisprudencia (F10)','Con verificación anti-alucinación.');num(3,'Casos Externos','Análisis con IA.');num(4,'Herramientas PDF','Comprimir, dividir, fusionar, OCR.');num(5,'Párrafos','Repositorio reutilizable.');num(6,'Estadísticas','Dashboard con gráficos.');num(7,'Modelos RAG','Desde resoluciones propias.');

    /* 9 */ addP();sect('9. Biblioteca de Normas');par('Fuente permanente: normativa, dictámenes CGR, doctrina, libros y jurisprudencia. F8 (Informe en Derecho) accede a todas las colecciones con máxima profundidad.');

    /* 10 */ sect('10. Directiva Anti-Alucinación');sub('Hechos');bul('Solo afirma hechos del expediente. Marca [NO CONSTA] si falta.');sub('Normativa');bul('Solo cita artículos y leyes reales. Prioriza Biblioteca.');bul('Dictámenes CGR: solo con certeza. Marca [VERIFICAR] ante duda.');sub('Confianza');bul('[CERTEZA ALTA] — fuente verificada.');bul('[VERIFICAR] — referencia probable.');bul('[NO ENCONTRADA] — no localizado.');box('REVISE SIEMPRE las respuestas antes de incorporarlas a documentos formales.','warn');

    /* 11 */ addP();sect('11. Buenas Prácticas');sub('Recomendaciones');MANUAL.bestDo.forEach(d=>bul(d));sub('Evitar');MANUAL.bestAvoid.forEach(a=>{doc.setFillColor(...CC.rd);chk(6);doc.circle(M+2,y+3,1,'F');doc.setFontSize(9);doc.setFont('helvetica','normal');rgb(CC.tx);doc.splitTextToSize(a,pw-8).forEach((l,i)=>{chk(5.5);doc.text(l,M+6,y+4);if(i>0)y+=5;});y+=6.5;});

    /* 12 */ addP();sect('12. Solución de Problemas');MANUAL.trouble.forEach(t=>{chk(14);doc.setFontSize(9.5);doc.setFont('helvetica','bold');rgb(CC.tx);doc.text('• '+t.p,M,y+4);y+=6;doc.setFont('helvetica','normal');rgb(CC.gn);doc.text('  → '+t.s,M+4,y+4);y+=8;});

    /* 13 */ addP();sect('13. Novedades v'+MANUAL_VERSION);
    bul('Historial de chat IA aislado por expediente.');
    bul('Pestaña Diligencias con importación masiva desde Drive.');
    bul('OCR de PDFs con Claude para extracción de texto real.');
    bul('Párrafos Modelo Vista Fiscal con 3 niveles de detalle.');
    bul('Directiva Anti-Alucinación reforzada en F0-F11.');
    bul('F8 Informe en Derecho con estructura obligatoria y estilo humano.');
    bul('Sistema de niveles de confianza: CERTEZA ALTA / VERIFICAR / NO ENCONTRADA.');
    bul('Manual Operativo descargable desde pantalla de bienvenida.');

    /* FOOTER */
    const tot=doc.internal.getNumberOfPages();
    for(let i=1;i<=tot;i++){doc.setPage(i);doc.setDrawColor(...CC.bd);doc.line(M,H-14,W-M,H-14);doc.setFontSize(7.5);rgb(CC.lt);doc.text('Fiscalito — Manual Operativo v'+MANUAL_VERSION,M,H-10);doc.text('Página '+i+' de '+tot,W-M,H-10,{align:'right'});}

    doc.save('Manual_Operativo_Fiscalito_v'+MANUAL_VERSION+'.pdf');
    showToast('✅ Manual descargado');
  }catch(e){console.error('Manual error:',e);showToast('⚠️ Error: '+e.message);}
}
