/**
 * Netlify Function: drive-extract (ESM)
 * Downloads files from Google Drive (Word, PDF, etc) and extracts text via Claude
 */

/* ── Google OAuth2 for Drive ── */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: sa.token_uri, iat: now, exp: now + 3600
  })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${header}.${payload}`;
  const pemContents = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signatureInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const r = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signatureInput}.${sig}`
  });
  return (await r.json()).access_token;
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
  return r.arrayBuffer();
}

/* ── Array buffer to base64 ── */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
      if (buffer.byteLength > 10 * 1024 * 1024) throw new Error(`File too large: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

      const mimeType = meta.mimeType || '';
      const mediaType = mimeType.includes('pdf') ? 'application/pdf' :
                        mimeType.includes('word') || fileName.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                        fileName.endsWith('.doc') ? 'application/msword' :
                        mimeType || 'application/octet-stream';

      const base64Data = arrayBufferToBase64(buffer);
      text = await extractTextViaClaude(apiKey, base64Data, mediaType);
    }

    return new Response(JSON.stringify({ success: true, text, fileName, mimeType: meta.mimeType, chars: text.length }), { headers });
  } catch (err) {
    console.error('drive-extract error:', err);
    return new Response(JSON.stringify({ error: err.message, success: false }), { status: 400, headers });
  }
};
