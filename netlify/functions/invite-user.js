import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from './shared/cors-esm.js';

/**
 * INVITE-USER — Invita un usuario por email usando Supabase Admin API
 * ─────────────────────────────────────────────────────────────────
 * Requiere que el llamante esté autenticado y tenga rol 'admin'.
 */
const handler = async (req) => {
  const CORS = corsHeaders(req);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Solo POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: CORS,
    });
  }

  try {
    // Leer env vars (usar SUPABASE_URL que es la que está configurada en Netlify)
    const SUPABASE_URL =
      (typeof Netlify !== 'undefined' && Netlify.env?.get('SUPABASE_URL')) ||
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY =
      (typeof Netlify !== 'undefined' && Netlify.env?.get('SUPABASE_SERVICE_ROLE_KEY')) ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE_URL =
      (typeof Netlify !== 'undefined' && Netlify.env?.get('URL')) ||
      process.env.URL ||
      'https://fiscalitocl.netlify.app';

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[INVITE] Missing env vars', {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return new Response(
        JSON.stringify({ error: 'Configuración del servidor incompleta' }),
        { status: 500, headers: CORS }
      );
    }

    // ── AUTH: verificar que el llamante sea admin ─────────────────
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'No autenticado' }),
        { status: 401, headers: CORS }
      );
    }

    // Cliente admin (service role)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Validar el JWT del llamante
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error('[INVITE] Invalid token:', userErr);
      return new Response(
        JSON.stringify({ error: 'Sesión inválida' }),
        { status: 401, headers: CORS }
      );
    }

    // Verificar que el llamante sea admin
    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (roleErr) {
      console.error('[INVITE] Error checking role:', roleErr);
      return new Response(
        JSON.stringify({ error: 'No se pudo verificar el rol' }),
        { status: 500, headers: CORS }
      );
    }

    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Solo los administradores pueden invitar usuarios' }),
        { status: 403, headers: CORS }
      );
    }

    // ── Parsear inputs ─────────────────────────────────────────────
    const { email, role } = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), {
        status: 400,
        headers: CORS,
      });
    }
    if (!['fiscal', 'consultor', 'admin'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Rol inválido' }), {
        status: 400,
        headers: CORS,
      });
    }

    // ── Invitar usuario ────────────────────────────────────────────
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/auth/callback`,
    });

    if (error) {
      console.error('[INVITE] Auth error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: CORS,
      });
    }

    // Asignar rol
    if (data?.user?.id) {
      const { error: roleUpsertErr } = await supabaseAdmin
        .from('user_roles')
        .upsert({ user_id: data.user.id, role }, { onConflict: 'user_id' });

      if (roleUpsertErr) {
        console.error('[INVITE] Role upsert error:', roleUpsertErr);
        // No bloquear: la invitación ya fue creada
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Invitación enviada a ${email}`,
        user_id: data?.user?.id,
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
