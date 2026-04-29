/**
 * OCR.JS — Server-side document processing for Fiscalito
 * ───────────────────────────────────────────────────────
 * TWO-STAGE PIPELINE (each fits within Netlify 10s timeout):
 *   action=extract : Download PDF from Drive + Claude OCR → return text
 *   action=analyze : Receive text → identify diligencias → return JSON
 */

/* #29 TODO: This file currently uses req.destroy() pattern for timeouts.
   Consider migrating to AbortController in a future refactor for consistency with
   other functions (generate-vista-stream.js, chat.js use AbortController). */
const crypto = require('crypto');
const https = require('https');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');
const { corsHeaders } = require('./shared/cors');
const { MODEL_SONNET, MODEL_HAIKU } = require('./shared/anthropic');
const { PRECISION_JURIDICA } = require('./shared/writing-style');

/* ── Timeout Constants ── */
const OAUTH_TIMEOUT_MS = 30000;    // 30s for OAuth token requests
const DRIVE_TIMEOUT_MS = 30000;    // 30s for Google Drive API calls
const CLAUDE_TIMEOUT_MS = 55000;   // 55s for Claude API calls
const CLAUDE_MAX_TOKENS = 4000;    // Default max tokens for Claude responses

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
    let _to;
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},
      timeout: OAUTH_TIMEOUT_MS
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token); } catch(e) { reject(new Error('Token error')); } });
    });
    _to = setTimeout(() => { try { req.destroy(); } catch(_) {} }, OAUTH_TIMEOUT_MS);
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

function driveGet(path, token, binary) {
  return new Promise((resolve, reject) => {
    let _to;
    const req = https.get('https://www.googleapis.com' + path, { headers: { Authorization: 'Bearer ' + token }, timeout: DRIVE_TIMEOUT_MS }, (res) => {
      clearTimeout(_to);
      if (binary) { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(c) })); }
      else { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: res.statusCode < 300 ? JSON.parse(d) : d }); } catch(e) { resolve({ status: res.statusCode, data: d }); } }); }
    });
    _to = setTimeout(() => { try { req.destroy(); } catch(_) {} }, DRIVE_TIMEOUT_MS);
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

function driveText(path, token) {
  return new Promise((resolve, reject) => {
    let _to;
    const req = https.get('https://www.googleapis.com' + path, { headers: { Authorization: 'Bearer ' + token }, timeout: DRIVE_TIMEOUT_MS }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    _to = setTimeout(() => { try { req.destroy(); } catch(_) {} }, DRIVE_TIMEOUT_MS);
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Drive text request timeout'));
    });
  });
}

function callClaude(apiKey, model, system, userContent, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, max_tokens: maxTokens || CLAUDE_MAX_TOKENS, system, messages: [{ role: 'user', content: userContent }] });
    let _to;
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      timeout: CLAUDE_TIMEOUT_MS
    }, (res) => {
      clearTimeout(_to);
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Parse error')); } });
    });
    _to = setTimeout(() => { try { req.destroy(); } catch(_) {} }, CLAUDE_TIMEOUT_MS);
    req.on('error', (e) => {
      clearTimeout(_to);
      reject(e);
    });
    req.on('timeout', () => {
      clearTimeout(_to);
      req.destroy();
      reject(new Error('Claude API request timeout'));
    });
    req.write(body);
    req.end();
  });
}

const SONNET = MODEL_SONNET;
const HAIKU = MODEL_HAIKU;
/* H is set per-request in the handler via corsHeaders(event) */

