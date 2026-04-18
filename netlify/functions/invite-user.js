import { corsHeaders } from './shared/cors-esm.js';

/**
 * INVITE-USER — Invita un usuario por email
 * ──────────────────────────────────────────────────────────────────────
 * Flujo:
 *  1. Verifica que el llamante sea admin.
 *  2. Usa Supabase Admin API (generate_link) para obtener el action_link
 *     SIN que Supabase envíe el correo (evita su SMTP poco confiable).
 *  3. Envía el correo custom vía Resend (RESEND_API_KEY).
 *  4. Asigna el rol al usuario en user_roles.
 *
 * ENV VARS REQUERIDAS EN NETLIFY:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *  - RESEND_API_KEY
 *  - RESEND_FROM        (ej: "Fiscalito <noreply@tudominio.cl>") — requiere
 *                        dominio verificado en Resend. Si no lo tienes,
 *                        usa "onboarding@resend.dev" (solo envía a tu propio
 *                        email de la cuenta Resend — útil para pruebas).
 *  - URL                (auto-provisto por Netlify; sitio de producción)
 */

function getEnv(name, fallback) {
  const v =
    (typeof Netlify !== 'undefined' && Netlify.env?.get(name)) ||
    process.env[name];
  return v || fallback;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml({ actionLink, role, siteUrl, isRecovery }) {
  const title = isRecovery
    ? 'Restablece tu acceso a Fiscalito'
    : 'Te invitaron a Fiscalito';
  const intro = isRecovery
    ? 'Se solicitó restablecer tu contraseña. Haz clic en el botón para definir una nueva.'
    : `Fuiste invitado a usar <strong>Fiscalito</strong> con el rol <strong>${escapeHtml(role)}</strong>. Haz clic en el botón para definir tu contraseña y acceder.`;
  const btn = isRecovery ? 'Restablecer contraseña' : 'Aceptar invitación';

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <tr><td style="padding:32px 32px 8px 32px">
          <h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a">${escapeHtml(title)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#444">${intro}</p>
          <p style="margin:0 0 24px"><a href="${actionLink}" style="display:inline-block;background:#c9a227;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">${btn}</a></p>
          <p style="margin:0 0 8px;font-size:13px;color:#666">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#0a66c2">${escapeHtml(actionLink)}</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="margin:0;font-size:12px;color:#888">Si no esperabas este correo, ignóralo.<br>— Fiscalito · ${escapeHtml(siteUrl)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendWithResend({ apiKey, from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.message || data?.error || `Resend ${res.status}`;
    throw new Error(err);
  }
  return data;
}

