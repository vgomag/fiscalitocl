import { corsHeaders } from './shared/cors-esm.js';

/**
 * INVITE-USER — Invita un usuario por email vía Supabase Auth Admin API
 * ──────────────────────────────────────────────────────────────────────
 * Usa fetch directo (sin SDK) para evitar dependencias en package.json.
 * Requiere que el llamante esté autenticado y tenga rol 'admin'.
 */

function getEnv(name, fallback) {
  const v =
    (typeof Netlify !== 'undefined' && Netlify.env?.get(name)) ||
    process.env[name];
  return v || fallback;
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

    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('[INVITE] Missing env vars', {
        hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_KEY,
      });
      return new Response(
        JSON.stringify({ error: 'Configuración del servidor incompleta' }),
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
    if (!Array.isArray(roleRows) || roleRows[0]?.role !== 'admin') {
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
    const listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      { headers: adminHeaders }
    );
    if (listRes.ok) {
      const listData = await listRes.json().catch(() => ({}));
      const existing = (listData.users || []).find(
        (u) => (u.email || '').toLowerCase() === email.toLowerCase()
      );
      if (existing) newUserId = existing.id;
    }

    // ── Crear usuario si no existe (con email ya confirmado) ────
    if (!newUserId) {
      // Clave temporal aleatoria: el usuario la reemplaza con el link de recuperación
      const tempPass = 'Tmp-' + Math.random().toString(36).slice(2, 10) + '-' +
                       Math.random().toString(36).slice(2, 10);

      const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email,
          password: tempPass,
          email_confirm: true, // saltar confirmación de email
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        console.error('[INVITE] create failed:', createRes.status, createData);
        return new Response(
          JSON.stringify({
            error: createData?.msg || createData?.error_description || createData?.error || `Error ${createRes.status}`,
          }),
          { status: createRes.status, headers: CORS }
        );
      }
      newUserId = createData?.id || createData?.user?.id;
    }

    // ── Enviar correo de "definir contraseña" (recovery) ────────
    const recoverRes = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email,
        // Redirige al usuario después de que define su contraseña
        options: { redirect_to: `${SITE_URL}` },
      }),
    });
    if (!recoverRes.ok) {
      const errBody = await recoverRes.text().catch(() => '');
      console.error('[INVITE] recover failed:', recoverRes.status, errBody);
      // No bloquear: el usuario ya existe; el admin puede reintentar
    }

    // ── Asignar rol ──────────────────────────────────────────────
    // El unique constraint de user_roles es (user_id, role), no user_id solo,
    // así que un upsert "on_conflict=user_id" no aplica. Hacemos DELETE + INSERT
    // para garantizar un único rol por usuario.
    if (newUserId) {
      const delRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${newUserId}`,
        { method: 'DELETE', headers: adminHeaders }
      );
      if (!delRes.ok && delRes.status !== 404) {
        const errBody = await delRes.text().catch(() => '');
        console.error('[INVITE] role delete failed:', delRes.status, errBody);
      }
      const insRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles`,
        {
          method: 'POST',
          headers: { ...adminHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ user_id: newUserId, role }),
        }
      );
      if (!insRes.ok) {
        const errBody = await insRes.text().catch(() => '');
        console.error('[INVITE] role insert failed:', insRes.status, errBody);
        // No bloquear: la invitación ya fue creada
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Usuario ${email} creado. Se le envió un correo para definir su contraseña.`,
        user_id: newUserId,
      }),
      { status: 200, headers: CORS }
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
