/* ══════════════════════════════════════════════════════════════
   mod-auto-subdivision.js  —  Auto-categorización inteligente
   Mejora getCaseCat() con detección por regex, etapas procesales,
   filtro por etapa, pestaña de compartidos, y drag & drop.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

/* ── Mapeo etapa procesal → cat key (alineado con mod-export-casos-xlsx.js).
   Las cat-tabs ahora reflejan la etapa procesal del caso, no su materia. */
const STAGE_TO_CAT = {
  indagatoria:           'indagatoria_inicial',
  cargos:                'termino_indagatoria',
  descargos:             'discusion_prueba',
  prueba:                'discusion_prueba',
  probatorio:            'discusion_prueba',
  vista:                 'preparacion_vista',
  'vista fiscal':        'preparacion_vista',
  resolucion:            'decision',
  'resolución':          'decision',
  finalizacion:          'finalizacion',
  'finalización':        'finalizacion',
  termino:               'finalizacion',
  'término':             'finalizacion',
  cerrado:               'terminado'
};

function _stageToCat(stage){
  if(!stage) return null;
  let s = String(stage).toLowerCase().trim();
  try{ s = s.normalize('NFD').replace(/[̀-ͯ]/g,''); }catch{}
  if(STAGE_TO_CAT[s]) return STAGE_TO_CAT[s];
  if(s.includes('indagat'))   return 'indagatoria_inicial';
  if(s.includes('cargo'))     return 'termino_indagatoria';
  if(s.includes('descargo'))  return 'discusion_prueba';
  if(s.includes('prueba'))    return 'discusion_prueba';
  if(s.includes('vista'))     return 'preparacion_vista';
  if(s.includes('resol'))     return 'decision';
  if(s.includes('final'))     return 'finalizacion';
  if(s.includes('termin'))    return 'finalizacion';
  if(s.includes('cerrado'))   return 'terminado';
  return null;
}

/* ── Cache de datos auxiliares ── */
let etapasMap = {};      // case_id → current_stage
let metadataMap = {};    // case_id → { manual_category, ... }
let sharesMap = {};      // case_id → { shared_by, role }
let sharedCaseIds = new Set();

/* ── Cargar datos auxiliares desde Supabase ── */
async function loadSubdivisionData(){
  const _sb = typeof sb !== 'undefined' ? sb : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  if(!_sb || !session) return;

  try {
    // Cargar en paralelo: etapas, metadata manual_category, y shares
    const [etapasRes, metaRes, sharesRes] = await Promise.all([
      _sb.from('etapas').select('case_id,current_stage'),
      _sb.from('case_metadata').select('case_id,key,value').eq('key','manual_category'),
      _sb.from('case_shares').select('case_id,shared_by,role')
    ]);

    // Mapear etapas
    etapasMap = {};
    if(etapasRes.data){
      etapasRes.data.forEach(e => { etapasMap[e.case_id] = (e.current_stage||'').toLowerCase().trim(); });
    }

    // Mapear metadata de categoría manual
    metadataMap = {};
    if(metaRes.data){
      metaRes.data.forEach(m => { metadataMap[m.case_id] = m.value; });
    }

    // Mapear shares
    sharesMap = {};
    sharedCaseIds = new Set();
    if(sharesRes.data){
      sharesRes.data.forEach(s => {
        sharesMap[s.case_id] = { shared_by: s.shared_by, role: s.role };
        sharedCaseIds.add(s.case_id);
      });
    }
  } catch(err){
    console.warn('[auto-subdivision] Error cargando datos auxiliares:', err);
  }
}

/* ── getCaseCat mejorada (categorización por ETAPA PROCESAL) ──
   Las pestañas ahora reflejan dónde está cada caso en el procedimiento,
   no su materia. Misma lógica que mod-export-casos-xlsx.js. */
