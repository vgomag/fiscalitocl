/* =========================================================
   MOD-PENDIENTES.JS — Vista Pendientes por Caso
   v2.0 · 2026-03-25 · Fiscalito
   =========================================================
   Vista agrupada por caso con filtros de categoría,
   estado y búsqueda. Vistas Lista y Kanban.
   ========================================================= */

/* ── ESTADO ── */
const pend = {
  acciones:    [],
  cases:       {},          // { id: case_obj }
  loading:     false,
  // Filtros
  catTab:      'all',       // all | genero | no_genero | cargos | finalizacion
  statusTab:   'all',       // all | pendiente | en_progreso | completado
  search:      '',
  caseFilter:  'all',
  viewMode:    'lista',     // lista | kanban
  // UI state
  collapsed:   new Set(),   // case_ids collapsed
  allCollapsed: false,
  // Acción seleccionada
  selected:    null,
};

const PEND_CAT_LABELS = {
  all:'Todos', genero:'Género', no_genero:'No Género',
  cargos:'Cargos', finalizacion:'Finalización',
};

const PEND_STATUS = {
  pendiente:   { label:'Pendiente',   color:'#f59e0b', bg:'rgba(245,158,11,.08)', border:'rgba(245,158,11,.25)' },
  en_progreso: { label:'En progreso', color:'#4f46e5', bg:'rgba(79,70,229,.07)',   border:'rgba(79,70,229,.2)' },
  completado:  { label:'Completada',  color:'#059669', bg:'rgba(5,150,105,.08)',   border:'rgba(5,150,105,.25)' },
};

const PEND_PRIORITY = {
  urgente: { label:'Urgente', color:'#ef4444' },
  alta:    { label:'Urgente', color:'#ef4444' },
  media:   { label:'Normal',  color:'#f59e0b' },
  normal:  { label:'Normal',  color:'#6b7280' },
  baja:    { label:'Baja',    color:'#9ca3af' },
};

/* ────────────────────────────────────────────────────────
   APERTURA
   ──────────────────────────────────────────────────────── */
function openPendientes() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (typeof event !== 'undefined') event?.currentTarget?.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewPendientes');
  loadPendientesData();
}

/* ────────────────────────────────────────────────────────
   CARGA DE DATOS
   ──────────────────────────────────────────────────────── */
async function loadPendientesData() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  pend.loading = true;
  renderPendientesView();

  try {
    const [accsRes, casesRes] = await Promise.all([
      sb.from('acciones_pendientes')
        .select('id,case_id,title,description,status,priority,due_date,created_at,completed_at')
        .order('due_date', { ascending: true, nullsFirst: false }),
      sb.from('cases')
        .select('id,name,rol,caratula,categoria,status,tipo_procedimiento,materia,protocolo')
        .is('deleted_at', null),
    ]);

    pend.acciones = accsRes.data || [];
    pend.cases = {};
    (casesRes.data || []).forEach(c => { pend.cases[c.id] = c; });

  } catch (err) {
    console.error('[PEND] load error:', err);
    showToast('⚠ Error al cargar pendientes: ' + err.message);
  } finally {
    pend.loading = false;
    renderPendientesView();
  }
}

/* ────────────────────────────────────────────────────────
   DATOS CALCULADOS
   ──────────────────────────────────────────────────────── */
function getFilteredAcciones() {
  let list = pend.acciones;

  // Filtro categoría caso
  if (pend.catTab !== 'all') {
    list = list.filter(a => {
      const c = pend.cases[a.case_id];
      return c?.categoria === pend.catTab;
    });
  }
  // Filtro estado
  if (pend.statusTab !== 'all') {
    list = list.filter(a => a.status === pend.statusTab);
  }
  // Filtro caso específico
  if (pend.caseFilter !== 'all') {
    list = list.filter(a => a.case_id === pend.caseFilter);
  }
  // Búsqueda
  if (pend.search.trim()) {
    const q = pend.search.toLowerCase();
    list = list.filter(a => {
      const c = pend.cases[a.case_id];
      return (a.title||'').toLowerCase().includes(q) ||
             (c?.name||'').toLowerCase().includes(q) ||
             (a.description||'').toLowerCase().includes(q);
    });
  }
  return list;
}

