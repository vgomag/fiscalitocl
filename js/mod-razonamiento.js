// ============================================================================
// MÓDULO DE RAZONAMIENTO JURÍDICO — FISCALITO (mod-razonamiento.js)
// Prompts, régimen normativo, estilo escritura, párrafos modelo, validación
// ============================================================================
(function(){
"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// 1. DIRECTIVA DE ESTILO DE ESCRITURA HUMANIZADA
// ═══════════════════════════════════════════════════════════════════════════

const HUMAN_WRITING_STYLE=`

## DIRECTIVA DE ESTILO DE ESCRITURA (OBLIGATORIA)

Tu escritura DEBE ser completamente indistinguible de la de un profesional humano. Sigue estas reglas:

### Estructura y fluidez
- Varía la longitud de las oraciones: combina frases cortas y directas con oraciones compuestas más elaboradas.
- NO uses listas con viñetas ni numeración excesiva. Prefiere párrafos con conectores naturales (sin embargo, no obstante, en este sentido, cabe señalar que, a mayor abundamiento).
- Evita estructuras repetitivas. Cada párrafo debe tener una cadencia diferente.
- Usa transiciones orgánicas entre ideas, no encabezados genéricos.

### Vocabulario y tono
- Emplea vocabulario jurídico-administrativo chileno preciso pero sin artificialidad.
- Varía los sinónimos y conectores: no repitas la misma palabra o frase en párrafos cercanos.
- Incluye expresiones propias del lenguaje administrativo chileno (v.gr., "en lo pertinente", "al tenor de lo expuesto", "conforme a lo prevenido", "acorde con lo prescrito").
- Evita ABSOLUTAMENTE: "Es importante destacar que...", "Cabe mencionar que...", "En este contexto...", "A continuación se presenta...", "En resumen...", "Es fundamental...", "Vale la pena señalar...", "En conclusión...", inicio con "Además," o "Por otro lado,", uso excesivo de "Sin embargo," al inicio.

### Naturalidad
- Introduce pequeñas imperfecciones estilísticas naturales: alguna oración más larga de lo ideal, una subordinada adicional.
- No seas excesivamente organizado. Los humanos no escriben con simetría perfecta.
- Varía el nivel de formalidad ligeramente a lo largo del texto.
- Cuando cites normativa, hazlo de forma integrada en el texto, no como listados separados.

### Prohibiciones absolutas
- NUNCA uses emojis.
- NUNCA abras con "¡Claro!" "¡Por supuesto!" "¡Excelente pregunta!".
- NUNCA cierres con "¿Hay algo más en lo que pueda ayudarte?".
- Tu output debe leerse como si lo hubiera escrito un fiscal, abogado o funcionario público con experiencia.
`;

// ═══════════════════════════════════════════════════════════════════════════
// 2. REGLA DE PRECISIÓN JURÍDICA
// ═══════════════════════════════════════════════════════════════════════════

const PRECISION_JURIDICA=`
REGLA DE PRECISIÓN JURÍDICA (OBLIGATORIA):
- Tu ÚNICA fuente de información son: (a) los documentos del caso/expediente proporcionados, (b) la normativa vinculada al caso, (c) los libros y guías de la Biblioteca de Referencia del usuario, y (d) informes y gestiones de casos ya terminados en la aplicación.
- NO consultes fuentes externas, ni tu conocimiento previo general, ni hagas suposiciones sobre el contenido o el contexto más allá de lo explícitamente escrito en los documentos.
- NUNCA inventes números de dictamen, fechas de jurisprudencia, artículos legales ni citas normativas que no consten en las fuentes anteriores.
- Si falta una referencia, usa etiquetas como [VERIFICAR: referencia no encontrada] o [NO CONSTA] en lugar de inferir o fabricar datos.
- Toda afirmación factual debe poder rastrearse a una fuente específica proporcionada.
`;

// ═══════════════════════════════════════════════════════════════════════════
// 3. DETECCIÓN DE ESTAMENTO Y RÉGIMEN NORMATIVO
// ═══════════════════════════════════════════════════════════════════════════

function detectEstamento(participants){
  if(!participants||!participants.length)return"desconocido";
  const d=participants.find(p=>{
    const r=(p.role||"").toLowerCase();
    return r.includes("denunciado")||r.includes("inculpado")||r.includes("investigado");
  });
  if(!d?.estamento)return"desconocido";
  const e=d.estamento.toLowerCase().trim();
  if(e.includes("funcionario")||e.includes("académico")||e.includes("academico")||e.includes("no académico")||e.includes("administrativo")||e.includes("directivo")||e.includes("planta")||e.includes("contrata"))return"funcionario";
  if(e.includes("estudiante")||e.includes("alumno")||e.includes("alumna")||e.includes("tesista")||e.includes("pregrado")||e.includes("postgrado"))return"estudiante";
  if(e.includes("honorario")||e.includes("prestador")||e.includes("contrato civil")||e.includes("boleta"))return"honorario";
  return"desconocido";
}

function getNormativeContext(estamento){
  const regimes={
    funcionario:`## RÉGIMEN NORMATIVO: FUNCIONARIO PÚBLICO (Estatuto Administrativo)
El denunciado tiene vínculo estatutario. Se aplica DFL N°29 (arts. 119-145 para sumario/IS, art. 121 para sanciones, art. 157 para prescripción), Ley 19.880, DFL 1-19.653 (probidad, art. 52), Ley 21.094 (art. 49). Sanciones: censura, multa, suspensión, destitución.
### Normas críticas:
- Art. 147 inc. final EA: Si se encontrare en tramitación un sumario administrativo en el que estuviere involucrado un funcionario, y éste cesare en sus funciones, el procedimiento deberá continuarse hasta su normal término.
- Art. 119 EA: Procedimientos disciplinarios: investigación sumaria y sumario administrativo.
- Art. 120 EA: Investigación sumaria para faltas que no revistan gravedad.
- Art. 126 EA: Si los hechos revisten mayor gravedad, se eleva a sumario administrativo.
- Art. 127-145 EA: Regulación del sumario administrativo.
- Art. 136 EA: Formulación de cargos, plazo de 5 días para descargos.
- Art. 137 EA: Término probatorio (no aplica si no se solicita).
Si aplica Ley Karin: Ley 21.643 y Decreto 019/SU/2024.`,

    estudiante:`## RÉGIMEN NORMATIVO: ESTUDIANTE (Reglamento Disciplinario Estudiantil)
El denunciado es ESTUDIANTE. NO se aplica el Estatuto Administrativo (DFL N°29). Se aplica Decreto N°21/SU/2025 (procedimientos disciplinarios estudiantes, vigente desde 04/06/2025), Reglamento General de Alumnos (Decreto 005/SU/2019), Ley 21.094 (art. 49), Ley 21.369 (acoso sexual en educación superior). Plazos: 45 días hábiles investigación, 10 días descargos. Las sanciones del art. 121 EA NO aplican. Si aplica género: Decreto 30/SU/2022.
IMPORTANTE: NO cites artículos del Estatuto Administrativo como fundamento para sancionar a un estudiante.`,

    honorario:`## RÉGIMEN NORMATIVO: CONTRATADO A HONORARIOS
El denunciado tiene vínculo a honorarios. NO es funcionario público. NO se aplica plenamente el Estatuto Administrativo. Se aplica Ley 21.643 (Ley Karin), Decreto 019/SU/2024 (Protocolo Karin UMAG), Convenio 190 OIT. Las sanciones del art. 121 EA NO proceden. Consecuencias: término de contrato, derivación a Dirección del Trabajo. Verificar competencia de la Universidad.`,

    desconocido:`## RÉGIMEN NORMATIVO: NO DETERMINADO
ADVERTENCIA: No se identificó el estamento del denunciado. La normativa varía: funcionario (DFL N°29), estudiante (Decreto 21/SU/2025), honorario (Ley Karin). Identifica el estamento y aplica la normativa correcta. Señala [ESTAMENTO NO DETERMINADO] si no es posible.`
  };
  return regimes[estamento]||regimes.desconocido;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PÁRRAFOS MODELO PARA VISTA FISCAL
// ═══════════════════════════════════════════════════════════════════════════

const PARRAFOS_MODELO={
  propuesta_sancion:`En conclusión, a la luz de los hechos acreditados, la valoración de la prueba, la ponderación de las defensas y el análisis jurídico-normativo, esta Fiscalía concluye que el inculpado [NOMBRE_INCULPADO] incurrió en faltas graves a sus deberes funcionarios. No se identifican atenuantes relevantes que desvirtúen la gravedad de las conductas. La gravedad de las infracciones se acentúa por la reiteración de las conductas, el abuso de la posición jerárquica y el impacto significativo en el ambiente laboral y la dignidad de [NOMBRE_AFECTADO].

En virtud de la gravedad de las infracciones, se propone la aplicación de la medida disciplinaria de [TIPO_SANCION].`,

  valoracion_prueba:`La Fiscalía ha valorado la prueba en conciencia, conforme al artículo 35 de la Ley Nº19.880 y la jurisprudencia administrativa (Dictámenes CGR 21.093 de 2015, 2.174 de 2020 y 66.506 de 2013), que permiten apreciar los elementos probatorios en su conjunto y sin exigir que cada uno sea concluyente por sí mismo.`,

  gravedad:`A juicio de este fiscal, los hechos constitutivos de cargos configuran faltas [NIVEL_GRAVEDAD] a los deberes funcionarios y a los principios de probidad administrativa, en atención a: reiteración y patrón de conducta, posición jerárquica del inculpado, vulneración de principios fundamentales, e impacto en la víctima.`,

  medidas_resguardo:`Que, en atención a la naturaleza de los hechos denunciados y conforme a lo dispuesto en el Protocolo para Prevenir y Enfrentar Situaciones de [TIPO_SITUACION], se adoptaron medidas de resguardo durante la tramitación del procedimiento. Las medidas tuvieron por objeto proteger la integridad física y psicológica de [AFECTADO], asegurar la efectividad de la investigación y evitar represalias o revictimización.`,

  perspectiva_genero:`Que, en cumplimiento de las obligaciones derivadas de la Ley N°21.369 y del Decreto N°30/SU/2022, el presente análisis se ha realizado incorporando la perspectiva de género como herramienta de análisis jurídico. Se ha tenido especialmente en cuenta la asimetría de poder entre las partes, valorando la prueba sin exigir requisitos diferenciados.`,

  por_tanto_sancion:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en el artículo 121 y 122 del D.F.L. N° 29 del año 2005, y habiéndose acreditado la responsabilidad administrativa, se propone al Sr. Rector, salvo su superior resolución:

Sancionar a don/doña [NOMBRE_COMPLETO], cédula de identidad Nº[RUT], [CARGO_ESTAMENTO], con la medida disciplinaria contemplada en el artículo 121 letra "[LETRA_SANCION]" del D.F.L. N° 29, [DESCRIPCION_SANCION].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución.`,

  prescripcion:`Que, conforme al artículo 157 del Estatuto Administrativo, la responsabilidad administrativa se extingue por prescripción de la acción disciplinaria en el plazo de cuatro años contados desde la fecha de comisión del hecho. En el presente caso, los hechos datan de [FECHA_HECHOS], habiendo transcurrido más de cuatro años sin que se haya notificado cargo alguno al inculpado.`,

  falta_prueba:`Que, de la prueba rendida en autos, no es posible formar convicción suficiente sobre la ocurrencia de los hechos denunciados o la participación del inculpado en los mismos, por cuanto [FUNDAMENTACION]. La sana crítica impone exigir un estándar probatorio de convicción razonada que no se satisface con la sola declaración del denunciante.`,

  atipicidad:`Que, aun teniendo por acreditados los hechos descritos, estos no configuran una infracción administrativa tipificada en el ordenamiento jurídico aplicable. La conducta del funcionario, si bien [DESCRIPCION], no vulnera ninguna de las obligaciones, deberes o prohibiciones contemplados en los artículos 61 a 68, 78, 84 u otras disposiciones del Estatuto Administrativo.`,

  por_tanto_sobreseimiento:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en el D.F.L. N° 29 del año 2005, y [FUNDAMENTO_ESPECIFICO], se propone al Sr. Rector, salvo su superior resolución:

SOBRESEER [DEFINITIVA / TEMPORALMENTE] el presente procedimiento disciplinario instruido en contra de don/doña [NOMBRE_COMPLETO], por [CAUSAL_SOBRESEIMIENTO].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución.`,

  perdida_calidad_estudiante:`Que, en virtud que la responsabilidad disciplinaria derivada del incumplimiento de las obligaciones del estudiantado que amerita la aplicación de alguna de las medidas disciplinarias que contempla nuestra normativa interna, el/la estudiante [NOMBRE_INCULPADO], NO REGISTRA MATRÍCULA VIGENTE EN LA INSTITUCIÓN para el período académico [AÑO_PERIODO], por lo que esta fiscal no tiene facultades para formular cargos ni continuar con el proceso investigativo.`,

  denuncia_anonima:`Que, el presente procedimiento tuvo su origen en una denuncia de carácter anónimo. Conforme a la jurisprudencia de la Contraloría General de la República, las denuncias anónimas pueden dar origen a un procedimiento disciplinario cuando los hechos denunciados son de suficiente gravedad y existen antecedentes que permitan corroborar su verosimilitud.`,

  eximentes:`Que, en relación con las eximentes de responsabilidad administrativa alegadas por la defensa del inculpado, corresponde analizar si concurren en el presente caso. Conforme al artículo 62 del Estatuto Administrativo, el funcionario debe representar la ilegalidad de una orden cuando esta fuere manifiestamente ilegal.`
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. CAUSALES DE SOBRESEIMIENTO
// ═══════════════════════════════════════════════════════════════════════════

const CAUSALES_SOBRESEIMIENTO={
  prescripcion:{nombre:"Prescripción de la acción disciplinaria",descripcion:"Art. 157 EA: 4 años desde comisión del hecho.",tipo:"definitivo"},
  falta_prueba:{nombre:"Insuficiencia probatoria",descripcion:"No se acreditan los hechos o la participación del inculpado.",tipo:"definitivo"},
  atipicidad:{nombre:"Atipicidad de la conducta",descripcion:"Los hechos no configuran infracción administrativa.",tipo:"definitivo"},
  inocencia:{nombre:"Inocencia o falta de participación",descripcion:"Se descartó la participación del inculpado.",tipo:"definitivo"},
  responsable_indeterminado:{nombre:"Responsable no determinado",descripcion:"No se pudo identificar al autor.",tipo:"temporal"},
  muerte_inculpado:{nombre:"Muerte del inculpado",descripcion:"Extingue la responsabilidad administrativa.",tipo:"definitivo"},
  eximentes:{nombre:"Eximentes de responsabilidad",descripcion:"Fuerza mayor, caso fortuito, cumplimiento de deber legal.",tipo:"definitivo"},
  incompetencia:{nombre:"Incompetencia del órgano",descripcion:"No existe vínculo estatutario que habilite la potestad disciplinaria.",tipo:"definitivo"},
  vicios_procedimentales:{nombre:"Vicios procedimentales esenciales",descripcion:"Vicios que afectan el derecho a defensa.",tipo:"definitivo_o_temporal"},
  desistimiento:{nombre:"Desistimiento o archivo por la autoridad",descripcion:"La autoridad estima innecesario continuar.",tipo:"definitivo"},
  perdida_calidad:{nombre:"Pérdida de calidad de estudiante",descripcion:"El denunciado no es estudiante regular.",tipo:"definitivo"},
  sobreseimiento_temporal:{nombre:"Sobreseimiento temporal",descripcion:"Paralización temporal hasta que se cumpla condición.",tipo:"temporal"}
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. TIPOS DE PROCEDIMIENTO Y PLAZOS
// ═══════════════════════════════════════════════════════════════════════════

const PROCEDURE_TYPES=[
  {id:"investigacion_sumaria",label:"Investigación Sumaria",shortLabel:"I.S.",legalBasis:"Art. 126 y ss. EA",prescriptionYears:4,maxDays:8,desc:"Faltas leves (5 días + 3 prórroga)"},
  {id:"sumario_administrativo",label:"Sumario Administrativo",shortLabel:"S.A.",legalBasis:"Art. 129 y ss. EA",prescriptionYears:4,maxDays:40,desc:"Faltas graves (20 días + 20 prórroga)"},
  {id:"disciplinario_estudiantil",label:"Disciplinario Estudiantil",shortLabel:"D.E.",legalBasis:"Decreto 21/SU/2025",prescriptionYears:2,maxDays:45,desc:"Estudiantes regulares"},
  {id:"protocolo_acoso_sexual",label:"Protocolo Acoso Sexual",shortLabel:"P.A.S.",legalBasis:"Ley 21.369 + Protocolo UMAG",prescriptionYears:4,maxDays:90,desc:"Acoso sexual/género"},
  {id:"protocolo_acoso_laboral",label:"Protocolo Acoso Laboral",shortLabel:"P.A.L.",legalBasis:"Ley 20.607 + Protocolo UMAG",prescriptionYears:4,maxDays:60,desc:"Acoso laboral/mobbing"},
  {id:"protocolo_ley_karin",label:"Protocolo Ley Karin",shortLabel:"L.K.",legalBasis:"Ley 21.643 + Decreto 019/SU/2024",prescriptionYears:4,maxDays:60,desc:"Acoso laboral/sexual Ley Karin"},
  {id:"protocolo_discriminacion",label:"Protocolo Discriminación",shortLabel:"Discrim.",legalBasis:"Ley 20.609 + Protocolo UMAG",prescriptionYears:4,maxDays:60,desc:"Discriminación arbitraria"},
  {id:"responsabilidad_honorarios",label:"Responsabilidad Honorarios",shortLabel:"R.H.",legalBasis:"Art. 11 Ley 18.834 + Contrato",prescriptionYears:2,maxDays:30,desc:"Contratados a honorarios"}
];

function detectProcedureType(tipo){
  if(!tipo)return PROCEDURE_TYPES[0];
  const n=tipo.toLowerCase().trim();
  if(n.includes("sumario")&&n.includes("administrativo"))return PROCEDURE_TYPES[1];
  if(n.includes("investigación sumaria")||n.includes("investigacion sumaria"))return PROCEDURE_TYPES[0];
  if(n.includes("estudiant"))return PROCEDURE_TYPES[2];
  if(n.includes("acoso sexual"))return PROCEDURE_TYPES[3];
  if(n.includes("acoso laboral")||n.includes("mobbing"))return PROCEDURE_TYPES[4];
  if(n.includes("karin"))return PROCEDURE_TYPES[5];
  if(n.includes("discrimin"))return PROCEDURE_TYPES[6];
  if(n.includes("honorario"))return PROCEDURE_TYPES[7];
  return PROCEDURE_TYPES[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CHECKLIST PROCEDIMENTAL POR FASE
// ═══════════════════════════════════════════════════════════════════════════

const CHECKLIST_FASES={
  inicio:[
    "Resolución incoatoria dictada y notificada",
    "Fiscal/investigador(a) designado(a) y notificado(a)",
    "Actuario designado (sumario administrativo)",
    "Expediente foliado y custodiado",
    "Medidas de resguardo evaluadas"
  ],
  indagatoria:[
    "Declaración del denunciante recibida",
    "Declaración indagatoria del denunciado/inculpado",
    "Declaraciones de testigos recibidas",
    "Prueba documental incorporada al expediente",
    "Diligencias investigativas completadas",
    "Oficios y requerimientos de información despachados",
    "Informes periciales solicitados (si aplica)"
  ],
  acusatoria:[
    "Pliego de cargos formulado con hechos precisos y determinados",
    "Cargos notificados personalmente al inculpado",
    "Plazo para descargos otorgado (5 días hábiles EA / 10 días estudiantes)",
    "Descargos presentados o certificación de rebeldía",
    "Término probatorio abierto (si se solicitó)"
  ],
  resolucion:[
    "Vista Fiscal / Informe Final elaborado",
    "Propuesta de sanción o sobreseimiento fundamentada",
    "Expediente elevado a la autoridad resolutora",
    "Resolución dictada por autoridad competente",
    "Resolución notificada al inculpado",
    "Recursos interpuestos considerados (si aplica)",
    "Anotación en hoja de vida / registro"
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// 8. SANCIONES ART. 121 EA
// ═══════════════════════════════════════════════════════════════════════════

const SANCIONES_EA={
  a:{letra:"a",nombre:"Censura",descripcion:"Reprensión por escrito. Falta leve.",gravedad:"leve"},
  b:{letra:"b",nombre:"Multa",descripcion:"Multa de 5% a 20% de la remuneración mensual. Falta menos grave.",gravedad:"menos_grave"},
  c:{letra:"c",nombre:"Suspensión del empleo",descripcion:"Suspensión hasta por 3 meses con goce del 50% a 70% de las remuneraciones. Falta grave.",gravedad:"grave"},
  d:{letra:"d",nombre:"Destitución",descripcion:"Decisión de la autoridad facultada para hacer el nombramiento. Falta gravísima o reiteración.",gravedad:"gravisima"}
};

// ═══════════════════════════════════════════════════════════════════════════
// 9. FUNCIÓN PRINCIPAL: ENRIQUECER PROMPT DEL SISTEMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enriquece un system prompt con el régimen normativo, estilo de escritura
 * y regla de precisión jurídica, basado en los participantes del caso.
 * @param {string} basePrompt - Prompt original
 * @param {object} opts - { participants, tipoProcedimiento }
 * @returns {string} Prompt enriquecido
 */
function enrichSystemPrompt(basePrompt, opts={}){
  const parts=[basePrompt];

  // Régimen normativo según estamento
  if(opts.participants&&opts.participants.length){
    const est=detectEstamento(opts.participants);
    parts.push(getNormativeContext(est));
  }

  // Tipo de procedimiento y plazos
  if(opts.tipoProcedimiento){
    const proc=detectProcedureType(opts.tipoProcedimiento);
    parts.push(`\n## PROCEDIMIENTO: ${proc.label}\nBase legal: ${proc.legalBasis}. Prescripción: ${proc.prescriptionYears} años. Plazo máximo investigación: ${proc.maxDays} días hábiles.`);
  }

  // Regla de precisión jurídica
  parts.push(PRECISION_JURIDICA);

  // Estilo de escritura humanizada
  parts.push(HUMAN_WRITING_STYLE);

  return parts.join("\n\n");
}

/**
 * Humaniza un prompt agregando la directiva de estilo.
 * @param {string} prompt
 * @returns {string}
 */
function humanizePrompt(prompt){
  return prompt+HUMAN_WRITING_STYLE;
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. PLANTILLAS DE RESOLUCIONES DE MERO TRÁMITE
// ═══════════════════════════════════════════════════════════════════════════

const PLANTILLAS_RESOLUCIONES={
  incoatoria_IS:`RESOLUCIÓN EXENTA Nº [NUMERO]/[AÑO]

VISTOS: Lo dispuesto en el D.F.L. Nº 29, de 2004, que fija el texto refundido, coordinado y sistematizado de la Ley Nº 18.834, sobre Estatuto Administrativo, en especial sus artículos 119, 120 y 126; [NORMATIVA_ADICIONAL];

CONSIDERANDO:
Que, se ha tomado conocimiento de hechos que podrían constituir una infracción a las obligaciones funcionarias, consistentes en [DESCRIPCION_BREVE_HECHOS];
Que, conforme al artículo 126 del Estatuto Administrativo, procede instruir una investigación sumaria para establecer los hechos y determinar las responsabilidades administrativas que pudieran existir;

RESUELVO:
1. Instrúyase investigación sumaria para investigar los hechos referidos en la parte considerativa de la presente resolución.
2. Desígnase como investigador(a) a don/doña [NOMBRE_INVESTIGADOR], [CARGO], quien deberá dar cumplimiento a su cometido dentro del plazo legal.
3. Notifíquese al investigador(a) designado(a).

ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.`,

  incoatoria_SA:`RESOLUCIÓN EXENTA Nº [NUMERO]/[AÑO]

VISTOS: Lo dispuesto en el D.F.L. Nº 29, de 2004, sobre Estatuto Administrativo, en especial sus artículos 119, 127, 129 y siguientes; [NORMATIVA_ADICIONAL];

CONSIDERANDO:
Que, los hechos denunciados revisten caracteres de gravedad que ameritan la instrucción de un sumario administrativo;
Que, conforme al artículo 129 del Estatuto Administrativo, corresponde designar un fiscal de carrera para sustanciar el procedimiento;

RESUELVO:
1. Instrúyase sumario administrativo para investigar los hechos referidos.
2. Desígnase como Fiscal Instructor a don/doña [NOMBRE_FISCAL], [CARGO], de igual o superior grado al presunto inculpado.
3. Desígnase como Actuario a don/doña [NOMBRE_ACTUARIO], [CARGO].
4. Fíjase un plazo de 20 días hábiles para la investigación, prorrogable por otros 20 días.

ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.`,

  elevacion_IS_a_SA:`RESOLUCIÓN EXENTA Nº [NUMERO]/[AÑO]

VISTOS: Los antecedentes de la investigación sumaria [ROL]; el artículo 126 inciso 3° del Estatuto Administrativo;

CONSIDERANDO:
Que, de los antecedentes reunidos en la investigación sumaria se desprende que los hechos revisten una gravedad mayor a la prevista inicialmente;
Que, conforme al artículo 126 inciso 3° del Estatuto Administrativo, corresponde elevar los antecedentes a sumario administrativo;

RESUELVO:
1. Elévense los antecedentes de la investigación sumaria [ROL] a sumario administrativo.
2. Desígnase como Fiscal Instructor a don/doña [NOMBRE_FISCAL].
3. Incorpórese el expediente de la investigación sumaria como antecedente del sumario.

ANÓTESE, COMUNÍQUESE Y ARCHÍVESE.`
};

// ═══════════════════════════════════════════════════════════════════════════
// 11. PLANTILLAS DE MEDIDAS DE RESGUARDO
// ═══════════════════════════════════════════════════════════════════════════

const MEDIDAS_RESGUARDO=[
  {id:"separacion_funcional",nombre:"Separación funcional",descripcion:"Separación de funciones entre denunciante y denunciado para evitar contacto directo.",base_legal:"Art. 136 EA / Protocolo Género"},
  {id:"cambio_dependencia",nombre:"Cambio de dependencia",descripcion:"Reubicación temporal del denunciado a otra unidad o dependencia.",base_legal:"Art. 136 EA"},
  {id:"cambio_turno",nombre:"Cambio de turno o jornada",descripcion:"Modificación de turno o jornada para evitar coincidencia horaria.",base_legal:"Protocolo Institucional"},
  {id:"prohibicion_contacto",nombre:"Prohibición de contacto",descripcion:"Instrucción formal de no contactar a la víctima por ningún medio.",base_legal:"Ley 21.369 / Protocolo Género"},
  {id:"suspension_preventiva",nombre:"Suspensión preventiva",descripcion:"Suspensión temporal de funciones con goce de remuneraciones.",base_legal:"Art. 136 EA"},
  {id:"acompanamiento_psicologico",nombre:"Acompañamiento psicológico",descripcion:"Derivación a atención psicológica para la víctima.",base_legal:"Ley 21.369"},
  {id:"teletrabajo",nombre:"Teletrabajo temporal",descripcion:"Autorización de trabajo remoto para evitar coincidencia física.",base_legal:"Protocolo Institucional"},
  {id:"reasignacion_academica",nombre:"Reasignación académica",descripcion:"Cambio de sección, grupo o docente para estudiantes afectados.",base_legal:"Ley 21.369 / Reglamento Estudiantil"}
];

// ═══════════════════════════════════════════════════════════════════════════
// 12. EXPOSICIÓN PÚBLICA (window)
// ═══════════════════════════════════════════════════════════════════════════

window.FISCALITO_JURIDICO={
  // Core
  enrichSystemPrompt,
  humanizePrompt,
  detectEstamento,
  getNormativeContext,
  detectProcedureType,

  // Constants
  HUMAN_WRITING_STYLE,
  PRECISION_JURIDICA,
  PARRAFOS_MODELO,
  CAUSALES_SOBRESEIMIENTO,
  PROCEDURE_TYPES,
  CHECKLIST_FASES,
  SANCIONES_EA,
  PLANTILLAS_RESOLUCIONES,
  MEDIDAS_RESGUARDO,

  // Utility: get paragraph by key
  getParrafo:key=>PARRAFOS_MODELO[key]||null,

  // Utility: get paragraphs for conclusion type
  getParrafosPorConclusion(tipo){
    const map={
      sancion:["propuesta_sancion","gravedad","valoracion_prueba","por_tanto_sancion"],
      sobreseimiento_prescripcion:["prescripcion","por_tanto_sobreseimiento"],
      sobreseimiento_falta_prueba:["falta_prueba","valoracion_prueba","por_tanto_sobreseimiento"],
      sobreseimiento_atipicidad:["atipicidad","por_tanto_sobreseimiento"],
      sobreseimiento_perdida_calidad:["perdida_calidad_estudiante","por_tanto_sobreseimiento"]
    };
    const keys=map[tipo]||[];
    return keys.map(k=>({key:k,texto:PARRAFOS_MODELO[k]||""})).filter(p=>p.texto);
  },

  // Utility: get checklist for phase
  getChecklist:fase=>CHECKLIST_FASES[fase]||[],

  // Utility: get sanction info
  getSancion:letra=>SANCIONES_EA[letra]||null,

  // Utility: get resolution template
  getPlantilla:tipo=>PLANTILLAS_RESOLUCIONES[tipo]||null,

  // Utility: get all medidas de resguardo
  getMedidasResguardo:()=>MEDIDAS_RESGUARDO,
};

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO CARGADO
// ═══════════════════════════════════════════════════════════════════════════
console.log("%c⚖️ Módulo de Razonamiento Jurídico cargado — Fiscalito","color:#7c3aed;font-weight:bold");
console.log("%c   ✓ Régimen normativo  ✓ Párrafos modelo  ✓ Estilo humano  ✓ Validación","color:#666");

})();
