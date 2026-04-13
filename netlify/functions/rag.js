/**
 * Netlify Function: rag (ESM)
 * Searches Qdrant collections using Google gemini-embedding-001 (768 dims)
 * Uses Node.js crypto module for JWT signing (proven to work)
 */
import { createSign } from 'node:crypto';
import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

/* ── Google Service Account OAuth2 ── */
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

  const jwt = `${header}.${payload}.${sig}`;
  const _ac = new AbortController();
  const _to = setTimeout(() => _ac.abort(), 30000);
  try {
    const r = await fetch(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      signal: _ac.signal
    });
    clearTimeout(_to);
    const data = await r.json();
    if (!data.access_token) throw new Error('Failed to get Google access token');
    return data.access_token;
  } catch (err) {
    clearTimeout(_to);
    throw err;
  }
}

/* ── Embeddings via Google gemini-embedding-001 (768 dims) ── */
async function getEmbedding(text, accessToken) {
  try {
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 30000);
    try {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({
          content: { parts: [{ text: text.substring(0, 4096) }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 768
        }),
        signal: _ac.signal
      });
      clearTimeout(_to);
      if (!r.ok) { console.error('Embedding error:', r.status, await r.text()); return null; }
      const data = await r.json();
      return data?.embedding?.values || null;
    } catch (fetchErr) {
      clearTimeout(_to);
      throw fetchErr;
    }
  } catch (e) { console.error('Embedding exception:', e); return null; }
}

/* ── Qdrant Search ── */
async function searchQdrant(vector, collection, qdrantUrl, qdrantKey, limit = 4) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (qdrantKey) headers['api-key'] = qdrantKey;

    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 30000);
    try {
      const r = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
        method: 'POST', headers,
        body: JSON.stringify({ vector, limit, with_payload: true }),
        signal: _ac.signal
      });
      clearTimeout(_to);

      if (!r.ok) { console.warn(`Qdrant search ${collection}: ${r.status}`); return []; }

      const data = await r.json();
      return (data.result || []).map(p => ({
        score: p.score,
        text: p.payload?.text || p.payload?.content || '',
        source: p.payload?.source_name || p.payload?.source || collection,
        collection
      }));
    } catch (fetchErr) {
      clearTimeout(_to);
      throw fetchErr;
    }
  } catch (e) {
    console.warn(`Qdrant search error (${collection}):`, e.message);
    return [];
  }
}

/* ── Collections ── */
const FISCALITO_COLLECTIONS = [
  'relevant_jurisprudence',
  'reference_books',
  'specific_topics',
  'rulings',
  'administrative_discipline',
  'current_regulations',
  'material',
  'comercial',
  'propiedad_intelectual',
  'civil',
  'case_studys',
  'models',
  'practica_forense',
];

const FOLDER_ALIASES = {
  normativa: 'current_regulations',
  dictamenes: 'rulings',
  jurisprudencia: 'relevant_jurisprudence',
  doctrina: 'administrative_discipline',
  libros: 'reference_books',
  tematicas: 'specific_topics',
  material: 'material',
  comercial: 'comercial',
};

/* ── Rate Limiting ── */
const _RL_LIMITS = { chat:60, structure:60, rag:60, 'qdrant-ingest':30, 'drive-extract':30 };
async function _checkRL(token, endpoint) {
  if (!token) return { allowed: false };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { allowed: false };
    const uid = JSON.parse(atob(parts[1])).sub;
    if (!uid) return { allowed: false };
    const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
    const sbKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY');
    if (!sbUrl || !sbKey) return { allowed: false };
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
    return (await r.json()) || { allowed: false };
  } catch (e) { return { allowed: false }; }
}

