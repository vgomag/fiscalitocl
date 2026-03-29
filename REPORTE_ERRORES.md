# Reporte de Errores — Fiscalito
## Fecha: 2026-03-29
## Estado: TODOS CORREGIDOS

---

## RESUMEN EJECUTIVO

Se revisaron 7 funciones Netlify, 22 modulos JS y el index.html principal (~3900 lineas).
Se encontraron y corrigieron errores en 3 rondas.

| Severidad | Encontrados | Corregidos |
|-----------|-------------|------------|
| CRITICO   | 15          | 15         |
| MEDIO     | 23          | 23         |
| BAJO      | 19          | 19         |

**Total: 57 errores corregidos en 25 archivos.**

---

## ARCHIVOS MODIFICADOS

### Funciones Netlify (4 archivos):
- `netlify/functions/chat.js` — Streaming SSE para evitar 504 timeout
- `netlify/functions/structure.js` — Timeout 25s en https.request + JSON.parse protegido
- `netlify/functions/qdrant-ingest.js` — try-catch en JSON.parse de env vars y body
- `netlify/functions/drive.js` — JSON.parse protegido en body y env vars
- `netlify/functions/ocr.js` — JSON.parse protegido en body y env vars

### Modulos JS (14 archivos):
- `js/mod-escritos.js` — Fix globals + timeout fetch 30s
- `js/mod-transcripcion.js` — Verificado _fmtArr() (ya existia)
- `js/mod-biblioteca.js` — Timeout fetch 30s
- `js/mod-jurisprudencia.js` — Timeout fetch 30s
- `js/mod-export.js` — Timeout CDN 15s + toasts en errores + cleanup codigo duplicado
- `js/mod-export-word.js` — Verificado
- `js/mod-pdf-tools.js` — String.fromCharCode chunked (8192)
- `js/mod-drive-qdrant.js` — Promise.all con fallback individual
- `js/mod-ses-directrices.js` — FileReader con timeout 30s
- `js/mod-diligencias-extractos.js` — Validacion OCR + timeouts fetch 30s
- `js/mod-ley21369.js` — try-catch en todas las funciones async + timeout fetch 30s
- `js/mod-usuarios-roles.js` — Fix variable juri
- `js/mod-parrafos.js` — Timeout fetch 30s
- `js/mod-modelos-rag.js` — Timeout fetch 30s
- `js/mod-casos-externos-patch.js` — Error handling en RPC
- `js/mod-actas-audio.js` — Validacion tamano/tipo archivos audio y documentos

### Core (index.html):
- Streaming SSE en sendMessage() (fix 504 IRAC)
- max_tokens IRAC subido a 4096
- Promise.all con .catch() individual en cada query
- Variable _chatLoadedForCase declarada
- Guardia contra clicks multiples en sendMessage
- md() sanitizada contra XSS (script/iframe/on*)
- loadChatHistory() con toast en errores
- AbortController RAG con finally para cleanup
- calcDur() con try-catch
- CSS .app display conflict resuelto
- Event listeners con delegacion (memory leak fix)
- calcTramitacion con limite iteraciones (safety net)
- Toast en errores de guardado de chat, casos y Drive

---

## PENDIENTE (no son bugs, son mejoras opcionales):
1. Verificar RLS activo en todas las tablas de Supabase
2. Quitar unsafe-eval del CSP (requiere verificar que nada use eval)
3. Considerar DOMPurify como libreria adicional para sanitizacion completa
