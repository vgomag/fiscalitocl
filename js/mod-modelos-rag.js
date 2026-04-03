/* =========================================================
   MOD-MODELOS-RAG.JS — Generación RAG con Modelos Propios
   v1.0 · 2026-03-25 · Fiscalito
   =========================================================
   Sistema de generación documental basado exclusivamente en
   los textos reales del usuario (resoluciones, informes,
   vistas fiscales, diligencias) como fuente única.

   PRINCIPIO: El agente solo usa los documentos modelo
   seleccionados. Cero conocimiento externo, cero suposiciones.
   Solo estructura, estilo y razonamiento del texto original.
   ========================================================= */

/* ── ESTADO ── */
const rag = {
  // Catálogo de documentos del sistema
  docs:         [],   // todos los docs cargados (resoluciones + diligencias)
  loading:      false,
  // Selección actual
  selectedIds:  new Set(),  // IDs de documentos modelo seleccionados
  favIds:       new Set(),  // favoritos persistentes (localStorage)
  // Filtros
  filterType:   'all',   // all | resolucion | informe | vista | declaracion | oficio | otro
  filterProto:  'all',
  filterSearch: '',
  // Generación
  targetCaseId: null,
  docTypeToGen: 'vista_fiscal',
  generating:   false,
  result:       '',
  // Protocolo del caso objetivo
  protocols:    [],
  cases:        [],
};

const RAG_DOC_TYPES = [
  { id:'vista_fiscal',        label:'Vista Fiscal / Informe Final',  icon:'📑' },
  { id:'formulacion_cargos',  label:'Formulación de Cargos',         icon:'📋' },
  { id:'analisis_irac',       label:'Análisis IRAC',                 icon:'⚖️'  },
  { id:'resolucion_inicio',   label:'Resolución de Inicio',          icon:'📄' },
  { id:'resolucion_sobreseimiento', label:'Sobreseimiento',          icon:'📂' },
  { id:'oficio',              label:'Oficio',                        icon:'📬' },
  { id:'libre',               label:'Documento libre',               icon:'✍️'  },
];

const RAG_FILTER_TYPES = [
  { id:'all',          label:'Todos' },
  { id:'resolucion',   label:'Resoluciones' },
  { id:'informe',      label:'Informes' },
  { id:'vista',        label:'Vistas fiscales' },
  { id:'declaracion',  label:'Declaraciones' },
  { id:'oficio',       label:'Oficios' },
  { id:'otro',         label:'Otros' },
];

// ── Persistencia de favoritos ──
(function loadFavs() {
  try {
    const saved = JSON.parse(localStorage.getItem('fiscalito_rag_favs') || '[]');
    rag.favIds = new Set(saved);
  } catch { rag.favIds = new Set(); }
})();

function saveFavs() {
  try { localStorage.setItem('fiscalito_rag_favs', JSON.stringify([...rag.favIds])); } catch {}
}

/* ────────────────────────────────────────────────────────
   APERTURA DESDE SIDEBAR
   ──────────────────────────────────────────────────────── */
function openModelosRAG() {
  // Redirigir a la pestaña Modelos RAG dentro de Biblioteca
  if (typeof openBiblioteca === 'function') {
    openBiblioteca('modelos');
  }
}

/* ────────────────────────────────────────────────────────
   CARGA DE DOCUMENTOS DESDE SUPABASE
   Fuentes: diligencias (con extracted_text o ai_summary)
            + resoluciones (con facts_description)
   ──────────────────────────────────────────────────────── */
