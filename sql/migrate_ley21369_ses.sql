-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Ley 21.369 → Formato SES 2026
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

/* #31: Safe constraint migration — Check for invalid values first */
-- Before applying new constraints, validate that existing data will not violate them
DO $$
DECLARE
  _invalid_count INTEGER;
BEGIN
  -- Check for status values that won't fit the new constraint
  SELECT COUNT(*) INTO _invalid_count FROM ley21369_items
  WHERE status NOT IN ('cumple','parcial','no_cumple','sin_evaluar','pendiente','en_proceso','cumplido','no_aplica');

  IF _invalid_count > 0 THEN
    RAISE WARNING '[migrate_ley21369_ses] Found % rows with unexpected status values. Review and clean before applying constraint.', _invalid_count;
  END IF;
END $$;

-- 1. Actualizar CHECK constraint de status en ley21369_items
--    Cambio: 4 estados → 4 estados (reemplazar pendiente/en_proceso por sin_evaluar/parcial/no_cumple)
ALTER TABLE ley21369_items DROP CONSTRAINT IF EXISTS ley21369_items_status_check;
ALTER TABLE ley21369_items ADD CONSTRAINT ley21369_items_status_check
  CHECK (status IN ('cumple','parcial','no_cumple','sin_evaluar'));

-- 2. Migrar estados existentes al nuevo esquema
UPDATE ley21369_items SET status = 'sin_evaluar' WHERE status = 'pendiente';
UPDATE ley21369_items SET status = 'parcial' WHERE status = 'en_proceso';
UPDATE ley21369_items SET status = 'cumple' WHERE status = 'cumplido';
-- no_aplica → sin_evaluar (se puede re-evaluar)
UPDATE ley21369_items SET status = 'sin_evaluar' WHERE status = 'no_aplica';

-- 3. Crear tabla ley21369_meta (evidencias, plan mejora, conclusión, metadatos por sección)
CREATE TABLE IF NOT EXISTS ley21369_meta (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,              -- 'evidencias', 'plan_mejora', 'conclusion', 'seccion_xxx'
  value TEXT NOT NULL DEFAULT '{}', -- JSON serializado
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- 4. RLS para ley21369_meta
ALTER TABLE ley21369_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ley21369 meta" ON ley21369_meta
  FOR ALL USING (auth.uid() = user_id);

-- 5. Índice
CREATE INDEX IF NOT EXISTS idx_ley21369_meta_user_key
  ON ley21369_meta(user_id, key);

-- 6. Actualizar áreas existentes al nuevo esquema de secciones SES
--    (solo si ya hay datos con áreas antiguas)
UPDATE ley21369_items SET area = 'politica_integral' WHERE area IN ('protocolo','difusion','canales_denuncia','organo_encargado');
UPDATE ley21369_items SET area = 'modelo_prevencion' WHERE area IN ('capacitacion','modelo_prevencion');
UPDATE ley21369_items SET area = 'investigacion_sancion' WHERE area IN ('investigacion','medidas_reparacion','registro_estadistico');
UPDATE ley21369_items SET area = 'adecuacion_contratos' WHERE area = 'general';

-- ═══════════════════════════════════════════════════════════════════
-- NOTA: Después de ejecutar esta migración, la primera vez que abras
-- el módulo Ley 21.369, si no hay ítems, se pre-poblarán los 26
-- ítems del template SES automáticamente.
-- Si ya tienes ítems, puedes usar el botón "🔄 Reset SES" para
-- re-inicializar desde el template.
-- ═══════════════════════════════════════════════════════════════════
