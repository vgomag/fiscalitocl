// netlify/functions/drive.js
// Integración Google Drive con cuenta de servicio para Fiscalito
// Acciones: list, files, sync, createFolder

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const FOLDER_MIS_CASOS = '135lX5Ns5I-yJlEO9Zt10ksPweWeWGw5U';
const FOLDER_MADRE     = '1e4Brdkmx50Ci8GoK-hQZbGNnXTTubaE2';

// ── JWT / OAuth2 sin dependencias externas ─────────────────────────────────

function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Falta variable GOOGLE_SERVICE_ACCOUNT_KEY');
  const sa   = JSON.parse(raw);
  const now  = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;

  // Firmar con la clave privada usando Web Crypto
  const keyData = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryKey = Buffer.from(keyData, 'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    Buffer.from(signingInput)
  );
  const jwt = `${signingInput}.${base64url(Buffer.from(sig).toString('binary').split('').map(c=>c.charCodeAt(0)).reduce((a,b)=>a+String.fromCharCode(b),''))}`;

  // Forma correcta: convertir ArrayBuffer a base64url
  const sigB64 = Buffer.from(new Uint8Array(sig)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const finalJwt = `${signingInput}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: finalJwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth2 error: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Helpers Drive API ──────────────────────────────────────────────────────

async function driveGet(path, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function drivePost(path, body, token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Listar carpetas hijas de un folder
async function listFolders(parentId, token) {
  const q = encodeURIComponent(
    `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const data = await driveGet(
    `files?q=${q}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=name&pageSize=200`,
    token
  );
  return data.files || [];
}

// Listar archivos (no carpetas) dentro de un folder
async function listFiles(folderId, token) {
  const q = encodeURIComponent(
    `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`
  );
  const data = await driveGet(
    `files?q=${q}&fields=files(id,name,webViewLink,mimeType,size,modifiedTime)&orderBy=name&pageSize=200`,
    token
  );
  return data.files || [];
}

// Crear carpeta dentro de un parent
async function createFolder(name, parentId, token) {
  return drivePost('files', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  }, token);
}

// ── Supabase helpers ───────────────────────────────────────────────────────

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbGet(table, query) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res  = await fetch(url, { headers: sbHeaders() });
  return res.json();
}

async function sbPatch(table, id, body) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const res  = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });
  return res.ok;
}

// ── Utilidades de matching ─────────────────────────────────────────────────

// Normaliza un string para comparación fuzzy
function norm(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Intenta hacer match entre nombre de carpeta Drive y campos del caso
function matchScore(folder, caso) {
  const fn = norm(folder.name);
  const rol = norm(caso.rol || '');
  const name = norm(caso.name || '');
  const cara = norm(caso.caratula || '');

  // Match exacto por ROL (ej: "23-2024" en nombre de carpeta)
  if (rol && fn.includes(rol)) return 100;
  // Match por nombre de caso
  if (name && fn.includes(name)) return 90;
  // Match parcial por carátula
  if (cara && cara.length > 4 && fn.includes(cara.substring(0, 8))) return 70;
  return 0;
}

// ── Handler principal ──────────────────────────────────────────────────────

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body   = JSON.parse(event.body || '{}');
    const action = body.action;
    const token  = await getAccessToken();

    // ── action: list ─────────────────────────────────────────────────────
    // Lista subcarpetas de "Mis Casos" para mostrar en la UI
    if (action === 'list') {
      const folders = await listFolders(FOLDER_MIS_CASOS, token);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, folders }),
      };
    }

    // ── action: files ────────────────────────────────────────────────────
    // Lista archivos de la carpeta de un caso específico
    if (action === 'files') {
      const { folderId } = body;
      if (!folderId) throw new Error('folderId requerido');
      const files = await listFiles(folderId, token);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, files }),
      };
    }

    // ── action: createFolder ─────────────────────────────────────────────
    // Crea una carpeta nueva en "Mis Casos" y la vincula al caso en Supabase
    if (action === 'createFolder') {
      const { caseId, folderName } = body;
      if (!caseId || !folderName) throw new Error('caseId y folderName requeridos');
      const folder = await createFolder(folderName, FOLDER_MIS_CASOS, token);
      // Actualizar Supabase
      await sbPatch('cases', caseId, {
        drive_folder_id: folder.id,
        drive_folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
      });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, folder }),
      };
    }

    // ── action: link ─────────────────────────────────────────────────────
    // Vincula manualmente una carpeta existente a un caso
    if (action === 'link') {
      const { caseId, folderId, folderName } = body;
      if (!caseId || !folderId) throw new Error('caseId y folderId requeridos');
      await sbPatch('cases', caseId, {
        drive_folder_id: folderId,
        drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
      });
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, linked: { caseId, folderId, folderName } }),
      };
    }

    // ── action: sync ─────────────────────────────────────────────────────
    // Auto-vincula carpetas de Drive a casos por nombre/ROL
    if (action === 'sync') {
      const [folders, cases] = await Promise.all([
        listFolders(FOLDER_MIS_CASOS, token),
        sbGet('cases', 'select=id,name,rol,caratula,drive_folder_id&deleted_at=is.null&limit=500'),
      ]);

      const results = { linked: [], skipped: [], unmatched: [] };

      for (const folder of folders) {
        let best = null, bestScore = 0;
        for (const caso of cases) {
          if (caso.drive_folder_id) continue; // ya vinculado
          const score = matchScore(folder, caso);
          if (score > bestScore) { bestScore = score; best = caso; }
        }

        if (best && bestScore >= 70) {
          await sbPatch('cases', best.id, {
            drive_folder_id: folder.id,
            drive_folder_url: `https://drive.google.com/drive/folders/${folder.id}`,
          });
          results.linked.push({ folder: folder.name, case: best.name, score: bestScore });
        } else {
          results.unmatched.push(folder.name);
        }
      }

      // Casos sin carpeta vinculada
      for (const caso of cases) {
        if (!caso.drive_folder_id &&
            !results.linked.find(l => l.case === caso.name)) {
          results.skipped.push(caso.name);
        }
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, results }),
      };
    }

    return {
      statusCode: 400, headers,
      body: JSON.stringify({ error: `Acción desconocida: ${action}` }),
    };

  } catch (err) {
    console.error('drive.js error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