function getCaseCatEnhanced(c){
  // Prioridad 1: Status terminado/archivado/cerrado
  const st = (c.status || '').toLowerCase();
  if(st === 'terminado' || st === 'archived' || st === 'cerrado') return 'terminado';

  // Prioridad 2: Categoría nueva válida explícitamente seteada en BD (ej. drag&drop manual)
  const dbCat = (c.categoria || '').toLowerCase().trim();
  if(dbCat && VALID_CATS.has(dbCat)) return dbCat;

  // Prioridad 3: Categoría manual desde case_metadata (solo si es key nueva)
  const metaCat = (metadataMap[c.id] || '').toLowerCase().trim();
  if(metaCat && VALID_CATS.has(metaCat)) return metaCat;

  // Prioridad 4: Derivar desde etapa procesal (tabla etapas tiene prioridad sobre cases.estado_procedimiento)
  const stage = etapasMap[c.id] || c.estado_procedimiento || '';
  const fromStage = _stageToCat(stage);
  if(fromStage) return fromStage;

  // Default: caso recién creado sin etapa asignada → Indagatoria inicial
  return 'indagatoria_inicial';
}

/* ── Reemplazar getCaseCat global ── */
window.getCaseCat = getCaseCatEnhanced;

/* ── Exponer helpers globalmente ── */
window.isGenderCase = isGenderCase;
window.etapasMap = etapasMap;
window.sharedCaseIds = sharedCaseIds;
window.loadSubdivisionData = loadSubdivisionData;

/* ── Añadir pestaña "Compartidos" y filtro de etapa ── */
function enhanceTabs(){
  const tabsContainer = document.getElementById('casosTabs');
  if(!tabsContainer) return;

  // Añadir pestaña Compartidos si no existe
  if(!document.getElementById('tab-compartidos')){
    const sharedTab = document.createElement('div');
    sharedTab.id = 'tab-compartidos';
    sharedTab.className = 'cat-tab';
    sharedTab.onclick = () => setCatTab('compartidos');
    sharedTab.innerHTML = '🔗 Compartidos <span class="tab-count" id="cnt-compartidos">0</span>';
    tabsContainer.appendChild(sharedTab);
  }

  // Añadir filtro de etapa si no existe
  if(!document.getElementById('stageFilter')){
    const toolbar = document.querySelector('.casos-toolbar');
    if(toolbar){
      const filterWrap = document.createElement('div');
      filterWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:8px;';
      filterWrap.innerHTML = `
        <label style="font-size:10px;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px">Etapa:</label>
        <select id="stageFilter" class="move-select" style="min-width:140px;font-size:11px" onchange="applyStageFilter(this.value)">
          <option value="all">Todas las etapas</option>
          <option value="sin_etapa">Sin etapa asignada</option>
          <option value="indagatoria">Indagatoria</option>
          <option value="cargos">Cargos</option>
          <option value="descargos">Descargos</option>
          <option value="prueba">Prueba</option>
          <option value="vista">Vista Fiscal</option>
          <option value="resolucion">Resolución</option>
          <option value="cerrado">Cerrado</option>
        </select>`;
      // Insertar después del search
      const searchEl = toolbar.querySelector('.casos-search');
      if(searchEl) searchEl.after(filterWrap);
      else toolbar.prepend(filterWrap);
    }
  }
}

/* ── Filtro de etapa ── */
let activeStageFilter = 'all';
window.applyStageFilter = function(val){
  activeStageFilter = val;
  if(typeof renderTabla === 'function') renderTabla();
};

/* ── Patchear updateCatCounts para incluir compartidos ── */
window.updateCatCounts = function(){
  const userId = session?.user?.id;
  // Counts por categoría (nuevas etapas procesales)
  ['indagatoria_inicial','termino_indagatoria','decision','discusion_prueba','preparacion_vista','finalizacion','terminado'].forEach(cat => {
    const el = document.getElementById('cnt-' + cat);
    if(el) el.textContent = allCases.filter(c => {
      if(userId && c.user_id !== userId && sharedCaseIds.has(c.id)) return false;
      return getCaseCat(c) === cat;
    }).length;
  });
  // Count compartidos
  const sharedEl = document.getElementById('cnt-compartidos');
  if(sharedEl){
    const userId = session?.user?.id;
    sharedEl.textContent = allCases.filter(c => userId && c.user_id !== userId && sharedCaseIds.has(c.id)).length;
  }
};

