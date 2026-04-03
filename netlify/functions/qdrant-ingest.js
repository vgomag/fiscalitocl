/**
 * Netlify Function: qdrant-ingest (ESM)
 * Handles: embed text → upsert to Qdrant, collection management
 * Uses Node.js crypto (NOT WebCrypto which hangs in Netlify)
 */
import { createSign, createHash } from 'node:crypto';

/* ── Google OAuth2 ── */
function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/generative-language',
    aud: sa.token_uri, iat: now, exp: now + 3600
  }));
  const sig = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const r = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${header}.${payload}.${sig}`
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('Failed to get Google access token');
  return data.access_token;
}

/* ── Google Embeddings (with retry + backoff) ── */
async function getEmbedding(text, accessToken, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          content: { parts: [{ text: text.substring(0, 4096) }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768
        })
      });
      if (r.ok) {
        const data = await r.json();
        return data?.embedding?.values || null;
      }
      /* Rate limit (429) or server error (5xx) → retry */
      if ((r.status === 429 || r.status >= 500) && attempt < maxRetries) {
        const wait = (attempt + 1) * 1500; // 1.5s, 3s
        console.warn(`Embedding ${r.status}, retry ${attempt+1}/${maxRetries} in ${wait}ms`);
        await new Promise(ok => setTimeout(ok, wait));
        continue;
      }
      console.error('Embedding error:', r.status, await r.text().catch(() => ''));
      return null;
    } catch (e) {
      if (attempt < maxRetries) {
        await new Promise(ok => setTimeout(ok, (attempt + 1) * 1500));
        continue;
      }
      console.error('Embedding exception:', e);
      return null;
    }
  }
  return null;
}

/* ── Qdrant helpers ── */
async function qdrantFetch(qdrantUrl, qdrantKey, path, method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (qdrantKey) headers['api-key'] = qdrantKey;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${qdrantUrl}${path}`, opts);
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse(text) }; }
  catch { return { ok: r.ok, status: r.status, data: text }; }
}

