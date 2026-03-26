/* ═══════════════════════════════════════════════════════════
   TRANSCRIBE.JS — Netlify Function v2
   Endpoint dedicado de transcripción · Node.js compatible
   Whisper → ElevenLabs → Claude (fallback chain)
   ═══════════════════════════════════════════════════════════ */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const OPENAI_KEY     = Netlify.env.get('OPENAI_API_KEY');
  const ELEVENLABS_KEY = Netlify.env.get('ELEVENLABS_API_KEY');
  const ANTHROPIC_KEY  = Netlify.env.get('ANTHROPIC_API_KEY');

  if (!OPENAI_KEY && !ELEVENLABS_KEY && !ANTHROPIC_KEY) {
    return json({ error: 'No hay API key de transcripción configurada' }, 500);
  }

  try {
    const body = await req.json();
    const { audioBase64, fileName, mimeType, instructions } = body;

    if (!audioBase64) {
      return json({ error: 'No se recibió audio' }, 400);
    }

    const mime = fixMime(fileName, mimeType);
    let transcript = null;
    let provider = null;
    const errors = [];

    // 1) OpenAI Whisper
    if (OPENAI_KEY && !transcript) {
      try {
        transcript = await whisper(OPENAI_KEY, audioBase64, fileName, mime, instructions);
        provider = 'whisper';
      } catch (e) { errors.push('Whisper: ' + e.message); }
    }

    // 2) ElevenLabs Scribe
    if (ELEVENLABS_KEY && !transcript) {
      try {
        transcript = await elevenlabs(ELEVENLABS_KEY, audioBase64, fileName, mime);
        provider = 'elevenlabs';
      } catch (e) { errors.push('ElevenLabs: ' + e.message); }
    }

    // 3) Claude fallback
    if (ANTHROPIC_KEY && !transcript) {
      try {
        transcript = await claude(ANTHROPIC_KEY, audioBase64, mime, instructions);
        provider = 'claude';
      } catch (e) { errors.push('Claude: ' + e.message); }
    }

    if (!transcript) {
      return json({ error: 'No se pudo transcribir', details: errors }, 500);
    }

    return json({ transcript, provider, fileName });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

/* ── OpenAI Whisper ── */
async function whisper(key, b64, fileName, mime, instructions) {
  // Build multipart/form-data manually (no FormData dependency)
  const boundary = '----Boundary' + Date.now();
  const bin = b64ToBuffer(b64);

  const parts = [];
  parts.push(field(boundary, 'model', 'whisper-1'));
  parts.push(field(boundary, 'language', 'es'));
  parts.push(field(boundary, 'response_format', 'verbose_json'));
  if (instructions) parts.push(field(boundary, 'prompt', instructions));
  parts.push(fileField(boundary, 'file', fileName || 'audio.wav', mime, bin));
  parts.push(new Uint8Array(new TextEncoder().encode('--' + boundary + '--\r\n')));

  const bodyBuf = concat(parts);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body: bodyBuf,
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200));
  }

  const data = await resp.json();
  return data.text || '';
}

/* ── ElevenLabs Scribe ── */
async function elevenlabs(key, b64, fileName, mime) {
  const boundary = '----Boundary' + Date.now();
  const bin = b64ToBuffer(b64);

  const parts = [];
  parts.push(field(boundary, 'model_id', 'scribe_v1'));
  parts.push(field(boundary, 'language_code', 'spa'));
  parts.push(field(boundary, 'diarize', 'true'));
  parts.push(fileField(boundary, 'file', fileName || 'audio.wav', mime, bin));
  parts.push(new Uint8Array(new TextEncoder().encode('--' + boundary + '--\r\n')));

  const bodyBuf = concat(parts);

  const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body: bodyBuf,
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200));
  }

  const data = await resp.json();

  // Agrupar por speaker si hay diarización
  if (data.words && Array.isArray(data.words)) {
    let result = '', curSp = null, curTxt = '';
    for (const w of data.words) {
      if (w.speaker_id !== curSp) {
        if (curTxt) result += '[' + (curSp || 'HABLANTE') + ']: ' + curTxt.trim() + '\n\n';
        curSp = w.speaker_id; curTxt = '';
      }
      curTxt += w.text + ' ';
    }
    if (curTxt) result += '[' + (curSp || 'HABLANTE') + ']: ' + curTxt.trim() + '\n';
    return result || data.text || '';
  }

  return data.text || '';
}

/* ── Claude fallback ── */
async function claude(key, b64, mime, instructions) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: 'Eres un transcriptor profesional. Transcribe el audio fielmente al español. Identifica hablantes como [HABLANTE 1], [HABLANTE 2]. Partes inaudibles: [INAUDIBLE]. ' + (instructions || ''),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe este audio fielmente.' },
          { type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }
        ]
      }]
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error('HTTP ' + resp.status + ': ' + t.substring(0, 200));
  }

  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text.trim()) throw new Error('Sin transcripción');
  return text;
}

/* ═══════════════════════════════════════════════════
   Utilidades — sin dependencia de Web APIs
   ═══════════════════════════════════════════════════ */

const MIMES = {
  mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',
  ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/opus',flac:'audio/flac',
  wma:'audio/x-ms-wma',amr:'audio/amr',aiff:'audio/aiff',aif:'audio/aiff',
  caf:'audio/x-caf',webm:'audio/webm',weba:'audio/webm',
  '3gp':'audio/3gpp',spx:'audio/ogg',mka:'audio/x-matroska',
  mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',
  avi:'video/x-msvideo',mkv:'video/x-matroska',wmv:'video/x-ms-wmv',
};

function getExt(name) {
  if (!name) return '';
  const p = name.toLowerCase().split('.');
  return p.length > 1 ? p.pop() : '';
}

function fixMime(name, given) {
  const e = getExt(name);
  if (!given || given === 'application/octet-stream' || given === '') {
    return MIMES[e] || 'audio/mpeg';
  }
  return given;
}

/** Base64 string → Uint8Array (Node.js compatible) */
function b64ToBuffer(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Build a multipart text field */
function field(boundary, name, value) {
  const str = '--' + boundary + '\r\n'
    + 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n'
    + value + '\r\n';
  return new Uint8Array(new TextEncoder().encode(str));
}

/** Build a multipart file field */
function fileField(boundary, name, filename, mime, data) {
  const header = '--' + boundary + '\r\n'
    + 'Content-Disposition: form-data; name="' + name + '"; filename="' + filename + '"\r\n'
    + 'Content-Type: ' + mime + '\r\n\r\n';
  const headerBytes = new Uint8Array(new TextEncoder().encode(header));
  const footer = new Uint8Array(new TextEncoder().encode('\r\n'));
  return concat([headerBytes, data, footer]);
}

/** Concatenate Uint8Arrays */
function concat(arrays) {
  let total = 0;
  for (const a of arrays) total += a.byteLength;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a instanceof Uint8Array ? a : new Uint8Array(a), offset);
    offset += a.byteLength;
  }
  return result;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  path: '/.netlify/functions/transcribe'
};
