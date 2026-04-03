/**
 * STRUCTURE.JS — Structuring function for transcription actas
 * Uses Claude Haiku (fast) for formatting transcriptions into formal documents.
 * Netlify Functions v2 format (ESM).
 */

const PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).

Instrucción de trabajo para incorporación de declaración transcrita al acta:

Elabora un Texto Refundido, Coordinado y Sistematizado que incorpore el contenido de la declaración en audio, integrándolo al acta que se adjuntan. El documento final debe presentarse en formato pregunta-respuesta, respetando la estructura del acta.

La transcripción corresponde a una declaración rendida en el marco de un procedimiento disciplinario instruido por la Universidad de Magallanes, en el cual actúo como Fiscal Investigadora.

La transcripción contiene expresiones propias del lenguaje oral, incluyendo frases coloquiales, repeticiones y muletillas. Es importante que se conserve, en lo posible, la redacción en primera persona y el estilo expresivo del declarante, realizando únicamente correcciones gramaticales menores, tales como concordancia, puntuación y eliminación de repeticiones innecesarias que no alteren el sentido ni el tono del testimonio.

Una vez integradas todas las partes, el documento debe presentar una redacción fluida, coherente y ordenada, que facilite su comprensión sin desvirtuar el contenido ni el contexto de lo declarado.

OBJETIVO:
- Mejorar la gramática, claridad y coherencia del texto.
- Eliminar muletillas ("eh", "mmm") y repeticiones innecesarias.
- Conservar la estructura lógica de los párrafos y la secuencia cronológica de los hechos.
- Respetar la terminología jurídica y los nombres propios tal como aparecen en la transcripción.

INSTRUCCIONES ESPECÍFICAS:
- No agregar información nueva ni interpretar intenciones; solo reescribir lo existente.
- Mantener las palabras originales del declarante siempre que no afecten la corrección gramatical.
- Unir frases fragmentadas cuando sea necesario para fluidez, sin cambiar el sentido.
- Conservar comillas, fechas y cifras exactamente como están.
- Usar un tono formal, claro y preciso, coherente con un documento legal.

FORMATO DE ENTREGA:
- Texto corregido en formato pregunta-respuesta con párrafos separados.
- Sin comentarios ni marcadores de edición; solo la versión final.`;

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

/* ── Rate Limiting ── */
const _RL_LIMITS = { chat:60, structure:60, rag:60, 'qdrant-ingest':30, 'drive-extract':30 };
async function _checkRL(token, endpoint) {
  if (!token) return { allowed: true };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { allowed: true };
    const uid = JSON.parse(atob(parts[1])).sub;
    if (!uid) return { allowed: true };
    const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
    const sbKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY');
    if (!sbUrl || !sbKey) return { allowed: true };
    const r = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ p_user_id: uid, p_endpoint: endpoint, p_max_requests: _RL_LIMITS[endpoint] || 60, p_window_minutes: 60 }),
    });
    if (!r.ok) return { allowed: true };
    return (await r.json()) || { allowed: true };
  } catch (e) { return { allowed: true }; }
}

export default async (req) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (req.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: CORS
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, CORS);
  }

  /* Auth opcional — no bloquear si no hay token */
  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    console.warn('[structure] Sin x-auth-token, continuando sin auth');
  }

  try {
    const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');

    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return json({ error: 'Payload too large' }, 413, CORS);
    }

    const _rl = await _checkRL(authToken, 'structure');
    if (!_rl.allowed) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: _rl.limit, remaining: 0 }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }
    const { rawText, mode, caseContext, baseDocText } = body;
    if (!rawText) return json({ error: 'rawText requerido' }, 400, CORS);

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

    return json({ ok: true, structuredText: structured, charCount: structured.length }, 200, CORS);

  } catch (err) {
    return json({ error: err.message }, 400, CORS);
  }
};

function json(data, status, cors = {}) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...cors
    }
  });
}