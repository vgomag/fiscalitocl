/**
 * SHARED/CORS-ESM.JS — CORS seguro para funciones Netlify (ESM)
 * ──────────────────────────────────────────────────────────────
 * Versión ESM del helper CORS. Usa Netlify.env.get() para acceder
 * a variables de entorno en funciones ESM (export default).
 *
 * Configura ALLOWED_ORIGINS en Netlify env vars (comma-separated):
 *   ALLOWED_ORIGINS=https://fiscalito.netlify.app,https://fiscalito.cl
 *
 * En desarrollo (sin ALLOWED_ORIGINS), permite '*' como fallback.
 */

function getCorsOrigin(requestOrigin) {
  const allowedEnv = (typeof Netlify !== 'undefined' && Netlify.env)
    ? (Netlify.env.get('ALLOWED_ORIGINS') || '')
    : '';
  if (!allowedEnv) return '*'; // dev fallback
  const allowed = allowedEnv.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] || '*';
}

/**
 * Build CORS headers from a Request object (ESM functions).
 * @param {Request} req - The incoming Request
 * @returns {Object} Headers object with CORS + Content-Type
 */
export function corsHeaders(req) {
  const origin = req.headers.get('origin') || '';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export { getCorsOrigin };
