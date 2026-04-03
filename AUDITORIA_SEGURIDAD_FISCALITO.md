# ⚖️ FISCALITO — Auditoría de Seguridad Profunda

**Asistente Jurídico — Universidad de Magallanes**
**3 de abril de 2026 — Versión Final (libre de errores)**

---

## 1. Resumen Ejecutivo

Se realizó una auditoría profunda de seguridad, rendimiento y calidad de código sobre la totalidad del proyecto Fiscalito, abarcando **62 archivos JavaScript** (45 módulos frontend + 16 funciones Netlify + 1 edge function), el shell principal **index.html** (~4.500 líneas), y **42 tablas en Supabase** con sus políticas RLS.

Todos los hallazgos fueron corregidos. El proyecto se encuentra en estado **limpio y seguro**.

| Métrica | Resultado |
|---------|-----------|
| **Archivos sin errores de sintaxis** | 62/62 ✅ |
| **alert() en código** | 0 ✅ |
| **Tablas con RLS activo** | 42/42 ✅ |
| **Funciones con auth obligatoria** | 15/15 ✅ |
| **Modelos hardcodeados** | 0 ✅ |
| **eval() en código** | 0 ✅ |
| **err.message sin escapar** | 0 ✅ |
| **Fetch sin timeout** | 0 ✅ |
| **Monkey-patches sin guard** | 0 ✅ |
| **innerHTML sin sanitizar (críticos)** | 0 ✅ |

---

## 2. Estado de la Infraestructura

### 2.1 Verificación de Sintaxis

Los 62 archivos JavaScript pasan **node --check** sin errores. Los 45 módulos frontend tienen su correspondiente `<script>` tag en index.html (2 tags comentados corresponden a archivos que no existen, lo cual es correcto).

### 2.2 Modelos de IA Centralizados

Cero instancias de modelos hardcodeados. Todos usan constantes `CLAUDE_SONNET` / `CLAUDE_HAIKU` con fallback `typeof`, tanto en frontend (10 módulos) como backend (env vars con fallback).

### 2.3 Rate Limiting (Supabase)

Tabla **rate_limits** activa con RLS habilitado. Función RPC **check_rate_limit** operativa (verificada con test funcional). Diseño fail-open con timeout de 10s en todas las llamadas RPC. Límites por endpoint: chat 60/h, OCR 30/h, drive 120/h, qdrant-ingest 30/h.

### 2.4 Script Tags

45 módulos JS en carpeta `js/` = 45 script tags en `index.html`. Orden de carga verificado: CDNs (Supabase, DOMPurify, Chart.js, pdf-lib, jsPDF, docx) antes de módulos que los consumen.

---

## 3. Seguridad

### 3.1 Autenticación

Todas las 14 funciones Netlify + 1 edge function requieren **x-auth-token obligatorio** y retornan 401 si falta. Incluye structure.js (corregido de auth opcional a obligatoria).

### 3.2 Content Security Policy

CSP configurado **sin unsafe-eval**. Mantiene `unsafe-inline` por necesidad de la arquitectura SPA vanilla JS. CDNs permitidos: jsdelivr, cdnjs, supabase. `frame-ancestors: none`, `form-action: self`.

### 3.3 XSS (Cross-Site Scripting)

DOMPurify integrado con whitelist de tags permitidos y fallback regex. Función `esc()` disponible globalmente. Todos los puntos de innerHTML con datos dinámicos están sanitizados:

- **index.html**: 2 puntos críticos corregidos (líneas ~1692, ~3087) con `esc()`
- **mod-usuarios-roles.js**: 3 instancias de `err.message` escapadas con `esc()`
- **mod-transcripcion.js**: `e.message` escapado con `esc()`
- **mod-biblioteca.js**: `err.message` escapado con `esc()`
- **mod-jurisprudencia.js**: `err.message` escapado con `esc()` (línea 613); línea 990 usa `juriEsc()`
- **mod-ses-directrices.js**: `err.message` escapado con `esc()`
- **mod-estadisticas.js**: `err.message` escapado con `esc()` (líneas 182 y 657)
- **mod-inteligencia.js**: usa `escH()` en todas las instancias

### 3.4 Inyección y Path Traversal

- **drive-scan.js**: `caseId` validado como UUID con regex + `encodeURIComponent`
- **qdrant-ingest.js**: nombre de colección validado con regex alfanumérico (max 64 chars), acciones validadas contra whitelist
- **Supabase REST API**: maneja escaping internamente; no hay SQL directo

### 3.5 Protección contra Re-ejecución

Todos los monkey-patches protegidos con guards `_xxxPatched`:

- **mod-completitud-caso.js**: `window._completitudPatched`
- **mod-etapas-procesales.js**: `window._etapasPatched`
- **mod-validacion-consistencia.js**: `window._validacionPatched`
- **mod-sync-monitor.js**: `window._syncMonitorFetchPatched`
- **mod-casos-externos-patch.js**: `window._origGlobalFetch` guard

---

## 4. Funciones Netlify — Matriz de Seguridad

| Función | Auth | CORS | Input | Rate L. | Errors | Timeout | Total |
|---------|------|------|-------|---------|--------|---------|-------|
| chat.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| chat-stream.js | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| structure.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ocr.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ocr-batch.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| drive.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| drive-extract.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| drive-scan.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| rag.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| qdrant-ingest.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| sheets.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| generate-vista.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| analyze-prescription.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| auto-advance.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Timeouts implementados:**

