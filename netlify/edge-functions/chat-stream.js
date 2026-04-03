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

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: body.model || MODEL_SONNET,
        max_tokens: body.max_tokens || 2000,
        system: body.system,
        messages: body.messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errData = await res.text();
      return new Response(errData, { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    return new Response(res.body, {
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