async function loadRAGDocs() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  rag.loading = true;
  renderRAGView();

  try {
    const { data: { user } } = await sb.auth.getUser();

    // Cargar en paralelo
    const [digsRes, resRes, casesRes] = await Promise.all([
      sb.from('diligencias')
        .select('id, case_id, diligencia_label, diligencia_type, file_name, extracted_text, ai_summary, fecha_diligencia, created_at')
        .or('extracted_text.not.is.null,ai_summary.not.is.null')
        .order('created_at', { ascending: false })
        .limit(200)
        .catch(e => ({data:null,error:e})),
      sb.from('resoluciones')
        .select('id, case_id, resolution_type, resolution_number, resolution_date, facts_description, notes, authority, fiscal_designado, created_at')
        .not('facts_description', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)
        .catch(e => ({data:null,error:e})),
      sb.from('cases')
        .select('id, name, rol, tipo_procedimiento, protocolo, materia, status, caratula')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .catch(e => ({data:null,error:e})),
    ]);

    rag.cases = casesRes.data || [];
    rag.protocols = [...new Set(rag.cases.map(c => c.protocolo).filter(Boolean))];

    // Normalizar diligencias → docs
    const dilDocs = (digsRes.data || []).map(d => {
      const c = rag.cases.find(x => x.id === d.case_id);
      return {
        id:        'd_' + d.id,
        raw_id:    d.id,
        source:    'diligencia',
        case_id:   d.case_id,
        case_name: c?.name || '—',
        case_rol:  c?.rol || '—',
        case_proto:c?.protocolo || '—',
        case_status: c?.status || '—',
        tipo:      d.diligencia_type || 'otro',
        label:     d.diligencia_label || d.file_name || 'Diligencia',
        date:      d.fecha_diligencia || d.created_at?.substring(0,10) || '—',
        text:      d.extracted_text || d.ai_summary || '',
        text_len:  (d.extracted_text || d.ai_summary || '').length,
        icon:      iconForDilType(d.diligencia_type),
      };
    });

    // Normalizar resoluciones → docs
    const resDocs = (resRes.data || []).map(r => {
      const c = rag.cases.find(x => x.id === r.case_id);
      return {
        id:        'r_' + r.id,
        raw_id:    r.id,
        source:    'resolucion',
        case_id:   r.case_id,
        case_name: c?.name || '—',
        case_rol:  c?.rol || '—',
        case_proto:c?.protocolo || '—',
        case_status: c?.status || '—',
        tipo:      r.resolution_type || 'otro',
        label:     r.resolution_number ? `${resTypeLabel(r.resolution_type)} ${r.resolution_number}` : resTypeLabel(r.resolution_type),
        date:      r.resolution_date || r.created_at?.substring(0,10) || '—',
        text:      [r.facts_description, r.notes].filter(Boolean).join('\n\n'),
        text_len:  ([r.facts_description, r.notes].filter(Boolean).join('')).length,
        icon:      '📄',
      };
    });

    rag.docs = [...dilDocs, ...resDocs];
    // Pre-select saved favorites
    rag.selectedIds = new Set([...rag.favIds].filter(id => rag.docs.some(d => d.id === id)));

  } catch (err) {
    console.error('[RAG] load error:', err);
    showToast('⚠ Error al cargar documentos: ' + err.message);
  } finally {
    rag.loading = false;
    renderRAGView();
  }
}

function iconForDilType(t) {
  const m = {
    resolucion_inicio:'📄', resolucion_cargos:'📋', resolucion_sancion:'⚖️',
    vista_fiscal:'📑', informe_final:'📑', declaracion_denunciante:'🗣',
    declaracion_testigo:'🗣', declaracion_inculpado:'🗣', oficio:'📬',
    acta:'📝', otro:'📂',
  };
  return m[t] || '📂';
}

function resTypeLabel(t) {
  const m = {
    inicio:'Resolución de Inicio', cargos:'Formulación de Cargos',
    sobreseimiento:'Sobreseimiento', sancion:'Resolución de Sanción',
    absolucion:'Absolución', nuevo_fiscal:'Designación de Fiscal',
    medida_proteccion:'Medida de Protección', otro:'Resolución',
  };
  return m[t] || 'Resolución';
}

/* ────────────────────────────────────────────────────────
   RENDER PRINCIPAL
   ──────────────────────────────────────────────────────── */
function renderRAGView() {
  let main = document.getElementById('ragMain');
  // If container doesn't exist, try to create it in the appropriate context
  if (!main) {
    const bibBody = document.getElementById('bibBody');
    if (bibBody) {
      // We're in Biblioteca context; container will be created by renderBibModelosRAG
      return;
    }
    // Standalone context: create container
    const masterView = document.querySelector('.main-content') || document.querySelector('main');
    if (masterView) {
      main = document.createElement('div');
      main.id = 'ragMain';
      masterView.appendChild(main);
    } else {
      return;
    }
  }

  if (rag.loading) {
    main.innerHTML = '<div class="loading" style="padding:40px">Cargando documentos modelo…</div>';
    return;
  }

  main.innerHTML = `
  <div class="rag-layout">
    <!-- PANEL IZQUIERDO: catálogo de documentos -->
    <div class="rag-left">
      ${renderRAGCatalog()}
    </div>
    <!-- PANEL DERECHO: generador RAG -->
    <div class="rag-right">
      ${renderRAGGenerator()}
    </div>
  </div>`;
}

