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
      const { audioBase64, signedUrl, storageBucket, storagePath, fileName, mimeType } = body;

      /* Obtener audio: base64 directo, URL firmada, o descarga de Supabase Storage */
      let audioBytes;
      if (audioBase64) {
        audioBytes = Buffer.from(audioBase64, 'base64');
      } else if (signedUrl) {
        try {
          const dlResp = await fetch(signedUrl);
          if (!dlResp.ok) throw new Error('HTTP ' + dlResp.status);
          audioBytes = Buffer.from(await dlResp.arrayBuffer());
        } catch (e) {
          return json({ error: 'Error descargando audio: ' + e.message }, 400);
        }
      } else if (storageBucket && storagePath) {
        try {
          const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
          const sbServiceKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY');
          const sbAnonKey = Netlify.env.get('SUPABASE_ANON_KEY');
          if (!sbUrl) throw new Error('SUPABASE_URL not configured');
          /* Prefer service_role key; fallback to anon key + user token */
          const dlKey = sbServiceKey || sbAnonKey;
          const dlBearer = sbServiceKey || authToken;
          if (!dlKey) throw new Error('No Supabase key available');
          const dlUrl = `${sbUrl}/storage/v1/object/authenticated/${storageBucket}/${storagePath}`;
          const dlResp = await fetch(dlUrl, {
            headers: { 'Authorization': 'Bearer ' + dlBearer, 'apikey': dlKey }
          });
          if (!dlResp.ok) throw new Error('Storage download HTTP ' + dlResp.status);
          audioBytes = Buffer.from(await dlResp.arrayBuffer());
        } catch (e) {
          return json({ error: 'Error descargando audio de Storage: ' + e.message }, 400);
        }
      } else {
        return json({ error: 'No audio (ni audioBase64 ni signedUrl)' }, 400);
      }

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

    /* ═══ MODO NORMAL — Claude (con streaming) ═══ */
    const key = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'API key no configurada' }, 500);

    /* Si el cliente pide streaming (stream: true en body) */
    if (body.stream) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
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

      /* Reenviar el stream SSE de Anthropic directamente al cliente */
      return new Response(res.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    /* Modo sin streaming (fallback para compatibilidad) */
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
