-- ═══════════════════════════════════════════════════════════════════
-- TABLA: case_resolution_models
-- Biblioteca de MODELOS DE RESOLUCIÓN/ACTUACIONES por caso
-- ─────────────────────────────────────────────────────────────────────
-- Almacena texto de resoluciones, actas, oficios, citaciones y demás
-- actuaciones reales de casos anteriores (.docx, .doc, .txt, .md). Los
-- documentos quedan disponibles como referencia de estilo (is_global=TRUE)
-- para que el agente IA replique formato institucional al generar nuevas
-- actuaciones del mismo tipo procesal.
--
-- Spec replicada del módulo "Modelos de Resolución" (Fiscalito v1).
-- Fecha: 2026-05-03
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Tabla principal ───
CREATE TABLE IF NOT EXISTS case_resolution_models (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID REFERENCES cases(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  file_name           TEXT NOT NULL,
  extracted_text      TEXT NOT NULL,
  description         TEXT,
  model_type          TEXT NOT NULL DEFAULT 'resolucion',
  resolution_category TEXT NOT NULL DEFAULT 'otro',
  procedure_type      TEXT NOT NULL DEFAULT 'investigacion_sumaria',
  is_global           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Validaciones de dominio
  CONSTRAINT chk_resolution_category CHECK (resolution_category IN (
    'citacion','notificacion','acta_declaracion','acta_ratificacion',
    'acta_entrevista','acta_notificacion','resolucion_acepta_cargo',
    'resolucion_cita_declarar','resolucion_medida_resguardo','resolucion_general',
    'oficio','cuestionario','constancia','consentimiento','certificacion',
    'acuerdo_alejamiento','formulacion_cargos','descargos','provee_descargos',
    'informe','vista_fiscal','incorpora_antecedentes','denuncia','memo','otro'
  )),
  CONSTRAINT chk_procedure_type CHECK (procedure_type IN (
    'investigacion_sumaria','sumario_administrativo','ambos'
  )),
  CONSTRAINT chk_extracted_text_min_len CHECK (char_length(extracted_text) >= 50)
);

COMMENT ON TABLE case_resolution_models IS
  'Biblioteca de modelos de resolución/actuaciones (textos extraídos de .docx/.doc/.txt/.md) que el agente IA usa como referencia de estilo al generar nuevas actuaciones similares. Por defecto is_global=TRUE → visible al agente en TODOS los casos del usuario.';

COMMENT ON COLUMN case_resolution_models.case_id IS 'Caso de origen donde se subió el modelo (puede ser NULL si el caso se elimina pero se preserva el modelo).';
COMMENT ON COLUMN case_resolution_models.is_global IS 'TRUE → el modelo es visible al agente en cualquier caso del usuario, no solo en el caso de origen.';
COMMENT ON COLUMN case_resolution_models.extracted_text IS 'Texto plano extraído client-side con mammoth o file.text(). NO se almacena el binario.';

-- ─── 2. Índices ───
CREATE INDEX IF NOT EXISTS idx_crm_user_id
  ON case_resolution_models(user_id);

CREATE INDEX IF NOT EXISTS idx_crm_case_id
  ON case_resolution_models(case_id);

CREATE INDEX IF NOT EXISTS idx_crm_user_global
  ON case_resolution_models(user_id, is_global)
  WHERE is_global = TRUE;

CREATE INDEX IF NOT EXISTS idx_crm_user_category
  ON case_resolution_models(user_id, resolution_category);

CREATE INDEX IF NOT EXISTS idx_crm_created_at
  ON case_resolution_models(created_at DESC);

-- ─── 3. RLS (Row Level Security) ───
ALTER TABLE case_resolution_models ENABLE ROW LEVEL SECURITY;

-- Cada usuario gestiona (SELECT/INSERT/UPDATE/DELETE) sus propios modelos
DROP POLICY IF EXISTS "Users manage own resolution models" ON case_resolution_models;
CREATE POLICY "Users manage own resolution models"
  ON case_resolution_models
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN: ejecutar después de aplicar
-- ═══════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'case_resolution_models'
--  ORDER BY ordinal_position;
--
-- SELECT policyname, cmd, qual
--   FROM pg_policies
--  WHERE tablename = 'case_resolution_models';
