/* ═══════════════════════════════════════════════════════════
   TRANSCRIBE.JS — Netlify Function v2
   Endpoint dedicado de transcripción de audio/video
   Soporta: OpenAI Whisper · ElevenLabs Scribe · Claude fallback
   ═══════════════════════════════════════════════════════════ */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  /* ── Claves de API ── */
  const OPENAI_KEY     = Netlify.env.get('OPENAI_API_KEY');
  const ELEVENLABS_KEY = Netlify.env.get('ELEVENLABS_API_KEY');
  const ANTHROPIC_KEY  = Netlify.env.get('ANTHROPIC_API_KEY');

  if (!OPENAI_KEY && !ELEVENLABS_KEY && !ANTHROPIC_KEY) {
    return jsonRes({ error: 'No hay API key de transcripción configurada (OPENAI_API_KEY, ELEVENLABS_API_KEY o ANTHROPIC_API_KEY)' }, 500);
  }

  try {
    const body = await req.json();
    const { audioBase64, fileName, mimeType, instructions } = body;

    if (!audioBase64) {
      return jsonRes({ error: 'No se recibió audio (audioBase64 requerido)' }, 400);
    }

    /* ── Detectar/corregir MIME type ── */
    const resolvedMime = resolveMimeType(fileName, mimeType);
    const ext = getExtension(fileName);

    /* ── Intentar transcripción en orden de prioridad ── */
    let transcript = null;
    let provider   = null;
    let errors     = [];

    // 1) OpenAI Whisper — mejor soporte de formatos
    if (OPENAI_KEY && !transcript) {
      try {
        transcript = await transcribeWithWhisper(OPENAI_KEY, audioBase64, fileName, resolvedMime, ext, instructions);
        provider = 'whisper';
      } catch (e) {
        errors.push(`Whisper: ${e.message}`);
      }
    }

    // 2) ElevenLabs Scribe v2
    if (ELEVENLABS_KEY && !transcript) {
      try {
        transcript = await transcribeWithElevenLabs(ELEVENLABS_KEY, audioBase64, fileName, resolvedMime);
        provider = 'elevenlabs';
      } catch (e) {
        errors.push(`ElevenLabs: ${e.message}`);
      }
    }

    // 3) Claude fallback — envía audio como documento
    if (ANTHROPIC_KEY && !transcript) {
      try {
        transcript = await transcribeWithClaude(ANTHROPIC_KEY, audioBase64, resolvedMime, instructions);
        provider = 'claude';
      } catch (e) {
        errors.push(`Claude: ${e.message}`);
      }
    }

    if (!transcript) {
      return jsonRes({
        error: 'No se pudo transcribir el audio con ningún servicio disponible',
        details: errors
      }, 500);
    }

    return jsonRes({ transcript, provider, fileName });

  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
};

/* ═══════════════════════════════════════════════════════════
   PROVEEDORES DE TRANSCRIPCIÓN
   ═══════════════════════════════════════════════════════════ */

/* ── OpenAI Whisper ──────────────────────────────────────── */
async function transcribeWithWhisper(apiKey, b64, fileName, mime, ext, instructions) {
  // Whisper soporta: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac
  const WHISPER_FORMATS = ['mp3','mp4','mpeg','mpga','m4a','wav','webm','ogg','flac','oga','opus'];
  const usableExt = WHISPER_FORMATS.includes(ext) ? ext : 'mp3';
  const usableName = WHISPER_FORMATS.includes(ext) ? fileName : fileName.replace(/\.[^.]+$/, '.mp3');

  const binaryData = base64ToUint8Array(b64);
  const blob = new Blob([binaryData], { type: mime });

  const form = new FormData();
  form.append('file', blob, usableName);
  form.append('model', 'whisper-1');
  form.append('language', 'es');
  form.append('response_format', 'verbose_json');
  if (instructions) {
    form.append('prompt', instructions);
  }

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();
  return data.text || '';
}

