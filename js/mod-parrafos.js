/* =========================================================
   MOD-PARRAFOS.JS — Párrafos Modelo para Vista Fiscal (F7)
   Integrado como panel adicional en la función F7
   y como módulo autónomo en F7 / Párrafos Tipo
   ========================================================= */

/* ── CONTENIDO DE PÁRRAFOS (del módulo fuente) ── */
const PARRAFOS_CATS = [
  { id:'antecedentes',  label:'Antecedentes procesales',    color:'#4f46e5' },
  { id:'hechos',        label:'Hechos acreditados',         color:'#059669' },
  { id:'valoracion',    label:'Valoración de la prueba',    color:'#0891b2' },
  { id:'analisis',      label:'Análisis jurídico',          color:'#7c3aed' },
  { id:'sancion',       label:'Propuesta de sanción',       color:'#dc2626' },
  { id:'sobreseimiento',label:'Sobreseimiento',             color:'#ca8a04' },
  { id:'por_tanto',     label:'Por Tanto',                  color:'#1d4ed8' },
  { id:'genero',        label:'Perspectiva de género',      color:'#be185d' },
  { id:'eximentes',     label:'Eximentes y atenuantes',     color:'#15803d' },
];

const PARRAFOS_DB = [
  /* ═══════════ VISTOS ═══════════ */
  {
    id:'p_vistos_sumario',
    cat:'antecedentes',
    label:'VISTOS — Sumario Administrativo',
    text:`V I S T O S:

La denuncia presentada con fecha [FECHA_DENUNCIA] por don/doña [NOMBRE_DENUNCIANTE], [CARGO_DENUNCIANTE], en contra de don/doña [NOMBRE_DENUNCIADO], [CARGO_DENUNCIADO], por hechos constitutivos de [MATERIA_INVESTIGACIÓN]; la Resolución Exenta N°[NÚMERO_RESOLUCIÓN] de fecha [FECHA_RESOLUCIÓN], dictada por el Sr. Rector de la Universidad de Magallanes, que ordena instruir sumario administrativo y designa como Fiscal a [NOMBRE_FISCAL] y como Actuaria a [NOMBRE_ACTUARIA]; lo dispuesto en los artículos 119 y siguientes del D.F.L. N°29 de 2005, que fija el texto refundido, coordinado y sistematizado de la Ley N°18.834 sobre Estatuto Administrativo; la Ley N°19.880, que Establece Bases de los Procedimientos Administrativos; la Ley N°18.575, Orgánica Constitucional de Bases Generales de la Administración del Estado; y demás normativa aplicable.`
  },
  {
    id:'p_vistos_investigacion',
    cat:'antecedentes',
    label:'VISTOS — Investigación Sumaria',
    text:`V I S T O S:

La denuncia de fecha [FECHA_DENUNCIA] formulada por [NOMBRE_DENUNCIANTE]; la Resolución Exenta N°[NÚMERO_RESOLUCIÓN] de fecha [FECHA_RESOLUCIÓN], del Sr. Rector de la Universidad de Magallanes, que ordena instruir investigación sumaria y designa como Investigador/a a [NOMBRE_INVESTIGADOR/A]; lo dispuesto en los artículos 126 y siguientes del D.F.L. N°29 de 2005; la Ley N°19.880; y demás normativa aplicable.`
  },

  /* ═══════════ ANTECEDENTES PROCESALES ═══════════ */
  {
    id:'p_instruccion',
    cat:'antecedentes',
    label:'Instrucción del procedimiento',
    text:`Que, mediante Resolución Exenta N°[NÚMERO] de fecha [FECHA], el Sr. Rector de la Universidad de Magallanes ordenó instruir [SUMARIO ADMINISTRATIVO/INVESTIGACIÓN SUMARIA] con el objeto de investigar y establecer las eventuales responsabilidades administrativas derivadas de [DESCRIPCIÓN_HECHOS].

Que, en la referida resolución se designó como Fiscal a don/doña [NOMBRE_FISCAL], [CARGO], y como Actuaria/o a don/doña [NOMBRE_ACTUARIA], [CARGO], quienes aceptaron el encargo y se declararon no inhabilitados para instruir el presente procedimiento.`
  },
  {
    id:'p_plazos',
    cat:'antecedentes',
    label:'Plazos y prórrogas',
    text:`Que, el presente procedimiento fue instruido con fecha [FECHA_INICIO], fijándose un plazo de [20/60] días hábiles para su tramitación, conforme al artículo [126/129] del D.F.L. N°29 de 2005.

Que, mediante Resolución Exenta N°[NÚMERO_PRÓRROGA] de fecha [FECHA_PRÓRROGA], se concedió una prórroga de [DÍAS] días hábiles al plazo de investigación, atendida la complejidad de las diligencias pendientes, de conformidad con [FUNDAMENTO_LEGAL].`
  },
  {
    id:'p_notificaciones',
    cat:'antecedentes',
    label:'Notificaciones practicadas',
    text:`Que, con fecha [FECHA], se notificó personalmente al inculpado/a don/doña [NOMBRE_COMPLETO] de la resolución que ordenó instruir el presente procedimiento disciplinario, así como de los hechos materia de la investigación, conforme consta a fojas [FOJAS].

Que, asimismo, se le informó de sus derechos, en particular el de ser oído, presentar descargos y rendir prueba dentro de los plazos legales, y el de ser asistido por un abogado.`
  },

  /* ═══════════ DILIGENCIAS ═══════════ */
  {
    id:'p_declaracion_denunciante',
    cat:'hechos',
    label:'Declaración del denunciante',
    text:`Que, a fojas [FOJAS], obra la declaración prestada por don/doña [NOMBRE_DENUNCIANTE], [CARGO/RELACIÓN], de fecha [FECHA], quien señaló en lo sustancial que [RESUMEN_DECLARACIÓN].

Que, el/la declarante manifestó haber tomado conocimiento de los hechos [DIRECTAMENTE/POR REFERENCIA DE TERCEROS], indicando que [DETALLE_RELEVANTE]. Agregó que [CONTEXTO_ADICIONAL], ratificando lo expuesto en su denuncia original.`
  },
  {
    id:'p_declaracion_inculpado',
    cat:'hechos',
    label:'Declaración del inculpado/a',
    text:`Que, a fojas [FOJAS], consta la declaración del inculpado/a don/doña [NOMBRE_COMPLETO], [CARGO], prestada con fecha [FECHA], oportunidad en la que, debidamente informado/a de sus derechos y advertido/a de las consecuencias legales, señaló en lo sustancial que [RESUMEN_DECLARACIÓN].

Que, el/la inculpado/a [RECONOCIÓ/NEGÓ] los hechos que se le imputan, manifestando que [DESCARGO_PRINCIPAL]. Indicó además que [VERSIÓN_DE_LOS_HECHOS].`
  },
  {
    id:'p_declaracion_testigo',
    cat:'hechos',
    label:'Declaración testimonial',
    text:`Que, a fojas [FOJAS], rola la declaración testimonial de don/doña [NOMBRE_TESTIGO], [CARGO/RELACIÓN], prestada con fecha [FECHA], quien advertido/a del deber de verdad conforme al artículo 17 de la Ley N°19.880 y de las penas del falso testimonio, declaró en lo sustancial que [RESUMEN_DECLARACIÓN].

Que, el/la testigo manifestó tener conocimiento [DIRECTO/INDIRECTO] de los hechos, señalando que [DETALLE_RELEVANTE].`
  },
  {
    id:'p_oficio_informe',
    cat:'hechos',
    label:'Oficio o informe solicitado',
    text:`Que, a fojas [FOJAS], obra el Oficio N°[NÚMERO] de fecha [FECHA], mediante el cual esta Fiscalía solicitó a [DESTINATARIO/UNIDAD] que informara sobre [MATERIA_CONSULTADA].

Que, mediante [OFICIO/MEMORÁNDUM/CORREO] de fecha [FECHA_RESPUESTA], que rola a fojas [FOJAS_RESPUESTA], [DESTINATARIO] informó que [CONTENIDO_RESPUESTA], antecedente que resulta relevante para acreditar [HECHO_QUE_ACREDITA].`
  },
  {
    id:'p_prueba_documental',
    cat:'hechos',
    label:'Prueba documental incorporada',
    text:`Que, a fojas [FOJAS_INICIO] a [FOJAS_FIN], se incorporó al expediente [DESCRIPCIÓN_DOCUMENTO: correos electrónicos / registros de asistencia / informes / contratos / resoluciones], los que dan cuenta de [CONTENIDO_RELEVANTE].

Que, del análisis de dicha prueba documental se desprende que [CONCLUSIÓN_PROBATORIA], lo que resulta concordante con [OTROS_ANTECEDENTES] y permite acreditar [HECHO_QUE_ACREDITA].`
  },

  /* ═══════════ CARGOS Y DESCARGOS ═══════════ */
  {
    id:'p_formulacion_cargos',
    cat:'hechos',
    label:'Formulación de cargos',
    text:`Que, con fecha [FECHA], mediante Resolución que rola a fojas [FOJAS], esta Fiscalía formuló cargos en contra de don/doña [NOMBRE_COMPLETO], imputándole [NÚMERO] cargo(s):

CARGO PRIMERO: [DESCRIPCIÓN_CARGO_1], infringiendo el artículo [ARTÍCULO] del D.F.L. N°29 de 2005.
[CARGO SEGUNDO: [DESCRIPCIÓN_CARGO_2], infringiendo el artículo [ARTÍCULO] del D.F.L. N°29 de 2005.]

Que, la referida resolución fue notificada al inculpado/a con fecha [FECHA_NOTIFICACIÓN], conforme consta a fojas [FOJAS_NOTIFICACIÓN], concediéndosele el plazo de cinco días hábiles para presentar sus descargos conforme al artículo 133 del Estatuto Administrativo.`
  },
  {
    id:'p_descargos',
    cat:'hechos',
    label:'Descargos del inculpado/a',
    text:`Que, con fecha [FECHA], dentro del plazo legal, el/la inculpado/a don/doña [NOMBRE_COMPLETO] presentó sus descargos, los que rolan a fojas [FOJAS], señalando en lo medular que [RESUMEN_DESCARGOS].

Que, respecto del Cargo Primero, el/la inculpado/a argumentó que [ARGUMENTO_DEFENSA_1].
[Que, respecto del Cargo Segundo, manifestó que [ARGUMENTO_DEFENSA_2].]

Que, asimismo, el/la inculpado/a [OFRECIÓ/NO OFRECIÓ] rendir prueba dentro del término probatorio de [DÍAS] días que le fue conferido.`
  },
  {
    id:'p_sin_descargos',
    cat:'hechos',
    label:'Inculpado/a no presenta descargos',
    text:`Que, no obstante haber sido debidamente notificado/a de la formulación de cargos con fecha [FECHA_NOTIFICACIÓN], conforme consta a fojas [FOJAS], el/la inculpado/a don/doña [NOMBRE_COMPLETO] no presentó descargos dentro del plazo legal de cinco días hábiles establecido en el artículo 133 del D.F.L. N°29 de 2005.

Que, la falta de presentación de descargos no impide la prosecución del procedimiento ni exime al fiscal de la obligación de ponderar la totalidad de los antecedentes obrantes en el expediente.`
  },

  /* ═══════════ HECHOS ACREDITADOS ═══════════ */
  {
    id:'p_hechos_acreditados',
    cat:'hechos',
    label:'Hechos acreditados',
    text:`Que, del mérito de la investigación practicada, de las diligencias realizadas y de la prueba rendida en autos, esta Fiscalía tiene por acreditados los siguientes hechos:

PRIMERO: Que, con fecha [FECHA], don/doña [NOMBRE_COMPLETO], en su calidad de [CARGO], [DESCRIPCIÓN_HECHO_1], según consta de [MEDIO_PROBATORIO] que rola a fojas [FOJAS].

[SEGUNDO: Que, [DESCRIPCIÓN_HECHO_2], lo que se acredita con [MEDIO_PROBATORIO] de fojas [FOJAS].]

Que, los hechos descritos se encuentran debidamente acreditados por los medios de prueba señalados, los que apreciados conforme a las reglas de la sana crítica, producen convicción suficiente en esta Fiscalía.`
  },

  /* ═══════════ VALORACIÓN DE LA PRUEBA ═══════════ */
  {
    id:'p_valoracion',
    cat:'valoracion',
    label:'Valoración de la prueba',
    text:`Que, en cuanto a la prueba rendida en autos, esta Fiscalía la valora conforme a la sana crítica, esto es, mediante la aplicación de los principios de la lógica, las máximas de la experiencia y los conocimientos científicamente afianzados, de conformidad con el artículo 35 de la Ley N°19.880.

Que, del examen de la prueba rendida, se aprecia que los testimonios de los testigos [NOMBRES_TESTIGOS] son concordantes entre sí y con los antecedentes documentales del expediente, lo que otorga plena credibilidad a sus declaraciones.

Que, en contraste, los descargos del inculpado/a no han sido respaldados por elementos probatorios suficientes que permitan desvirtuar los hechos acreditados por la investigación, no siendo suficiente la mera negativa del imputado para enervar los cargos formulados en su contra.`
  },
  {
    id:'p_valoracion_insuficiente',
    cat:'valoracion',
    label:'Prueba insuficiente para acreditar',
    text:`Que, no obstante las diligencias practicadas, esta Fiscalía estima que la prueba rendida resulta insuficiente para acreditar la responsabilidad administrativa del inculpado/a en los hechos investigados.

Que, en efecto, las declaraciones testimoniales resultan [CONTRADICTORIAS/INSUFICIENTES/DE OÍDAS], la prueba documental no permite establecer con certeza la participación del inculpado/a, y no se han reunido otros elementos probatorios que permitan formar convicción.

Que, conforme al principio de inocencia que informa el derecho disciplinario, la falta de prueba suficiente impide formular cargos y obliga a proponer el sobreseimiento del procedimiento.`
  },

  /* ═══════════ ANÁLISIS JURÍDICO ═══════════ */
  {
    id:'p_gravedad',
    cat:'analisis',
    label:'Gravedad de la infracción',
    text:`Que, respecto a la gravedad de la infracción imputada, cabe señalar que la conducta acreditada constituye una vulneración [GRAVE/LEVE/GRAVÍSIMA] a los principios de [PROBIDAD/BUENA FE/EFICIENCIA] que deben regir la actuación de los funcionarios públicos.

Que, la gravedad de los hechos se ve agravada por [CIRCUNSTANCIA_AGRAVANTE: la posición jerárquica del funcionario / el carácter reiterado de la conducta / el daño causado a la institución / la posición de confianza ejercida], lo que amerita una sanción proporcional a dicha gravedad.

Que, lo anterior, conforme a la doctrina de la Contraloría General de la República, constituye suficiente mérito para proponer la aplicación de la sanción disciplinaria solicitada.`
  },
  {
    id:'p_subsuncion',
    cat:'analisis',
    label:'Subsunción jurídica (hechos en norma)',
    text:`Que, los hechos acreditados en la presente investigación configuran una infracción al artículo [ARTÍCULO] del D.F.L. N°29 de 2005, que establece [CONTENIDO_NORMA], toda vez que la conducta desplegada por el/la inculpado/a consistió en [DESCRIPCIÓN_CONDUCTA], lo que contraviene directamente el deber funcionario [DEBER_INFRINGIDO].

Que, en efecto, la conducta acreditada se subsume en la hipótesis normativa descrita, pues [RAZONAMIENTO_SUBSUNCIÓN], configurándose así la infracción administrativa que da mérito a la aplicación de la sanción propuesta.`
  },
  {
    id:'p_analisis_defensas',
    cat:'analisis',
    label:'Análisis de defensas del inculpado/a',
    text:`Que, en relación con los descargos presentados por el/la inculpado/a, esta Fiscalía procede a analizarlos en los siguientes términos:

Que, respecto de la alegación de [DEFENSA_1], cabe señalar que [ANÁLISIS_CONTRAARGUMENTO_1], razón por la cual dicha defensa no logra desvirtuar los cargos formulados.

[Que, en cuanto a la alegación de [DEFENSA_2], si bien [RECONOCIMIENTO_PARCIAL], ello no resulta suficiente para eximir de responsabilidad al inculpado/a, por cuanto [FUNDAMENTO].]

Que, en consecuencia, los descargos presentados no logran enervar los cargos formulados ni desvirtuar los hechos acreditados por la investigación.`
  },

  /* ═══════════ EXIMENTES Y ATENUANTES ═══════════ */
  {
    id:'p_atenuantes',
    cat:'eximentes',
    label:'Atenuantes y agravantes (Art. 120 EA)',
    text:`Que, para determinar la sanción procedente, se han analizado las circunstancias modificatorias de responsabilidad concurrentes en el presente caso, conforme al artículo 120 del D.F.L. N°29 de 2005.

ATENUANTES:
- [La conducta funcionaria anterior del inculpado/a ha sido irreprochable, sin registrar anotaciones desfavorables en su hoja de vida]
- [La ambigüedad normativa existente en el período de los hechos generó incertidumbre razonable en el funcionario]
- [El funcionario colaboró con la investigación y reconoció los hechos oportunamente]

AGRAVANTES:
- [La posición jerárquica del funcionario implicaba una mayor responsabilidad institucional]
- [La conducta tuvo carácter reiterado, lo que denota dolo o negligencia inexcusable]
- [Se causó perjuicio concreto a la institución o a terceros]`
  },
  {
    id:'p_eximente',
    cat:'eximentes',
    label:'Eximente de responsabilidad',
    text:`Que, del análisis de los antecedentes del expediente, se advierte la concurrencia de una circunstancia eximente de responsabilidad administrativa, toda vez que [DESCRIPCIÓN_EXIMENTE: el funcionario actuó en cumplimiento de una orden superior / existió caso fortuito o fuerza mayor / la conducta se realizó en estado de necesidad].

Que, en virtud de lo expuesto, y no obstante haberse acreditado la materialidad de los hechos investigados, esta Fiscalía estima que no procede aplicar sanción disciplinaria, proponiendo el sobreseimiento definitivo del procedimiento.`
  },

  /* ═══════════ SANCIÓN ═══════════ */
  {
    id:'p_prop_sancion',
    cat:'sancion',
    label:'Propuesta de sanción',
    text:`Que, habiéndose acreditado la responsabilidad administrativa de don/doña [NOMBRE_COMPLETO] en los hechos investigados, esta Fiscalía concluye que la conducta desplegada configura una infracción [GRAVE/GRAVÍSIMA/LEVE] a los deberes funcionarios establecidos en el artículo [ARTÍCULO] del Estatuto Administrativo.

Que, para la determinación de la sanción procedente, se han tenido en especial consideración la gravedad de los hechos acreditados, el daño causado a la institución y a terceros, la conducta funcionaria anterior del inculpado/a, y las demás circunstancias atenuantes y agravantes concurrentes.

Que, en mérito de lo expuesto, esta Fiscalía propone sancionar a don/doña [NOMBRE_COMPLETO] con la medida disciplinaria de [SANCIÓN], de conformidad con lo establecido en el artículo 121 letra "[LETRA]" del DFL N°29 de 2005.`
  },
  {
    id:'p_prop_sancion_destitucion',
    cat:'sancion',
    label:'Propuesta de destitución',
    text:`Que, atendida la extrema gravedad de los hechos acreditados, que configuran una infracción gravísima a los deberes funcionarios, esta Fiscalía estima que la única sanción proporcionada a la entidad de la falta cometida es la destitución del funcionario.

Que, la conducta de don/doña [NOMBRE_COMPLETO] constituye una vulneración al principio de probidad administrativa, contemplado en el artículo 61 letra g) del D.F.L. N°29 de 2005, en relación con el artículo 84 del mismo cuerpo legal, lo que se encuentra sancionado con destitución conforme al artículo 125 del Estatuto Administrativo.

Que, en mérito de lo expuesto, y sin perjuicio de la facultad de la autoridad de aplicar una medida disciplinaria de menor entidad, se propone la destitución del funcionario conforme al artículo 121 letra d) del D.F.L. N°29 de 2005.`
  },

  /* ═══════════ SOBRESEIMIENTO ═══════════ */
  {
    id:'p_prescripcion',
    cat:'sobreseimiento',
    label:'Prescripción de la acción disciplinaria',
    text:`Que, en lo que respecta a la prescripción de la acción disciplinaria, cabe señalar que conforme al artículo 157 del D.F.L. N°29 de 2005, la acción disciplinaria prescribe en el plazo de cuatro años contados desde la fecha en que se hubiere incurrido en la falta.

Que, del análisis de los antecedentes del expediente, se advierte que los hechos investigados habrían ocurrido el [FECHA_HECHOS], habiendo transcurrido más de cuatro años desde dicha fecha hasta [FECHA_RESOLUCION_INCOATORIA], fecha en que se dictó la resolución que ordenó instruir el presente procedimiento disciplinario.

Que, en consecuencia, habiendo operado la prescripción de la acción disciplinaria, esta Fiscalía propone el sobreseimiento definitivo del procedimiento, de conformidad con el artículo 157 del Estatuto Administrativo.`
  },
  {
    id:'p_sob_inexistencia',
    cat:'sobreseimiento',
    label:'Sobreseimiento por inexistencia de hechos',
    text:`Que, practicadas las diligencias de investigación, esta Fiscalía ha llegado a la convicción de que los hechos denunciados no se han verificado en la forma descrita, toda vez que [FUNDAMENTO].

Que, en consecuencia, no existiendo mérito para formular cargos por inexistencia de los hechos materia de la investigación, esta Fiscalía propone el sobreseimiento definitivo del presente procedimiento disciplinario.`
  },
  {
    id:'p_sob_falta_prueba',
    cat:'sobreseimiento',
    label:'Sobreseimiento por falta de prueba',
    text:`Que, no obstante la materialidad de los hechos investigados, la prueba rendida en autos resulta insuficiente para acreditar la responsabilidad administrativa del inculpado/a, toda vez que [FUNDAMENTO: los testimonios son contradictorios / la prueba es indirecta / no existe prueba documental que corrobore].

Que, conforme al principio de presunción de inocencia que informa el derecho administrativo disciplinario, la insuficiencia probatoria impide formular cargos, por lo que se propone el sobreseimiento definitivo del procedimiento.`
  },

  /* ═══════════ POR TANTO ═══════════ */
  {
    id:'p_por_tanto_sancion',
    cat:'por_tanto',
    label:'Por Tanto — Sanción',
    text:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en los artículos 121 y 122 del D.F.L. N°29 del año 2005, y habiéndose acreditado la responsabilidad administrativa de don/doña [NOMBRE_COMPLETO], se propone al Sr. Rector, salvo su superior resolución:

Sancionar a don/doña [NOMBRE_COMPLETO], cédula de identidad N°[RUT], [CARGO_ESTAMENTO], con la medida disciplinaria contemplada en el artículo 121 letra "[LETRA]" del D.F.L. N°29 de 2005, [DESCRIPCIÓN_SANCIÓN].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución. Es todo cuanto tengo por informar.`
  },
  {
    id:'p_por_tanto_sob',
    cat:'por_tanto',
    label:'Por Tanto — Sobreseimiento',
    text:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en el D.F.L. N°29 del año 2005, y [FUNDAMENTO_SOBRESEIMIENTO], se propone al Sr. Rector, salvo su superior resolución:

SOBRESEER [DEFINITIVA/TEMPORALMENTE] el presente procedimiento disciplinario [NÚMERO_ROL] instruido en contra de don/doña [NOMBRE_COMPLETO], cédula de identidad N°[RUT], [CARGO], por [CAUSAL_SOBRESEIMIENTO].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución. Es todo cuanto tengo por informar.`
  },
  {
    id:'p_por_tanto_art129',
    cat:'por_tanto',
    label:'Por Tanto — Elevación Art. 129 inc. 2°',
    text:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que, habiéndose acreditado en el curso de la investigación que la eventual responsabilidad podría afectar a funcionarios de grado jerárquico superior al del Fiscal infrascrito, y en virtud de lo dispuesto en el artículo 129 inciso 2° del D.F.L. N°29 de 2005, se propone al Sr. Rector, salvo su superior resolución:

Elevar los antecedentes del presente procedimiento disciplinario a la autoridad competente para que disponga la designación de un fiscal de grado igual o superior al del presunto responsable, a fin de dar cumplimiento a lo prevenido en la norma citada.

Remítanse los antecedentes al Sr. Rector para su Superior Resolución.`
  },

  /* ═══════════ PERSPECTIVA DE GÉNERO ═══════════ */
  {
    id:'p_genero',
    cat:'genero',
    label:'Perspectiva de género',
    text:`Que, atendida la naturaleza de los hechos denunciados, que dicen relación con conductas constitutivas de [TIPO_VIOLENCIA], esta Fiscalía ha incorporado en su análisis la perspectiva de género conforme a la normativa vigente.

Que, en particular, se ha tenido en consideración: la Ley N°21.369 (acoso sexual en IES), la Ley N°21.643 (Ley Karin), y el Protocolo de Género UMAG (Decreto N°30/SU/2022).

Que, en la valoración de la prueba, se ha considerado el contexto de asimetría de poder entre las partes, las dinámicas propias de las situaciones de violencia de género, y la dificultad probatoria inherente a este tipo de conductas.

Que, se ha evitado incurrir en estereotipos de género que pudieran afectar la objetividad del análisis.`
  },
  {
    id:'p_genero_ley21369',
    cat:'genero',
    label:'Aplicación Ley 21.369 (Acoso en IES)',
    text:`Que, los hechos investigados se encuentran comprendidos en el ámbito de aplicación de la Ley N°21.369, que establece medidas contra el acoso sexual, la violencia y la discriminación de género en el ámbito de la educación superior, toda vez que [DESCRIPCIÓN_VÍNCULO_CON_LA_LEY].

Que, conforme al artículo [ARTÍCULO] de la referida ley, la Universidad de Magallanes tiene la obligación de [OBLIGACIÓN_INSTITUCIONAL], debiendo garantizar la protección de la víctima y la sanción de las conductas constitutivas de [TIPO_CONDUCTA].

Que, en la tramitación del presente procedimiento se han observado las directrices y protocolos institucionales dictados en cumplimiento de la Ley N°21.369, en particular el Protocolo de Actuación aprobado mediante Decreto N°[NÚMERO_DECRETO].`
  },
];

/* ── ESTADO DEL MÓDULO ── */
const parrafos = {
  selected: [],       // párrafos seleccionados para insertar
  customText: '',
  generating: false,
};

/* ── INTEGRACIÓN: openBiblioteca('parrafos') ORIGINAL ── */
// Override the original openBiblioteca function call for párrafos
const _origOpenBibliotecaParrafos = typeof openBiblioteca === 'function' ? openBiblioteca : null;

/* ── PANEL DE PÁRRAFOS EN F7 ── */
function buildParrafosPanel(caseContext) {
  const selectedHtml = parrafos.selected.length
    ? `<div class="parr-selected-header">📋 Párrafos seleccionados (${parrafos.selected.length})</div>
       <div class="parr-selected-list">
         ${parrafos.selected.map((id, idx) => {
           const p = PARRAFOS_DB.find(x => x.id === id);
           return p ? `<div class="parr-sel-item">
             <div class="parr-sel-num">${idx + 1}</div>
             <div class="parr-sel-label">${esc(p.label)}</div>
             <div style="display:flex;gap:4px">
               <button class="btn-sm" onclick="parrafosUseInChat('${id}')">→ Chat</button>
               <button class="btn-del" onclick="parrafosRemove('${idx}')">✕</button>
             </div>
           </div>` : '';
         }).join('')}
       </div>
       <button class="btn-save" style="width:100%;margin-bottom:8px" onclick="parrafosInsertAll()">✍️ Insertar todos en F7 →</button>
       <button class="btn-sm" style="width:100%;margin-bottom:8px;background:var(--surface2)" onclick="parrafosSaveAsNota()">📝 Guardar selección como Nota del caso</button>`
    : '';

  return `<div style="width:100%;max-width:700px">
    <div class="parr-header">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">📝 Párrafos Modelo — Vista Fiscal</div>
      <div style="font-size:11.5px;color:var(--text-dim)">Selecciona párrafos tipo para incorporar a tu informe. Los placeholders [MAYÚSCULAS] deben reemplazarse con los datos del caso.</div>
    </div>
    ${selectedHtml}
    <div class="parr-ai-section">
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim);font-family:'DM Mono',monospace;margin-bottom:6px">Generar párrafo con IA</div>
      <div style="display:flex;gap:7px">
        <input id="parrAiInput" class="search-box" style="flex:1" placeholder="Ej: párrafo sobre prescripción con fecha 15-03-2022…"/>
        <button class="btn-save" onclick="generateParrafoIA()" style="padding:6px 12px;white-space:nowrap" ${parrafos.generating?'disabled':''}>
          ${parrafos.generating ? '⏳' : '✨ Generar'}
        </button>
      </div>
    </div>
    ${PARRAFOS_CATS.map(cat => {
      const catParrs = PARRAFOS_DB.filter(p => p.cat === cat.id);
      if (!catParrs.length) return '';
      return `<div class="parr-cat-section">
        <div class="parr-cat-label" style="border-color:${cat.color};color:${cat.color}">${cat.label}</div>
        ${catParrs.map(p => `
          <div class="parr-item ${parrafos.selected.includes(p.id) ? 'selected' : ''}" onclick="toggleParrafo('${p.id}')">
            <div class="parr-item-header">
              <span class="parr-item-label">${esc(p.label)}</span>
              <div style="display:flex;gap:5px">
                <button class="btn-sm" onclick="event.stopPropagation();parrafosUseInChat('${p.id}')" title="Insertar en chat">→ Chat</button>
                <button class="btn-sm" onclick="event.stopPropagation();copyParrafo('${p.id}')" title="Copiar">📋</button>
                <button class="btn-sm" onclick="event.stopPropagation();parrafoSaveOneAsNota('${p.id}')" title="Guardar como nota">📝</button>
              </div>
            </div>
            <div class="parr-item-preview">${esc(p.text.substring(0, 180))}…</div>
          </div>`).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

/* ── ACCIONES DE PÁRRAFOS ── */
function toggleParrafo(id) {
  const idx = parrafos.selected.indexOf(id);
  if (idx === -1) parrafos.selected.push(id);
  else parrafos.selected.splice(idx, 1);
  // Re-render panel if visible
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);
}

function parrafosRemove(idx) {
  parrafos.selected.splice(idx, 1);
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);
}

function parrafosUseInChat(id) {
  const p = PARRAFOS_DB.find(x => x.id === id);
  if (!p) return;
  // Navigate to chat tab and prefill
  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = `Adapta el siguiente párrafo modelo al expediente${currentCase ? ' ' + currentCase.name : ''}. Reemplaza los placeholders con los datos reales:\n\n${p.text}`;
  }
  // Make sure we're in F7
  if (activeFn !== 'F7') pickFn && pickFn('F7');
  showTab && showTab('tabChat');
  showToast(`✓ Párrafo "${p.label}" enviado al chat`);
}

function parrafosInsertAll() {
  const texts = parrafos.selected.map(id => {
    const p = PARRAFOS_DB.find(x => x.id === id);
    return p ? `## ${p.label}\n\n${p.text}` : '';
  }).filter(Boolean).join('\n\n---\n\n');

  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = `Adapta e integra los siguientes párrafos modelo al expediente${currentCase ? ' ' + currentCase.name : ''}. Reemplaza todos los placeholders [MAYÚSCULAS] con los datos reales del caso y redacta el texto refundido:\n\n${texts}`;
  }
  if (activeFn !== 'F7') pickFn && pickFn('F7');
  showTab && showTab('tabChat');
  showToast(`✓ ${parrafos.selected.length} párrafos enviados al chat`);
}

