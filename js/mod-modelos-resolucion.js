/* =========================================================
   MOD-MODELOS-RESOLUCION.JS — Biblioteca de Modelos por Caso
   v1.0 · 2026-05-03 · Fiscalito
   =========================================================
   Replica de la pestaña "Modelos" del módulo
   "Modelos de Resolución" (spec Fiscalito v1).

   FLUJO:
     1. Usuario sube .docx / .doc / .txt / .md al caso.
     2. Texto extraído client-side con mammoth (no se sube binario).
     3. Auto-clasificación heurística por nombre (26 categorías).
     4. INSERT con is_global = TRUE → el agente lo ve en TODOS
        los casos del usuario.
     5. Reclasificación opcional con IA (Claude Haiku) para los
        que quedaron en "otro" (botón "Clasificar (N)").
     6. Inyección al system prompt vía buildCaseModelsBlock(caseId)
        usado por generadores (vista fiscal, chat, oficios).

   PRINCIPIOS:
     · Reuso global por defecto (is_global=TRUE).
     · Extracción client-side; sólo se persiste el texto.
     · Clasificación en dos capas: heurística + IA bajo demanda.
     · Replicación fiel del estilo institucional 31-A.
     · Presupuesto de contexto: 30 000 chars / 3 000 por modelo.
   ========================================================= */

