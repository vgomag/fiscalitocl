-- ════════════════════════════════════════════════════════════════════════
-- ADD COLUMN: cases.actuaria
-- 2026-05-01 · Fiscalito
-- ────────────────────────────────────────────────────────────────────────
-- Persiste la actuaria asignada a cada caso directamente en la tabla
-- `cases`. Hasta ahora la asignación caía a localStorage del navegador,
-- lo que limita la sincronización entre dispositivos y rompe los flujos
-- de Pendientes y Monday cuando se accede desde otro equipo.
--
-- Después de aplicar esta migración:
--   · El editor inline de la columna Actuaria escribirá directo en BD
--   · El filtro de Pendientes "Por actuaria" filtrará desde BD
--   · El bulk a Monday usará la actuaria persistida en BD
--   · Los datos del script de importación quedan persistidos
--
-- USO en Supabase Dashboard:
--   1. Abre Supabase → SQL Editor → New query
--   2. Pega TODO este archivo y ejecuta (botón "Run")
--   3. Verifica con la query final que la columna fue creada
--
-- Idempotente: si la columna ya existe, no falla (IF NOT EXISTS)
-- ════════════════════════════════════════════════════════════════════════

-- 1) Agregar columna `actuaria` (texto, nullable)
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS actuaria text;

-- 2) Comentario de documentación
COMMENT ON COLUMN public.cases.actuaria IS
  'Actuaria asignada al caso (ej: "Roxana Pacheco Hernández"). Antes vivía en localStorage; migrado a BD el 2026-05-01.';

-- 3) Índice para queries frecuentes (filtros por actuaria en Pendientes / tabla)
CREATE INDEX IF NOT EXISTS idx_cases_actuaria
  ON public.cases (actuaria)
  WHERE actuaria IS NOT NULL AND deleted_at IS NULL;

-- 4) Migrar lo que está en localStorage al primer uso (no se hace acá; se hace
--    automáticamente desde el navegador la primera vez que un usuario abra la
--    app después de la migración — el módulo mod-actuaria-tabla.js detecta los
--    valores en localStorage y los persiste a BD vía persistActuaria()).

-- ════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ════════════════════════════════════════════════════════════════════════
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cases'
  AND column_name = 'actuaria';
-- Esperado: 1 fila con (actuaria, text, YES)

-- Después de la migración, podés contar cuántos casos tienen actuaria:
-- SELECT COUNT(*) FILTER (WHERE actuaria IS NOT NULL) AS con_actuaria,
--        COUNT(*) FILTER (WHERE actuaria IS NULL) AS sin_actuaria
-- FROM public.cases
-- WHERE deleted_at IS NULL;