function copyParrafo(id) {
  const p = PARRAFOS_DB.find(x => x.id === id);
  if (!p) return;
  navigator.clipboard.writeText(p.text).then(() => showToast(`✓ "${p.label}" copiado`));
}

async function generateParrafoIA() {
  const input = document.getElementById('parrAiInput');
  const query = input?.value.trim();
  if (!query) return;

  parrafos.generating = true;
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);

  try {
    const ctx = currentCase ? `Expediente: ${currentCase.name}${currentCase.description ? ' · ' + currentCase.description.substring(0, 200) : ''}` : '';
    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const _token = window.session?.access_token || (await window.sb?.auth.getSession())?.data?.session?.access_token || '';
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': _token },
        body: JSON.stringify({
          model: typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: `Eres Fiscalito, asistente jurídico de la Fiscalía General de la Universidad de Magallanes. Generas párrafos modelo para Vistas Fiscales e Informes de Investigadora en procedimientos disciplinarios (DFL N°29/2005, Ley 19.880, Ley 18.575).

FORMATO OBLIGATORIO:
- Cada párrafo comienza con "Que," (considerando numerado)
- Lenguaje formal institucional, impersonal
- Citas normativas precisas (artículo, ley, decreto)
- Expresiones: "consta en autos", "obra en el expediente", "rola a fojas", "según da cuenta"
- Usa placeholders [MAYÚSCULAS] para datos específicos del caso
- NO uses markdown, emojis ni lenguaje coloquial
- Genera párrafos completos de 3-5 oraciones mínimo por considerando`,
          messages: [{ role: 'user', content: `${ctx ? 'CONTEXTO DEL EXPEDIENTE: ' + ctx + '\n\n' : ''}Genera el siguiente párrafo modelo para Vista Fiscal: ${query}` }]
        }),
        signal:_ctrl.signal
      });
      if(!resp.ok) throw new Error('Error '+resp.status);
      const data = await resp.json();
      const text = (data.content&&data.content[0]?.text) || data.reply || '';

      // Add to custom list
      const newParr = {
        id: 'custom_' + Date.now(),
        cat: 'analisis',
        label: query.substring(0, 60),
        text,
      };
      PARRAFOS_DB.push(newParr);
      parrafos.selected.push(newParr.id);
      showToast('✓ Párrafo generado y agregado');
      if (input) input.value = '';
    }finally{
      clearTimeout(_tout);
    }
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    parrafos.generating = false;
    const panel2 = document.getElementById('parrafosPanel');
    if (panel2) panel2.innerHTML = buildParrafosPanel(currentCase);
  }
}

