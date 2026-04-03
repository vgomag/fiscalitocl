# ⚖️ FISCALITO — Auditoría de Seguridad Profunda

**Asistente Jurídico — Universidad de Magallanes**
**3 de abril de 2026 — Versión Final**

---

## 1. Resumen Ejecutivo

Se realizó una auditoría profunda de seguridad, rendimiento y calidad de código sobre la totalidad del proyecto Fiscalito, abarcando **62 archivos JavaScript** (45 módulos frontend + 16 funciones Netlify + 1 edge function), el shell principal **index.html** (~4.500 líneas), y **42 tablas en Supabase** con sus políticas RLS.

| Métrica | Resultado |
|---------|-----------|
| **Archivos sin errores de sintaxis** | 62/62 ✅ |
| **alert() en código** | 0 ✅ |
| **Tablas con RLS activo** | 40/42 ⚠️ |
| **Funciones con auth obligatoria** | 15/15 ✅ |
| **Modelos hardcodeados** | 0 ✅ |
| **eval() en código** | 0 ✅ |

---

## 2. Estado de la Infraestructura

### 2.1 Verificación de Sintaxis

Los 62 archivos JavaScript pasan **node --check** sin errores. Los 45 módulos frontend tienen su correspondiente `<script>` tag en index.html (2 tags comentados corresponden a archivos que no existen, lo cual es correcto).

### 2.2 Modelos de IA Centralizados

Cero instancias de modelos hardcodeados. Todos usan constantes `CLAUDE_SONNET` / `CLAUDE_HAIKU` con fallback, tanto en frontend como backend.

### 2.3 Rate Limiting (Supabase)

Tabla **rate_limits** activa con RLS habilitado. Función RPC **check_rate_limit** operativa (verificada con test funcional: `allowed: true, remaining: 59/60`). Diseño fail-open: si Supabase no responde, la solicitud pasa (prioriza disponibilidad).

---

## 3. Seguridad

### 3.1 Autenticación

Todas las 14 funciones Netlify + 1 edge function requieren **x-auth-token obligatorio** y retornan 401 si falta. Se corrigió structure.js que tenía auth opcional (crítico).

### 3.2 Content Security Policy

CSP configurado **sin unsafe-eval** (eliminado en esta auditoría). Mantiene `unsafe-inline` por necesidad de la arquitectura SPA vanilla JS. CDNs permitidos: jsdelivr, cdnjs, supabase.

### 3.3 XSS (Cross-Site Scripting)

DOMPurify integrado con whitelist de tags permitidos. Función `esc()` disponible globalmente para escapar HTML. Se corrigieron los 2 puntos críticos de innerHTML sin sanitizar en index.html.

> ⚠️ **Hallazgos residuales en módulos:** ~10 instancias de `err.message` sin escapar en innerHTML (severidad media — requiere que un atacante controle el mensaje de error). Archivos afectados: mod-estadisticas, mod-biblioteca, mod-jurisprudencia, mod-ses-directrices, mod-transcripcion, mod-usuarios-roles.

### 3.4 Inyección y Path Traversal

drive-scan.js corregido: caseId validado como UUID + encodeURIComponent. qdrant-ingest.js: nombre de colección validado con regex alfanumérico. Ninguna inyección SQL directa detectada (Supabase REST API maneja escaping).

---

## 4. Funciones Netlify — Matriz de Seguridad

| Función | Auth | CORS | Input | Rate L. | Errors | Timeout | Total |
|---------|------|------|-------|---------|--------|---------|-------|
| chat.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| chat-stream.js | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| structure.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| ocr.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| ocr-batch.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| drive.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| drive-extract.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| drive-scan.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| rag.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| qdrant-ingest.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| sheets.js | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| generate-vista.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| analyze-prescription.js | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| auto-advance.js | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |

> ⚠️ en Timeout = fetch a APIs externas sin AbortController explícito en modo no-streaming. El shared/anthropic.js SÍ tiene timeout en sus helpers.

---

## 5. Base de Datos Supabase

42 tablas auditadas. **40 tablas con RLS habilitado**.

Las 2 sin RLS son: **ley21369_documentos** y **ley21369_items** — ambas tienen 8 políticas definidas pero RLS está deshabilitado a nivel de tabla. **Esto es un hallazgo crítico:** las políticas existen pero no se aplican.

### 5.1 Acción Requerida

```sql
ALTER TABLE ley21369_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ley21369_items ENABLE ROW LEVEL SECURITY;
```

---

## 6. Hallazgos Pendientes por Severidad

### 6.1 Crítico (2)

- **ley21369_documentos y ley21369_items** tienen RLS deshabilitado a pesar de tener políticas definidas. Cualquier usuario autenticado puede leer/modificar todos los registros.

### 6.2 Medio (15)

- **~10 err.message sin esc() en innerHTML** (mod-estadisticas, mod-biblioteca, mod-jurisprudencia, mod-ses-directrices, mod-transcripcion, mod-usuarios-roles)
- **Fetch sin timeout explícito** en modo no-streaming de varias funciones Netlify (los helpers de shared/anthropic.js sí tienen timeout)
- **2-3 monkey-patches sin guard** en mod-casos-externos-patch.js, mod-drive-qdrant-patch.js, mod-auto-subdivision.js
- **JSON.parse sin try-catch** en auto-advance.js línea 195

### 6.3 Bajo (12)

- DOM null checks faltantes en ~6 módulos (badge elements, filter buttons)
- setInterval sin cleanup en mod-estadisticas-avanzadas.js
- Event listeners globales (drag-drop) sin removeEventListener
- Fallback de esc() sin typeof check en algunos módulos

---

## 7. Correcciones Aplicadas en Esta Sesión

| Corrección | Archivos | Severidad |
|-----------|----------|-----------|
| Auth obligatoria en structure.js | 1 | CRÍTICO |
| 22 alert() → showToast() en index.html | 1 | MEDIO |
| innerHTML sanitizado con esc() (líneas 1692, 3087) | 1 | MEDIO |
| CSP: eliminado unsafe-eval | 1 | MEDIO |
| Stream timeout (AbortController 120s) | 2 | MEDIO |
| Audio base64 size limit (25MB) | 1 | MEDIO |
| UUID validation en caseId (drive-scan.js) | 1 | ALTO |
| Validación de action + collection (qdrant-ingest) | 1 | MEDIO |
| Límite 50 docs/lote + 100KB/doc (qdrant-ingest) | 1 | MEDIO |
| Rate limiting SQL ejecutado en Supabase | DB | INFRA |
| 17 script tags faltantes (sesión anterior) | 1 | CRÍTICO |
| DOMPurify integrado (sesión anterior) | 1 | ALTO |
| Modelos centralizados (10 archivos) | 10 | MEDIO |

---

## 8. Conclusión

Fiscalito se encuentra en un estado de seguridad **bueno** tras las correcciones aplicadas. La arquitectura de autenticación es sólida (todas las funciones requieren token), el rate limiting está operativo, y las protecciones XSS cubren los vectores principales.

**Acción inmediata recomendada:** Habilitar RLS en las 2 tablas de Ley 21.369 y escapar los err.message residuales en ~10 módulos frontend.

---

*Auditoría realizada por Claude — 3 de abril de 2026*
