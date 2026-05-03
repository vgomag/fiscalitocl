/**
 * CLASSIFY-RESOLUTION-MODELS.JS — Reclasificación de modelos en categoría "otro"
 * ─────────────────────────────────────────────────────────────────────────────
 * Reclasifica registros de la tabla case_resolution_models que quedaron en
 * categoría 'otro' tras la heurística inicial por nombre.
 *
 * Modos:
 *   - mode: 'heuristic' → re-aplica guessCategory por nombre.
 *   - mode: 'ai'        → IA por lotes (Claude Haiku 4.5).
 *
 * Selección de candidatos:
 *   - Si body.modelIds → solo esos (validados contra user_id).
 *   - Si no            → WHERE user_id = uid AND resolution_category = 'otro'
 *   - Tope: 500 modelos por invocación.
 *
 * Modo AI:
 *   - Modelo: Claude Haiku 4.5 (rápido y económico, vía shared/anthropic.js).
 *     NOTA: el spec original usa gemini-2.5-flash-lite; se reemplaza por Haiku
 *     porque el stack actual ya tiene Anthropic configurado (mismo perfil).
 *   - Lotes de 30 modelos por request.
 *   - Prompt: lista las 26 categorías + 3 procedure_types y entrega:
 *       nombre, file_name y primeros 200 chars de cada documento.
 *   - Respuesta esperada: JSON array
 *       [{ "idx": n, "category": "...", "procedure_type": "..." }, ...]
 *   - Validación: si la categoría no está en CATEGORIES → 'otro';
 *                 si el procedure_type no es válido → 'investigacion_sumaria'.
 *   - Si el lote falla → fallback heurístico (classifyByName) por modelo.
 *
 * Persistencia:
 *   UPDATE case_resolution_models
 *      SET resolution_category = ?, procedure_type = ?
 *    WHERE id = ? AND user_id = uid
 *
 * Respuesta: { classified, total, results: [{id, category, procedure_type}] }
 *
 * @route POST /.netlify/functions/classify-resolution-models
 * @auth  x-auth-token (JWT Supabase)
 * @rateLimit 10 req/hora por usuario (operación pesada)
 */
const { callAnthropic, MODEL_HAIKU } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');
const { corsHeaders } = require('./shared/cors');

/* ── Categorías controladas (deben coincidir con el CHECK constraint del SQL) ── */
const CATEGORIES = [
  'citacion','notificacion','acta_declaracion','acta_ratificacion',
  'acta_entrevista','acta_notificacion','resolucion_acepta_cargo',
  'resolucion_cita_declarar','resolucion_medida_resguardo','resolucion_general',
  'oficio','cuestionario','constancia','consentimiento','certificacion',
  'acuerdo_alejamiento','formulacion_cargos','descargos','provee_descargos',
  'informe','vista_fiscal','incorpora_antecedentes','denuncia','memo','otro'
];

const PROCEDURE_TYPES = [
  'investigacion_sumaria','sumario_administrativo','ambos'
];

/* ── Heurística por nombre (replica exacta del cliente) ── */
function guessCategory(name) {
  const n = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/citacion|cita a/.test(n)) return 'citacion';
  if (/acta de ratificacion|ratificacion/.test(n)) return 'acta_ratificacion';
  if (/acta de declaracion|declaracion/.test(n)) return 'acta_declaracion';
  if (/acta de entrevista/.test(n)) return 'acta_entrevista';
  if (/acta de notificacion/.test(n)) return 'acta_notificacion';
  if (/notificacion/.test(n)) return 'notificacion';
  if (/acepta cargo|actuaria/.test(n)) return 'resolucion_acepta_cargo';
  if (/resolucion.*cita/.test(n)) return 'resolucion_cita_declarar';
  if (/medida.*resguardo|medida.*proteccion/.test(n)) return 'resolucion_medida_resguardo';
  if (/incorpora/.test(n)) return 'incorpora_antecedentes';
  if (/resolucion|res\.ex/.test(n)) return 'resolucion_general';
  if (/oficio/.test(n)) return 'oficio';
  if (/cuestionario/.test(n)) return 'cuestionario';
  if (/constancia/.test(n)) return 'constancia';
  if (/consentimiento/.test(n)) return 'consentimiento';
  if (/certificacion|certificado/.test(n)) return 'certificacion';
  if (/acuerdo.*alejamiento/.test(n)) return 'acuerdo_alejamiento';
  if (/formulacion.*cargos|pliego/.test(n)) return 'formulacion_cargos';
  if (/provee.*descargo/.test(n)) return 'provee_descargos';
  if (/descargo/.test(n)) return 'descargos';
  if (/informe/.test(n)) return 'informe';
  if (/vista.*fiscal/.test(n)) return 'vista_fiscal';
  if (/denuncia/.test(n)) return 'denuncia';
  if (/memo/.test(n)) return 'memo';
  return 'otro';
}

function guessProcedure(name) {
  return /sumario/i.test(String(name || ''))
    ? 'sumario_administrativo'
    : 'investigacion_sumaria';
}

function classifyByName(model) {
  const ref = model.name || model.file_name || '';
  return {
    category: guessCategory(ref),
    procedure_type: guessProcedure(ref),
  };
}

/* ── Supabase REST helpers (service role; siempre filtramos por user_id) ── */
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Prefer': 'return=representation',
  };
}

