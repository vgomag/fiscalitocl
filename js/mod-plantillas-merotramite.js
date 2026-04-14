/* ══════════════════════════════════════════════════════════════
   mod-plantillas-merotramite.js — Resoluciones de Mero Trámite
   Plantillas predefinidas para resoluciones tipo en procedimientos
   disciplinarios de la Fiscalía Universitaria UMAG
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── Protocolos UMAG ── */
const PROTOCOLOS = [
  { id: '05/SU/2020', label: 'Decreto 05/SU/2020 (Acoso Sexual)' },
  { id: '30/SU/2022', label: 'Decreto 30/SU/2022 (Ley Karin)' },
  { id: '21/SU/2025', label: 'Decreto 21/SU/2025 (Disciplinario Estudiantil)' },
  { id: '007/SU/2021', label: 'Decreto 007/SU/2021 (Buenas Prácticas)' },
  { id: '019/SU/2024', label: 'Decreto 019/SU/2024 (Probidad)' },
  { id: '34/SU/2001', label: 'Decreto 34/SU/2001 (Reglamento General)' },
];

/* ── Tipos de procedimiento ── */
const PROC_TYPES = [
  { id: 'IS', label: 'Investigación Sumaria', firmas: 'solo_investigador' },
  { id: 'SA', label: 'Sumario Administrativo', firmas: 'fiscal_actuaria' },
  { id: 'PD', label: 'Procedimiento Disciplinario', firmas: 'fiscal_actuaria' },
];

/* ── Firma según tipo de procedimiento ── */
function getFirmaBlock(procType) {
  if (procType === 'IS') {
    return `{nombre_investigador}
INVESTIGADOR/A SUMARIO/A
{dependencia_investigador}
Universidad de Magallanes`;
  }
  return `{nombre_fiscal}
FISCAL INSTRUCTOR/A
{dependencia_fiscal}
Universidad de Magallanes

{nombre_actuaria}
ACTUARIO/A
{dependencia_actuaria}
Universidad de Magallanes`;
}

/* ══════════════════════════════════════════════════════════════
   PLANTILLAS — FASE INDAGATORIA (32 tipos)
   ══════════════════════════════════════════════════════════════ */
