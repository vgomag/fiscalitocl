#!/bin/bash
# Script para generar hashes SRI y actualizar index.html
# Ejecutar desde la raíz del proyecto: bash generate-sri.sh

echo "Generando hashes SRI para scripts CDN..."

declare -a URLS=(
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
  "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js"
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
  "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
  "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"
  "https://cdn.jsdelivr.net/npm/docx@9.1.0/build/index.umd.min.js"
)

declare -a NAMES=(
  "supabase-js"
  "pdf.js"
  "mammoth"
  "xlsx"
  "dompurify"
  "Chart.js"
  "pdf-lib"
  "jspdf"
  "docx"
)

# También fijamos la versión de Supabase (de @2 a @2.49.1)
ORIGINAL_SUPABASE="@supabase/supabase-js@2/dist"
PINNED_SUPABASE="@supabase/supabase-js@2.49.1/dist"

for i in "${!URLS[@]}"; do
  url="${URLS[$i]}"
  name="${NAMES[$i]}"
  hash=$(curl -sL "$url" | openssl dgst -sha384 -binary | openssl base64 -A)
  if [ -z "$hash" ]; then
    echo "ERROR: No se pudo descargar $name ($url)"
    continue
  fi
  sri="sha384-$hash"
  echo "$name: $sri"

  # Extraer solo el nombre del archivo de la URL
  filename=$(basename "$url")

  # Buscar y reemplazar en index.html
  # Primero el caso de supabase que necesita pinning de versión
  if [ "$name" = "supabase-js" ]; then
    sed -i.bak "s|$ORIGINAL_SUPABASE|$PINNED_SUPABASE|g" index.html
  fi

  # Agregar integrity y crossorigin al script tag
  escaped_url=$(echo "$url" | sed 's|[&/\]|\\&|g')
  sed -i.bak "s|src=\"${escaped_url}\"></script>|src=\"${escaped_url}\" integrity=\"${sri}\" crossorigin=\"anonymous\"></script>|g" index.html

done

# Limpiar backups
rm -f index.html.bak

echo ""
echo "¡Listo! Se actualizó index.html con los hashes SRI."
echo "Nota: Se fijó la versión de Supabase de @2 a @2.49.1"
echo "Verifica los cambios con: git diff index.html"
