export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
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
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 2000,
        system: body.system,
        messages: body.messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errData = await res.text();
      return new Response(errData, { status: res.status, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const config = { path: '/api/chat-stream' };
