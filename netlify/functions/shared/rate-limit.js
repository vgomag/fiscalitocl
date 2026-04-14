/**
 * SHARED/RATE-LIMIT.JS — Rate Limiting para funciones Netlify (CJS)
 * ─────────────────────────────────────────────────────────────────
 * Usa Supabase RPC (check_rate_limit) para persistencia.
 * Fail-closed: si Supabase no responde, rechaza la solicitud.
 *
 * Límites por endpoint (requests/hora):
 *   chat:60  ocr:30  ocr-batch:15  qdrant-ingest:30  rag:60
 *   drive:120  drive-scan:20  drive-extract:30  structure:60
 *   generate-vista:20  sheets:60  auto-advance:30  analyze-prescription:30
 *
 * USO (CJS — exports.handler functions):
 *   const { checkRateLimit, rateLimitResponse } = require('./shared/rate-limit');
 *   const rl = await checkRateLimit(userId, 'chat');
 *   if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);
 */

const RATE_LIMITS = {
  'chat': 60, 'ocr': 30, 'ocr-batch': 15, 'qdrant-ingest': 30,
  'rag': 60, 'drive': 120, 'drive-scan': 20, 'drive-extract': 30,
  'structure': 60, 'generate-vista': 20, 'sheets': 60,
  'auto-advance': 30, 'analyze-prescription': 30, 'default': 60,
};

/**
 * SEC-01 FIX: Extrae user ID del token JWT y verifica contra Supabase auth cuando es posible.
 * Verifica expiración local. Intenta validar firma via Supabase auth.getUser().
 * Retorna userId o null.
 */
async function extractUserIdFromToken(token) {
  if (!token) return null;
  let uid = null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    uid = payload.sub || null;
    if (!uid) return null;
    // Verificar expiración
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  } catch (e) { return null; }

  // Intentar verificar firma contra Supabase
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (sbUrl && sbKey) {
    try {
      const _ac = new AbortController();
      const _to = setTimeout(() => _ac.abort(), 5000);
      const authRes = await fetch(`${sbUrl}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbKey },
        signal: _ac.signal
      });
      clearTimeout(_to);
      if (authRes.ok) {
        const user = await authRes.json();
        return (user && user.id) ? user.id : null;
      } else if (authRes.status === 401) {
        return null; // Token inválido
      }
      // Otros errores: fallback
    } catch (e) { /* fallback a uid local */ }
  }
  return uid;
}

async function checkRateLimit(userId, endpoint) {
  const maxReq = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
  const denied = { allowed: false, remaining: 0, current: maxReq, limit: maxReq, reset_at: '' };
  if (!userId) return denied;

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!sbUrl || !sbKey) { console.warn('[rate-limit] Missing Supabase config — denying request'); return denied; }

  try {
    const _ac = new AbortController();
    const _to = setTimeout(() => _ac.abort(), 10000);
    const r = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ p_user_id: userId, p_endpoint: endpoint, p_max_requests: maxReq, p_window_minutes: 60 }),
      signal: _ac.signal,
    });
    clearTimeout(_to);
    if (!r.ok) { console.warn('[rate-limit] RPC error:', r.status); return { allowed: false, remaining: 0, current: maxReq, limit: maxReq, reset_at: '' }; }
    return (await r.json()) || denied;
  } catch (err) {
    console.warn('[rate-limit] Error:', err.message);
    return { allowed: false, remaining: 0, current: maxReq, limit: maxReq, reset_at: '' };
  }
}

function rateLimitHeaders(rl) {
  return {
    'X-RateLimit-Limit': String(rl.limit || 60),
    'X-RateLimit-Remaining': String(Math.max(0, rl.remaining || 0)),
    'X-RateLimit-Reset': rl.reset_at || '',
  };
}

function rateLimitResponse(rl, extraHeaders) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json', 'Retry-After': '60',
      ...rateLimitHeaders(rl), ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
      limit: rl.limit, remaining: 0, reset_at: rl.reset_at,
    }),
  };
}

module.exports = { checkRateLimit, rateLimitResponse, rateLimitHeaders, extractUserIdFromToken, RATE_LIMITS };
