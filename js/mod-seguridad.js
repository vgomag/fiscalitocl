/* ================================================================
   MOD-SEGURIDAD.JS — Seguridad, Privacidad y Auditoría
   AES-256-GCM · PII masking · Session guard · Audit trail
   ================================================================
   v1.0 · 2026-03-25 · Fiscalito / UMAG
   ================================================================
   Basado en Seguridad_Modulo_Completo.js (1.591 líneas fuente)
   - Encriptación AES-256-GCM cliente (PBKDF2, 100k iter)
   - Sanitizador PII para Qdrant (RUT, email, teléfono, nombres)
   - Enmascaramiento de datos en UI
   - Manejo global de errores JWT/sesión
   - Registro de uso IA por función
   - Panel auditoría (solo admins)
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   1 · ENCRIPTACIÓN AES-256-GCM (Web Crypto API)
      Basado en src/lib/encryption.ts
   ──────────────────────────────────────────────────────────────── */

/**
 * Deriva una clave AES-256 desde el userId con PBKDF2 + SHA-256.
 * 100.000 iteraciones → resistente a fuerza bruta.
 */
async function sec_deriveKey(userId, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(userId + '_fiscalito_secure_v1'),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function sec_bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function sec_b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Encripta texto sensible.
 * Retorna formato "salt_b64:iv_b64:cipher_b64" o null si falla.
 */
async function encryptSensitiveData(plainText, userId) {
  if (!plainText?.trim()) return null;
  try {
    const enc  = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await sec_deriveKey(userId, salt.buffer);
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plainText)
    );
    return `${sec_bufToB64(salt.buffer)}:${sec_bufToB64(iv.buffer)}:${sec_bufToB64(cipher)}`;
  } catch (e) {
    console.error('[SEC] encrypt error:', e);
    return null;
  }
}

/**
 * Desencripta texto desde formato "salt:iv:cipher".
 * Retorna texto original o el valor sin cambios si no estaba encriptado.
 */
async function decryptSensitiveData(encryptedText, userId) {
  if (!encryptedText?.trim()) return null;
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // legacy / texto plano
    const [saltB64, ivB64, cipherB64] = parts;
    const salt   = sec_b64ToBuf(saltB64);
    const iv     = new Uint8Array(sec_b64ToBuf(ivB64));
    const cipher = sec_b64ToBuf(cipherB64);
    const key    = await sec_deriveKey(userId, salt);
    const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch (e) {
    console.error('[SEC] decrypt error:', e);
    return encryptedText; // fallback sin crash
  }
}

/** Detecta si un campo está encriptado */
function isEncrypted(text) {
  if (!text) return false;
  const p = text.split(':');
  return p.length === 3 && p.every(x => x.length > 0);
}

/** Encripta email + rut de un participante */
async function encryptParticipantData(data, userId) {
  const [email_encrypted, rut_encrypted] = await Promise.all([
    encryptSensitiveData(data.email, userId),
    encryptSensitiveData(data.rut,   userId),
  ]);
  return { email_encrypted, rut_encrypted };
}

/** Desencripta email + rut de un participante */
async function decryptParticipantData(data, userId) {
  let email = null, rut = null;
  if (isEncrypted(data.email_encrypted)) {
    email = await decryptSensitiveData(data.email_encrypted, userId);
  } else if (data.email) {
    email = data.email;
  }
  if (isEncrypted(data.rut_encrypted)) {
    rut = await decryptSensitiveData(data.rut_encrypted, userId);
  } else if (data.rut) {
    rut = data.rut;
  }
  return { email, rut };
}

/* ────────────────────────────────────────────────────────────────
   2 · ENMASCARAMIENTO PII (UI)
      Basado en src/lib/dataMasking.ts
   ──────────────────────────────────────────────────────────────── */

/** "12.345.678-9" → "12.XXX.XXX-9" */
function maskRut(rut) {
  if (!rut) return '';
  const parts = rut.split('-');
  const verifier = parts.length > 1 ? parts[1] : rut.slice(-1);
  const body = (parts.length > 1 ? parts[0] : rut.slice(0, -1)).replace(/\./g, '');
  if (body.length < 3) return rut;
  const masked = 'X'.repeat(body.length - 2);
  return `${body.slice(0, 2)}.${masked.substring(0,3)}.${masked.substring(3) || 'XXX'}-${verifier}`;
}

/** "+56912345678" → "******5678" */
function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return '*'.repeat(Math.max(digits.length - 4, 2)) + digits.slice(-4);
}

