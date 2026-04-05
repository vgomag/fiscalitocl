/**
 * GENERATE-VISTA.JS — Generación de Vista Fiscal con IA
 * ──────────────────────────────────────────────────────
 * Genera un borrador completo de vista fiscal (opinión del fiscal investigador)
 * basándose en los datos del caso, diligencias, participantes y cronología.
 *
 * POST { caseId, caseData, diligencias, participants, chronology, mode }
 *   mode: "sancion" | "sobreseimiento" | "art129" (medida cautelar art 129)
 */
const https = require('https');
const { callAnthropic: _sharedCall, MODEL_SONNET } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');

/**
 * Generate Vista Fiscal — Generación automática de vista fiscal con IA.
 * Crea borradores de vista fiscal (sanción, sobreseimiento, medida cautelar).
 *
 * @route POST /.netlify/functions/generate-vista
 * @param {Object} body
 * @param {string} body.mode - 'sancion' | 'sobreseimiento' | 'art129'
 * @param {Object} body.caseData - Datos del caso (name, rol, caratula, etc.)
 * @param {Array<{diligencia_label, fecha_diligencia?, ai_summary?}>} [body.diligencias] - Documentos del caso
 * @param {Array<{name, role, estamento?, carrera?}>} [body.participants] - Participantes del procedimiento
 * @param {Array<{event_date, title, description?}>} [body.chronology] - Cronología de eventos
 * @param {string} [body.caseId] - ID del caso
 * @returns {Object}
 *   {
 *     vista: string,
 *     mode: string,
 *     caseName: string,
 *     usage: {inputTokens, outputTokens}
 *   }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */

/* Wrapper que usa Sonnet con timeout largo para generación de vistas */
function callAnthropic(apiKey, system, userMsg, maxTokens) {
  return _sharedCall(apiKey, system, userMsg, {
    model: MODEL_SONNET, maxTokens: maxTokens || 8000, timeout: 55000
  });
}

/* ── Construir contexto del caso ── */
function buildCaseContext(data) {
  const { caseData, diligencias, participants, chronology } = data;
  const c = caseData || {};
  const isInforme = data.mode === 'informe';

  let ctx = `EXPEDIENTE: ${c.name || 'Sin nombre'}\n`;
  ctx += `ROL: ${c.nueva_resolucion || c.rol || '—'}\n`;
  ctx += `Carátula: ${c.caratula || '—'}\n`;
  ctx += `Tipo: ${c.tipo_procedimiento || '—'}\n`;
  ctx += `Protocolo: ${c.protocolo || '—'}\n`;
  ctx += `Materia: ${c.materia || '—'}\n`;
  ctx += `Fecha denuncia: ${c.fecha_denuncia || '—'}\n`;
  ctx += `Fecha resolución instructora: ${c.fecha_resolucion || '—'}\n\n`;

  // Participantes
  if (participants && participants.length) {
    ctx += 'PARTICIPANTES:\n';
    participants.forEach(p => {
      ctx += `- ${p.name || '?'} (${p.role || '?'})`;
      if (p.estamento) ctx += ` — Est: ${p.estamento}`;
      if (p.carrera) ctx += ` — Carrera: ${p.carrera}`;
      ctx += '\n';
    });
    ctx += '\n';
  }

  // Diligencias — en modo informe incluir texto completo para CONSIDERANDOS detallados
  if (diligencias && diligencias.length) {
    ctx += `DILIGENCIAS (${diligencias.length} documentos):\n`;
    const maxDiligencias = isInforme ? 30 : 20;
    diligencias.slice(0, maxDiligencias).forEach((d, i) => {
      const fojas = d.fojas || '';
      ctx += `${i + 1}. ${d.diligencia_label || d.file_name || 'Doc ' + (i + 1)}`;
      if (fojas) ctx += ` (fojas ${fojas})`;
      if (d.fecha_diligencia) ctx += ` [${d.fecha_diligencia}]`;
      ctx += '\n';
      if (isInforme && d.extracted_text) {
        // En modo informe, incluir texto completo (hasta 2000 chars por diligencia)
        ctx += `   CONTENIDO COMPLETO:\n   ${d.extracted_text.slice(0, 2000)}\n`;
      } else if (d.ai_summary) {
        ctx += `   Resumen: ${d.ai_summary.slice(0, 300)}\n`;
      }
    });
    ctx += '\n';
  }

  // Cronología
  if (chronology && chronology.length) {
    ctx += 'CRONOLOGÍA:\n';
    chronology.slice(0, 15).forEach(ev => {
      ctx += `- ${ev.event_date || '?'}: ${ev.title || ev.description || '?'}\n`;
    });
    ctx += '\n';
  }

  // Observaciones e informe previo
  if (c.observaciones) ctx += `OBSERVACIONES: ${c.observaciones}\n`;
  if (c.informe_final) ctx += `INFORME PREVIO:\n${c.informe_final.slice(0, 2000)}\n`;

  // Modelos de referencia (informes terminados de otros expedientes)
  if (data.modelReports && data.modelReports.length) {
    ctx += '\n═══════════════════════════════════════\n';
    ctx += 'MODELOS DE REFERENCIA (informes finales de expedientes ya terminados):\n';
    ctx += 'Usa estos como guía de ESTILO, TONO, ESTRUCTURA y LENGUAJE INSTITUCIONAL.\n';
    ctx += '═══════════════════════════════════════\n\n';
    data.modelReports.forEach((m, i) => {
      ctx += `--- MODELO ${i + 1} (Exp. ${m.caseName || '?'}) ---\n`;
      ctx += (m.text || '').slice(0, 4000) + '\n\n';
    });
  }

  return ctx;
}

