/**
 * SHARED/RATE-LIMIT.JS — Rate Limiting para funciones Netlify
 * ─────────────────────────────────────────────────────────────
 * Usa Supabase RPC (check_rate_limit) para persistencia entre invocaciones.
 * Fallback: si Supabase no responde, permite la solicitud (fail-open).
 *
 * Límites por defecto por endpoint:
 *   chat          → 60 req/hora
 *   ocr, ocr-batch→ 30 req/hora
 *   qdrant-ingest → 30 req/hora
 *   drive*        → 120 req/hora
 *   otros         → 60 req/hora
 *
 * USO (CJS):
 *   const { checkRateLimit, rateLimitResponse } = require('./shared/rate-limit');
 *   const rl = await checkRateLimit(userId, 'chat', event);
 *   if (!rl.allowed) return rateLimitResponse(rl, headers);
 *
 * USO (ESM):
 *   import { checkRateLimit, rateLimitHeaders } from './shared/rate-limit.js';
 *   const rl = await checkRateLimit(userId, 'chat');
 *   if (!rl.allowed) return new Response(JSON.stringify({error:'Rate limit'}),{status:429,headers:{...CORS,...rateLimitHeaders(rl)}});
 */

const RATE_LIMITS = {
  'chat':           { max: 60,  window: 60 },
  'ocr':            { max: 30,  window: 60 },
  'ocr-batch':      { max: 15,  window: 60 },
  'qdrant-ingest':  { max: 30,  window: 60 },
  'rag':            { max: 60,  window: 60 },
  'drive':          { max: 120, window: 60 },
  'drive-scan':     { max: 20,  window: 60 },
  'drive-extract':  { max: 30,  window: 60 },
  'structure':      { max: 60,  window: 60 },
  'generate-vista': { max: 20,  window: 60 },
  'sheets':         { max: 60,  window: 60 },
  'auto-advance':   { max: 30,  window: 60 },
  'analyze-prescription': { max: 30, window: 60 },
  'default':        { max: 60,  window: 60 },
};

/**
 * Extrae user_id del JWT de Supabase (sin verificar firma — la verificación
 * la hace cada función individualmente). Solo decodifica el payload.
 */
function extractUserIdFromToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return payload.sub || null;
  } catch (e) {
    return null;
  }
}

/**
 * Llama a Supabase RPC check_rate_limit.
 * @param {string} userId - UUID del usuario
 * @param {string} endpoint - nombre del endpoint (e.g. 'chat', 'ocr')
 * @param {object} [envSource] - objeto para obtener env vars (process.env, Netlify.env, event)
 * @returns {Promise<{allowed:boolean, remaining:number, current:number, limit:number, reset_at:string}>}
 */
async function checkRateLimit(userId, endpoint, envSource) {
  if (!userId) return { allowed: true, remaining: 999, current: 0, limit: 999, reset_at: '' };

  const limits = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];

  // Obtener credenciales Supabase
  let sbUrl, sbKey;
  if (envSource && typeof envSource.get === 'function') {
    // Netlify.env (ESM functions)
    sbUrl = envSource.get('SUPABASE_URL') || envSource.get('VITE_SUPABASE_URL');
    sbKey = envSource.get('SUPABASE_SERVICE_ROLE_KEY') || envSource.get('SUPABASE_ANON_KEY');
  } else if (typeof process !== 'undefined' && process.env) {
    // process.env (CJS functions)
    sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  }

  if (!sbUrl || !sbKey) {
    // Sin Supabase configurado: fail-open (permitir)
    console.warn('[rate-limit] Supabase no configurado, permitiendo solicitud');
    return { allowed: true, remaining: limits.max, current: 0, limit: limits.max, reset_at: '' };
  }

  try {
    const res = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_endpoint: endpoint,
        p_max_requests: limits.max,
        p_window_minutes: limits.window,
      }),
    });

    if (!res.ok) {
      console.warn('[rate-limit] Supabase RPC error:', res.status);
      return { allowed: true, remaining: limits.max, current: 0, limit: limits.max, reset_at: '' };
    }

    const data = await res.json();
    return data || { allowed: true, remaining: limits.max, current: 0, limit: limits.max, reset_at: '' };
  } catch (err) {
    // Fail-open: si Supabase está caído, no bloquear al usuario
    console.warn('[rate-limit] Error checking rate limit:', err.message);
    return { allowed: true, remaining: limits.max, current: 0, limit: limits.max, reset_at: '' };
  }
}

/**
 * Genera headers estándar de rate limiting para la respuesta.
 */
function rateLimitHeaders(rl) {
  return {
    'X-RateLimit-Limit': String(rl.limit || 60),
    'X-RateLimit-Remaining': String(Math.max(0, rl.remaining || 0)),
    'X-RateLimit-Reset': rl.reset_at || '',
  };
}

/**
 * Genera respuesta HTTP 429 completa (para funciones CJS con exports.handler).
 */
function rateLimitResponse(rl, extraHeaders) {
  const hdrs = {
    'Content-Type': 'application/json',
    'Retry-After': '60',
    ...rateLimitHeaders(rl),
    ...(extraHeaders || {}),
  };
  return {
    statusCode: 429,
    headers: hdrs,
    body: JSON.stringify({
      error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
      limit: rl.limit,
      remaining: 0,
      reset_at: rl.reset_at,
    }),
  };
}

// Exportar para CJS y ESM
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkRateLimit, rateLimitResponse, rateLimitHeaders, extractUserIdFromToken, RATE_LIMITS };
}
export { checkRateLimit, rateLimitResponse, rateLimitHeaders, extractUserIdFromToken, RATE_LIMITS };
