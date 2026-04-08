import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

/* ── Claude Model Constants ── */
const MODEL_SONNET = Netlify.env.get('CLAUDE_MODEL_SONNET') || 'claude-sonnet-4-20250514';

/* ── PII Sanitization for Logging ── */
/**
 * Removes/masks sensitive personal information from objects before logging.
 * Masks: emails, RUTs (XX.XXX.XXX-X), phone numbers, names in known fields.
 */
function _sanitizeLog(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = JSON.parse(JSON.stringify(obj)); // Deep clone

  const walk = (node) => {
    if (typeof node !== 'object' || !node) return;
    for (const key in node) {
      const val = node[key];
      // Mask known PII fields
      if (/name|nombre|denunciante|denunciado|person|author|remitente/i.test(key) && typeof val === 'string') {
        node[key] = '[MASKED_NAME]';
      }
      // Mask emails
      else if (typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        node[key] = '[MASKED_EMAIL]';
      }
      // Mask RUTs (XX.XXX.XXX-X pattern)
      else if (typeof val === 'string' && /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/.test(val)) {
        node[key] = '[MASKED_RUT]';
      }
      // Mask phone numbers (9-12 digits, may have spaces/dashes)
      else if (typeof val === 'string' && /^(\+?56)?[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{4}$/.test(val.replace(/\s/g, ''))) {
        node[key] = '[MASKED_PHONE]';
      }
      // Recurse
      else if (typeof val === 'object') {
        walk(val);
      }
    }
  };

  walk(sanitized);
  return sanitized;
}

/* ── Rate Limiting ── */
const _RL_LIMITS = { chat:60, structure:60, rag:60, 'qdrant-ingest':30, 'drive-extract':30 };

/**
 * Validates JWT token format and extracts user ID.
 * LIMITATION: Does not verify JWT signature (would require Supabase auth endpoint).
 * As a practical safeguard: validates token format (3 parts) and that sub claim is
 * a valid UUID-like string. For full security, verify tokens via Supabase auth endpoint
 * before use in production rate-limiting critical operations.
 */
function _validateTokenAndExtractUid(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    const uid = payload.sub;

    // Validate sub looks like a UUID (basic check)
    if (!uid || !/^[a-f0-9\-]{36}$/i.test(uid)) {
      return null;
    }

    return uid;
  } catch (e) {
    return null;
  }
}

async function _checkRL(token, endpoint) {
  if (!token) return { allowed: false };
  try {
    const uid = _validateTokenAndExtractUid(token);
    if (!uid) return { allowed: false };
    const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
    const sbKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY');
    if (!sbUrl || !sbKey) {
      console.warn('[chat/_checkRL] Missing Supabase config — allowing request (fail-open)');
      return { allowed: true };
    }
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 10000);
    const r = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ p_user_id: uid, p_endpoint: endpoint, p_max_requests: _RL_LIMITS[endpoint] || 60, p_window_minutes: 60 }),
      signal: _ac.signal,
    });
    clearTimeout(_to);
    if (!r.ok) {
      console.warn('[chat/_checkRL] RPC error:', r.status, '— allowing request (fail-open)');
      return { allowed: true };
    }
    return (await r.json()) || { allowed: true };
  } catch (e) {
    console.warn('[chat/_checkRL] Exception:', e.message, '— allowing request (fail-open)');
    return { allowed: true };
  }
}

