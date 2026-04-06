/**
 * AUTO-ADVANCE.JS — Avance automático de etapas procesales
 * ─────────────────────────────────────────────────────────
 * Analiza diligencias/documentos subidos a un caso y determina si corresponde
 * avanzar la etapa procesal. También extrae metadata automáticamente.
 *
 * POST { caseId, action: "analyze" | "advance" | "batch-autofill" }
 *   - analyze: Analiza documentos del caso y sugiere la etapa
 *   - advance: Avanza a la etapa sugerida
 *   - batch-autofill: Extrae metadata + avanza etapas para múltiples casos
 */
const https = require('https');
const { callAnthropic } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');
const { corsHeaders } = require('./shared/cors');
const { buildLightDirectives } = require('./shared/writing-style');

/* ── Etapas procesales ordenadas ── */
const STAGES = ['indagatoria', 'cargos', 'descargos', 'prueba', 'vista', 'resolucion', 'cerrado'];

/* ── Patrones de documentos por etapa ── */
const STAGE_DOCUMENT_PATTERNS = {
  cargos: [
    /formulaci[oó]n\s+de\s+cargos/i,
    /resoluci[oó]n\s+(de\s+)?cargos/i,
    /acta\s+de\s+cargos/i,
    /notificaci[oó]n\s+(de\s+)?cargos/i
  ],
  descargos: [
    /descargos/i,
    /contestaci[oó]n/i,
    /respuesta\s+a\s+cargos/i,
    /escrito\s+de\s+defensa/i
  ],
  prueba: [
    /t[eé]rmino\s+probatorio/i,
    /resoluci[oó]n\s+.*prueba/i,
    /auto\s+de\s+prueba/i,
    /apertura\s+.*probatorio/i
  ],
  vista: [
    /vista\s+fiscal/i,
    /informe\s+fiscal/i,
    /dictamen/i,
    /propuesta\s+(de\s+)?sanci[oó]n/i,
    /propuesta\s+(de\s+)?sobreseimiento/i
  ],
  resolucion: [
    /resoluci[oó]n\s+final/i,
    /resoluci[oó]n\s+de\s+t[eé]rmino/i,
    /sanci[oó]n\s+aplicada/i,
    /sobreseimiento/i,
    /absoluci[oó]n/i
  ]
};

/* ── Patrones para extraer metadata ── */
const METADATA_PATTERNS = {
  tipo_procedimiento: [
    { pattern: /investigaci[oó]n\s+sumaria/i, value: 'Investigación Sumaria' },
    { pattern: /sumario\s+administrativo/i, value: 'Sumario Administrativo' },
    { pattern: /procedimiento\s+disciplinario/i, value: 'Procedimiento Disciplinario' }
  ],
  protocolo: [
    { pattern: /ley\s+karin/i, value: 'Ley Karin' },
    { pattern: /protocolo\s+2022/i, value: '2022' },
    { pattern: /protocolo\s+2020/i, value: '2020' },
    { pattern: /ley\s+18\.?834/i, value: '18834' }
  ]
};

