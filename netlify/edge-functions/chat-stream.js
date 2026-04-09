/**
 * Chat Stream — Streaming SSE para respuestas de Claude en tiempo real.
 * Endpoint de baja latencia usando Netlify Edge Functions.
 * Reenvía el stream SSE de Anthropic directamente al cliente.
 *
 * @route POST /api/chat-stream
 * @param {Object} body
 * @param {string} [body.model] - Modelo Claude a usar (default: claude-sonnet-4-20250514)
 * @param {number} [body.max_tokens] - Máximo de tokens (default: 2000)
 * @param {string} [body.system] - System prompt
 * @param {Array<{role:string, content:string}>} body.messages - Mensajes conversacionales
 * @returns {Response}
 *   SSE stream con eventos de tipo "content_block_start", "content_block_delta", "message_stop"
 *   Cada delta contiene: {type:'content_block_delta', delta:{type:'text_delta', text:'...'}}
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario (heredado del endpoint /chat)
 */
export default async (req) => {
  const MODEL_SONNET = Netlify.env.get('CLAUDE_MODEL_SONNET') || 'claude-sonnet-4-20250514';

  /* #11: CORS dinámico en vez de wildcard */
  const _origin = req.headers.get('Origin') || '';
  const _allowedOrigins = (Netlify.env.get('ALLOWED_ORIGINS') || '').split(',').map(s=>s.trim()).filter(Boolean);
  const _corsOrigin = _allowedOrigins.includes(_origin) ? _origin : (_allowedOrigins[0] || _origin || 'https://fiscalito.cl');
  const CORS = {
    'Access-Control-Allow-Origin': _corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
  }

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    const key = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!key) return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    /* Validar messages */
    if (!Array.isArray(body.messages) || !body.messages.length) {
      return new Response(JSON.stringify({ error: 'messages requerido' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    /* Limitar max_tokens — subido a 32000 para permitir vistas fiscales completas (F7) */
    const maxTokens = Math.min(Math.max(parseInt(body.max_tokens) || 2000, 1), 32000);

    /* AbortController con timeout adaptativo: hasta 10 min para vistas fiscales (F7/F8) */
    const _maxTokensReq = parseInt(body.max_tokens) || 2000;
    const _timeoutMs = _maxTokensReq >= 24000 ? 600000  /* 10 min para F7 */
                     : _maxTokensReq >= 12000 ? 480000  /* 8 min para F8 */
                     : _maxTokensReq >= 6000  ? 240000  /* 4 min para F5/F6/F12 */
                     : 120000;                          /* 2 min para el resto */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), _timeoutMs);

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: body.model || MODEL_SONNET,
          max_tokens: maxTokens,
          system: body.system,
          messages: body.messages,
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr.name === 'AbortError' ? 'Stream timeout (120s)' : fetchErr.message;
      return new Response(JSON.stringify({ error: msg }), { status: 504, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (!res.ok) {
      clearTimeout(timeout);
      const errData = await res.text();
      return new Response(errData, { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    /* Wrap stream to clean up timeout on completion */
    const upstream = res.body;
    const transform = new TransformStream({
      flush() { clearTimeout(timeout); }
    });
    upstream.pipeTo(transform.writable).catch(() => clearTimeout(timeout));

    return new Response(transform.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
};

export const config = { path: '/api/chat-stream' };