const PLANTILLAS_INDAGATORIA = [
  // 1. Res. tiene presente denuncia/requerimiento
  {
    code: 'MT-IND-01',
    name: 'Tiene presente denuncia o requerimiento',
    desc: 'Resolución que tiene presente la denuncia o requerimiento que da origen al procedimiento',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
El requerimiento/denuncia de fecha {fecha_denuncia}, presentado por {nombre_denunciante}; la Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, con fecha {fecha_denuncia}, se recibió {tipo_presentacion} de {nombre_denunciante}, en relación a hechos que pudieren constituir infracción a las obligaciones funcionarias/estudiantiles.
2° Que, corresponde tener presente dicha presentación e incorporarla al expediente administrativo.

RESUELVO:
TÉNGASE PRESENTE la {tipo_presentacion} de {nombre_denunciante}, de fecha {fecha_denuncia}, la que se agrega al expediente a fojas {numero_fojas}.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 2. Res. cita a declarar al denunciante
  {
    code: 'MT-IND-02',
    name: 'Cita a declarar al denunciante',
    desc: 'Citación formal al denunciante para prestar declaración',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se requiere recibir la declaración de {nombre_denunciante}, en calidad de denunciante, a fin de esclarecer los hechos materia de la investigación.
2° Que, es necesario fijar día y hora para la comparecencia.

RESUELVO:
CÍTESE a {nombre_denunciante}, RUT {rut_denunciante}, a prestar declaración el día {fecha_citacion} a las {hora_citacion} horas, en {lugar_citacion}.
Se le hace presente que su comparecencia es obligatoria y que debe concurrir con su cédula de identidad.

NOTIFÍQUESE personalmente al citado/a.

{firma}`
  },

  // 3. Res. cita a declarar a testigo
  {
    code: 'MT-IND-03',
    name: 'Cita a declarar a testigo',
    desc: 'Citación formal a testigo para prestar declaración',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se requiere recibir la declaración de {nombre_testigo}, en calidad de testigo, a fin de esclarecer los hechos materia de la investigación.
2° Que, es necesario fijar día y hora para la comparecencia.

RESUELVO:
CÍTESE a {nombre_testigo}, RUT {rut_testigo}, a prestar declaración en calidad de testigo el día {fecha_citacion} a las {hora_citacion} horas, en {lugar_citacion}.
Se le hace presente que su comparecencia es obligatoria conforme al artículo {articulo_comparecencia} del {normativa_aplicable}.

NOTIFÍQUESE personalmente al citado/a.

{firma}`
  },

  // 4. Res. cita a declarar al inculpado
  {
    code: 'MT-IND-04',
    name: 'Cita a declarar al inculpado/a',
    desc: 'Citación formal al inculpado para prestar declaración indagatoria',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se requiere recibir la declaración de {nombre_inculpado}, en calidad de investigado/a, a fin de ejercer su derecho a ser oído/a en la etapa indagatoria.
2° Que, es necesario fijar día y hora para la comparecencia.

RESUELVO:
CÍTESE a {nombre_inculpado}, RUT {rut_inculpado}, {cargo_inculpado} de la {dependencia_inculpado}, a prestar declaración en calidad de investigado/a el día {fecha_citacion} a las {hora_citacion} horas, en {lugar_citacion}.
Se le hace presente que tiene derecho a asistir acompañado/a de un/a abogado/a.

NOTIFÍQUESE personalmente al citado/a.

{firma}`
  },

  // 5. Res. ordena diligencia de oficio
  {
    code: 'MT-IND-05',
    name: 'Ordena diligencia de oficio',
    desc: 'Resolución que ordena la práctica de una diligencia probatoria de oficio',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, para el debido esclarecimiento de los hechos investigados, resulta necesario practicar la siguiente diligencia: {descripcion_diligencia}.
2° Que, conforme a las atribuciones conferidas, el/la fiscal/investigador/a puede decretar de oficio las diligencias que estime pertinentes.

RESUELVO:
DECRETASE la práctica de la siguiente diligencia: {descripcion_diligencia}.
Para su cumplimiento, OFÍCIESE a {destinatario_oficio} a fin de que {accion_requerida}.
FÍJASE un plazo de {plazo_dias} días hábiles para el cumplimiento de lo ordenado.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 6. Res. ordena despacho de oficio
  {
    code: 'MT-IND-06',
    name: 'Ordena despacho de oficio',
    desc: 'Resolución que ordena remitir oficio a autoridad o dependencia',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, para los fines de la investigación resulta necesario requerir información/antecedentes a {destinatario}.
2° Que, {fundamento_oficio}.

RESUELVO:
DESPÁCHESE oficio a {cargo_destinatario} de {dependencia_destinatario}, a fin de que remita {informacion_requerida}, dentro del plazo de {plazo_dias} días hábiles contados desde la recepción del presente.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 7. Res. agrega documento al expediente
  {
    code: 'MT-IND-07',
    name: 'Agrega documento al expediente',
    desc: 'Resolución que ordena agregar documento o antecedente al expediente',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se ha recibido {descripcion_documento}, el que resulta pertinente a la investigación en curso.
2° Que, corresponde incorporarlo al expediente para su debida constancia y valoración.

RESUELVO:
AGRÉGUESE al expediente {descripcion_documento}, el que se incorpora a fojas {numero_fojas}.

REGÍSTRESE.

{firma}`
  },

  // 8. Res. solicita prórroga del plazo de investigación
  {
    code: 'MT-IND-08',
    name: 'Solicita prórroga del plazo de investigación',
    desc: 'Solicitud de ampliación del plazo para concluir la etapa indagatoria',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; las diligencias practicadas hasta la fecha; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, el plazo de investigación vence el {fecha_vencimiento}.
2° Que, restan por practicar las siguientes diligencias esenciales: {diligencias_pendientes}.
3° Que, conforme al artículo {articulo_prorroga} del {normativa_aplicable}, procede solicitar una prórroga del plazo de investigación.

RESUELVO:
SOLICÍTESE a {autoridad_prorroga} la ampliación del plazo de investigación por {dias_prorroga} días hábiles adicionales, a contar del vencimiento del plazo original, fundado en la necesidad de practicar las diligencias señaladas en el considerando 2°.
REMÍTASE copia de la presente resolución a {autoridad_prorroga}.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 9. Res. concede prórroga
  {
    code: 'MT-IND-09',
    name: 'Concede prórroga de investigación',
    desc: 'Resolución de la autoridad que concede la prórroga solicitada',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La solicitud de prórroga del plazo de investigación formulada en Resolución Exenta N° {resolucion_solicitud} de {fecha_solicitud}; la Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, el/la fiscal/investigador/a ha solicitado prórroga del plazo de investigación por {dias_prorroga} días hábiles.
2° Que, los fundamentos expresados justifican la ampliación del plazo.

RESUELVO:
CONCÉDESE prórroga del plazo de investigación por {dias_prorroga} días hábiles, a contar del vencimiento del plazo original.

NOTIFÍQUESE al Fiscal/Investigador/a y REGÍSTRESE.

{firma}`
  },

  // 10. Res. designa actuario/a
  {
    code: 'MT-IND-10',
    name: 'Designa actuario/a',
    desc: 'Resolución que designa al actuario del procedimiento (SA/PD)',
    applicableTo: ['SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, conforme al artículo {articulo_actuario} del {normativa_aplicable}, en los sumarios administrativos se requiere la designación de un/a actuario/a.
2° Que, {nombre_actuaria}, {cargo_actuaria} de {dependencia_actuaria}, reúne las condiciones para desempeñar dicha función.

RESUELVO:
DESÍGNASE como Actuario/a del presente {tipo_procedimiento} a {nombre_actuaria}, {cargo_actuaria} de {dependencia_actuaria}, quien deberá prestar juramento o promesa de guardar secreto.

NOTIFÍQUESE a la persona designada.

{firma}`
  },

  // 11. Res. declara secreto del sumario
  {
    code: 'MT-IND-11',
    name: 'Declara secreto del sumario',
    desc: 'Resolución que declara el carácter secreto de las actuaciones',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, conforme al artículo 137 del DFL N°29, el sumario será secreto hasta la fecha en que se formulen cargos o se decrete sobreseimiento.
2° Que, las actuaciones realizadas deben mantenerse en reserva para asegurar el éxito de la investigación.

RESUELVO:
DECLÁRASE que las actuaciones del presente {tipo_procedimiento} revisten el carácter de SECRETAS, conforme al artículo 137 del Estatuto Administrativo.
Toda persona que participe o tome conocimiento de las diligencias queda obligada a guardar secreto sobre ellas.

NOTIFÍQUESE a los intervinientes.

{firma}`
  },

  // 12. Res. certifica estado del proceso
  {
    code: 'MT-IND-12',
    name: 'Certifica estado del proceso',
    desc: 'Certificación del actuario sobre el estado actual del expediente',
    applicableTo: ['SA','PD'],
    structure: `CERTIFICACIÓN

En {ciudad}, a {fecha}, el/la Actuario/a que suscribe CERTIFICA:

1° Que el {tipo_procedimiento} instruido por Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} se encuentra en etapa de {etapa_actual}.
2° Que el expediente consta de {numero_fojas} fojas útiles a esta fecha.
3° Que se han practicado {numero_diligencias} diligencias.
4° Que el plazo de investigación vence el {fecha_vencimiento}.
{observaciones_adicionales}

Es cuanto puedo certificar en la fecha indicada.

{nombre_actuaria}
ACTUARIO/A
{dependencia_actuaria}
Universidad de Magallanes`
  },

  // 13. Res. toma declaración (acta)
  {
    code: 'MT-IND-13',
    name: 'Acta de declaración',
    desc: 'Formato de acta para toma de declaración de compareciente',
    applicableTo: ['IS','SA','PD'],
    structure: `ACTA DE DECLARACIÓN

En {ciudad}, a {fecha}, siendo las {hora} horas, ante {nombre_fiscal_investigador}, en calidad de {calidad_fiscal} del {tipo_procedimiento} instruido por Resolución Exenta N° {resolucion_instruye}{actuario_presente}, comparece:

{nombre_declarante}, RUT {rut_declarante}, {cargo_declarante}, domiciliado/a en {domicilio_declarante}, quien previamente juramentado/a conforme a derecho y advertido/a de las penas del artículo 210 del Código Penal, declara:

{contenido_declaracion}

Preguntado/a si tiene algo más que agregar, modificar o enmendar, señala que no/que {agregado}.

Se da por terminada la presente declaración, previa lectura y ratificación del contenido por parte del/la declarante, quien firma para constancia.

{nombre_declarante}                    {nombre_fiscal_investigador}
DECLARANTE                             {calidad_fiscal}
{actuario_firma}`
  },

  // 14. Res. ordena notificación
  {
    code: 'MT-IND-14',
    name: 'Ordena notificación',
    desc: 'Resolución que ordena notificar a una persona determinada',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y la necesidad de poner en conocimiento de {nombre_notificado} la Resolución {resolucion_a_notificar}.

RESUELVO:
NOTIFÍQUESE a {nombre_notificado}, RUT {rut_notificado}, {cargo_notificado} de {dependencia_notificado}, la Resolución Exenta N° {resolucion_a_notificar} de {fecha_resolucion_notificada}, debiendo practicarse la notificación en forma personal o, en su defecto, conforme al procedimiento establecido en {normativa_notificacion}.

REGÍSTRESE.

{firma}`
  },

  // 15. Res. ordena medida de protección (Ley Karin / Género)
  {
    code: 'MT-IND-15',
    name: 'Ordena medida de protección',
    desc: 'Resolución que decreta medida de protección para denunciante o víctima',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; la denuncia de {nombre_denunciante}; {normativa_proteccion}; y las facultades que me confiere la normativa vigente.

CONSIDERANDO:
1° Que, los hechos denunciados dan cuenta de una situación que amerita la adopción de medidas de protección en favor de {nombre_protegido}.
2° Que, conforme a {normativa_proteccion}, el/la fiscal/investigador/a se encuentra facultado/a para decretar medidas tendientes a resguardar la integridad de las personas involucradas.
3° Que, la medida de protección se adopta de manera cautelar, sin que constituya prejuzgamiento alguno.

RESUELVO:
DECRÉTASE la siguiente medida de protección:
{descripcion_medida}

La presente medida regirá desde esta fecha y hasta {vigencia_medida}.
COMUNÍQUESE a {autoridad_comunicar} para su cumplimiento.

NOTIFÍQUESE a las partes.

{firma}`
  },

  // 16. Res. declara inhabilidad
  {
    code: 'MT-IND-16',
    name: 'Declara inhabilidad del fiscal/investigador',
    desc: 'Resolución que declara la inhabilidad del fiscal o investigador',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; y las causales de inhabilidad previstas en {normativa_inhabilidad}.

CONSIDERANDO:
1° Que, {nombre_inhabilitado}, designado/a como {cargo_inhabilitado} del presente procedimiento, ha informado/se ha verificado la concurrencia de la causal de inhabilidad consistente en: {causal_inhabilidad}.
2° Que, conforme al artículo {articulo_inhabilidad} del {normativa_aplicable}, dicha circunstancia impide continuar en el ejercicio del cargo.

RESUELVO:
DECLÁRASE INHABILITADO/A a {nombre_inhabilitado} para continuar como {cargo_inhabilitado} del presente {tipo_procedimiento}.
ELÉVENSEN los antecedentes a {autoridad_reemplazo} para la designación de reemplazante.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 17. Res. resuelve incidente / solicitud
  {
    code: 'MT-IND-17',
    name: 'Resuelve incidente o solicitud',
    desc: 'Resolución que resuelve un incidente o solicitud formulada por las partes',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La presentación de {nombre_solicitante} de fecha {fecha_solicitud}; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, {nombre_solicitante} ha solicitado {resumen_solicitud}.
2° Que, analizada la solicitud en relación a los antecedentes del procedimiento, {fundamento_decision}.

RESUELVO:
{decision}: {detalle_decision}.

NOTIFÍQUESE al solicitante.

{firma}`
  },

  // 18. Res. fija audiencia
  {
    code: 'MT-IND-18',
    name: 'Fija audiencia',
    desc: 'Resolución que fija fecha para audiencia o diligencia presencial',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, resulta necesario fijar audiencia para {objeto_audiencia}.
2° Que, se ha verificado la disponibilidad de las partes y del recinto.

RESUELVO:
FÍJASE audiencia para el día {fecha_audiencia} a las {hora_audiencia} horas, en {lugar_audiencia}, con el objeto de {objeto_audiencia}.
CÍTESE a {personas_citadas}.

NOTIFÍQUESE a los citados con a lo menos {dias_anticipacion} días hábiles de anticipación.

{firma}`
  },

  // 19. Res. cierre de etapa indagatoria
  {
    code: 'MT-IND-19',
    name: 'Cierre de etapa indagatoria',
    desc: 'Resolución que declara cerrada la etapa de investigación',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; las diligencias practicadas durante la etapa indagatoria; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se han practicado todas las diligencias necesarias para el esclarecimiento de los hechos investigados.
2° Que, el expediente consta de {numero_fojas} fojas útiles y {numero_diligencias} diligencias practicadas.
3° Que, de los antecedentes reunidos se desprende que {conclusion_indagatoria}.

RESUELVO:
DECLÁRASE CERRADA la etapa indagatoria del presente {tipo_procedimiento}.
PROCÉDASE a la etapa siguiente conforme a derecho.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 20. Res. formulación de cargos
  {
    code: 'MT-IND-20',
    name: 'Formulación de cargos',
    desc: 'Resolución que formula cargos al inculpado',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion} — FORMULA CARGOS

{ciudad}, {fecha}

VISTOS:
1.- La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}.
2.- Las diligencias de la etapa indagatoria.
3.- Lo dispuesto en los artículos {articulos_aplicables} del {normativa_aplicable}.

CONSIDERANDO:
1° Que, de la investigación practicada se han reunido antecedentes suficientes para formular cargos contra {nombre_inculpado}, {cargo_inculpado} de {dependencia_inculpado}.

2° Que, los hechos acreditados son los siguientes:
{hechos_acreditados}

3° Que, tales hechos constituirían infracción a:
{normas_infringidas}

RESUELVO:
FORMÚLANSE los siguientes cargos a {nombre_inculpado}, RUT {rut_inculpado}:

CARGO PRIMERO: {cargo_primero}

{cargos_adicionales}

NOTIFÍQUESE personalmente al inculpado/a, haciéndole saber que tiene un plazo de {plazo_descargos} días hábiles para presentar descargos y solicitar diligencias probatorias.

{firma}`
  },

  // 21. Res. sobreseimiento
  {
    code: 'MT-IND-21',
    name: 'Propone sobreseimiento',
    desc: 'Resolución que propone el sobreseimiento del procedimiento',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion} — PROPONE SOBRESEIMIENTO

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; las diligencias practicadas; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, de la investigación realizada no se han reunido antecedentes suficientes para formular cargos.
2° Que, {fundamento_sobreseimiento}.
3° Que, conforme al artículo {articulo_sobreseimiento} del {normativa_aplicable}, procede proponer el sobreseimiento del presente procedimiento.

RESUELVO:
PROPÓNESE el SOBRESEIMIENTO del presente {tipo_procedimiento}, por la causal de {causal_sobreseimiento}.
ELÉVENSEN los antecedentes a {autoridad_resolutiva} para su resolución definitiva.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 22. Res. ordena careo
  {
    code: 'MT-IND-22',
    name: 'Ordena careo',
    desc: 'Resolución que ordena diligencia de careo entre declarantes',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; las declaraciones prestadas por {nombre_persona_1} y {nombre_persona_2}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, existen contradicciones sustanciales entre las declaraciones de {nombre_persona_1} (fojas {fojas_1}) y {nombre_persona_2} (fojas {fojas_2}).
2° Que, el careo constituye una diligencia idónea para esclarecer dichas contradicciones.

RESUELVO:
DECRÉTASE diligencia de CAREO entre {nombre_persona_1} y {nombre_persona_2}, la que se verificará el día {fecha_careo} a las {hora_careo} horas en {lugar_careo}.
CÍTESE a ambos comparecientes.

NOTIFÍQUESE a los citados.

{firma}`
  },

  // 23. Res. solicita informe técnico/pericial
  {
    code: 'MT-IND-23',
    name: 'Solicita informe técnico o pericial',
    desc: 'Resolución que solicita informe técnico o pericia',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, para el esclarecimiento de los hechos investigados se requiere un informe técnico/pericial sobre {materia_informe}.
2° Que, {nombre_perito_entidad} cuenta con la idoneidad técnica para emitir dicho informe.

RESUELVO:
SOLICÍTESE informe técnico/pericial a {nombre_perito_entidad} sobre {materia_informe}, debiendo pronunciarse específicamente sobre: {puntos_pericia}.
FÍJASE un plazo de {plazo_dias} días hábiles para la emisión del informe.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 24. Res. ordena reconstitución de hechos
  {
    code: 'MT-IND-24',
    name: 'Ordena reconstitución de hechos',
    desc: 'Resolución que ordena diligencia de reconstitución de hechos',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, resulta necesario verificar in situ las circunstancias de los hechos investigados.
2° Que, la reconstitución de hechos contribuirá al esclarecimiento de {aspecto_a_verificar}.

RESUELVO:
DECRÉTASE la realización de una RECONSTITUCIÓN DE HECHOS, la que se verificará el día {fecha_reconstitucion} a las {hora_reconstitucion} horas en {lugar_reconstitucion}.
CÍTESE a {personas_citadas} para que concurran a la diligencia.

NOTIFÍQUESE a los citados.

{firma}`
  },

  // 25. Res. ordena inspección ocular
  {
    code: 'MT-IND-25',
    name: 'Ordena inspección ocular',
    desc: 'Resolución que ordena inspección en el lugar de los hechos',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, resulta pertinente realizar una inspección ocular en {lugar_inspeccion} para verificar {aspecto_a_verificar}.

RESUELVO:
DECRÉTASE INSPECCIÓN OCULAR en {lugar_inspeccion}, la que se practicará el día {fecha_inspeccion} a las {hora_inspeccion} horas.
LEVÁNTESE acta de la diligencia con descripción detallada de lo observado.

REGÍSTRESE.

{firma}`
  },

  // 26. Res. solicita antecedentes a otra dependencia
  {
    code: 'MT-IND-26',
    name: 'Solicita antecedentes a dependencia',
    desc: 'Resolución que solicita antecedentes a otra unidad de la universidad',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, para los fines de la investigación se requiere obtener {antecedentes_requeridos} de {dependencia_destino}.

RESUELVO:
OFÍCIESE a {cargo_jefatura} de {dependencia_destino} a fin de que remita {antecedentes_requeridos}, dentro del plazo de {plazo_dias} días hábiles.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 27. Res. tiene por acompañada prueba documental
  {
    code: 'MT-IND-27',
    name: 'Tiene por acompañada prueba documental',
    desc: 'Resolución que tiene por acompañada prueba documental aportada',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La presentación de {nombre_aportante} de fecha {fecha_presentacion}; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}.

CONSIDERANDO:
1° Que, {nombre_aportante} ha acompañado los siguientes documentos: {descripcion_documentos}.
2° Que, dichos documentos resultan pertinentes a la investigación.

RESUELVO:
TÉNGASE POR ACOMPAÑADA la prueba documental presentada por {nombre_aportante}, la que se agrega al expediente a fojas {fojas}.

REGÍSTRESE.

{firma}`
  },

  // 28. Res. decreta reserva de identidad
  {
    code: 'MT-IND-28',
    name: 'Decreta reserva de identidad',
    desc: 'Resolución que decreta reserva de identidad del denunciante',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; la solicitud de reserva de identidad; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, {nombre_solicitante} ha solicitado reserva de su identidad en el marco del presente procedimiento.
2° Que, conforme a {normativa_reserva}, procede decretar la reserva cuando existan antecedentes fundados de riesgo de represalias.
3° Que, en el caso sub lite, {fundamento_reserva}.

RESUELVO:
DECRÉTASE la RESERVA DE IDENTIDAD de {nombre_protegido} en el marco del presente {tipo_procedimiento}.
Toda referencia al/la denunciante en las actuaciones posteriores se realizará mediante la asignación de un código identificador.

NOTIFÍQUESE al solicitante. REGÍSTRESE.

{firma}`
  },

  // 29. Res. fija plazo para diligencia
  {
    code: 'MT-IND-29',
    name: 'Fija plazo para cumplimiento de diligencia',
    desc: 'Resolución que fija plazo para el cumplimiento de una diligencia',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_que_ordena} de {fecha_resolucion_ordena} que ordenó {diligencia_ordenada}; y la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}.

CONSIDERANDO:
1° Que, la diligencia ordenada mediante la resolución individualizada en los Vistos no ha sido cumplida a la fecha.
2° Que, resulta necesario fijar un plazo perentorio para su cumplimiento.

RESUELVO:
FÍJASE un plazo improrrogable de {plazo_dias} días hábiles, contados desde la notificación de la presente resolución, para el cumplimiento de {diligencia_ordenada}.
Vencido dicho plazo sin que se haya dado cumplimiento, se procederá conforme a derecho.

NOTIFÍQUESE al responsable del cumplimiento.

{firma}`
  },

  // 30. Res. acumula expedientes
  {
    code: 'MT-IND-30',
    name: 'Acumula expedientes',
    desc: 'Resolución que ordena la acumulación de dos o más procedimientos',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; la Resolución Exenta N° {resolucion_otro} que instruyó procedimiento conexo; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, los procedimientos individualizados guardan relación con los mismos hechos/involucran a las mismas personas.
2° Que, la acumulación permitirá una investigación más eficiente y evitará pronunciamientos contradictorios.

RESUELVO:
ACUMÚLENSE los expedientes del {tipo_procedimiento} instruido por Resolución Exenta N° {resolucion_instruye} y del procedimiento instruido por Resolución Exenta N° {resolucion_otro}, los que se tramitarán conjuntamente bajo el expediente principal.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 31. Res. levanta secreto del sumario
  {
    code: 'MT-IND-31',
    name: 'Levanta secreto del sumario',
    desc: 'Resolución que levanta el secreto al formularse cargos o sobreseer',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; la Resolución Exenta N° {resolucion_cargos_sobreseimiento} que {cargo_o_sobreseimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, conforme al artículo 137 del DFL N°29, el secreto del sumario se mantiene hasta la formulación de cargos o el sobreseimiento.
2° Que, habiéndose {cargo_o_sobreseimiento} mediante la resolución citada en los Vistos, corresponde levantar el secreto.

RESUELVO:
LEVÁNTASE el secreto del presente {tipo_procedimiento} a contar de esta fecha.
El expediente queda a disposición de las partes para su consulta.

NOTIFÍQUESE a las partes. REGÍSTRESE.

{firma}`
  },

  // 32. Constancia de notificación
  {
    code: 'MT-IND-32',
    name: 'Constancia de notificación',
    desc: 'Acta que deja constancia de la notificación practicada',
    applicableTo: ['IS','SA','PD'],
    structure: `CONSTANCIA DE NOTIFICACIÓN

En {ciudad}, a {fecha}, siendo las {hora} horas, el/la suscrito/a, {nombre_ministro_fe}, en calidad de {calidad_ministro_fe} del {tipo_procedimiento} instruido por Resolución Exenta N° {resolucion_instruye}, CERTIFICA:

Que, en esta fecha se ha notificado personalmente a {nombre_notificado}, RUT {rut_notificado}, {cargo_notificado} de {dependencia_notificado}, la Resolución Exenta N° {resolucion_notificada} de {fecha_resolucion_notificada}.

La notificación se practicó en {lugar_notificacion}, entregándose copia íntegra de la resolución.

{reaccion_notificado}

Para constancia firma:

{nombre_notificado}                    {nombre_ministro_fe}
NOTIFICADO/A                           {calidad_ministro_fe}`
  },
];

/* ══════════════════════════════════════════════════════════════
   PLANTILLAS — FASE DE DISCUSIÓN Y DEFENSA (12 tipos)
   ══════════════════════════════════════════════════════════════ */
const PLANTILLAS_DISCUSION = [
  // 1. Res. notifica cargos
  {
    code: 'MT-DIS-01',
    name: 'Notifica cargos al inculpado/a',
    desc: 'Resolución que ordena la notificación de los cargos formulados',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_cargos} de {fecha_cargos} que formuló cargos; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, mediante la resolución citada se han formulado cargos contra {nombre_inculpado}.
2° Que, conforme al artículo {articulo_notificacion} del {normativa_aplicable}, corresponde notificar personalmente al inculpado/a.

RESUELVO:
NOTIFÍQUESE personalmente a {nombre_inculpado} la Resolución Exenta N° {resolucion_cargos} de {fecha_cargos} que formuló cargos en su contra.
Hágasele saber que dispone de un plazo de {plazo_descargos} días hábiles, contados desde la notificación, para presentar sus descargos y solicitar las diligencias probatorias que estime pertinentes.

REGÍSTRESE.

{firma}`
  },

  // 2. Res. tiene por presentados descargos
  {
    code: 'MT-DIS-02',
    name: 'Tiene por presentados descargos',
    desc: 'Resolución que tiene por presentados los descargos del inculpado',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La presentación de {nombre_inculpado} de fecha {fecha_descargos}; la Resolución Exenta N° {resolucion_cargos} que formuló cargos; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, con fecha {fecha_descargos}, {nombre_inculpado} ha presentado sus descargos dentro del plazo legal.
2° Que, en su escrito de descargos solicita las siguientes diligencias probatorias: {diligencias_solicitadas}.

RESUELVO:
1° TÉNGANSE por presentados los descargos de {nombre_inculpado}, los que se agregan al expediente a fojas {fojas}.
2° En cuanto a las diligencias probatorias solicitadas: {decision_diligencias}.

NOTIFÍQUESE al inculpado/a. REGÍSTRESE.

{firma}`
  },

  // 3. Res. declara rebeldía por no presentar descargos
  {
    code: 'MT-DIS-03',
    name: 'Declara rebeldía del inculpado/a',
    desc: 'Resolución que declara la rebeldía por no presentar descargos en plazo',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_cargos} de {fecha_cargos} que formuló cargos; la notificación practicada el {fecha_notificacion}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, los cargos fueron notificados a {nombre_inculpado} con fecha {fecha_notificacion}.
2° Que, el plazo de {plazo_descargos} días hábiles para presentar descargos venció el {fecha_vencimiento_descargos}.
3° Que, a la fecha de la presente resolución, el/la inculpado/a no ha presentado descargos.

RESUELVO:
DECLÁRASE la REBELDÍA de {nombre_inculpado} por no haber presentado descargos dentro del plazo legal.
PROCÉDASE con el procedimiento conforme a derecho.

NOTIFÍQUESE. REGÍSTRESE.

{firma}`
  },

  // 4. Res. abre término probatorio
  {
    code: 'MT-DIS-04',
    name: 'Abre término probatorio',
    desc: 'Resolución que abre término probatorio extraordinario',
    applicableTo: ['SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
Los descargos presentados por {nombre_inculpado}; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, el/la inculpado/a ha solicitado la práctica de diligencias probatorias en su escrito de descargos.
2° Que, las diligencias solicitadas resultan pertinentes para el esclarecimiento de los hechos.

RESUELVO:
ÁBRESE TÉRMINO PROBATORIO extraordinario por {plazo_probatorio} días hábiles, contados desde la notificación de la presente resolución.
Durante dicho período se practicarán las siguientes diligencias:
{diligencias_aprobadas}

NOTIFÍQUESE al inculpado/a. REGÍSTRESE.

{firma}`
  },

  // 5. Res. resuelve sobre diligencias probatorias solicitadas
  {
    code: 'MT-DIS-05',
    name: 'Resuelve sobre diligencias probatorias',
    desc: 'Resolución que se pronuncia sobre las diligencias solicitadas en descargos',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
Los descargos de {nombre_inculpado} de fecha {fecha_descargos}; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, en su escrito de descargos, el/la inculpado/a solicita las siguientes diligencias probatorias:
{diligencias_solicitadas}
2° Que, analizadas conforme al principio de pertinencia, se resuelve lo siguiente:

RESUELVO:
{decision_por_diligencia}

NOTIFÍQUESE al inculpado/a. REGÍSTRESE.

{firma}`
  },

  // 6. Res. eleva vista fiscal / informe
  {
    code: 'MT-DIS-06',
    name: 'Eleva vista fiscal o informe final',
    desc: 'Resolución que eleva la vista fiscal o informe a la autoridad resolutiva',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_instruye} de {fecha_resolucion_instruye} que instruyó {tipo_procedimiento}; las diligencias del expediente; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, se han practicado todas las diligencias conducentes al esclarecimiento de los hechos.
2° Que, el expediente se encuentra en estado de emitir vista fiscal/informe final.
3° Que, conforme al artículo {articulo_elevar} del {normativa_aplicable}, procede elevar los antecedentes a la autoridad competente.

RESUELVO:
ELÉVANSEN los antecedentes del presente {tipo_procedimiento}, junto con la Vista Fiscal/Informe Final, a {autoridad_resolutiva} para su conocimiento y resolución.

El expediente consta de {numero_fojas} fojas útiles.

NOTIFÍQUESE Y REGÍSTRESE.

{firma}`
  },

  // 7. Res. tiene por presentada reconsideración
  {
    code: 'MT-DIS-07',
    name: 'Tiene por presentada reconsideración',
    desc: 'Resolución que tiene por presentado recurso de reconsideración',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La presentación de {nombre_recurrente} de fecha {fecha_recurso}; la Resolución Exenta N° {resolucion_recurrida} de {fecha_resolucion_recurrida}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, con fecha {fecha_recurso}, {nombre_recurrente} ha presentado recurso de reconsideración contra la Resolución Exenta N° {resolucion_recurrida}.
2° Que, el recurso ha sido interpuesto dentro del plazo legal de {plazo_recurso} días hábiles.

RESUELVO:
TÉNGASE por presentado el recurso de reconsideración interpuesto por {nombre_recurrente} contra la Resolución Exenta N° {resolucion_recurrida}.
ELÉVENSEN los antecedentes a {autoridad_resolutiva} para su resolución.

NOTIFÍQUESE. REGÍSTRESE.

{firma}`
  },

  // 8. Res. tiene por presentada apelación
  {
    code: 'MT-DIS-08',
    name: 'Tiene por presentada apelación',
    desc: 'Resolución que tiene por presentado recurso de apelación',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La presentación de {nombre_apelante} de fecha {fecha_apelacion}; la Resolución Exenta N° {resolucion_apelada}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, con fecha {fecha_apelacion}, {nombre_apelante} ha interpuesto recurso de apelación contra la Resolución Exenta N° {resolucion_apelada}.
2° Que, conforme al artículo {articulo_apelacion} del {normativa_aplicable}, el recurso ha sido interpuesto en tiempo y forma.

RESUELVO:
TÉNGASE por interpuesto recurso de apelación por {nombre_apelante} contra la Resolución Exenta N° {resolucion_apelada}.
ELÉVENSEN los antecedentes a {autoridad_apelacion} para su conocimiento y resolución.

NOTIFÍQUESE. REGÍSTRESE.

{firma}`
  },

  // 9. Res. ordena diligencia probatoria de descargos
  {
    code: 'MT-DIS-09',
    name: 'Ordena diligencia probatoria de descargos',
    desc: 'Resolución que ordena practicar diligencia probatoria solicitada en descargos',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
Los descargos de {nombre_inculpado}; la Resolución Exenta N° {resolucion_instruye} que instruyó {tipo_procedimiento}; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, en sus descargos el/la inculpado/a ha solicitado {diligencia_solicitada}.
2° Que, dicha diligencia resulta pertinente y conducente al esclarecimiento de los hechos.

RESUELVO:
DECRETASE la práctica de la siguiente diligencia probatoria: {diligencia_aprobada}.
Para su cumplimiento, {instrucciones_cumplimiento}.

NOTIFÍQUESE. REGÍSTRESE.

{firma}`
  },

  // 10. Res. cierre de periodo probatorio
  {
    code: 'MT-DIS-10',
    name: 'Cierre del período probatorio',
    desc: 'Resolución que declara cerrado el período de prueba',
    applicableTo: ['SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
La Resolución Exenta N° {resolucion_probatorio} que abrió término probatorio; las diligencias practicadas; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, ha vencido el término probatorio fijado por Resolución Exenta N° {resolucion_probatorio}.
2° Que, se han practicado las diligencias decretadas durante dicho período.

RESUELVO:
DECLÁRASE CERRADO el período probatorio del presente {tipo_procedimiento}.
PROCÉDASE a la emisión de la vista fiscal/informe final conforme a derecho.

REGÍSTRESE.

{firma}`
  },

  // 11. Res. certifica plazo de descargos
  {
    code: 'MT-DIS-11',
    name: 'Certifica vencimiento plazo de descargos',
    desc: 'Certificación del vencimiento del plazo para presentar descargos',
    applicableTo: ['IS','SA','PD'],
    structure: `CERTIFICACIÓN

En {ciudad}, a {fecha}, el/la suscrito/a CERTIFICA:

1° Que, la Resolución Exenta N° {resolucion_cargos} que formuló cargos fue notificada a {nombre_inculpado} con fecha {fecha_notificacion_cargos}.
2° Que, el plazo de {plazo_descargos} días hábiles para presentar descargos venció el {fecha_vencimiento}.
3° Que, a la fecha de la presente certificación, el/la inculpado/a {presento_o_no} descargos{fecha_descargos_si_presento}.

Es cuanto puedo certificar.

{nombre_certificador}
{calidad_certificador}
Universidad de Magallanes`
  },

  // 12. Res. devuelve expediente para complementar
  {
    code: 'MT-DIS-12',
    name: 'Devuelve expediente para complementar',
    desc: 'Resolución de la autoridad que devuelve el expediente para diligencias complementarias',
    applicableTo: ['IS','SA','PD'],
    structure: `RESOLUCIÓN EXENTA N° {numero_resolucion}

{ciudad}, {fecha}

VISTOS:
El {tipo_procedimiento} instruido por Resolución Exenta N° {resolucion_instruye}; la vista fiscal/informe final del fiscal/investigador/a; y las facultades que me confiere {normativa_aplicable}.

CONSIDERANDO:
1° Que, revisados los antecedentes del expediente, se advierte la necesidad de complementar la investigación con las siguientes diligencias: {diligencias_faltantes}.
2° Que, conforme a {normativa_devolucion}, la autoridad puede devolver el expediente para la práctica de diligencias complementarias.

RESUELVO:
DEVUÉLVANSE los antecedentes al Fiscal/Investigador/a para que, en el plazo de {plazo_dias} días hábiles, practique las siguientes diligencias complementarias:
{diligencias_ordenadas}

Cumplido lo anterior, elévensen nuevamente los antecedentes con la vista fiscal/informe actualizado.

NOTIFÍQUESE al Fiscal/Investigador/a. REGÍSTRESE.

{firma}`
  },
];

/* ══════════════════════════════════════════════════════════════
   REGISTRO GLOBAL + API
   ══════════════════════════════════════════════════════════════ */

// Combinar todas las plantillas
const ALL_MERO_TRAMITE = [
  ...PLANTILLAS_INDAGATORIA.map(p => ({ ...p, fase: 'indagatoria' })),
  ...PLANTILLAS_DISCUSION.map(p => ({ ...p, fase: 'discusion' })),
];

// Reemplazar {firma} por el bloque de firma correcto según tipo de procedimiento
function resolveTemplate(template, procType) {
  const firma = getFirmaBlock(procType);
  let resolved = template.structure.replace(/\{firma\}/g, firma);
  // Si es IS, sustituir también {nombre_fiscal_investigador} → {nombre_investigador}
  if (procType === 'IS') {
    resolved = resolved.replace(/\{calidad_fiscal\}/g, 'Investigador/a Sumario/a');
    resolved = resolved.replace(/\{actuario_presente\}/g, '');
    resolved = resolved.replace(/\{actuario_firma\}/g, '');
  } else {
    resolved = resolved.replace(/\{calidad_fiscal\}/g, 'Fiscal Instructor/a');
    resolved = resolved.replace(/\{actuario_presente\}/g, ', y ante {nombre_actuaria}, Actuario/a');
    resolved = resolved.replace(/\{actuario_firma\}/g, `

{nombre_actuaria}
ACTUARIO/A`);
  }
  return resolved;
}

// Obtener plantillas filtradas
function getMeroTramitePlantillas(filters) {
  let result = ALL_MERO_TRAMITE;
  if (filters?.fase && filters.fase !== 'all') {
    result = result.filter(p => p.fase === filters.fase);
  }
  if (filters?.procType && filters.procType !== 'all') {
    result = result.filter(p => p.applicableTo.includes(filters.procType));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  }
  return result;
}

// Exponer globalmente
window.ALL_MERO_TRAMITE = ALL_MERO_TRAMITE;
window.PROTOCOLOS_UMAG = PROTOCOLOS;
window.PROC_TYPES_UMAG = PROC_TYPES;
window.getMeroTramitePlantillas = getMeroTramitePlantillas;
window.resolveTemplate = resolveTemplate;
window.getFirmaBlock = getFirmaBlock;

})();
