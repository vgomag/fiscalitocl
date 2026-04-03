const crypto = require('crypto');
const https = require('https');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now()/1000);
  const header = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256')
    .update(header+'.'+payload)
    .sign(sa.private_key,'base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const jwt = header+'.'+payload+'.'+sig;
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch(e) { reject(new Error('Token error: '+d)); } });
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

function driveGet(path, token) {
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: res.statusCode < 300 ? JSON.parse(d) : d }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Drive GET request timeout'));
    });
  });
}

/* Download text file as string (for text content only).
   For binary files (PDF, images), use driveDownloadBinary() instead. */
function driveDownload(path, token) {
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Drive download request timeout'));
    });
  });
}

/* Download binary file as Buffer (for PDFs, images, etc.) */
function driveDownloadBinary(path, token) {
  return new Promise((resolve, reject) => {
    const _to = setTimeout(() => req.destroy(), 30000);
    const req = https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    }, (res) => {
      clearTimeout(_to);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Drive binary download request timeout'));
    });
  });
}

async function listFolder(folderId, token) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent('files(id,name,mimeType,size,modifiedTime,webViewLink,createdTime)');
  const r = await driveGet(`/drive/v3/files?q=${q}&fields=${fields}&pageSize=200&orderBy=name`, token);
  return r.status < 300 ? (r.data.files || []) : [];
}

async function listRecursive(folderId, token, depth, maxDepth, prefix) {
  if (depth > maxDepth) return [];
  const items = await listFolder(folderId, token);
  let result = [];
  for (const item of items) {
    item._path = prefix ? prefix + '/' + item.name : item.name;
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      item._isFolder = true;
      result.push(item);
      const children = await listRecursive(item.id, token, depth + 1, maxDepth, item._path);
      result = result.concat(children);
    } else {
      item._isFolder = false;
      result.push(item);
    }
  }
  return result;
}

async function readFile(fileId, token) {
  const meta = await driveGet(`/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, token);
  if (meta.status >= 300) return { ok: false, error: 'No se pudo obtener metadata' };
  const mime = meta.data.mimeType || '';
  const name = meta.data.name || '';
  let content = '';

  if (mime.includes('google-apps.document')) {
    const r = await driveDownload(`/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`, token);
    if (r.status < 300) content = r.data;
  } else if (mime.includes('google-apps.spreadsheet')) {
    const r = await driveDownload(`/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv`, token);
    if (r.status < 300) content = r.data;
  } else if (mime.includes('google-apps.presentation')) {
    const r = await driveDownload(`/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`, token);
    if (r.status < 300) content = r.data;
  } else if (mime.includes('text/') || mime.includes('json') || mime.includes('csv')) {
    const r = await driveDownload(`/drive/v3/files/${fileId}?alt=media`, token);
    if (r.status < 300) content = r.data;
  } else {
    content = `[Archivo binario: ${name} (${mime})]`;
  }

  return { ok: true, name, mimeType: mime, content: content.substring(0, 50000) };
}

/**
 * Drive — Operaciones con Google Drive (lectura, descarga, listado).
 * Gestiona acceso a archivos de Drive para casos y diligencias.
 *
 * @route POST /.netlify/functions/drive
 * @param {Object} body
 * @param {string} body.action - 'list' | 'read' | 'download'
 * @param {string} body.folderId - ID de carpeta (para list)
 * @param {string} [body.fileId] - ID de archivo (para read, download)
 * @param {boolean} [body.recursive] - Listar recursivamente (para list)
 * @param {number} [body.maxDepth] - Profundidad máxima (para list recursive, default: 3)
 * @param {string} [body.exportFormat] - 'docx' | 'xlsx' | 'pdf' (para download)
 * @returns {Object}
 *   - list: {ok:true, files:Array, folders:Array, total:number}
 *   - read: {ok:true, name:string, mimeType:string, content:string}
 *   - download: {ok:true, name:string, mimeType:string, size:number, base64:string}
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }) };
    }
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'drive');
    if (!rl.allowed) return rateLimitResponse(rl, headers);
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    let sa;
    try {
      sa = JSON.parse(saJson);
    } catch (parseErr) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY is malformed JSON' }) };
    }
    const token = await getAccessToken(sa);
    const { action } = body;

    if (action === 'list') {
      const { folderId, recursive } = body;
      if (!folderId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'folderId requerido' }) };

      if (recursive) {
        const maxDepth = body.maxDepth || 3;
        const all = await listRecursive(folderId, token, 0, maxDepth, '');
        return { statusCode: 200, headers, body: JSON.stringify({
          ok: true,
          files: all.filter(f => !f._isFolder),
          folders: all.filter(f => f._isFolder),
          total: all.length
        })};
      }

      const items = await listFolder(folderId, token);
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: true,
        files: items.filter(f => f.mimeType !== 'application/vnd.google-apps.folder'),
        folders: items.filter(f => f.mimeType === 'application/vnd.google-apps.folder'),
        total: items.length
      })};
    }

    if (action === 'read') {
      const { fileId } = body;
      if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileId requerido' }) };
      const result = await readFile(fileId, token);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    if (action === 'download') {
      const { fileId, exportFormat } = body;
      if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileId requerido' }) };
      const meta = await driveGet(`/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, token);
      if (meta.status >= 300) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No se pudo obtener metadata' }) };
      const mime = meta.data.mimeType || '';
      const name = meta.data.name || '';
      const size = parseInt(meta.data.size || '0');
      /* Limit to ~4.5MB (base64 will be ~6MB, Netlify response limit) */
      if (size > 4.5 * 1024 * 1024) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Archivo demasiado grande (max ~4.5MB). Divida el PDF en partes menores.' }) };
      let buf;
      let finalMime = mime;
      if (mime.includes('google-apps.document')) {
        /* Google Docs: export as docx for client-side extraction, or pdf */
        const expMime = exportFormat === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf';
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(expMime)}`, token);
        if (r.status < 300) buf = r.data;
        finalMime = expMime;
      } else if (mime.includes('google-apps.spreadsheet')) {
        /* Google Sheets: export as xlsx for client-side extraction, or pdf */
        const expMime = exportFormat === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(expMime)}`, token);
        if (r.status < 300) buf = r.data;
        finalMime = expMime;
      } else {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}?alt=media`, token);
        if (r.status < 300) buf = r.data;
        finalMime = mime;
      }
      if (!buf) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No se pudo descargar el archivo' }) };
      const base64 = buf.toString('base64');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, mimeType: finalMime, size: buf.length, base64 }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no soportada: ' + action + '. Acciones válidas: list, read, download' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