/* ── Catálogo ── */
function renderRAGCatalog() {
  const filtered = getFilteredDocs();
  const selectedCount = rag.selectedIds.size;

  return `
  <div class="rag-catalog-header">
    <div style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.07em;text-transform:uppercase">
      Documentos modelo
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${selectedCount > 0 ? `<span class="rag-sel-badge">${selectedCount} seleccionado${selectedCount>1?'s':''}</span>` : ''}
      <button class="btn-sm" style="font-size:10px;padding:2px 8px" onclick="ragClearSelection()">↺ Limpiar</button>
    </div>
  </div>

  <!-- Búsqueda -->
  <div class="rag-search-row">
    <input class="search-box" style="flex:1" placeholder="🔍 Buscar por nombre, caso, ROL…"
      value="${esc(rag.filterSearch)}"
      oninput="rag.filterSearch=this.value;updateRAGCatalog()"/>
  </div>

  <!-- Filtros tipo -->
  <div class="rag-filter-row">
    ${RAG_FILTER_TYPES.map(f => `
      <button class="rag-filter-btn ${rag.filterType===f.id?'active':''}"
        onclick="rag.filterType='${f.id}';updateRAGCatalog()">${f.label}</button>
    `).join('')}
  </div>

  <!-- Filtro protocolo -->
  ${rag.protocols.length > 1 ? `
  <div class="rag-filter-row" style="margin-top:4px">
    <button class="rag-filter-btn ${rag.filterProto==='all'?'active':''}" onclick="rag.filterProto='all';updateRAGCatalog()">Todos</button>
    ${rag.protocols.map(p => `<button class="rag-filter-btn ${rag.filterProto===p?'active':''}" onclick="rag.filterProto='${p}';updateRAGCatalog()">Protocolo ${p}</button>`).join('')}
  </div>` : ''}

  <!-- Lista documentos -->
  <div class="rag-doc-list" id="ragDocList">
    ${renderRAGDocList(filtered)}
  </div>`;
}

function renderRAGDocList(docs) {
  if (!docs.length) return '<div class="empty-state" style="padding:24px">Sin documentos con texto disponible para el filtro seleccionado.</div>';

  return docs.map(d => {
    const isSelected = rag.selectedIds.has(d.id);
    const isFav      = rag.favIds.has(d.id);
    const statusDot  = d.case_status === 'terminado' ? '🔒' : '🟢';
    return `
    <div class="rag-doc-item ${isSelected ? 'selected' : ''}" onclick="toggleRAGDoc('${d.id}')">
      <div class="rag-doc-check ${isSelected ? 'checked' : ''}">${isSelected ? '✓' : ''}</div>
      <div class="rag-doc-icon">${d.icon}</div>
      <div class="rag-doc-body">
        <div class="rag-doc-label" title="${esc(d.label)}">${esc(d.label.substring(0,70))}${d.label.length>70?'…':''}</div>
        <div class="rag-doc-meta">
          ${statusDot} <span style="font-weight:500">${esc(d.case_name)}</span>
          ${d.case_rol ? `<span style="color:var(--text-muted)"> · ${esc(d.case_rol)}</span>` : ''}
          ${d.case_proto !== '—' ? `<span class="rag-proto-tag">P${esc(d.case_proto)}</span>` : ''}
          <span style="color:var(--text-muted)">${d.date}</span>
          <span class="rag-len-tag">${(d.text_len/1000).toFixed(1)}k chars</span>
        </div>
      </div>
      <div class="rag-doc-actions" onclick="event.stopPropagation()">
        <button class="rag-fav-btn ${isFav?'active':''}" onclick="toggleRAGFav('${d.id}')" title="${isFav?'Quitar favorito':'Marcar favorito'}">★</button>
        <button class="btn-sm" style="font-size:9.5px;padding:2px 7px" onclick="previewRAGDoc('${d.id}')">Ver</button>
      </div>
    </div>`;
  }).join('');
}

