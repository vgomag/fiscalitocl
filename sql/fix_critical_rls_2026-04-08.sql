-- ═══════════════════════════════════════════════════════════════════
-- FIX CRÍTICO: Políticas RLS de document_counters y generated_documents
-- Fecha: 2026-04-08
-- Problema: Políticas USING(true) permiten acceso total a todos los
--           usuarios autenticados. Esto viola la confidencialidad.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. document_counters: restringir por organización ───
-- Antes: FOR ALL USING (true) → cualquier usuario ve/modifica todos los contadores
-- Ahora: Solo contadores de tu propia organización
DROP POLICY IF EXISTS "Org members manage shared counters" ON document_counters;
DROP POLICY IF EXISTS "Users manage own counters" ON document_counters;

CREATE POLICY "Org members manage shared counters" ON document_counters
  FOR ALL USING (
    org_id IN (
      SELECT DISTINCT dc.org_id
      FROM document_counters dc
      WHERE dc.user_id = auth.uid()
    )
  );

-- ─── 2. generated_documents: restringir SELECT a owner + shared ───
-- Antes: FOR SELECT USING (true) → cualquier usuario ve todos los documentos
-- Ahora: Solo tus documentos + documentos de casos compartidos contigo
DROP POLICY IF EXISTS "Org members see shared documents" ON generated_documents;
DROP POLICY IF EXISTS "Users see own and shared documents" ON generated_documents;

CREATE POLICY "Users see own and shared documents" ON generated_documents
  FOR SELECT USING (
    auth.uid() = user_id
    OR case_id IN (SELECT cs.case_id FROM case_shares cs WHERE cs.user_id = auth.uid())
  );

-- INSERT y DELETE ya estaban correctos (filtran por auth.uid() = user_id)
-- Solo los recreamos para asegurar consistencia:
DROP POLICY IF EXISTS "Users create own documents" ON generated_documents;
CREATE POLICY "Users create own documents" ON generated_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own documents" ON generated_documents;
CREATE POLICY "Users delete own documents" ON generated_documents
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN: Ejecutar después de aplicar para confirmar
-- ═══════════════════════════════════════════════════════════════════
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE tablename IN ('document_counters', 'generated_documents');
