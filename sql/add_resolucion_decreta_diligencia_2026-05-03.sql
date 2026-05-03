-- ═══════════════════════════════════════════════════════════════════
-- ADD: 'resolucion_decreta_diligencia' al CHECK constraint de
--      case_resolution_models.resolution_category
-- ─────────────────────────────────────────────────────────────────────
-- Categoría adicional para resoluciones que decretan diligencias
-- (resolución que ordena practicar diligencias en el procedimiento).
--
-- Mantiene la convención resolucion_<acción> consistente con
-- resolucion_acepta_cargo, resolucion_cita_declarar,
-- resolucion_medida_resguardo, resolucion_general.
--
-- Fecha: 2026-05-03
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE case_resolution_models
  DROP CONSTRAINT IF EXISTS chk_resolution_category;

ALTER TABLE case_resolution_models
  ADD CONSTRAINT chk_resolution_category CHECK (resolution_category IN (
    'citacion','notificacion','acta_declaracion','acta_ratificacion',
    'acta_entrevista','acta_notificacion','resolucion_acepta_cargo',
    'resolucion_cita_declarar','resolucion_medida_resguardo',
    'resolucion_decreta_diligencia','resolucion_general',
    'oficio','cuestionario','constancia','consentimiento','certificacion',
    'acuerdo_alejamiento','formulacion_cargos','descargos','provee_descargos',
    'informe','vista_fiscal','incorpora_antecedentes','denuncia','memo','otro'
  ));

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'case_resolution_models'::regclass
--    AND conname = 'chk_resolution_category';