const handler = async (req) => {
  const CORS = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: CORS,
    });
  }

  try {
    const SUPABASE_URL = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
    const SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const SITE_URL = getEnv('URL', 'https://fiscalitocl.netlify.app');
    const RESEND_API_KEY = getEnv('RESEND_API_KEY');
    const RESEND_FROM = getEnv('RESEND_FROM', 'Fiscalito <onboarding@resend.dev>');

    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('[INVITE] Missing Supabase env vars', {
        hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_KEY,
      });
      return new Response(
        JSON.stringify({ error: 'Configuración del servidor incompleta (Supabase)' }),
        { status: 500, headers: CORS }
      );
    }
    if (!RESEND_API_KEY) {
      console.error('[INVITE] Missing RESEND_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Configuración del servidor incompleta (Resend). Falta RESEND_API_KEY.' }),
        { status: 500, headers: CORS }
      );
    }

    // ── Verificar JWT del llamante ────────────────────────────────
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), {
        status: 401, headers: CORS,
      });
    }

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': SERVICE_KEY },
    });
    if (!userRes.ok) {
      console.error('[INVITE] getUser failed:', userRes.status);
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401, headers: CORS,
      });
    }
    const caller = await userRes.json();
    const callerId = caller?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
        status: 401, headers: CORS,
      });
    }

    // ── Verificar rol admin ──────────────────────────────────────
    const roleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${callerId}&select=role`,
      {
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
      }
    );
    if (!roleRes.ok) {
      console.error('[INVITE] role fetch failed:', roleRes.status);
      return new Response(
        JSON.stringify({ error: 'No se pudo verificar el rol' }),
        { status: 500, headers: CORS }
      );
    }
    const roleRows = await roleRes.json();
    /* Bug-fix: el caller puede tener múltiples filas en user_roles (transitorio mientras
       se reasignan o por race conditions). Antes mirábamos solo roleRows[0].role, lo que
       rechazaba a un admin si su fila 'admin' no era la primera. Ahora validamos con .some(). */
    if (!Array.isArray(roleRows) || !roleRows.some(r => r && r.role === 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Solo los administradores pueden invitar usuarios' }),
        { status: 403, headers: CORS }
      );
    }

    // ── Parsear inputs ────────────────────────────────────────────
    const body = await req.json();
    const email = (body.email || '').trim();
    const role = body.role;

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400, headers: CORS,
      });
    }
    if (!['fiscal', 'consultor', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Rol inválido' }), {
        status: 400, headers: CORS,
      });
    }

    const adminHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
    };

    // ── Ver si el usuario ya existe ──────────────────────────────
    let newUserId = null;
    let userAlreadyExisted = false;
    const listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      { headers: adminHeaders }
    );
    if (listRes.ok) {
      const listData = await listRes.json().catch(() => ({}));
      const existing = (listData.users || []).find(
        (u) => (u.email || '').toLowerCase() === email.toLowerCase()
      );
      if (existing) {
        newUserId = existing.id;
        userAlreadyExisted = true;
      }
    }

    // ── Generar el link SIN que Supabase mande email ─────────────
    // generate_link soporta: invite | signup | magiclink | recovery
    // - Usuario nuevo  → "invite"
    // - Usuario existente → "recovery" (para que reestablezca contraseña)
    const linkType = userAlreadyExisted ? 'recovery' : 'invite';
    const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        type: linkType,
        email,
        redirect_to: SITE_URL,
        data: userAlreadyExisted ? undefined : { invited_role: role },
      }),
    });
    const genData = await genRes.json().catch(() => ({}));
    if (!genRes.ok) {
      console.error('[INVITE] generate_link failed:', genRes.status, genData);
      return new Response(
        JSON.stringify({
          error: genData?.msg || genData?.error_description || genData?.error || `Error ${genRes.status} generando link`,
        }),
        { status: genRes.status, headers: CORS }
      );
    }

    const actionLink =
      genData?.properties?.action_link ||
      genData?.action_link ||
      null;
    if (!actionLink) {
      console.error('[INVITE] No action_link in response:', genData);
      return new Response(
        JSON.stringify({ error: 'No se recibió link de invitación de Supabase' }),
        { status: 500, headers: CORS }
      );
    }
    newUserId = genData?.user?.id || genData?.id || newUserId;

    // ── Enviar correo custom vía Resend ──────────────────────────
    let emailSent = false;
    let emailError = null;
    try {
      const subject = userAlreadyExisted
        ? 'Restablece tu acceso a Fiscalito'
        : 'Te invitaron a Fiscalito';
      const html = buildEmailHtml({
        actionLink,
        role,
        siteUrl: SITE_URL,
        isRecovery: userAlreadyExisted,
      });
      await sendWithResend({
        apiKey: RESEND_API_KEY,
        from: RESEND_FROM,
        to: email,
        subject,
        html,
      });
      emailSent = true;
    } catch (err) {
      emailError = err.message || String(err);
      console.error('[INVITE] Resend send failed:', emailError);
    }

    // ── Asignar rol ──────────────────────────────────────────────
    // Orden: INSERT nuevo rol primero, y luego DELETE de los roles viejos
    // que NO sean el nuevo. Así si el INSERT falla, el usuario conserva su
    // rol anterior en vez de quedar sin rol.
    // Usamos upsert-equivalente con `on_conflict` sobre la PK (user_id, role):
    // si ya tenía exactamente ese mismo rol, no duplica.
    let roleAssigned = false;
    if (newUserId) {
      const insRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?on_conflict=user_id,role`,
        {
          method: 'POST',
          headers: {
            ...adminHeaders,
            'Prefer': 'return=minimal,resolution=merge-duplicates',
          },
          body: JSON.stringify({ user_id: newUserId, role }),
        }
      );
      if (!insRes.ok) {
        const errBody = await insRes.text().catch(() => '');
        console.error('[INVITE] role insert failed:', insRes.status, errBody);
        // No borramos roles viejos si el insert falló: el usuario conserva lo
        // que tenía antes (si algo).
      } else {
        roleAssigned = true;
        // Ahora sí: borrar roles viejos (distintos del nuevo) para mantener
        // un único rol por usuario.
        /* Bug-fix: encodeURIComponent también en newUserId como defensa en profundidad
           (es UUID de Supabase Admin API en la práctica, pero no hay que confiar). */
        const delRes = await fetch(
          `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(newUserId)}&role=neq.${encodeURIComponent(role)}`,
          { method: 'DELETE', headers: adminHeaders }
        );
        if (!delRes.ok && delRes.status !== 404) {
          const errBody = await delRes.text().catch(() => '');
          console.error('[INVITE] role cleanup failed:', delRes.status, errBody);
        }
      }
    }

    const statusCode = emailSent ? 200 : 502;
    return new Response(
      JSON.stringify({
        success: emailSent,
        message: emailSent
          ? (userAlreadyExisted
              ? `Usuario ${email} ya existía. Se le envió un correo (vía Resend) para restablecer contraseña.`
              : `Invitación enviada a ${email} vía Resend.`)
          : `Se generó el link pero falló el envío: ${emailError}`,
        user_id: newUserId,
        email_sent: emailSent,
        already_existed: userAlreadyExisted,
        role_assigned: roleAssigned,
        email_error: emailError || undefined,
        // NUNCA devolver action_link al cliente: es un secreto que permite
        // tomar posesión de la cuenta. Si el envío falló, el admin debe
        // reintentar la invitación en lugar de leer el link del response.
      }),
      { status: statusCode, headers: CORS }
    );
  } catch (err) {
    console.error('[INVITE] Exception:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Error inesperado' }),
      { status: 500, headers: CORS }
    );
  }
};

export default handler;
