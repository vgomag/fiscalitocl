/**
 * STRUCTURE.JS — Structuring function optimized for speed
 * Uses Claude Haiku (3-5x faster than Sonnet) for formatting transcriptions
 * into formal actas. Sonnet-level analysis is not needed for formatting.
 */
const https = require('https');

function callAnthropic(apiKey, system, userMsg, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 3000,
      system,
      messages: [{ role: 'user', content: userMsg }]
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes.

Instrucción de trabajo para incorporación de declaración transcrita al acta:
Elabora un Texto Refundido, Coordinado y Sistematizado que incorpore el contenido de la declaración en audio, integrándolo al acta que se adjunta. El documento final debe presentarse en formato pregunta-respuesta, respetando la estructura del acta.

La transcripción corresponde a una declaración rendida en el marco de un procedimiento disciplinario instruido por la Universidad de Magallanes, en el cual actúo como Fiscal Investigadora.

La transcripción contiene expresiones propias del lenguaje oral, incluyendo frases coloquiales, repeticiones y muletillas. Es importante que se conserve, en lo posible, la redacción en primera persona y el estilo expresivo del declarante, realizando únicamente correcciones gramaticales menores, tales como concordancia, puntuación y eliminación de repeticiones innecesarias que no alteren el sentido ni el tono del testimonio.

Una vez integradas todas las partes, el documento debe presentar una redacción fluida, coherente y ordenada, que facilite su comprensión sin desvirtuar el contenido ni el contexto de lo declarado.

Objetivo:
- Mejorar la gramática, claridad y coherencia del texto
- Eliminar muletillas ("eh", "mmm") y repeticiones innecesarias
- Conservar la estructura lógica de los párrafos y la secuencia cronológica de los hechos
- Respetar la terminología jurídica y los nombres propios tal como aparecen en la transcripción

Instrucciones específicas:
- No agregar información nueva ni interpretar intenciones; solo reescribir lo existente
- Mantener las palabras originales del declarante siempre que no afecten la corrección gramatical
- Unir frases fragmentadas cuando sea necesario para fluidez, sin cambiar el sentido
- Conservar comillas, fechas y cifras exactamente como están
- Usar un tono formal, claro y preciso, coherente con un documento legal

Formato de entrega:
- Texto corregido en formato pregunta-respuesta con párrafos separados
- Sin comentarios ni marcadores de edición; solo la versión final`;

const PROMPTS = {
  pregunta_respuesta: PROMPT_BASE,

  directa: PROMPT_BASE + `

FORMATO ADICIONAL: Estructura como ACTA FORMAL de declaración rendida en procedimiento disciplinario.
Incluir encabezado institucional, cuerpo de declaración en párrafos y cierre con "Leída que le fue su declaración, se ratifica y firma" más espacios para firmas.`,

  con_expediente: PROMPT_BASE + `

FORMATO ADICIONAL: Estructura como ACTA FORMAL institucional COMPLETA.
1. ENCABEZADO FORMAL:
   - Título: "ACTA DE DECLARACIÓN" (o "ACTA DE DECLARACIÓN DE TESTIGO" según corresponda)
   - Nombre del expediente y ROL
   - Fecha de la declaración
   - Nombre del/la fiscal o investigador/a
   - Nombre del/la declarante con su calidad procesal (denunciante, denunciado/a, testigo)
   - Tipo de procedimiento y materia investigada

2. CUERPO: Declaración en formato pregunta-respuesta con las correcciones gramaticales.

3. CIERRE FORMAL:
   - "Leída que le fue su declaración, se ratifica y firma"
   - Espacios para firmas del/la declarante, fiscal y actuario/a
   - Si falta algún dato del expediente, marcar como [COMPLETAR]`
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-auth-token'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');

    const { rawText, mode, caseContext, baseDocText } = JSON.parse(event.body || '{}');
    if (!rawText) return { statusCode: 400, headers, body: JSON.stringify({ error: 'rawText requerido' }) };

    const systemPrompt = PROMPTS[mode] || PROMPTS.directa;
    let fullPrompt = systemPrompt;
    if (caseContext) fullPrompt += '\n' + caseContext;
    if (baseDocText) fullPrompt += '\n\nDOCUMENTO BASE:\n' + baseDocText.substring(0, 3000);

    /* Allow more text for better quality structuring */
    const text = rawText.substring(0, 8000);
    const userMsg = 'Estructura la siguiente declaración transcrita:\n\n' + text;

    const result = await callAnthropic(apiKey, fullPrompt, userMsg, 4000);
    const structured = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';

    if (!structured) throw new Error('No se generó texto estructurado');

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, structuredText: structured, charCount: structured.length })
    };

  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
  }
};
