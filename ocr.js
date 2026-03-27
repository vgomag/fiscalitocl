/**
 * OCR.JS — Server-side document processing for Fiscalito
 * ───────────────────────────────────────────────────────
 * TWO-STAGE PIPELINE (each fits within Netlify 10s timeout):
 *   action=extract : Download PDF from Drive + Claude OCR → return text
 *   action=analyze : Receive text → identify diligencias → return JSON
 */
const crypto = require('crypto');
const https = require('https');

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now()/1000);
  const header = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign('RSA-SHA256').update(header+'.'+payload)
    .sign(sa.private_key,'base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`;
  return new Promise((resolve, reject) => {
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch(e) { reject(new Error('Token error')); } });
    }); req.on('error', reject); req.write(body); req.end();
  });
}

function driveGet(path, token, binary) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      if (binary) { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(c) })); }
      else { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: res.statusCode < 300 ? JSON.parse(d) : d }); } catch(e) { resolve({ status: res.statusCode, data: d }); } }); }
    }).on('error', reject);
  });
}

function driveText(path, token) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, { headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, data: d }));
    }).on('error', reject);
  });
}

function callClaude(apiKey, model, system, userContent, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, max_tokens: maxTokens || 4000, system, messages: [{ role: 'user', content: userContent }] });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Parse error')); } });
    }); req.on('error', reject); req.write(body); req.end();
  });
}

const SONNET = 'claude-sonnet-4-20250514';
const HAIKU = 'claude-haiku-4-5-20251001';
const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,x-auth-token' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');
    const p = JSON.parse(event.body || '{}');
    const action = p.action || 'extract';

    /* ═══════════════════════════════════════════════════════
       STAGE 2: ANALYZE — Identify diligencias from text
       No Drive download. Receives text directly. Uses Haiku.
       ═══════════════════════════════════════════════════════ */
    if (action === 'analyze') {
      const text = p.extractedText || '';
      if (text.length < 50) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Texto muy corto para analizar' }) };

      const prompt = `Eres experto en procedimientos disciplinarios de la Administracion Publica chilena.
Analiza el texto de un expediente e identifica CADA DILIGENCIA que consta en el.

TIPOS: denuncia, resolucion_inicio, resolucion, declaracion_denunciante, declaracion_denunciado, declaracion_testigo, oficio, informe, acta, notificacion, prueba_documental, cargos, descargos, vista_fiscal, otro

RESPONDE SOLO JSON puro (sin backticks ni markdown). Array de objetos:
[{"tipo":"declaracion_testigo","titulo":"Declaracion de Juan Perez, testigo","fecha":"2024-03-15","fojas":"15-22","personas":["Juan Perez"],"resumen":"El testigo declara haber presenciado los hechos...","relevancia":"alta"}]

- fecha: YYYY-MM-DD o null
- fojas: rango de paginas o null
- resumen: max 2 oraciones
- relevancia: alta (declaraciones, cargos, vista fiscal, denuncia), media (oficios, resoluciones, informes), baja (actas rutinarias, notificaciones)
- NO inventes diligencias. Solo las que constan en el texto.
- Identifica TODAS, incluso las menores.`;

      /* Process up to 30K chars */
      const chunk = text.substring(0, 30000);
      const r = await callClaude(apiKey, HAIKU, prompt, `Expediente "${p.fileName||'doc'}":\n\n${chunk}`, 4000);
      const rt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '[]';

      let dils = [];
      try { dils = JSON.parse(rt.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()); } catch(e) {}
      if (!Array.isArray(dils)) dils = [];

      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, diligencias: dils, count: dils.length }) };
    }

    /* ═══════════════════════════════════════════════════════
       STAGE 1: EXTRACT — Download from Drive + OCR
       ═══════════════════════════════════════════════════════ */
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const token = await getAccessToken(sa);
    const { fileId, fileName, diligenciaType } = p;
    if (!fileId) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'fileId requerido' }) };

    const meta = await driveGet(`/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, token, false);
    if (meta.status >= 300) throw new Error('No se pudo obtener metadata');
    const mime = meta.data.mimeType || '';
    const name = meta.data.name || fileName || 'documento';
    const size = parseInt(meta.data.size || '0');

    /* Try text export first */
    let txt = '';
    if (mime.includes('google-apps.document')) {
      const r = await driveText(`/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`, token);
      if (r.status < 300 && r.data.length > 50) txt = r.data;
    } else if (mime.includes('text/') || mime.includes('json') || mime.includes('csv')) {
      const r = await driveText(`/drive/v3/files/${fileId}?alt=media`, token);
      if (r.status < 300) txt = r.data;
    }

    /* Binary: download + OCR with Claude */
    if (!txt) {
      if (size > 500 * 1024 * 1024) throw new Error('Archivo muy grande (max 500MB). Divida el PDF.');

      const r = mime.includes('google-apps')
        ? await driveGet(`/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`, token, true)
        : await driveGet(`/drive/v3/files/${fileId}?alt=media`, token, true);

      if (r.status >= 300 || !r.data || r.data.length < 100) throw new Error('No se pudo descargar');

      const b64 = r.data.toString('base64');
      const isPdf = mime.includes('pdf');
      const isImg = mime.includes('image');
      const m = mime.includes('google-apps') ? 'application/pdf' : mime;

      let content;
      if (isPdf) content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: `Extrae TODO el texto de "${name}". Formato original. Solo texto.` }];
      else if (isImg) content = [{ type: 'image', source: { type: 'base64', media_type: m, data: b64 } }, { type: 'text', text: 'Extrae todo el texto visible. Solo texto.' }];
      else content = [{ type: 'document', source: { type: 'base64', media_type: m, data: b64 } }, { type: 'text', text: 'Extrae todo el texto. Solo texto.' }];

      const ocr = await callClaude(apiKey, SONNET, 'Extrae texto del documento. Manten formato. Sin comentarios.', content, 16000);
      txt = (ocr.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
      if (!txt) throw new Error('No se pudo extraer texto');
    }

    /* Quick summary with Haiku */
    let sum = '';
    try {
      const sr = await callClaude(apiKey, HAIKU, 'Resume en 3 oraciones. Solo resumen.', `Resume:\n${txt.substring(0, 4000)}`, 300);
      sum = (sr.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
    } catch(e) {}

    return { statusCode: 200, headers: H, body: JSON.stringify({
      ok: true, name, mimeType: mime, fileSize: size,
      extractedText: txt.substring(0, 200000), aiSummary: sum || null, charCount: txt.length
    })};

  } catch (err) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};