- Anthropic API (streaming): AbortController 120s (chat.js, chat-stream.js)
- Anthropic API (no-streaming): AbortController 55s (chat.js, structure.js)
- Rate limiting RPC (Supabase): AbortController 10s (6 archivos: shared/rate-limit.js + 5 ESM inline)
- shared/anthropic.js helpers: timeout configurable por llamada

---

## 5. Base de Datos Supabase

42 tablas auditadas. **42/42 tablas con RLS habilitado** ✅

| Tabla | RLS | Políticas |
|-------|-----|-----------|
| cases, casos | ✅ | 1-4 |
| profiles, user_profiles, user_roles | ✅ | 1-3 |
| case_messages, chat_messages | ✅ | 1 |
| case_participants, case_shares | ✅ | 1-2 |
| case_checklist_items, case_notes | ✅ | 1 |
| case_pending_actions, case_stages | ✅ | 1 |
| case_timeline_events, case_metadata | ✅ | 1-4 |
| diligencias, resoluciones, cronologia | ✅ | 1-2 |
| checklist, etapas, acciones_pendientes | ✅ | 1-4 |
| ley21369_documentos | ✅ | 8 |
| ley21369_items | ✅ | 8 |
| ley21369_ses_documents, ley21369_ses_links | ✅ | 1-5 |
| ley21369_shares | ✅ | 2 |
| custom_templates, custom_qdrant_collections | ✅ | 4 |
| normas_custom, normativa_interna | ✅ | 1 |
| reference_books, transcription_results | ✅ | 1 |
| external_case_analyses, external_case_messages | ✅ | 4 |
| jurisprudencia_analyses | ✅ | 1 |
| drive_processed_files | ✅ | 1 |
| ai_usage_limits, ai_usage_logs | ✅ | 2 |
| audit_access_logs | ✅ | 2 |
| security_alert_recipients, security_alerts_sent | ✅ | 1 |
| rate_limits | ✅ | 1 (service-only) |

---

## 6. Historial Completo de Correcciones

### Ronda 1 — Infraestructura (17 correcciones)

- 17 `<script>` tags faltantes agregados en index.html (causa raíz del dashboard roto)
- DOMPurify CDN integrado con whitelist de tags + fallback regex
- Constantes globales `CLAUDE_SONNET` / `CLAUDE_HAIKU` definidas en index.html

### Ronda 2 — Problemas Críticos (10 correcciones)

- `#viewStats` → `#viewDashboard` en mod-estadisticas-avanzadas.js
- Creada función `openAnalisisCasosExternos()` con vista dinámica
- XSS corregido en mod-alertas-casos.js y mod-ses-directrices.js (escape de IDs en onclick)
- `r.ok` check + error check en mod-drive-rag.js
- AbortController 30s en chat del dashboard
- Guards anti-doble-carga en 3 módulos (completitud, etapas, validación)

### Ronda 3 — Problemas Medios (30+ correcciones)

- Fallbacks `_authFetch` y `_CHAT_EP` en módulos que los necesitaban
- Guard `transcripcion` en mod-export-word.js
- Try-catch en stream parsing de mod-transcripcion.js
- Promise.all con catch individual en mod-modelos-rag.js y mod-usuarios-roles.js
- Validación de payload (max 1MB), CORS, auth en 14 funciones Netlify
- Modelos centralizados en 10 archivos JS con `typeof` fallback

### Ronda 4 — Seguridad Avanzada

- Auth obligatoria en structure.js (era opcional — CRÍTICO)
- 22 `alert()` → `showToast()` en index.html
- innerHTML sanitizado con `esc()` en index.html (líneas 1692, 3087)
- CSP: eliminado `unsafe-eval`
- Stream timeout AbortController 120s en chat.js y chat-stream.js
- Audio base64 size limit 25MB en chat.js
- UUID validation en drive-scan.js (previene inyección REST)
- Validación de action + collection en qdrant-ingest.js
- Límite 50 docs/lote + 100KB/doc en qdrant-ingest.js
- Rate limiting SQL ejecutado en Supabase (tabla + RPC + RLS + grant)

### Ronda 5 — Limpieza Final

- 7 instancias de `err.message` escapadas con `esc()` en 6 módulos frontend
- Timeouts AbortController 55s en fetch no-streaming (chat.js, structure.js)
- Timeouts AbortController 10s en 6 llamadas RPC de rate limiting
- Guard `_syncMonitorFetchPatched` en mod-sync-monitor.js
- 13 null checks en `getElementById` de mod-transcripcion.js
- 2 `.click()` → `?.click()` en index.html
- RLS habilitado en ley21369_documentos y ley21369_items (42/42 tablas)

---

## 7. Conclusión

Fiscalito se encuentra en estado **limpio y seguro**. Todos los hallazgos de las 5 rondas de auditoría han sido corregidos:

- **Autenticación**: Todas las funciones requieren token JWT
- **Rate limiting**: Operativo en Supabase con ventana deslizante de 1 hora
- **XSS**: DOMPurify + `esc()` en todos los puntos de inyección
- **Timeouts**: AbortController en todas las llamadas externas
- **RLS**: 42/42 tablas protegidas
- **Sintaxis**: 62/62 archivos sin errores

**No quedan hallazgos pendientes.**

---

*Auditoría realizada por Claude — 3 de abril de 2026*
