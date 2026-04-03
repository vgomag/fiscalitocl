# Auditoría Completa de Módulos — Fiscalito
## Fecha: 2026-04-03

---

## RESUMEN EJECUTIVO

Se revisaron **46 archivos** (42 módulos JS, 1 index.html principal, 3 funciones Netlify) mediante 7 agentes de revisión paralelos. Se identificaron problemas en varias categorías de severidad.

| Severidad | Total encontrados |
|-----------|-------------------|
| CRÍTICO   | 12                |
| MEDIO     | 58                |
| BAJO      | 28                |

**Total: 98 problemas identificados**

---

## PROBLEMA PRINCIPAL: DASHBOARD NO FUNCIONABA

**Causa raíz:** `mod-estadisticas.js` y `mod-estadisticas-avanzadas.js` existían en la carpeta `js/` pero **no estaban incluidos como `<script>` en `index.html`**.

**Estado:** CORREGIDO — Se agregaron ambos scripts más otros 14 módulos faltantes.

### Módulos agregados al index.html:
1. `mod-estadisticas.js` — Dashboard principal (loadStats, renderDashboard)
2. `mod-estadisticas-avanzadas.js` — Gráficos avanzados
3. `logo-data.js` — Datos del logo
4. `mod-alertas-casos.js` — Sistema de alertas
5. `mod-auto-subdivision.js` — Subdivisión automática de casos
6. `mod-biblioteca-procedimientos.js` — Biblioteca de procedimientos
7. `mod-branding.js` — Personalización de marca
8. `mod-completitud-caso.js` — Indicador de completitud
9. `mod-etapas-procesales.js` — Etapas procesales
10. `mod-importador-masivo.js` — Importación masiva de casos
11. `mod-inteligencia.js` — Análisis inteligente
12. `mod-modo-guiado.js` — Modo guiado para usuarios
13. `mod-oficios.js` — Generador de oficios
14. `mod-plantillas-custom.js` — Plantillas personalizadas
15. `mod-sync-monitor.js` — Monitor de sincronización
16. `mod-timeline-caso.js` — Línea de tiempo del caso
17. `mod-validacion-consistencia.js` — Validación de consistencia

---

## HALLAZGOS POR ÁREA

### 1. MÓDULOS DE ESTADÍSTICAS Y DASHBOARD

| # | Problema | Severidad | Archivo | Líneas |
|---|----------|-----------|---------|--------|
| 1 | `#viewStats` no existe en el DOM (usa `#viewDashboard`) | CRÍTICO | mod-estadisticas-avanzadas.js | 50 |
| 2 | Fetch sin timeout en chat IA del dashboard | MEDIO | mod-estadisticas.js | 618-632 |
| 3 | Queries Supabase sin filtro por user_id | MEDIO | mod-estadisticas.js | 128-130 |
| 4 | Validación incompleta de respuesta API | MEDIO | mod-estadisticas.js | 641-642 |
| 5 | Procesamiento CSV sin validar estructura | MEDIO | mod-estadisticas.js | 659-666 |
| 6 | Retry loop sin backoff exponencial | BAJO | mod-estadisticas-avanzadas.js | 256-259 |
| 7 | Sin feedback si Chart.js no carga | BAJO | Ambos | — |

### 2. MÓDULOS DE DOCUMENTOS

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | `transcripcion` global no validada antes de usar | MEDIO | mod-export-word.js |
| 2 | `_fmtArr()` llamada pero no definida en el módulo | MEDIO | mod-export-word.js |
| 3 | Sin validación de tamaño de archivo antes de procesar | MEDIO | mod-export.js |
| 4 | Race condition si docx carga async | MEDIO | mod-export.js |
| 5 | Estado global mutable en mod-pdf-tools | BAJO | mod-pdf-tools.js |
| 6 | `session.user.id` sin null check en oficios | MEDIO | mod-oficios.js |
| 7 | Fetch sin timeout en API de Sheets | MEDIO | mod-oficios.js |
| 8 | `alert()` usado en vez de `showToast()` | BAJO | mod-plantillas-custom.js |

### 3. MÓDULOS DE BIBLIOTECA Y RAG

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | `callDrive()`, `authFetch()`, `dqDelay()` no definidas | CRÍTICO | mod-drive-qdrant-patch.js |
| 2 | `#ragMain` referenciado pero no existe en DOM | CRÍTICO | mod-modelos-rag.js |
| 3 | Fetch sin verificar `r.ok` antes de `.json()` | CRÍTICO | mod-drive-rag.js |
| 4 | Queries Supabase sin verificar `.error` | CRÍTICO | mod-drive-rag.js |
| 5 | Promise.all sin catch individual | MEDIO | mod-modelos-rag.js |
| 6 | `md()` usada sin verificar existencia | MEDIO | mod-modelos-rag.js |
| 7 | openBiblioteca() puede no existir al cargar parrafos | MEDIO | mod-parrafos.js |