function parrafosSaveAsNota() {
  if (!currentCase || !window.sb || !window.session) return showToast('⚠️ Selecciona un caso primero');
  if (!parrafos.selected.length) return showToast('⚠️ Selecciona al menos un párrafo');

  const texts = parrafos.selected.map(id => {
    const p = PARRAFOS_DB.find(x => x.id === id);
    return p ? `## ${p.label}\n\n${p.text}` : '';
  }).filter(Boolean).join('\n\n---\n\n');

  const title = 'Párrafos Modelo — ' + parrafos.selected.length + ' párrafos';

  sb.from('case_notes').insert({
    case_id: currentCase.id,
    user_id: session.user.id,
    title: title,
    content: texts,
    source: 'parrafo_modelo'
  }).then(({error}) => {
    if (error) return showToast('❌ Error: ' + error.message);
    showToast('✓ Párrafos guardados como nota del caso');
    if (typeof loadNotas === 'function') loadNotas();
  });
}

function parrafoSaveOneAsNota(id) {
  if (!currentCase || !window.sb || !window.session) return showToast('⚠️ Selecciona un caso primero');
  const p = PARRAFOS_DB.find(x => x.id === id);
  if (!p) return;

  sb.from('case_notes').insert({
    case_id: currentCase.id,
    user_id: session.user.id,
    title: 'Párrafo: ' + p.label,
    content: p.text,
    source: 'parrafo_modelo'
  }).then(({error}) => {
    if (error) return showToast('❌ Error: ' + error.message);
    showToast('✓ Párrafo guardado como nota');
    if (typeof loadNotas === 'function') loadNotas();
  });
}