/**
 * OCR — Extracción de texto y análisis de diligencias con Claude Vision.
 * Pipeline de dos etapas: extracción de PDF + análisis de contenido.
 *
 * RESPONSE FORMAT:
 *   - extract: {ok:true, name:string, mimeType:string, fileSize:number, extractedText:string, aiSummary:string, charCount:number}
 *   - analyze: {ok:true, diligencias:Array, count:number}
 *   - summarize: {ok:true, summary:string}
 *   - On error: {error: string} or {ok: false, error: string} (HTTP 400, 401, 429, or 502)
 *
 * @route POST /.netlify/functions/ocr
 * @param {Object} body
 * @param {string} body.action - 'extract' | 'analyze' | 'summarize'
 * @param {string} [body.fileId] - ID del archivo en Google Drive (para extract)
 * @param {string} [body.fileName] - Nombre del archivo
 * @param {string} [body.extractedText] - Texto extraído previo (para analyze)
 * @param {string} [body.text] - Texto a resumir (para summarize)
 * @param {string} [body.diligenciaType] - Tipo de diligencia
 * @returns {Object}
 *   - extract: {ok:true, name:string, mimeType:string, fileSize:number, extractedText:string, aiSummary:string, charCount:number}
 *   - analyze: {ok:true, diligencias:Array, count:number}
 *   - summarize: {ok:true, summary:string}
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */
exports.handler = async (event) => {
  const H = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');
    let p;
    try {
      p = JSON.parse(event.body || '{}');
    } catch (parseErr) {
      return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid JSON in request body: ' + parseErr.message }) };
    }
    const bodyStr = JSON.stringify(p);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: H, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const authToken = event.headers['x-auth-token'] || '';
    const userId = await extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'ocr');
    if (!rl.allowed) return rateLimitResponse(rl, H);

    const action = p.action || 'extract';

    /* ═══════════════════════════════════════════════════════
       SUMMARIZE — Quick summary from text (no Drive needed)
       ═══════════════════════════════════════════════════════ */
    if (action === 'summarize') {
      const text = p.text || '';
      if (text.length < 50) return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, summary: '' }) };
      try {
        const r = await callClaude(apiKey, HAIKU, 'Resume documentos jurídicos en máximo 3 oraciones concisas. Solo el resumen, sin preámbulos. Lenguaje formal chileno. NUNCA inventes datos que no aparezcan en el texto.', `Resume:\n${text.substring(0, 4000)}`, 300);
        const sum = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, summary: sum }) };
      } catch(e) {
        return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, summary: '' }) };
      }
    }

    /* ═══════════════════════════════════════════════════════
       STAGE 2: ANALYZE — Identify diligencias from text
       No Drive download. Receives text directly. Uses Haiku.
       ═══════════════════════════════════════════════════════ */
    if (action === 'analyze') {
      const text = p.extractedText || '';
      if (text.length < 50) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Texto muy corto para analizar' }) };

      const prompt = `Eres experto en procedimientos disciplinarios de la Administración Pública chilena (UMAG).
Analiza el texto de un expediente e identifica CADA DILIGENCIA que consta en él.

TIPOS: denuncia, resolucion_inicio, resolucion, declaracion_denunciante, declaracion_denunciado, declaracion_testigo, oficio, informe, acta, notificacion, prueba_documental, cargos, descargos, vista_fiscal, otro

RESPONDE SOLO JSON puro (sin backticks ni markdown). Array de objetos:
[{"tipo":"declaracion_testigo","titulo":"Declaracion de Juan Perez, testigo","fecha":"2024-03-15","fojas":"15-22","personas":["Juan Perez"],"resumen":"El testigo declara haber presenciado los hechos...","relevancia":"alta","parrafo_vista":"Que, a fojas 15 a 22 del expediente, consta la declaración testimonial de don Juan Pérez, funcionario de la Universidad, quien señala haber presenciado directamente los hechos denunciados..."}]

- fecha: YYYY-MM-DD o null
- fojas: rango de paginas o null
- resumen: max 2 oraciones
- relevancia: alta (declaraciones, cargos, vista fiscal, denuncia), media (oficios, resoluciones, informes), baja (actas rutinarias, notificaciones)
- parrafo_vista: párrafo formal para Vista Fiscal. OBLIGATORIO. Comienza con "Que," seguido de minúscula. Cita fojas. Lenguaje jurídico-administrativo chileno formal. Tercera persona impersonal ("consta", "rola", "obra en autos"). Sin markdown. Extensión según tipo: declaraciones/denuncias 15-30 oraciones con relato completo; informes/cargos 8-15 oraciones; actas/oficios 5-8 oraciones.
- NO inventes diligencias. Solo las que constan en el texto.
- Identifica TODAS, incluso las menores.

${PRECISION_JURIDICA}`;

      /* Pro plan: 60s allows larger analysis */
      const chunk = text.substring(0, 80000);
      const r = await callClaude(apiKey, HAIKU, prompt, `Expediente "${p.fileName||'doc'}":\n\n${chunk}`, 8000);

      /* Check for API errors */
      if (r.error) {
        console.error('[ocr:analyze] Claude API error:', JSON.stringify(r.error));
        return { statusCode: 502, headers: H, body: JSON.stringify({ ok: false, error: 'Error de IA: ' + (r.error.message || JSON.stringify(r.error)) }) };
      }

      const rt = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '[]';

      let dils = [];
      try { dils = JSON.parse(rt.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()); } catch(e) {
        console.error('[ocr:analyze] JSON parse failed. Raw response:', rt.substring(0, 500));
        /* Try to extract partial JSON array */
        try {
          const m = rt.match(/\[[\s\S]*\]/);
          if (m) dils = JSON.parse(m[0]);
        } catch(e2) {
          return { statusCode: 200, headers: H, body: JSON.stringify({ ok: false, error: 'IA devolvió respuesta no-JSON: ' + rt.substring(0, 200), rawResponse: rt.substring(0, 500) }) };
        }
      }
      if (!Array.isArray(dils)) dils = [];

      return { statusCode: 200, headers: H, body: JSON.stringify({ ok: true, diligencias: dils, count: dils.length }) };
    }

    /* ═══════════════════════════════════════════════════════
       STAGE 1: EXTRACT — Download from Drive + OCR
       ═══════════════════════════════════════════════════════ */
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');
    let sa;
    try {
      sa = JSON.parse(saJson);
    } catch (parseErr) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is malformed JSON: ' + parseErr.message);
    }
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

      if (r.status >= 300 || !r.data || r.data.length < 100) throw new Error('No se pudo descargar (status: ' + r.status + ', bytes: ' + (r.data?.length || 0) + ')');

      const b64 = r.data.toString('base64');
      const isPdf = mime.includes('pdf');
      const isImg = mime.includes('image');
      const m = mime.includes('google-apps') ? 'application/pdf' : mime;

      let content;
      if (isPdf) content = [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, { type: 'text', text: `Extrae TODO el texto de "${name}". Formato original. Solo texto.` }];
      else if (isImg) content = [{ type: 'image', source: { type: 'base64', media_type: m, data: b64 } }, { type: 'text', text: 'Extrae todo el texto visible. Solo texto.' }];
      else content = [{ type: 'document', source: { type: 'base64', media_type: m, data: b64 } }, { type: 'text', text: 'Extrae todo el texto. Solo texto.' }];

      const ocr = await callClaude(apiKey, SONNET, 'Extrae todo el texto del documento. Manten formato original (parrafos, listas, tablas). Solo el texto extraido, sin comentarios.', content, 16000);
      
      /* Check for API errors */
      if (ocr.error) throw new Error('Claude API: ' + (ocr.error.message || JSON.stringify(ocr.error)));
      
      txt = (ocr.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
      if (!txt) throw new Error('Claude no devolvio texto (model: ' + SONNET + ', bytes: ' + r.data.length + ', mime: ' + mime + ')');
    }

    /* Pro plan: 26s allows time for summary */
    let sum = '';
    try {
      const sr = await callClaude(apiKey, HAIKU, 'Resume documentos jurídicos en máximo 3 oraciones concisas. Solo el resumen, sin preámbulos. Lenguaje formal chileno. NUNCA inventes datos que no aparezcan en el texto.', `Resume:\n${txt.substring(0, 5000)}`, 400);
      sum = (sr.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
    } catch(e) {}

    return { statusCode: 200, headers: H, body: JSON.stringify({
      ok: true, name, mimeType: mime, fileSize: size,
      extractedText: txt.substring(0, 500000), aiSummary: sum || null, charCount: txt.length
    })};

  } catch (err) {
    return { statusCode: 400, headers: H, body: JSON.stringify({ error: err.message }) };
  }
};

exports.config = {
  maxDuration: 60
};