/* ── Generador ── */
function renderRAGGenerator() {
  const selected = rag.docs.filter(d => rag.selectedIds.has(d.id));
  const totalChars = selected.reduce((s, d) => s + d.text_len, 0);

  return `
  <div class="rag-gen-panel">
    <div class="rag-gen-header">
      <div class="rag-gen-title">⚡ Generador RAG</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.4">
        El agente usará <strong>exclusivamente</strong> los documentos seleccionados como fuente y modelo.
        Sin conocimiento externo. Sin suposiciones.
      </div>
    </div>

    <!-- Documentos seleccionados como modelo -->
    <div class="rag-gen-section">
      <div class="rag-gen-section-label">📌 Modelos seleccionados (${selected.length})</div>
      ${selected.length === 0
        ? `<div class="rag-gen-empty">Selecciona documentos del catálogo izquierdo →</div>`
        : `<div class="rag-selected-list">
            ${selected.map(d => `
              <div class="rag-sel-item">
                <span>${d.icon} ${esc(d.label.substring(0,50))}${d.label.length>50?'…':''}</span>
                <span style="font-size:10px;color:var(--text-muted)">${esc(d.case_name.substring(0,25))}</span>
                <button onclick="toggleRAGDoc('${d.id}')" class="rag-sel-remove">✕</button>
              </div>`).join('')}
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:5px">
            📊 ${totalChars.toLocaleString()} caracteres de contexto modelo
          </div>`}
    </div>

    <!-- Caso destino -->
    <div class="rag-gen-section">
      <div class="rag-gen-section-label">📋 Caso a redactar</div>
      <select class="rag-select" id="ragTargetCase" onchange="rag.targetCaseId=this.value;updateRAGGenerator()">
        <option value="">— Seleccionar expediente —</option>
        ${rag.cases.map(c => `
          <option value="${c.id}" ${rag.targetCaseId===c.id?'selected':''}>
            ${esc(c.name)} ${c.rol?'· '+c.rol:''} ${c.status==='terminado'?'[T]':''}
          </option>`).join('')}
      </select>
      ${rag.targetCaseId ? renderTargetCaseInfo() : ''}
    </div>

    <!-- Tipo de documento a generar -->
    <div class="rag-gen-section">
      <div class="rag-gen-section-label">📝 Tipo de documento a generar</div>
      <div class="rag-type-grid">
        ${RAG_DOC_TYPES.map(t => `
          <button class="rag-type-btn ${rag.docTypeToGen===t.id?'active':''}"
            onclick="rag.docTypeToGen='${t.id}';updateRAGGenerator()">
            ${t.icon} ${t.label}
          </button>`).join('')}
      </div>
    </div>

    <!-- Instrucción adicional -->
    <div class="rag-gen-section">
      <div class="rag-gen-section-label">💬 Instrucción específica <span style="font-weight:400;color:var(--text-muted)">(opcional)</span></div>
      <textarea id="ragExtraInstr" class="rag-textarea" rows="2"
        placeholder="Ej: El denunciado es contratado. Adaptar la propuesta a sobreseimiento. Énfasis en sección de hechos acreditados…"></textarea>
    </div>

    <!-- Botón generar -->
    <button class="btn-save rag-gen-btn"
      onclick="generateRAGDoc()"
      ${selected.length === 0 || !rag.targetCaseId || rag.generating ? 'disabled' : ''}>
      ${rag.generating
        ? '<span class="rag-spinner"></span> Generando con modelo propio…'
        : `⚡ Generar ${RAG_DOC_TYPES.find(t=>t.id===rag.docTypeToGen)?.label || 'Documento'}`}
    </button>
    ${selected.length === 0 ? `<div style="font-size:10.5px;color:var(--text-muted);text-align:center;margin-top:4px">Selecciona al menos 1 documento modelo</div>` : ''}
    ${!rag.targetCaseId ? `<div style="font-size:10.5px;color:var(--text-muted);text-align:center;margin-top:4px">Selecciona el expediente destino</div>` : ''}

    <!-- Resultado -->
    ${rag.result ? renderRAGResult() : ''}
  </div>`;
}

function renderTargetCaseInfo() {
  const c = rag.cases.find(x => x.id === rag.targetCaseId);
  if (!c) return '';
  return `
  <div class="rag-case-info">
    <div><span class="rag-info-label">Tipo:</span> ${esc(c.tipo_procedimiento||'—')}</div>
    <div><span class="rag-info-label">Protocolo:</span> ${esc(c.protocolo||'—')}</div>
    <div><span class="rag-info-label">Materia:</span> ${esc(c.materia||'—')}</div>
    <div><span class="rag-info-label">Estado:</span> <span style="color:${c.status==='terminado'?'var(--text-muted)':'var(--green)'}">${c.status}</span></div>
  </div>`;
}

function renderRAGResult() {
  return `
  <div class="rag-result-wrap">
    <div class="rag-result-header">
      <span style="font-size:12px;font-weight:600;color:var(--gold)">✓ Documento generado</span>
      <div style="display:flex;gap:6px">
        <button class="btn-sm" style="font-size:10.5px" onclick="copyRAGResult()">📋 Copiar</button>
        <button class="btn-sm" style="font-size:10.5px" onclick="downloadRAGResult()">⬇ Descargar</button>
        <button class="btn-sm" style="font-size:10.5px" onclick="sendRAGToChat()">💬 Abrir en Chat</button>
        <button class="btn-del" onclick="rag.result='';updateRAGGenerator()">✕</button>
      </div>
    </div>
    <div class="rag-result-body">${typeof md === 'function' ? md(rag.result) : (typeof esc === 'function' ? esc(rag.result) : rag.result)}</div>
  </div>`;
}

/* ────────────────────────────────────────────────────────
   GENERACIÓN RAG ESTRICTA
   ──────────────────────────────────────────────────────── */
