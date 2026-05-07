-- ═══════════════════════════════════════════════════════════════════
-- LIMPIAR_MODELOS_RESOLUCION_V2.SQL  ·  2026-05-07
-- Versión adaptada para usuarios sin contexto de auth en SQL Editor
-- ─────────────────────────────────────────────────────────────────────
-- USA EL EMAIL DEL USUARIO directamente en lugar de auth.uid()
-- Cambia 'vgarridoortega@gmail.com' si fuese necesario.
-- ═══════════════════════════════════════════════════════════════════

-- ░░ 0. INVENTARIO ░░
SELECT
  COUNT(*) AS total_modelos,
  COUNT(DISTINCT resolution_category) AS categorias_distintas,
  COUNT(DISTINCT procedure_type) AS tipos_procedimiento,
  SUM(LENGTH(COALESCE(extracted_text, ''))) AS total_chars
FROM case_resolution_models
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com');


-- ░░ A.1 PREVIEW DUPLICADOS (con TRANSLATE en lugar de UNACCENT) ░░
WITH normalized AS (
  SELECT
    id,
    name,
    resolution_category,
    procedure_type,
    LENGTH(COALESCE(extracted_text, '')) AS len,
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRANSLATE(LOWER(COALESCE(name, '')),
          'áéíóúüñÁÉÍÓÚÜÑ',
          'aeiouunAEIOUUN'),
        '\d+', '', 'g'
      ),
      '\s+', ' ', 'g'
    ) AS norm_name,
    created_at
  FROM case_resolution_models
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY resolution_category, procedure_type, TRIM(norm_name)
      ORDER BY len DESC, created_at DESC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY resolution_category, procedure_type, TRIM(norm_name)
    ) AS group_size
  FROM normalized
)
SELECT
  CASE WHEN rn = 1 THEN '📌 KEEP' ELSE '🗑 DELETE' END AS accion,
  resolution_category,
  procedure_type,
  name,
  len AS chars,
  group_size,
  id
FROM ranked
WHERE group_size > 1
ORDER BY resolution_category, procedure_type, TRIM(norm_name), rn;


-- ░░ A.2 BORRAR DUPLICADOS (descomenta para ejecutar) ░░
/*
WITH normalized AS (
  SELECT
    id,
    LENGTH(COALESCE(extracted_text, '')) AS len,
    REGEXP_REPLACE(REGEXP_REPLACE(
      TRANSLATE(LOWER(COALESCE(name, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
      '\d+', '', 'g'), '\s+', ' ', 'g') AS norm_name,
    resolution_category,
    procedure_type,
    created_at
  FROM case_resolution_models
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
),
ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY resolution_category, procedure_type, TRIM(norm_name) ORDER BY len DESC, created_at DESC) AS rn
  FROM normalized
)
DELETE FROM case_resolution_models
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
  AND id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id, name;
*/


-- ░░ B.1 PREVIEW limpieza de títulos ░░
SELECT
  id,
  name AS antes,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, ',?\s*\d+\s*[A-Za-z]?\b', '', 'g'),
        '\s*,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\s*$', '', 'g'
      ),
      '\s+[A-ZÁÉÍÓÚÑ]{4,}\s*$', '', 'g'
    ),
    '\s{2,}', ' ', 'g'
  )) AS despues
FROM case_resolution_models
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
  AND (
    name ~ '\d+\s*[A-Za-z]?\b'
    OR name ~ ',\s*[A-ZÁÉÍÓÚÑ][a-z]'
    OR name ~ '[A-ZÁÉÍÓÚÑ]{4,}\s*$'
  )
ORDER BY name;


-- ░░ B.2 APLICAR limpieza de títulos (descomenta para ejecutar) ░░
/*
UPDATE case_resolution_models
SET name = TRIM(REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, ',?\s*\d+\s*[A-Za-z]?\b', '', 'g'),
      '\s*,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\s*$', '', 'g'
    ),
    '\s+[A-ZÁÉÍÓÚÑ]{4,}\s*$', '', 'g'
  ),
  '\s{2,}', ' ', 'g'
))
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
  AND (name ~ '\d+\s*[A-Za-z]?\b' OR name ~ ',\s*[A-ZÁÉÍÓÚÑ][a-z]' OR name ~ '[A-ZÁÉÍÓÚÑ]{4,}\s*$')
RETURNING id, name;
*/


-- ░░ C.1 PREVIEW PII en contenido ░░
SELECT
  id,
  name,
  (LENGTH(extracted_text) - LENGTH(REGEXP_REPLACE(extracted_text, '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]', '', 'g'))) / 12 AS aprox_ruts,
  (SELECT COUNT(*) FROM REGEXP_MATCHES(extracted_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'g')) AS emails,
  (SELECT COUNT(*) FROM REGEXP_MATCHES(extracted_text, '(?:\+?56\s*)?9\s*\d{4}\s*\d{4}', 'g')) AS telefonos,
  LENGTH(extracted_text) AS total_chars
FROM case_resolution_models
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
  AND extracted_text IS NOT NULL
ORDER BY (
  (CASE WHEN extracted_text ~ '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]' THEN 1 ELSE 0 END) +
  (CASE WHEN extracted_text ~ '@' THEN 1 ELSE 0 END) +
  (CASE WHEN extracted_text ~ '9\s*\d{4}\s*\d{4}' THEN 1 ELSE 0 END)
) DESC, name;


-- ░░ C.2 APLICAR limpieza de contenido (descomenta para ejecutar) ░░
/*
UPDATE case_resolution_models
SET extracted_text = REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(extracted_text,
      '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]', '[RUT]', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[EMAIL]', 'g'),
  '(?:\+?56\s*)?9\s*\d{4}\s*\d{4}', '[TEL]', 'g'
)
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com')
  AND extracted_text IS NOT NULL
  AND (
    extracted_text ~ '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]'
    OR extracted_text ~ '@'
    OR extracted_text ~ '9\s*\d{4}\s*\d{4}'
  )
RETURNING id, name, LENGTH(extracted_text) AS chars_finales;
*/


-- ░░ BACKUP (ejecuta esto antes de cualquier UPDATE/DELETE) ░░
/*
CREATE TABLE case_resolution_models_backup AS
SELECT * FROM case_resolution_models
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com');
*/


-- ░░ RESTAURAR DESDE BACKUP (en caso de emergencia) ░░
/*
DELETE FROM case_resolution_models WHERE user_id = (SELECT id FROM auth.users WHERE email = 'vgarridoortega@gmail.com');
INSERT INTO case_resolution_models SELECT * FROM case_resolution_models_backup;
*/


-- ░░ ELIMINAR BACKUP (cuando ya estés segura del resultado) ░░
/*
DROP TABLE case_resolution_models_backup;
*/
