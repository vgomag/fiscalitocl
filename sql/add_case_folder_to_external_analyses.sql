-- Migración: Agregar carpeta de caso (Drive) a external_case_analyses
-- Ejecutar en Supabase SQL Editor

ALTER TABLE external_case_analyses
ADD COLUMN IF NOT EXISTS case_folder_id TEXT,
ADD COLUMN IF NOT EXISTS case_folder_url TEXT;

-- Índice opcional para búsquedas por folder
CREATE INDEX IF NOT EXISTS idx_external_case_analyses_folder
ON external_case_analyses (case_folder_id)
WHERE case_folder_id IS NOT NULL;