async function generateRAGDoc() {
  if (rag.selectedIds.size === 0 || !rag.targetCaseId) return;
  rag.generating = true;
  updateRAGGenerator();

  try {
    const ep = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';

    // ── Construir contexto modelo ──
    const modelDocs = rag.docs.filter(d => rag.selectedIds.has(d.id));
    const modelContext = modelDocs.map((d, i) => `
═══════════════════════════════════
DOCUMENTO MODELO ${i+1}/${modelDocs.length}
Tipo: ${d.tipo} | Caso: ${d.case_name} | ROL: ${d.case_rol} | Protocolo: ${d.case_proto}
───────────────────────────────────
${d.text}
═══════════════════════════════════`).join('\n');

    // ── Contexto del caso destino ──
    const targetCase = rag.cases.find(c => c.id === rag.targetCaseId);
    const extraInstr = document.getElementById('ragExtraInstr')?.value.trim() || '';
    const docTypeDef = RAG_DOC_TYPES.find(t => t.id === rag.docTypeToGen);

    // ── Cargar participantes del caso destino ──
    let participantesCtx = '';
    try {
      const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
      if (sb) {
        const { data: parts } = await sb.from('case_participants')
          .select('role, name, estamento, dependencia')
          .eq('case_id', rag.targetCaseId)
          .limit(10);
        if (parts?.length) {
          participantesCtx = '\nPARTICIPANTES:\n' + parts.map(p => `- ${p.role}: ${p.name}${p.estamento?' ('+p.estamento+')':''}${p.dependencia?' — '+p.dependencia:''}`).join('\n');
        }
      }
    } catch {}

    // ── SYSTEM PROMPT RAG ESTRICTO ──
    const systemPrompt = `## MODO RAG ESTRICTO — FUENTE ÚNICA EXCLUSIVA

Eres Fiscalito en modo RAG (Retrieval-Augmented Generation). Eres un redactor jurídico institucional.

╔═══════════════════════════════════════════════════════════╗
║  REGLA FUNDAMENTAL ABSOLUTA — SIN EXCEPCIONES            ║
║                                                           ║
║  Solo puedes generar texto usando EXCLUSIVAMENTE el       ║
║  contenido de los DOCUMENTOS MODELO proporcionados.       ║
║                                                           ║
║  PROHIBIDO:                                               ║
║  ✗ Usar tu conocimiento previo general                    ║
║  ✗ Inventar citas, dictámenes CGR o artículos que NO      ║
║    aparezcan textualmente en los documentos modelo        ║
║  ✗ Hacer suposiciones sobre hechos, personas o contexto   ║
║    más allá de lo explícitamente escrito en los modelos   ║
║  ✗ Agregar información "plausible" o "típica"             ║
║  ✗ Consultar fuentes externas de ningún tipo              ║
║                                                           ║
║  PERMITIDO:                                               ║
║  ✓ Reproducir la ESTRUCTURA EXACTA del modelo             ║
║  ✓ Conservar el ESTILO INSTITUCIONAL y LENGUAJE del modelo║
║  ✓ Reproducir el RAZONAMIENTO JURÍDICO del modelo         ║
║  ✓ Reemplazar datos del caso anterior por los del nuevo   ║
║  ✓ Usar [COMPLETAR: descripción] donde falten datos       ║
║  ✓ Si el modelo usa una norma, usarla. Si no, omitirla    ║
╚═══════════════════════════════════════════════════════════╝

PROCESO DE ADAPTACIÓN:
1. Analiza la estructura formal del documento modelo (encabezados, numeración, fórmulas)
2. Identifica el patrón argumentativo y las referencias normativas usadas
3. Reproduce esa misma estructura con los datos del NUEVO CASO
4. Donde falten datos específicos, usa [COMPLETAR: indicación de qué falta]
5. Mantén el mismo nivel de formalidad, extensión y estilo

DOCUMENTO A GENERAR: ${docTypeDef?.label || 'Documento institucional'}`;

    // ── MENSAJE USUARIO ──
    const userMessage = `Genera un "${docTypeDef?.label || 'documento institucional'}" para el siguiente caso, usando EXCLUSIVAMENTE los documentos modelo proporcionados como referencia estructural y argumentativa.

NUEVO CASO (destino):
- Expediente: ${targetCase?.name || '—'}
- ROL: ${targetCase?.rol || '—'}
- Tipo de procedimiento: ${targetCase?.tipo_procedimiento || '—'}
- Protocolo aplicable: ${targetCase?.protocolo || '—'}
- Materia: ${targetCase?.materia || '—'}
- Estado: ${targetCase?.status || '—'}
- Carátula: ${targetCase?.caratula || '—'}
${participantesCtx}

${extraInstr ? `INSTRUCCIÓN ESPECÍFICA DEL FISCAL:\n${extraInstr}\n` : ''}

════════════════════════════════════
DOCUMENTOS MODELO (FUENTE ÚNICA):
════════════════════════════════════
${modelContext}

════════════════════════════════════
INSTRUCCIÓN FINAL:
Genera el documento adaptado al nuevo caso, respetando al máximo la estructura, el estilo y el razonamiento jurídico de los modelos. No inventes nada que no esté en los modelos. Usa [COMPLETAR: ...] donde falten datos del nuevo caso.`;

    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const resp = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }]
        }),
        signal:_ctrl.signal
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      rag.result = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '⚠ Sin respuesta';
    }finally{
      clearTimeout(_tout);
    }

  } catch (err) {
    console.error('[RAG] generate error:', err);
    rag.result = `⚠ Error al generar: ${err.message}`;
    showToast('⚠ Error en generación: ' + err.message);
  } finally {
    rag.generating = false;
    updateRAGGenerator();
    // Scroll al resultado
    setTimeout(() => document.querySelector('.rag-result-wrap')?.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
  }
}

