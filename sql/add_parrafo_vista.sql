-- Agregar columna parrafo_vista a la tabla diligencias
-- Almacena el párrafo formal generado por IA para la Vista Fiscal de cada diligencia
ALTER TABLE diligencias ADD COLUMN IF NOT EXISTS parrafo_vista TEXT;

-- Comentario descriptivo
COMMENT ON COLUMN diligencias.parrafo_vista IS 'Párrafo formal para Vista Fiscal generado por IA al analizar el expediente por lotes';
