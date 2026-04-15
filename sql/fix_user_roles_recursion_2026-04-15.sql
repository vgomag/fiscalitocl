-- =====================================================================
-- fix_user_roles_recursion_2026-04-15.sql
-- Arregla recursión infinita en la policy "admins_read_all_roles".
-- La policy anterior hacía SELECT sobre user_roles desde dentro de una
-- policy de user_roles -> recursión -> SELECT falla -> fallback a
-- 'consultor' en el frontend.
--
-- Solución: mover la verificación de admin a una función SECURITY
-- DEFINER que bypassea RLS.
-- =====================================================================

-- 1) Función helper: SECURITY DEFINER bypassea RLS y rompe la recursión.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- 2) Reemplazar policy recursiva por una que use la función.
DROP POLICY IF EXISTS "admins_read_all_roles" ON public.user_roles;

CREATE POLICY "admins_read_all_roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Verificación:
--   SELECT policyname, cmd, qual FROM pg_policies
--   WHERE tablename = 'user_roles';