async function ensureCollection(qdrantUrl, qdrantKey, name, vectorSize = 768) {
  const info = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${name}`, 'GET');
  if (info.ok) {
    const size = info.data?.result?.config?.params?.vectors?.size;
    if (size && size !== vectorSize) {
      await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${name}`, 'DELETE');
    } else return true;
  }
  const create = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${name}`, 'PUT', {
    vectors: { size: vectorSize, distance: 'Cosine' },
    optimizers_config: { default_segment_number: 2 }
  });
  return create.ok;
}

/* ── Chunking ── */
function splitIntoChunks(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  const sentences = text.split(/(?<=[.!?;:])\s+|(?=\n\s*(?:Art(?:ículo)?\.?\s*\d|[IVXLCDM]+\.\s|\d+[.)]\s))/i);
  let current = '', overlapBuf = '';
  for (const s of sentences) {
    if (current.length + s.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      /* Tomar últimos ~overlap caracteres como buffer de solapamiento */
      overlapBuf = current.slice(-overlap);
      current = overlapBuf + ' ' + s;
    } else { current += (current ? ' ' : '') + s; }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

/* ── PII sanitizer ── */
function sanitizePii(text) {
  return text
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}[-–]\d{1,2}\b/g, '[RUT]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\+?\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g, '[PHONE]');
}

/* ── UUID helper ── */
function md5uuid(str) {
  const hex = createHash('md5').update(str).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
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
    if (!r.ok) return { allowed: true };
    return (await r.json()) || { allowed: true };
  } catch (e) { return { allowed: true }; }
}

/**
 * Qdrant Ingest — Gestión de colecciones vectoriales y ingesta de documentos.
 * Maneja ingestión de documentos, búsqueda vectorial y gestión de colecciones.
 *
 * @route POST /.netlify/functions/qdrant-ingest
 * @param {Object} body
 * @param {string} body.action - 'list-collections' | 'collection-info' | 'create-collection' | 'delete-collection' | 'search' | 'ingest'
 * @param {string} [body.collection] - Nombre de colección
 * @param {string} [body.query] - Texto a buscar (para search)
 * @param {number} [body.limit] - Límite de resultados (para search, default: 5)
 * @param {Array<{id, text, metadata?}>} [body.documents] - Documentos a ingestar
 * @param {number} [body.chunkSize] - Tamaño de chunks (default: 1000)
 * @param {number} [body.chunkOverlap] - Solapamiento entre chunks (default: 200)
 * @param {boolean} [body.sanitize] - Sanitizar PII (default: false)
 * @param {number} [body.vectorSize] - Dimensiones del vector (default: 768)
 * @returns {Object}
 *   - list-collections: colecciones disponibles
 *   - collection-info: metadata de colección
 *   - create-collection: {success: boolean}
 *   - ingest: {success: true, totalPoints: number, errors?: Array}
 *   - search: resultados vectoriales
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 30 req/hora por usuario
 */

/* ── Handler ── */
export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers });

  try {
    let body;
    try {
      body = await req.json();
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }), { status: 400, headers });
    }
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers });
    }

    const _rl = await _checkRL(authToken, 'qdrant-ingest');
    if (!_rl.allowed) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: _rl.limit, remaining: 0 }), { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    }

    const { action } = body;
    /* Validar acción permitida */
    const ALLOWED_ACTIONS = ['list-collections', 'collection-info', 'create-collection', 'delete-collection', 'search', 'ingest'];
    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      return new Response(JSON.stringify({ error: 'Acción no válida. Permitidas: ' + ALLOWED_ACTIONS.join(', ') }), { status: 400, headers });
    }
    /* Validar nombre de colección (alfanumérico + guiones, max 64 chars) */
    if (body.collection && !/^[a-zA-Z0-9_-]{1,64}$/.test(body.collection)) {
      return new Response(JSON.stringify({ error: 'Nombre de colección inválido (alfanumérico, max 64 chars)' }), { status: 400, headers });
    }
    let qdrantUrl = Netlify.env.get('QDRANT_URL');
    const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
    if (!qdrantUrl) throw new Error('QDRANT_URL not configured');
    /* Strip trailing slash to prevent double-slash in paths */
    qdrantUrl = qdrantUrl.replace(/\/+$/, '');

    /* ── list-collections ── */
    if (action === 'list-collections') {
      const r = await qdrantFetch(qdrantUrl, qdrantKey, '/collections', 'GET');
      return new Response(JSON.stringify(r.data), { headers });
    }

    /* ── collection-info ── */
    if (action === 'collection-info') {
      const r = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${body.collection}`, 'GET');
      return new Response(JSON.stringify(r.data), { headers });
    }

    /* ── create-collection ── */
    if (action === 'create-collection') {
      const ok = await ensureCollection(qdrantUrl, qdrantKey, body.collection, body.vectorSize || 768);
      return new Response(JSON.stringify({ success: ok }), { headers });
    }

    /* ── delete-collection ── */
    if (action === 'delete-collection') {
      const r = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${body.collection}`, 'DELETE');
      return new Response(JSON.stringify({ success: r.ok }), { headers });
    }

    /* ── search ── */
    if (action === 'search') {
      const saJson = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
      let sa;
      try {
        sa = JSON.parse(saJson);
      } catch (parseErr) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is malformed JSON: ' + parseErr.message);
      }
      const at = await getGoogleAccessToken(sa);
      const vector = await getEmbedding(body.query, at);
      if (!vector) throw new Error('Failed to generate query embedding');
      const r = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${body.collection}/points/search`, 'POST', {
        vector, limit: body.limit || 5, with_payload: true
      });
      return new Response(JSON.stringify(r.data), { headers });
    }

    /* ── ingest ── */
    if (action === 'ingest') {
      const { collection, documents, chunkSize = 1000, chunkOverlap = 200, sanitize = false } = body;
      if (!collection || !documents?.length) throw new Error('collection and documents required');
      if (documents.length > 50) throw new Error('Máximo 50 documentos por lote');
      /* Validar texto de cada documento (max 100KB por doc) */
      for (const doc of documents) {
        if (doc.text && doc.text.length > 102400) doc.text = doc.text.substring(0, 102400);
      }

      await ensureCollection(qdrantUrl, qdrantKey, collection, 768);
      const saJson = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
      if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
      let sa;
      try {
        sa = JSON.parse(saJson);
      } catch (parseErr) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is malformed JSON: ' + parseErr.message);
      }
      const accessToken = await getGoogleAccessToken(sa);

      let totalPoints = 0;
      const errors = [];

      for (const doc of documents) {
        let text = doc.text || '';
        if (!text) continue;
        if (sanitize) text = sanitizePii(text);
        const chunks = splitIntoChunks(text, chunkSize, chunkOverlap);
        const points = [];

        for (let i = 0; i < chunks.length; i++) {
          const vector = await getEmbedding(chunks[i], accessToken);
          if (!vector) { errors.push(`Embedding failed chunk ${i} of ${doc.id}`); continue; }
          points.push({
            id: md5uuid(`${doc.id}_chunk_${i}`),
            vector,
            payload: { text: chunks[i], source_id: doc.id, source_name: doc.metadata?.name || doc.id, chunk_index: i, total_chunks: chunks.length, collection }
          });
        }

        if (points.length > 0) {
          for (let b = 0; b < points.length; b += 100) {
            const batch = points.slice(b, b + 100);
            const r = await qdrantFetch(qdrantUrl, qdrantKey, `/collections/${collection}/points?wait=true`, 'PUT', { points: batch });
            if (!r.ok) errors.push(`Upsert failed: ${JSON.stringify(r.data).substring(0, 100)}`);
            else totalPoints += batch.length;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, totalPoints, errors: errors.length ? errors : undefined }), { headers });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    console.error('qdrant-ingest error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers });
  }
};