(function () {
  'use strict';

  /* ── CATEGORÍAS CONTROLADAS (deben coincidir con el CHECK del SQL) ── */
  const CATEGORIES = {
    citacion:                     'Citación',
    notificacion:                 'Notificación',
    acta_declaracion:             'Acta de Declaración',
    acta_ratificacion:            'Acta de Ratificación',
    acta_entrevista:              'Acta de Entrevista',
    acta_notificacion:            'Acta de Notificación',
    resolucion_acepta_cargo:      'Resolución Acepta Cargo',
    resolucion_cita_declarar:     'Resolución Cita a Declarar',
    resolucion_medida_resguardo:  'Medida de Resguardo',
    resolucion_general:           'Resolución General',
    oficio:                       'Oficio',
    cuestionario:                 'Cuestionario',
    constancia:                   'Constancia',
    consentimiento:               'Consentimiento',
    certificacion:                'Certificación',
    acuerdo_alejamiento:          'Acuerdo de Alejamiento',
    formulacion_cargos:           'Formulación de Cargos',
    descargos:                    'Descargos',
    provee_descargos:             'Provee Descargos',
    informe:                      'Informe',
    vista_fiscal:                 'Vista Fiscal',
    incorpora_antecedentes:       'Incorpora Antecedentes',
    denuncia:                     'Denuncia',
    memo:                         'Memo',
    otro:                         'Otro',
  };

  const PROCEDURE_TYPES = {
    investigacion_sumaria:    'Investigación Sumaria',
    sumario_administrativo:   'Sumario Administrativo',
    ambos:                    'Ambos',
  };

  const ALLOWED_EXT = ['docx', 'doc', 'txt', 'md'];
  const MAX_BYTES = 10 * 1024 * 1024;     // 10 MB
  const MIN_TEXT_LEN = 50;
  const MAX_GLOBAL_LIMIT = 50;             // tope cross-case para inyección
  const MAX_INJECT_TOTAL_CHARS = 30000;    // presupuesto duro total
  const MAX_INJECT_PER_MODEL = 3000;       // tope por modelo

  /* ── ESTADO ── */
  const state = {
    caseId: null,
    container: null,
    models: [],            // modelos del caso actual
    globalModels: [],      // modelos globales del usuario (otros casos)
    loading: false,
    filterCategory: 'all', // categoría de filtro
    expandedId: null,      // id de modelo expandido (preview)
  };

  /* ────────────────────────────────────────────────────────
     HELPERS HTML / DOM
     ──────────────────────────────────────────────────────── */
  function safeEsc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
    else console.log('[toast]', msg);
  }

  /* ── Heurística por nombre (replica exacta del backend) ── */
  function guessCategory(name) {
    const n = String(name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    if (/citacion|cita a/.test(n)) return 'citacion';
    if (/acta de ratificacion|ratificacion/.test(n)) return 'acta_ratificacion';
    if (/acta de declaracion|declaracion/.test(n)) return 'acta_declaracion';
    if (/acta de entrevista/.test(n)) return 'acta_entrevista';
    if (/acta de notificacion/.test(n)) return 'acta_notificacion';
    if (/notificacion/.test(n)) return 'notificacion';
    if (/acepta cargo|actuaria/.test(n)) return 'resolucion_acepta_cargo';
    if (/resolucion.*cita/.test(n)) return 'resolucion_cita_declarar';
    if (/medida.*resguardo|medida.*proteccion/.test(n)) return 'resolucion_medida_resguardo';
    if (/incorpora/.test(n)) return 'incorpora_antecedentes';
    if (/resolucion|res\.ex/.test(n)) return 'resolucion_general';
    if (/oficio/.test(n)) return 'oficio';
    if (/cuestionario/.test(n)) return 'cuestionario';
    if (/constancia/.test(n)) return 'constancia';
    if (/consentimiento/.test(n)) return 'consentimiento';
    if (/certificacion|certificado/.test(n)) return 'certificacion';
    if (/acuerdo.*alejamiento/.test(n)) return 'acuerdo_alejamiento';
    if (/formulacion.*cargos|pliego/.test(n)) return 'formulacion_cargos';
    if (/provee.*descargo/.test(n)) return 'provee_descargos';
    if (/descargo/.test(n)) return 'descargos';
    if (/informe/.test(n)) return 'informe';
    if (/vista.*fiscal/.test(n)) return 'vista_fiscal';
    if (/denuncia/.test(n)) return 'denuncia';
    if (/memo/.test(n)) return 'memo';
    return 'otro';
  }
  function guessProcedure(name) {
    return /sumario/i.test(String(name || ''))
      ? 'sumario_administrativo'
      : 'investigacion_sumaria';
  }

  /* ── Extracción de texto client-side ── */
  async function extractText(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'txt' || ext === 'md') {
      return await file.text();
    }
    if (ext === 'docx' || ext === 'doc') {
      if (typeof window.mammoth === 'undefined' || !window.mammoth.extractRawText) {
        throw new Error('mammoth no está disponible (revisa que index.html lo cargue).');
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer });
      return (result && result.value) || '';
    }
    throw new Error(`Extensión .${ext} no soportada`);
  }

  /* ────────────────────────────────────────────────────────
     CARGA DESDE SUPABASE
     ──────────────────────────────────────────────────────── */
  async function loadModels(caseId) {
    if (!window.sb || !window.session) return { models: [], globalModels: [] };
    const uid = window.session.user.id;

    // Modelos del caso actual
    const localQ = window.sb
      .from('case_resolution_models')
      .select('id,name,file_name,resolution_category,procedure_type,is_global,extracted_text,description,created_at,case_id')
      .eq('user_id', uid)
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    // Modelos globales del usuario (otros casos), tope MAX_GLOBAL_LIMIT
    const globalQ = window.sb
      .from('case_resolution_models')
      .select('id,name,file_name,resolution_category,procedure_type,is_global,extracted_text,description,created_at,case_id')
      .eq('user_id', uid)
      .eq('is_global', true)
      .neq('case_id', caseId)
      .order('created_at', { ascending: false })
      .limit(MAX_GLOBAL_LIMIT);

    const [{ data: local, error: e1 }, { data: globals, error: e2 }] = await Promise.all([localQ, globalQ]);
    if (e1) console.warn('[modelos-resolucion] load local:', e1);
    if (e2) console.warn('[modelos-resolucion] load global:', e2);
    return {
      models: local || [],
      globalModels: globals || [],
    };
  }

  /* ────────────────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────────────────── */
  async function render(container, caseId) {
    if (!container || !caseId) return;
    state.container = container;
    state.caseId = caseId;
    state.loading = true;
    container.innerHTML = '<div class="loading">Cargando modelos…</div>';

    try {
      const { models, globalModels } = await loadModels(caseId);
      state.models = models;
      state.globalModels = globalModels;
      state.loading = false;
      renderUI();
    } catch (err) {
      console.error('[modelos-resolucion] render error:', err);
      container.innerHTML = `<div class="empty-state">⚠ Error cargando modelos: ${safeEsc(err.message)}</div>`;
    }
  }

  function totalChars(arr) {
    return (arr || []).reduce((acc, m) => acc + (m.extracted_text ? m.extracted_text.length : 0), 0);
  }
  function countOtros(arr) {
    return (arr || []).filter(m => m.resolution_category === 'otro').length;
  }
  function uniqueCategories(arr) {
    const set = new Set();
    (arr || []).forEach(m => set.add(m.resolution_category || 'otro'));
    return [...set];
  }

  function renderUI() {
    const all = state.models;
    const otros = countOtros(all);
    const cats = uniqueCategories(all);

    // Filtro por categoría
    const filtered = state.filterCategory === 'all'
      ? all
      : all.filter(m => (m.resolution_category || 'otro') === state.filterCategory);

    const filterHTML = cats.length > 1 ? `
      <select class="case-models-filter"
              onchange="window.ModelosResolucion._setFilter(this.value)"
              style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:var(--radius);font-size:11px;font-family:var(--font-body);outline:none;">
        <option value="all" ${state.filterCategory === 'all' ? 'selected' : ''}>Todas las categorías (${all.length})</option>
        ${cats.map(c => `<option value="${safeEsc(c)}" ${state.filterCategory === c ? 'selected' : ''}>${safeEsc(CATEGORIES[c] || c)}</option>`).join('')}
      </select>
    ` : '';

    state.container.innerHTML = `
      <div class="case-models-wrap">
        <!-- Header con métricas + acciones -->
        <div class="case-models-header" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-size:13px;font-weight:600;color:var(--text)">🧩 Modelos de Resolución del caso</div>
            <div style="font-size:11px;color:var(--text-muted)">
              <strong>${all.length}</strong> modelo${all.length === 1 ? '' : 's'} ·
              ${all.filter(m => m.is_global).length} compartido${all.filter(m => m.is_global).length === 1 ? '' : 's'} entre casos ·
              ${totalChars(all).toLocaleString('es-CL')} chars
              ${state.globalModels.length ? ` · ${state.globalModels.length} de otros casos disponibles` : ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${filterHTML}
            ${otros > 0 ? `<button class="btn-sm" onclick="window.ModelosResolucion._classifyAI()" title="Reclasifica con IA los ${otros} modelo(s) en categoría 'otro'">🤖 Clasificar (${otros})</button>` : ''}
            <label class="btn-save" style="cursor:pointer;display:inline-block">
              📤 Subir modelos (.docx, .txt)
              <input type="file" id="caseModelsFileInput" multiple accept=".docx,.doc,.txt,.md" style="display:none" onchange="window.ModelosResolucion._handleFiles(this.files);this.value='';"/>
            </label>
          </div>
        </div>

        <!-- Progreso de carga -->
        <div id="caseModelsProgress" style="display:none;padding:8px 14px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);margin-bottom:10px;font-size:12px;color:var(--gold-dim)"></div>

        <!-- Lista del caso -->
        ${filtered.length === 0 ? `
          <div class="empty-state" style="padding:30px 14px;text-align:center;color:var(--text-muted);font-size:12.5px;background:var(--surface);border:1px dashed var(--border2);border-radius:var(--radius)">
            🗂️ Sin modelos en este caso${state.filterCategory !== 'all' ? ' para esa categoría' : ''}.<br>
            <span style="font-size:11px">Sube resoluciones, actas, oficios u otras actuaciones de casos anteriores. El agente las usará como referencia de estilo en cualquier caso similar.</span>
          </div>
        ` : `
          <div class="case-models-list" style="display:flex;flex-direction:column;gap:6px">
            ${filtered.map(m => renderModelCard(m, false)).join('')}
          </div>
        `}

        ${state.globalModels.length ? `
          <details style="margin-top:14px" ${state.globalModels.length <= 5 ? 'open' : ''}>
            <summary style="cursor:pointer;font-size:11px;color:var(--text-muted);padding:8px 4px;letter-spacing:.05em;text-transform:uppercase;font-weight:600">
              🔗 Tus modelos globales (de otros casos · ${state.globalModels.length})
            </summary>
            <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
              ${state.globalModels.map(m => renderModelCard(m, true)).join('')}
            </div>
          </details>
        ` : ''}
      </div>
    `;
  }

  function renderModelCard(m, isFromOtherCase) {
    const cat = CATEGORIES[m.resolution_category] || 'Otro';
    const proc = PROCEDURE_TYPES[m.procedure_type] || m.procedure_type;
    const tag = isFromOtherCase ? '🔗' : '📌';
    const isExpanded = state.expandedId === m.id;
    const preview = isExpanded
      ? safeEsc((m.extracted_text || '').slice(0, 5000))
      : '';
    const fmtDate = m.created_at ? new Date(m.created_at).toLocaleDateString('es-CL') : '';
    const charCount = m.extracted_text ? m.extracted_text.length : 0;

    const catSelectOptions = Object.entries(CATEGORIES).map(([k, v]) => `
      <option value="${k}" ${m.resolution_category === k ? 'selected' : ''}>${safeEsc(v)}</option>
    `).join('');

    return `
      <div class="case-model-card" data-model-id="${m.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer" onclick="window.ModelosResolucion._toggleExpand('${m.id}')">
          <span style="font-size:14px;flex-shrink:0">${tag}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safeEsc(m.name || m.file_name)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
              <span class="proc-badge" style="font-size:9.5px">${safeEsc(cat)}</span>
              <span>${safeEsc(proc)}</span>
              <span>${charCount.toLocaleString('es-CL')} chars</span>
              ${fmtDate ? `<span>${safeEsc(fmtDate)}</span>` : ''}
              ${m.is_global ? '<span style="color:var(--gold)">global</span>' : ''}
            </div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0" onclick="event.stopPropagation()">
            <select class="case-model-cat-select" data-model-id="${m.id}"
                    onchange="window.ModelosResolucion._updateCategory('${m.id}', this.value)"
                    title="Cambiar categoría"
                    style="background:var(--surface2);border:1px solid var(--border);color:var(--text-dim);padding:3px 6px;border-radius:var(--radius-sm);font-size:10.5px;font-family:var(--font-body);outline:none;max-width:160px">
              ${catSelectOptions}
            </select>
            <button class="btn-del" onclick="window.ModelosResolucion._deleteModel('${m.id}')" title="Eliminar">🗑</button>
          </div>
        </div>
        ${isExpanded ? `
          <div style="padding:0 12px 12px;border-top:1px solid var(--border)">
            <div style="font-size:10px;color:var(--text-muted);margin:8px 0 4px">📄 ${safeEsc(m.file_name)} · vista previa (máx 5 000 chars)</div>
            <pre style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-family:var(--font-mono);font-size:10.5px;line-height:1.5;color:var(--text-dim);white-space:pre-wrap;word-wrap:break-word;max-height:340px;overflow-y:auto;margin:0">${preview}${m.extracted_text && m.extracted_text.length > 5000 ? '\n\n[…texto truncado a 5 000 chars en preview…]' : ''}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }

  /* ────────────────────────────────────────────────────────
     ACCIONES (handlers globales bajo window.ModelosResolucion)
     ──────────────────────────────────────────────────────── */
  function setFilter(value) {
    state.filterCategory = value || 'all';
    renderUI();
  }

  function toggleExpand(id) {
    state.expandedId = (state.expandedId === id) ? null : id;
    renderUI();
  }

  async function updateCategory(id, category) {
    if (!CATEGORIES[category]) {
      toast('⚠ Categoría inválida');
      return;
    }
    try {
      const { error } = await window.sb
        .from('case_resolution_models')
        .update({ resolution_category: category })
        .eq('id', id)
        .eq('user_id', window.session.user.id);
      if (error) throw error;
      // Actualizar estado local
      const all = [...state.models, ...state.globalModels];
      const m = all.find(x => x.id === id);
      if (m) m.resolution_category = category;
      toast('✓ Categoría actualizada');
      renderUI();
    } catch (err) {
      toast('⚠ Error: ' + (err.message || err));
    }
  }

  async function deleteModel(id) {
    if (!confirm('¿Eliminar este modelo? Esta acción no se puede deshacer.')) return;
    try {
      const { error } = await window.sb
        .from('case_resolution_models')
        .delete()
        .eq('id', id)
        .eq('user_id', window.session.user.id);
      if (error) throw error;
      state.models = state.models.filter(m => m.id !== id);
      state.globalModels = state.globalModels.filter(m => m.id !== id);
      toast('✓ Modelo eliminado');
      renderUI();
    } catch (err) {
      toast('⚠ Error eliminando: ' + (err.message || err));
    }
  }

  async function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    if (!state.caseId || !window.session) {
      toast('⚠ Sin caso o sesión activa');
      return;
    }
    const files = Array.from(fileList);
    const total = files.length;
    const progEl = document.getElementById('caseModelsProgress');
    const showProg = (msg) => {
      if (!progEl) return;
      progEl.style.display = 'block';
      progEl.textContent = msg;
    };
    const hideProg = () => { if (progEl) progEl.style.display = 'none'; };

    let inserted = 0;
    let failed = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      showProg(`Procesando ${i + 1}/${total}: ${f.name}`);
      try {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) {
          failed.push(`${f.name} (extensión no soportada)`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          failed.push(`${f.name} (excede 10 MB)`);
          continue;
        }
        const text = await extractText(f);
        if (!text || text.length < MIN_TEXT_LEN) {
          failed.push(`${f.name} (texto < ${MIN_TEXT_LEN} chars)`);
          continue;
        }
        const baseName = f.name.replace(/\.[^.]+$/, '');
        const category = guessCategory(f.name);
        const procedure_type = guessProcedure(f.name);

        const payload = {
          case_id: state.caseId,
          user_id: window.session.user.id,
          name: baseName,
          file_name: f.name,
          extracted_text: text,
          model_type: 'resolucion',
          resolution_category: category,
          procedure_type,
          is_global: true,
        };

        const { error } = await window.sb
          .from('case_resolution_models')
          .insert(payload);
        if (error) {
          failed.push(`${f.name} (${error.message || 'INSERT falló'})`);
          continue;
        }
        inserted++;
      } catch (err) {
        failed.push(`${f.name} (${err.message || 'error'})`);
      }
    }

    hideProg();
    if (inserted > 0) toast(`✓ ${inserted} modelo${inserted === 1 ? '' : 's'} cargado${inserted === 1 ? '' : 's'}`);
    if (failed.length) {
      toast(`⚠ ${failed.length} con problemas`);
      console.warn('[modelos-resolucion] Errores de carga:', failed);
    }

    // Refrescar listado
    const { models, globalModels } = await loadModels(state.caseId);
    state.models = models;
    state.globalModels = globalModels;
    renderUI();
  }

  async function classifyAI() {
    const otros = state.models.filter(m => m.resolution_category === 'otro');
    if (!otros.length) {
      toast('No hay modelos en categoría "otro" para reclasificar');
      return;
    }
    if (!confirm(`Reclasificar ${otros.length} modelo(s) con IA (Claude Haiku)? Tomará unos segundos.`)) return;
    const ids = otros.map(m => m.id);
    try {
      toast(`🤖 Clasificando ${ids.length} modelo(s)…`);
      const fn = (typeof window.authFetch === 'function') ? window.authFetch : fetch;
      const res = await fn('/.netlify/functions/classify-resolution-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'ai', modelIds: ids }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }
      const data = await res.json();
      toast(`✓ Reclasificados: ${data.classified}/${data.total}`);
      // Refrescar
      const { models, globalModels } = await loadModels(state.caseId);
      state.models = models;
      state.globalModels = globalModels;
      renderUI();
    } catch (err) {
      toast('⚠ Error en clasificación IA: ' + (err.message || err));
    }
  }

  /* ────────────────────────────────────────────────────────
     INYECCIÓN AL SYSTEM PROMPT (sección XVII)
     buildCaseModelsBlock(caseId) — para uso desde generadores
     ──────────────────────────────────────────────────────── */
  async function buildCaseModelsBlock(caseId) {
    if (!caseId || !window.sb || !window.session) return '';
    const uid = window.session.user.id;

    try {
      // Modelos del caso actual
      const { data: local } = await window.sb
        .from('case_resolution_models')
        .select('name,resolution_category,procedure_type,extracted_text,case_id')
        .eq('user_id', uid)
        .eq('case_id', caseId);

      // Modelos globales del usuario (otros casos), tope 50
      const { data: globals } = await window.sb
        .from('case_resolution_models')
        .select('name,resolution_category,procedure_type,extracted_text,case_id')
        .eq('user_id', uid)
        .eq('is_global', true)
        .neq('case_id', caseId)
        .order('created_at', { ascending: false })
        .limit(MAX_GLOBAL_LIMIT);

      const localArr = (local || []).map(m => ({ ...m, _origin: 'current' }));
      const globalArr = (globals || []).map(m => ({ ...m, _origin: 'other' }));
      const all = [...localArr, ...globalArr];
      if (!all.length) return '';

      // Agrupar por categoría
      const groups = {};
      for (const m of all) {
        const c = m.resolution_category || 'otro';
        (groups[c] = groups[c] || []).push(m);
      }

      // Construir bloque con presupuesto duro
      const header = [
        '',
        '═══ XVII. MODELOS DE ESTILO INSTITUCIONAL (referencia obligatoria) ═══',
        '',
        'CRÍTICO — INSTRUCCIÓN OPERATIVA:',
        'Cuando el usuario solicite generar una resolución, acta, oficio u otra actuación,',
        'BUSCA PRIMERO en estos modelos el tipo correspondiente y REPLICA fielmente su',
        'formato, estructura, encabezados, fórmulas y estilo. ADAPTA SOLO los datos',
        'específicos del caso actual (partes, fechas, hechos, materia). No inventes',
        'estructuras nuevas si existe un modelo del mismo tipo.',
        '',
        'Etiquetas: 📌 = modelo del caso actual · 🔗 = modelo de otro caso del usuario.',
        '',
      ].join('\n');

      let block = header;
      let used = block.length;
      const budgetLeft = () => Math.max(0, MAX_INJECT_TOTAL_CHARS - used);

      for (const [catKey, items] of Object.entries(groups)) {
        if (budgetLeft() < 200) break;
        const catLabel = CATEGORIES[catKey] || catKey;
        const sectionHeader = `\n──── ${catLabel} (${items.length}) ────\n`;
        block += sectionHeader;
        used += sectionHeader.length;

        for (const m of items) {
          if (budgetLeft() < 200) break;
          const tag = m._origin === 'current' ? '📌' : '🔗';
          const slice = String(m.extracted_text || '').slice(0, MAX_INJECT_PER_MODEL);
          const allowed = Math.min(slice.length, budgetLeft() - 120);
          if (allowed <= 100) break;
          const piece = `\n${tag} ${m.name || ''}\n${slice.slice(0, allowed)}\n${slice.length > allowed ? '[…truncado…]\n' : ''}`;
          block += piece;
          used += piece.length;
        }
      }

      return block;
    } catch (err) {
      console.warn('[modelos-resolucion] buildCaseModelsBlock error:', err);
      return '';
    }
  }

  /* ────────────────────────────────────────────────────────
     EXPORT GLOBAL
     ──────────────────────────────────────────────────────── */
  window.ModelosResolucion = {
    // API pública
    render,
    buildCaseModelsBlock,
    CATEGORIES,
    PROCEDURE_TYPES,
    // Handlers internos (usados por onclick/onchange)
    _setFilter:       setFilter,
    _toggleExpand:    toggleExpand,
    _updateCategory:  updateCategory,
    _deleteModel:     deleteModel,
    _handleFiles:     handleFiles,
    _classifyAI:      classifyAI,
  };
})();