/* ── INYECCIÓN EN openBiblioteca('parrafos') ── */
// This patches the original openBiblioteca so 'parrafos' tab loads this panel
document.addEventListener('DOMContentLoaded', () => {
  const origOB = window.openBiblioteca;
  window.openBiblioteca = function(tipo) {
    if (tipo === 'parrafos') {
      document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
      event?.currentTarget?.classList.add('active');
      currentCase = window.currentCase || null;
      // Open biblioteca view and switch to parrafos tab
      if (typeof showView === 'function') showView('viewBiblioteca');
      if (typeof biblioteca !== 'undefined') {
        biblioteca.activeTab = 'parrafos';
        const body = document.getElementById('bibBody');
        if (body) body.innerHTML = renderBibParrafos();
        document.querySelectorAll('.bib-tab').forEach((t, i) => {
          const tabs = ['documentos','normas','parrafos','chat'];
          t.classList.toggle('active', tabs[i] === 'parrafos');
        });
      }
      return;
    }
    if (origOB) origOB.call(this, tipo);
  };
});

/* ── PANEL F7 — AGREGAR BOTÓN DE PÁRRAFOS ── */
// Adds a "Párrafos Modelo" toggle button to F7 panel
const _origF7Panel = null;

document.addEventListener('DOMContentLoaded', () => {
  const origSFP = window.showFnPanel;
  window.showFnPanel = function(code) {
    // Call original first
    if (code !== 'F11') { // F11 handled by transcripcion module
      origSFP && origSFP.call(this, code);
    }
    // After F7 renders, append párrafos button
    if (code === 'F7') {
      setTimeout(() => {
        const panel = document.getElementById('fnPanel');
        if (!panel) return;
        // Add párrafos section at end of panel
        const parrafosToggle = document.createElement('div');
        parrafosToggle.style.cssText = 'width:100%;max-width:700px;margin-top:4px;';
        parrafosToggle.innerHTML = `
          <button class="fn-panel-link" style="width:100%;justify-content:space-between;cursor:pointer"
            onclick="toggleParrafosPanel(this)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px">📝</span>
              <span style="font-size:11.5px;color:var(--text-dim)">Párrafos Modelo para Vista Fiscal</span>
            </div>
            <span style="font-size:11px;color:var(--gold);font-weight:500">Ver párrafos →</span>
          </button>
          <div id="parrafosPanel" style="display:none"></div>`;
        panel.appendChild(parrafosToggle);
      }, 50);
    }
  };
});

