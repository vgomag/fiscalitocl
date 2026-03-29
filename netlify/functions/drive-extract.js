/**
 * Netlify Function: drive-extract
 * Downloads files from Google Drive (Word, PDF, etc) and extracts text via Claude
 * Uses same https module pattern as drive.js (proven to work)
 */
const crypto = require('crypto');
const https = require('https');

/* ── helpers ── */
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function httpsGetText(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    }).on('error', reject);
  });
}

/* ── Google Auth (same pattern as drive.js) ── */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: sa.token_uri, iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256')
    .update(header + '.' + payload)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = header + '.' + payload + '.' + sig;

  const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
  const tokenUrl = new URL(sa.token_uri);
  const r = await httpsPost(tokenUrl.hostname, tokenUrl.pathname, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body)
  }, body);
  return r.data.access_token;
}

/* ── Drive helpers ── */
async function driveGetMeta(fileId, token) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,name,mimeType,size';
  const r = await httpsGetText(url, { 'Authorization': 'Bearer ' + token });
  if (r.status !== 200) throw new Error('Drive meta error: ' + r.status);
  return JSON.parse(r.text);
}

async function driveExportText(fileId, token) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '/export?mimeType=text/plain';
  const r = await httpsGetText(url, { 'Authorization': 'Bearer ' + token });
  return r.status === 200 ? r.text : null;
}

async function driveDownloadBinary(fileId, token) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';
  const r = await httpsGet(url, { 'Authorization': 'Bearer ' + token });
  if (r.status !== 200) throw new Error('Drive download error: ' + r.status);
  return r.buffer;
}

/* ── Claude text extraction ── */
async function extractTextViaClaude(apiKey, base64Data, mediaType, fileName) {
  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
        { type: 'text', text: 'Extrae el texto completo de este documento legal. Incluye TODO el contenido: titulos, parrafos, conclusiones, firmas, todo. Responde SOLO con el texto extraido, sin comentarios ni resumenes. Manten la estructura del documento.' }
      ]
    }]
  });

  const r = await httpsPost('api.anthropic.com', '/v1/messages', {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Length': Buffer.byteLength(reqBody)
  }, reqBody);

  if (r.status !== 200) {
    const errText = typeof r.data === 'string' ? r.data.substring(0, 200) : JSON.stringify(r.data).substring(0, 200);
    throw new Error('Claude API error: ' + r.status + ' - ' + errText);
  }

  return (r.data.content || []).map(function(b) { return b.text || ''; }).join('');
}

/* ── Handler ── */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const fileId = body.fileId;
    if (!fileId) throw new Error('fileId is required');

    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!sa.client_email) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const token = await getAccessToken(sa);
    const meta = await driveGetMeta(fileId, token);
    const isNativeGoogle = (meta.mimeType || '').includes('google-apps');
    const fileName = meta.name || 'unknown';

    var text = '';

    if (isNativeGoogle) {
      text = (await driveExportText(fileId, token)) || '';
    } else {
      var buffer = await driveDownloadBinary(fileId, token);
      if (buffer.length > 10 * 1024 * 1024) throw new Error('File too large: ' + (buffer.length / 1024 / 1024).toFixed(1) + 'MB');

      var mimeType = meta.mimeType || '';
      var mediaType = mimeType.includes('pdf') ? 'application/pdf' :
                      mimeType.includes('word') || fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                      fileName.endsWith('.doc') ? 'application/msword' :
                      mimeType || 'application/octet-stream';

      var base64Data = buffer.toString('base64');
      text = await extractTextViaClaude(apiKey, base64Data, mediaType, fileName);
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, text: text, fileName: fileName, mimeType: meta.mimeType, chars: text.length })
    };

  } catch (err) {
    console.error('drive-extract error:', err);
    return { statusCode: 400, headers, body: JSON.stringify({ error: err.message, success: false }) };
  }
};
