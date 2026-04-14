-- ═══════════════════════════════════════════════════════════════
-- FIX_RPC_AUTH_2026-04-08.SQL
-- User ID Validation Security Fix for RPC Functions
-- ═══════════════════════════════════════════════════════════════
--
-- ISSUE #26: RPC functions with SECURITY DEFINER were accepting
-- arbitrary p_user_id parameters without validation against auth.uid().
--
-- This allows an authenticated attacker to manipulate another user's
-- document counters/generated documents if those functions are exposed.
--
-- FIX: Add authorization check at function entry point.
-- ═══════════════════════════════════════════════════════════════

-- 1. ALTER next_doc_number() — Add p_user_id validation
CREATE OR REPLACE FUNCTION next_doc_number(
  p_user_id UUID,
  p_doc_type TEXT,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TABLE(next_number INTEGER, formatted TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- 2. Comment documenting the security fix
COMMENT ON FUNCTION next_doc_number(UUID, TEXT, INTEGER) IS
  'RPC function to atomically increment and return next document number. SECURITY: Validates that p_user_id matches auth.uid() to prevent authorization bypass.';
