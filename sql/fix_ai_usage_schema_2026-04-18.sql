-- =====================================================================
-- fix_ai_usage_schema_2026-04-18.sql
-- Alinea el schema de ai_usage_logs y ai_usage_limits con lo que espera
-- el módulo admin (js/mod-usuarios-roles.js).
--
-- Bugs que resuelve:
-- 1. ai_usage_logs no tenía las columnas tokens_used ni cost_usd, así que
--    todas las queries SELECT cost_usd devolvían null y el panel admin
--    mostraba $0.00 de gasto para todos los usuarios.
-- 2. ai_usage_limits usaba monthly_limit (integer) en vez de
--    monthly_budget_usd (numeric), así que el badge de presupuesto del
--    chat caía siempre al fallback de $1.00.
--
-- Este script es idempotente — se puede correr múltiples veces sin daño.
-- =====================================================================

-- ─── 1) ai_usage_logs: agregar columnas faltantes ───────────────────
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS tokens_used integer NOT NULL DEFAULT 0;

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS cost_usd numeric(10,4) NOT NULL DEFAULT 0;

-- ─── 2) ai_usage_limits: agregar monthly_budget_usd y backfillear ───
-- Estrategia: mantener monthly_limit por compatibilidad, agregar
-- monthly_budget_usd como nueva columna y poblarla a partir de los
-- valores conocidos por rol.
ALTER TABLE public.ai_usage_limits
  ADD COLUMN IF NOT EXISTS monthly_budget_usd numeric(10,2) NOT NULL DEFAULT 0;

-- Backfill de presupuestos según rol (solo para filas con budget en 0)
UPDATE public.ai_usage_limits SET monthly_budget_usd = 9999.99 WHERE role = 'admin'     AND monthly_budget_usd = 0;
UPDATE public.ai_usage_limits SET monthly_budget_usd = 10.00   WHERE role = 'fiscal'    AND monthly_budget_usd = 0;
UPDATE public.ai_usage_limits SET monthly_budget_usd = 5.00    WHERE role = 'consultor' AND monthly_budget_usd = 0;

-- Insertar filas si faltan los 3 roles base
INSERT INTO public.ai_usage_limits (role, monthly_budget_usd)
VALUES ('admin', 9999.99), ('fiscal', 10.00), ('consultor', 5.00)
ON CONFLICT (role) DO NOTHING;

-- =====================================================================
-- VERIFICACIÓN (correr DESPUÉS):
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'ai_usage_logs' AND table_schema='public';
-- → debe incluir tokens_used (integer) y cost_usd (numeric)
--
-- SELECT * FROM ai_usage_limits ORDER BY role;
-- → debe tener 3 filas: admin/9999.99, fiscal/10.00, consultor/5.00
--   (en monthly_budget_usd; monthly_limit puede tener cualquier valor)
-- =====================================================================