/* json() helper — not used in CJS handler, kept for reference */
function json(data, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

/* ── Detectar etapa sugerida por patrones de texto ── */
function detectStageFromText(texts) {
  const combined = texts.join(' ');
  // Buscar de la etapa más avanzada a la menos (priorizar avance)
  for (let i = STAGES.length - 2; i >= 1; i--) {
    const stage = STAGES[i];
    const patterns = STAGE_DOCUMENT_PATTERNS[stage];
    if (patterns && patterns.some(p => p.test(combined))) {
      return stage;
    }
  }
  return null;
}

/* ── Extraer metadata del texto ── */
function extractMetadata(texts) {
  const combined = texts.join(' ');
  const metadata = {};
  Object.entries(METADATA_PATTERNS).forEach(([key, patterns]) => {
    for (const { pattern, value } of patterns) {
      if (pattern.test(combined)) {
        metadata[key] = value;
        break;
      }
    }
  });
  return metadata;
}

/**
 * Auto Advance — Avance automático de etapas procesales en casos.
 * Analiza diligencias y detecta cambios de etapa (indagatoria → cargos → descargos, etc.).
 * Extrae metadata automáticamente.
 *
 * @route POST /.netlify/functions/auto-advance
 * @param {Object} body
 * @param {string} body.action - 'analyze' | 'advance' | 'batch-autofill'
 * @param {string} [body.caseId] - ID del caso (para analyze/advance)
 * @param {Array<{extracted_text?, ai_summary?}>} [body.diligencias] - Diligencias del caso
 * @param {Array<string>} [body.caseIds] - IDs de casos (para batch-autofill)
 * @returns {Object}
 *   - analyze/advance: {
 *       suggestedStage: string,
 *       patternStage: string,
 *       aiSuggestion?: {stage, confidence, reason},
 *       metadata: Object,
 *       action: 'analyze_only'|'advance_requested'
 *     }
 *   - batch-autofill: {
 *       results: Array<{caseId, suggestedStage, metadata, documentCount}>,
 *       processed: number
 *     }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */
exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'auto-advance');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const body = JSON.parse(event.body);
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { caseId, action, diligencias, caseIds } = body;

    if (action === 'analyze' || action === 'advance') {
      /* ── Analizar un caso individual ── */
      if (!caseId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'caseId requerido' }) };

      // Obtener textos de las diligencias (pasados desde frontend o extraídos)
      const texts = (diligencias || []).map(d => d.extracted_text || d.ai_summary || '').filter(Boolean);

      if (!texts.length) {
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({ suggestedStage: null, metadata: {}, message: 'Sin textos de diligencias para analizar' })
        };
      }

      // Detección por patrones (rápida, sin IA)
      const suggestedStage = detectStageFromText(texts);
      const metadata = extractMetadata(texts);

      // Si hay key de Anthropic, usar IA para análisis más profundo
      const apiKey = process.env.ANTHROPIC_API_KEY;
      let aiSuggestion = null;

      if (apiKey && texts.join(' ').length > 200) {
        try {
          const system = `Eres un asistente jurídico experto en procedimientos disciplinarios universitarios chilenos (UMAG).
Analiza los documentos de un expediente y determina en qué etapa procesal se encuentra.
Las etapas posibles son: indagatoria, cargos, descargos, prueba, vista, resolucion, cerrado.
Responde SOLO con un JSON: {"stage":"nombre_etapa","confidence":"alta|media|baja","reason":"breve explicación"}

${buildLightDirectives()}`;

          const userMsg = `Documentos del expediente (extractos):\n\n${texts.slice(0, 5).map((t, i) => `--- Documento ${i + 1} ---\n${t.slice(0, 500)}`).join('\n\n')}`;

          const res = await callAnthropic(apiKey, system, userMsg, 300);
          if (res.content && res.content[0]) {
            const text = res.content[0].text || '';
            const match = text.match(/\{[\s\S]*?\}/);
            if (match) aiSuggestion = JSON.parse(match[0]);
          }
        } catch (e) {
          console.log('AI analysis fallback:', e.message);
        }
      }

      const finalStage = aiSuggestion?.stage || suggestedStage;

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          suggestedStage: finalStage,
          patternStage: suggestedStage,
          aiSuggestion,
          metadata,
          action: action === 'advance' ? 'advance_requested' : 'analyze_only'
        })
      };
    }

    if (action === 'batch-autofill') {
      /* ── Batch: extraer metadata para múltiples casos ── */
      const ids = caseIds || [];
      if (!ids.length) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'caseIds requerido' }) };

      const results = ids.map(id => {
        const caseDiligencias = (diligencias || []).filter(d => d.case_id === id);
        const texts = caseDiligencias.map(d => d.extracted_text || d.ai_summary || '').filter(Boolean);
        return {
          caseId: id,
          suggestedStage: detectStageFromText(texts),
          metadata: extractMetadata(texts),
          documentCount: texts.length
        };
      });

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ results, processed: results.length })
      };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'action inválida. Use: analyze, advance, batch-autofill' }) };

  } catch (err) {
    console.error('auto-advance error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message })
    };
  }
};
