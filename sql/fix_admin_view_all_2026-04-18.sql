-- =====================================================================
-- fix_admin_view_all_2026-04-18.sql
-- Permitir que usuarios con rol 'admin' vean TODAS las filas de
-- profiles, ai_usage_logs y ai_usage_limits, que es lo que necesita
-- el panel admin (js/mod-usuarios-roles.js) para listar otros usuarios
-- y su uso de IA.
--
-- Antes de este fix, las policies default de Supabase sólo permitían
-- a cada usuario ver sus propias filas, así que el admin veía sólo su
-- propio registro en profiles y sus propios logs de IA.
--
-- Requiere que exista public.is_admin() de
-- fix_user_roles_recursion_2026-04-15.sql — SECURITY DEFINER que evita
-- recursión al consultar user_roles desde dentro de una policy.
-- =====================================================================

-- ─── 1) PROFILES ─────────────────────────────────────────────────────
-- Asegurar que RLS esté habilitado (normalmente Supabase lo habilita al
-- crear la tabla, pero lo forzamos por defensa).
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: cada usuario lee su propio profile (por compatibilidad con
-- cualquier código existente que no use el panel admin).
DROP POLICY IF EXISTS "users_read_own_profile"     ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "users_read_own_profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Política: admins pueden leer todos los profiles (necesario para la
-- tabla de usuarios del panel admin).
DROP POLICY IF EXISTS "admins_read_all_profiles" ON public.profiles;
CREATE POLICY "admins_read_all_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Política: cada usuario puede actualizar su propio profile (nombre,
-- etc). Admin NO puede editar profiles ajenos por seguridad — si hay
-- que cambiar datos de otro usuario, pasa por el backend con
-- service_role (netlify/functions/invite-user.js u otra función).
DROP POLICY IF EXISTS "users_update_own_profile"      ON public.profiles;
DROP POLICY IF EXISTS "Users can update their profile" ON public.profiles;
CREATE POLICY "users_update_own_profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── 2) AI_USAGE_LOGS ────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Política: cada usuario lee sus propios logs (el badge de uso mensual
-- del chat depende de esto).
DROP POLICY IF EXISTS "users_read_own_usage"    ON public.ai_usage_logs;
DROP POLICY IF EXISTS "Users read own usage"    ON public.ai_usage_logs;
CREATE POLICY "users_read_own_usage"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Política: admins ven TODOS los logs (panel "Uso IA" del admin).
DROP POLICY IF EXISTS "admins_read_all_usage" ON public.ai_usage_logs;
CREATE POLICY "admins_read_all_usage"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Política: cada usuario inserta sus propios logs (los módulos del
-- frontend loguean uso desde la sesión del usuario).
DROP POLICY IF EXISTS "users_insert_own_usage" ON public.ai_usage_logs;
CREATE POLICY "users_insert_own_usage"
  ON public.ai_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No creamos políticas de UPDATE/DELETE para authenticated: los logs son
-- append-only. Si hay que purgar, se hace con service_role.

-- ─── 3) AI_USAGE_LIMITS ──────────────────────────────────────────────
-- Tabla de presupuestos mensuales por rol. Todos los usuarios autenticados
-- necesitan leerla (para saber su propio presupuesto). Solo admins la
-- modifican.
ALTER TABLE IF EXISTS public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_read_limits"  ON public.ai_usage_limits;
CREATE POLICY "all_read_limits"
  ON public.ai_usage_limits
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admins_manage_limits" ON public.ai_usage_limits;
CREATE POLICY "admins_manage_limits"
  ON public.ai_usage_limits
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =====================================================================
-- VERIFICACIÓN (correr DESPUÉS de aplicar):
-- SELECT tablename, policyname, cmd, roles, qual
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'ai_usage_logs', 'ai_usage_limits')
-- ORDER BY tablename, policyname;
--
-- Deberías ver para cada tabla:
--   profiles:         users_read_own_profile, admins_read_all_profiles,
--                     users_update_own_profile
--   ai_usage_logs:    users_read_own_usage, admins_read_all_usage,
--                     users_insert_own_usage
--   ai_usage_limits:  all_read_limits, admins_manage_limits
-- =====================================================================