### 4. MÓDULOS DE CASOS Y SEGURIDAD

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | XSS: ID sin escapar en onclick handler | CRÍTICO | mod-alertas-casos.js |
| 2 | `sb` vs `supabaseClient` inconsistente entre módulos | CRÍTICO | Múltiples |
| 3 | `session` usada sin guardia en alertas | CRÍTICO | mod-alertas-casos.js |
| 4 | Race condition con `allCases` sin sincronización | MEDIO | mod-alertas-casos.js |
| 5 | Promise.all sin check de `.error` individual | MEDIO | mod-usuarios-roles.js |
| 6 | Monkey-patching sin protección contra doble carga | MEDIO | mod-completitud-caso.js |
| 7 | Regex potencialmente vulnerable a ReDoS | BAJO | mod-seguridad.js |
| 8 | Retorna texto cifrado como fallback | BAJO | mod-seguridad.js |

### 5. MÓDULOS LEGALES Y TRANSCRIPCIÓN

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | `authFetch` sin verificar existencia | CRÍTICO | mod-ses-directrices.js |
| 2 | Stream parsing sin try-catch | CRÍTICO | mod-transcripcion.js |
| 3 | `showToast()` usado 80+ veces sin verificar | MEDIO | mod-transcripcion.js |
| 4 | `CHAT_ENDPOINT` asumido sin validación | MEDIO | mod-ley21369.js |
| 5 | XSS potencial en onclick con interpolación | MEDIO | mod-ses-directrices.js |
| 6 | MediaRecorder error handling incompleto | MEDIO | mod-transcripcion.js |
| 7 | `updateCatCounts` referenciada sin typeof check | MEDIO | mod-etapas-procesales.js |
| 8 | Lógica invertida en verificación de response | MEDIO | mod-diligencias-extractos.js |

### 6. CONEXIONES SIDEBAR ↔ VISTAS ↔ FUNCIONES

| # | Problema | Severidad | Detalle |
|---|----------|-----------|---------|
| 1 | `openAnalisisCasosExternos()` NO EXISTE | CRÍTICO | Sidebar línea 662 llama función inexistente |
| 2 | `mod-casos-externos.js` comentado (no existe) | — | Solo existe el patch file |

**Todas las demás conexiones están correctas:**
- openDashboard() → viewDashboard
- openTabla() → viewTabla
- openCuestionarios() → dinámico
- pickFnAndChat('F11') → panel funciones
- openLey21369() → dinámico
- openBiblioteca() → viewBiblioteca
- openAnalisisJuris() → dinámico
- openEscritosJudiciales() → viewEscritosJudiciales

**Orden de carga de scripts: CORRECTO**
- Chart.js antes de mod-estadisticas.js
- pdf-lib antes de mod-pdf-tools.js
- jsPDF antes de mod-manual-operativo.js
- docx antes de mod-export-word.js
- drive-client.js antes de todos los módulos

### 7. FUNCIONES NETLIFY

| # | Problema | Severidad | Archivo |
|---|----------|-----------|---------|
| 1 | Headers CORS inconsistentes entre funciones | CRÍTICO | Múltiples |
| 2 | Sin validación de tamaño de input | CRÍTICO | structure.js, ocr.js |
| 3 | Sin autenticación en drive.js | MEDIO | drive.js |
| 4 | Error messages filtran detalles de API | MEDIO | ocr.js, generate-vista.js |
| 5 | Sin rate limiting | MEDIO | Todos |
| 6 | Timeout de 26s puede no ser suficiente para OCR doble | MEDIO | netlify.toml |
| 7 | Modelos Claude hardcodeados | BAJO | chat.js, ocr.js |
| 8 | Formato de error inconsistente entre funciones | BAJO | Todos |

---

## ACCIONES TOMADAS

1. **CORREGIDO:** Agregados 17 scripts faltantes en index.html (incluyendo mod-estadisticas.js para el dashboard)

## ACCIONES PENDIENTES (Prioridad Alta)

1. **Crear función `openAnalisisCasosExternos()`** o eliminar botón del sidebar (línea 662)
2. **Corregir `#viewStats`** → cambiar a `#viewDashboard` en mod-estadisticas-avanzadas.js línea 50
3. **Agregar null checks** para `session`, `sb`, `currentCase` en módulos que los usan directamente
4. **Agregar timeout/AbortController** a fetches sin timeout
5. **Estandarizar CORS** en funciones Netlify
6. **Agregar validación de input** en funciones serverless

## ACCIONES PENDIENTES (Prioridad Media)

7. Agregar `.error` check en queries Supabase que no lo tienen
8. Proteger monkey-patches contra doble carga
9. Estandarizar `sb` vs `supabaseClient` en todos los módulos
10. Implementar rate limiting en funciones Netlify
11. Sanitizar error messages que van al cliente

## ACCIONES PENDIENTES (Prioridad Baja)

12. Reemplazar `alert()` por `showToast()` en mod-plantillas-custom.js
13. Centralizar nombres de modelo Claude en variables de entorno
14. Agregar documentación JSDoc a funciones serverless
15. Considerar DOMPurify para sanitización completa de HTML