function getCatCount(cat) {
  if (cat === 'all') return pend.acciones.length;
  return pend.acciones.filter(a => pend.cases[a.case_id]?.categoria === cat).length;
}

function getStatusCount(status) {
  if (status === 'all') return pend.acciones.length;
  let list = pend.acciones;
  if (pend.catTab !== 'all') list = list.filter(a => pend.cases[a.case_id]?.categoria === pend.catTab);
  return list.filter(a => a.status === status).length;
}

/* ────────────────────────────────────────────────────────
   RENDER PRINCIPAL
   ──────────────────────────────────────────────────────── */
function renderPendientesView() {
  const main = document.getElementById('pendMain');
  if (!main) return;

  if (pend.loading) {
    main.innerHTML = '<div class="loading" style="padding:40px">Cargando pendientes…</div>';
    return;
  }

  const filtered   = getFilteredAcciones();
  const totalCases = new Set(filtered.map(a => a.case_id)).size;

  // Counts por categoría
  const cats = ['all','genero','no_genero','cargos','finalizacion'];
  const statuses = ['all','pendiente','en_progreso','completado'];

  main.innerHTML = `
  <!-- Header -->
  <div class="pend-header">
    <div>
      <div class="pend-title">Pendientes por Caso</div>
      <div class="pend-subtitle">Organiza las próximas acciones de todos tus casos</div>
    </div>
    <div class="pend-header-actions">
      <button class="btn-sm pend-ia-btn" onclick="pendAnalyzarIA()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 8.5 7 10 10.5 6"/></svg>
        Analizar con IA
      </button>
      <button class="btn-save pend-new-btn" onclick="showPendNuevaAccion()">+ Nueva acción</button>
    </div>
  </div>

  <!-- Cat tabs -->
  <div class="pend-cat-tabs">
    ${cats.map(cat => {
      const count = getCatCount(cat);
      const labels = { all:'Todos', genero:'Género', no_genero:'No Género', cargos:'Cargos', finalizacion:'Finalización' };
      const icons  = { all:'📋', genero:'👥', no_genero:'📂', cargos:'⚖️', finalizacion:'✅' };
      return `<button class="pend-cat-tab ${pend.catTab===cat?'active':''}"
        onclick="pend.catTab='${cat}';pend.statusTab='all';updatePendientes()">
        ${icons[cat]} ${labels[cat]} <span class="pend-tab-count">${count}</span>
      </button>`;
    }).join('')}
  </div>

  <!-- Status filter tabs -->
  <div class="pend-status-row">
    <div class="pend-status-tabs">
      ${statuses.map(s => {
        const count = getStatusCount(s);
        const labels = { all:'Todos', pendiente:'Pendientes', en_progreso:'En progreso', completado:'Completadas' };
        return `<button class="pend-status-tab ${pend.statusTab===s?'active':''}"
          onclick="pend.statusTab='${s}';updatePendientes()" style="${pend.statusTab===s&&s!=='all'?'background:'+PEND_STATUS[s]?.bg+';color:'+PEND_STATUS[s]?.color+';border-color:'+PEND_STATUS[s]?.border:''}">
          ${labels[s]} (${count})
        </button>`;
      }).join('')}
    </div>
  </div>

  <!-- Toolbar -->
  <div class="pend-toolbar">
    <div class="pend-search-wrap">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" style="flex-shrink:0"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg>
      <input class="pend-search" id="pendSearch" placeholder="Buscar por caso, título o descripción…"
        value="${esc(pend.search)}"
        oninput="pend.search=this.value;updatePendientes()"/>
    </div>
    <select class="pend-select" onchange="pend.caseFilter=this.value;updatePendientes()">
      <option value="all">Todos los casos</option>
      ${Object.values(pend.cases).filter(c=>pend.acciones.some(a=>a.case_id===c.id)).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>
        `<option value="${c.id}" ${pend.caseFilter===c.id?'selected':''}>${esc(c.name||'—')}</option>`
      ).join('')}
    </select>
    <select class="pend-select" onchange="pend.priorityFilter=this.value;updatePendientes()">
      <option value="all">Todas</option>
      <option value="urgente">Urgentes</option>
      <option value="normal">Normales</option>
    </select>
    <div style="flex:1"></div>
    <!-- View toggle -->
    <div class="pend-view-toggle">
      <button class="pend-view-btn ${pend.viewMode==='lista'?'active':''}" onclick="pend.viewMode='lista';updatePendientes()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="5" x2="13" y2="5"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="11" x2="10" y2="11"/></svg>
        Lista
      </button>
      <button class="pend-view-btn ${pend.viewMode==='kanban'?'active':''}" onclick="pend.viewMode='kanban';updatePendientes()">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="3.5" height="12" rx="1"/><rect x="6.5" y="2" width="3.5" height="9" rx="1"/><rect x="11" y="2" width="3.5" height="7" rx="1"/></svg>
        Kanban
      </button>
    </div>
  </div>

  <!-- Count row -->
  <div class="pend-count-row">
    <span>Mostrando ${filtered.length} de ${pend.acciones.length} pendientes en ${totalCases} casos</span>
    <button class="pend-collapse-all-btn" onclick="togglePendCollapseAll()">
      ${pend.allCollapsed ? 'Expandir todos' : 'Colapsar todos'}
    </button>
  </div>

  <!-- Content -->
  <div class="pend-content" id="pendContent">
    ${pend.viewMode === 'lista' ? renderPendListaView(filtered) : renderPendKanbanView(filtered)}
  </div>

  <!-- Modal nueva acción (oculto) -->
  <div id="pendNuevaModal" style="display:none">
    ${renderPendNuevaModal()}
  </div>`;
}

