-- =====================================================================
-- fix_user_roles_rls_2026-04-14.sql
-- Asegura que los usuarios no puedan auto-escalarse a admin desde el
-- frontend. Solo el backend (service_role via invite-user.js) puede
-- insertar/modificar/eliminar filas en user_roles.
-- =====================================================================

-- 1) Asegurar que RLS esté ENABLED en la tabla
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Quitar políticas viejas que pudieran ser demasiado permisivas
DROP POLICY IF EXISTS "Users can view their own role"       ON public.user_roles;
DROP POLICY IF EXISTS "Users can update their own role"     ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert their own role"     ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can read roles"               ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated can manage roles"      ON public.user_roles;
DROP POLICY IF EXISTS "users_read_own_role"                 ON public.user_roles;
DROP POLICY IF EXISTS "admins_read_all_roles"               ON public.user_roles;

-- 3) SELECT: usuario autenticado puede leer SOLO su propio rol
CREATE POLICY "users_read_own_role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4) SELECT: admins pueden leer todos los roles (UI de gestión de usuarios)
CREATE POLICY "admins_read_all_roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- 5) NO creamos políticas de INSERT/UPDATE/DELETE para authenticated.
--    service_role bypassea RLS por defecto; las mutaciones pasan por
--    netlify/functions/invite-user.js (usa SUPABASE_SERVICE_ROLE_KEY).

-- 6) Verificación rápida (ejecuta DESPUÉS para confirmar):
--    SELECT tablename, policyname, cmd, roles
--    FROM pg_policies
--    WHERE tablename = 'user_roles';
