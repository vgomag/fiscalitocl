/* ══════════════════════════════════════════════════════════════
   mod-etapas-procesales.js  —  Seguimiento de etapas procesales
   Stepper visual, milestones por etapa, avance manual/automático,
   integrado en la vista de detalle de cada caso.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);

/* ── Definiciones de etapas procesales ── */
const STAGE_DEFINITIONS = [
  {
    key: 'indagatoria',
    label: 'Etapa Indagatoria',
    icon: '⚖️',
    color: '#3b82f6',
    bgColor: 'rgba(59,130,246,.08)',
    milestones: [
      { key: 'resolucion_instructora', label: 'Resolución que Instruye', type: 'text_date' },
      { key: 'extracto_denuncia', label: 'Extracto de la Denuncia', type: 'text' },
      { key: 'hechos_denunciados', label: 'Hechos Denunciados', type: 'text' },
      { key: 'normas_infringidas', label: 'Normas Presuntamente Infringidas', type: 'text' }
    ]
  },
  {
    key: 'cargos',
    label: 'Formulación de Cargos',
    icon: '📋',
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,.08)',
    milestones: [
      { key: 'resolucion_cargos', label: 'Resolución de Cargos', type: 'text_date' },
      { key: 'cargos_formulados', label: 'Cargos Formulados', type: 'text' },
      { key: 'notificacion_inculpado', label: 'Notificación al Inculpado', type: 'text_date' }
    ]
  },
  {
    key: 'descargos',
    label: 'Período de Descargos',
    icon: '📝',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,.08)',
    milestones: [
      { key: 'plazo_descargos', label: 'Plazo para Descargos', type: 'text_date' },
      { key: 'descargos_presentados', label: 'Descargos Presentados', type: 'text' },
      { key: 'pruebas_ofrecidas', label: 'Pruebas Ofrecidas por Defensa', type: 'text' }
    ]
  },
  {
    key: 'prueba',
    label: 'Término Probatorio',
    icon: '🔍',
    color: '#a855f7',
    bgColor: 'rgba(168,85,247,.08)',
    milestones: [
      { key: 'resolucion_prueba', label: 'Resolución Abre Término Probatorio', type: 'text_date' },
      { key: 'diligencias_probatorias', label: 'Diligencias Probatorias Realizadas', type: 'text' }
    ]
  },
  {
    key: 'vista',
    label: 'Vista Fiscal',
    icon: '✅',
    color: '#06b6d4',
    bgColor: 'rgba(6,182,212,.08)',
    milestones: [
      { key: 'fecha_vista', label: 'Fecha Vista Fiscal', type: 'text_date' },
      { key: 'recomendacion_fiscal', label: 'Recomendación del Fiscal', type: 'text' }
    ]
  },
  {
    key: 'resolucion',
    label: 'Resolución Final',
    icon: '⚖️',
    color: '#f43f5e',
    bgColor: 'rgba(244,63,94,.08)',
    milestones: [
      { key: 'resolucion_final', label: 'Resolución Final', type: 'text_date' },
      { key: 'decision', label: 'Decisión (Sanción/Sobreseimiento)', type: 'text' },
      { key: 'sancion_aplicada', label: 'Sanción Aplicada', type: 'text' }
    ]
  }
];

const STAGE_KEYS = STAGE_DEFINITIONS.map(s => s.key);

/* ── Datos de la etapa actual del caso ── */
let currentEtapa = null;  // Registro de la tabla etapas

/* ── Cargar etapa de un caso (con verificación de ownership #13) ── */
async function loadCaseEtapa(caseId){
  const s = _sb();
  if(!s || !caseId) return null;
  /* #13: Verificar que el caso pertenece al usuario o está compartido */
  if(typeof currentCase !== 'undefined' && currentCase && currentCase.id === caseId){
    /* OK — estamos en el caso activo del usuario */
  } else if(typeof allCases !== 'undefined' && Array.isArray(allCases)){
    if(!allCases.some(c => c.id === caseId)){
      console.warn('[etapas] Caso no pertenece al usuario:', caseId);
      return null;
    }
  }
  const { data, error } = await s.from('etapas')
    .select('*')
    .eq('case_id', caseId)
    .maybeSingle();
  if(error){ console.warn('[etapas] Error:', error); return null; }
  currentEtapa = data;
  return data;
}

