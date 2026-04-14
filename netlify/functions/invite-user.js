import { createClient } from '@supabase/supabase-js';
import cors from './shared/cors.js';

const handler = async (req, context) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(new Response(null, { status: 204 }), req);
  }

  // Solo POST
  if (req.method !== 'POST') {
    return cors(
      new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 }),
      req
    );
  }

  try {
    const { email, role } = await req.json();

    // Validar inputs
    if (!email || !email.includes('@')) {
      return cors(
        new Response(JSON.stringify({ error: 'Email inválido' }), { status: 400 }),
        req
      );
    }
    if (!['fiscal', 'consultor', 'admin'].includes(role)) {
      return cors(
        new Response(JSON.stringify({ error: 'Rol inválido' }), { status: 400 }),
        req
      );
    }

    // Crear cliente Supabase con credenciales de admin
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY, // Service role key (admin)
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    // Invitar usuario
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.URL}/auth/callback`,
    });

    if (error) {
      console.error('[INVITE] Auth error:', error);
      return cors(
        new Response(JSON.stringify({ error: error.message }), { status: 400 }),
        req
      );
    }

    // Asignar rol
    if (data?.user?.id) {
      const { error: roleError } = await supabase.from('user_roles').upsert(
        { user_id: data.user.id, role },
        { onConflict: 'user_id' }
      );

      if (roleError) {
        console.error('[INVITE] Role error:', roleError);
        // No bloquear si falla el rol, ya se creó la invitación
      }
    }

    return cors(
      new Response(
        JSON.stringify({
          success: true,
          message: `Invitación enviada a ${email}`,
          user_id: data?.user?.id,
        }),
        { status: 200 }
      ),
      req
    );
  } catch (err) {
    console.error('[INVITE] Exception:', err);
    return cors(
      new Response(JSON.stringify({ error: err.message }), { status: 500 }),
      req
    );
  }
};

export default handler;