/* ────────────────────────────────────────────────────────
   ACCIONES
   ──────────────────────────────────────────────────────── */
function toggleRAGDoc(id) {
  if (rag.selectedIds.has(id)) rag.selectedIds.delete(id);
  else rag.selectedIds.add(id);
  // Update item visually + generator
  const item = document.querySelector(`.rag-doc-item[onclick*="${id}"]`);
  if (item) {
    const isNowSelected = rag.selectedIds.has(id);
    item.classList.toggle('selected', isNowSelected);
    const check = item.querySelector('.rag-doc-check');
    if (check) { check.classList.toggle('checked', isNowSelected); check.textContent = isNowSelected ? '✓' : ''; }
  }
  updateRAGGenerator();
  updateRAGCatalogHeader();
}

function toggleRAGFav(id) {
  if (rag.favIds.has(id)) rag.favIds.delete(id);
  else rag.favIds.add(id);
  saveFavs();
  // Update star button
  const btn = document.querySelector(`.rag-doc-item[onclick*="${id}"] .rag-fav-btn`);
  if (btn) btn.classList.toggle('active', rag.favIds.has(id));
}

function ragClearSelection() {
  rag.selectedIds.clear();
  document.querySelectorAll('.rag-doc-item.selected').forEach(el => {
    el.classList.remove('selected');
    const check = el.querySelector('.rag-doc-check');
    if (check) { check.classList.remove('checked'); check.textContent = ''; }
  });
  updateRAGGenerator();
  updateRAGCatalogHeader();
}

function updateRAGCatalog() {
  const filtered = getFilteredDocs();
  const list = document.getElementById('ragDocList');
  if (list) list.innerHTML = renderRAGDocList(filtered);
  updateRAGCatalogHeader();
}

function updateRAGCatalogHeader() {
  const badge = document.querySelector('.rag-sel-badge');
  const count = rag.selectedIds.size;
  if (badge) { badge.textContent = count + ' seleccionado' + (count > 1 ? 's' : ''); badge.style.display = count ? '' : 'none'; }
  else {
    const header = document.querySelector('.rag-catalog-header');
    if (header && count > 0) {
      const newBadge = document.createElement('span');
      newBadge.className = 'rag-sel-badge';
      newBadge.textContent = count + ' seleccionado' + (count > 1 ? 's' : '');
      header.querySelector('div:last-child').prepend(newBadge);
    }
  }
}

function updateRAGGenerator() {
  const right = document.querySelector('.rag-right');
  if (right) right.innerHTML = renderRAGGenerator();
}

function getFilteredDocs() {
  let docs = rag.docs;

  // Tipo filter
  if (rag.filterType !== 'all') {
    docs = docs.filter(d => {
      const t = (d.tipo || '').toLowerCase();
      const l = (d.label || '').toLowerCase();
      if (rag.filterType === 'resolucion') return t.includes('resolucion') || l.includes('resolución') || l.includes('resolucion');
      if (rag.filterType === 'informe') return t.includes('informe') || l.includes('informe');
      if (rag.filterType === 'vista') return t.includes('vista') || l.includes('vista fiscal');
      if (rag.filterType === 'declaracion') return t.includes('declaracion') || l.includes('declaración');
      if (rag.filterType === 'oficio') return t.includes('oficio') || l.includes('oficio');
      if (rag.filterType === 'otro') return !['resolucion','informe','vista','declaracion','oficio'].some(k => t.includes(k));
      return true;
    });
  }

  // Protocolo filter
  if (rag.filterProto !== 'all') {
    docs = docs.filter(d => d.case_proto === rag.filterProto);
  }

  // Búsqueda libre
  if (rag.filterSearch.trim()) {
    const q = rag.filterSearch.toLowerCase();
    docs = docs.filter(d =>
      d.label.toLowerCase().includes(q) ||
      d.case_name.toLowerCase().includes(q) ||
      d.case_rol.toLowerCase().includes(q) ||
      d.tipo.toLowerCase().includes(q)
    );
  }

  // Favoritos primero
  docs.sort((a, b) => {
    const af = rag.favIds.has(a.id) ? 1 : 0;
    const bf = rag.favIds.has(b.id) ? 1 : 0;
    return bf - af;
  });

  return docs;
}

/* ────────────────────────────────────────────────────────
   PREVISUALIZAR DOCUMENTO
   ──────────────────────────────────────────────────────── */
