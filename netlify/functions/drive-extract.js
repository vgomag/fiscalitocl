/**
 * Netlify Function: drive-extract (ESM)
 * Downloads files from Google Drive and extracts text via Claude
 * Uses Node.js crypto (NOT WebCrypto which hangs in Netlify)
 */
import { createSign } from 'node:crypto';

/* ── Claude Model Constants ── */
const MODEL_SONNET = Netlify.env.get('CLAUDE_MODEL_SONNET') || 'claude-sonnet-4-20250514';

/* ── Google OAuth2 for Drive ── */
function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: sa.token_uri, iat: now, exp: now + 3600
  }));
  const sig = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 30000);
  try {
    const r = await fetch(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${sig}`,
      signal: _ac.signal
    });
    clearTimeout(_to);
    const data = await r.json();
    if (!data.access_token) throw new Error('Failed to get Drive access token');
    return data.access_token;
  } catch (err) {
    clearTimeout(_to);
    throw err;
  }
}

/* ── Drive helpers ── */
async function driveGetMeta(fileId, token) {
  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 30000);
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: _ac.signal
    });
    clearTimeout(_to);
    if (!r.ok) throw new Error(`Drive meta error: ${r.status}`);
    return r.json();
  } catch (err) {
    clearTimeout(_to);
    throw err;
  }
}

async function driveExportText(fileId, token) {
  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 30000);
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: _ac.signal
    });
    clearTimeout(_to);
    return r.ok ? r.text() : null;
  } catch (err) {
    clearTimeout(_to);
    return null;
  }
}

async function driveDownloadBinary(fileId, token) {
  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 30000);
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: _ac.signal
    });
    clearTimeout(_to);
    if (!r.ok) throw new Error(`Drive download error: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  } catch (err) {
    clearTimeout(_to);
    throw err;
  }
}

/* ── Claude text extraction ── */
async function extractTextViaClaude(apiKey, base64Data, mediaType) {
  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 55000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL_SONNET,
        max_tokens: 16000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: 'Extrae el texto completo de este documento legal. Incluye TODO el contenido: titulos, parrafos, conclusiones, firmas. Responde SOLO con el texto extraido, sin comentarios. Manten la estructura del documento.' }
          ]
        }]
      }),
      signal: _ac.signal
    });
    clearTimeout(_to);

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Claude API error: ${r.status} - ${errText.substring(0, 200)}`);
    }

    const data = await r.json();
    return (data.content || []).map(b => b.text || '').join('');
  } catch (err) {
    clearTimeout(_to);
    throw err;
  }
}

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
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 10000);
    const r = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ p_user_id: uid, p_endpoint: endpoint, p_max_requests: _RL_LIMITS[endpoint] || 60, p_window_minutes: 60 }),
      signal: _ac.signal,
    });
    clearTimeout(_to);
    if (!r.ok) return { allowed: false };
    return (await r.json()) || { allowed: true };
  } catch (e) { return { allowed: false }; }
}

/**
 * Drive Extract — Extracción de texto de archivos Drive con Claude Vision.
 * Descarga archivos de Drive y extrae texto completo preservando estructura.
 *
 * @route POST /.netlify/functions/drive-extract
 * @param {Object} body
 * @param {string} body.fileId - ID del archivo en Google Drive
 * @returns {Object}
 *   {
 *     success: true,
 *     text: string,
 *     fileName: string,
 *     mimeType: string,
 *     chars: number
 *   }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 30 req/hora por usuario
 */

/* ── Handler ── */
export default async (req) => {
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: CORS });

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: CORS });

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers: CORS });
    }

    const _rl = await _checkRL(authToken, 'drive-extract');
    if (!_rl.allowed) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: _rl.limit, remaining: 0 }), { status: 429, headers: { ...CORS, 'Retry-After': '60' } });
    }

    const { fileId } = body;
    if (!fileId) throw new Error('fileId is required');

    const saKey = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!saKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const sa = JSON.parse(saKey);
    const token = await getAccessToken(sa);
    const meta = await driveGetMeta(fileId, token);
    const isNativeGoogle = (meta.mimeType || '').includes('google-apps');
    const fileName = meta.name || 'unknown';

    let text = '';

    if (isNativeGoogle) {
      text = (await driveExportText(fileId, token)) || '';
    } else {
      const buffer = await driveDownloadBinary(fileId, token);
      if (buffer.length > 10 * 1024 * 1024) throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

      const mimeType = meta.mimeType || '';
      const mediaType = mimeType.includes('pdf') ? 'application/pdf' :
                        mimeType.includes('word') || fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                        fileName.endsWith('.doc') ? 'application/msword' :
                        mimeType || 'application/octet-stream';

      const base64Data = buffer.toString('base64');
      text = await extractTextViaClaude(apiKey, base64Data, mediaType);
    }

    return new Response(JSON.stringify({ success: true, text, fileName, mimeType: meta.mimeType, chars: text.length }), { headers: CORS });
  } catch (err) {
    console.error('drive-extract error:', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), { status: 400, headers: CORS });
  }
};
