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
let metadataMap = {};    // case_id → manual_category (string, legacy)
/* Workspace flags: case_id → true cuando la fiscal marca el caso para trabajar
   en él en la pestaña Finalización (vía case_metadata.key='workspace'). NO altera
   status/categoria — el caso sigue siendo Terminado en estadísticas. */
let finalizacionWorkspaceIds = new Set();
let sharesMap = {};      // case_id → { shared_by, role }
let sharedCaseIds = new Set();

/* ── Cargar datos auxiliares desde Supabase ── */
async function loadSubdivisionData(){
  const _sb = typeof sb !== 'undefined' ? sb : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  if(!_sb || !session) return;

  try {
    // Cargar en paralelo: etapas, metadata (manual_category + workspace), y shares
    const [etapasRes, metaRes, wsRes, sharesRes] = await Promise.all([
      _sb.from('etapas').select('case_id,current_stage'),
      _sb.from('case_metadata').select('case_id,key,value').eq('key','manual_category'),
      _sb.from('case_metadata').select('case_id,value').eq('key','workspace'),
      _sb.from('case_shares').select('case_id,shared_by,role')
    ]);

    // Mapear etapas
    etapasMap = {};
    if(etapasRes.data){
      etapasRes.data.forEach(e => { etapasMap[e.case_id] = (e.current_stage||'').toLowerCase().trim(); });
    }

    // Mapear metadata de categoría manual (legacy)
    metadataMap = {};
    if(metaRes.data){
      metaRes.data.forEach(m => { metadataMap[m.case_id] = m.value; });
    }

    // Mapear flags de workspace (finalización u otros workspaces futuros)
    finalizacionWorkspaceIds = new Set();
    if(wsRes.data){
      wsRes.data.forEach(w => { if(w.value === 'finalizacion') finalizacionWorkspaceIds.add(w.case_id); });
    }
    /* Exponer globalmente para que index.html y el redactor puedan consultarlo */
    window.finalizacionWorkspaceIds = finalizacionWorkspaceIds;

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

/* ── Set local de cat-keys válidos (espejo del de index.html). Se duplica acá
   porque index.html lo declara con `const`, no en window, y este módulo IIFE
   no tiene acceso al scope léxico del bloque inline. */
const _LOCAL_VALID_CATS = new Set(['indagatoria_inicial','termino_indagatoria','decision','discusion_prueba','preparacion_vista','finalizacion','terminado']);

/* ── getCaseCat mejorada (categorización por ETAPA PROCESAL) ──
   Las pestañas ahora reflejan dónde está cada caso en el procedimiento,
   no su materia. Misma lógica que mod-export-casos-xlsx.js. */
function getCaseCatEnhanced(c){
  // Prioridad 1: Status terminado/archivado/cerrado
  const st = (c.status || '').toLowerCase();
  if(st === 'terminado' || st === 'archived' || st === 'cerrado') return 'terminado';

  // Prioridad 2: Categoría nueva válida explícitamente seteada en BD (ej. drag&drop manual)
  const dbCat = (c.categoria || '').toLowerCase().trim();
  if(dbCat && _LOCAL_VALID_CATS.has(dbCat)) return dbCat;

  // Prioridad 3: Categoría manual desde case_metadata (solo si es key nueva)
  const metaCat = (metadataMap[c.id] || '').toLowerCase().trim();
  if(metaCat && _LOCAL_VALID_CATS.has(metaCat)) return metaCat;

  // Prioridad 4: Derivar desde etapa procesal (tabla etapas tiene prioridad sobre cases.estado_procedimiento)
  const stage = etapasMap[c.id] || c.estado_procedimiento || '';
  const fromStage = _stageToCat(stage);
  if(fromStage) return fromStage;

  // Default: caso recién creado sin etapa asignada → Indagatoria inicial
  return 'indagatoria_inicial';
}

/* ── Reemplazar getCaseCat global ── */
window.getCaseCat = getCaseCatEnhanced;
window.etapasMap = etapasMap;
window.sharedCaseIds = sharedCaseIds;
window.loadSubdivisionData = loadSubdivisionData;

/* ── Añadir pestaña "Compartidos" y filtro de etapa ── */
function enhanceTabs(){
  const tabsContainer = document.getElementById('casosTabs');
  if(!tabsContainer) return;

  // Añadir pestaña Compartidos si no existe.
  // Orden visual deseado: ...Preparación · Terminados · Compartidos · Finalización.
  // Por eso Compartidos se inserta ANTES de #tab-finalizacion (que ahora es la
  // última pestaña, donde la fiscal trabaja en la resolución de término).
  // Si #tab-finalizacion no existe (carga temprana), se hace fallback a appendChild.
  if(!document.getElementById('tab-compartidos')){
    const sharedTab = document.createElement('div');
    sharedTab.id = 'tab-compartidos';
    sharedTab.className = 'cat-tab';
    sharedTab.onclick = () => setCatTab('compartidos');
    sharedTab.innerHTML = '🔗 Compartidos <span class="tab-count" id="cnt-compartidos">0</span>';
    const finalizacionTab = document.getElementById('tab-finalizacion');
    if(finalizacionTab){
      tabsContainer.insertBefore(sharedTab, finalizacionTab);
    } else {
      tabsContainer.appendChild(sharedTab);
    }
  }

  // El antiguo "stageFilter" select fue REMOVIDO porque era redundante con las
  // cat-tabs (que ya clasifican por etapa procesal) y sus opciones eran de la
  // taxonomía vieja (cargos/descargos/prueba) — causaba confusión y a veces
  // quedaba pegado en un valor sin botón visible para limpiarlo.
  // Si queda alguno residual en el DOM, lo eliminamos al cargar:
  const oldFilter = document.getElementById('stageFilter');
  if(oldFilter){
    const wrap = oldFilter.closest('div');
    if(wrap) wrap.remove();
  }
}

/* ── Filtro de etapa (DEPRECADO: ahora se filtra vía cat-tabs por etapa procesal) ──
   Se mantiene la variable y la función exportada para compatibilidad con código
   antiguo, pero siempre vale 'all' (sin filtro extra) y no se aplica en renderTabla. */
let activeStageFilter = 'all';
window.applyStageFilter = function(val){
  /* No-op: el filtro de etapa se reemplazó por las cat-tabs */
  activeStageFilter = 'all';
};

/* ── Patchear updateCatCounts para incluir compartidos + % de avance ── */
window.updateCatCounts = function(){
  const userId = session?.user?.id;
  /* Filtra casos propios (excluye los compartidos por terceros) */
  const isOwn = c => !(userId && c.user_id !== userId && sharedCaseIds.has(c.id));
  const ACTIVE_KEYS = ['indagatoria_inicial','termino_indagatoria','decision','discusion_prueba','preparacion_vista','finalizacion'];
  const _isPendRes = c => typeof window.isTerminadoPendienteResolucion === 'function' && window.isTerminadoPendienteResolucion(c);
  /* Flag de workspace marcado por la fiscal vía dropdown "Mover a Finalización".
     El caso aparece en Finalización SIN cambiar status (sigue siendo Terminado). */
  const _isWS = c => finalizacionWorkspaceIds && finalizacionWorkspaceIds.has(c.id);

  /* Total de casos ACTIVOS propios (denominador del %) */
  const totalActivos = allCases.filter(c => isOwn(c) && ACTIVE_KEYS.includes(getCaseCat(c))).length;

  /* Pestañas activas: "N · X%" donde X% = N / totalActivos.
     Finalización suma además: (1) terminados pendientes de resolución de término,
     y (2) casos marcados manualmente como workspace='finalizacion' por la fiscal. */
  ACTIVE_KEYS.forEach(cat => {
    const el = document.getElementById('cnt-' + cat);
    if(!el) return;
    let n = allCases.filter(c => isOwn(c) && getCaseCat(c) === cat).length;
    if(cat === 'finalizacion'){
      /* Set para evitar duplicados si un caso cumple varias condiciones */
      const setFinal = new Set();
      allCases.forEach(c => {
        if(!isOwn(c)) return;
        if(getCaseCat(c) === 'finalizacion') setFinal.add(c.id);
        if(_isPendRes(c)) setFinal.add(c.id);
        if(_isWS(c)) setFinal.add(c.id);
      });
      n = setFinal.size;
    }
    const pct = totalActivos > 0 ? Math.round((n / totalActivos) * 100) : 0;
    el.textContent = n + (totalActivos > 0 ? ` · ${pct}%` : '');
  });

  /* Terminados: conteo total (los pendientes de resolución cuentan acá también) */
  const elT = document.getElementById('cnt-terminado');
  if(elT) elT.textContent = allCases.filter(c => isOwn(c) && getCaseCat(c) === 'terminado').length;

  /* Count compartidos */
  const sharedEl = document.getElementById('cnt-compartidos');
  if(sharedEl){
    sharedEl.textContent = allCases.filter(c => userId && c.user_id !== userId && sharedCaseIds.has(c.id)).length;
  }
};

/* ── Patchear renderTabla para soportar filtro de etapa y compartidos ── */
const _origRenderTabla = typeof renderTabla === 'function' ? renderTabla : null;
window.renderTabla = function(searchOverride){
  const q = (searchOverride !== undefined ? searchOverride : document.getElementById('tablaSearch')?.value || '').toLowerCase();
  const userId = session?.user?.id;

  const _isPendRes = c => typeof window.isTerminadoPendienteResolucion === 'function' && window.isTerminadoPendienteResolucion(c);
  const _isWS = c => finalizacionWorkspaceIds && finalizacionWorkspaceIds.has(c.id);

  let cases;
  if(activeCatTab === 'compartidos'){
    // Mostrar solo casos compartidos conmigo
    cases = allCases.filter(c => userId && c.user_id !== userId && sharedCaseIds.has(c.id));
  } else {
    cases = allCases.filter(c => {
      // Excluir compartidos de las pestañas normales
      if(userId && c.user_id !== userId && sharedCaseIds.has(c.id)) return false;
      // Finalización agrupa:
      //  (a) casos activos en etapa 'finalizacion'
      //  (b) terminados sin resolución de término redactada (auto)
      //  (c) cualquier caso marcado manualmente como workspace=finalizacion
      // Ningún caso ALTERA su status por aparecer aquí — Finalización es un workspace.
      if(activeCatTab === 'finalizacion'){
        return getCaseCat(c) === 'finalizacion' || _isPendRes(c) || _isWS(c);
      }
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

  // Filtro de etapa LEGACY removido — la clasificación por etapa ahora la
  // hacen las cat-tabs vía getCaseCat(c). Mantener cualquier filtrado adicional
  // aquí causaba que casos quedaran ocultos sin botón visible para resetear.

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

/* ── Patchear loadCases: cargar datos de subdivisión PRIMERO, luego los casos ──
   FIX race condition: si _origLoadCases corre antes de que termine
   loadSubdivisionData(), etapasMap está vacío y getCaseCat() categoriza mal
   todos los casos, dejándolos en la pestaña incorrecta hasta el próximo refresh. */
const _origLoadCases = typeof loadCases === 'function' ? loadCases : null;
window.loadCases = async function(){
  // 1) Cargar etapas/metadata/shares primero (rápido, una sola query batch)
  await loadSubdivisionData();
  // 2) Luego cargar los casos (renderiza con etapasMap ya disponible)
  if(_origLoadCases) await _origLoadCases.call(window);
  // 3) Actualizar contadores con la lógica enhanced
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