/* ── Crear registro de etapa inicial ── */
async function createEtapa(caseId){
  const s = _sb();
  if(!s || !session) return null;
  const { data, error } = await s.from('etapas').insert({
    case_id: caseId,
    user_id: session.user.id,
    current_stage: 'indagatoria',
    stage_started_at: new Date().toISOString(),
    notes: '{}'
  }).select().single();
  if(error){ console.warn('[etapas] Error creando:', error); return null; }
  currentEtapa = data;
  return data;
}

/* ── Avanzar a la siguiente etapa ── */
async function advanceStage(caseId, targetStage){
  const s = _sb();
  if(!s || !currentEtapa) return;

  const now = new Date().toISOString();
  const currentIdx = STAGE_KEYS.indexOf(currentEtapa.current_stage);
  const targetIdx = STAGE_KEYS.indexOf(targetStage);
  if(targetIdx < 0) return;

  // Marcar etapa actual como completada
  const completedField = currentEtapa.current_stage + '_completed_at';
  const update = {
    current_stage: targetStage,
    stage_started_at: now,
    updated_at: now
  };
  if(currentEtapa.current_stage && !currentEtapa[completedField]){
    update[completedField] = now;
  }

  const { error } = await s.from('etapas').update(update).eq('id', currentEtapa.id);
  if(error){
    if(typeof showToast === 'function') showToast('⚠ Error: ' + error.message);
    return;
  }

  // Actualizar en caché local
  currentEtapa.current_stage = targetStage;
  currentEtapa.stage_started_at = now;
  if(completedField) currentEtapa[completedField] = now;

  // Actualizar mapa global de etapas
  if(typeof etapasMap !== 'undefined') etapasMap[caseId] = targetStage;

  // Actualizar campo estado_procedimiento en la tabla cases
  const stageLabel = STAGE_DEFINITIONS.find(s => s.key === targetStage)?.label || targetStage;
  await s.from('cases').update({
    estado_procedimiento: stageLabel,
    updated_at: now
  }).eq('id', caseId);

  if(typeof showToast === 'function') showToast('✓ Etapa actualizada a: ' + stageLabel);

  // Re-renderizar
  renderEtapasPanel(caseId);
  if(typeof updateCatCounts === 'function') updateCatCounts();
}

/* ── Guardar notas/milestones de una etapa ── */
async function saveMilestone(caseId, stageKey, milestoneKey, value){
  const s = _sb();
  if(!s || !currentEtapa) return;

  let notes = {};
  try { notes = typeof currentEtapa.notes === 'string' ? JSON.parse(currentEtapa.notes) : (currentEtapa.notes || {}); }
  catch { notes = {}; }

  if(!notes[stageKey]) notes[stageKey] = {};
  notes[stageKey][milestoneKey] = value;

  const { error } = await s.from('etapas').update({
    notes: notes,
    updated_at: new Date().toISOString()
  }).eq('id', currentEtapa.id);

  if(error){
    if(typeof showToast === 'function') showToast('⚠ Error: ' + error.message);
    return;
  }
  currentEtapa.notes = notes;
}