/** "usuario@ejemplo.cl" → "us***@ejemplo.cl" */
function maskEmail(email) {
  if (!email) return '';
  const at = email.indexOf('@');
  if (at < 1) return email;
  const local  = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return (local[0] || '') + '***' + domain;
  return local.slice(0, 2) + '***' + domain;
}

/** Aplica máscaras según contexto (admin viendo datos de otros) */
function maskParticipantDisplay(data, isOwner) {
  if (isOwner) return data;
  return {
    ...data,
    email: data.email ? maskEmail(data.email) : null,
    rut:   data.rut   ? maskRut(data.rut)     : null,
    phone: data.phone ? maskPhone(data.phone) : null,
  };
}

/* ────────────────────────────────────────────────────────────────
   3 · SANITIZADOR PII PARA QDRANT
      Basado en supabase/functions/_shared/pii-sanitizer.ts
   ──────────────────────────────────────────────────────────────── */

const SEC_RUT_PATTERN    = /\b\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[-–]\s?[\dkK]\b/gi;
const SEC_EMAIL_PATTERN  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
const SEC_PHONE_PATTERN  = /(?:\+?56\s?)?(?:9\s?\d{4}\s?\d{4}|\(\d{2}\)\s?\d{7,8}|\d{2}\s?\d{7,8})\b/g;
const SEC_NAME_PATTERN   = /(?:(?:don|doña|señor|señora|Sr\.|Sra\.|funcionario|funcionaria|investigador|investigadora|fiscal|denunciante|denunciado|denunciada|declarante|testigo|imputado|imputada|sumariado|sumariada|inculpado|inculpada)\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4})/g;

const SEC_LEGAL_TERMS = new Set([
  'UNIVERSIDAD','MAGALLANES','UMAG','CHILE','REPÚBLICA','DECRETO','LEY','ARTÍCULO',
  'RESOLUCIÓN','SUMARIO','ADMINISTRATIVO','ADMINISTRATIVA','INVESTIGACIÓN',
  'CONTRALORÍA','GENERAL','SECRETARÍA','MINISTERIO','TRIBUNAL','CORTE','SUPREMA',
  'APELACIONES','INFORME','VISTA','FISCAL','CARGO','CARGOS','DESCARGO','DESCARGOS',
  'DICTAMEN','OFICIO','ESTATUTO','REGLAMENTO','CÓDIGO','TRABAJO','PROCEDIMIENTO',
  'DISCIPLINARIO','SANCIONATORIO',
]);

/**
 * Sanitiza texto eliminando PII antes de enviar a Qdrant.
 * Reemplaza: RUT → [RUT-REDACTADO], email → [EMAIL-REDACTADO],
 * teléfono → [TELEFONO-REDACTADO], nombres con contexto → [PERSONA]
 */
function sanitizePii(text) {
  let r = text;
  r = r.replace(SEC_RUT_PATTERN, '[RUT-REDACTADO]');
  r = r.replace(SEC_EMAIL_PATTERN, '[EMAIL-REDACTADO]');
  r = r.replace(SEC_PHONE_PATTERN, m => m.replace(/\D/g, '').length >= 8 ? '[TELEFONO-REDACTADO]' : m);
  r = r.replace(SEC_NAME_PATTERN, (match, name) => {
    if (SEC_LEGAL_TERMS.has(name.toUpperCase())) return match;
    const prefix = match.substring(0, match.length - name.length);
    return `${prefix}[PERSONA]`;
  });
  return r;
}

/** Cuenta ocurrencias de PII en un texto */
function countPii(text) {
  return {
    ruts:   (text.match(SEC_RUT_PATTERN) || []).length,
    emails: (text.match(SEC_EMAIL_PATTERN) || []).length,
    phones: (text.match(SEC_PHONE_PATTERN) || []).filter(m => m.replace(/\D/g,'').length >= 8).length,
    names:  (text.match(SEC_NAME_PATTERN) || []).length,
  };
}

/* ────────────────────────────────────────────────────────────────
   4 · MANEJO GLOBAL DE ERRORES JWT/SESIÓN
      Basado en src/lib/queryClient.ts
   ──────────────────────────────────────────────────────────────── */

function isSessionError(err) {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('jwt expired') ||
    msg.includes('invalid token') ||
    msg.includes('refresh_token') ||
    msg.includes('pgrst303') ||
    msg.includes('unauthorized') ||
    err?.code === 'PGRST303'
  );
}

