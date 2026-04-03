/**
 * SHARED/ANTHROPIC.JS — Módulo compartido para llamadas a Anthropic API
 * ─────────────────────────────────────────────────────────────────────
 * Centraliza callAnthropic, callAnthropicVision y base64url.
 * Uso: const { callAnthropic, callAnthropicVision, base64url } = require('./shared/anthropic');
 */
const https = require('https');

/* ── Claude Model Constants ── */
const MODEL_SONNET = process.env.CLAUDE_MODEL_SONNET || 'claude-sonnet-4-20250514';
const MODEL_HAIKU = process.env.CLAUDE_MODEL_HAIKU || 'claude-haiku-4-5-20251001';

/**
 * Codifica un buffer o string en base64url (RFC 4648 §5).
 * Acepta Buffer o string. Elimina padding '=' correctamente.
 */
function base64url(input) {
  const b64 = Buffer.isBuffer(input)
    ? input.toString('base64')
    : Buffer.from(String(input)).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Llamada genérica a Anthropic Messages API (texto).
 * @param {string} apiKey
 * @param {string} system - System prompt
 * @param {string} userMsg - User message
 * @param {object} [opts] - { model, maxTokens, timeout }
 */
function callAnthropic(apiKey, system, userMsg, opts) {
  // Retrocompatibilidad: si opts es un número, es maxTokens
  if (typeof opts === 'number') opts = { maxTokens: opts };
  const { model, maxTokens, timeout } = Object.assign(
    { model: MODEL_HAIKU, maxTokens: 2000, timeout: 25000 },
    opts || {}
  );

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }]
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('Parse error: ' + d.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ${timeout}ms`)); });
    req.write(body);
    req.end();
  });
}

/**
 * Llamada a Anthropic con imagen (Vision / OCR).
 * @param {string} apiKey
 * @param {string} base64Data - imagen en base64
 * @param {string} mimeType - e.g. 'image/png', 'application/pdf'
 * @param {string} fileName
 * @param {object} [opts] - { model, maxTokens, timeout }
 */
function callAnthropicVision(apiKey, base64Data, mimeType, fileName, opts) {
  const { model, maxTokens, timeout } = Object.assign(
    { model: MODEL_HAIKU, maxTokens: 4000, timeout: 30000 },
    opts || {}
  );

  const mediaType = mimeType === 'application/pdf' ? 'application/pdf'
    : mimeType.startsWith('image/') ? mimeType : 'image/png';

  const sourceType = mimeType === 'application/pdf' ? 'base64' : 'base64';
  const contentType = mimeType === 'application/pdf' ? 'document' : 'image';

  const contentBlock = contentType === 'document'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          contentBlock,
          { type: 'text', text: `Extrae TODO el texto de este documento (${fileName}). Si es un formulario, preserva la estructura. Devuelve solo el texto, sin comentarios.` }
        ]
      }]
    });
    const req = https.request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ${timeout}ms`)); });
    req.write(body);
    req.end();
  });
}

module.exports = { callAnthropic, callAnthropicVision, base64url, MODEL_SONNET, MODEL_HAIKU };