/* ── ElevenLabs Scribe v2 ────────────────────────────────── */
async function transcribeWithElevenLabs(apiKey, b64, fileName, mime) {
  const binaryData = base64ToUint8Array(b64);
  const blob = new Blob([binaryData], { type: mime });

  const form = new FormData();
  form.append('file', blob, fileName);
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'spa');
  form.append('diarize', 'true');

  const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();

  // ElevenLabs devuelve segmentos con speakers
  if (data.words && Array.isArray(data.words)) {
    // Agrupar por speaker
    let result = '';
    let currentSpeaker = null;
    let currentText = '';
    for (const w of data.words) {
      if (w.speaker_id !== currentSpeaker) {
        if (currentText) result += `[${currentSpeaker || 'HABLANTE'}]: ${currentText.trim()}\n\n`;
        currentSpeaker = w.speaker_id;
        currentText = '';
      }
      currentText += w.text + ' ';
    }
    if (currentText) result += `[${currentSpeaker || 'HABLANTE'}]: ${currentText.trim()}\n`;
    return result || data.text || '';
  }

  return data.text || '';
}

/* ── Claude fallback ─────────────────────────────────────── */
async function transcribeWithClaude(apiKey, b64, mime, instructions) {
  // Claude soporta audio via content blocks
  const systemPrompt = `Eres un transcriptor profesional. Transcribe el audio fielmente al español. 
Identifica diferentes hablantes si los hay, usando etiquetas como [HABLANTE 1], [HABLANTE 2], etc.
Marca partes inaudibles como [INAUDIBLE]. No omitas nada.
${instructions ? 'Instrucción adicional: ' + instructions : ''}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe este audio fielmente.' },
          {
            type: 'document',
            source: { type: 'base64', media_type: mime, data: b64 }
          }
        ]
      }]
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();
  const text = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (!text.trim()) throw new Error('Claude no devolvió transcripción');
  return text;
}

/* ═══════════════════════════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════════════════════════ */

/** Mapa exhaustivo extensión → MIME type */
const MIME_MAP = {
  // Audio
  'mp3':  'audio/mpeg',
  'wav':  'audio/wav',
  'wave': 'audio/wav',
  'm4a':  'audio/mp4',
  'aac':  'audio/aac',
  'ogg':  'audio/ogg',
  'oga':  'audio/ogg',
  'opus': 'audio/opus',
  'flac': 'audio/flac',
  'wma':  'audio/x-ms-wma',
  'amr':  'audio/amr',
  'aiff': 'audio/aiff',
  'aif':  'audio/aiff',
  'caf':  'audio/x-caf',
  'webm': 'audio/webm',
  'weba': 'audio/webm',
  '3gp':  'audio/3gpp',
  '3gpp': 'audio/3gpp',
  'spx':  'audio/ogg',
  'ac3':  'audio/ac3',
  'mka':  'audio/x-matroska',
  // Video (también se pueden transcribir)
  'mp4':  'video/mp4',
  'm4v':  'video/mp4',
  'mov':  'video/quicktime',
  'avi':  'video/x-msvideo',
  'mkv':  'video/x-matroska',
  'wmv':  'video/x-ms-wmv',
  'flv':  'video/x-flv',
  'ts':   'video/mp2t',
  'mts':  'video/mp2t',
};

function getExtension(fileName) {
  if (!fileName) return '';
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function resolveMimeType(fileName, providedMime) {
  const ext = getExtension(fileName);
  // Si el MIME proporcionado es genérico o vacío, usar nuestro mapa
  if (!providedMime || providedMime === 'application/octet-stream' || providedMime === '') {
    return MIME_MAP[ext] || 'audio/mpeg';
  }
  // Si tenemos un mapeo más específico para la extensión, preferirlo
  if (MIME_MAP[ext] && providedMime !== MIME_MAP[ext]) {
    // Pero solo si el MIME proporcionado parece genérico
    if (providedMime.includes('octet-stream') || providedMime === 'audio/webm') {
      return MIME_MAP[ext];
    }
  }
  return providedMime;
}

function base64ToUint8Array(b64) {
  const binaryString = atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  path: '/.netlify/functions/transcribe'
};
