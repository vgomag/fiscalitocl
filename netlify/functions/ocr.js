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

function driveGetJson(path, token) {
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

function driveDownloadText(path, token) {
  return new Promise((resolve, reject) => {
    https.get('https://www.googleapis.com' + path, {
      headers: { Authorization: 'Bearer ' + token }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    }).on('error', reject);
  });
}

/* Call Anthropic API with document */
function callAnthropic(apiKey, systemPrompt, userContent, maxTokens) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('Parse error: ' + d.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-auth-token'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY no configurada');

    const token = await getAccessToken(sa);
    const { fileId, fileName, diligenciaType, action } = JSON.parse(event.body || '{}');
    if (!fileId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileId requerido' }) };

    /* 1. Get file metadata */
    const meta = await driveGetJson(`/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, token);
    if (meta.status >= 300) throw new Error('No se pudo obtener metadata del archivo');
    const mime = meta.data.mimeType || '';
    const name = meta.data.name || fileName || 'documento';
    const size = parseInt(meta.data.size || '0');

    /* 2. Try text export first (Google Docs, Sheets, text files) */
    let extractedText = '';
    if (mime.includes('google-apps.document')) {
      const r = await driveDownloadText(`/drive/v3/files/${fileId}/export?mimeType=text%2Fplain`, token);
      if (r.status < 300 && r.data.length > 50) extractedText = r.data;
    } else if (mime.includes('google-apps.spreadsheet')) {
      const r = await driveDownloadText(`/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv`, token);
      if (r.status < 300 && r.data.length > 10) extractedText = r.data;
    } else if (mime.includes('text/') || mime.includes('json') || mime.includes('csv')) {
      const r = await driveDownloadText(`/drive/v3/files/${fileId}?alt=media`, token);
      if (r.status < 300) extractedText = r.data;
    }

    /* 3. If binary (PDF, image, Word), download and OCR with Claude */
    if (!extractedText) {
      /* Limit: 30MB for server-side processing */
      if (size > 30 * 1024 * 1024) throw new Error('Archivo demasiado grande (max 30MB): ' + Math.round(size/1024/1024) + 'MB');

      let buf;
      if (mime.includes('google-apps.document') || mime.includes('google-apps.spreadsheet')) {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`, token);
        if (r.status < 300) buf = r.data;
      } else {
        const r = await driveDownloadBinary(`/drive/v3/files/${fileId}?alt=media`, token);
        if (r.status < 300) buf = r.data;
      }

      if (!buf || buf.length < 100) throw new Error('No se pudo descargar el archivo');

      const base64 = buf.toString('base64');
      const isPdf = mime.includes('pdf');
      const isImage = mime.includes('image');
      const finalMime = mime.includes('google-apps') ? 'application/pdf' : mime;

      /* Build Claude message with document content */
      let userContent;
      if (isPdf) {
        userContent = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: `Extrae TODO el texto de este PDF "${name}". Manten el formato original: parrafos, encabezados, numeracion, tablas. Si algo es ilegible: [ilegible]. Solo el texto extraido, sin comentarios.` }
        ];
      } else if (isImage) {
        userContent = [
          { type: 'image', source: { type: 'base64', media_type: finalMime, data: base64 } },
          { type: 'text', text: `Extrae TODO el texto visible de esta imagen "${name}". Manten formato. Solo texto extraido.` }
        ];
      } else {
        userContent = [
          { type: 'document', source: { type: 'base64', media_type: finalMime, data: base64 } },
          { type: 'text', text: `Extrae TODO el texto de este documento "${name}". Manten formato. Solo texto extraido.` }
        ];
      }

      const systemPrompt = 'Eres un experto en OCR y extraccion de texto de documentos legales chilenos. Extrae todo el texto visible del documento. Manten formato original (parrafos, listas, tablas). NO agregues comentarios, solo el texto extraido.';

      const aiResult = await callAnthropic(anthropicKey, systemPrompt, userContent, 16000);
      extractedText = (aiResult.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';

      if (!extractedText) throw new Error('Claude no pudo extraer texto del documento');
    }

    /* 4. Generate summary */
    let aiSummary = '';
    if (extractedText.length > 100) {
      try {
        const summaryResult = await callAnthropic(
          anthropicKey,
          'Resume documentos juridicos en maximo 3 oraciones concisas. Solo el resumen, sin preambulos.',
          `Resume este documento tipo "${diligenciaType || 'otro'}" del expediente:\n\n${extractedText.substring(0, 6000)}`,
          500
        );
        aiSummary = (summaryResult.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';
      } catch(e) { console.warn('Summary failed:', e.message); }
    }

    /* 5. If action=analyze, identify individual diligencias in the text */
    if (action === 'analyze' && extractedText.length > 200) {
      try {
        const analyzePrompt = `Eres un experto en procedimientos disciplinarios de la Administracion Publica chilena. Analiza el siguiente texto extraido de un expediente y LISTA CADA DILIGENCIA INDIVIDUAL que encuentres.

TIPOS DE DILIGENCIAS A IDENTIFICAR:
- denuncia: Denuncia o relato de hechos
- resolucion_inicio: Resolucion que instruye el procedimiento
- declaracion_denunciante: Declaracion del/la denunciante
- declaracion_denunciado: Declaracion del/la denunciado/a o inculpado/a
- declaracion_testigo: Declaracion de testigo
- oficio: Oficios enviados o recibidos
- informe: Informes (psicologico, medico, pericial, etc.)
- acta: Actas de notificacion, constitucion, etc.
- notificacion: Notificaciones formales
- prueba_documental: Documentos probatorios (correos, capturas, contratos)
- cargos: Formulacion de cargos
- descargos: Presentacion de descargos
- vista_fiscal: Vista fiscal o informe final
- resolucion: Otras resoluciones (ampliacion plazo, medidas, etc.)
- otro: Cualquier otro documento relevante

RESPONDE SOLO EN JSON (sin markdown ni backticks). Un array de objetos con esta estructura:
[
  {
    "tipo": "declaracion_testigo",
    "titulo": "Declaracion de Juan Perez, testigo",
    "fecha": "2024-03-15",
    "fojas": "15-22",
    "personas": ["Juan Perez"],
    "resumen": "El testigo declara haber presenciado los hechos el dia 10 de enero...",
    "texto_inicio": "Las primeras 150 caracteres del texto de esta diligencia...",
    "relevancia": "alta"
  }
]

REGLAS:
- Identifica TODAS las diligencias, incluso las menores
- "fecha" en formato YYYY-MM-DD si la encuentras, null si no
- "fojas" indica las paginas/fojas donde aparece la diligencia
- "resumen" maximo 2 oraciones
- "texto_inicio" los primeros ~150 caracteres del texto de esa diligencia (para busqueda)
- "relevancia": "alta" (declaraciones, cargos, vista fiscal), "media" (oficios, notificaciones), "baja" (actas formales rutinarias)
- NO inventes diligencias que no esten en el texto
- Si el texto es muy largo, prioriza las diligencias mas importantes`;

        const analyzeResult = await callAnthropic(
          anthropicKey,
          analyzePrompt,
          `Analiza este expediente y lista cada diligencia:\n\n${extractedText.substring(0, 30000)}`,
          4000
        );
        const analyzeText = (analyzeResult.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || '';

        let diligencias = [];
        try {
          /* Clean potential markdown fences */
          const clean = analyzeText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          diligencias = JSON.parse(clean);
          if (!Array.isArray(diligencias)) diligencias = [];
        } catch (e) {
          console.warn('Parse diligencias failed:', e.message);
        }

        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            ok: true,
            name,
            mimeType: mime,
            fileSize: size,
            extractedText: extractedText.substring(0, 200000),
            aiSummary: aiSummary || null,
            charCount: extractedText.length,
            diligencias: diligencias
          })
        };
      } catch (e) {
        console.warn('Analyze failed:', e.message);
        /* Fall through to normal return */
      }
    }

    /* 6. Return text + summary (normal mode) */
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        name,
        mimeType: mime,
        fileSize: size,
        extractedText: extractedText.substring(0, 200000),
        aiSummary: aiSummary || null,
        charCount: extractedText.length
      })
    };

  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: err.message }) };
  }
};
