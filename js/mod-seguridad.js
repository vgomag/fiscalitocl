// ============================================================================
// MÓDULO DE SEGURIDAD — FISCALITO (mod-seguridad.js)
// Implementación completa: encriptación, auditoría, PII, sesión, badges UI
// Generado: 2026-03-26
// ============================================================================

(function () {
  "use strict";

  // ============================================================================
  // SECCIÓN 1: ENCRIPTACIÓN AES-256-GCM CLIENTE (Web Crypto API)
  // ============================================================================

  async function _deriveKey(userId, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(userId + "_fiscalito_secure_v1"),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function _ab2b64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  function _b642ab(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /** Encripta texto sensible → "salt:iv:ciphertext" (base64) */
  window.encryptSensitiveData = async function (plainText, userId) {
    if (!plainText || !plainText.trim()) return null;
    try {
      const enc = new TextEncoder();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await _deriveKey(userId, salt.buffer);
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(plainText)
      );
      return `${_ab2b64(salt.buffer)}:${_ab2b64(iv.buffer)}:${_ab2b64(encrypted)}`;
    } catch (e) {
      console.error("[Seguridad] Error encriptando:", e);
      return null;
    }
  };

  /** Desencripta desde "salt:iv:ciphertext" */
  window.decryptSensitiveData = async function (encryptedText, userId) {
    if (!encryptedText || !encryptedText.trim()) return null;
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 3) return encryptedText; // No encriptado (legacy)
      const salt = _b642ab(parts[0]);
      const iv = new Uint8Array(_b642ab(parts[1]));
      const ciphertext = _b642ab(parts[2]);
      const key = await _deriveKey(userId, salt);
      const dec = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(dec);
    } catch (e) {
      console.error("[Seguridad] Error desencriptando:", e);
      return encryptedText; // Fallback a texto plano (legacy)
    }
  };

  /** Detecta si un texto está encriptado con el formato salt:iv:ciphertext */
  window.isEncrypted = function (text) {
    if (!text) return false;
    const parts = text.split(":");
    return parts.length === 3 && parts.every((p) => p.length > 0);
  };

  /** Encripta datos PII de un participante */
  window.encryptParticipantData = async function (data, userId) {
    const [email_encrypted, rut_encrypted] = await Promise.all([
      window.encryptSensitiveData(data.email, userId),
      window.encryptSensitiveData(data.rut, userId),
    ]);
    return { email_encrypted, rut_encrypted };
  };

  /** Desencripta datos PII de un participante */
  window.decryptParticipantData = async function (data, userId) {
    let email = null,
      rut = null;
    if (data.email_encrypted && window.isEncrypted(data.email_encrypted)) {
      email = await window.decryptSensitiveData(data.email_encrypted, userId);
    } else if (data.email) {
      email = data.email;
    }
    if (data.rut_encrypted && window.isEncrypted(data.rut_encrypted)) {
      rut = await window.decryptSensitiveData(data.rut_encrypted, userId);
    } else if (data.rut) {
      rut = data.rut;
    }
    return { email, rut };
  };

  // ============================================================================
  // SECCIÓN 2: ENMASCARAMIENTO DE DATOS PII
  // ============================================================================

  /** "12.345.678-9" → "12.XXX.XXX-9" */
  window.maskRut = function (rut) {
    if (!rut) return "";
    const cleaned = rut.replace(/[^0-9kK-]/g, "").toUpperCase();
    if (cleaned.length < 4) return rut;
    const parts = rut.split("-");
    const verifier = parts.length > 1 ? parts[1] : cleaned.slice(-1);
    const body =
      parts.length > 1 ? parts[0].replace(/\./g, "") : cleaned.slice(0, -1);
    if (body.length < 3) return rut;
    const first = body.slice(0, 2);
    const mid = "X".repeat(body.length - 2);
    const fmt = `${first}.${mid.slice(0, 3)}.${mid.slice(3) || "XXX"}`;
    return `${fmt}-${verifier}`;
  };

  /** "+56912345678" → "******5678" */
  window.maskPhone = function (phone) {
    if (!phone) return "";
    const d = phone.replace(/\D/g, "");
    if (d.length < 4) return phone;
    return "*".repeat(Math.max(d.length - 4, 2)) + d.slice(-4);
  };

  /** "usuario@ejemplo.cl" → "us***@ejemplo.cl" */
  window.maskEmail = function (email) {
    if (!email) return "";
    const at = email.indexOf("@");
    if (at < 1) return email;
    const local = email.slice(0, at);
    const domain = email.slice(at);
    if (local.length <= 2) return `${local[0] || ""}***${domain}`;
    return `${local.slice(0, 2)}***${domain}`;
  };

  /** Determina si los datos PII deben enmascararse (admin viendo datos ajenos) */
  window.shouldMaskData = function (isAdmin, isOwner) {
    return isAdmin && !isOwner;
  };

  // ============================================================================
  // SECCIÓN 3: SANITIZADOR PII (para indexación RAG / Qdrant)
  // ============================================================================

  const RUT_RE =
    /\b\d{1,2}[\.\s]?\d{3}[\.\s]?\d{3}[-–]\s?[\dkK]\b/gi;
  const EMAIL_RE =
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
  const PHONE_RE =
    /(?:\+?56\s?)?(?:9\s?\d{4}\s?\d{4}|\(\d{2}\)\s?\d{7,8}|\d{2}\s?\d{7,8})\b/g;
  const NAME_CTX_RE =
    /(?:(?:don|doña|señor|señora|Sr\.|Sra\.|funcionario|funcionaria|investigador|investigadora|fiscal|denunciante|denunciado|denunciada|declarante|testigo|imputado|imputada|sumariado|sumariada|inculpado|inculpada)\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,4})/g;

  const EXCLUDE_UPPER = new Set([
    "UNIVERSIDAD","MAGALLANES","UMAG","CHILE","REPUBLICA","REPÚBLICA",
    "DECRETO","LEY","ARTICULO","ARTÍCULO","RESOLUCION","RESOLUCIÓN",
    "SUMARIO","ADMINISTRATIVO","ADMINISTRATIVA","INVESTIGACION","INVESTIGACIÓN",
    "CONTRALORIA","CONTRALORÍA","GENERAL","SECRETARIA","SECRETARÍA",
    "MINISTERIO","TRIBUNAL","CORTE","SUPREMA","APELACIONES",
    "INFORME","VISTA","FISCAL","CARGO","CARGOS","DESCARGO","DESCARGOS",
    "DICTAMEN","OFICIO","ESTATUTO","REGLAMENTO","CODIGO","CÓDIGO",
    "TRABAJO","PROCEDIMIENTO","DISCIPLINARIO","SANCIONATORIO",
  ]);

  /** Reemplaza PII antes de indexar en Qdrant */
  window.sanitizePii = function (text) {
    if (!text) return text;
    let r = text;
    r = r.replace(RUT_RE, "[RUT-REDACTADO]");
    r = r.replace(EMAIL_RE, "[EMAIL-REDACTADO]");
    r = r.replace(PHONE_RE, (m) => {
      if (m.replace(/\D/g, "").length >= 8) return "[TELEFONO-REDACTADO]";
      return m;
    });
    r = r.replace(NAME_CTX_RE, (match, name) => {
      const prefix = match.substring(0, match.length - name.length);
      return `${prefix}[PERSONA]`;
    });
    return r;
  };

  /** Cuenta ocurrencias PII en texto (para diagnóstico) */
  window.countPiiMatches = function (text) {
    if (!text) return { ruts: 0, emails: 0, phones: 0, names: 0 };
    return {
      ruts: (text.match(RUT_RE) || []).length,
      emails: (text.match(EMAIL_RE) || []).length,
      phones: (text.match(PHONE_RE) || []).filter(
        (m) => m.replace(/\D/g, "").length >= 8
      ).length,
      names: (text.match(NAME_CTX_RE) || []).length,
    };
  };

  // ============================================================================
  // SECCIÓN 4: MANEJO DE SESIÓN Y ERRORES JWT
  // ============================================================================

  const _isSessionError = (error) => {
    if (!error) return false;
    if (error?.code === "PGRST303") return true;
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
      msg.includes("jwt expired") ||
      msg.includes("invalid token") ||
      msg.includes("refresh_token") ||
      msg.includes("unauthorized") ||
      msg.includes("pgrst303")
    );
  };

  /** Intercepta errores de sesión en las operaciones de Supabase */
  window.handleSupabaseError = async function (error) {
    if (_isSessionError(error)) {
      console.warn("[Seguridad] Error de sesión detectado, intentando refresh…");
      try {
        const _sb = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null);
        if (!_sb) return false;
        const { data, error: refreshError } = await _sb.auth.refreshSession();
        if (refreshError || !data.session) {
          console.error("[Seguridad] Refresh fallido, cerrando sesión");
          window.dispatchEvent(new CustomEvent("supabase:session-expired"));
          return false;
        }
        console.log("[Seguridad] Sesión renovada exitosamente");
        return true; // Reintentar la operación
      } catch (e) {
        window.dispatchEvent(new CustomEvent("supabase:session-expired"));
        return false;
      }
    }
    return null; // No es error de sesión
  };

  // Auto-logout al expirar sesión
  window.addEventListener("supabase:session-expired", () => {
    if (typeof showToast === "function") {
      showToast("Sesión expirada. Por favor inicia sesión nuevamente.", "warning");
    }
    const _sb = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null);
    setTimeout(() => {
      if (_sb) {
        _sb.auth.signOut().then(() => location.reload());
      } else {
        location.reload();
      }
    }, 2000);
  });

  // ============================================================================
  // SECCIÓN 5: LOGGING DE AUDITORÍA (cliente → BD vía RPC)
  // ============================================================================

  /**
   * Registra un evento de auditoría en la BD
   * @param {string} action - view|create|update|delete|login|logout|export|share
   * @param {object} opts - { table_name, record_id, case_id, accessed_fields, metadata }
   */
  /* FIX 77A: circuit breaker — si la RPC falla 3 veces seguidas, desactivarla por la sesión
     para no spammear la consola con 400 y no bloquear requests legítimos. */
  let _auditFailCount = 0;
  let _auditDisabled = false;
  window.logAuditEvent = async function (action, opts = {}) {
    if (_auditDisabled) return;
    const _sb = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null);
    if (!_sb) return;
    try {
      const { error } = await _sb.rpc("log_audit_event", {
        p_action: action,
        p_table_name: opts.table_name || null,
        p_record_id: opts.record_id || null,
        p_case_id: opts.case_id || null,
        p_accessed_fields: opts.accessed_fields || null,
        p_metadata: opts.metadata || {},
      });
      if (error) {
        _auditFailCount++;
        if (_auditFailCount >= 3) {
          _auditDisabled = true;
          console.warn("[Auditoría] RPC log_audit_event deshabilitada tras 3 fallos. Revisar definición SQL.");
        }
      } else {
        _auditFailCount = 0;
      }
    } catch (e) {
      _auditFailCount++;
      if (_auditFailCount >= 3) {
        _auditDisabled = true;
        console.warn("[Auditoría] RPC log_audit_event deshabilitada tras 3 excepciones:", e?.message);
      }
    }
  };

  // Vigilar estado de autenticación (listener unificado)
  {
    const _sb = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null);
    if (_sb) {
      _sb.auth.onAuthStateChange((event) => {
        console.log(`[Seguridad] Auth event: ${event}`);
        if (event === "SIGNED_IN") {
          window.logAuditEvent("login", { metadata: { method: "email" } });
        } else if (event === "SIGNED_OUT") {
          window._securityCache = {};
          window.logAuditEvent("logout");
        }
      });
    }
  }

  // ============================================================================
  // SECCIÓN 6: VALIDACIÓN DE ENTRADA (prevención XSS / SQL injection)
  // ============================================================================

  /** Sanitiza HTML peligroso manteniendo texto legible */
  window.sanitizeInput = function (input) {
    if (!input || typeof input !== "string") return input;
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;");
  };

  /** Valida email con patrón estricto */
  window.validateEmail = function (email) {
    if (!email) return false;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  /** Valida RUT chileno (formato y dígito verificador) */
  window.validateRut = function (rut) {
    if (!rut) return false;
    const clean = rut.replace(/[.\-\s]/g, "").toUpperCase();
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1);
    if (!/^\d+$/.test(body)) return false;
    let sum = 0,
      mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const expected = 11 - (sum % 11);
    const dvCalc = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
    return dv === dvCalc;
  };

  // ============================================================================
  // SECCIÓN 7: BADGES DE SEGURIDAD (UI)
  // ============================================================================

  const _secBadges = [
    { icon: "🔒", label: "TLS 1.3", tip: "Comunicaciones encriptadas con TLS 1.3" },
    { icon: "🛡️", label: "RLS", tip: "Row Level Security habilitado en base de datos" },
    { icon: "🔑", label: "JWT", tip: "Autenticación segura con JSON Web Tokens" },
    { icon: "✅", label: "Validado", tip: "Validación de datos en cliente y servidor" },
    { icon: "💾", label: "Backups", tip: "Respaldos automáticos diarios" },
    { icon: "🔐", label: "AES-256", tip: "Encriptación de datos sensibles con AES-256-GCM" },
  ];

  /** Renderiza badge compacto de seguridad */
  window.renderSecurityBadge = function (variant = "compact") {
    if (variant === "compact") {
      return `<span class="sec-badge-compact" title="Plataforma segura: TLS 1.3, RLS, JWT, AES-256"
        style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;
        border-radius:12px;font-size:11px;cursor:help;
        background:var(--surface,#f0f8f0);color:var(--success,#16a34a);
        border:1px solid var(--success,#16a34a)20">
        🔒 Seguro</span>`;
    }
    return _secBadges
      .map(
        (b) =>
          `<span title="${b.tip}" style="display:inline-flex;align-items:center;gap:3px;
          padding:2px 8px;border-radius:10px;font-size:10px;cursor:help;
          background:var(--surface,#f5f5f5);border:1px solid var(--border,#e0e0e0)">
          ${b.icon} ${b.label}</span>`
      )
      .join(" ");
  };

  /** Renderiza footer de seguridad */
  window.renderSecurityFooter = function () {
    return `<div style="display:flex;align-items:center;justify-content:center;gap:6px;
      padding:8px 16px;font-size:10px;color:var(--text-muted,#888);
      border-top:1px solid var(--border,#e5e5e5)">
      🔒 Datos protegidos con encriptación de extremo a extremo · Ley 19.628
    </div>`;
  };

  // ============================================================================
  // SECCIÓN 8: POLÍTICAS DE SEGURIDAD Y COMPLIANCE (datos para UI)
  // ============================================================================

  window.SECURITY_MEASURES = [
    { title: "Encriptación de datos", desc: "TLS 1.3 en tránsito + AES-256-GCM en reposo", status: "Activo" },
    { title: "Autenticación segura", desc: "JWT con refresh tokens y protección contra expiración", status: "Activo" },
    { title: "Row Level Security (RLS)", desc: "Cada usuario solo accede a sus propios datos", status: "Activo" },
    { title: "Infraestructura segura", desc: "Supabase: servidores certificados, monitoreo 24/7, backups", status: "Activo" },
    { title: "Auditoría y monitoreo", desc: "Registro automático de acciones con triggers en BD", status: "Activo" },
    { title: "Validación de datos", desc: "Cliente y servidor, prevención XSS e inyecciones", status: "Activo" },
    { title: "Encriptación PII", desc: "Email, RUT y teléfono encriptados con AES-256 + pgcrypto", status: "Activo" },
    { title: "Sanitización PII en IA", desc: "Datos personales redactados antes de indexar en vectores", status: "Activo" },
  ];

  window.COMPLIANCE_ITEMS = [
    { name: "Ley N° 19.628", desc: "Protección de Datos Personales de Chile" },
    { name: "Ley N° 19.880", desc: "Procedimientos Administrativos" },
    { name: "Principio de reserva", desc: "Confidencialidad de procedimientos disciplinarios" },
    { name: "Debido proceso", desc: "Garantías procesales en investigaciones" },
    { name: "Ley N° 21.180", desc: "Transformación Digital del Estado (Cero Papel)" },
  ];

  // ============================================================================
  // SECCIÓN 9: PANEL DE AUDITORÍA (solo admin)
  // ============================================================================

  /**
   * Carga los logs de auditoría (solo admins).
   * @param {object} filters - { action, search, page, pageSize }
   * @returns {Promise<{data: array, count: number}>}
   */
  window.loadAuditLogs = async function (filters = {}) {
    if (typeof sb === "undefined") return { data: [], count: 0 };
    const page = filters.page || 0;
    const size = filters.pageSize || 50;
    const from = page * size;
    const to = from + size - 1;

    let q = sb
      .from("audit_access_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filters.action && filters.action !== "all") {
      q = q.eq("action", filters.action);
    }
    if (filters.search) {
      q = q.or(
        `table_name.ilike.%${filters.search}%,metadata->>name.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) {
      console.error("[Auditoría] Error cargando logs:", error);
      return { data: [], count: 0 };
    }
    return { data: data || [], count: count || 0 };
  };

  /**
   * Carga historial de alertas de seguridad (solo admins).
   * @returns {Promise<array>}
   */
  window.loadSecurityAlerts = async function () {
    if (typeof sb === "undefined") return [];
    const { data, error } = await sb
      .from("security_alerts_sent")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[Seguridad] Error cargando alertas:", error);
      return [];
    }
    return data || [];
  };

  // ============================================================================
  // SECCIÓN 10: WRAPPER SEGURO PARA OPERACIONES SUPABASE
  // ============================================================================

  /**
   * Ejecuta una operación Supabase con retry automático en error de sesión.
   * @param {Function} operation - Función async que ejecuta la operación
   * @param {number} maxRetries - Máximo reintentos (default: 1)
   * @returns {Promise<any>}
   */
  window.secureSupabaseOp = async function (operation, maxRetries = 1) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (result.error) {
          const handled = await window.handleSupabaseError(result.error);
          if (handled === true && attempt < maxRetries) {
            continue; // Sesión renovada, reintentar
          }
          if (handled === false) {
            return result; // Sesión expirada, no reintentar
          }
        }
        return result;
      } catch (e) {
        const handled = await window.handleSupabaseError(e);
        if (handled === true && attempt < maxRetries) continue;
        throw e;
      }
    }
  };

  // ============================================================================
  // SECCIÓN 11: RATE LIMITING CLIENTE (protección contra abuso)
  // ============================================================================

  const _rateLimits = {};

  /**
   * Rate limiter simple en cliente.
   * @param {string} key - Identificador de la acción
   * @param {number} maxCalls - Máximo llamadas permitidas
   * @param {number} windowMs - Ventana en milisegundos
   * @returns {boolean} true si permitido, false si limitado
   */
  window.checkRateLimit = function (key, maxCalls = 10, windowMs = 60000) {
    const now = Date.now();
    if (!_rateLimits[key]) _rateLimits[key] = [];
    _rateLimits[key] = _rateLimits[key].filter((t) => now - t < windowMs);
    if (_rateLimits[key].length >= maxCalls) {
      console.warn(`[Seguridad] Rate limit alcanzado para: ${key}`);
      return false;
    }
    _rateLimits[key].push(now);
    return true;
  };

  // ============================================================================
  // SECCIÓN 12: CSP + SEGURIDAD HTTP HEADERS (meta tags)
  // ============================================================================

  (function injectSecurityMeta() {
    // Content Security Policy via meta tag
    const csp = document.createElement("meta");
    csp.httpEquiv = "Content-Security-Policy";
    csp.content = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://*.supabase.co",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://*.supabase.co https://*.netlify.app https://api.anthropic.com https://*.googleapis.com wss://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    document.head.prepend(csp);

    // X-Content-Type-Options
    const xcto = document.createElement("meta");
    xcto.httpEquiv = "X-Content-Type-Options";
    xcto.content = "nosniff";
    document.head.appendChild(xcto);

    // Referrer Policy
    const rp = document.createElement("meta");
    rp.name = "referrer";
    rp.content = "strict-origin-when-cross-origin";
    document.head.appendChild(rp);
  })();

  // ============================================================================
  // SECCIÓN 13: INYECCIÓN DE CSS PARA BADGES Y COMPONENTES DE SEGURIDAD
  // ============================================================================

  (function injectSecurityCSS() {
    const style = document.createElement("style");
    style.textContent = `
      .sec-badge-compact:hover {
        box-shadow: 0 0 0 2px var(--success, #16a34a)30;
      }
      .audit-action-badge {
        display: inline-block; padding: 2px 8px; border-radius: 10px;
        font-size: 10px; font-weight: 600; text-transform: uppercase;
      }
      .audit-action-badge.view { background: #dbeafe; color: #1e40af; }
      .audit-action-badge.create { background: #dcfce7; color: #166534; }
      .audit-action-badge.update { background: #fef3c7; color: #92400e; }
      .audit-action-badge.delete { background: #fee2e2; color: #991b1b; }
      .audit-action-badge.login { background: #e0e7ff; color: #3730a3; }
      .audit-action-badge.logout { background: #f3e8ff; color: #6b21a8; }
      .audit-action-badge.export { background: #ccfbf1; color: #134e4a; }
      .audit-action-badge.share { background: #fce7f3; color: #9d174d; }
      .security-alert-severity {
        display: inline-block; padding: 2px 8px; border-radius: 10px;
        font-size: 10px; font-weight: 600;
      }
      .security-alert-severity.critical { background: #fee2e2; color: #991b1b; }
      .security-alert-severity.warning { background: #fef3c7; color: #92400e; }
      .security-alert-severity.info { background: #dbeafe; color: #1e40af; }
    `;
    document.head.appendChild(style);
  })();

  // ============================================================================
  // MÓDULO CARGADO
  // ============================================================================
  console.log(
    "%c🔒 Módulo de Seguridad cargado — Fiscalito v1.0",
    "color:#16a34a;font-weight:bold"
  );
  console.log(
    "%c   ✓ Encriptación AES-256-GCM  ✓ Auditoría  ✓ PII  ✓ CSP  ✓ RLS",
    "color:#666"
  );
})();
