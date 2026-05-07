-- ═══════════════════════════════════════════════════════════════════
-- LIMPIAR_MODELOS_RESOLUCION.SQL  ·  v1.0  ·  2026-05-07
-- ─────────────────────────────────────────────────────────────────────
-- PROPÓSITO
--   Limpiar la tabla `case_resolution_models` del usuario actual:
--     A. Borrar duplicados (mismo nombre normalizado dentro del mismo
--        category × procedure_type, conservando el más completo).
--     B. Anonimizar el campo `name` quitando datos personales.
--     C. Anonimizar el campo `extracted_text` reemplazando RUTs,
--        emails, teléfonos chilenos.
--
-- USO (paso a paso, en Supabase SQL Editor)
--   1. Abre https://supabase.com/dashboard/project/zgoxrzbkftzulsphmtfk
--   2. Click en "SQL Editor" en el sidebar izquierdo.
--   3. Click en "+ New query".
--   4. Pega TODO este archivo.
--   5. Antes de tocar nada, ejecuta SOLO el bloque "🔎 PREVIEW" para
--      ver qué se va a borrar/cambiar (se ejecuta cuando seleccionas
--      el SELECT y pulsas "Run").
--   6. Si te convence, descomenta el bloque que corresponda y "Run".
--   7. Refresca la pestaña Modelos en Fiscalito.
--
-- IMPORTANTE
--   - DELETE y UPDATE son IRREVERSIBLES. Hacé backup antes:
--       Supabase → Settings → Database → Backups (manual).
--   - Cada bloque es un comando separado: solo el que selecciones se
--     ejecuta. Por defecto todo está en SELECT (read-only).
-- ═══════════════════════════════════════════════════════════════════

-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- 0. INVENTARIO ACTUAL  (read-only · ejecutalo siempre primero)
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
SELECT
  COUNT(*)                                   AS total_modelos,
  COUNT(DISTINCT resolution_category)        AS categorias_distintas,
  COUNT(DISTINCT procedure_type)             AS tipos_procedimiento,
  SUM(LENGTH(COALESCE(extracted_text, ''))) AS total_chars
FROM case_resolution_models
WHERE user_id = auth.uid();


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- A.  DUPLICADOS  ·  detección y borrado
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- 🔎 A.1 PREVIEW: lista los grupos de duplicados y marca cuál se conserva
WITH normalized AS (
  SELECT
    id,
    name,
    resolution_category,
    procedure_type,
    LENGTH(COALESCE(extracted_text, '')) AS len,
    -- Normalización del nombre: minúsculas, sin tildes, sin números, sin nombres propios
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        UNACCENT(LOWER(COALESCE(name, ''))),
        '\d+', '', 'g'
      ),
      '\s+', ' ', 'g'
    ) AS norm_name,
    created_at
  FROM case_resolution_models
  WHERE user_id = auth.uid()
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


-- 🔥 A.2 BORRAR DUPLICADOS  (descomenta y selecciona TODO el bloque para ejecutar)
/*
WITH normalized AS (
  SELECT
    id,
    LENGTH(COALESCE(extracted_text, '')) AS len,
    REGEXP_REPLACE(REGEXP_REPLACE(UNACCENT(LOWER(COALESCE(name, ''))), '\d+', '', 'g'), '\s+', ' ', 'g') AS norm_name,
    resolution_category,
    procedure_type,
    created_at
  FROM case_resolution_models
  WHERE user_id = auth.uid()
),
ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY resolution_category, procedure_type, TRIM(norm_name) ORDER BY len DESC, created_at DESC) AS rn
  FROM normalized
)
DELETE FROM case_resolution_models
WHERE user_id = auth.uid()
  AND id IN (SELECT id FROM ranked WHERE rn > 1)
RETURNING id, name;  -- te devuelve los borrados para confirmar
*/


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- B.  TÍTULOS  ·  quitar nombres propios y números específicos
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- 🔎 B.1 PREVIEW: muestra qué cambios se harían en los nombres
SELECT
  id,
  name AS antes,
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name,
          ',?\s*\d+\s*[A-Za-z]?\b', '', 'g'    -- "BENJI 79 G" → quita "79 G"
        ),
        '\s*,\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\s*$', '', 'g'  -- ", Catalina Pérez" al final
      ),
      '\s+[A-ZÁÉÍÓÚÑ]{4,}\s*$', '', 'g'    -- nombre TODO MAYÚSCULAS al final (ej "BENJI")
    ),
    '\s{2,}', ' ', 'g'
  )) AS despues
