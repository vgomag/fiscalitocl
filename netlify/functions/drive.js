const crypto = require('crypto');
const https = require('https');

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
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch(e) { reject(new Error('Token error: '+d)); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function driveGet(path, token) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: res.statusCode < 300 ? JSON.parse(d) : d }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    }).on('error', reject);
  });
}

/* Download text file as string (for text content only).
   For binary files (PDF, images), use driveDownloadBinary() instead. */
function driveDownload(path, token) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    }).on('error', reject);
  });
}

/* Download binary file as Buffer (for PDFs, images, etc.) */
function driveDownloadBinary(path, token) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token }
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks) }));
    }).on('error', reject);
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

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    let sa;
    try {
      sa = JSON.parse(saJson);
    } catch (parseErr) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'GOOGLE_SERVICE_ACCOUNT_KEY is malformed JSON' }) };
    }
    const token = await getAccessToken(sa);
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }) };
    }
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
      const { fileId } = body;
      if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileId requerido' }) };
      const meta = await driveGet(`/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, token);
      if (meta.status >= 300) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No se pudo obtener metadata' }) };
      const mime = meta.data.mimeType || '';
      const name = meta.data.name || '';
      const size = parseInt(meta.data.size || '0');
      /* Limit to ~4.5MB (base64 will be ~6MB, Netlify response limit) */
      if (size > 4.5 * 1024 * 1024) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Archivo demasiado grande (max ~4.5MB). Divida el PDF en partes menores.' }) };
      let buf;
      if (mime.includes('google-apps.document')) {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`, token);
        if (r.status < 300) buf = r.data;
      } else if (mime.includes('google-apps.spreadsheet')) {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`, token);
        if (r.status < 300) buf = r.data;
      } else {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}?alt=media`, token);
        if (r.status < 300) buf = r.data;
      }
      if (!buf) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No se pudo descargar el archivo' }) };
      const base64 = buf.toString('base64');
      const finalMime = mime.includes('google-apps') ? 'application/pdf' : mime;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, mimeType: finalMime, size: buf.length, base64 }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no soportada: ' + action + '. Acciones válidas: list, read, download' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
