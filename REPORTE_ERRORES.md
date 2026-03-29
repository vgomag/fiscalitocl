# Reporte de Errores — Fiscalito
## Fecha: 2026-03-29

---

## RESUMEN EJECUTIVO

Se revisaron 7 funciones Netlify, 22 modulos JS y el index.html principal (~3900 lineas).

| Severidad | Cantidad |
|-----------|----------|
| CRITICO   | 15       |
| MEDIO     | 23       |
| BAJO      | 19       |

---

## 1. FUNCIONES NETLIFY

### chat.js
- **[MEDIO]** Sin validacion de respuesta API: linea ~70 no verifica `res.ok` antes de llamar `.json()` en modo no-streaming. Si Anthropic devuelve error, puede fallar silenciosamente.

### structure.js
- **[CRITICO]** `https.request()` sin timeout (linea ~16): puede colgar indefinidamente hasta que Netlify mate la funcion a los 26s. Mismo problema que el IRAC — deberia usar streaming o timeout explicito.
- **[MEDIO]** `JSON.parse(event.body)` sin try-catch.

### ocr.js
- **[MEDIO]** `JSON.parse(event.body || '{}')` sin try-catch en lineas ~74 y ~130.
- **[MEDIO]** Segunda llamada a Claude (summarize) sin manejo de errores; si falla, `sum` queda vacio.

### drive.js
- **[CRITICO]** `driveDownload()` (linea ~54) acumula datos como string (`let d = ''`) pero se usa para archivos binarios. Deberia usar Buffer como hace `driveDownloadBinary()`.
- **[MEDIO]** `JSON.parse(event.body)` sin try-catch.

### qdrant-ingest.js
- **[CRITICO]** `JSON.parse(Netlify.env.get('GOOGLE_SERVICE_ACCOUNT_KEY'))` (lineas ~153, ~169) sin try-catch ni verificacion de null. Si la variable no existe, crash inmediato.
- **[MEDIO]** `req.json()` sin manejo de error para JSON malformado.

### rag.js — LIMPIO
### drive-extract.js — LIMPIO

---

## 2. MODULOS JAVASCRIPT (js/)

### mod-transcripcion.js
- **[CRITICO]** Funcion `_fmtArr()` llamada en linea ~549 pero no esta definida en el modulo. Causa ReferenceError al intentar formatear arrays.

### mod-export.js
- **[CRITICO]** Carga de CDN (jsPDF, etc.) sin timeout. Si el CDN no responde, la UI se congela indefinidamente esperando.

### mod-pdf-tools.js
- **[CRITICO]** `String.fromCharCode.apply()` para archivos grandes causa stack overflow (limite de argumentos del engine JS). Deberia usar chunks.
- **[CRITICO]** Template literals con onclick inline pueden romper el HTML si el contenido tiene comillas.

### mod-usuarios-roles.js
- **[CRITICO]** Intenta modificar variable `juri` que no esta definida en el scope.

### mod-drive-qdrant.js
- **[CRITICO]** `Promise.all()` falla completamente si alguna tabla de Supabase no existe, sin fallback individual.

### mod-escritos.js
- **[CRITICO]** `exportEscritosPDF()` referencia variables globales no definidas.

### mod-ses-directrices.js
- **[CRITICO]** FileReader Promise sin timeout — si el archivo no carga, la UI queda colgada para siempre.

### mod-diligencias-extractos.js
- **[CRITICO]** Respuesta del endpoint OCR no se valida antes de usarla.

### mod-ley21369.js
- **[CRITICO]** `loadSesDocs()` no maneja error si la tabla no existe en Supabase.

### Errores MEDIO en modulos (resumen):
- Multiples `fetch()` sin timeout ni manejo de error
- Validacion null/undefined faltante antes de acceder a elementos DOM
- Promise rejections no manejadas
- Template literals directamente en atributos HTML (riesgo XSS)
- Llamadas RPC a Supabase con fallo silencioso

---

## 3. INDEX.HTML (Core)

### Errores CRITICOS:

1. **Race condition en sendMessage() — Promise.all sin fallback (linea ~2495)**
   Si CUALQUIER query a Supabase falla, todo Promise.all se rechaza y sendMessage() falla silenciosamente. Solucion: agregar `.catch(e=>({data:null,error:e}))` a cada promesa.

2. **Variable `_chatLoadedForCase` no declarada (linea ~2390)**
   Se usa `if(_chatLoadedForCase===caseId)` pero nunca se declara. Necesita `let _chatLoadedForCase=null;` en scope global.

3. **Funcion md() insegura (linea ~3877)**
   Parsea markdown con regex y genera HTML crudo sin sanitizacion. Si el contenido de chat incluye patrones markdown maliciosos, se renderiza como HTML. Riesgo de XSS. Solucion: usar DOMPurify o sanitizar output.

4. **driveImportData() — JSON de IA sin validacion (linea ~3633)**
   Parsea respuesta JSON de la IA, pero si falla, `extracted` queda como `{}` y el formulario aparece vacio sin feedback al usuario.

### Errores MEDIO:

5. **Sin guardia contra multiples llamadas a sendMessage() (linea ~2444)**
   El usuario puede clickear "Enviar" varias veces rapido antes de que se desactive el boton. No hay `if(isLoading) return;` al inicio.

6. **Supabase keys expuestas en frontend (linea ~1028-1038)**
   Las claves de Supabase estan hardcodeadas. Estas son las claves "anon/publishable" (normal en SPA con RLS), pero conviene verificar que RLS este activo en todas las tablas.

7. **loadChatHistory() fallo silencioso (linea ~2364)**
   Error de Supabase solo se loguea en console, sin feedback al usuario.

8. **CSP incluye unsafe-eval (linea ~4)**
   Content Security Policy permite `eval()`, lo que debilita la seguridad.

9. **AbortController cleanup incompleto (linea ~2708)**
   Timeout de RAG de 6s puede dejar requests colgando si el cleanup no se ejecuta en un bloque finally.

10. **calcDur() puede lanzar excepcion (linea ~1490)**
    Parsing de fechas complejo sin try-catch al renderizar header del caso.

---

## 4. RECOMENDACIONES PRIORITARIAS

### Arreglar ahora (impacto en produccion):
1. Agregar `.catch()` individual a cada promesa en Promise.all de sendMessage()
2. Declarar `let _chatLoadedForCase=null;`
3. Agregar guardia `if(isLoading) return;` en sendMessage()
4. Fix `_fmtArr()` en mod-transcripcion.js
5. Agregar timeout a carga de CDN en mod-export.js
6. Fix `driveDownload()` en drive.js para usar Buffer

### Arreglar pronto (estabilidad):
7. try-catch en todos los JSON.parse de funciones Netlify
8. Timeout/streaming en structure.js
9. Sanitizar output de md() con DOMPurify
10. Fix String.fromCharCode overflow en mod-pdf-tools.js
11. Error handling en Promise.all de mod-drive-qdrant.js
12. Validar JSON de IA en driveImportData()

### Mejorar despues (calidad):
13. Verificar RLS en todas las tablas de Supabase
14. Quitar unsafe-eval del CSP
15. Agregar feedback visual (toast) en errores silenciosos
16. Agregar timeout a FileReader en mod-ses-directrices.js
