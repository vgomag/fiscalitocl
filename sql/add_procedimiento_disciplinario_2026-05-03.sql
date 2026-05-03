-- ═══════════════════════════════════════════════════════════════════
-- ADD: 'procedimiento_disciplinario' al CHECK constraint de
--      case_resolution_models.procedure_type
-- ─────────────────────────────────────────────────────────────────────
-- Antes: investigacion_sumaria | sumario_administrativo | ambos
-- Ahora: investigacion_sumaria | sumario_administrativo
--      | procedimiento_disciplinario | ambos
--
-- Tercer tipo común en procedimientos chilenos (Ley Karin 21.643,
-- Ley 21.369, decretos disciplinarios estudiantiles, etc.). Ya
-- reconocido por auto-advance.js y otros módulos.
--
-- Fecha: 2026-05-03
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop el constraint anterior
ALTER TABLE case_resolution_models
  DROP CONSTRAINT IF EXISTS chk_procedure_type;

-- 2. Recrearlo con el nuevo valor incluido
ALTER TABLE case_resolution_models
  ADD CONSTRAINT chk_procedure_type CHECK (procedure_type IN (
    'investigacion_sumaria',
    'sumario_administrativo',
    'procedimiento_disciplinario',
    'ambos'
  ));

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'case_resolution_models'::regclass
--    AND conname = 'chk_procedure_type';
