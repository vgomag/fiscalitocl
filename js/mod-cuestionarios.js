// ============================================================================
// MÓDULO CUESTIONARIOS Y ACTAS — FISCALITO (mod-cuestionarios.js)
// 7 plantillas institucionales · Wizard guiado · Auto-llenado · Presencial/Telemática
// ============================================================================
(function(){
"use strict";

const h=t=>(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// ═══════════════════════════════════════════════════════════════════════════
// 1. PLANTILLAS DE DOCUMENTOS INSTITUCIONALES
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATES={

// ── IND-01: Aceptación de cargo y designación de actuaria ──
"IND-01-RES":{code:"IND-01-RES",name:"Aceptación de cargo y designación de actuaria",type:"RES",
structure:`RESOLUCIÓN EXENTA N° {proc_res_numero}

{id_ciudad}, {id_fecha}

VISTOS:

La Resolución Exenta N° {res_instr_numero}, de fecha {res_instr_fecha}, del {res_instr_autoridad}, que ordenó instruir procedimiento disciplinario en contra de {inc_nombre}, {inc_cargo}, por los hechos que allí se indican, designando como Fiscal Instructor a {fis_nombre}, {fis_cargo}.

CONSIDERANDO:

1.- Que, mediante la resolución antes indicada, se me ha designado como Fiscal Instructor del presente procedimiento disciplinario.

2.- Que, habiendo tomado conocimiento de la referida designación, no me afecta ninguna causal de implicancia o recusación de las contempladas en los artículos 12 y 13 de la Ley N° 19.880, que establece Bases de los Procedimientos Administrativos que rigen los actos de los Órganos de la Administración del Estado.

3.- Que, conforme a lo dispuesto en el artículo 133 del D.F.L. N° 29, de 2004, del Ministerio de Hacienda, que fija el texto refundido, coordinado y sistematizado de la Ley N° 18.834, sobre Estatuto Administrativo, el fiscal podrá designar un actuario, quien tendrá la calidad de ministro de fe.

RESUELVO:

1.- ACÉPTASE el cargo de Fiscal Instructor del procedimiento disciplinario instruido mediante Resolución Exenta N° {res_instr_numero}, de fecha {res_instr_fecha}.

2.- DESÍGNASE como Actuaria del presente procedimiento a {act_nombre}, {act_cargo}, quien actuará como ministro de fe en todas las diligencias que se practiquen.

3.- NOTIFÍQUESE la presente resolución a la Actuaria designada, para su conocimiento y cumplimiento.

ANÓTESE Y COMUNÍQUESE.

{fir_fiscal_nombre}
{fir_fiscal_cargo}
Fiscal Instructor`,
blocks:[
  {id:"proc_info",title:"Información del Procedimiento",desc:"Datos básicos",vars:[
    {key:"proc_res_numero",label:"N° de esta Resolución",type:"text",req:true,ph:"Ej: 123/2024"},
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true}]},
  {id:"res_instr",title:"Resolución que Instruye",desc:"Datos de la resolución original",vars:[
    {key:"res_instr_numero",label:"N° Resolución Instructora",type:"text",req:true},
    {key:"res_instr_fecha",label:"Fecha",type:"date",req:true},
    {key:"res_instr_autoridad",label:"Autoridad",type:"text",req:true,ph:"Ej: Rector de la Universidad de Magallanes"}]},
  {id:"inculpado",title:"Persona Inculpada",desc:"Datos del investigado",vars:[
    {key:"inc_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"inc_cargo",label:"Cargo",type:"text",req:true}]},
  {id:"fiscal",title:"Fiscal Instructor",desc:"Datos del fiscal",vars:[
    {key:"fis_nombre",label:"Nombre",type:"text",req:true},
    {key:"fis_cargo",label:"Cargo",type:"text",req:true},
    {key:"fir_fiscal_nombre",label:"Nombre para firma",type:"text",req:true},
    {key:"fir_fiscal_cargo",label:"Cargo para firma",type:"text",req:true}]},
  {id:"actuaria",title:"Actuaria",desc:"Datos de la actuaria",vars:[
    {key:"act_nombre",label:"Nombre",type:"text",req:true},
    {key:"act_cargo",label:"Cargo",type:"text",req:true}]}
]},

// ── IND-05: Acta de ratificación de denuncia ──
"IND-05-ACT":{code:"IND-05-ACT",name:"Acta de ratificación de denuncia",type:"ACT",
structure:`ACTA DE RATIFICACIÓN DE DENUNCIA

En {id_ciudad}, a {id_fecha}, siendo las {id_hora} horas, en dependencias de {id_lugar}, ante el suscrito Fiscal Instructor {fis_nombre}, y con la asistencia de la Actuaria {act_nombre}, comparece:

{den_nombre}, RUN {den_rut}, de nacionalidad {den_nacionalidad}, de profesión/ocupación {den_profesion}, domiciliado/a en {den_domicilio}, correo electrónico {den_email}, teléfono {den_telefono}.

Previamente advertido/a de las disposiciones del artículo 12 de la Ley N° 19.880, declara no tener relación de parentesco ni de dependencia con ninguna de las partes, ni tener interés directo o indirecto en el resultado del procedimiento.

Preguntado/a si ratifica íntegramente el contenido de la denuncia presentada con fecha {den_fecha_denuncia}, mediante {den_medio_denuncia}, responde:

{den_ratificacion_texto}

Preguntado/a si desea agregar, modificar o aclarar algún aspecto de su denuncia original, señala:

{den_aclaraciones}

Preguntado/a si tiene conocimiento de otros hechos, antecedentes o personas que pudieran aportar información relevante para la investigación, indica:

{den_otros_antecedentes}

Leída la presente acta por el/la compareciente, se ratifica de su contenido y firma en señal de conformidad, en {id_ciudad}, a {id_fecha}.

_______________________          _______________________          _______________________
{den_nombre}                     {fis_nombre}                     {act_nombre}
Denunciante                      Fiscal Instructor                Actuaria`,
blocks:[
  {id:"ubicacion",title:"Ubicación y Fecha",desc:"Lugar, fecha y hora",vars:[
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true},
    {key:"id_hora",label:"Hora",type:"time",req:true},
    {key:"id_lugar",label:"Lugar",type:"text",req:true,ph:"Ej: Oficina de Fiscalía, Campus UMAG"}]},
  {id:"denunciante",title:"Datos del Denunciante",desc:"Identificación completa",vars:[
    {key:"den_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"den_rut",label:"RUN",type:"text",req:true,ph:"12.345.678-9"},
    {key:"den_nacionalidad",label:"Nacionalidad",type:"text",req:true,def:"chilena"},
    {key:"den_profesion",label:"Profesión/Ocupación",type:"text",req:true},
    {key:"den_domicilio",label:"Domicilio",type:"text",req:true},
    {key:"den_email",label:"Correo electrónico",type:"text",req:true},
    {key:"den_telefono",label:"Teléfono",type:"text",req:true}]},
  {id:"denuncia",title:"Denuncia Original",desc:"Datos de la denuncia",vars:[
    {key:"den_fecha_denuncia",label:"Fecha denuncia original",type:"date",req:true},
    {key:"den_medio_denuncia",label:"Medio de presentación",type:"text",req:true,ph:"Ej: escrito ingresado a Oficina de Partes"}]},
  {id:"contenido",title:"Contenido de la Ratificación",desc:"Declaraciones",vars:[
    {key:"den_ratificacion_texto",label:"Respuesta ratificación",type:"textarea",req:true,ph:"Sí, ratifico íntegramente..."},
    {key:"den_aclaraciones",label:"Aclaraciones",type:"textarea",req:false},
    {key:"den_otros_antecedentes",label:"Otros antecedentes",type:"textarea",req:false}]},
  {id:"funcionarios",title:"Funcionarios",desc:"Fiscal y Actuaria",vars:[
    {key:"fis_nombre",label:"Fiscal",type:"text",req:true},
    {key:"act_nombre",label:"Actuaria",type:"text",req:true}]}
]},

// ── IND-09: Acta de declaración persona denunciada ──
"IND-09-ACT":{code:"IND-09-ACT",name:"Acta de declaración persona denunciada",type:"ACT",
structure:`ACTA DE DECLARACIÓN DE PERSONA DENUNCIADA

En {id_ciudad}, a {id_fecha}, siendo las {id_hora} horas, en dependencias de {id_lugar}, ante el suscrito Fiscal Instructor {fis_nombre}, y con la asistencia de la Actuaria {act_nombre}, comparece la persona investigada:

IDENTIFICACIÓN:
Nombre: {inc_nombre}
RUN: {inc_rut}
Nacionalidad: {inc_nacionalidad}
Profesión/Ocupación: {inc_profesion}
Cargo: {inc_cargo}
Unidad/Departamento: {inc_unidad}
Fecha de ingreso: {inc_fecha_ingreso}
Calidad contractual: {inc_calidad_contractual}
Domicilio: {inc_domicilio}
Correo electrónico: {inc_email}
Teléfono: {inc_telefono}

ADVERTENCIAS LEGALES:
Se le informa que:
1.- Tiene derecho a conocer los hechos que se le imputan.
2.- Tiene derecho a ser oído y a presentar los descargos y pruebas que estime pertinentes.
3.- Tiene derecho a ser asistido por un abogado de su confianza, si así lo desea.
4.- Sus declaraciones deben ser voluntarias.

Preguntado/a si desea ser asistido/a por un abogado, responde: {inc_asistencia_abogado}

Se procede a informarle los hechos investigados, que consisten en: {jur_hechos_imputados}

DECLARACIÓN:

Preguntado/a sobre los hechos antes descritos, declara:

{inc_declaracion}

Preguntado/a si desea agregar algo más, señala:

{inc_agregados}

Leída la presente acta por el/la compareciente, se ratifica de su contenido y firma en señal de conformidad, previa lectura, en {id_ciudad}, a {id_fecha}.

_______________________          _______________________          _______________________
{inc_nombre}                     {fis_nombre}                     {act_nombre}
Persona Investigada              Fiscal Instructor                Actuaria`,
blocks:[
  {id:"ubicacion",title:"Ubicación y Fecha",desc:"Lugar, fecha y hora",vars:[
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true},
    {key:"id_hora",label:"Hora",type:"time",req:true},
    {key:"id_lugar",label:"Lugar",type:"text",req:true}]},
  {id:"identificacion",title:"Identificación del Inculpado",desc:"Datos personales y funcionarios",vars:[
    {key:"inc_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"inc_rut",label:"RUN",type:"text",req:true},
    {key:"inc_nacionalidad",label:"Nacionalidad",type:"text",req:true,def:"chilena"},
    {key:"inc_profesion",label:"Profesión",type:"text",req:true},
    {key:"inc_cargo",label:"Cargo actual",type:"text",req:true},
    {key:"inc_unidad",label:"Unidad/Departamento",type:"text",req:true},
    {key:"inc_fecha_ingreso",label:"Fecha ingreso",type:"date",req:true},
    {key:"inc_calidad_contractual",label:"Calidad contractual",type:"select",req:true,opts:["Planta","Contrata","Honorarios","Código del Trabajo"]},
    {key:"inc_domicilio",label:"Domicilio",type:"text",req:true},
    {key:"inc_email",label:"Correo",type:"text",req:true},
    {key:"inc_telefono",label:"Teléfono",type:"text",req:true}]},
  {id:"asistencia",title:"Asistencia Letrada",desc:"Derecho a abogado",vars:[
    {key:"inc_asistencia_abogado",label:"Respuesta sobre asistencia",type:"textarea",req:true,ph:"No deseo ser asistido / Sí, me asiste..."}]},
  {id:"hechos",title:"Hechos Imputados",desc:"Lo que se investiga",vars:[
    {key:"jur_hechos_imputados",label:"Hechos investigados",type:"textarea",req:true}]},
  {id:"declaracion",title:"Declaración",desc:"Lo declarado",vars:[
    {key:"inc_declaracion",label:"Declaración principal",type:"textarea",req:true},
    {key:"inc_agregados",label:"Agregados",type:"textarea",req:false}]},
  {id:"funcionarios",title:"Funcionarios",desc:"Fiscal y Actuaria",vars:[
    {key:"fis_nombre",label:"Fiscal",type:"text",req:true},
    {key:"act_nombre",label:"Actuaria",type:"text",req:true}]}
]},

// ── IND-10: Acta de declaración testigo ──
"IND-10-ACT":{code:"IND-10-ACT",name:"Acta de declaración de testigo",type:"ACT",
structure:`ACTA DE DECLARACIÓN TESTIMONIAL

En {id_ciudad}, a {id_fecha}, siendo las {id_hora} horas, en dependencias de {id_lugar}, ante el suscrito Fiscal Instructor {fis_nombre}, y con la asistencia de la Actuaria {act_nombre}, comparece en calidad de testigo:

IDENTIFICACIÓN:
Nombre: {tes_nombre}
RUN: {tes_rut}
Nacionalidad: {tes_nacionalidad}
Profesión/Ocupación: {tes_profesion}
Cargo (si es funcionario): {tes_cargo}
Domicilio: {tes_domicilio}
Correo electrónico: {tes_email}
Teléfono: {tes_telefono}

ADVERTENCIAS LEGALES:
Previamente, se le advierte al testigo:
1.- Del deber de decir verdad, conforme al artículo 17 de la Ley N° 19.880.
2.- Que las declaraciones falsas pueden configurar el delito de falso testimonio.
3.- Que conforme al artículo 12 de la Ley N° 19.880, debe informar si le afecta alguna causal de inhabilidad.

Preguntado/a si le afecta alguna causal de implicancia o inhabilidad: {tes_implicancia}

Preguntado/a sobre la relación con el/la denunciante y el/la persona denunciada: {tes_relacion_partes}

DECLARACIÓN:

Preguntado/a sobre los hechos de que tiene conocimiento, declara:

{tes_declaracion}

Preguntado/a específicamente sobre {tes_pregunta_especifica_1}, responde:

{tes_respuesta_1}

{tes_preguntas_adicionales}

Preguntado/a si desea agregar algo más, señala:

{tes_agregados}

Leída la presente acta por el/la testigo, se ratifica de su contenido y firma en señal de conformidad.

_______________________          _______________________          _______________________
{tes_nombre}                     {fis_nombre}                     {act_nombre}
Testigo                          Fiscal Instructor                Actuaria`,
blocks:[
  {id:"ubicacion",title:"Ubicación y Fecha",desc:"Lugar, fecha y hora",vars:[
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true},
    {key:"id_hora",label:"Hora",type:"time",req:true},
    {key:"id_lugar",label:"Lugar",type:"text",req:true}]},
  {id:"identificacion",title:"Identificación del Testigo",desc:"Datos personales",vars:[
    {key:"tes_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"tes_rut",label:"RUN",type:"text",req:true},
    {key:"tes_nacionalidad",label:"Nacionalidad",type:"text",req:true,def:"chilena"},
    {key:"tes_profesion",label:"Profesión/Ocupación",type:"text",req:true},
    {key:"tes_cargo",label:"Cargo (si aplica)",type:"text",req:false},
    {key:"tes_domicilio",label:"Domicilio",type:"text",req:true},
    {key:"tes_email",label:"Correo",type:"text",req:true},
    {key:"tes_telefono",label:"Teléfono",type:"text",req:true}]},
  {id:"implicancias",title:"Implicancias y Relaciones",desc:"Inhabilidades",vars:[
    {key:"tes_implicancia",label:"Respuesta implicancias",type:"textarea",req:true,ph:"No me afecta ninguna causal..."},
    {key:"tes_relacion_partes",label:"Relación con las partes",type:"textarea",req:true,ph:"Soy compañero de trabajo..."}]},
  {id:"declaracion",title:"Declaración Testimonial",desc:"Lo declarado",vars:[
    {key:"tes_declaracion",label:"Declaración general",type:"textarea",req:true},
    {key:"tes_pregunta_especifica_1",label:"Pregunta específica",type:"text",req:false},
    {key:"tes_respuesta_1",label:"Respuesta",type:"textarea",req:false},
    {key:"tes_preguntas_adicionales",label:"Otras preguntas y respuestas",type:"textarea",req:false},
    {key:"tes_agregados",label:"Agregados",type:"textarea",req:false}]},
  {id:"funcionarios",title:"Funcionarios",desc:"Fiscal y Actuaria",vars:[
    {key:"fis_nombre",label:"Fiscal",type:"text",req:true},
    {key:"act_nombre",label:"Actuaria",type:"text",req:true}]}
]},

// ── IND-07: Resolución cita a declarar ──
"IND-07-RES":{code:"IND-07-RES",name:"Resolución cita a declarar / ratificar",type:"RES",
structure:`RESOLUCIÓN EXENTA N° {proc_res_numero}

{id_ciudad}, {id_fecha}

VISTOS:

1.- El procedimiento disciplinario instruido mediante Resolución Exenta N° {res_instr_numero}, de fecha {res_instr_fecha}.

2.- Lo dispuesto en los artículos 18 y 19 de la Ley N° 19.880, sobre Bases de los Procedimientos Administrativos, y artículos 132 y siguientes del D.F.L. N° 29, de 2004.

CONSIDERANDO:

1.- Que, en el marco de la investigación en curso, resulta necesario recibir la declaración de {cit_nombre}, {cit_calidad}, a fin de esclarecer los hechos objeto del presente procedimiento.

2.- Que, conforme a la normativa vigente, toda persona que tenga conocimiento de hechos relevantes para una investigación administrativa tiene el deber de prestar declaración cuando sea requerida.

RESUELVO:

1.- CÍTASE a {cit_nombre}, RUN {cit_rut}, para que comparezca ante el Fiscal Instructor, con el objeto de {cit_objeto}.

2.- La citación se fija para el día {cit_fecha}, a las {cit_hora} horas, en {cit_lugar}.

3.- Se hace presente que la inasistencia injustificada podrá ser considerada como incumplimiento de deberes funcionarios, conforme al artículo 61 letra k) del Estatuto Administrativo.

4.- NOTIFÍQUESE al citado/a mediante oficio conductor.

ANÓTESE Y COMUNÍQUESE.

{fis_nombre}
Fiscal Instructor`,
blocks:[
  {id:"encabezado",title:"Datos de la Resolución",desc:"Número, fecha y ciudad",vars:[
    {key:"proc_res_numero",label:"N° Resolución",type:"text",req:true},
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true}]},
  {id:"procedimiento",title:"Procedimiento Base",desc:"Resolución original",vars:[
    {key:"res_instr_numero",label:"N° Resolución Instructora",type:"text",req:true},
    {key:"res_instr_fecha",label:"Fecha",type:"date",req:true}]},
  {id:"citacion",title:"Persona Citada",desc:"Datos de quien se cita",vars:[
    {key:"cit_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"cit_rut",label:"RUN",type:"text",req:true},
    {key:"cit_calidad",label:"Calidad",type:"select",req:true,opts:["denunciante","persona denunciada","testigo"]},
    {key:"cit_objeto",label:"Objeto de la citación",type:"text",req:true,ph:"Ej: prestar declaración como testigo"}]},
  {id:"diligencia",title:"Fecha y Lugar",desc:"Cuándo y dónde",vars:[
    {key:"cit_fecha",label:"Fecha citación",type:"date",req:true},
    {key:"cit_hora",label:"Hora",type:"time",req:true},
    {key:"cit_lugar",label:"Lugar",type:"text",req:true}]},
  {id:"fiscal",title:"Fiscal",desc:"Firma",vars:[
    {key:"fis_nombre",label:"Nombre del Fiscal",type:"text",req:true}]}
]},

// ── DEF-01: Formulación de cargos ──
"DEF-01-RES":{code:"DEF-01-RES",name:"Resolución de formulación de cargos",type:"RES",
structure:`RESOLUCIÓN EXENTA N° {proc_res_numero}
FORMULA CARGOS

{id_ciudad}, {id_fecha}

VISTOS:

1.- El procedimiento disciplinario instruido mediante Resolución Exenta N° {res_instr_numero}, de fecha {res_instr_fecha}, del {res_instr_autoridad}.

2.- Las diligencias practicadas durante la etapa indagatoria.

3.- Lo dispuesto en los artículos 18, 119, 121, 125, 126, 129 y 133 del D.F.L. N° 29, de 2004, del Ministerio de Hacienda, Estatuto Administrativo.

CONSIDERANDO:

1.- Que, del mérito de la investigación desarrollada, existen antecedentes suficientes para formular cargos en contra de {inc_nombre}, {inc_cargo}, {inc_unidad}.

2.- Que, de acuerdo a los antecedentes reunidos, se han acreditado los siguientes hechos:

{jur_hechos_acreditados}

3.- Que, los hechos descritos podrían constituir infracción a las siguientes normas:

{jur_normas_infringidas}

RESUELVO:

FORMÚLANSE los siguientes cargos a {inc_nombre}:

{jur_cargos_formulados}

NOTIFÍQUESE personalmente al inculpado, haciéndole saber que tiene un plazo de cinco días hábiles, contados desde la notificación, para presentar descargos y solicitar o presentar las pruebas que estime pertinentes.

ANÓTESE Y COMUNÍQUESE.

{fis_nombre}
Fiscal Instructor`,
blocks:[
  {id:"encabezado",title:"Datos de la Resolución",desc:"Número, fecha y ciudad",vars:[
    {key:"proc_res_numero",label:"N° Resolución",type:"text",req:true},
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true}]},
  {id:"procedimiento",title:"Procedimiento Base",desc:"Resolución original",vars:[
    {key:"res_instr_numero",label:"N° Resolución Instructora",type:"text",req:true},
    {key:"res_instr_fecha",label:"Fecha",type:"date",req:true},
    {key:"res_instr_autoridad",label:"Autoridad",type:"text",req:true}]},
  {id:"inculpado",title:"Persona Inculpada",desc:"Datos del funcionario",vars:[
    {key:"inc_nombre",label:"Nombre",type:"text",req:true},
    {key:"inc_cargo",label:"Cargo",type:"text",req:true},
    {key:"inc_unidad",label:"Unidad",type:"text",req:true}]},
  {id:"fundamentos",title:"Fundamentos",desc:"Hechos y normas",vars:[
    {key:"jur_hechos_acreditados",label:"Hechos acreditados",type:"textarea",req:true,ph:"Describir cada hecho con fecha, circunstancias y prueba"},
    {key:"jur_normas_infringidas",label:"Normas infringidas",type:"textarea",req:true,ph:"Artículos del EA u otras normas"}]},
  {id:"cargos",title:"Cargos Formulados",desc:"Texto de cargos",vars:[
    {key:"jur_cargos_formulados",label:"Cargos",type:"textarea",req:true,ph:"CARGO PRIMERO: ...\n\nCARGO SEGUNDO: ..."}]},
  {id:"fiscal",title:"Fiscal",desc:"Firma",vars:[
    {key:"fis_nombre",label:"Nombre del Fiscal",type:"text",req:true}]}
]},

// ── IND-06: Consentimiento grabación ──
"IND-06-CON":{code:"IND-06-CON",name:"Consentimiento para grabación de entrevista",type:"CON",
structure:`CONSENTIMIENTO PARA GRABACIÓN DE ENTREVISTA
PROCEDIMIENTO DISCIPLINARIO

Yo, {con_nombre}, RUN {con_rut}, en mi calidad de {con_calidad}, en el marco del procedimiento disciplinario instruido mediante Resolución Exenta N° {res_instr_numero}, de fecha {res_instr_fecha}:

DECLARO:

1.- Que he sido debidamente informado/a de que la diligencia de {con_tipo_diligencia} que se realizará el día {con_fecha_diligencia} será efectuada mediante videoconferencia a través de la plataforma {tel_plataforma}.

2.- Que he sido informado/a de que dicha diligencia será grabada en audio y video para efectos de dejar registro fidedigno de su desarrollo.

3.- Que comprendo que la grabación formará parte del expediente del procedimiento disciplinario y podrá ser utilizada como medio de prueba.

4.- Que la grabación será resguardada de manera confidencial y solo será accesible por las personas autorizadas en el procedimiento.

5.- Que CONSIENTO VOLUNTARIAMENTE en la grabación de la diligencia antes señalada.

{id_ciudad}, {id_fecha}

_______________________
{con_nombre}
RUN: {con_rut}`,
blocks:[
  {id:"compareciente",title:"Datos del Compareciente",desc:"Quien consiente",vars:[
    {key:"con_nombre",label:"Nombre completo",type:"text",req:true},
    {key:"con_rut",label:"RUN",type:"text",req:true},
    {key:"con_calidad",label:"Calidad",type:"select",req:true,opts:["denunciante","persona denunciada","testigo"]}]},
  {id:"procedimiento",title:"Procedimiento",desc:"Datos del procedimiento",vars:[
    {key:"res_instr_numero",label:"N° Resolución",type:"text",req:true},
    {key:"res_instr_fecha",label:"Fecha",type:"date",req:true}]},
  {id:"diligencia",title:"Diligencia",desc:"Tipo y fecha",vars:[
    {key:"con_tipo_diligencia",label:"Tipo",type:"select",req:true,opts:["declaración testimonial","ratificación de denuncia","declaración de persona denunciada","careo"]},
    {key:"con_fecha_diligencia",label:"Fecha diligencia",type:"date",req:true},
    {key:"tel_plataforma",label:"Plataforma",type:"text",req:true,def:"Microsoft Teams"}]},
  {id:"firma",title:"Lugar y Fecha",desc:"Para la firma",vars:[
    {key:"id_ciudad",label:"Ciudad",type:"text",req:true,def:"Punta Arenas"},
    {key:"id_fecha",label:"Fecha",type:"date",req:true}]}
]}
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function fillTemplate(tpl,vals){
  return tpl.structure.replace(/\{([^}]+)\}/g,(_,key)=>{
    const v=vals[key];
    return(v&&v.trim())?v:"[NO CONSTA]";
  });
}

function getCompletion(tpl,vals){
  let total=0,done=0,missing=[];
  tpl.blocks.forEach(b=>b.vars.filter(v=>v.req).forEach(v=>{
    total++;
    if(vals[v.key]&&vals[v.key].trim())done++;
    else missing.push(v.label);
  }));
  return{done,total,missing,pct:total?Math.round(done/total*100):0};
}

// Auto-fill from case participants
async function autoFillFromCase(caseObj){
  const vals={};
  if(!caseObj)return vals;
  vals.id_ciudad="Punta Arenas";
  vals.id_fecha=new Date().toLocaleDateString("es-CL",{day:"2-digit",month:"2-digit",year:"numeric"});
  if(caseObj.nueva_resolucion)vals.res_instr_numero=caseObj.nueva_resolucion;
  if(caseObj.fecha_resolucion)vals.res_instr_fecha=caseObj.fecha_resolucion;
  if(caseObj.fecha_denuncia)vals.den_fecha_denuncia=caseObj.fecha_denuncia;
  const fmtArr=v=>{if(!v)return"";if(Array.isArray(v))return v.join(", ");try{return JSON.parse(v).join(", ")}catch{return String(v)}};
  if(caseObj.denunciantes){const n=fmtArr(caseObj.denunciantes);if(n){vals.den_nombre=n;vals.con_nombre=n;}}
  if(caseObj.denunciados){const n=fmtArr(caseObj.denunciados);if(n){vals.inc_nombre=n;}}
  // Load participants from DB
  try{
    const{data}=await sb.from("case_participants").select("role,name,estamento,rut,carrera,dependencia,email").eq("case_id",caseObj.id);
    if(data)data.forEach(p=>{
      const r=(p.role||"").toLowerCase();
      if(r.includes("fiscal")){vals.fis_nombre=p.name;vals.fir_fiscal_nombre=p.name;if(p.estamento)vals.fis_cargo=p.estamento;vals.fir_fiscal_cargo=p.estamento||"";}
      if(r.includes("actuari")){vals.act_nombre=p.name;if(p.estamento)vals.act_cargo=p.estamento;}
      if(r.includes("denunciado")||r.includes("inculpado")||r.includes("investigado")){
        vals.inc_nombre=p.name;if(p.rut)vals.inc_rut=p.rut;
        if(p.estamento)vals.inc_cargo=p.estamento;
        if(p.dependencia)vals.inc_unidad=p.dependencia;
        if(p.email)vals.inc_email=p.email;
        if(p.carrera)vals.inc_profesion=p.carrera;
      }
      if(r.includes("denunciante")){
        vals.den_nombre=p.name;if(p.rut)vals.den_rut=p.rut;
        if(p.email)vals.den_email=p.email;
      }
      if(r.includes("testigo")){
        if(!vals.tes_nombre){vals.tes_nombre=p.name;if(p.rut)vals.tes_rut=p.rut;if(p.email)vals.tes_email=p.email;}
      }
    });
  }catch(e){console.warn("autoFill participants:",e)}
  // Load resoluciones
  try{
    const{data}=await sb.from("resoluciones").select("resolution_number,resolution_date,authority,fiscal_designado").eq("case_id",caseObj.id).order("created_at",{ascending:false}).limit(1);
    if(data?.[0]){
      const r=data[0];
      if(r.resolution_number)vals.res_instr_numero=r.resolution_number;
      if(r.resolution_date)vals.res_instr_fecha=r.resolution_date;
      if(r.authority)vals.res_instr_autoridad=r.authority;
      if(r.fiscal_designado&&!vals.fis_nombre)vals.fis_nombre=r.fiscal_designado;
    }
  }catch(e){}
  return vals;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. UI — WIZARD GUIADO POR BLOQUES
// ═══════════════════════════════════════════════════════════════════════════

let _wizState={tplCode:null,step:0,vals:{},modalidad:"presencial",linkedCase:null};

function openCuestionarios(){
  // Create view if needed
  if(!document.getElementById("viewCuestionarios")){
    const v=document.createElement("div");v.className="view";v.id="viewCuestionarios";
    v.style.cssText="flex-direction:column;overflow:hidden;";
    const w=document.getElementById("viewWelcome");
    if(w)w.parentNode.insertBefore(v,w);
    else document.querySelector("main")?.appendChild(v);
  }
  if(typeof showView==="function")showView("viewCuestionarios");
  _wizState={tplCode:null,step:0,vals:{},modalidad:"presencial",linkedCase:_wizState.linkedCase||null};
  renderCuestionariosView();
}

/* ── Estado de pestaña activa ── */
let _cuestActiveTab = 'cuestionarios';
/* ── Estado filtros mero trámite ── */
let _mtFase='all', _mtProc='all', _mtSearch='';

function switchCuestTab(tab){
  _cuestActiveTab=tab;
  renderCuestionariosView();
}

function renderCuestionariosView(){
  const el=document.getElementById("viewCuestionarios");if(!el)return;
  if(_wizState.tplCode){
    renderWizard();
    return;
  }

  const caseActive=typeof currentCase!=="undefined"&&currentCase;
  const cases=typeof allCases!=="undefined"?allCases:[];
  const linkedCase=_wizState.linkedCase||(caseActive?currentCase:null);

  const hasMT=typeof ALL_MERO_TRAMITE!=='undefined'&&ALL_MERO_TRAMITE.length>0;
  const mtCount=hasMT?ALL_MERO_TRAMITE.length:0;
  const tplCount=Object.keys(TEMPLATES).length;

  el.innerHTML=`
    <div style="padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-family:var(--font-serif);font-size:22px;font-weight:400">📋 Plantillas y Actas</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Plantillas institucionales · Actas · Resoluciones de mero trámite · Consentimientos</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-save" onclick="if(typeof openPlantillaExtractor==='function')openPlantillaExtractor();else showToast('Recarga la página para activar el extractor');" title="Genera plantillas reusables analizando con IA tus diligencias reales en casos terminados" style="font-size:11.5px;padding:6px 12px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;border-radius:7px;cursor:pointer;font-weight:600">🤖 Generar plantillas desde mis casos</button>
      </div>
    </div>

    <!-- Pestañas -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface);padding:0 14px;flex-shrink:0">
      <button class="tab ${_cuestActiveTab==='cuestionarios'?'active':''}" onclick="switchCuestTab('cuestionarios')">📋 Cuestionarios y Actas (${tplCount})</button>
      <button class="tab ${_cuestActiveTab==='merotramite'?'active':''}" onclick="switchCuestTab('merotramite')">📜 Resoluciones Mero Trámite (${mtCount})</button>
    </div>

    <div style="flex:1;overflow-y:auto;padding:16px 20px;max-width:960px;margin:0 auto;width:100%">
      <!-- Caso vinculado -->
      <div style="background:${linkedCase?'var(--gold-glow)':'rgba(245,158,11,.06)'};border:1px solid ${linkedCase?'rgba(79,70,229,.15)':'rgba(245,158,11,.2)'};border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${linkedCase
          ?`<span>📋 Expediente vinculado: <strong>${h(linkedCase.name)}</strong>${linkedCase.rol?" · "+h(linkedCase.rol):""}</span>
            <span style="font-size:10px;color:var(--green)">✓ Los datos se auto-rellenarán</span>
            <button class="btn-sm" style="margin-left:auto;font-size:10px;padding:2px 8px" onclick="cuestUnlinkCase()">Cambiar</button>`
          :`<span>⚠ Sin expediente vinculado.</span>
            ${cases.length>0
              ?`<select id="cuestCaseSelect" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface);max-width:300px">
                  <option value="">— Seleccionar expediente —</option>
                  ${cases.slice(0,30).map(c=>`<option value="${c.id}">${h(c.name)}${c.rol?" · "+h(c.rol):""}</option>`).join("")}
                </select>
                <button class="btn-sm" style="font-size:10px;padding:3px 8px" onclick="cuestLinkCase()">Vincular</button>`
              :'<span style="font-size:10px;color:var(--text-muted)">Abre un caso primero desde la lista de expedientes.</span>'}`}
      </div>

      <!-- Contenido según pestaña -->
      ${_cuestActiveTab==='cuestionarios' ? renderCuestTabCuestionarios() : renderCuestTabMeroTramite(linkedCase)}
    </div>`;
}

function renderCuestTabCuestionarios(){
  const tplList=Object.values(TEMPLATES);
  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${tplList.map(t=>`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .12s" onmouseover="this.style.borderColor='var(--gold-dim)';this.style.boxShadow='var(--shadow-sm)'" onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'" onclick="selectTemplate('${t.code}')">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:18px">${t.type==="RES"?"📜":t.type==="ACT"?"📋":"📄"}</span>
            <span style="font-size:10px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:1px 6px;border-radius:4px;font-weight:600">${h(t.code)}</span>
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${h(t.name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${t.blocks.length} bloques · ${t.blocks.reduce((a,b)=>a+b.vars.length,0)} campos</div>
        </div>`).join("")}
    </div>`;
}

function renderCuestTabMeroTramite(linkedCase){
  if(typeof getMeroTramitePlantillas!=='function'){
    return '<div style="text-align:center;padding:30px;color:var(--text-muted)">Módulo de plantillas no disponible</div>';
  }
  const filtered=getMeroTramitePlantillas({fase:_mtFase,procType:_mtProc,search:_mtSearch});

  return `
    <!-- Filtros -->
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
      <span style="font-size:10px;font-weight:600;color:var(--text-muted)">FASE:</span>
      <button class="rag-filter-btn ${_mtFase==='all'?'active':''}" onclick="_mtFase='all';renderCuestionariosView()">Todas</button>
      <button class="rag-filter-btn ${_mtFase==='indagatoria'?'active':''}" onclick="_mtFase='indagatoria';renderCuestionariosView()">Indagatoria (32)</button>
      <button class="rag-filter-btn ${_mtFase==='discusion'?'active':''}" onclick="_mtFase='discusion';renderCuestionariosView()">Discusión/Defensa (12)</button>
      <span style="font-size:10px;font-weight:600;color:var(--text-muted);margin-left:10px">TIPO:</span>
      <button class="rag-filter-btn ${_mtProc==='all'?'active':''}" onclick="_mtProc='all';renderCuestionariosView()">Todos</button>
      <button class="rag-filter-btn ${_mtProc==='IS'?'active':''}" onclick="_mtProc='IS';renderCuestionariosView()">IS</button>
      <button class="rag-filter-btn ${_mtProc==='SA'?'active':''}" onclick="_mtProc='SA';renderCuestionariosView()">SA</button>
      <button class="rag-filter-btn ${_mtProc==='PD'?'active':''}" onclick="_mtProc='PD';renderCuestionariosView()">PD</button>
    </div>

    <!-- Búsqueda -->
    <div style="margin-bottom:12px">
      <input class="search-box" style="width:100%;max-width:400px" placeholder="Buscar plantilla por nombre o código…"
        value="${h(_mtSearch)}" oninput="_mtSearch=this.value;renderCuestionariosView()"/>
    </div>

    <!-- Lista -->
    ${filtered.length===0
      ?'<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:12px">Sin plantillas para este filtro</div>'
      :`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
        ${filtered.map(p=>{
          const faseLabel=p.fase==='indagatoria'?'Indagatoria':'Discusión';
          return `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .12s"
            onmouseover="this.style.borderColor='var(--gold-dim)';this.style.boxShadow='var(--shadow-sm)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow='none'"
            onclick="useMeroTramiteTemplate('${p.code}')">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="font-size:16px">📜</span>
              <span style="font-size:9px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:1px 6px;border-radius:4px;font-weight:600;font-family:var(--font-mono)">${h(p.code)}</span>
              <span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(5,150,105,.08);color:var(--green)">${faseLabel}</span>
              <span style="font-size:9px;color:var(--text-muted)">${p.applicableTo.join(' / ')}</span>
            </div>
            <div style="font-size:13px;font-weight:600;margin-bottom:4px">${h(p.name)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${h(p.desc)}</div>
          </div>`;
        }).join("")}
      </div>`}`;
}

/* ── Usar plantilla mero trámite: previsualizar y copiar/enviar a F9 ── */
function useMeroTramiteTemplate(code){
  if(typeof ALL_MERO_TRAMITE==='undefined')return;
  const tmpl=ALL_MERO_TRAMITE.find(t=>t.code===code);
  if(!tmpl)return;
  const linkedCase=_wizState.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
  const procType=linkedCase?.tipo_procedimiento||'SA';
  const procKey=procType.toUpperCase().includes('INVESTIGACI')?'IS':procType.toUpperCase().includes('DISCIPL')?'PD':'SA';
  const resolved=typeof resolveTemplate==='function'?resolveTemplate(tmpl,procKey):tmpl.structure;

  // Mostrar preview en modal
  if(typeof openMiniModal==='function'){
    const titleEl=document.getElementById('miniModalTitle');
    const bodyEl=document.getElementById('miniModalBody');
    if(titleEl)titleEl.textContent='📜 '+tmpl.name+' ('+procKey+')';
    if(bodyEl)bodyEl.innerHTML=`
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px">${h(tmpl.desc)} · Aplica a: ${tmpl.applicableTo.join(', ')}</div>
      <div style="font-size:12px;line-height:1.7;max-height:400px;overflow-y:auto;white-space:pre-wrap;background:var(--surface2);padding:14px;border-radius:var(--radius);border:1px solid var(--border);font-family:var(--font-body)">${h(resolved)}</div>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-save" style="padding:6px 14px;font-size:12px" onclick="mtCopyToClipboard()">📋 Copiar texto</button>
        <button class="btn-save" style="padding:6px 14px;font-size:12px;background:var(--gold)" onclick="mtSendToChat()">💬 Enviar a Chat (F9)</button>
      </div>`;
    // Guardar texto para copiar/enviar
    window._mtPreviewText=resolved;
    window._mtPreviewName=tmpl.name;
    const saveBtn=document.getElementById('miniModalSaveBtn');
    if(saveBtn)saveBtn.style.display='none';
    openMiniModal();
  } else {
    // Fallback sin modal
    mtSendToChatDirect(tmpl.name,resolved);
  }
}

function mtCopyToClipboard(){
  if(window._mtPreviewText){
    navigator.clipboard.writeText(window._mtPreviewText)
      .then(()=>{ if(typeof showToast==='function')showToast('✓ Plantilla copiada al portapapeles'); })
      .catch(()=>{ if(typeof showToast==='function')showToast('⚠️ No se pudo copiar (permiso denegado)'); });
  }
}

function mtSendToChat(){
  if(typeof closeMiniModal==='function')closeMiniModal();
  mtSendToChatDirect(window._mtPreviewName||'',window._mtPreviewText||'');
}

function mtSendToChatDirect(name,text){
  // Navegar a caso + F9 y precargar
  if(typeof pickFn==='function')pickFn('F9');
  if(typeof showView==='function'&&typeof currentCase!=='undefined'&&currentCase)showView('viewCase');
  if(typeof showTab==='function')showTab('tabChat');
  setTimeout(function(){
    const inp=document.getElementById('inputBox');
    if(inp){
      inp.value='Adapta esta plantilla de resolución de mero trámite ('+name+') al expediente actual. Completa los campos {variable} con los datos reales del caso:\\n\\n'+text.substring(0,3000);
      inp.focus();
      inp.style.height='auto';
      inp.style.height=Math.min(inp.scrollHeight,200)+'px';
    }
  },300);
  if(typeof showToast==='function')showToast('📜 Plantilla cargada en F9 — envía para que Fiscalito la adapte');
}

async function selectTemplate(code){
  _wizState.tplCode=code;_wizState.step=0;_wizState.modalidad="presencial";
  const caseObj=_wizState.linkedCase||(typeof currentCase!=="undefined"?currentCase:null);
  try{
    _wizState.vals=await autoFillFromCase(caseObj);
    // Show auto-fill count
    const filled=Object.keys(_wizState.vals).filter(k=>_wizState.vals[k]&&_wizState.vals[k].trim()).length;
    if(filled>0)showToast("✓ "+filled+" campos auto-rellenados desde el expediente");
  }catch(err){
    console.warn('[cuestionarios] autoFillFromCase error:',err);
    _wizState.vals={};
    showToast("⚠ No se pudo auto-rellenar: "+err.message);
  }
  renderCuestionariosView();
}

function cuestLinkCase(){
  const sel=document.getElementById("cuestCaseSelect");
  if(!sel||!sel.value){showToast("Selecciona un expediente");return;}
  const cases=typeof allCases!=="undefined"?allCases:[];
  const c=cases.find(x=>x.id===sel.value);
  if(c){_wizState.linkedCase=c;showToast("✓ Vinculado: "+c.name);renderCuestionariosView();}
}
function cuestUnlinkCase(){_wizState.linkedCase=null;renderCuestionariosView();}

function renderWizard(){
  const el=document.getElementById("viewCuestionarios");if(!el)return;
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  const blocks=tpl.blocks;
  const step=_wizState.step;
  const comp=getCompletion(tpl,_wizState.vals);
  const isPreview=step>=blocks.length;

  el.innerHTML=`
    <div style="padding:10px 20px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;display:flex;align-items:center;gap:12px">
      <button class="btn-sm" onclick="_wizState.tplCode=null;renderCuestionariosView()">← Volver</button>
      <div>
        <div style="font-size:14px;font-weight:600">${h(tpl.name)}</div>
        <div style="font-size:10px;color:var(--text-muted)">${h(tpl.code)} · ${comp.pct}% completado · ${comp.done}/${comp.total} campos requeridos</div>
      </div>
      <div style="flex:1;height:4px;background:var(--border);border-radius:2px;margin:0 12px">
        <div style="width:${comp.pct}%;height:100%;background:var(--gold);border-radius:2px;transition:width .3s"></div>
      </div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface);padding:0 14px;overflow-x:auto;flex-shrink:0">
      ${blocks.map((b,i)=>`<div style="padding:6px 12px;font-size:11px;cursor:pointer;border-bottom:2px solid ${i===step?"var(--gold)":"transparent"};color:${i===step?"var(--gold)":"var(--text-muted)"};white-space:nowrap;font-weight:${i===step?600:400}" onclick="_wizState.step=${i};renderWizard()">${i+1}. ${h(b.title)}</div>`).join("")}
      <div style="padding:6px 12px;font-size:11px;cursor:pointer;border-bottom:2px solid ${isPreview?"var(--gold)":"transparent"};color:${isPreview?"var(--gold)":"var(--text-muted)"};white-space:nowrap;font-weight:${isPreview?600:400}" onclick="_wizState.step=${blocks.length};renderWizard()">📄 Vista previa</div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px 20px;max-width:700px;margin:0 auto;width:100%">
      ${isPreview?renderPreview(tpl):renderBlock(tpl,step)}
    </div>`;
}

function renderBlock(tpl,step){
  const block=tpl.blocks[step];if(!block)return"";
  const vars=block.vars;
  const autoFilledCount=vars.filter(v=>_wizState.vals[v.key]&&_wizState.vals[v.key].trim()).length;
  return`
    <div style="margin-bottom:12px">
      <div style="font-size:16px;font-weight:600;margin-bottom:2px">${h(block.title)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${h(block.desc)}${autoFilledCount>0?` · <span style="color:var(--green)">${autoFilledCount} campo(s) auto-rellenados</span>`:''}</div>
    </div>
    ${vars.map(v=>{
      const val=_wizState.vals[v.key]||v.def||"";
      const isReq=v.req;
      const isAutoFilled=!!_wizState.vals[v.key]&&_wizState.vals[v.key].trim();
      const borderStyle=isAutoFilled?'border-left:3px solid var(--green);padding-left:8px':'';
      if(v.type==="textarea")return`<div class="form-field" style="${borderStyle}"><label>${h(v.label)}${isReq?" *":""}${isAutoFilled?' <span style="font-size:9px;color:var(--green)">● auto</span>':''}</label><textarea id="wiz_${v.key}" rows="4" placeholder="${h(v.ph||"")}" style="width:100%;min-height:80px">${h(val)}</textarea></div>`;
      if(v.type==="select")return`<div class="form-field" style="${borderStyle}"><label>${h(v.label)}${isReq?" *":""}${isAutoFilled?' <span style="font-size:9px;color:var(--green)">● auto</span>':''}</label><select id="wiz_${v.key}">${(v.opts||[]).map(o=>`<option value="${h(o)}"${val===o?" selected":""}>${h(o)}</option>`).join("")}</select></div>`;
      return`<div class="form-field" style="${borderStyle}"><label>${h(v.label)}${isReq?" *":""}${isAutoFilled?' <span style="font-size:9px;color:var(--green)">● auto</span>':''}</label><input id="wiz_${v.key}" type="${v.type==="date"?"date":v.type==="time"?"time":"text"}" value="${h(val)}" placeholder="${h(v.ph||"")}"/></div>`;
    }).join("")}
    <div style="display:flex;gap:8px;margin-top:14px;justify-content:space-between">
      <button class="btn-cancel" onclick="wizPrev()" ${step===0?"disabled":""}>← Anterior</button>
      <button class="btn-save" onclick="wizNext()">Siguiente →</button>
    </div>`;
}

function renderPreview(tpl){
  const doc=fillTemplate(tpl,_wizState.vals);
  return`
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <button class="btn-save" onclick="downloadActa()">⬇ Descargar .txt</button>
      <button class="btn-sm" onclick="downloadActaWord()">📄 Word</button>
      <button class="btn-sm" onclick="downloadActaPDF()">📕 PDF</button>
      <button class="btn-sm" onclick="copyActa()">📋 Copiar</button>
      <button class="btn-sm" onclick="sendActaToChat()">💬 Enviar al Chat IA</button>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;font-size:13px;line-height:1.8;white-space:pre-wrap;font-family:var(--font-body);max-height:calc(100vh - 280px);overflow-y:auto" id="actaPreview">${h(doc)}</div>`;
}

// ── Wizard navigation ──
function wizSaveCurrentBlock(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  const block=tpl.blocks[_wizState.step];if(!block)return;
  block.vars.forEach(v=>{
    const el=document.getElementById("wiz_"+v.key);
    if(el)_wizState.vals[v.key]=el.value;
  });
}

function wizNext(){
  wizSaveCurrentBlock();
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  if(_wizState.step<tpl.blocks.length)_wizState.step++;
  renderWizard();
}
function wizPrev(){
  wizSaveCurrentBlock();
  if(_wizState.step>0)_wizState.step--;
  renderWizard();
}

// ── Actions ──
function downloadActa(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  const doc=fillTemplate(tpl,_wizState.vals);
  const blob=new Blob([doc],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download=tpl.code+"_"+Date.now()+".txt";a.click();URL.revokeObjectURL(a.href);
  showToast("✓ Documento descargado");
}
function downloadActaWord(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  if(typeof exportToWord!=="function"){showToast("⚠ Módulo de exportación no cargado");return;}
  exportToWord(fillTemplate(tpl,_wizState.vals),tpl.code+"_"+Date.now(),{title:tpl.name});
}
function downloadActaPDF(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  if(typeof exportToPDF!=="function"){showToast("⚠ Módulo de exportación no cargado");return;}
  exportToPDF(fillTemplate(tpl,_wizState.vals),tpl.code+"_"+Date.now(),{title:tpl.name});
}

function copyActa(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  navigator.clipboard.writeText(fillTemplate(tpl,_wizState.vals))
    .then(()=>showToast("✓ Copiado al portapapeles"))
    .catch(()=>showToast("⚠️ No se pudo copiar (permiso denegado)"));
}

function sendActaToChat(){
  const tpl=TEMPLATES[_wizState.tplCode];if(!tpl)return;
  const doc=fillTemplate(tpl,_wizState.vals);
  // Switch to case chat with the document
  if(typeof showView==="function"&&typeof showTab==="function"){
    showView("viewCase");showTab("tabChat");
    if(typeof pickFn==="function")pickFn("F2");
    setTimeout(()=>{
      const inp=document.getElementById("inputBox");
      if(inp){inp.value="Revisa y mejora la redacción de este documento:\n\n"+doc;inp.focus();}
    },300);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXPOSE API
// ═══════════════════════════════════════════════════════════════════════════

window.openCuestionarios=openCuestionarios;
window.selectTemplate=selectTemplate;
window.switchCuestTab=switchCuestTab;
window.cuestLinkCase=cuestLinkCase;
window.cuestUnlinkCase=cuestUnlinkCase;
window.wizNext=wizNext;
window.wizPrev=wizPrev;
window.downloadActa=downloadActa;
window.downloadActaWord=downloadActaWord;
window.downloadActaPDF=downloadActaPDF;
window.copyActa=copyActa;
window.sendActaToChat=sendActaToChat;

window.FISCALITO_TEMPLATES={
  TEMPLATES,
  fillTemplate,
  getCompletion,
  autoFillFromCase,
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSS
// ═══════════════════════════════════════════════════════════════════════════
(function(){
  if(document.getElementById("cuest-css"))return;
  const s=document.createElement("style");s.id="cuest-css";
  s.textContent=`
#viewCuestionarios{display:none;flex-direction:column;overflow:hidden;height:100%}
#viewCuestionarios.active{display:flex!important}
`;
  document.head.appendChild(s);
})();

console.log("%c📋 Módulo Cuestionarios y Actas cargado — Fiscalito","color:#059669;font-weight:bold");
console.log("%c   7 plantillas · Wizard guiado · Auto-llenado desde expediente","color:#666");
})();