/* ── Patchear renderTabla para soportar filtro de etapa y compartidos ── */
const _origRenderTabla = typeof renderTabla === 'function' ? renderTabla : null;
window.renderTabla = function(searchOverride){
  const q = (searchOverride !== undefined ? searchOverride : document.getElementById('tablaSearch')?.value || '').toLowerCase();
  const userId = session?.user?.id;

  let cases;
  if(activeCatTab === 'compartidos'){
    // Mostrar solo casos compartidos conmigo
    cases = allCases.filter(c => userId && c.user_id !== userId && sharedCaseIds.has(c.id));
  } else {
    cases = allCases.filter(c => {
      // Excluir compartidos de las pestañas normales
      if(userId && c.user_id !== userId && sharedCaseIds.has(c.id)) return false;
      return getCaseCat(c) === activeCatTab;
    });
  }

  // Aplicar filtro de búsqueda
  if(q){
    const fArr = v => {
      if(!v) return '';
      if(Array.isArray(v)) return v.join(' ');
      try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(' ') : String(v); } catch { return String(v); }
    };
    cases = cases.filter(c =>
      (c.name||'').toLowerCase().includes(q) ||
      (c.nueva_resolucion||'').toLowerCase().includes(q) ||
      (c.caratula||'').toLowerCase().includes(q) ||
      (c.materia||'').toLowerCase().includes(q) ||
      fArr(c.denunciantes).toLowerCase().includes(q) ||
      fArr(c.denunciados).toLowerCase().includes(q)
    );
  }

  // Aplicar filtro de etapa
  if(activeStageFilter !== 'all'){
    cases = cases.filter(c => {
      const stage = etapasMap[c.id] || (c.estado_procedimiento || '').toLowerCase().trim();
      if(activeStageFilter === 'sin_etapa') return !stage;
      return stage === activeStageFilter || stage.includes(activeStageFilter);
    });
  }

  // Delegar al render original si existe
  if(_origRenderTabla){
    // Guardar referencias ANTES de cualquier modificación
    const _backup = window.allCases;
    const _backupCat = window.activeCatTab;
    const _enhancedGetCat = window.getCaseCat; // Guardar la versión enhanced

    // Temporalmente: poner los cases ya filtrados en allCases con flag
    window.allCases = cases.map(c => {
      const clone = Object.assign({}, c);
      clone._forceCategory = activeCatTab;
      return clone;
    });

    // Hacer que getCaseCat devuelva activeCatTab para los clones
    window.getCaseCat = c => c._forceCategory || _enhancedGetCat(c);

    _origRenderTabla.call(window, searchOverride);

    // Restaurar TODO correctamente
    window.allCases = _backup;
    window.activeCatTab = _backupCat;
    window.getCaseCat = _enhancedGetCat; // Restaurar la versión enhanced, no la temp
  }

  // Actualizar contador
  const cnt = document.getElementById('casosCount');
  if(cnt) cnt.textContent = cases.length + ' casos';
};

/* ── Patchear setCatTab para soportar 'compartidos' ── */
window.setCatTab = function(cat){
  activeCatTab = cat;
  if(typeof sortField !== 'undefined'){ window.sortField = null; window.sortDir = 'asc'; }

  document.querySelectorAll('.cat-tab').forEach(t => {
    const onclick = t.getAttribute('onclick') || '';
    const m = onclick.match(/setCatTab\('([^']+)'\)/);
    const tabId = t.id;
    if(m) t.classList.toggle('active', m[1] === cat);
    else if(tabId === 'tab-compartidos') t.classList.toggle('active', cat === 'compartidos');
  });

  renderTabla();
};

