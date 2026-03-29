/**
 * Netlify Function: qdrant-ingest
 * Handles: embed text → upsert to Qdrant, collection management
 * Uses: QDRANT_URL, QDRANT_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY (for embeddings)
 * Pattern: CommonJS + https module (same as drive.js)
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');

/* ── HTTP helpers (same pattern as drive.js) ── */
function httpRequest(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method, headers: headers };
    const req = mod.request(opts, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: hostname, path: path, method: 'POST', headers: headers }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── Google Service Account Auth (for embeddings) ── */
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa) {
  var now = Math.floor(Date.now() / 1000);
  var header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/generative-language',
    aud: sa.token_uri,
    iat: now, exp: now + 3600
  }));
  var sig = crypto.createSign('RSA-SHA256')
    .update(header + '.' + payload)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  var jwt = header + '.' + payload + '.' + sig;

  var body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
  var tokenUrl = new URL(sa.token_uri);
  var r = await httpsPost(tokenUrl.hostname, tokenUrl.pathname, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body)
  }, body);
  return r.data.access_token;
}

/* ── Embeddings via Google gemini-embedding-001 ── */
async function getEmbedding(text, accessToken) {
  var truncated = text.substring(0, 4096);
  var reqBody = JSON.stringify({
    content: { parts: [{ text: truncated }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768
  });

  var r = await httpsPost(
    'generativelanguage.googleapis.com',
    '/v1beta/models/gemini-embedding-001:embedContent',
    {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + accessToken,
      'Content-Length': Buffer.byteLength(reqBody)
    },
    reqBody
  );

  if (r.status !== 200) {
    console.error('Embedding error:', r.status, typeof r.data === 'string' ? r.data.substring(0, 200) : '');
    return null;
  }

  return r.data && r.data.embedding ? r.data.embedding.values : null;
}

/* ── Qdrant API helpers ── */
async function qdrantRequest(path, method, body) {
  var QDRANT_URL = process.env.QDRANT_URL;
  var QDRANT_API_KEY = process.env.QDRANT_API_KEY;
  if (!QDRANT_URL) throw new Error('QDRANT_URL not configured');

  var url = QDRANT_URL + path;
  var headers = { 'Content-Type': 'application/json' };
  if (QDRANT_API_KEY) headers['api-key'] = QDRANT_API_KEY;

  var bodyStr = body ? JSON.stringify(body) : '';
  if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

  return httpRequest(url, method, headers, bodyStr || undefined);
}

async function ensureCollection(name, vectorSize) {
  vectorSize = vectorSize || 768;
  var info = await qdrantRequest('/collections/' + name, 'GET');
  if (info.status === 200) {
    var size = info.data && info.data.result && info.data.result.config && info.data.result.config.params && info.data.result.config.params.vectors ? info.data.result.config.params.vectors.size : null;
    if (size && size !== vectorSize) {
      await qdrantRequest('/collections/' + name, 'DELETE');
    } else {
      return true;
    }
  }
  var create = await qdrantRequest('/collections/' + name, 'PUT', {
    vectors: { size: vectorSize, distance: 'Cosine' },
    optimizers_config: { default_segment_number: 2 }
  });
  return create.status === 200;
}

/* ── Text chunking (legal-aware) ── */
function splitIntoChunks(text, chunkSize, overlap) {
  chunkSize = chunkSize || 1000;
  overlap = overlap || 200;
  var chunks = [];
  var sentences = text.split(/(?<=[.!?;:])\s+|(?=\n\s*(?:Art(?:ículo)?\.?\s*\d|[IVXLCDM]+\.\s|\d+[.)]\s|[a-z]\)\s))/i);
  var current = '';
  var overlapBuf = '';

  for (var i = 0; i < sentences.length; i++) {
    var s = sentences[i];
    if (current.length + s.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      var words = current.split(/\s+/);
      overlapBuf = words.slice(-Math.floor(overlap / 5)).join(' ');
      current = overlapBuf + ' ' + s;
    } else {
      current += (current ? ' ' : '') + s;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  if (chunks.length === 0 && text.length > 0) {
    for (var j = 0; j < text.length; j += chunkSize - overlap) {
      chunks.push(text.substring(j, j + chunkSize));
    }
  }
  return chunks;
}

/* ── PII Sanitizer ── */
function sanitizePii(text) {
  return text
    .replace(/\b\d{1,2}\.\d{3}\.\d{3}[-–]\d{1,2}\b/g, '[RUT]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\+?\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g, '[PHONE]');
}

/* ── Handler ── */
exports.handler = async (event) => {
  var headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };

  try {
    var body = JSON.parse(event.body || '{}');
    var action = body.action;

    /* ── ACTION: ingest ── */
    if (action === 'ingest') {
      var collection = body.collection;
      var documents = body.documents;
      var chunkSize = body.chunkSize || 1000;
      var chunkOverlap = body.chunkOverlap || 200;
      var shouldSanitize = body.sanitize || false;
      if (!collection || !documents || !documents.length) throw new Error('collection and documents required');

      await ensureCollection(collection, 768);

      var sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
      var accessToken = await getGoogleAccessToken(sa);

      var totalPoints = 0;
      var errors = [];

      for (var d = 0; d < documents.length; d++) {
        var doc = documents[d];
        var text = doc.text || '';
        if (!text) continue;

        if (shouldSanitize) text = sanitizePii(text);

        var chunks = splitIntoChunks(text, chunkSize, chunkOverlap);
        var points = [];

        for (var i = 0; i < chunks.length; i++) {
          var vector = await getEmbedding(chunks[i], accessToken);
          if (!vector) { errors.push('Embedding failed for chunk ' + i + ' of ' + doc.id); continue; }

          var pointId = crypto.createHash('md5').update(doc.id + '_chunk_' + i).digest('hex');
          var uuid = pointId.slice(0,8) + '-' + pointId.slice(8,12) + '-' + pointId.slice(12,16) + '-' + pointId.slice(16,20) + '-' + pointId.slice(20);

          points.push({
            id: uuid,
            vector: vector,
            payload: {
              text: chunks[i],
              source_id: doc.id,
              source_name: (doc.metadata && doc.metadata.name) || doc.id,
              chunk_index: i,
              total_chunks: chunks.length,
              collection: collection
            }
          });
        }

        if (points.length > 0) {
          for (var b = 0; b < points.length; b += 100) {
            var batch = points.slice(b, b + 100);
            var result = await qdrantRequest('/collections/' + collection + '/points?wait=true', 'PUT', { points: batch });
            if (result.status !== 200) {
              errors.push('Upsert failed for ' + doc.id + ': ' + JSON.stringify(result.data).substring(0, 100));
            } else {
              totalPoints += batch.length;
            }
          }
        }
      }

      return {
        statusCode: 200, headers: headers,
        body: JSON.stringify({ success: true, totalPoints: totalPoints, errors: errors.length ? errors : undefined })
      };
    }

    /* ── ACTION: list-collections ── */
    if (action === 'list-collections') {
      var r = await qdrantRequest('/collections', 'GET');
      return { statusCode: 200, headers: headers, body: JSON.stringify(r.data) };
    }

    /* ── ACTION: collection-info ── */
    if (action === 'collection-info') {
      var r2 = await qdrantRequest('/collections/' + body.collection, 'GET');
      return { statusCode: 200, headers: headers, body: JSON.stringify(r2.data) };
    }

    /* ── ACTION: create-collection ── */
    if (action === 'create-collection') {
      var ok = await ensureCollection(body.collection, body.vectorSize || 768);
      return { statusCode: 200, headers: headers, body: JSON.stringify({ success: ok }) };
    }

    /* ── ACTION: delete-collection ── */
    if (action === 'delete-collection') {
      var dr = await qdrantRequest('/collections/' + body.collection, 'DELETE');
      return { statusCode: 200, headers: headers, body: JSON.stringify({ success: dr.status === 200 }) };
    }

    /* ── ACTION: search ── */
    if (action === 'search') {
      var sa2 = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
      var at = await getGoogleAccessToken(sa2);
      var qVector = await getEmbedding(body.query, at);
      if (!qVector) throw new Error('Failed to generate query embedding');

      var sr = await qdrantRequest('/collections/' + body.collection + '/points/search', 'POST', {
        vector: qVector, limit: body.limit || 5, with_payload: true
      });
      return { statusCode: 200, headers: headers, body: JSON.stringify(sr.data) };
    }

    throw new Error('Unknown action: ' + action);

  } catch (err) {
    console.error('qdrant-ingest error:', err);
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