async function fetchModelsToClassify(userId, modelIds) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase no configurado');
  const select = 'id,name,file_name,extracted_text,resolution_category,procedure_type,user_id';
  let url;
  if (Array.isArray(modelIds) && modelIds.length) {
    const ids = modelIds.slice(0, 500).map(encodeURIComponent).join(',');
    url = `${SB_URL}/rest/v1/case_resolution_models?select=${select}&user_id=eq.${userId}&id=in.(${ids})&limit=500`;
  } else {
    url = `${SB_URL}/rest/v1/case_resolution_models?select=${select}&user_id=eq.${userId}&resolution_category=eq.otro&limit=500`;
  }
  const r = await fetch(url, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase fetch falló: ${r.status} ${await r.text()}`);
  return await r.json();
}

async function updateModelClassification(userId, id, category, procedure_type) {
  const url = `${SB_URL}/rest/v1/case_resolution_models?id=eq.${encodeURIComponent(id)}&user_id=eq.${userId}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({
      resolution_category: category,
      procedure_type,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.warn(`[classify-models] UPDATE falló id=${id}:`, r.status, t);
    return false;
  }
  return true;
}

/* ── IA: clasificar un lote de modelos ── */
async function classifyBatchAI(apiKey, batch) {
  const system = `Eres un clasificador de actuaciones jurídicas chilenas en procedimientos disciplinarios.
Recibirás un lote de documentos (cada uno con nombre, archivo y los primeros caracteres del texto). Para cada uno debes asignar:
1) "category" — UNA de estas exactamente (snake_case):
${CATEGORIES.join(', ')}
2) "procedure_type" — UNO de: ${PROCEDURE_TYPES.join(', ')}.

Responde EXCLUSIVAMENTE con un JSON array, sin texto extra ni markdown:
[{"idx":0,"category":"...","procedure_type":"..."}, ...]
Mantén el mismo "idx" recibido. Si dudas, usa "otro" e "investigacion_sumaria".`;

  const userMsg = batch.map((m, i) => {
    const preview = String(m.extracted_text || '').slice(0, 200).replace(/\s+/g, ' ').trim();
    return `--- idx ${i} ---
nombre: ${m.name || ''}
archivo: ${m.file_name || ''}
preview: ${preview}`;
  }).join('\n\n');

  const res = await callAnthropic(apiKey, system, userMsg, {
    model: MODEL_HAIKU,
    maxTokens: 2000,
    timeout: 25000,
  });

  if (!res || !res.content || !res.content[0]) throw new Error('Respuesta IA vacía');
  const text = res.content[0].text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No se encontró JSON array en respuesta IA');
  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (e) { throw new Error('JSON IA inválido'); }
  if (!Array.isArray(parsed)) throw new Error('Respuesta IA no es array');
  return parsed;
}

/* ── Handler ── */
exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };
  }

  try {
    const userId = await extractUserIdFromToken(authToken);
    if (!userId) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Token inválido' }) };
    }

    // Rate limit: clasificación es operación pesada → usar bucket dedicado
    const rl = await checkRateLimit(userId, 'classify-resolution-models');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch (e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) }; }

    const mode = body.mode === 'heuristic' ? 'heuristic' : 'ai';
    const modelIds = Array.isArray(body.modelIds) ? body.modelIds : null;

    // 1. Recuperar modelos a clasificar
    const models = await fetchModelsToClassify(userId, modelIds);
    if (!models.length) {
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ classified: 0, total: 0, results: [] }) };
    }

    const results = [];
    let classifiedCount = 0;

    if (mode === 'heuristic') {
      // ── Modo heurístico: aplicar regex por modelo ──
      for (const m of models) {
        const { category, procedure_type } = classifyByName(m);
        const ok = await updateModelClassification(userId, m.id, category, procedure_type);
        if (ok) classifiedCount++;
        results.push({ id: m.id, category, procedure_type });
      }
    } else {
      // ── Modo AI: lotes de 30 ──
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }) };
      }

      const BATCH_SIZE = 30;
      for (let i = 0; i < models.length; i += BATCH_SIZE) {
        const batch = models.slice(i, i + BATCH_SIZE);
        let aiResults = [];
        try {
          aiResults = await classifyBatchAI(apiKey, batch);
        } catch (err) {
          console.warn('[classify-models] Lote falló, fallback heurístico:', err.message);
          aiResults = [];
        }

        // Index ai por idx
        const byIdx = new Map();
        for (const r of aiResults) {
          if (r && typeof r.idx === 'number') byIdx.set(r.idx, r);
        }

        // Aplicar resultado IA o fallback heurístico por cada uno del lote
        for (let j = 0; j < batch.length; j++) {
          const m = batch[j];
          let category, procedure_type;
          const ai = byIdx.get(j);
          if (ai && CATEGORIES.includes(ai.category)) {
            category = ai.category;
            procedure_type = PROCEDURE_TYPES.includes(ai.procedure_type)
              ? ai.procedure_type
              : 'investigacion_sumaria';
          } else {
            const fb = classifyByName(m);
            category = fb.category;
            procedure_type = fb.procedure_type;
          }

          const ok = await updateModelClassification(userId, m.id, category, procedure_type);
          if (ok) classifiedCount++;
          results.push({ id: m.id, category, procedure_type });
        }
      }
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        classified: classifiedCount,
        total: models.length,
        results,
      }),
    };

  } catch (err) {
    console.error('classify-resolution-models error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

exports.config = {
  maxDuration: 60,
};
