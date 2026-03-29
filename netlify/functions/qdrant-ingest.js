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

/* ── Google Embeddings ── */
async function getEmbedding(text, accessToken) {
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
    if (!r.ok) { console.error('Embedding error:', r.status); return null; }
    const data = await r.json();
    return data?.embedding?.values || null;
  } catch (e) { console.error('Embedding exception:', e); return null; }
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
      const words = current.split(/\s+/);
      overlapBuf = words.slice(-Math.floor(overlap / 5)).join(' ');
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

/* ── Handler ── */
export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return new Response('', { headers });

  try {
    const body = await req.json();
    const { action } = body;
    const qdrantUrl = Netlify.env.get('QDRANT_URL');
    const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
    if (!qdrantUrl) throw new Error('QDRANT_URL not configured');

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
      const sa = JSON.parse(Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY'));
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

      await ensureCollection(qdrantUrl, qdrantKey, collection, 768);
      const sa = JSON.parse(Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY'));
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