/** Interceptor global de errores de sesión */
window.addEventListener('unhandledrejection', async (event) => {
  if (!isSessionError(event.reason)) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  console.warn('[SEC] Session error intercepted — attempting refresh…');
  const { data, error } = await sb.auth.refreshSession();
  if (error || !data.session) {
    showToast('⚠ Sesión expirada. Inicia sesión nuevamente.');
    setTimeout(() => {
      document.getElementById('appScreen').style.display = 'none';
      document.getElementById('authScreen').style.display = 'flex';
    }, 1500);
  } else {
    console.info('[SEC] Session refreshed successfully');
  }
});

/* ────────────────────────────────────────────────────────────────
   5 · SEGUIMIENTO DE USO IA
      check_ai_usage_limit del módulo Usuarios/Roles
   ──────────────────────────────────────────────────────────────── */

// Registro en memoria de uso IA (complementa BD)
const _aiUsageCache = { calls: 0, tokens: 0, lastReset: null };
// Límites por plan
const AI_USAGE_LIMITS = { consultor: 50, fiscal: 500, admin: Infinity };

/**
 * Registra una llamada IA en Supabase y verifica el límite mensual.
 * @param {string} fn — código de función (F0-F11)
 * @param {string} detail — detalle adicional (sectionId, query, etc.)
 * @returns {boolean} — true si el uso está permitido
 */
async function trackAIUsage(fn, detail = '') {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return true;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return true;

    // Registrar en tabla ai_usage_logs
    await sb.from('ai_usage_logs').insert({
      user_id:   user.id,
      fn_code:   fn,
      detail:    detail?.substring(0, 200) || null,
      logged_at: new Date().toISOString(),
    }).then(() => {}); // fire-and-forget

    // Verificar límite mensual via función BD si existe
    const { data: limitOk } = await sb.rpc('check_ai_usage_limit', { p_user_id: user.id })
      .single()
      .then(r => r)
      .catch(() => ({ data: true })); // si la función no existe, permitir

    if (limitOk === false) {
      // Bloquear módulos de IA
      if (typeof juri !== 'undefined') juri.aiBlocked = true;
      showToast('⚠ Límite mensual de uso IA alcanzado. Contacta al administrador.');
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[SEC] trackAIUsage error:', e);
    return true; // fail open — no bloquear por errores de logging
  }
}

/**
 * Verifica el límite antes de enviar un mensaje al chat principal.
 * Se llama desde sendMessage() en index.html via hook.
 */
async function checkAILimitBeforeSend() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return true;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return true;
    const { data: ok } = await sb.rpc('check_ai_usage_limit', { p_user_id: user.id })
      .single()
      .catch(() => ({ data: true }));
    if (ok === false) {
      showToast('⚠ Límite mensual de uso IA alcanzado. Contacta al administrador.');
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/* ────────────────────────────────────────────────────────────────
   6 · PANEL AUDITORÍA (solo admins)
   ──────────────────────────────────────────────────────────────── */

async function openAuditPanel() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  // Verificar rol admin
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data: roleData } = await sb.from('user_roles').select('role').eq('user_id', user.id).single();
  if (roleData?.role !== 'admin') { showToast('⚠ Solo accesible para administradores'); return; }

  document.getElementById('miniModalTitle').textContent = '🔍 Auditoría de Accesos';
  document.getElementById('miniModalBody').innerHTML = `
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">
      Últimas actividades registradas en el sistema.
    </div>
    <div id="auditLogList"><div class="loading">Cargando logs…</div></div>`;

  window._miniModalSave = null;
  document.getElementById('miniModalSaveBtn').style.display = 'none';
  openMiniModal();

  try {
    const { data: logs } = await sb.from('audit_access_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    const el = document.getElementById('auditLogList');
    if (!el) return;
    if (!logs?.length) { el.innerHTML = '<div class="empty-state">Sin logs registrados.</div>'; return; }

    const actionColors = { view:'var(--blue)', create:'var(--green)', update:'#f59e0b', delete:'var(--red)' };
    el.innerHTML = `<div style="overflow-x:auto;max-height:320px">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:10px;white-space:nowrap">Fecha</th>
          <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);color:var(--text-muted)">Acción</th>
          <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);color:var(--text-muted)">Tabla</th>
          <th style="padding:5px 8px;text-align:left;border-bottom:1px solid var(--border);color:var(--text-muted)">Detalles</th>
        </tr></thead>
        <tbody>${logs.map(l => `<tr>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border);font-family:'DM Mono',monospace;white-space:nowrap;color:var(--text-muted)">${new Date(l.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border)"><span style="font-size:9.5px;padding:1px 7px;border-radius:8px;background:${(actionColors[l.action]||'var(--text-muted)')}22;color:${actionColors[l.action]||'var(--text-muted)'};">${l.action||'—'}</span></td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--text-dim)">${l.table_name||'—'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid var(--border);color:var(--text-muted);font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${JSON.stringify(l.metadata||{}).substring(0,80)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  } catch (err) {
    const el = document.getElementById('auditLogList');
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:11px">Error: ${err.message}</div>`;
  }
}