/**
 * Chat IA — Endpoint principal de conversación con Claude.
 * Soporta modo texto normal y modo transcripción de audio.
 *
 * @route POST /.netlify/functions/chat
 * @param {Object} body
 * @param {string} [body.model] - Modelo Claude a usar (default: claude-sonnet-4-20250514)
 * @param {number} [body.max_tokens] - Máximo de tokens en respuesta (default: 2000)
 * @param {string} [body.system] - System prompt para el modelo
 * @param {Array<{role:string, content:string}>} body.messages - Array de mensajes conversacionales
 * @param {boolean} [body.stream] - Si true, devuelve SSE stream; si false, respuesta completa
 * @param {string} [body.mode] - 'transcribe' para modo transcripción de audio
 * @param {string} [body.audioBase64] - Audio en base64 (si mode=transcribe)
 * @param {string} [body.signedUrl] - URL firmada a archivo de audio
 * @param {string} [body.storageBucket] - Bucket de Supabase Storage
 * @param {string} [body.storagePath] - Ruta en Storage
 * @param {string} [body.fileName] - Nombre del archivo de audio
 * @param {string} [body.mimeType] - MIME type del audio
 * @returns {Response}
 *   - Modo texto: {content:[{type:'text',text:'...'}], usage:{...}} o SSE stream
 *   - Modo transcripción: {transcript:string, provider:'whisper'|'elevenlabs'}
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */
export default async (req) => {
  const CORS = _corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: CORS });
  }

  /* ── Verificar autenticación via Supabase token ── */
  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) {
    return json({ error: 'No autorizado — sesión requerida' }, 401, CORS);
  }

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return json({ error: 'Payload too large' }, 413, CORS);
    }

    const _rl = await _checkRL(authToken, 'chat');
    if (!_rl.allowed) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: _rl.limit, remaining: 0 }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }

    /* ═══ MODO TRANSCRIPCIÓN ═══ */
    if (body.mode === 'transcribe') {
      const openaiKey = Netlify.env.get('OPENAI_API_KEY');
      const elevenKey = Netlify.env.get('ELEVENLABS_API_KEY');
      if (!openaiKey && !elevenKey) return json({ error: 'No API key de transcripción' }, 500);
      const { audioBase64, signedUrl, storageBucket, storagePath, fileName, mimeType } = body;

      /* Obtener audio: base64 directo, URL firmada, o descarga de Supabase Storage */
      let audioBytes;
      if (audioBase64) {
        if (audioBase64.length > 33554432) return json({ error: 'Audio demasiado grande (max 25MB)' }, 413, CORS);
        audioBytes = Buffer.from(audioBase64, 'base64');
      } else if (signedUrl) {
        try {
          const _ac = new AbortController();
          const _to = setTimeout(() => _ac.abort(), 30000);
          try {
            const dlResp = await fetch(signedUrl, { signal: _ac.signal });
            clearTimeout(_to);
            if (!dlResp.ok) throw new Error('HTTP ' + dlResp.status);
            audioBytes = Buffer.from(await dlResp.arrayBuffer());
          } catch (fetchErr) {
            clearTimeout(_to);
            throw fetchErr;
          }
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
          const _ac = new AbortController();
          const _to = setTimeout(() => _ac.abort(), 30000);
          try {
            const dlResp = await fetch(dlUrl, {
              headers: { 'Authorization': 'Bearer ' + dlBearer, 'apikey': dlKey },
              signal: _ac.signal
            });
            clearTimeout(_to);
            if (!dlResp.ok) throw new Error('Storage download HTTP ' + dlResp.status);
            audioBytes = Buffer.from(await dlResp.arrayBuffer());
          } catch (fetchErr) {
            clearTimeout(_to);
            throw fetchErr;
          }
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
          const _ac = new AbortController();
          const _to = setTimeout(() => _ac.abort(), 30000);
          try {
            const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST', headers: { 'Authorization': 'Bearer ' + openaiKey, 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: Buffer.concat(parts), signal: _ac.signal
            });
            clearTimeout(_to);
            if (r.ok) { transcript = await r.text(); provider = 'whisper'; }
          } catch (fetchErr) {
            clearTimeout(_to);
            throw fetchErr;
          }
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
          const _ac = new AbortController();
          const _to = setTimeout(() => _ac.abort(), 30000);
          try {
            const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
              method: 'POST', headers: { 'xi-api-key': elevenKey, 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body: Buffer.concat(parts), signal: _ac.signal
            });
            clearTimeout(_to);
            if (r.ok) { const d = await r.json(); transcript = d.text || ''; provider = 'elevenlabs'; }
          } catch (fetchErr) {
            clearTimeout(_to);
            throw fetchErr;
          }
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
      if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: 'messages requerido' }, 400, CORS);
      const maxTokens = Math.min(Math.max(parseInt(body.max_tokens) || 2000, 1), 16000);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
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
        return json({ error: msg }, 504, CORS);
      }

      if (!res.ok) {
        clearTimeout(timeout);
        const errData = await res.text();
        return new Response(errData, { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      /* Reenviar el stream SSE con cleanup de timeout */
      const upstream = res.body;
      const transform = new TransformStream({ flush() { clearTimeout(timeout); } });
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
    }

    /* Modo sin streaming (fallback para compatibilidad) */
    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: 'messages requerido' }, 400, CORS);
    const maxTok = Math.min(Math.max(parseInt(body.max_tokens) || 2000, 1), 16000);
    const nsController = new AbortController();
    const nsTimeout = setTimeout(() => nsController.abort(), 55000);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: body.model || MODEL_SONNET,
          max_tokens: maxTok,
          system: body.system,
          messages: body.messages,
        }),
        signal: nsController.signal,
      });
      clearTimeout(nsTimeout);
      const data = await res.json();
      /* Propagar el status real de Anthropic (400, 401, 429, 500…) */
      return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    } catch (fetchErr) {
      clearTimeout(nsTimeout);
      const msg = fetchErr.name === 'AbortError' ? 'Timeout (55s)' : fetchErr.message;
      return json({ error: msg }, 504, CORS);
    }
  } catch (e) {
    return json({ error: e.message }, 500, CORS);
  }
};

function addField(p, b, n, v) { p.push(Buffer.from('--'+b+'\r\nContent-Disposition: form-data; name="'+n+'"\r\n\r\n'+v+'\r\n')); }
function addFile(p, b, n, f, m, d) { p.push(Buffer.from('--'+b+'\r\nContent-Disposition: form-data; name="'+n+'"; filename="'+f+'"\r\nContent-Type: '+m+'\r\n\r\n')); p.push(d); p.push(Buffer.from('\r\n')); }
function json(d, s, cors = {}) { return new Response(JSON.stringify(d), { status: s||200, headers: { 'Content-Type': 'application/json', ...cors } }); }

export const config = {
  path: '/.netlify/functions/chat',
  maxDuration: 60
};
