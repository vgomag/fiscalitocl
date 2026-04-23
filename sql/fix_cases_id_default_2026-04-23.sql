-- ============================================================================
-- fix_cases_id_default_2026-04-23.sql
-- ----------------------------------------------------------------------------
-- PROBLEMA:
--   Al crear un caso nuevo, Supabase devolvía:
--     "null value in column 'id' of relation 'cases' violates not-null constraint"
--
--   La columna cases.id es NOT NULL pero NO tenía un DEFAULT, así que un
--   INSERT sin id explícito fallaba.
--
-- CAUSA:
--   La tabla fue creada sin `DEFAULT gen_random_uuid()` en la columna id.
--
-- SOLUCIÓN:
--   Añadir el default y garantizar que la extensión pgcrypto esté disponible.
--   Si tu proyecto usa uuid-ossp en lugar de pgcrypto, reemplaza
--   `gen_random_uuid()` por `uuid_generate_v4()`.
-- ============================================================================

-- 1) Garantiza la función gen_random_uuid() disponible en Postgres (Supabase
--    ya la incluye por defecto desde PG 13, pero dejamos esto por seguridad).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2) Añade el DEFAULT a la columna id (idempotente: sólo lo fija si falta).
ALTER TABLE public.cases
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3) (Opcional) Verifica el cambio.
--    Debe devolver: column_default = 'gen_random_uuid()'
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cases'
  AND column_name = 'id';

-- ============================================================================
-- CÓMO APLICAR
-- ============================================================================
-- Opción A) Supabase SQL Editor:
--   1. Abre https://supabase.com/dashboard/project/<tu-proyecto>/sql/new
--   2. Pega este archivo y presiona "Run".
--
-- Opción B) psql:
--   psql "<SUPABASE_DB_URL>" -f sql/fix_cases_id_default_2026-04-23.sql
--
-- Después de aplicar, el parche cliente (payload.id = crypto.randomUUID())
-- queda redundante pero no causa problemas — el servidor ignora el id
-- cuando viene desde el cliente y usa su propio default si no se envía.
-- ============================================================================