/* ── Drag & Drop entre pestañas ── */
function enableDragDrop(){
  // Hacer filas arrastrables
  document.addEventListener('dragstart', e => {
    const tr = e.target.closest('tr[data-caseid]');
    if(tr){
      e.dataTransfer.setData('text/plain', tr.dataset.caseid);
      e.dataTransfer.effectAllowed = 'move';
      tr.style.opacity = '0.5';
    }
  });
  document.addEventListener('dragend', e => {
    const tr = e.target.closest('tr[data-caseid]');
    if(tr) tr.style.opacity = '';
  });

  // Permitir drop en las pestañas
  const tabsContainer = document.getElementById('casosTabs');
  if(!tabsContainer) return;

  tabsContainer.addEventListener('dragover', e => {
    e.preventDefault();
    const tab = e.target.closest('.cat-tab');
    if(tab){
      e.dataTransfer.dropEffect = 'move';
      tab.style.outline = '2px solid var(--gold)';
      tab.style.outlineOffset = '-2px';
    }
  });
  tabsContainer.addEventListener('dragleave', e => {
    const tab = e.target.closest('.cat-tab');
    if(tab) tab.style.outline = '';
  });
  tabsContainer.addEventListener('drop', e => {
    e.preventDefault();
    const tab = e.target.closest('.cat-tab');
    if(!tab) return;
    tab.style.outline = '';

    const caseId = e.dataTransfer.getData('text/plain');
    if(!caseId) return;

    // Determinar categoría destino
    const onclick = tab.getAttribute('onclick') || '';
    const m = onclick.match(/setCatTab\('([^']+)'\)/);
    const tabId = tab.id;
    let targetCat = m ? m[1] : (tabId === 'tab-compartidos' ? null : null);
    if(!targetCat || targetCat === 'compartidos') return;

    moveCase(caseId, targetCat);
  });

  // Hacer las filas draggable al renderizar
  const observer = new MutationObserver(() => {
    document.querySelectorAll('#tablaBody tr[data-caseid]').forEach(tr => {
      if(!tr.draggable){
        tr.draggable = true;
        tr.style.cursor = 'grab';
      }
    });
  });
  const tbody = document.getElementById('tablaBody');
  if(tbody) observer.observe(tbody, { childList: true });
}

/* ── Patchear loadCases para cargar datos auxiliares EN PARALELO ── */
const _origLoadCases = typeof loadCases === 'function' ? loadCases : null;
window.loadCases = async function(){
  // Cargar datos de subdivisión en paralelo con los casos
  await Promise.all([
    loadSubdivisionData(),
    _origLoadCases ? _origLoadCases.call(window) : Promise.resolve()
  ]);
  // Actualizar contadores con la nueva lógica (después de que ambos terminan)
  updateCatCounts();
};

/* ── Inicialización ── */
function init(){
  enhanceTabs();
  enableDragDrop();
  console.log('[auto-subdivision] Módulo cargado ✓');
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ── Inyectar CSS para drag & drop y compartidos ── */
(function injectCSS(){
  const old = document.getElementById('auto-subdiv-css');
  if(old) old.remove();
  const s = document.createElement('style');
  s.id = 'auto-subdiv-css';
  s.textContent = `
    #tab-compartidos { border-left: 1px solid var(--border); margin-left: 4px; padding-left: 12px; }
    .cat-tab { transition: outline .15s, background .15s; }
    .cat-tab[style*="outline"] { background: var(--gold-glow); }
    tr[draggable="true"]:active { cursor: grabbing; }
    #stageFilter { padding: 4px 8px; background: var(--surface2); border: 1px solid var(--border);
      border-radius: var(--radius); color: var(--text); cursor: pointer; }
    #stageFilter:focus { outline: none; border-color: var(--gold); }
    /* Badge de etapa en la tabla */
    .stage-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px;
      font-weight: 600; letter-spacing: .3px; }
    .stage-indagatoria { background: rgba(59,130,246,.1); color: #3b82f6; }
    .stage-cargos { background: rgba(245,158,11,.1); color: #f59e0b; }
    .stage-descargos { background: rgba(34,197,94,.1); color: #22c55e; }
    .stage-prueba { background: rgba(168,85,247,.1); color: #a855f7; }
    .stage-vista { background: rgba(6,182,212,.1); color: #06b6d4; }
    .stage-resolucion { background: rgba(244,63,94,.1); color: #f43f5e; }
    .stage-cerrado { background: rgba(107,114,128,.1); color: #6b7280; }
  `;
  document.head.appendChild(s);
})();

})(); // END OF MAIN IIFE
