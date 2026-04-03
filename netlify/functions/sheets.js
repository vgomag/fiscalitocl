/**
 * SHEETS.JS — Netlify Function
 * ─────────────────────────────
 * Lee y escribe en Google Sheets usando la Service Account existente.
 * Scope: https://www.googleapis.com/auth/spreadsheets (lectura + escritura)
 *
 * Acciones:
 *   read    — Leer una hoja completa o rango
 *   append  — Agregar una fila al final de la hoja
 *   update  — Actualizar una celda o rango específico
 *   info    — Obtener metadata del spreadsheet (nombres de hojas, etc.)
 */

const crypto = require('crypto');
const https = require('https');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');

/* ── JWT Auth (mismo patrón que drive.js, scope diferente) ── */
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256')
    .update(header + '.' + payload)
    .sign(sa.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = header + '.' + payload + '.' + sig;
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error('Token error: ' + d));
        } catch (e) { reject(new Error('Token parse error: ' + d)); }
      });
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

/* ── Google Sheets API helpers ── */
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

function sheetsRequest(method, path, token, body) {
  const url = new URL(SHEETS_BASE + path);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      timeout: 30000
    };
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.request(options, (res) => {
      clearTimeout(_to);
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Sheets request timeout'));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/* ── CORS headers ── */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Sheets — Operaciones con Google Sheets para numeración y referencias documentales.
 * Lectura, escritura y actualización de hojas de cálculo compartidas.
 *
 * @route POST /.netlify/functions/sheets
 * @param {Object} body
 * @param {string} body.action - 'info' | 'read' | 'append' | 'update'
 * @param {string} body.spreadsheetId - ID del Google Sheet
 * @param {string} [body.sheetName] - Nombre de la hoja (default: Sheet1)
 * @param {string} [body.range] - Rango a leer/escribir (ej: 'A1:C10')
 * @param {Array<string>} [body.row] - Fila a agregar (para append)
 * @param {Array<Array<string>>} [body.values] - Valores a actualizar (para update)
 * @returns {Object}
 *   - info: {ok:true, title:string, sheets:Array}
 *   - read: {ok:true, range:string, values:Array, rowCount:number}
 *   - append: {ok:true, updatedRange:string, updatedRows:number}
 *   - update: {ok:true, updatedRange:string, updatedCells:number}
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */

/* ── Handler ── */
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'sheets');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!saJson) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY no configurada' }) };
    const sa = JSON.parse(saJson);
    const token = await getAccessToken(sa);

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }) };
    }
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { action, spreadsheetId, sheetName, range, values, row } = body;

    if (!spreadsheetId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'spreadsheetId requerido' }) };
    }

    /* ── INFO: metadata del spreadsheet ── */
    if (action === 'info') {
      const res = await sheetsRequest('GET', `/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`, token);
      if (res.status >= 400) {
        return { statusCode: res.status, headers: CORS, body: JSON.stringify({ ok: false, error: 'Error accediendo al Sheet. ¿Está compartido con la Service Account?', details: res.data }) };
      }
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          ok: true,
          title: res.data.properties?.title,
          sheets: (res.data.sheets || []).map(s => ({
            name: s.properties.title,
            index: s.properties.index,
            rowCount: s.properties.gridProperties?.rowCount,
            colCount: s.properties.gridProperties?.columnCount,
          })),
        }),
      };
    }

    /* ── READ: leer hoja o rango ── */
    if (action === 'read') {
      const r = range || (sheetName ? `'${sheetName}'` : 'Sheet1');
      const encodedRange = encodeURIComponent(r);
      const res = await sheetsRequest('GET', `/${spreadsheetId}/values/${encodedRange}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`, token);
      if (res.status >= 400) {
        return { statusCode: res.status, headers: CORS, body: JSON.stringify({ ok: false, error: 'Error leyendo el Sheet', details: res.data }) };
      }
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          ok: true,
          range: res.data.range,
          values: res.data.values || [],
          rowCount: (res.data.values || []).length,
        }),
      };
    }

    /* ── APPEND: agregar fila al final ── */
    if (action === 'append') {
      if (!row || !Array.isArray(row)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'row (array) requerido para append' }) };
      }
      const r = sheetName ? `'${sheetName}'!A1` : 'A1';
      const encodedRange = encodeURIComponent(r);
      const res = await sheetsRequest(
        'POST',
        `/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        token,
        { values: [row] }
      );
      if (res.status >= 400) {
        return { statusCode: res.status, headers: CORS, body: JSON.stringify({ ok: false, error: 'Error agregando fila', details: res.data }) };
      }
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          ok: true,
          updatedRange: res.data.updates?.updatedRange,
          updatedRows: res.data.updates?.updatedRows,
        }),
      };
    }

    /* ── UPDATE: actualizar celda o rango específico ── */
    if (action === 'update') {
      if (!range || !values) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'range y values requeridos para update' }) };
      }
      const encodedRange = encodeURIComponent(range);
      const res = await sheetsRequest(
        'PUT',
        `/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
        token,
        { values: Array.isArray(values[0]) ? values : [values] }
      );
      if (res.status >= 400) {
        return { statusCode: res.status, headers: CORS, body: JSON.stringify({ ok: false, error: 'Error actualizando', details: res.data }) };
      }
      return {
        statusCode: 200, headers: CORS,
        body: JSON.stringify({
          ok: true,
          updatedRange: res.data.updatedRange,
          updatedCells: res.data.updatedCells,
        }),
      };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no soportada: ' + action + '. Acciones válidas: info, read, append, update' }) };

  } catch (err) {
    console.error('sheets.js error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};