/**
 * RAG — Búsqueda semántica en base de datos de documentos (Qdrant).
 * Realiza búsqueda vectorial usando embeddings de Google Gemini.
 * Retorna documentos relevantes de múltiples colecciones de referencia.
 *
 * RESPONSE FORMAT: {context: string, sources: Array, count: number}
 *   On error: {error: string, context: '', sources: []} (HTTP 400, 401, 429, or 500)
 *
 * @route POST /.netlify/functions/rag
 * @param {Object} body
 * @param {string} body.query - Consulta de búsqueda (texto natural)
 * @param {string} [body.folder] - Carpeta/colección a buscar (default: 'todos')
 *   Opciones: 'normativa', 'dictamenes', 'jurisprudencia', 'doctrina', 'libros', 'tematicas'
 * @param {string[]} [body.collections] - Array de colecciones específicas para buscar.
 *   Acepta aliases ('jurisprudencia') o nombres reales ('relevant_jurisprudence').
 *   Si se proporciona, tiene prioridad sobre folder.
 * @returns {Object}
 *   {
 *     context: string,
 *     sources: Array<string>,
 *     count: number,
 *     message?: string,
 *     error?: string
 *   }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */

/* ── Handler ── */
export default async (req) => {
  const headers = _corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers });

  try {
    const body = await req.json();
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers });
    }

    const _rl = await _checkRL(authToken, 'rag');
    if (!_rl.allowed) {
      return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: _rl.limit, remaining: 0 }), { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    }

    const { query, folder = 'todos', collections } = body;
    if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400, headers });

    const qdrantUrl = (Netlify.env.get('QDRANT_URL') || '').replace(/\/+$/, '');
    const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
    const saKey = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');

    if (!qdrantUrl) return new Response(JSON.stringify({ context: '', sources: [], error: 'QDRANT_URL not configured' }), { headers });
    if (!saKey) return new Response(JSON.stringify({ context: '', sources: [], error: 'GOOGLE_SERVICE_ACCOUNT_KEY not configured' }), { headers });

    const sa = JSON.parse(saKey);
    const accessToken = await getGoogleAccessToken(sa);

    /* Generate embedding once */
    const vector = await getEmbedding(query, accessToken);
    if (!vector) return new Response(JSON.stringify({ context: '', sources: [], error: 'Embedding failed' }), { headers });

    /* Determine which collections to search:
       1. If `collections` array is provided, resolve each alias to real name and filter valid ones
       2. Else if `folder` is a known alias, search that single collection
       3. Else search all collections */
    let collectionsToSearch;
    if (Array.isArray(collections) && collections.length > 0) {
      collectionsToSearch = collections
        .map(c => FOLDER_ALIASES[c] || c)  // resolve aliases
        .filter(c => FISCALITO_COLLECTIONS.includes(c));  // only valid collections
      if (!collectionsToSearch.length) collectionsToSearch = FISCALITO_COLLECTIONS;
    } else {
      const targetCollection = FOLDER_ALIASES[folder];
      collectionsToSearch = targetCollection ? [targetCollection] : FISCALITO_COLLECTIONS;
    }

    /* Search all collections in parallel (reuse same vector) */
    const results = await Promise.all(
      collectionsToSearch.map(col => searchQdrant(vector, col, qdrantUrl, qdrantKey, 4))
    );

    /* Flatten, sort by score, take top 10 */
    const allResults = results.flat().filter(r => r.text && r.text.length > 20);
    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, 10);

    if (!topResults.length) {
      return new Response(JSON.stringify({ context: '', sources: [], message: 'No relevant documents found' }), { headers });
    }

    const context = topResults
      .map(r => `[Fuente: ${r.source} | Colección: ${r.collection} | Relevancia: ${(r.score * 100).toFixed(0)}%]\n${r.text}`)
      .join('\n\n---\n\n');

    const sources = [...new Set(topResults.map(r => r.source))];

    return new Response(JSON.stringify({ context, sources, count: topResults.length }), { headers });

  } catch (err) {
    console.error('RAG error:', err);
    return new Response(JSON.stringify({ error: err.message, context: '', sources: [] }), { status: 500, headers });
  }
};

export const config = {
  maxDuration: 60
};