function previewRAGDoc(id) {
  const doc = rag.docs.find(d => d.id === id);
  if (!doc) return;
  document.getElementById('miniModalTitle').textContent = doc.label;
  document.getElementById('miniModalBody').innerHTML = `
    <div style="margin-bottom:10px;font-size:11px;color:var(--text-muted)">
      📋 ${esc(doc.case_name)} · ${esc(doc.case_rol)} · Protocolo ${esc(doc.case_proto)} · ${esc(doc.date)}
    </div>
    <div style="font-size:12px;line-height:1.7;max-height:420px;overflow-y:auto;white-space:pre-wrap;background:var(--surface2);padding:12px;border-radius:var(--radius);border:1px solid var(--border)">
      ${esc(doc.text.substring(0, 6000))}${doc.text.length > 6000 ? '\n\n[…texto truncado para previsualización]' : ''}
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn-save" style="padding:6px 14px" onclick="toggleRAGDoc('${doc.id}');closeMiniModal()">
        ${rag.selectedIds.has(doc.id) ? '✓ Ya seleccionado' : '+ Usar como modelo'}
      </button>
    </div>`;
  window._miniModalSave = null;
  document.getElementById('miniModalSaveBtn').style.display = 'none';
  openMiniModal();
}

/* ── Acciones resultado ── */
function copyRAGResult() { navigator.clipboard.writeText(rag.result); showToast('✓ Copiado al portapapeles'); }