FROM case_resolution_models
WHERE user_id = auth.uid()
  AND (
    name ~ '\d+\s*[A-Za-z]?\b'                        -- contiene número + letra
    OR name ~ ',\s*[A-ZÁÉÍÓÚÑ][a-z]'                  -- contiene ", Nombre"
    OR name ~ '[A-ZÁÉÍÓÚÑ]{4,}\s*$'                   -- termina en MAYÚSCULAS
  )
ORDER BY name;


-- 🔥 B.2 APLICAR limpieza de títulos
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
WHERE user_id = auth.uid()
  AND (name ~ '\d+\s*[A-Za-z]?\b' OR name ~ ',\s*[A-ZÁÉÍÓÚÑ][a-z]' OR name ~ '[A-ZÁÉÍÓÚÑ]{4,}\s*$')
RETURNING id, name;
*/


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- C.  CONTENIDO  ·  reemplazar RUTs, emails, teléfonos en extracted_text
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

-- 🔎 C.1 PREVIEW: cuántas ocurrencias de PII por modelo
SELECT
  id,
  name,
  -- Cuenta RUTs (formato chileno: 12.345.678-9 / 12345678-K)
  (LENGTH(extracted_text) - LENGTH(REGEXP_REPLACE(extracted_text, '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]', '', 'g'))) / 12 AS aprox_ruts,
  -- Cuenta emails
  (SELECT COUNT(*) FROM REGEXP_MATCHES(extracted_text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'g')) AS emails,
  -- Cuenta teléfonos chilenos
  (SELECT COUNT(*) FROM REGEXP_MATCHES(extracted_text, '(?:\+?56\s*)?9\s*\d{4}\s*\d{4}', 'g')) AS telefonos,
  LENGTH(extracted_text) AS total_chars
FROM case_resolution_models
WHERE user_id = auth.uid()
  AND extracted_text IS NOT NULL
ORDER BY (
  (CASE WHEN extracted_text ~ '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]' THEN 1 ELSE 0 END) +
  (CASE WHEN extracted_text ~ '@' THEN 1 ELSE 0 END) +
  (CASE WHEN extracted_text ~ '9\s*\d{4}\s*\d{4}' THEN 1 ELSE 0 END)
) DESC, name;


-- 🔥 C.2 APLICAR limpieza de contenido (RUTs / emails / teléfonos)
/*
UPDATE case_resolution_models
SET extracted_text = REGEXP_REPLACE(
  REGEXP_REPLACE(
    REGEXP_REPLACE(extracted_text,
      '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]', '[RUT]', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[EMAIL]', 'g'),
  '(?:\+?56\s*)?9\s*\d{4}\s*\d{4}', '[TEL]', 'g'
)
WHERE user_id = auth.uid()
  AND extracted_text IS NOT NULL
  AND (
    extracted_text ~ '\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]'
    OR extracted_text ~ '@'
    OR extracted_text ~ '9\s*\d{4}\s*\d{4}'
  )
RETURNING id, name, LENGTH(extracted_text) AS chars_finales;
*/


-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- NOTAS FINALES
-- ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-- 1. SQL no puede detectar nombres propios (Benjamín, Catalina, Milena)
--    porque no entiende contexto. Para eso necesitas el script
--    `limpiador-modelos.js` que usa Claude Haiku.
--
-- 2. Si nunca instalaste la extensión `unaccent` en tu Supabase, los
--    bloques A no funcionarán. Para activarla, ejecuta UNA SOLA VEZ:
--       CREATE EXTENSION IF NOT EXISTS unaccent;
--    (Necesita rol superuser; si falla, hazlo desde
--     Database → Extensions en el dashboard.)
--
-- 3. Para hacer un BACKUP rápido de la tabla antes de borrar:
--       CREATE TABLE case_resolution_models_backup AS
--       SELECT * FROM case_resolution_models WHERE user_id = auth.uid();
--    (Después la podés borrar con DROP TABLE case_resolution_models_backup;)
-- ═══════════════════════════════════════════════════════════════════