/* ── Vista Lista ── */
function renderPendListaView(filtered) {
  if (!filtered.length) return `<div class="empty-state" style="padding:48px">Sin pendientes que coincidan con los filtros seleccionados.</div>`;

  // Agrupar por caso
  const byCase = {};
  filtered.forEach(a => {
    if (!byCase[a.case_id]) byCase[a.case_id] = [];
    byCase[a.case_id].push(a);
  });

  return Object.entries(byCase).map(([caseId, acciones]) => {
    const c = pend.cases[caseId] || {};
    const isCollapsed = pend.collapsed.has(caseId);
    const urgCount = acciones.filter(a => a.priority==='alta'||a.priority==='urgente').length;
    const pendCount = acciones.filter(a => a.status==='pendiente').length;
    const progCount = acciones.filter(a => a.status==='en_progreso').length;

    return `
    <div class="pend-case-group" id="pcase-${caseId}">
      <div class="pend-case-header" onclick="togglePendCase('${caseId}')">
        <div class="pend-case-left">
          <svg class="pend-chevron ${isCollapsed?'':'open'}" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,6 8,10 12,6"/></svg>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/></svg>
          <span class="pend-case-name">${esc(c.name||'—')}</span>
          ${c.rol ? `<span class="pend-case-rol">${esc(c.rol)}</span>` : ''}
        </div>
        <div class="pend-case-right">
          ${urgCount > 0 ? `<span class="pend-urgente-badge">${urgCount} urgente${urgCount>1?'s':''}</span>` : ''}
          <span class="pend-count-badge">${acciones.length} pendiente${acciones.length!==1?'s':''}</span>
          <button class="pend-case-link" onclick="event.stopPropagation();pickCaseById('${caseId}')" title="Abrir caso">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M13 1h2v2M9 7l6-6"/></svg>
          </button>
        </div>
      </div>
      <div class="pend-case-body ${isCollapsed?'collapsed':''}">
        ${acciones.map(a => renderPendActionRow(a, c)).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderPendActionRow(a, c) {
  const st = PEND_STATUS[a.status] || PEND_STATUS.pendiente;
  const pr = PEND_PRIORITY[a.priority] || PEND_PRIORITY.normal;
  const isCompleted = a.status === 'completado';
  const isOverdue = a.due_date && new Date(a.due_date) < new Date() && !isCompleted;

  return `
  <div class="pend-action-row ${isCompleted?'done':''}">
    <input type="checkbox" class="pend-checkbox" ${isCompleted?'checked':''}
      onchange="togglePendComplete('${a.id}', this.checked)" onclick="event.stopPropagation()"/>
    <div class="pend-priority-icon" title="${pr.label}" style="color:${pr.color}">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="${pr.color}" stroke="none"><path d="M8 1 L9.5 6 L14 6 L10.5 9 L12 14 L8 11 L4 14 L5.5 9 L2 6 L6.5 6 Z" opacity="${a.priority==='alta'||a.priority==='urgente'?'1':'.4'}"/></svg>
    </div>
    <div class="pend-action-body" onclick="openPendActionDetail('${a.id}')">
      <div class="pend-action-title ${isCompleted?'done':''} ${isOverdue?'overdue':''}">${esc(a.title||'—')}</div>
      ${a.due_date ? `<div class="pend-action-date ${isOverdue?'overdue':''}">📅 ${formatPendDate(a.due_date)}</div>` : ''}
    </div>
    <span class="pend-status-pill" style="background:${st.bg};color:${st.color};border:1px solid ${st.border}">${st.label}</span>
    <button class="pend-row-arrow" onclick="openPendActionDetail('${a.id}')">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6,4 10,8 6,12"/></svg>
    </button>
  </div>`;
}

/* ── Vista Kanban ── */
function renderPendKanbanView(filtered) {
  const cols = [
    { id:'pendiente',   label:'Pendientes',   ...PEND_STATUS.pendiente },
    { id:'en_progreso', label:'En progreso',  ...PEND_STATUS.en_progreso },
    { id:'completado',  label:'Completadas',  ...PEND_STATUS.completado },
  ];

  return `<div class="pend-kanban">
    ${cols.map(col => {
      const colItems = filtered.filter(a => a.status === col.id);
      return `
      <div class="pend-kanban-col">
        <div class="pend-kanban-col-header" style="border-top:3px solid ${col.color}">
          <span style="font-weight:600;font-size:12px">${col.label}</span>
          <span class="pend-count-badge">${colItems.length}</span>
        </div>
        <div class="pend-kanban-cards">
          ${colItems.length === 0
            ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:20px">Sin acciones</div>`
            : colItems.map(a => {
                const c = pend.cases[a.case_id] || {};
                const pr = PEND_PRIORITY[a.priority] || PEND_PRIORITY.normal;
                const isOverdue = a.due_date && new Date(a.due_date) < new Date() && col.id !== 'completado';
                return `
                <div class="pend-kanban-card" onclick="openPendActionDetail('${a.id}')">
                  <div class="pend-kanban-card-title">${esc(a.title||'—')}</div>
                  <div class="pend-kanban-card-case">
                    <span style="color:${pr.color}">●</span>
                    ${esc(c.name||'—')}${c.rol?` · ${esc(c.rol)}`:''}
                  </div>
                  ${a.due_date ? `<div class="pend-kanban-card-date ${isOverdue?'overdue':''}">📅 ${formatPendDate(a.due_date)}</div>` : ''}
                </div>`;
              }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Modal nueva acción ── */
function renderPendNuevaModal() {
  return `
  <div class="mini-modal-overlay" onclick="if(event.target===this)closePendNuevaModal()">
    <div class="mini-modal">
      <div class="mini-modal-title">+ Nueva acción pendiente</div>
      <div class="mini-field">
        <label>Caso *</label>
        <select id="pendNewCase">
          <option value="">— Seleccionar expediente —</option>
          ${Object.values(pend.cases).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>
            `<option value="${c.id}">${esc(c.name||'—')}${c.rol?' · '+esc(c.rol):''}</option>`
          ).join('')}
        </select>
      </div>
      <div class="mini-field">
        <label>Título *</label>
        <input id="pendNewTitle" placeholder="Ej: Oficiar a Daniela Medina por antecedentes…"/>
      </div>
      <div class="mini-field">
        <label>Descripción</label>
        <textarea id="pendNewDesc" rows="2" placeholder="Descripción opcional…" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;resize:vertical;"></textarea>
      </div>
      <div class="mini-row">
        <div class="mini-field">
          <label>Prioridad</label>
          <select id="pendNewPriority">
            <option value="alta">🔴 Urgente</option>
            <option value="normal" selected>🟡 Normal</option>
            <option value="baja">⚪ Baja</option>
          </select>
        </div>
        <div class="mini-field">
          <label>Fecha límite</label>
          <input type="date" id="pendNewDate"/>
        </div>
      </div>
      <div class="mini-modal-actions">
        <button class="btn-cancel" onclick="closePendNuevaModal()">Cancelar</button>
        <button class="btn-save" onclick="savePendNuevaAccion()">Guardar acción</button>
      </div>
    </div>
  </div>`;
}

/* ── Modal detalle acción ── */
function openPendActionDetail(id) {
  const a = pend.acciones.find(x => x.id === id);
  if (!a) return;
  const c = pend.cases[a.case_id] || {};
  const st = PEND_STATUS[a.status] || PEND_STATUS.pendiente;
  const pr = PEND_PRIORITY[a.priority] || PEND_PRIORITY.normal;
  const isOverdue = a.due_date && new Date(a.due_date) < new Date() && a.status !== 'completado';

  document.getElementById('miniModalTitle').textContent = 'Detalle de acción';
  document.getElementById('miniModalBody').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:10px 12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(a.title||'—')}</div>
        <div style="font-size:11px;color:var(--text-muted)">📋 ${esc(c.name||'—')}${c.rol?' · '+esc(c.rol):''}</div>
      </div>
      ${a.description ? `<div style="font-size:12.5px;color:var(--text-dim);line-height:1.6;padding:8px 0">${esc(a.description)}</div>` : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11.5px">
        <div><span style="color:var(--text-muted)">Estado:</span>
          <select onchange="updatePendStatus('${a.id}',this.value)" style="background:${st.bg};color:${st.color};border:1px solid ${st.border};border-radius:4px;padding:2px 7px;font-size:11px;font-family:var(--font-body,'Inter',sans-serif);outline:none;margin-left:6px">
            ${['pendiente','en_progreso','completado'].map(s=>`<option value="${s}" ${a.status===s?'selected':''}>${PEND_STATUS[s].label}</option>`).join('')}
          </select>
        </div>
        <div><span style="color:var(--text-muted)">Prioridad:</span> <span style="color:${pr.color};font-weight:500;margin-left:6px">${pr.label}</span></div>
        ${a.due_date ? `<div><span style="color:var(--text-muted)">Fecha límite:</span> <span style="color:${isOverdue?'var(--red)':'var(--text-dim)'};margin-left:6px">${formatPendDate(a.due_date)}${isOverdue?' ⚠ Vencida':''}</span></div>` : ''}
        ${a.completed_at ? `<div><span style="color:var(--text-muted)">Completada:</span> <span style="color:var(--green);margin-left:6px">${formatPendDate(a.completed_at)}</span></div>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="btn-save" style="flex:1;padding:6px" onclick="updatePendStatus('${a.id}','completado');closeMiniModal()">✓ Marcar completada</button>
        <button class="btn-cancel" onclick="deletePendAccion('${a.id}')">🗑 Eliminar</button>
      </div>
    </div>`;

  window._miniModalSave = null;
  document.getElementById('miniModalSaveBtn').style.display = 'none';
  openMiniModal();
}

/* ────────────────────────────────────────────────────────
   ACCIONES CRUD
   ──────────────────────────────────────────────────────── */
async function togglePendComplete(id, done) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const status = done ? 'completado' : 'pendiente';
  const { error } = await sb.from('acciones_pendientes').update({
    status,
    completed_at: done ? new Date().toISOString() : null
  }).eq('id', id);
  if (error) { showToast('⚠ Error: ' + error.message); return; }
  const a = pend.acciones.find(x => x.id === id);
  if (a) { a.status = status; a.completed_at = done ? new Date().toISOString() : null; }
  updatePendientes();
  showToast(done ? '✓ Acción completada' : '↺ Acción reabierta');
}

async function updatePendStatus(id, newStatus) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { error } = await sb.from('acciones_pendientes').update({
    status: newStatus,
    completed_at: newStatus === 'completado' ? new Date().toISOString() : null
  }).eq('id', id);
  if (error) { showToast('⚠ Error: ' + error.message); return; }
  const a = pend.acciones.find(x => x.id === id);
  if (a) a.status = newStatus;
  updatePendientes();
  showToast('✓ Estado actualizado');
}

async function deletePendAccion(id) {
  if (!confirm('¿Eliminar esta acción?')) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  await sb.from('acciones_pendientes').delete().eq('id', id);
  pend.acciones = pend.acciones.filter(a => a.id !== id);
  closeMiniModal();
  updatePendientes();
  showToast('✓ Acción eliminada');
}

function showPendNuevaAccion() {
  const modal = document.getElementById('pendNuevaModal');
  if (modal) modal.style.display = 'block';
}
function closePendNuevaModal() {
  const modal = document.getElementById('pendNuevaModal');
  if (modal) modal.style.display = 'none';
}

async function savePendNuevaAccion() {
  const caseId  = document.getElementById('pendNewCase')?.value;
  const title   = document.getElementById('pendNewTitle')?.value.trim();
  const desc    = document.getElementById('pendNewDesc')?.value.trim();
  const priority= document.getElementById('pendNewPriority')?.value || 'normal';
  const dueDate = document.getElementById('pendNewDate')?.value;

  if (!caseId) { showToast('⚠ Selecciona un expediente'); return; }
  if (!title)  { showToast('⚠ El título es obligatorio'); return; }

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { data: { user } } = await sb.auth.getUser();

  const { data, error } = await sb.from('acciones_pendientes').insert({
    case_id: caseId, user_id: user.id,
    title, description: desc || null,
    priority, status: 'pendiente',
    due_date: dueDate || null,
  }).select('*').single();

  if (error) { showToast('⚠ Error: ' + error.message); return; }
  pend.acciones.unshift(data);
  closePendNuevaModal();
  updatePendientes();
  showToast('✓ Acción creada');
}

/* ── Analizar con IA ── */
function pendAnalyzarIA() {
  const filtered = getFilteredAcciones().filter(a => a.status !== 'completado');
  if (!filtered.length) { showToast('Sin acciones pendientes para analizar'); return; }
  const grouped = {};
  filtered.forEach(a => {
    const c = pend.cases[a.case_id];
    if (!grouped[a.case_id]) grouped[a.case_id] = { case: c, acciones: [] };
    grouped[a.case_id].acciones.push(a);
  });
  const ctx = Object.values(grouped).map(g =>
    `CASO: ${g.case?.name||'—'} (${g.case?.tipo_procedimiento||'—'})
${g.acciones.map(a => `  - ${a.title}${a.due_date?' ['+formatPendDate(a.due_date)+']':''}${a.priority==='alta'?' ⚠URGENTE':''}`).join('\n')}`
  ).join('\n\n');

  if (typeof showView === 'function') showView('viewCase');
  if (typeof showTab === 'function') showTab('tabChat');
  setTimeout(() => {
    const inp = document.getElementById('inputBox');
    if (inp) inp.value = `Analiza las siguientes acciones pendientes y recomienda orden de priorización, plazos críticos y riesgos:\n\n${ctx}`;
  }, 300);
  showToast('✓ Abriendo análisis en el Chat IA');
}

/* ────────────────────────────────────────────────────────
   UI HELPERS
   ──────────────────────────────────────────────────────── */
function togglePendCase(caseId) {
  if (pend.collapsed.has(caseId)) pend.collapsed.delete(caseId);
  else pend.collapsed.add(caseId);
  const body = document.querySelector(`#pcase-${caseId} .pend-case-body`);
  const chev = document.querySelector(`#pcase-${caseId} .pend-chevron`);
  if (body) body.classList.toggle('collapsed', pend.collapsed.has(caseId));
  if (chev) chev.classList.toggle('open', !pend.collapsed.has(caseId));
}

function togglePendCollapseAll() {
  pend.allCollapsed = !pend.allCollapsed;
  const filtered = getFilteredAcciones();
  const caseIds = [...new Set(filtered.map(a => a.case_id))];
  if (pend.allCollapsed) caseIds.forEach(id => pend.collapsed.add(id));
  else pend.collapsed.clear();
  updatePendientes();
}

function updatePendientes() {
  const content = document.getElementById('pendContent');
  const filtered = getFilteredAcciones();
  const totalCases = new Set(filtered.map(a => a.case_id)).size;
  if (content) {
    content.innerHTML = pend.viewMode === 'lista'
      ? renderPendListaView(filtered)
      : renderPendKanbanView(filtered);
  }
  // Update count
  const countEl = document.querySelector('.pend-count-row span');
  if (countEl) countEl.textContent = `Mostrando ${filtered.length} de ${pend.acciones.length} pendientes en ${totalCases} casos`;
  // Update tabs
  document.querySelectorAll('.pend-cat-tab').forEach((btn, i) => {
    const cats = ['all','genero','no_genero','cargos','finalizacion'];
    const counts = [getCatCount('all'), getCatCount('genero'), getCatCount('no_genero'), getCatCount('cargos'), getCatCount('finalizacion')];
    btn.classList.toggle('active', cats[i] === pend.catTab);
    const countEl = btn.querySelector('.pend-tab-count');
    if (countEl) countEl.textContent = counts[i];
  });
  document.querySelectorAll('.pend-status-tab').forEach((btn, i) => {
    const statuses = ['all','pendiente','en_progreso','completado'];
    const s = statuses[i];
    btn.classList.toggle('active', s === pend.statusTab);
  });
}

function formatPendDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('es-CL', {day:'2-digit', month:'2-digit', year:'numeric'}); }
  catch { return d; }
}

/* ────────────────────────────────────────────────────────
   INYECCIÓN DE VISTA
   ──────────────────────────────────────────────────────── */
(function injectPendView() {
  if (document.getElementById('viewPendientes')) return;
  const view = document.createElement('div');
  view.id = 'viewPendientes';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';
  view.innerHTML = `<div id="pendMain" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;background:var(--bg)"><div class="loading" style="padding:40px">Cargando…</div></div>`;
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();

/* ────────────────────────────────────────────────────────
   CSS
   ──────────────────────────────────────────────────────── */
(function injectPendCSS() {
  if (document.getElementById('pend-css')) return;
  const s = document.createElement('style'); s.id = 'pend-css';
  s.textContent = `
/* ── Header ── */
.pend-header{display:flex;align-items:flex-start;justify-content:space-between;padding:14px 18px 10px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pend-title{font-family:var(--font-serif,'EB Garamond',serif);font-size:21px;font-weight:400;color:var(--text);}
.pend-subtitle{font-size:11px;color:var(--text-muted);margin-top:2px;}
.pend-header-actions{display:flex;gap:8px;align-items:center;flex-shrink:0;}
.pend-ia-btn{display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 13px;}
.pend-new-btn{padding:7px 15px;font-size:12px;font-weight:600;}
/* ── Cat tabs ── */
.pend-cat-tabs{display:flex;gap:0;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;overflow-x:auto;}
.pend-cat-tab{display:flex;align-items:center;gap:6px;padding:8px 13px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap;font-family:var(--font-body,'Inter',sans-serif);transition:all .12s;}
.pend-cat-tab:hover{color:var(--text);}
.pend-cat-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:600;}
.pend-tab-count{background:var(--surface3);color:var(--text-muted);font-size:10px;padding:1px 7px;border-radius:10px;font-weight:400;}
.pend-cat-tab.active .pend-tab-count{background:rgba(79,70,229,.1);color:var(--gold);}
/* ── Status tabs ── */
.pend-status-row{display:flex;align-items:center;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pend-status-tabs{display:flex;gap:6px;}
.pend-status-tab{padding:4px 12px;font-size:12px;font-weight:500;border-radius:20px;cursor:pointer;border:1px solid var(--border2);background:none;color:var(--text-muted);font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.pend-status-tab:hover{color:var(--text);}
.pend-status-tab.active{background:var(--gold-glow);color:var(--gold);border-color:var(--gold-dim);}
/* ── Toolbar ── */
.pend-toolbar{display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;}
.pend-search-wrap{display:flex;align-items:center;gap:7px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);padding:5px 10px;flex:1;min-width:200px;max-width:360px;}
.pend-search{border:none;background:none;outline:none;font-size:12.5px;font-family:var(--font-body,'Inter',sans-serif);color:var(--text);width:100%;}
.pend-search::placeholder{color:var(--text-muted);}
.pend-select{background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:5px 10px;border-radius:var(--radius);font-size:12px;font-family:var(--font-body,'Inter',sans-serif);outline:none;cursor:pointer;transition:border-color .15s;}
.pend-select:focus{border-color:var(--gold-dim);}
.pend-view-toggle{display:flex;border:1px solid var(--border2);border-radius:var(--radius);overflow:hidden;}
.pend-view-btn{display:flex;align-items:center;gap:5px;padding:5px 11px;font-size:12px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-family:var(--font-body,'Inter',sans-serif);transition:all .1s;}
.pend-view-btn.active{background:var(--gold-glow);color:var(--gold);}
/* ── Count row ── */
.pend-count-row{display:flex;align-items:center;justify-content:space-between;padding:5px 16px;font-size:11px;color:var(--text-muted);background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0;}
.pend-collapse-all-btn{background:none;border:none;cursor:pointer;font-size:11px;color:var(--gold);font-family:var(--font-body,'Inter',sans-serif);padding:2px 6px;border-radius:4px;}
.pend-collapse-all-btn:hover{background:var(--gold-glow);}
/* ── Content area ── */
.pend-content{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px;}
/* ── Case group ── */
.pend-case-group{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04));}
.pend-case-header{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;cursor:pointer;transition:background .1s;user-select:none;}
.pend-case-header:hover{background:var(--surface2);}
.pend-case-left{display:flex;align-items:center;gap:8px;flex:1;min-width:0;}
.pend-case-right{display:flex;align-items:center;gap:6px;flex-shrink:0;}
.pend-chevron{transition:transform .2s;color:var(--text-muted);}
.pend-chevron.open{transform:none;}
.pend-chevron:not(.open){transform:rotate(-90deg);}
.pend-case-name{font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pend-case-rol{font-size:11px;color:var(--text-muted);font-family:var(--font-mono,'DM Mono',monospace);flex-shrink:0;}
.pend-urgente-badge{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;font-size:10px;font-weight:600;padding:1px 8px;border-radius:8px;}
.pend-count-badge{background:var(--surface2);border:1px solid var(--border2);color:var(--text-muted);font-size:10px;padding:1px 8px;border-radius:8px;}
.pend-case-link{background:none;border:none;cursor:pointer;color:var(--text-muted);padding:3px;border-radius:4px;transition:all .1s;display:flex;align-items:center;}
.pend-case-link:hover{color:var(--gold);background:var(--gold-glow);}
/* ── Case body ── */
.pend-case-body{border-top:1px solid var(--border);transition:all .2s;}
.pend-case-body.collapsed{display:none;}
/* ── Action row ── */
.pend-action-row{display:flex;align-items:center;gap:9px;padding:8px 13px;border-bottom:1px solid var(--border);transition:background .1s;cursor:default;}
.pend-action-row:last-child{border-bottom:none;}
.pend-action-row:hover{background:var(--surface2);}
.pend-action-row.done{opacity:.6;}
.pend-checkbox{width:14px;height:14px;cursor:pointer;accent-color:var(--gold);flex-shrink:0;}
.pend-priority-icon{flex-shrink:0;display:flex;align-items:center;}
.pend-action-body{flex:1;min-width:0;cursor:pointer;}
.pend-action-title{font-size:12.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.pend-action-title.done{text-decoration:line-through;color:var(--text-muted);}
.pend-action-title.overdue{color:#ef4444;}
.pend-action-date{font-size:10.5px;color:var(--text-muted);margin-top:1px;font-family:var(--font-mono,'DM Mono',monospace);}
.pend-action-date.overdue{color:#ef4444;}
.pend-status-pill{font-size:10px;font-weight:500;padding:2px 9px;border-radius:10px;white-space:nowrap;flex-shrink:0;}
.pend-row-arrow{background:none;border:none;cursor:pointer;color:var(--text-muted);padding:3px;border-radius:4px;flex-shrink:0;display:flex;align-items:center;transition:all .1s;}
.pend-row-arrow:hover{color:var(--gold);background:var(--gold-glow);}
/* ── Kanban ── */
.pend-kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:4px;}
.pend-kanban-col{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.pend-kanban-col-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface2);}
.pend-kanban-cards{padding:8px;display:flex;flex-direction:column;gap:6px;max-height:600px;overflow-y:auto;}
.pend-kanban-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;cursor:pointer;transition:all .12s;box-shadow:var(--shadow-xs,0 1px 2px rgba(0,0,0,.04));}
.pend-kanban-card:hover{box-shadow:var(--shadow-sm,0 2px 4px rgba(0,0,0,.06));transform:translateY(-1px);}
.pend-kanban-card-title{font-size:12px;font-weight:500;margin-bottom:5px;line-height:1.4;}
.pend-kanban-card-case{font-size:10.5px;color:var(--text-muted);display:flex;align-items:center;gap:5px;margin-bottom:3px;}
.pend-kanban-card-date{font-size:10px;color:var(--text-muted);font-family:var(--font-mono,'DM Mono',monospace);}
.pend-kanban-card-date.overdue{color:#ef4444;}
`;
  document.head.appendChild(s);
})();
