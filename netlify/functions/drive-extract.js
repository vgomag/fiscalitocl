/**
 * Netlify Function: drive-extract (ESM)
 * Downloads files from Google Drive and extracts text via Claude
 * Uses Node.js crypto (NOT WebCrypto which hangs in Netlify)
 */
import { createSign } from 'node:crypto';

/* ── Google OAuth2 for Drive ── */
function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
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
  if (!data.access_token) throw new Error('Failed to get Drive access token');
  return data.access_token;
}

/* ── Drive helpers ── */
async function driveGetMeta(fileId, token) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Drive meta error: ${r.status}`);
  return r.json();
}

async function driveExportText(fileId, token) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return r.ok ? r.text() : null;
}

async function driveDownloadBinary(fileId, token) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Drive download error: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* ── Claude text extraction ── */
async function extractTextViaClaude(apiKey, base64Data, mediaType) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extrae el texto completo de este documento legal. Incluye TODO el contenido: titulos, parrafos, conclusiones, firmas. Responde SOLO con el texto extraido, sin comentarios. Manten la estructura del documento.' }
        ]
      }]
    })
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Claude API error: ${r.status} - ${errText.substring(0, 200)}`);
  }

  const data = await r.json();
  return (data.content || []).map(b => b.text || '').join('');
}

/* ── Handler ── */
export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (req.method === 'OPTIONS') return new Response('', { headers });

  try {
    const body = await req.json();
    const { fileId } = body;
    if (!fileId) throw new Error('fileId is required');

    const saKey = Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
    if (!saKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const sa = JSON.parse(saKey);
    const token = await getAccessToken(sa);
    const meta = await driveGetMeta(fileId, token);
    const isNativeGoogle = (meta.mimeType || '').includes('google-apps');
    const fileName = meta.name || 'unknown';

    let text = '';

    if (isNativeGoogle) {
      text = (await driveExportText(fileId, token)) || '';
    } else {
      const buffer = await driveDownloadBinary(fileId, token);
      if (buffer.length > 10 * 1024 * 1024) throw new Error(`File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);

      const mimeType = meta.mimeType || '';
      const mediaType = mimeType.includes('pdf') ? 'application/pdf' :
                        mimeType.includes('word') || fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                        fileName.endsWith('.doc') ? 'application/msword' :
                        mimeType || 'application/octet-stream';

      const base64Data = buffer.toString('base64');
      text = await extractTextViaClaude(apiKey, base64Data, mediaType);
    }

    return new Response(JSON.stringify({ success: true, text, fileName, mimeType: meta.mimeType, chars: text.length }), { headers });
  } catch (err) {
    console.error('drive-extract error:', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), { status: 400, headers });
  }
};
