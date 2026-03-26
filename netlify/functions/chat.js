export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await req.json();

    /* ═══════════════════════════════════════════
       MODO TRANSCRIPCIÓN — Whisper / ElevenLabs
       body.mode === 'transcribe'
       ═══════════════════════════════════════════ */
    if (body.mode === 'transcribe') {
      const openaiKey = Netlify.env.get('OPENAI_API_KEY');
      const elevenKey = Netlify.env.get('ELEVENLABS_API_KEY');
      
      if (!openaiKey && !elevenKey) {
        return json({ error: 'No hay API key de transcripción (OPENAI_API_KEY o ELEVENLABS_API_KEY)' }, 500);
      }

      const { audioBase64, fileName, mimeType } = body;
      if (!audioBase64) return json({ error: 'No se recibió audio' }, 400);

      const audioBytes = Buffer.from(audioBase64, 'base64');
      let transcript = null;
      let provider = null;

      // 1) OpenAI Whisper
      if (openaiKey && !transcript) {
        try {
          const boundary = '----Bnd' + Date.now();
          const parts = [];
          
          addField(parts, boundary, 'model', 'whisper-1');
          addField(parts, boundary, 'language', 'es');
          addField(parts, boundary, 'response_format', 'text');
          addFile(parts, boundary, 'file', fileName || 'audio.wav', mimeType || 'audio/wav', audioBytes);
          parts.push(Buffer.from('--' + boundary + '--\r\n'));
          
          const multipart = Buffer.concat(parts);

          const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + openaiKey,
              'Content-Type': 'multipart/form-data; boundary=' + boundary,
            },
            body: multipart,
          });

          if (resp.ok) {
            transcript = await resp.text();
            provider = 'whisper';
          } else {
            const err = await resp.text();
            console.log('Whisper error:', resp.status, err.substring(0, 200));
          }
        } catch (e) { console.log('Whisper failed:', e.message); }
      }

      // 2) ElevenLabs
      if (elevenKey && !transcript) {
        try {
          const boundary = '----Bnd' + Date.now();
          const parts = [];
          
          addField(parts, boundary, 'model_id', 'scribe_v1');
          addField(parts, boundary, 'language_code', 'spa');
          addFile(parts, boundary, 'file', fileName || 'audio.wav', mimeType || 'audio/wav', audioBytes);
          parts.push(Buffer.from('--' + boundary + '--\r\n'));

          const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
            method: 'POST',
            headers: {
              'xi-api-key': elevenKey,
              'Content-Type': 'multipart/form-data; boundary=' + boundary,
            },
            body: Buffer.concat(parts),
          });

          if (resp.ok) {
            const data = await resp.json();
            transcript = data.text || '';
            provider = 'elevenlabs';
          }
        } catch (e) { console.log('ElevenLabs failed:', e.message); }
      }

      if (!transcript) return json({ error: 'No se pudo transcribir el audio' }, 500);
      return json({ transcript, provider });
    }

    /* ═══════════════════════════════════════════
       MODO NORMAL — Claude / Anthropic
       ═══════════════════════════════════════════ */
    const key = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'API key no configurada' }, 500);

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
      }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

/* ── Helpers multipart ── */
function addField(parts, boundary, name, value) {
  parts.push(Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
    value + '\r\n'
  ));
}

function addFile(parts, boundary, name, filename, mime, data) {
  parts.push(Buffer.from(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="' + name + '"; filename="' + filename + '"\r\n' +
    'Content-Type: ' + mime + '\r\n\r\n'
  ));
  parts.push(data);
  parts.push(Buffer.from('\r\n'));
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const config = {
  path: '/.netlify/functions/chat'
};
