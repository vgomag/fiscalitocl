/* =========================================================
   MOD-VISTAS-CASOS.JS — Vistas avanzadas de gestión de casos
   v1.0 · 2026-03-31 · Fiscalito / UMAG
   =========================================================
   Fase 1: Kanban + Filtros Avanzados + Vista Tabla mejorada
   — Kanban por etapa procesal con drag & drop
   — Panel de filtros combinables
   — Selector de vista (tabla / kanban / cards)
   ========================================================= */

(function(){
'use strict';

/* ── CONSTANTES ── */
const ETAPAS_PROCESALES = [
  { key: 'indagatoria',   label: 'Indagatoria',   color: '#3B82F6', icon: '🔍' },
  { key: 'cargos',        label: 'Cargos',        color: '#F59E0B', icon: '⚖️' },
  { key: 'descargos',     label: 'Descargos',     color: '#8B5CF6', icon: '🛡️' },
  { key: 'prueba',        label: 'Prueba',        color: '#EC4899', icon: '📋' },
  { key: 'vista',         label: 'Vista Fiscal',  color: '#10B981', icon: '👁️' },
  { key: 'resolucion',    label: 'Resolución',    color: '#6366F1', icon: '📜' },
  { key: 'finalizacion',  label: 'Finalización',  color: '#64748B', icon: '✅' },
  { key: 'sin_etapa',     label: 'Sin etapa',     color: '#94A3B8', icon: '—' },
];

const TIPOS_PROCEDIMIENTO = [
  'Investigación Sumaria',
  'Sumario Administrativo',
  'Sumario',
  'Procedimiento Disciplinario',
];

const PROTOCOLOS = [
  'Protocolo 2020',
  'Protocolo 2022',
  'Reglamento Estudiantes',
  'Protocolo Laboral',
  'Ley Karin',
  'Estatuto Administrativo',
  '34-SU',
  '21-SU-2025',
];

const RESULTADOS = [
  'Sanción', 'Sobreseimiento', 'Absuelto', 'Destitución', 'Multa',
  'Censura', 'Suspensión', 'Amonestación',
];

/* ── ESTADO ── */
let activeView = 'tabla'; // 'tabla', 'kanban', 'cards'
let filtersOpen = false;
let activeFilters = {
  etapa: [],
  tipo_procedimiento: [],
  protocolo: [],
  resultado: [],
  fecha_desde: '',
  fecha_hasta: '',
  medida_cautelar: '',
  judicializada: '',
};

/* ── CSS ── */
function injectCSS(){
  if(document.getElementById('mod-vistas-css')) return;
  const style = document.createElement('style');
  style.id = 'mod-vistas-css';
  style.textContent = `
/* ═══ SELECTOR DE VISTA ═══ */
.vista-selector {
  display: flex; gap: 2px; background: var(--surface, #f8f9fa);
  border: 1px solid var(--border, #e2e8f0); border-radius: 8px; padding: 2px;
}
.vista-btn {
  padding: 5px 12px; border: none; background: transparent; cursor: pointer;
  font-size: 11.5px; font-weight: 500; color: var(--text-muted, #64748b);
  border-radius: 6px; transition: all .15s; display: flex; align-items: center; gap: 4px;
}
.vista-btn:hover { background: rgba(0,0,0,.04); }
.vista-btn.active {
  background: var(--primary, #1a365d); color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,.12);
}
.vista-btn svg { width: 14px; height: 14px; }

/* ═══ PANEL DE FILTROS ═══ */
.filtros-panel {
  display: none; background: var(--surface, #f8f9fa);
  border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  padding: 14px 16px; margin: 8px 12px 0; gap: 12px;
  flex-wrap: wrap; align-items: flex-start;
}
.filtros-panel.open { display: flex; }
.filtro-group { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.filtro-group label {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .5px; color: var(--text-muted, #64748b);
}
.filtro-group select, .filtro-group input[type="date"] {
  font-size: 11.5px; padding: 5px 8px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; background: #fff; color: var(--text, #1e293b);
  min-width: 130px;
}
.filtro-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.filtro-chip {
  font-size: 10.5px; padding: 3px 8px; border-radius: 12px; cursor: pointer;
  border: 1px solid var(--border, #e2e8f0); background: #fff;
  color: var(--text-muted, #64748b); transition: all .15s; white-space: nowrap;
}
.filtro-chip:hover { border-color: var(--primary, #3B82F6); color: var(--primary, #3B82F6); }
.filtro-chip.active {
  background: var(--primary, #3B82F6); color: #fff;
  border-color: var(--primary, #3B82F6);
}
.filtros-actions {
  display: flex; gap: 6px; align-items: flex-end; margin-left: auto;
}
.filtros-badge {
  font-size: 9px; background: var(--primary, #3B82F6); color: #fff;
  border-radius: 8px; padding: 1px 5px; font-weight: 700; margin-left: 4px;
}
.btn-filtrar {
  font-size: 11px; padding: 5px 12px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; background: #fff; cursor: pointer; color: var(--text-muted, #64748b);
  display: flex; align-items: center; gap: 4px; transition: all .15s;
}
.btn-filtrar:hover { border-color: var(--primary, #3B82F6); color: var(--primary, #3B82F6); }
.btn-filtrar.has-filters { border-color: var(--primary, #3B82F6); color: var(--primary, #3B82F6); background: rgba(59,130,246,.05); }

/* ═══ KANBAN ═══ */
.kanban-container {
  display: flex; gap: 10px; padding: 12px; overflow-x: auto;
  flex: 1; min-height: 0; align-items: flex-start;
}
.kanban-col {
  min-width: 220px; max-width: 260px; flex: 1;
  background: var(--surface, #f8f9fa); border-radius: 10px;
  border: 1px solid var(--border, #e2e8f0); display: flex;
  flex-direction: column; max-height: 100%;
}
.kanban-col-header {
  padding: 10px 12px; border-bottom: 1px solid var(--border, #e2e8f0);
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
}
.kanban-col-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.kanban-col-title {
  font-size: 12px; font-weight: 600; color: var(--text, #1e293b);
}
.kanban-col-count {
  font-size: 10px; color: var(--text-muted, #64748b);
  background: rgba(0,0,0,.06); border-radius: 8px; padding: 1px 6px;
  margin-left: auto; font-weight: 600;
}
.kanban-col-body {
  flex: 1; overflow-y: auto; padding: 8px; display: flex;
  flex-direction: column; gap: 6px; min-height: 60px;
}
.kanban-col-body.drag-over {
  background: rgba(59,130,246,.06);
  outline: 2px dashed rgba(59,130,246,.3);
  outline-offset: -4px; border-radius: 6px;
}
.kanban-card {
  background: #fff; border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px; padding: 10px 12px; cursor: pointer;
  transition: all .15s; position: relative;
}
.kanban-card:hover {
  border-color: var(--primary, #3B82F6);
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
  transform: translateY(-1px);
}
.kanban-card.dragging { opacity: .5; transform: rotate(2deg); }
.kanban-card-name {
  font-size: 12px; font-weight: 600; color: var(--text, #1e293b);
  margin-bottom: 4px; line-height: 1.3;
}
.kanban-card-rol {
  font-size: 10px; font-family: var(--font-mono, monospace);
  color: var(--gold, #d4a017); margin-bottom: 6px;
}
.kanban-card-meta {
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
}
.kanban-card-tag {
  font-size: 9.5px; padding: 1px 6px; border-radius: 4px;
  background: rgba(0,0,0,.04); color: var(--text-muted, #64748b);
}
.kanban-card-days {
  font-size: 9.5px; font-weight: 600; margin-left: auto;
}

/* ═══ CARDS VIEW ═══ */
.cards-container {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px; padding: 12px; overflow-y: auto; flex: 1;
}
.caso-card {
  background: #fff; border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px; padding: 16px; cursor: pointer;
  transition: all .15s; display: flex; flex-direction: column; gap: 8px;
}
.caso-card:hover {
  border-color: var(--primary, #3B82F6);
  box-shadow: 0 4px 12px rgba(0,0,0,.08);
  transform: translateY(-2px);
}
.caso-card-header {
  display: flex; align-items: flex-start; justify-content: space-between;
}
.caso-card-name {
  font-size: 14px; font-weight: 600; color: var(--text, #1e293b);
  line-height: 1.3;
}
.caso-card-status {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px;
}
.caso-card-rol {
  font-size: 11px; font-family: var(--font-mono, monospace);
  color: var(--gold, #d4a017);
}
.caso-card-body {
  display: flex; flex-direction: column; gap: 4px;
}
.caso-card-field {
  display: flex; justify-content: space-between; font-size: 11px;
}
.caso-card-field-label { color: var(--text-muted, #64748b); }
.caso-card-field-value { color: var(--text, #1e293b); font-weight: 500; text-align: right; }
.caso-card-footer {
  display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;
  padding-top: 8px; border-top: 1px solid var(--border, #e2e8f0);
}
.caso-card-badge {
  font-size: 9.5px; padding: 2px 8px; border-radius: 6px;
  font-weight: 500;
}
`;
  document.head.appendChild(style);
}

/* ── HELPERS ── */
function esc(s){ return typeof escHtml==='function'?escHtml(String(s||'')):String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function getEtapaKey(caso){
  const ep = (caso.estado_procedimiento||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if(ep.includes('indagat'))  return 'indagatoria';
  if(ep.includes('cargo'))    return 'cargos';
  if(ep.includes('descargo')) return 'descargos';
  if(ep.includes('prueba'))   return 'prueba';
  if(ep.includes('vista'))    return 'vista';
  if(ep.includes('resol'))    return 'resolucion';
  if(ep.includes('final'))    return 'finalizacion';
  return 'sin_etapa';
}

function calcDias(caso){
  try {
    const from = caso.fecha_recepcion_fiscalia || caso.created_at;
    if(!from) return null;
    const d1 = new Date(from), d2 = new Date();
    if(isNaN(d1)) return null;
    return Math.floor((d2 - d1) / 86400000);
  } catch{ return null; }
}

function getDiasColor(dias){
  if(dias===null) return 'var(--text-muted,#94a3b8)';
  if(dias > 60) return 'var(--red,#ef4444)';
  if(dias > 30) return 'var(--gold,#f59e0b)';
  return 'var(--green,#22c55e)';
}

function getFilteredCases(){
  if(typeof allCases==='undefined' || typeof getCaseCat==='undefined' || typeof activeCatTab==='undefined') return [];
  let cases = allCases.filter(c => getCaseCat(c) === activeCatTab);

  // Text search
  const q = (document.getElementById('tablaSearch')?.value||'').toLowerCase();
  if(q){
    const fArr = v => { if(!v) return ''; if(Array.isArray(v)) return v.join(' '); try{return JSON.parse(v).join(' ');}catch{return String(v);} };
    cases = cases.filter(c =>
      (c.name||'').toLowerCase().includes(q) ||
      (c.nueva_resolucion||'').toLowerCase().includes(q) ||
      (c.caratula||'').toLowerCase().includes(q) ||
      (c.materia||'').toLowerCase().includes(q) ||
      fArr(c.denunciantes).toLowerCase().includes(q) ||
      fArr(c.denunciados).toLowerCase().includes(q)
    );
  }

  // Advanced filters
  const f = activeFilters;
  if(f.etapa.length){
    cases = cases.filter(c => f.etapa.includes(getEtapaKey(c)));
  }
  if(f.tipo_procedimiento.length){
    cases = cases.filter(c => f.tipo_procedimiento.includes(c.tipo_procedimiento));
  }
  if(f.protocolo.length){
    cases = cases.filter(c => f.protocolo.includes(c.protocolo));
  }
  if(f.resultado.length){
    cases = cases.filter(c => f.resultado.includes(c.resultado || c.propuesta));
  }
  if(f.fecha_desde){
    const fd = new Date(f.fecha_desde);
    cases = cases.filter(c => {
      const d = new Date(c.fecha_recepcion_fiscalia || c.created_at);
      return !isNaN(d) && d >= fd;
    });
  }
  if(f.fecha_hasta){
    const fh = new Date(f.fecha_hasta);
    cases = cases.filter(c => {
      const d = new Date(c.fecha_recepcion_fiscalia || c.created_at);
      return !isNaN(d) && d <= fh;
    });
  }
  if(f.medida_cautelar === 'si') cases = cases.filter(c => c.medida_cautelar);
  if(f.medida_cautelar === 'no') cases = cases.filter(c => !c.medida_cautelar);
  if(f.judicializada === 'si') cases = cases.filter(c => c.judicializada);
  if(f.judicializada === 'no') cases = cases.filter(c => !c.judicializada);

  return cases;
}

function countActiveFilters(){
  const f = activeFilters;
  let n = f.etapa.length + f.tipo_procedimiento.length + f.protocolo.length + f.resultado.length;
  if(f.fecha_desde) n++;
  if(f.fecha_hasta) n++;
  if(f.medida_cautelar) n++;
  if(f.judicializada) n++;
  return n;
}

/* ── INJECT TOOLBAR ── */
function injectToolbar(){
  const toolbar = document.querySelector('.casos-toolbar');
  if(!toolbar || toolbar.dataset.vistaInjected) return;
  toolbar.dataset.vistaInjected = 'true';

  // Insert view selector before the + Nuevo caso button
  const rightDiv = toolbar.querySelector('div[style*="margin-left"]');

  // Filter button
  const filterBtn = document.createElement('button');
  filterBtn.className = 'btn-filtrar';
  filterBtn.id = 'btnFiltros';
  filterBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12M4 8h8M6 13h4"/></svg> Filtros';
  filterBtn.onclick = toggleFilters;
  toolbar.insertBefore(filterBtn, rightDiv);

  // View selector
  const selector = document.createElement('div');
  selector.className = 'vista-selector';
  selector.id = 'vistaSelector';
  selector.innerHTML = `
    <button class="vista-btn active" data-view="tabla" onclick="setVistaMode('tabla')" title="Vista tabla">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>
      Tabla
    </button>
    <button class="vista-btn" data-view="kanban" onclick="setVistaMode('kanban')" title="Vista kanban">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="4" height="12" rx="1"/><rect x="6" y="2" width="4" height="8" rx="1"/><rect x="11" y="2" width="4" height="10" rx="1"/></svg>
      Kanban
    </button>
    <button class="vista-btn" data-view="cards" onclick="setVistaMode('cards')" title="Vista tarjetas">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
      Tarjetas
    </button>
  `;

  if(rightDiv) rightDiv.insertBefore(selector, rightDiv.firstChild);
}

/* ── INJECT FILTERS PANEL ── */
function injectFiltersPanel(){
  const tabsEl = document.getElementById('casosTabs');
  if(!tabsEl || document.getElementById('filtrosPanel')) return;

  const panel = document.createElement('div');
  panel.className = 'filtros-panel';
  panel.id = 'filtrosPanel';

  const makeChips = (id, items) => items.map(i =>
    `<span class="filtro-chip" data-group="${id}" data-value="${esc(i)}" onclick="toggleFiltroChip(this)">${esc(i)}</span>`
  ).join('');

  panel.innerHTML = `
    <div class="filtro-group">
      <label>Etapa procesal</label>
      <div class="filtro-chips" data-group="etapa">
        ${ETAPAS_PROCESALES.filter(e=>e.key!=='sin_etapa').map(e=>
          `<span class="filtro-chip" data-group="etapa" data-value="${e.key}" onclick="toggleFiltroChip(this)">${e.icon} ${e.label}</span>`
        ).join('')}
      </div>
    </div>
    <div class="filtro-group">
      <label>Tipo procedimiento</label>
      <div class="filtro-chips">${makeChips('tipo_procedimiento', TIPOS_PROCEDIMIENTO)}</div>
    </div>
    <div class="filtro-group">
      <label>Protocolo / Normativa</label>
      <div class="filtro-chips">${makeChips('protocolo', PROTOCOLOS)}</div>
    </div>
    <div class="filtro-group">
      <label>Resultado</label>
      <div class="filtro-chips">${makeChips('resultado', RESULTADOS)}</div>
    </div>
    <div class="filtro-group">
      <label>Fecha desde</label>
      <input type="date" id="filtroFechaDesde" onchange="updateFilterValue('fecha_desde',this.value)"/>
    </div>
    <div class="filtro-group">
      <label>Fecha hasta</label>
      <input type="date" id="filtroFechaHasta" onchange="updateFilterValue('fecha_hasta',this.value)"/>
    </div>
    <div class="filtro-group">
      <label>Medida cautelar</label>
      <select onchange="updateFilterValue('medida_cautelar',this.value)">
        <option value="">Todas</option>
        <option value="si">Con medida</option>
        <option value="no">Sin medida</option>
      </select>
    </div>
    <div class="filtro-group">
      <label>Judicializada</label>
      <select onchange="updateFilterValue('judicializada',this.value)">
        <option value="">Todas</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    </div>
    <div class="filtros-actions">
      <button class="btn-sm" onclick="clearAllFilters()" style="font-size:10.5px;padding:4px 10px">✕ Limpiar filtros</button>
    </div>
  `;

  tabsEl.parentNode.insertBefore(panel, tabsEl.nextSibling);
}

/* ── FILTER FUNCTIONS ── */
window.toggleFilters = function(){
  filtersOpen = !filtersOpen;
  const panel = document.getElementById('filtrosPanel');
  const btn = document.getElementById('btnFiltros');
  if(panel) panel.classList.toggle('open', filtersOpen);
  if(btn) btn.classList.toggle('has-filters', filtersOpen || countActiveFilters()>0);
};

window.toggleFiltroChip = function(el){
  const group = el.dataset.group;
  const value = el.dataset.value;
  if(!activeFilters[group]) return;
  const idx = activeFilters[group].indexOf(value);
  if(idx>=0){ activeFilters[group].splice(idx,1); el.classList.remove('active'); }
  else { activeFilters[group].push(value); el.classList.add('active'); }
  applyFiltersAndRender();
};

window.updateFilterValue = function(key, value){
  activeFilters[key] = value;
  applyFiltersAndRender();
};

window.clearAllFilters = function(){
  activeFilters = { etapa:[],tipo_procedimiento:[],protocolo:[],resultado:[],fecha_desde:'',fecha_hasta:'',medida_cautelar:'',judicializada:'' };
  document.querySelectorAll('#filtrosPanel .filtro-chip').forEach(c=>c.classList.remove('active'));
  document.querySelectorAll('#filtrosPanel select').forEach(s=>s.value='');
  document.querySelectorAll('#filtrosPanel input[type="date"]').forEach(i=>i.value='');
  applyFiltersAndRender();
};

function applyFiltersAndRender(){
  // Update filter badge
  const btn = document.getElementById('btnFiltros');
  const n = countActiveFilters();
  if(btn){
    let badge = btn.querySelector('.filtros-badge');
    if(n>0){
      if(!badge){ badge=document.createElement('span'); badge.className='filtros-badge'; btn.appendChild(badge); }
      badge.textContent = n;
      btn.classList.add('has-filters');
    } else {
      if(badge) badge.remove();
      if(!filtersOpen) btn.classList.remove('has-filters');
    }
  }
  // Update count
  const cases = getFilteredCases();
  const cnt = document.getElementById('casosCount');
  if(cnt) cnt.textContent = cases.length + ' casos';

  // Render active view
  if(activeView==='kanban') renderKanban(cases);
  else if(activeView==='cards') renderCards(cases);
  else if(typeof renderTabla==='function') renderTabla();
}

/* ── VIEW MODE SWITCHING ── */
window.setVistaMode = function(mode){
  activeView = mode;
  // Update buttons
  document.querySelectorAll('#vistaSelector .vista-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.view===mode);
  });

  const tablaWrap = document.querySelector('.tabla-wrap');
  let kanbanEl = document.getElementById('kanbanContainer');
  let cardsEl = document.getElementById('cardsContainer');

  if(mode==='tabla'){
    if(tablaWrap) tablaWrap.style.display='';
    if(kanbanEl) kanbanEl.style.display='none';
    if(cardsEl) cardsEl.style.display='none';
    if(typeof renderTabla==='function') renderTabla();
  } else if(mode==='kanban'){
    if(tablaWrap) tablaWrap.style.display='none';
    if(cardsEl) cardsEl.style.display='none';
    if(!kanbanEl){
      kanbanEl = document.createElement('div');
      kanbanEl.id = 'kanbanContainer';
      kanbanEl.className = 'kanban-container';
      const parent = tablaWrap?.parentNode;
      if(parent) parent.appendChild(kanbanEl);
    }
    kanbanEl.style.display='';
    renderKanban();
  } else if(mode==='cards'){
    if(tablaWrap) tablaWrap.style.display='none';
    if(kanbanEl) kanbanEl.style.display='none';
    if(!cardsEl){
      cardsEl = document.createElement('div');
      cardsEl.id = 'cardsContainer';
      cardsEl.className = 'cards-container';
      const parent = tablaWrap?.parentNode;
      if(parent) parent.appendChild(cardsEl);
    }
    cardsEl.style.display='';
    renderCards();
  }
};

/* ═══════════════════════════════════════════
   KANBAN RENDERING
   ═══════════════════════════════════════════ */
function renderKanban(casesOverride){
  const container = document.getElementById('kanbanContainer');
  if(!container) return;
  const cases = casesOverride || getFilteredCases();

  // Group by etapa
  const groups = {};
  ETAPAS_PROCESALES.forEach(e => groups[e.key]=[]);
  cases.forEach(c => {
    const key = getEtapaKey(c);
    if(!groups[key]) groups[key]=[];
    groups[key].push(c);
  });

  container.innerHTML = ETAPAS_PROCESALES.map(etapa => {
    const items = groups[etapa.key] || [];
    return `
    <div class="kanban-col" data-etapa="${etapa.key}">
      <div class="kanban-col-header">
        <div class="kanban-col-dot" style="background:${etapa.color}"></div>
        <span class="kanban-col-title">${etapa.icon} ${etapa.label}</span>
        <span class="kanban-col-count">${items.length}</span>
      </div>
      <div class="kanban-col-body" data-etapa="${etapa.key}"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="handleKanbanDrop(event,'${etapa.key}')">
        ${items.length===0?'<div style="text-align:center;font-size:10.5px;color:var(--text-muted,#94a3b8);padding:16px 8px">Sin casos</div>':''}
        ${items.map(c=>{
          const dias = calcDias(c);
          const diasColor = getDiasColor(dias);
          const procMap = {'Investigación Sumaria':'IS','Sumario Administrativo':'SA','Sumario':'S','Procedimiento Disciplinario':'PD'};
          return `
          <div class="kanban-card" draggable="true"
               data-caseid="${typeof esc==='function'?esc(c.id):c.id}"
               ondragstart="handleKanbanDragStart(event,'${typeof esc==='function'?esc(c.id):c.id}')"
               ondragend="this.classList.remove('dragging')"
               onclick="pickCaseById('${typeof esc==='function'?esc(c.id):c.id}')">
            <div class="kanban-card-name">${esc(c.name||'Sin nombre')}</div>
            ${c.nueva_resolucion?`<div class="kanban-card-rol">${esc(c.nueva_resolucion)}</div>`:''}
            <div class="kanban-card-meta">
              ${c.tipo_procedimiento?`<span class="kanban-card-tag">${procMap[c.tipo_procedimiento]||esc(c.tipo_procedimiento)}</span>`:''}
              ${c.materia?`<span class="kanban-card-tag">${esc(c.materia.length>20?c.materia.slice(0,20)+'…':c.materia)}</span>`:''}
              ${dias!==null?`<span class="kanban-card-days" style="color:${diasColor}">${dias}d</span>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

/* ── KANBAN DRAG & DROP ── */
let dragCaseId = null;

window.handleKanbanDragStart = function(event, caseId){
  dragCaseId = caseId;
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', caseId);
};

window.handleKanbanDrop = async function(event, targetEtapa){
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const caseId = dragCaseId || event.dataTransfer.getData('text/plain');
  if(!caseId) return;

  const caso = allCases.find(c=>c.id===caseId);
  if(!caso) return;

  const currentEtapa = getEtapaKey(caso);
  if(currentEtapa === targetEtapa) return;

  // Map key back to display value
  const etapaMap = {
    'indagatoria':'Indagatoria', 'cargos':'Cargos', 'descargos':'Descargos',
    'prueba':'Prueba', 'vista':'Vista Fiscal', 'resolucion':'Resolución',
    'finalizacion':'Finalización', 'sin_etapa':''
  };

  const newEtapa = etapaMap[targetEtapa] || '';
  const payload = { estado_procedimiento: newEtapa, updated_at: new Date().toISOString() };

  try {
    const { error } = await sb.from('cases').update(payload).eq('id', caseId);
    if(error) throw error;
    const idx = allCases.findIndex(c=>c.id===caseId);
    if(idx>=0) allCases[idx] = { ...allCases[idx], ...payload };
    renderKanban();
    if(typeof showToast==='function') showToast('✓ Caso movido a ' + (newEtapa||'Sin etapa'));
  } catch(err){
    console.error('Error moviendo caso:', err);
    if(typeof showToast==='function') showToast('⚠️ Error al mover caso');
  }
  dragCaseId = null;
};

/* ═══════════════════════════════════════════
   CARDS VIEW RENDERING
   ═══════════════════════════════════════════ */
function renderCards(casesOverride){
  const container = document.getElementById('cardsContainer');
  if(!container) return;
  const cases = casesOverride || getFilteredCases();

  if(!cases.length){
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted,#64748b);font-size:13px;grid-column:1/-1">Sin expedientes en esta categoría</div>';
    return;
  }

  const statusColors = { active:'#22c55e', terminado:'#94a3b8', archived:'#f59e0b' };

  container.innerHTML = cases.map(c=>{
    const dias = calcDias(c);
    const diasColor = getDiasColor(dias);
    const etapa = ETAPAS_PROCESALES.find(e=>e.key===getEtapaKey(c));
    const fArr = v => { if(!v) return '—'; if(Array.isArray(v)) return v.join(', '); try{return JSON.parse(v).join(', ');}catch{return String(v);} };

    return `
    <div class="caso-card" onclick="pickCaseById('${typeof esc==='function'?esc(c.id):c.id}')">
      <div class="caso-card-header">
        <div>
          <div class="caso-card-name">${esc(c.name||'Sin nombre')}</div>
          ${c.nueva_resolucion?`<div class="caso-card-rol">${esc(c.nueva_resolucion)}</div>`:''}
        </div>
        <div class="caso-card-status" style="background:${statusColors[c.status]||'#94a3b8'}" title="${c.status||''}"></div>
      </div>
      <div class="caso-card-body">
        ${c.caratula?`<div class="caso-card-field"><span class="caso-card-field-label">Carátula</span><span class="caso-card-field-value">${esc(c.caratula.length>30?c.caratula.slice(0,30)+'…':c.caratula)}</span></div>`:''}
        <div class="caso-card-field"><span class="caso-card-field-label">Materia</span><span class="caso-card-field-value">${esc(c.materia||'—')}</span></div>
        <div class="caso-card-field"><span class="caso-card-field-label">Procedimiento</span><span class="caso-card-field-value">${esc(c.tipo_procedimiento||'—')}</span></div>
        <div class="caso-card-field"><span class="caso-card-field-label">Denunciante(s)</span><span class="caso-card-field-value">${esc(fArr(c.denunciantes))}</span></div>
        <div class="caso-card-field"><span class="caso-card-field-label">Denunciado(s)</span><span class="caso-card-field-value">${esc(fArr(c.denunciados))}</span></div>
      </div>
      <div class="caso-card-footer">
        ${etapa?`<span class="caso-card-badge" style="background:${etapa.color}15;color:${etapa.color}">${etapa.icon} ${etapa.label}</span>`:''}
        ${c.protocolo?`<span class="caso-card-badge" style="background:rgba(0,0,0,.05);color:var(--text-muted,#64748b)">${esc(c.protocolo)}</span>`:''}
        ${dias!==null?`<span class="caso-card-badge" style="background:${diasColor}15;color:${diasColor};margin-left:auto;font-weight:600">${dias} días</span>`:''}
      </div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════
   EXPOSE FILTER FUNCTION FOR CORE renderTabla
   ═══════════════════════════════════════════ */
window._applyAdvancedFilters = function(cases){
  const f = activeFilters;
  if(!f) return cases;
  const n = countActiveFilters();
  if(n===0) return cases;

  if(f.etapa.length) cases = cases.filter(c => f.etapa.includes(getEtapaKey(c)));
  if(f.tipo_procedimiento.length) cases = cases.filter(c => f.tipo_procedimiento.includes(c.tipo_procedimiento));
  if(f.protocolo.length) cases = cases.filter(c => f.protocolo.includes(c.protocolo));
  if(f.resultado.length) cases = cases.filter(c => f.resultado.includes(c.resultado || c.propuesta));
  if(f.fecha_desde){
    const fd = new Date(f.fecha_desde);
    cases = cases.filter(c => { const d=new Date(c.fecha_recepcion_fiscalia||c.created_at); return !isNaN(d)&&d>=fd; });
  }
  if(f.fecha_hasta){
    const fh = new Date(f.fecha_hasta);
    cases = cases.filter(c => { const d=new Date(c.fecha_recepcion_fiscalia||c.created_at); return !isNaN(d)&&d<=fh; });
  }
  if(f.medida_cautelar==='si') cases = cases.filter(c => c.medida_cautelar);
  if(f.medida_cautelar==='no') cases = cases.filter(c => !c.medida_cautelar);
  if(f.judicializada==='si') cases = cases.filter(c => c.judicializada);
  if(f.judicializada==='no') cases = cases.filter(c => !c.judicializada);
  return cases;
};

/* ═══════════════════════════════════════════
   PATCH renderTabla TO APPLY FILTERS
   ═══════════════════════════════════════════ */
function patchRenderTabla(){
  if(typeof window.renderTabla !== 'function') return;
  if(window.__renderTablaPatched) return;
  window.__renderTablaPatched = true;

  const origRenderTabla = window.renderTabla;
  window.renderTabla = function(searchOverride){
    // If we're not in tabla mode, don't render table
    if(activeView !== 'tabla') return;
    // Call original
    origRenderTabla.call(this, searchOverride);
    // Re-apply filter count
    const cases = getFilteredCases();
    const cnt = document.getElementById('casosCount');
    if(cnt && countActiveFilters()>0) cnt.textContent = cases.length + ' casos (filtrados)';
  };
}

/* ═══════════════════════════════════════════
   PATCH filterTabla TO WORK WITH ALL VIEWS
   ═══════════════════════════════════════════ */
function patchFilterTabla(){
  if(typeof window.filterTabla !== 'function') return;
  if(window.__filterTablaPatched) return;
  window.__filterTablaPatched = true;

  window.filterTabla = function(q){
    if(activeView==='kanban') renderKanban();
    else if(activeView==='cards') renderCards();
    else if(typeof renderTabla==='function') renderTabla(q);
  };
}

/* ═══════════════════════════════════════════
   PATCH setCatTab TO WORK WITH ALL VIEWS
   ═══════════════════════════════════════════ */
function patchSetCatTab(){
  if(typeof window.setCatTab !== 'function') return;
  if(window.__setCatTabPatched) return;
  window.__setCatTabPatched = true;

  const origSetCatTab = window.setCatTab;
  window.setCatTab = function(cat){
    origSetCatTab.call(this, cat);
    // After original renders table, if we're in different view, switch
    if(activeView==='kanban'){
      const tablaWrap = document.querySelector('.tabla-wrap');
      if(tablaWrap) tablaWrap.style.display='none';
      renderKanban();
      const kanbanEl = document.getElementById('kanbanContainer');
      if(kanbanEl) kanbanEl.style.display='';
    } else if(activeView==='cards'){
      const tablaWrap = document.querySelector('.tabla-wrap');
      if(tablaWrap) tablaWrap.style.display='none';
      renderCards();
      const cardsEl = document.getElementById('cardsContainer');
      if(cardsEl) cardsEl.style.display='';
    }
  };
}

/* ═══════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════ */
function init(){
  const tablaView = document.getElementById('viewTabla');
  if(!tablaView){ setTimeout(init, 100); return; }

  injectCSS();
  injectToolbar();
  injectFiltersPanel();
  patchRenderTabla();
  patchFilterTabla();
  patchSetCatTab();

  console.log('[mod-vistas-casos] Loaded — Kanban + Filtros + Cards');
}

// Wait for DOM + app ready
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>setTimeout(init,200));
else setTimeout(init, 200);

})();
