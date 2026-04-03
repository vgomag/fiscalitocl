/**
 * DRIVE-SCAN.JS — Scheduled Netlify Function
 * ════════════════════════════════════════════
 * Escanea carpetas Drive de casos activos buscando archivos nuevos.
 * Puede ejecutarse como:
 *   - Scheduled function (cron cada 15 min)
 *   - POST manual desde el frontend
 *
 * Requiere: SUPABASE_URL, SUPABASE_SERVICE_KEY, GOOGLE_SA_KEY (service account JSON)
 */
const https = require('https');
const crypto = require('crypto');

/* ══════════════════════════════════
   GOOGLE DRIVE AUTH (Service Account)
   ══════════════════════════════════ */
function base64url(buf){
  return Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}

function getGoogleToken(saKey){
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now()/1000);
    const header = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
    const claim = base64url(JSON.stringify({
      iss: saKey.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    }));
    const signInput = header + '.' + claim;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signInput);
    const signature = base64url(sign.sign(saKey.private_key));
    const jwt = signInput + '.' + signature;

    const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body)}
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).access_token); }
        catch(e) { reject(new Error('Google token parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function listDriveFolder(folderId, token){
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent('files(id,name,mimeType,modifiedTime,webViewLink,createdTime)');
    const url = `/drive/v3/files?q=${q}&fields=${fields}&pageSize=200`;

    const req = https.request({
      hostname: 'www.googleapis.com',
      path: url,
      method: 'GET',
      headers: {'Authorization': 'Bearer ' + token}
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(d);
          resolve(data.files || []);
        } catch(e) { reject(new Error('Drive list parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* ══════════════════════════════════
   SUPABASE CLIENT (Server-side)
   ══════════════════════════════════ */
function supabaseFetch(url, serviceKey, path, method, body){
  return new Promise((resolve, reject) => {
    const reqBody = body ? JSON.stringify(body) : '';
    const headers = {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal'
    };
    if(reqBody) headers['Content-Length'] = Buffer.byteLength(reqBody);

    const parsed = new URL(url + '/rest/v1/' + path);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: method || 'GET',
      headers
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d || '[]')); }
        catch { resolve(d); }
      });
    });
    req.on('error', reject);
    if(reqBody) req.write(reqBody);
    req.end();
  });
}

/* ══════════════════════════════════
   HANDLER
   ══════════════════════════════════ */
exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    let body = null;
    if (event.body) {
      body = JSON.parse(event.body);
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length > 1000000) {
        return { statusCode: 413, headers, body: JSON.stringify({ error: 'Payload too large' }) };
      }
    }
    const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SA_KEY_STR = process.env.GOOGLE_SA_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!SB_URL || !SB_KEY) throw new Error('Supabase config missing');
    if (!SA_KEY_STR) throw new Error('Google SA key missing');

    const saKey = typeof SA_KEY_STR === 'string' ? JSON.parse(SA_KEY_STR) : SA_KEY_STR;

    /* Parsear body si es POST manual */
    let targetCaseId = null;
    if (body) {
      targetCaseId = body.caseId || null;
    }

    /* Obtener token de Google */
    const gToken = await getGoogleToken(saKey);

    /* Obtener casos activos con carpeta Drive */
    let casesPath = 'cases?select=id,name,drive_folder_url&drive_folder_url=not.is.null&status=neq.cerrado';
    if (targetCaseId) {
      casesPath = `cases?select=id,name,drive_folder_url&id=eq.${targetCaseId}`;
    }
    const cases = await supabaseFetch(SB_URL, SB_KEY, casesPath, 'GET');

    if (!Array.isArray(cases) || cases.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: 'No active cases with Drive folders', scanned: 0 }) };
    }

    const results = [];

    for (const caso of cases.slice(0, 20)) { // Max 20 casos por ejecución
      try {
        /* Extraer folder ID */
        const m = (caso.drive_folder_url || '').match(/folders\/([a-zA-Z0-9_-]+)/);
        if (!m) continue;
        const folderId = m[1];

        /* Listar archivos del Drive */
        const driveFiles = await listDriveFolder(folderId, gToken);

        /* Obtener diligencias existentes */
        const existing = await supabaseFetch(SB_URL, SB_KEY,
          `diligencias?select=drive_file_id,file_name&case_id=eq.${caso.id}`, 'GET');

        const existingIds = new Set((existing || []).map(d => d.drive_file_id).filter(Boolean));
        const existingNames = new Set((existing || []).map(d => d.file_name).filter(Boolean));

        /* Filtrar nuevos */
        const newFiles = driveFiles.filter(f =>
          f.mimeType !== 'application/vnd.google-apps.folder' &&
          !existingIds.has(f.id) &&
          !existingNames.has(f.name)
        );

        if (newFiles.length > 0) {
          /* Insertar como diligencias pendientes */
          const records = newFiles.map(f => ({
            case_id: caso.id,
            file_name: f.name,
            drive_file_id: f.id,
            drive_web_link: f.webViewLink || '',
            mime_type: f.mimeType || '',
            diligencia_type: classifyFile(f.name),
            diligencia_label: classifyFile(f.name).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            is_processed: false,
            processing_status: 'pending'
          }));

          await supabaseFetch(SB_URL, SB_KEY, 'diligencias', 'POST', records);
        }

        results.push({
          caseId: caso.id,
          caseName: caso.name,
          driveFiles: driveFiles.length,
          newFiles: newFiles.length,
          imported: newFiles.length
        });

      } catch (err) {
        results.push({ caseId: caso.id, error: err.message });
      }
    }

    const totalNew = results.reduce((sum, r) => sum + (r.newFiles || 0), 0);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        scanned: results.length,
        totalNewFiles: totalNew,
        results
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

/* Clasificar archivo por nombre */
function classifyFile(name) {
  const fn = (name || '').toLowerCase();
  if (/denuncia/i.test(fn)) return 'denuncia';
  if (/resoluci[oó]n.*inicio/i.test(fn)) return 'resolucion_inicio';
  if (/resoluci[oó]n/i.test(fn)) return 'resolucion';
  if (/declaraci[oó]n.*test/i.test(fn)) return 'declaracion_testigo';
  if (/declaraci[oó]n.*denunciante/i.test(fn)) return 'declaracion_denunciante';
  if (/declaraci[oó]n.*denunciad/i.test(fn)) return 'declaracion_denunciado';
  if (/acta/i.test(fn)) return 'acta';
  if (/oficio/i.test(fn)) return 'oficio';
  if (/informe/i.test(fn)) return 'informe';
  if (/notificaci[oó]n/i.test(fn)) return 'notificacion';
  if (/cargo/i.test(fn)) return 'cargos';
  if (/descargo/i.test(fn)) return 'descargos';
  if (/vista.*fiscal/i.test(fn)) return 'vista_fiscal';
  return 'otro';
}

/* ══════════════════════════════════
   NETLIFY SCHEDULED FUNCTION CONFIG
   ══════════════════════════════════
   Para habilitar ejecución automática cada 15 minutos,
   agregar en netlify.toml:

   [functions."drive-scan"]
   schedule = " * /15 * * * *"
   ══════════════════════════════════ */
