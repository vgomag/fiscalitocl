-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Contadores correlativos compartidos por organización
-- Permite que todo el equipo comparta la misma numeración
-- Ejecutar en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Agregar columna org_id a document_counters
--    org_id = identificador de organización (por defecto 'umag')
--    Esto permite que múltiples usuarios compartan el mismo contador
ALTER TABLE document_counters ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'umag';

-- 2. Migrar el constraint UNIQUE: de (user_id, doc_type, year) a (org_id, doc_type, year)
ALTER TABLE document_counters DROP CONSTRAINT IF EXISTS document_counters_user_id_doc_type_year_key;
-- Crear nuevo constraint por organización
ALTER TABLE document_counters ADD CONSTRAINT document_counters_org_type_year_key
  UNIQUE(org_id, doc_type, year);

-- 3. Consolidar contadores duplicados por usuarios distintos
--    Quedarse con el last_number más alto por tipo+año
WITH max_nums AS (
  SELECT org_id, doc_type, year,
         MAX(last_number) AS max_number,
         MIN(id) AS keep_id
  FROM document_counters
  GROUP BY org_id, doc_type, year
)
UPDATE document_counters dc
SET last_number = mn.max_number
FROM max_nums mn
WHERE dc.id = mn.keep_id
  AND dc.org_id = mn.org_id
  AND dc.doc_type = mn.doc_type
  AND dc.year = mn.year;

-- Eliminar duplicados (quedarse solo con uno por org+tipo+año)
DELETE FROM document_counters
WHERE id NOT IN (
  SELECT MIN(id)
  FROM document_counters
  GROUP BY org_id, doc_type, year
);

-- 4. Agregar org_id a generated_documents (para consultar historial compartido)
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'umag';

-- 5. Agregar columna created_by_name para saber quién generó cada documento
ALTER TABLE generated_documents ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- 6. Índices nuevos
CREATE INDEX IF NOT EXISTS idx_doc_counters_org_type_year
  ON document_counters(org_id, doc_type, year);

CREATE INDEX IF NOT EXISTS idx_gen_docs_org_year
  ON generated_documents(org_id, year);

-- 7. Nueva función RPC: next_doc_number_shared (atómica, por organización)
CREATE OR REPLACE FUNCTION next_doc_number_shared(
  p_org_id TEXT DEFAULT 'umag',
  p_doc_type TEXT DEFAULT 'oficio',
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE(next_number INTEGER, formatted TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_format TEXT;
  v_formatted TEXT;
BEGIN
  -- Insertar o incrementar atómicamente POR ORGANIZACIÓN (no por usuario)
  INSERT INTO document_counters (user_id, org_id, doc_type, year, last_number, prefix, format_template)
  VALUES (
    p_user_id,
    p_org_id,
    p_doc_type,
    p_year,
    1,
    CASE p_doc_type
      WHEN 'oficio' THEN 'OF'
      WHEN 'memo' THEN 'MEMO'
      WHEN 'resolucion' THEN 'RES'
    END,
    '{PREFIX}-{NUM}/{YEAR}'
  )
  ON CONFLICT (org_id, doc_type, year)
  DO UPDATE SET
    last_number = document_counters.last_number + 1,
    updated_at = NOW()
  RETURNING last_number, prefix, format_template
  INTO v_next, v_prefix, v_format;

  -- Aplicar formato
  v_formatted := REPLACE(v_format, '{PREFIX}', v_prefix);
  v_formatted := REPLACE(v_formatted, '{NUM}', LPAD(v_next::TEXT, 3, '0'));
  v_formatted := REPLACE(v_formatted, '{YEAR}', p_year::TEXT);

  RETURN QUERY SELECT v_next, v_formatted;
END;
$$;

-- 8. Actualizar RLS: todos los usuarios de la misma org pueden ver los contadores
--    (mantenemos user_id para saber quién creó el registro, pero el acceso es por org)
DROP POLICY IF EXISTS "Users manage own counters" ON document_counters;
CREATE POLICY "Org members manage shared counters" ON document_counters
  FOR ALL USING (true);  -- Todos los usuarios autenticados acceden
  -- Nota: Si necesitas restringir por organización, puedes agregar:
  -- USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()))

DROP POLICY IF EXISTS "Users manage own documents" ON generated_documents;
CREATE POLICY "Org members see shared documents" ON generated_documents
  FOR SELECT USING (true);  -- Todos pueden VER el historial compartido
CREATE POLICY "Users create own documents" ON generated_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);  -- Solo insertar los propios
CREATE POLICY "Users delete own documents" ON generated_documents
  FOR DELETE USING (auth.uid() = user_id);  -- Solo borrar los propios

-- ═══════════════════════════════════════════════════════════════════
-- NOTAS:
-- • El org_id por defecto es 'umag'. Si en el futuro quieres
--   soportar múltiples organizaciones, cada una tendría su propio
--   org_id y sus contadores independientes.
-- • La función next_doc_number_shared es atómica (usa INSERT...ON CONFLICT)
--   así que no hay riesgo de números duplicados aunque dos personas
--   asignen número al mismo tiempo.
-- • El historial es visible para todo el equipo pero cada usuario
--   solo puede eliminar sus propios documentos.
-- ═══════════════════════════════════════════════════════════════════