/* ── Renderizar el panel de etapas ── */
async function renderEtapasPanel(caseId){
  const container = document.getElementById('etapasPanel');
  if(!container) return;

  if(!currentEtapa) await loadCaseEtapa(caseId);

  if(!currentEtapa){
    container.innerHTML = `
      <div style="text-align:center;padding:30px 20px">
        <div style="font-size:24px;margin-bottom:10px">⚖️</div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
          Este caso aún no tiene etapas procesales asignadas.
        </div>
        <button class="btn-save" onclick="initCaseEtapas('${caseId}')" style="font-size:12px;padding:8px 20px">
          Iniciar seguimiento de etapas
        </button>
      </div>`;
    return;
  }

  const currentStage = currentEtapa.current_stage || 'indagatoria';
  const currentIdx = STAGE_KEYS.indexOf(currentStage);
  let notes = {};
  try { notes = typeof currentEtapa.notes === 'string' ? JSON.parse(currentEtapa.notes) : (currentEtapa.notes || {}); }
  catch { notes = {}; }

  // Calcular días en etapa actual
  const stageStart = currentEtapa.stage_started_at ? new Date(currentEtapa.stage_started_at) : null;
  const daysInStage = stageStart ? Math.floor((Date.now() - stageStart.getTime()) / 86400000) : 0;

  /* ── Stepper visual ── */
  let stepperHtml = '<div class="etapas-stepper">';
  STAGE_DEFINITIONS.forEach((stage, i) => {
    const isCompleted = i < currentIdx;
    const isCurrent = i === currentIdx;
    const isFuture = i > currentIdx;
    const completedField = stage.key + '_completed_at';
    const completedDate = currentEtapa[completedField];

    let statusClass = isCurrent ? 'step-current' : isCompleted ? 'step-completed' : 'step-future';

    stepperHtml += `
      <div class="step ${statusClass}" onclick="toggleStageDetail('${stage.key}')" title="${stage.label}">
        <div class="step-marker" style="--step-color:${stage.color}">
          ${isCompleted ? '✓' : stage.icon}
        </div>
        <div class="step-label">${stage.label}</div>
        ${completedDate ? `<div class="step-date">${new Date(completedDate).toLocaleDateString('es-CL')}</div>` : ''}
        ${isCurrent ? `<div class="step-days">${daysInStage} días</div>` : ''}
      </div>
      ${i < STAGE_DEFINITIONS.length - 1 ? `<div class="step-connector ${isCompleted ? 'connector-completed' : ''}"></div>` : ''}`;
  });
  stepperHtml += '</div>';

  /* ── Detalle de la etapa actual ── */
  const currentStageDef = STAGE_DEFINITIONS[currentIdx];
  const stageNotes = notes[currentStage] || {};

  let detailHtml = `
    <div class="etapa-detail" id="etapaDetail-${currentStage}" style="border-left:3px solid ${currentStageDef.color};background:${currentStageDef.bgColor}">
      <div class="etapa-detail-header">
        <span>${currentStageDef.icon} ${currentStageDef.label}</span>
        <span style="font-size:11px;color:var(--text-muted)">${daysInStage} días en esta etapa</span>
      </div>
      <div class="etapa-milestones">`;

  currentStageDef.milestones.forEach(m => {
    const val = stageNotes[m.key] || '';
    if(m.type === 'text_date'){
      detailHtml += `
        <div class="milestone-item">
          <label>${m.label}</label>
          <input type="text" class="milestone-input" value="${escAttr(val)}"
            placeholder="Ingrese información y/o fecha"
            onchange="saveMilestoneValue('${caseId}','${currentStage}','${m.key}',this.value)"/>
        </div>`;
    } else {
      detailHtml += `
        <div class="milestone-item">
          <label>${m.label}</label>
          <textarea class="milestone-textarea" rows="2" placeholder="Detalle…"
            onchange="saveMilestoneValue('${caseId}','${currentStage}','${m.key}',this.value)">${escHtml(val)}</textarea>
        </div>`;
    }
  });

  detailHtml += '</div>';

  // Botones de avance/retroceso
  detailHtml += '<div class="etapa-actions">';
  if(currentIdx > 0){
    const prevStage = STAGE_KEYS[currentIdx - 1];
    detailHtml += `<button class="btn-sm" onclick="confirmStageChange('${caseId}','${prevStage}','retroceder')" style="color:var(--text-muted)">
      ← Retroceder a ${STAGE_DEFINITIONS[currentIdx-1].label}
    </button>`;
  }
  if(currentIdx < STAGE_KEYS.length - 1){
    const nextStage = STAGE_KEYS[currentIdx + 1];
    detailHtml += `<button class="btn-save" onclick="confirmStageChange('${caseId}','${nextStage}','avanzar')" style="margin-left:auto">
      Avanzar a ${STAGE_DEFINITIONS[currentIdx+1].label} →
    </button>`;
  }
  detailHtml += '</div></div>';

  /* ── Secciones colapsables de etapas anteriores ── */
  let historyHtml = '';
  for(let i = 0; i < currentIdx; i++){
    const stage = STAGE_DEFINITIONS[i];
    const sNotes = notes[stage.key] || {};
    const completedDate = currentEtapa[stage.key + '_completed_at'];
    const hasMilestones = Object.keys(sNotes).length > 0;

    historyHtml += `
      <div class="etapa-history-item" id="etapaDetail-${stage.key}">
        <div class="etapa-history-header" onclick="toggleStageCollapse('${stage.key}')">
          <span style="color:${stage.color}">${stage.icon} ${stage.label}</span>
          <span style="font-size:10px;color:var(--text-muted)">
            ✓ ${completedDate ? new Date(completedDate).toLocaleDateString('es-CL') : 'Completada'}
          </span>
          <span class="collapse-arrow" id="arrow-${stage.key}">▸</span>
        </div>
        <div class="etapa-history-body" id="body-${stage.key}" style="display:none">`;

    if(hasMilestones){
      stage.milestones.forEach(m => {
        const val = sNotes[m.key] || '';
        if(val){
          historyHtml += `<div class="history-milestone"><strong>${m.label}:</strong> ${escHtml(val)}</div>`;
        }
      });
    } else {
      historyHtml += '<div style="color:var(--text-muted);font-size:11px;padding:4px 0">Sin datos registrados</div>';
    }
    historyHtml += '</div></div>';
  }

  container.innerHTML = stepperHtml + detailHtml + (historyHtml ? '<div class="etapa-history-section"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:.5px;margin-bottom:8px">Etapas completadas</div>' + historyHtml + '</div>' : '');
}

