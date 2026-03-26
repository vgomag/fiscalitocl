export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  /* ── Verificar autenticación via Supabase token ── */
  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    return json({ error: 'No autorizado — sesión requerida' }, 401);
  }

  try {
    const body = await req.json();

    /* ═══ MODO TRANSCRIPCIÓN ═══ */
    if (body.mode === 'transcribe') {
      const openaiKey = Netlify.env.get('OPENAI_API_KEY');
      const elevenKey = Netlify.env.get('ELEVENLABS_API_KEY');
      if (!openaiKey && !elevenKey) return json({ error: 'No API key de transcripción' }, 500);
      const { audioBase64, fileName, mimeType } = body;
      if (!audioBase64) return json({ error: 'No audio' }, 400);
      const audioBytes = Buffer.from(audioBase64, 'base64');
      let transcript = null, provider = null;
      if (openaiKey) {
        try {
          const boundary = '----B' + Date.now();
          const parts = [];
          addField(parts, boundary, 'model', 'whisper-1');
          addField(parts, boundary, 'language', 'es');
          addField(parts, boundary, 'response_format', 'text');
          addFile(parts, boundary, 'file', fileName || 'audio.wav', mimeType || 'audio/wav', audioBytes);
          parts.push(Buffer.from('--' + boundary + '--\r\n'));
          const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + openaiKey, 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: Buffer.concat(parts)
          });
          if (r.ok) { transcript = await r.text(); provider = 'whisper'; }
        } catch (e) { console.log('Whisper:', e.message); }
      }
      if (elevenKey && !transcript) {
        try {
          const boundary = '----B' + Date.now();
          const parts = [];
          addField(parts, boundary, 'model_id', 'scribe_v1');
          addField(parts, boundary, 'language_code', 'spa');
          addFile(parts, boundary, 'file', fileName || 'audio.wav', mimeType || 'audio/wav', audioBytes);
          parts.push(Buffer.from('--' + boundary + '--\r\n'));
          const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST', headers: { 'xi-api-key': elevenKey, 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: Buffer.concat(parts)
          });
          if (r.ok) { const d = await r.json(); transcript = d.text || ''; provider = 'elevenlabs'; }
        } catch (e) { console.log('ElevenLabs:', e.message); }
      }
      if (!transcript) return json({ error: 'Transcripción falló' }, 500);
      return json({ transcript, provider });
    }

    /* ═══ MODO NORMAL — Claude ═══ */
    const key = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'API key no configurada' }, 500);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 2000,
        system: body.system,
        messages: body.messages,
      }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

function addField(p, b, n, v) { p.push(Buffer.from('--'+b+'\r\nContent-Disposition: form-data; name="'+n+'"\r\n\r\n'+v+'\r\n')); }
function addFile(p, b, n, f, m, d) { p.push(Buffer.from('--'+b+'\r\nContent-Disposition: form-data; name="'+n+'"; filename="'+f+'"\r\nContent-Type: '+m+'\r\n\r\n')); p.push(d); p.push(Buffer.from('\r\n')); }
function json(d, s) { return new Response(JSON.stringify(d), { status: s||200, headers: { 'Content-Type': 'application/json' } }); }

export const config = { path: '/.netlify/functions/chat' };
