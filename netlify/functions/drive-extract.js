/**
 * Netlify Function: drive-extract
 * Downloads files from Google Drive (including .docx, .pdf) and extracts text via Claude
 * Handles: Google Docs (export), Word docs (binary → Claude), PDFs (binary → Claude)
 * Uses: GOOGLE_SERVICE_ACCOUNT_KEY, ANTHROPIC_API_KEY
 */
const crypto = require('crypto');

/* ── Google Service Account Auth ── */
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: sa.token_uri,
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(sa.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${header}.${payload}.${sig}`;
  const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  return data.access_token;
}

/* ── Drive API helpers ── */
async function driveGetMeta(fileId, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive meta error: ${res.status}`);
  return res.json();
}

async function driveExportText(fileId, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.text();
}

async function driveDownloadBinary(fileId, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download error: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
}

/* ── Claude text extraction ── */
async function extractTextViaClaude(apiKey, base64Data, mimeType, fileName) {
  const mediaType = mimeType.includes('pdf') ? 'application/pdf' :
                    mimeType.includes('word') || mimeType.includes('docx') || fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                    mimeType.includes('doc') || fileName.endsWith('.doc') ? 'application/msword' :
                    mimeType || 'application/octet-stream';

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: mediaType, data: base64Data }
        },
        {
          type: 'text',
          text: 'Extrae el texto completo de este documento legal. Incluye TODO el contenido: títulos, párrafos, conclusiones, firmas, todo. Responde SOLO con el texto extraído, sin comentarios ni resúmenes. Mantén la estructura del documento.'
        }
      ]
    }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return (data.content || []).map(b => b.text || '').join('');
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
    const { fileId, action } = body;

    if (!fileId) throw new Error('fileId is required');

    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!sa.client_email) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const token = await getAccessToken(sa);

    /* Get file metadata */
    const meta = await driveGetMeta(fileId, token);
    const isGoogleDoc = (meta.mimeType || '').includes('google-apps.document');
    const isGoogleSheet = (meta.mimeType || '').includes('google-apps.spreadsheet');
    const isGoogleSlide = (meta.mimeType || '').includes('google-apps.presentation');
    const isNativeGoogle = isGoogleDoc || isGoogleSheet || isGoogleSlide;
    const fileName = meta.name || 'unknown';

    let text = '';

    if (isNativeGoogle) {
      /* Google Docs → export as plain text */
      text = await driveExportText(fileId, token) || '';
    } else {
      /* Word, PDF, etc → download binary → send to Claude */
      const buffer = await driveDownloadBinary(fileId, token);

      /* Check file size (limit: ~10MB for Claude) */
      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
      }

      const base64Data = buffer.toString('base64');
      text = await extractTextViaClaude(apiKey, base64Data, meta.mimeType || '', fileName);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text,
        fileName,
        mimeType: meta.mimeType,
        method: isNativeGoogle ? 'google-export' : 'claude-extract',
        chars: text.length
      })
    };

  } catch (err) {
    console.error('drive-extract error:', err);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: err.message, success: false })
    };
  }
};
