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
      },
      timeout: 25000
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout (25s)'));
    });
    req.write(body);
    req.end();
  });
}

const PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).

CONTEXTO: La transcripción corresponde a una declaración rendida en el marco de un procedimiento disciplinario instruido por la Universidad de Magallanes. Actúo como Fiscal Investigadora.

REGLAS DE EDICIÓN:
- Conservar la redacción en primera persona y el estilo expresivo del declarante
- Solo correcciones gramaticales menores: concordancia, puntuación, eliminación de muletillas ("eh", "mmm", "o sea") y repeticiones innecesarias
- NO agregar información nueva ni interpretar intenciones
- Mantener palabras originales del declarante salvo errores gramaticales
- Unir frases fragmentadas para fluidez sin cambiar sentido
- Conservar comillas, fechas, cifras y nombres propios exactamente como están
- Tono formal, claro y preciso, coherente con documento legal
- Respetar terminología jurídica y secuencia cronológica

ENTREGA: Solo la versión final, sin comentarios ni marcas de edición.`;

const PROMPTS = {
  pregunta_respuesta: PROMPT_BASE + `

FORMATO: Pregunta-Respuesta
- Estructura el texto como diálogo formal entre Fiscal y declarante
- Cada pregunta precedida de "PREGUNTA:" o "FISCAL:"
- Cada respuesta precedida de "RESPUESTA:" o "DECLARANTE:"
- Párrafos separados, numerados si es posible`,

  directa: PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG — Declaración en procedimiento disciplinario.

Genera el documento completo con esta estructura EXACTA:

═══ ENCABEZADO ═══
UNIVERSIDAD DE MAGALLANES
DIRECCIÓN DE PERSONAL / [UNIDAD QUE CORRESPONDA]

**ACTA DE DECLARACIÓN DE [TESTIGO/DENUNCIANTE/PERSONA DENUNCIADA]**

En [LUGAR], a [FECHA EN PALABRAS], siendo las [HORA] horas, ante la Fiscal Investigadora [NOMBRE FISCAL], en el marco del procedimiento [TIPO] Rol N° [ROL], por presuntas infracciones a [MATERIA], comparece:

**[NOMBRE COMPLETO DEL DECLARANTE]**, quien previamente advertido/a de:
- Su obligación de decir verdad conforme al artículo 17 de la Ley N° 19.880
- Las penas del falso testimonio según los artículos 206 y siguientes del Código Penal
- Su derecho a no declarar contra sí mismo/a (si es persona denunciada)
- Las causales de inhabilidad

Declara no tener inhabilidad para declarar en este procedimiento y expone lo siguiente:

═══ CUERPO ═══
Declaración en formato pregunta-respuesta, con correcciones gramaticales aplicadas.

═══ CIERRE ═══
No habiendo más que agregar, y leída que le fue su declaración, se ratifica en ella y firma para constancia.

[Espacio firma]
_________________________________
[NOMBRE DECLARANTE]
[CALIDAD: Testigo / Denunciante / Persona denunciada]

[Espacio firma]
_________________________________
[NOMBRE FISCAL]
Fiscal Investigadora

Si falta algún dato, usar [COMPLETAR].`,

  con_expediente: PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG — Declaración en procedimiento disciplinario.
Usa los DATOS DEL EXPEDIENTE proporcionados para completar TODOS los campos del encabezado.
NO dejes campos como [COMPLETAR] si el dato está disponible en el contexto.

Genera el documento completo con esta estructura EXACTA:

═══ ENCABEZADO ═══
UNIVERSIDAD DE MAGALLANES

**ACTA DE [TIPO DE ACTA según metadatos]**

En [LUGAR], a [FECHA EN PALABRAS], ante la Fiscal Investigadora, en el marco del procedimiento [TIPO] Rol N° [ROL], por presuntas infracciones a [MATERIA], comparece:

**[NOMBRE DEL DECLARANTE]**, en calidad de [CALIDAD PROCESAL], quien previamente advertido/a de:
- Su obligación de decir verdad conforme al artículo 17 de la Ley N° 19.880
- Las penas del falso testimonio según los artículos 206 y siguientes del Código Penal
- Su derecho a no declarar contra sí mismo/a (si corresponde)
- Las causales de inhabilidad

Declara no tener inhabilidad y expone:

═══ CUERPO ═══
Declaración en formato pregunta-respuesta con correcciones.

═══ CIERRE ═══
Leída que le fue su declaración, se ratifica y firma.

_________________________________
[NOMBRE DECLARANTE] / [CALIDAD]

_________________________________
Fiscal Investigadora`,

  fill_acta: PROMPT_BASE + `

INSTRUCCIÓN ESPECIAL — MODO LLENAR ACTA EXISTENTE:
Se adjunta un DOCUMENTO BASE que es la plantilla/acta original con las preguntas del cuestionario.
Tu tarea es LLENAR esa plantilla con las respuestas extraídas del audio transcrito.

REGLAS:
1. PRESERVA la estructura exacta del documento base (encabezado, numeración, preguntas)
2. Después de cada pregunta del documento base, inserta la respuesta correspondiente del audio
3. Si una pregunta NO tiene respuesta en el audio, escribe: "[Sin respuesta en el audio]"
4. Si el audio contiene información adicional, agrégala al final como "DECLARACIÓN COMPLEMENTARIA"
5. Mantén el formato formal del documento base
6. Completa campos del encabezado con datos del expediente si están disponibles
7. Agrega cierre formal: "Leída que le fue su declaración, se ratifica y firma" con espacios para firmas`
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

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }) };
    }
    const { rawText, mode, caseContext, baseDocText } = body;
    if (!rawText) return { statusCode: 400, headers, body: JSON.stringify({ error: 'rawText requerido' }) };

    const systemPrompt = PROMPTS[mode] || PROMPTS.directa;
    let fullPrompt = systemPrompt;
    if (caseContext) fullPrompt += '\n' + caseContext;
    if (baseDocText) fullPrompt += '\n\nDOCUMENTO BASE (plantilla del acta — preservar su estructura y llenar con las respuestas del audio):\n' + baseDocText.substring(0, 5000);

    /* Pro plan: 26s timeout allows more text */
    const text = rawText.substring(0, 12000);
    const userMsg = mode === 'fill_acta'
      ? 'Llena el acta adjunta (DOCUMENTO BASE) con las respuestas de la siguiente transcripción de audio:\n\n' + text
      : 'Estructura la siguiente declaración transcrita como acta formal:\n\n' + text;

    const maxTok = (mode === 'fill_acta' || mode === 'con_expediente' || mode === 'directa') ? 8000 : 6000;
    const result = await callAnthropic(apiKey, fullPrompt, userMsg, maxTok);
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
