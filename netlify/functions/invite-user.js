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

    // ── Invitar usuario vía Admin API ────────────────────────────
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
      },
      body: JSON.stringify({
        email,
        redirect_to: `${SITE_URL}/auth/callback`,
      }),
    });

    const inviteData = await inviteRes.json().catch(() => ({}));
    if (!inviteRes.ok) {
      console.error('[INVITE] invite failed:', inviteRes.status, inviteData);
      return new Response(
        JSON.stringify({
          error: inviteData?.msg || inviteData?.error_description || inviteData?.error || `Error ${inviteRes.status}`,
        }),
        { status: inviteRes.status, headers: CORS }
      );
    }

    const newUserId = inviteData?.id || inviteData?.user?.id;

    // ── Asignar rol ──────────────────────────────────────────────
    if (newUserId) {
      const upsertRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?on_conflict=user_id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
            'Prefer': 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({ user_id: newUserId, role }),
        }
      );
      if (!upsertRes.ok) {
        const errBody = await upsertRes.text().catch(() => '');
        console.error('[INVITE] role upsert failed:', upsertRes.status, errBody);
        // No bloquear: la invitación ya fue creada
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitación enviada a ${email}`,
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
