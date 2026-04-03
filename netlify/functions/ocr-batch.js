/**
 * OCR-BATCH.JS — OCR en lote para diligencias
 * ─────────────────────────────────────────────
 * Procesa múltiples archivos de Drive en lote, extrayendo texto
 * con Claude Vision OCR. Incluye retry con backoff exponencial.
 *
 * POST { files: [{ driveFileId, fileName, mimeType }], caseId }
 */
const https = require('https');
const { base64url, callAnthropicVision } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const signer = require('crypto').createSign('RSA-SHA256');
  const sig = signer.update(header + '.' + payload)
    .sign(sa.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`;
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch (e) { reject(new Error('Token error')); } });
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Token request timeout'));
    });
    req.write(body);
    req.end();
  });
}

function driveDownload(fileId, token) {
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Drive download timeout'));
    });
  });
}

/* ── Retry con backoff exponencial ── */
async function ocrWithRetry(apiKey, base64Data, mimeType, fileName, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await callAnthropicVision(apiKey, base64Data, mimeType, fileName);
      if (res.error === 'rate_limited' && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (res.error) return { error: res.error };
      return { text: res.content?.[0]?.text || '', usage: res.usage };
    } catch (err) {
      if (attempt === maxRetries) return { error: err.message };
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return { error: 'Max retries exceeded' };
}

/**
 * OCR Batch — Procesamiento de múltiples archivos en lote.
 * Descarga archivos de Google Drive y extrae texto con Claude Vision.
 * Incluye retry automático con backoff exponencial.
 *
 * @route POST /.netlify/functions/ocr-batch
 * @param {Object} body
 * @param {Array<{driveFileId:string, fileName:string, mimeType:string, base64Data?:string}>} body.files - Array de archivos a procesar (max 10)
 * @param {string} [body.caseId] - ID del caso para referencia
 * @returns {Object}
 *   {
 *     results: Array<{fileName, status, text?, error?, textLength?}>,
 *     caseId: string,
 *     processed: number,
 *     failed: number,
 *     total: number,
 *     usage: {inputTokens, outputTokens}
 *   }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 30 req/hora por usuario
 */
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  const userId = extractUserIdFromToken(authToken);
  const rl = await checkRateLimit(userId, 'ocr-batch');
  if (!rl.allowed) return rateLimitResponse(rl, CORS);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'API key no configurada' }) };

  let driveToken = null;
  try {
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT;
    if (saJson) {
      const sa = JSON.parse(saJson);
      driveToken = await getAccessToken(sa);
    }
  } catch (e) {
    console.log('Drive auth warning:', e.message);
  }

  try {
    const body = JSON.parse(event.body);
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { files, caseId } = body;
    if (!files || !Array.isArray(files) || !files.length) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'files array requerido' }) };
    }

    // Limitar a 10 archivos por batch (timeout de Netlify)
    const batch = files.slice(0, 10);
    const results = [];
    let totalInputTokens = 0, totalOutputTokens = 0;

    for (const file of batch) {
      const { driveFileId, fileName, mimeType, base64Data } = file;
      let fileBase64 = base64Data;

      // Si no hay base64, descargar de Drive
      if (!fileBase64 && driveFileId && driveToken) {
        try {
          const dlRes = await driveDownload(driveFileId, driveToken);
          if (dlRes.status < 300) {
            fileBase64 = dlRes.data.toString('base64');
          } else {
            results.push({ fileName, status: 'error', error: 'Drive download failed: ' + dlRes.status });
            continue;
          }
        } catch (e) {
          results.push({ fileName, status: 'error', error: 'Drive error: ' + e.message });
          continue;
        }
      }

      if (!fileBase64) {
        results.push({ fileName, status: 'error', error: 'No data available' });
        continue;
      }

      // Verificar tamaño (max ~5MB en base64)
      if (fileBase64.length > 7 * 1024 * 1024) {
        results.push({ fileName, status: 'error', error: 'Archivo demasiado grande (>5MB)' });
        continue;
      }

      const ocrResult = await ocrWithRetry(apiKey, fileBase64, mimeType || 'application/pdf', fileName || 'document');

      if (ocrResult.error) {
        results.push({ fileName, status: 'error', error: ocrResult.error });
      } else {
        if (ocrResult.usage) {
          totalInputTokens += ocrResult.usage.input_tokens || 0;
          totalOutputTokens += ocrResult.usage.output_tokens || 0;
        }
        results.push({
          fileName,
          driveFileId,
          status: 'success',
          text: ocrResult.text,
          textLength: ocrResult.text.length
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({
        results,
        caseId,
        processed: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
        total: batch.length,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens }
      })
    };

  } catch (err) {
    console.error('ocr-batch error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message })
    };
  }
};
