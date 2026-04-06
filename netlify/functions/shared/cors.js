/**
 * SHARED/CORS.JS — CORS seguro para funciones Netlify
 * ────────────────────────────────────────────────────
 * Restringe Access-Control-Allow-Origin a dominios permitidos.
 *
 * Configura ALLOWED_ORIGINS en Netlify env vars (comma-separated):
 *   ALLOWED_ORIGINS=https://fiscalito.netlify.app,https://fiscalito.cl
 *
 * En desarrollo (sin ALLOWED_ORIGINS), permite '*' como fallback.
 */

const ALLOWED_ORIGINS_ENV = process.env.ALLOWED_ORIGINS || '';

function getCorsOrigin(requestOrigin) {
  if (!ALLOWED_ORIGINS_ENV) return '*'; // dev fallback
  const allowed = ALLOWED_ORIGINS_ENV.split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] || '*'; // default to first allowed origin
}

function corsHeaders(event) {
  const origin = (event && event.headers) ? (event.headers.origin || event.headers.Origin || '') : '';
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

module.exports = { corsHeaders, getCorsOrigin };