/* ────────────────────────────────────────────────────────────────
   7 · PANEL DE USO IA (para admins en panel usuarios)
   ──────────────────────────────────────────────────────────────── */

async function renderAIUsagePanel(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  el.innerHTML = '<div class="loading">Cargando uso IA…</div>';

  try {
    const { data } = await sb.from('ai_usage_logs')
      .select('user_id, fn_code, logged_at')
      .gte('logged_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
      .order('logged_at', { ascending: false });

    if (!data?.length) { el.innerHTML = '<div class="empty-state">Sin registros de uso IA este mes.</div>'; return; }

    // Agrupar por usuario
    const byUser = {};
    data.forEach(r => {
      if (!byUser[r.user_id]) byUser[r.user_id] = { total: 0, byFn: {} };
      byUser[r.user_id].total++;
      byUser[r.user_id].byFn[r.fn_code] = (byUser[r.user_id].byFn[r.fn_code] || 0) + 1;
    });

    // Top funciones
    const topFns = {};
    data.forEach(r => { topFns[r.fn_code] = (topFns[r.fn_code] || 0) + 1; });
    const fnSorted = Object.entries(topFns).sort((a,b)=>b[1]-a[1]).slice(0,5);

    el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="dash-card">
        <div class="dash-card-val gold">${data.length}</div>
        <div class="dash-card-label">Llamadas IA · 30 días</div>
      </div>
      <div class="dash-card">
        <div class="dash-card-val blue">${Object.keys(byUser).length}</div>
        <div class="dash-card-label">Usuarios activos</div>
      </div>
    </div>
    <div style="margin-top:10px">
      <div style="font-size:10px;color:var(--text-muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px">Funciones más usadas</div>
      ${fnSorted.map(([fn, count]) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <span style="background:var(--gold);color:#fff;font-size:9.5px;font-weight:700;padding:1px 6px;border-radius:3px;font-family:'DM Mono',monospace;flex-shrink:0">${fn}</span>
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(count/data.length*100)}%;background:var(--gold);"></div>
          </div>
          <span style="font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace">${count}</span>
        </div>`).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = `<div style="font-size:11px;color:var(--red)">Error: ${err.message}</div>`;
  }
}

/* ────────────────────────────────────────────────────────────────
   8 · BADGE DE SEGURIDAD (footer)
   ──────────────────────────────────────────────────────────────── */

function injectSecurityBadge() {
  if (document.getElementById('secBadge')) return;
  const badge = document.createElement('div');
  badge.id = 'secBadge';
  badge.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:100;';
  badge.innerHTML = `
    <div style="display:flex;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:4px 10px;font-size:10px;color:var(--text-muted);cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.08)"
      title="TLS 1.3 · AES-256 · JWT · RLS · Backups diarios">
      🔒 <span>Seguro</span>
    </div>`;
  document.body.appendChild(badge);
}

/* ────────────────────────────────────────────────────────────────
   9 · INICIALIZACIÓN
   ──────────────────────────────────────────────────────────────── */

(function initSecurity() {
  // Inyectar badge de seguridad cuando la app esté lista
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSecurityBadge);
  } else {
    injectSecurityBadge();
  }

  // Interceptar sendMessage para verificar límite IA
  // (monkey-patch suave — no rompe si sendMessage no está definida aún)
  window.addEventListener('load', () => {
    const origSendMessage = window.sendMessage;
    if (typeof origSendMessage === 'function') {
      window.sendMessage = async function() {
        const allowed = await checkAILimitBeforeSend();
        if (!allowed) return;
        return origSendMessage.apply(this, arguments);
      };
    }
  });

  console.info('[SEC] Módulo de seguridad inicializado · AES-256-GCM · PII sanitizer · Session guard');
})();