/* ── Helpers para escapar (usa global esc() si disponible) ── */
function escAttr(s){ return typeof esc==='function' ? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtml(s){ return typeof esc==='function' ? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Funciones globales ── */
window.initCaseEtapas = async function(caseId){
  await createEtapa(caseId);
  renderEtapasPanel(caseId);
};

window.saveMilestoneValue = async function(caseId, stageKey, milestoneKey, value){
  await saveMilestone(caseId, stageKey, milestoneKey, value);
};

window.confirmStageChange = function(caseId, targetStage, action){
  const stageDef = STAGE_DEFINITIONS.find(s => s.key === targetStage);
  if(!stageDef) return;
  if(confirm(`¿${action === 'avanzar' ? 'Avanzar' : 'Retroceder'} a "${stageDef.label}"?`)){
    advanceStage(caseId, targetStage);
  }
};

window.toggleStageCollapse = function(stageKey){
  const body = document.getElementById('body-' + stageKey);
  const arrow = document.getElementById('arrow-' + stageKey);
  if(body){
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : 'block';
    if(arrow) arrow.textContent = visible ? '▸' : '▾';
  }
};

window.toggleStageDetail = function(stageKey){
  const el = document.getElementById('etapaDetail-' + stageKey);
  if(el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.renderEtapasPanel = renderEtapasPanel;
window.loadCaseEtapa = loadCaseEtapa;
window.STAGE_DEFINITIONS = STAGE_DEFINITIONS;

/* ── Inyectar la pestaña "Etapas" en el viewCase ── */
function injectEtapasTab(){
  // Añadir tab button
  const caseTabs = document.getElementById('caseTabs');
  if(caseTabs && !document.getElementById('tabBtnEtapas')){
    const tabBtn = document.createElement('div');
    tabBtn.id = 'tabBtnEtapas';
    tabBtn.className = 'tab';
    tabBtn.setAttribute('data-tab', 'tabEtapas');
    tabBtn.textContent = '⚖️ Etapas';
    tabBtn.onclick = () => showTab('tabEtapas');
    // Insertar como segundo tab (después de Participantes usando data-tab)
    const participantesTab = caseTabs.querySelector('[data-tab="tabParticipantes"]');
    if(participantesTab && participantesTab.nextSibling){
      caseTabs.insertBefore(tabBtn, participantesTab.nextSibling);
    } else {
      caseTabs.appendChild(tabBtn);
    }
  }

  // Añadir tab content container
  if(!document.getElementById('tabEtapas')){
    const tabContent = document.createElement('div');
    tabContent.id = 'tabEtapas';
    tabContent.className = 'tab-content';
    tabContent.style.display = 'none';
    tabContent.innerHTML = '<div id="etapasPanel" style="padding:16px;overflow-y:auto;flex:1"></div>';
    // Insertar después de tabParticipantes content
    const partContent = document.getElementById('tabParticipantes');
    if(partContent) partContent.after(tabContent);
    else {
      const viewCase = document.getElementById('viewCase');
      if(viewCase) viewCase.appendChild(tabContent);
    }
  }
}

/* ── Patchear showTab para manejar la pestaña Etapas ── */
if(window._etapasPatched) {
  // Already patched, skip
} else {
  const _origShowTab = typeof showTab === 'function' ? showTab : null;
  window.showTab = function(tabId){
    // Manejar el botón de tab de Etapas
    const etapasBtn = document.getElementById('tabBtnEtapas');
    if(etapasBtn) etapasBtn.classList.toggle('active', tabId === 'tabEtapas');

    // Manejar el contenido de Etapas
    const etapasContent = document.getElementById('tabEtapas');
    if(etapasContent){
      etapasContent.style.display = tabId === 'tabEtapas' ? '' : 'none';
      etapasContent.classList.toggle('active', tabId === 'tabEtapas');
    }

    // Si se abre Etapas, cargar datos
    if(tabId === 'tabEtapas' && typeof currentCase !== 'undefined' && currentCase){
      currentEtapa = null; // Forzar recarga
      renderEtapasPanel(currentCase.id);
    }

    // Llamar al original para las otras tabs
    if(_origShowTab) _origShowTab.call(window, tabId);
  };
  window._etapasPatched = true;
}

/* ── Inicialización ── */
function init(){
  patchShowTab();
  injectEtapasTab();
  console.log('[etapas-procesales] Módulo cargado ✓');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

/* ── Inyectar CSS ── */
(function injectCSS(){
  const old = document.getElementById('etapas-css');
  if(old) old.remove();
  const s = document.createElement('style');
  s.id = 'etapas-css';
  s.textContent = `
    /* ── Stepper ── */
    .etapas-stepper {
      display: flex; align-items: flex-start; padding: 16px 8px 20px; gap: 0;
      overflow-x: auto; margin-bottom: 16px;
    }
    .step {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      min-width: 90px; cursor: pointer; transition: transform .15s;
    }
    .step:hover { transform: translateY(-2px); }
    .step-marker {
      width: 38px; height: 38px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; font-size: 16px;
      border: 2px solid var(--border); background: var(--surface);
      transition: all .2s;
    }
    .step-current .step-marker {
      border-color: var(--step-color, var(--gold));
      background: var(--step-color, var(--gold));
      color: white; font-size: 14px;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--step-color, var(--gold)) 20%, transparent);
    }
    .step-completed .step-marker {
      border-color: var(--green); background: var(--green); color: white;
    }
    .step-future .step-marker { opacity: .4; }
    .step-label {
      font-size: 10px; text-align: center; color: var(--text-dim);
      font-weight: 500; line-height: 1.2; max-width: 90px;
    }
    .step-current .step-label { color: var(--text); font-weight: 700; }
    .step-completed .step-label { color: var(--green); }
    .step-future .step-label { opacity: .5; }
    .step-date { font-size: 9px; color: var(--text-muted); font-family: var(--font-mono); }
    .step-days {
      font-size: 9px; color: var(--gold); font-weight: 700;
      background: var(--gold-glow); padding: 1px 6px; border-radius: 8px;
    }
    .step-connector {
      flex: 1; height: 2px; background: var(--border); min-width: 20px;
      margin-top: 19px; align-self: flex-start;
    }
    .connector-completed { background: var(--green); }

    /* ── Detalle etapa ── */
    .etapa-detail {
      padding: 16px; border-radius: var(--radius); margin-bottom: 16px;
    }
    .etapa-detail-header {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 14px; font-weight: 600; margin-bottom: 14px;
    }
    .etapa-milestones { display: flex; flex-direction: column; gap: 10px; }
    .milestone-item label {
      display: block; font-size: 10px; text-transform: uppercase;
      color: var(--text-muted); letter-spacing: .5px; margin-bottom: 4px;
    }
    .milestone-input, .milestone-textarea {
      width: 100%; padding: 8px 10px; font-size: 12px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); color: var(--text);
      font-family: var(--font-body); resize: vertical;
    }
    .milestone-input:focus, .milestone-textarea:focus {
      outline: none; border-color: var(--gold);
    }
    .etapa-actions {
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);
    }

    /* ── Historial ── */
    .etapa-history-section { margin-top: 16px; }
    .etapa-history-item {
      border: 1px solid var(--border); border-radius: var(--radius);
      margin-bottom: 6px; overflow: hidden;
    }
    .etapa-history-header {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      cursor: pointer; font-size: 12px; font-weight: 500;
      transition: background .15s;
    }
    .etapa-history-header:hover { background: var(--surface2); }
    .collapse-arrow {
      margin-left: auto; font-size: 10px; color: var(--text-muted);
    }
    .etapa-history-body { padding: 8px 14px 12px; background: var(--surface2); }
    .history-milestone {
      font-size: 11.5px; color: var(--text-dim); padding: 3px 0;
      line-height: 1.5;
    }
    .history-milestone strong { color: var(--text); font-weight: 600; }

    /* ── Responsive ── */
    @media(max-width:768px){
      .etapas-stepper { flex-wrap: nowrap; }
      .step { min-width: 70px; }
      .step-label { font-size: 9px; }
    }
  `;
  document.head.appendChild(s);
})();

})(); // END OF MAIN IIFE