function toggleParrafosPanel(btn) {
  const panel = document.getElementById('parrafosPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) panel.innerHTML = buildParrafosPanel(currentCase);
  btn.querySelector('span:last-child').textContent = isOpen ? 'Ver párrafos →' : 'Ocultar párrafos ↑';
}

/* ── ESTILOS ── */
(function injectParrafosCSS() {
  const style = document.createElement('style');
  style.textContent = `
.parr-header{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;}
.parr-ai-section{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;}
.parr-cat-section{margin-bottom:14px;}
.parr-cat-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:3px 0;border-bottom:2px solid;margin-bottom:6px;font-family:'DM Mono',monospace;}
.parr-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:9px 12px;margin-bottom:5px;cursor:pointer;transition:all .15s;}
.parr-item:hover{border-color:var(--gold-dim);}
.parr-item.selected{background:var(--gold-glow);border-color:var(--gold-dim);}
.parr-item-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.parr-item-label{font-size:12px;font-weight:500;color:var(--text);}
.parr-item-preview{font-size:10.5px;color:var(--text-muted);line-height:1.5;}
.parr-selected-header{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim);font-family:'DM Mono',monospace;margin-bottom:6px;}
.parr-selected-list{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;}
.parr-sel-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);}
.parr-sel-num{width:18px;height:18px;border-radius:50%;background:var(--gold);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.parr-sel-label{flex:1;font-size:11.5px;font-weight:500;color:var(--gold);}
`;
  document.head.appendChild(style);
})();
