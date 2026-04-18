-- ═══════════════════════════════════════════════════════════════════
-- TABLAS: document_counters + generated_documents
-- Sistema de numeración correlativa para Oficios, Memos y Resoluciones
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tabla de contadores (un registro por tipo de documento por año por usuario)
CREATE TABLE IF NOT EXISTS document_counters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('oficio','memo','resolucion')),
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  last_number INTEGER NOT NULL DEFAULT 0,
  prefix TEXT NOT NULL DEFAULT '',       -- ej: 'OF', 'MEMO', 'RES'
  format_template TEXT NOT NULL DEFAULT '{PREFIX}-{NUM}/{YEAR}',
  -- Formatos posibles:
  --   {PREFIX}-{NUM}/{YEAR}     → OF-001/2026
  --   {NUM}-{YEAR}-{PREFIX}     → 001-2026-OF
  --   {PREFIX} N° {NUM}/{YEAR}  → OF N° 001/2026
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, doc_type, year)
);

-- 2. Tabla de documentos generados (historial)
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('oficio','memo','resolucion')),
  doc_number TEXT NOT NULL,              -- Número formateado: "OF-003/2026"
  sequential INTEGER NOT NULL,           -- Número correlativo puro: 3
  year INTEGER NOT NULL,
  title TEXT,                            -- Título o asunto
  destinatario TEXT,                     -- A quién va dirigido
  content TEXT,                          -- Contenido completo generado
  metadata JSONB DEFAULT '{}',           -- Datos extra (remitente, cc, referencias, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_doc_counters_user_type_year
  ON document_counters(user_id, doc_type, year);

CREATE INDEX IF NOT EXISTS idx_gen_docs_user_case
  ON generated_documents(user_id, case_id);

CREATE INDEX IF NOT EXISTS idx_gen_docs_type_year
  ON generated_documents(doc_type, year);

-- 4. Función RPC para obtener siguiente número (atómica, sin race conditions)
CREATE OR REPLACE FUNCTION next_doc_number(
  p_user_id UUID,
  p_doc_type TEXT,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TABLE(next_number INTEGER, formatted TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- Bug-fix: search_path inmutable (previene injection en SECURITY DEFINER)
AS $$
DECLARE
  v_next INTEGER;
  v_prefix TEXT;
  v_format TEXT;
  v_formatted TEXT;
BEGIN
  -- SECURITY: Validate that p_user_id matches authenticated user
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: p_user_id does not match authenticated user';
  END IF;

  -- Insertar o actualizar atómicamente
  INSERT INTO document_counters (user_id, doc_type, year, last_number, prefix, format_template)
  VALUES (
    p_user_id,
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
  ON CONFLICT (user_id, doc_type, year)
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

-- 5. RLS (Row Level Security)
ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own counters" ON document_counters
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own documents" ON generated_documents
  FOR ALL USING (auth.uid() = user_id);
