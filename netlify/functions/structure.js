/**
 * STRUCTURE.JS — Structuring function for transcription actas
 * Uses Claude Haiku (fast) for formatting transcriptions into formal documents.
 * Netlify Functions v2 format (ESM).
 */

const PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).

OBJETIVO: Elaborar un Texto Refundido, Coordinado y Sistematizado que incorpore el contenido de la declaración transcrita, integrándolo al acta.

REGLAS DE EDICIÓN:
- Conservar la redacción en primera persona y el estilo del declarante
- Solo correcciones gramaticales menores: concordancia, puntuación, eliminación de muletillas
- NO agregar información nueva ni interpretar intenciones
- Conservar comillas, fechas, cifras y nombres propios exactamente como están
- Tono formal, claro y preciso, coherente con documento legal
- Respetar la terminología jurídica y la secuencia cronológica

ENTREGA: Solo la versión final, sin comentarios ni marcadores de edición.`;

const PROMPTS = {
  pregunta_respuesta: PROMPT_BASE + `

FORMATO: Pregunta-Respuesta
- Estructura como diálogo formal entre Fiscal y declarante
- Cada pregunta: "FISCAL:" / Cada respuesta: "DECLARANTE:"
- Párrafos separados, numerados si es posible`,

  directa: PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG

Genera con esta estructura:

UNIVERSIDAD DE MAGALLANES

**ACTA DE DECLARACIÓN DE [TESTIGO/DENUNCIANTE/PERSONA DENUNCIADA]**

En [LUGAR], a [FECHA], ante la Fiscal Investigadora, en el marco del procedimiento [TIPO] Rol N° [ROL], comparece:

**[NOMBRE]**, previamente advertido/a de:
- Obligación de decir verdad (art. 17 Ley 19.880)
- Penas del falso testimonio (arts. 206 y ss. CP)
- Derecho a no declarar contra sí mismo/a (si corresponde)

Declara no tener inhabilidad y expone:

[CUERPO EN FORMATO Q&A]

Leída que le fue su declaración, se ratifica y firma.

_________________________________
[NOMBRE DECLARANTE] / [CALIDAD]

_________________________________
Fiscal Investigadora

Si falta algún dato, usar [COMPLETAR].`,

  con_expediente: PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG — con datos del expediente.
Usa los DATOS DEL EXPEDIENTE para completar TODOS los campos del encabezado.
NO dejes [COMPLETAR] si el dato está disponible.

Genera con esta estructura:

UNIVERSIDAD DE MAGALLANES

**ACTA DE [TIPO DE ACTA según metadatos]**

En [LUGAR], a [FECHA], ante la Fiscal Investigadora, en el marco del procedimiento [TIPO] Rol N° [ROL], comparece:

**[NOMBRE DEL DECLARANTE]**, en calidad de [CALIDAD PROCESAL], previamente advertido/a de:
- Obligación de decir verdad (art. 17 Ley 19.880)
- Penas del falso testimonio (arts. 206 y ss. CP)
- Derecho a no declarar contra sí mismo/a (si corresponde)

Declara no tener inhabilidad y expone:

[CUERPO EN FORMATO Q&A]

Leída que le fue su declaración, se ratifica y firma.

_________________________________
[NOMBRE DECLARANTE] / [CALIDAD]

_________________________________
Fiscal Investigadora`,

  fill_acta: PROMPT_BASE + `

MODO LLENAR ACTA EXISTENTE:
Se adjunta un DOCUMENTO BASE (plantilla/acta con preguntas).
LLENA esa plantilla con las respuestas del audio transcrito.

REGLAS:
1. PRESERVA la estructura del documento base
2. Después de cada pregunta, inserta la respuesta del audio
3. Si no hay respuesta: "[Sin respuesta en el audio]"
4. Info adicional al final como "DECLARACIÓN COMPLEMENTARIA"
5. Agrega cierre formal con espacios para firmas`
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,x-auth-token'
      }
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  /* Verificar autenticación */
  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    return json({ error: 'No autorizado — sesión requerida' }, 401);
  }

  try {
    const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');

    const body = await req.json();
    const { rawText, mode, caseContext, baseDocText } = body;
    if (!rawText) return json({ error: 'rawText requerido' }, 400);

    const systemPrompt = PROMPTS[mode] || PROMPTS.directa;
    let fullPrompt = systemPrompt;
    if (caseContext) fullPrompt += '\n' + caseContext;
    if (baseDocText) fullPrompt += '\n\nDOCUMENTO BASE (preservar estructura y llenar con audio):\n' + baseDocText.substring(0, 5000);

    const text = rawText.substring(0, 14000);
    const userMsg = mode === 'fill_acta'
      ? 'Llena el acta adjunta (DOCUMENTO BASE) con las respuestas de esta transcripción:\n\n' + text
      : 'Elabora el Texto Refundido de esta declaración transcrita:\n\n' + text;

    /* max_tokens por modo */
    const maxTok = (mode === 'fill_acta' || mode === 'con_expediente') ? 8000
                 : mode === 'directa' ? 7000
                 : 5000;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTok,
        system: fullPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = 'Anthropic HTTP ' + res.status;
      try { const j = JSON.parse(errText); errMsg = j.error?.message || errMsg; } catch(e) {}
      throw new Error(errMsg);
    }

    const result = await res.json();
    const structured = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';

    if (!structured) throw new Error('No se generó texto estructurado');

    return json({ ok: true, structuredText: structured, charCount: structured.length });

  } catch (err) {
    return json({ error: err.message }, 400);
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,x-auth-token'
    }
  });
}

export const config = { path: '/.netlify/functions/structure' };