/* ── Prompts por modo ── */
const SYSTEM_PROMPTS = {
  sancion: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de VISTA FISCAL con propuesta de SANCIÓN para un procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA:
1. VISTOS — Identificación del expediente, resolución instructora, partes
2. CONSIDERANDO — Hechos probados, valoración de prueba, análisis jurídico
3. CALIFICACIÓN JURÍDICA — Normas infringidas, subsunción de conductas
4. CIRCUNSTANCIAS — Atenuantes y agravantes
5. PROPUESTA DE SANCIÓN — Tipo de sanción propuesta con fundamento
6. CONCLUSIÓN — Resumen y solicitud

REGLAS:
- Redacción formal, jurídica, en tercera persona
- Citar normas específicas (Estatuto Administrativo, protocolo aplicable, reglamento UMAG)
- Fundamentar cada conclusión en pruebas del expediente
- No inventar hechos ni pruebas que no estén en el contexto
- Usar "[COMPLETAR]" donde falte información específica
- Extensión: 3-5 páginas equivalentes`,

  sobreseimiento: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de VISTA FISCAL con propuesta de SOBRESEIMIENTO para un procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA:
1. VISTOS — Identificación del expediente
2. CONSIDERANDO — Análisis de los hechos investigados
3. FUNDAMENTOS DEL SOBRESEIMIENTO — Por qué no se configura la falta disciplinaria
4. CONCLUSIÓN — Propuesta formal de sobreseimiento

REGLAS:
- Redacción formal, jurídica, en tercera persona
- Explicar por qué los hechos no configuran falta o por qué la prueba es insuficiente
- No inventar hechos ni pruebas
- Usar "[COMPLETAR]" donde falte información
- Extensión: 2-3 páginas equivalentes`,

  art129: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de SOLICITUD DE MEDIDA CAUTELAR (Art. 129 EA) para un procedimiento disciplinario.

ESTRUCTURA:
1. ANTECEDENTES — Identificación del caso y urgencia
2. FUNDAMENTOS DE HECHO — Hechos que justifican la medida
3. FUNDAMENTOS DE DERECHO — Art. 129 Estatuto Administrativo y normativa aplicable
4. MEDIDA SOLICITADA — Tipo de medida cautelar (ej: suspensión preventiva, cambio funciones)
5. PETITORIO

REGLAS:
- Demostrar la urgencia y proporcionalidad de la medida
- Citar artículo 129 del Estatuto Administrativo
- No inventar hechos
- Usar "[COMPLETAR]" donde falte información`,

  informe: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).
Tu tarea es generar un borrador completo de INFORME DE LA INVESTIGADORA / VISTA FISCAL para un procedimiento disciplinario o investigación sumaria. Este documento es el informe final que la fiscal investigadora o actuaria presenta a la autoridad instructora.

═══════════════════════════════════════
MODELO DE ESTILO INSTITUCIONAL
═══════════════════════════════════════

El informe DEBE replicar fielmente el estilo, tono y lenguaje de los informes institucionales de la UMAG. A continuación se presenta un ejemplo real del estilo esperado que DEBES seguir como modelo:

--- INICIO EJEMPLO DE ESTILO ---
INFORME DE LA INVESTIGADORA
____________________________________________________________________
Punta Arenas, [FECHA]
VISTOS:
En el marco de la investigación sumaria, ordenada instruir por Resolución N°[NÚMERO], de fecha [FECHA], de [AUTORIDAD] de la Universidad de Magallanes. Los antecedentes acumulados en el curso de la presente investigación y que rolan de fojas 01 a [ÚLTIMA FOJA] del expediente investigativo; Los reglamentos o normas que rigen esta investigación, donde se incluyen, [NORMAS APLICABLES].-

                      CONSIDERANDO:
1.      Que, a fojas [XX], consta [DOCUMENTO], mediante el cual se [DESCRIPCIÓN DETALLADA DEL CONTENIDO, incluyendo nombres completos, cargos, fechas exactas y hechos relevantes con lenguaje formal administrativo];
2.      Que, a fojas [XX], consta [DOCUMENTO SIGUIENTE], [DESCRIPCIÓN DETALLADA]...
--- FIN EJEMPLO DE ESTILO ---

═══════════════════════════════════════
ESTRUCTURA OBLIGATORIA
═══════════════════════════════════════

1. ENCABEZADO:
   - Título: "INFORME DE LA INVESTIGADORA" (o "VISTA FISCAL" según corresponda)
   - Línea horizontal de subrayado
   - Lugar y fecha: "Punta Arenas, [fecha actual]"

2. VISTOS:
   - Identificación de la resolución que ordena instruir (número, fecha, autoridad)
   - Rango de fojas del expediente ("rolan de fojas 01 a [XX]")
   - Enumeración COMPLETA de todos los reglamentos, decretos, protocolos y normas aplicables
   - Cada norma con su número, fecha y descripción oficial completa
   - Terminar con ".-"

3. CONSIDERANDO:
   - Un numeral por CADA diligencia o pieza del expediente, siguiendo el orden de fojas
   - Cada numeral inicia con: "Que, a fojas [XX], consta [tipo de documento]..."
   - DESARROLLAR EN EXTENSO el contenido de cada diligencia: nombres completos con tratamiento formal ("doña", "don"), cargos institucionales, fechas exactas, y una síntesis jurídica del contenido
   - Si es una declaración: resumir lo declarado con lenguaje indirecto formal ("manifiesta que...", "señala que...", "indica que...")
   - Si es un documento administrativo: describir su contenido y relevancia procesal
   - Usar expresiones propias del derecho administrativo chileno: "obra", "rola", "consta", "se desprende", "se advierte"
   - NO resumir telegráficamente. Cada considerando debe ser un párrafo completo y detallado

4. ANÁLISIS JURÍDICO (cuando corresponda):
   - Subsunción de los hechos en las normas aplicables
   - Valoración de la prueba reunida
   - Razonamiento jurídico formal

5. CONCLUSIÓN / POR TANTO:
   - Resumen de los hechos establecidos
   - Propuesta fundamentada (sanción, sobreseimiento, etc.)

═══════════════════════════════════════
REGLAS DE ESTILO IMPERATIVAS
═══════════════════════════════════════

- NUNCA usar formato Markdown (ni **, ni ##, ni -, ni *). El documento es texto plano formal
- Redacción en TERCERA PERSONA, formal, jurídica, administrativa
- Usar tratamiento "doña" / "don" antes de nombres propios
- Citar SIEMPRE la foja donde consta cada antecedente
- Los considerandos se numeran con números arábigos seguidos de punto y tabulación: "1.      Que,..."
- Párrafos extensos y detallados, NO telegráficos
- Vocabulario jurídico-administrativo chileno: "rolan", "obran", "constan", "se desprende de autos", "atendido lo expuesto", "en mérito de lo anterior"
- Citar normas con su denominación oficial completa (Decreto N°XX/SU/YYYY, Ley N°XX.XXX, DFL N°XX)
- Fechas en formato extenso: "de fecha 25 de octubre de 2024"
- NO inventar hechos ni pruebas que no estén en el contexto proporcionado
- Usar "[COMPLETAR]" donde falte información específica
- Si se proporcionan MODELOS DE REFERENCIA de otros expedientes, usarlos como guía de estilo y tono, pero NUNCA copiar hechos de esos modelos al informe actual
- Extensión: el documento debe ser TAN EXTENSO como lo requiera el expediente. Cada diligencia merece su propio considerando detallado. Un expediente con 12 diligencias debería tener al menos 12 considerandos sustantivos`
};

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'API key no configurada' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'generate-vista');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const data = JSON.parse(event.body);
    const bodyStr = JSON.stringify(data);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { mode } = data;

    if (!mode || !SYSTEM_PROMPTS[mode]) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'mode inválido. Use: sancion, sobreseimiento, art129' })
      };
    }

    const context = buildCaseContext(data);
    const system = SYSTEM_PROMPTS[mode];
    const docLabel = mode === 'informe' ? 'informe de la investigadora' : 'vista fiscal';
    const userMsg = `Con base en la siguiente información del expediente, genera el borrador de ${docLabel}:\n\n${context}`;

    // Estimar tokens (aprox 4 chars per token)
    const inputTokens = Math.ceil((system.length + userMsg.length) / 4);
    const maxInput = mode === 'informe' ? 60000 : 30000;
    if (inputTokens > maxInput) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'Contexto demasiado extenso. Reduzca la cantidad de diligencias.' })
      };
    }

    // Modo informe necesita más tokens de salida para documentos extensos
    const maxOutputTokens = mode === 'informe' ? 16000 : 8000;
    const res = await callAnthropic(apiKey, system, userMsg, maxOutputTokens);

    if (res.error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: res.error.message || 'Error de API' })
      };
    }

    const generatedText = res.content?.[0]?.text || '';
    const usage = res.usage || {};

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({
        vista: generatedText,
        mode,
        usage: {
          inputTokens: usage.input_tokens || inputTokens,
          outputTokens: usage.output_tokens || 0
        },
        caseName: data.caseData?.name || ''
      })
    };

  } catch (err) {
    console.error('generate-vista error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message })
    };
  }
};