function downloadRAGResult() {
  const c = rag.cases.find(x => x.id === rag.targetCaseId);
  const name = `${rag.docTypeToGen}_${c?.name || 'caso'}_${Date.now()}.txt`.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const blob = new Blob([rag.result], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function sendRAGToChat() {
  // Abre el caso en el chat con el resultado pre-cargado
  const c = rag.cases.find(x => x.id === rag.targetCaseId);
  if (c) {
    if (typeof pickCaseById === 'function') pickCaseById(c.id);
    setTimeout(() => {
      if (typeof showTab === 'function') showTab('tabChat');
      const inp = document.getElementById('inputBox');
      if (inp) inp.value = 'Revisa y mejora este borrador:\n\n' + rag.result.substring(0, 2000);
    }, 400);
  }
  showToast('✓ Abierto en el Chat del expediente');
}

/* ────────────────────────────────────────────────────────
   RENDER EMBEBIDO EN BIBLIOTECA
   Se llama desde mod-biblioteca.js → renderBibModelosRAG()
   ──────────────────────────────────────────────────────── */
function renderRAGEmbedded() {
  // Lanzar carga si no se ha hecho
  if (!rag.docs.length && !rag.loading) { loadRAGDocs(); }

  if (rag.loading) {
    return '<div class="loading" style="padding:40px">Cargando documentos modelo…</div>';
  }

  return `
  <div style="padding:8px 14px 6px;display:flex;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--border);flex-shrink:0">
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text)">📄 Modelos Documentales</div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">
        Genera documentos basados exclusivamente en tus propias resoluciones, informes y vistas fiscales
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:10px;background:rgba(5,150,105,.1);border:1px solid rgba(5,150,105,.25);color:var(--green);padding:2px 9px;border-radius:8px;font-weight:500">🔒 Fuente única</span>
      <button class="btn-sm" style="font-size:10.5px" onclick="loadRAGDocs()">↺ Recargar</button>
    </div>
  </div>
  <div id="ragMain" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0">
    <div class="rag-layout">
      <div class="rag-left">${renderRAGCatalog()}</div>
      <div class="rag-right">${renderRAGGenerator()}</div>
    </div>
  </div>`;
}

/* Mantener compatibilidad: renderRAGView ahora actualiza dentro de Biblioteca */
const _origRenderRAGView = renderRAGView;
renderRAGView = function() {
  // Si estamos embebidos en Biblioteca, re-render el tab body
  if (typeof biblioteca !== 'undefined' && biblioteca.activeTab === 'modelos') {
    const body = document.getElementById('bibBody');
    if (body) { body.innerHTML = renderBibModelosRAG ? renderBibModelosRAG() : renderRAGEmbedded(); return; }
  }
  // Fallback al ragMain standalone (por si acaso)
  const main = document.getElementById('ragMain');
  if (main) {
    if (rag.loading) { main.innerHTML = '<div class="loading" style="padding:40px">Cargando documentos modelo…</div>'; return; }
    main.innerHTML = `<div class="rag-layout"><div class="rag-left">${renderRAGCatalog()}</div><div class="rag-right">${renderRAGGenerator()}</div></div>`;
  }
};

/* ────────────────────────────────────────────────────────
   CSS
   ──────────────────────────────────────────────────────── */
(function injectRAGCSS() {
  if (document.getElementById('rag-css')) return;
  const s = document.createElement('style'); s.id = 'rag-css';
  s.textContent = `
/* ── Layout ── */
.rag-layout{display:grid;grid-template-columns:380px 1fr;height:100%;overflow:hidden;}
.rag-left{border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--surface);}
.rag-right{overflow-y:auto;background:var(--bg);}
/* ── Catálogo ── */
.rag-catalog-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface);}
.rag-search-row{padding:8px 12px;border-bottom:1px solid var(--border);flex-shrink:0;}
.rag-filter-row{display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px;border-bottom:1px solid var(--border);flex-shrink:0;}
.rag-filter-btn{padding:2px 9px;font-size:10.5px;border-radius:10px;cursor:pointer;border:1px solid var(--border2);background:none;color:var(--text-muted);font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.rag-filter-btn.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:500;}
.rag-filter-btn:hover{color:var(--gold);border-color:var(--gold-dim);}
.rag-doc-list{flex:1;overflow-y:auto;}
/* ── Item documento ── */
.rag-doc-item{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s;}
.rag-doc-item:hover{background:var(--surface2);}
.rag-doc-item.selected{background:var(--gold-glow);border-left:2px solid var(--gold);}
.rag-doc-check{width:16px;height:16px;border:1.5px solid var(--border2);border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;transition:all .12s;margin-top:2px;}
.rag-doc-check.checked{background:var(--gold);border-color:var(--gold);color:#fff;}
.rag-doc-icon{font-size:14px;flex-shrink:0;margin-top:1px;}
.rag-doc-body{flex:1;min-width:0;}
.rag-doc-label{font-size:11.5px;font-weight:500;line-height:1.4;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.rag-doc-meta{font-size:10px;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:4px;align-items:center;}
.rag-proto-tag{background:rgba(79,70,229,.08);border:1px solid rgba(79,70,229,.2);color:var(--gold);padding:0 5px;border-radius:4px;font-size:9.5px;}
.rag-len-tag{background:var(--surface2);border:1px solid var(--border);padding:0 5px;border-radius:4px;font-size:9.5px;color:var(--text-muted);}
.rag-doc-actions{display:flex;flex-direction:column;gap:3px;flex-shrink:0;}
.rag-fav-btn{background:none;border:none;cursor:pointer;font-size:14px;color:var(--border2);padding:1px;transition:color .1s;}
.rag-fav-btn.active,.rag-fav-btn:hover{color:#f59e0b;}
.rag-sel-badge{background:var(--gold);color:#fff;font-size:9.5px;font-weight:700;padding:1px 8px;border-radius:8px;}
/* ── Panel generador ── */
.rag-gen-panel{padding:16px;display:flex;flex-direction:column;gap:12px;max-width:700px;}
.rag-gen-header{background:white;border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;border-left:3px solid var(--gold);}
.rag-gen-title{font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px;}
.rag-gen-section{display:flex;flex-direction:column;gap:6px;}
.rag-gen-section-label{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);}
.rag-gen-empty{font-size:12px;color:var(--text-muted);padding:10px 14px;background:var(--surface2);border:1px dashed var(--border2);border-radius:var(--radius);text-align:center;}
.rag-selected-list{display:flex;flex-direction:column;gap:4px;}
.rag-sel-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);font-size:11.5px;}
.rag-sel-item span:first-child{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.rag-sel-remove{background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:0 3px;flex-shrink:0;}
.rag-sel-remove:hover{color:var(--red);}
.rag-select{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12.5px;outline:none;transition:border-color .15s;}
.rag-select:focus{border-color:var(--gold-dim);}
.rag-case-info{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);font-size:11px;}
.rag-info-label{font-weight:600;color:var(--text-muted);}
.rag-type-grid{display:flex;flex-wrap:wrap;gap:5px;}
.rag-type-btn{padding:5px 11px;font-size:11px;border-radius:var(--radius-sm);cursor:pointer;border:1px solid var(--border2);background:white;color:var(--text-dim);font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.rag-type-btn.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:500;}
.rag-type-btn:hover{border-color:var(--gold-dim);color:var(--gold);}
.rag-textarea{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12.5px;outline:none;resize:vertical;transition:border-color .15s;}
.rag-textarea:focus{border-color:var(--gold-dim);background:white;}
.rag-gen-btn{width:100%;padding:10px;font-size:13px;font-weight:700;}
.rag-gen-btn:disabled{opacity:.45;cursor:not-allowed;transform:none!important;}
/* ── Resultado ── */
.rag-result-wrap{background:white;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;border-top:3px solid var(--gold);}
.rag-result-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);}
.rag-result-body{padding:16px;font-size:13px;line-height:1.75;max-height:600px;overflow-y:auto;}
.rag-result-body h1,.rag-result-body h2,.rag-result-body h3{font-family:var(--font-serif,'EB Garamond',serif);color:var(--gold);margin:10px 0 5px;}
.rag-result-body strong{font-weight:700;}
.rag-result-body p{margin-bottom:8px;}
/* ── Spinner ── */
.rag-spinner{width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;display:inline-block;margin-right:6px;vertical-align:middle;}
@keyframes spin{to{transform:rotate(360deg)}}
`;
  document.head.appendChild(s);
})();
