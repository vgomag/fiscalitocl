/* ══════════════════════════════════════════════════════════════
   mod-alertas-casos.js  —  Sistema de alertas automáticas
   Genera alertas por inactividad, tareas pendientes y urgencia
   crítica. Panel configurable con persistencia en localStorage.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : null;
const DISMISSED_KEY = 'fiscalito_dismissed_alerts';
const SETTINGS_KEY = 'fiscalito_alert_settings';
const REFRESH_MS = 5 * 60 * 1000; // 5 minutos

/* ── Estado ── */
let alerts = [];
let dismissedIds = new Set();
let settings = { enabled: true, noActivityDays: 7, pendingTasksThreshold: 3, showCriticalOnly: false };
let refreshTimer = null;

/* ── Persistencia ── */
function loadPersistedState(){
  try {
    const d = localStorage.getItem(DISMISSED_KEY);
    if(d) dismissedIds = new Set(JSON.parse(d));
    const s = localStorage.getItem(SETTINGS_KEY);
    if(s) settings = { ...settings, ...JSON.parse(s) };
  } catch(e){ console.warn('[alertas] Error cargando estado:', e); }
}
function saveSettings(){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch{}
}
function saveDismissed(){
  try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedIds])); } catch{}
}

/* ── Cálculo de días desde última actividad ── */
function daysSince(dateStr){
  if(!dateStr) return 999;
  const d = new Date(dateStr);
  if(isNaN(d)) return 999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* ── Generar alertas ── */
async function generateAlerts(){
  const s = _sb();
  if(!s || !session || !settings.enabled){ alerts = []; return; }

  try {
    // Cargar casos y tareas pendientes en paralelo
    const [casesRes, checklistRes] = await Promise.all([
      s.from('cases').select('id,name,rol,status,updated_at,created_at')
        .eq('user_id', session.user.id).neq('status','archived').is('deleted_at', null),
      s.from('case_checklist_items').select('case_id')
        .eq('user_id', session.user.id).eq('is_completed', false)
    ]);

    const cases = casesRes.data || [];
    // Contar tareas pendientes por caso
    const pendingMap = {};
    (checklistRes.data || []).forEach(item => {
      pendingMap[item.case_id] = (pendingMap[item.case_id] || 0) + 1;
    });

    const newAlerts = [];

    cases.forEach(c => {
      const daysInactive = daysSince(c.updated_at);
      const pendingTasks = pendingMap[c.id] || 0;

      // Alerta por inactividad
      if(daysInactive >= settings.noActivityDays){
        const severity = daysInactive >= 30 ? 'critical' : daysInactive >= 14 ? 'warning' : 'info';
        newAlerts.push({
          id: c.id + '-no_activity',
          caseId: c.id,
          caseName: c.name || 'Sin nombre',
          caseRol: c.rol,
          type: 'no_activity',
          severity,
          message: `Sin actividad hace ${daysInactive} días`,
          daysInactive
        });
      }

      // Alerta por tareas pendientes
      if(pendingTasks >= settings.pendingTasksThreshold){
        const severity = pendingTasks >= 10 ? 'critical' : pendingTasks >= 5 ? 'warning' : 'info';
        newAlerts.push({
          id: c.id + '-pending_tasks',
          caseId: c.id,
          caseName: c.name || 'Sin nombre',
          caseRol: c.rol,
          type: 'pending_tasks',
          severity,
          message: `${pendingTasks} tareas pendientes`,
          pendingTasks
        });
      }

      // Alerta de urgencia crítica (combinación)
      if(daysInactive >= 14 && pendingTasks >= 3){
        newAlerts.push({
          id: c.id + '-critical_urgency',
          caseId: c.id,
          caseName: c.name || 'Sin nombre',
          caseRol: c.rol,
          type: 'critical_urgency',
          severity: 'critical',
          message: `Caso crítico: ${daysInactive}d inactivo, ${pendingTasks} tareas`
        });
      }
    });

    // Filtrar por severidad si configurado
    let filtered = settings.showCriticalOnly ? newAlerts.filter(a => a.severity === 'critical') : newAlerts;

    // Ordenar: critical > warning > info
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    filtered.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

    alerts = filtered;
  } catch(err){
    console.warn('[alertas] Error generando alertas:', err);
  }

  renderAlertBadge();
}

/* ── Alertas activas (no descartadas) ── */
function getActiveAlerts(){
  return alerts.filter(a => !dismissedIds.has(a.id));
}

/* ── Descartar ── */
function dismissAlert(id){
  dismissedIds.add(id);
  saveDismissed();
  renderAlertPanel();
  renderAlertBadge();
  if(typeof showToast === 'function') showToast('Alerta descartada');
}
function dismissAll(){
  alerts.forEach(a => dismissedIds.add(a.id));
  saveDismissed();
  renderAlertPanel();
  renderAlertBadge();
  if(typeof showToast === 'function') showToast('Todas las alertas descartadas');
}
function clearDismissed(){
  dismissedIds.clear();
  saveDismissed();
  renderAlertPanel();
  renderAlertBadge();
}

/* ── Badge en sidebar ── */
function renderAlertBadge(){
  let badge = document.getElementById('alertBadge');
  const active = getActiveAlerts();
  const criticals = active.filter(a => a.severity === 'critical').length;

  if(!badge) return;
  if(!settings.enabled || active.length === 0){
    badge.style.display = 'none';
    return;
  }
  badge.style.display = '';
  badge.textContent = active.length > 99 ? '99+' : active.length;
  badge.style.background = criticals > 0 ? 'var(--red, #ef4444)' : '#f59e0b';
}

/* ── Panel de alertas ── */
function renderAlertPanel(){
  const panel = document.getElementById('alertPanelBody');
  if(!panel) return;

  const active = getActiveAlerts();
  const criticals = active.filter(a => a.severity === 'critical').length;
  const warnings = active.filter(a => a.severity === 'warning').length;

  if(!settings.enabled){
    panel.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Las alertas están desactivadas. Actívalas en la pestaña Configuración.</div>';
    return;
  }

  if(active.length === 0){
    panel.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)"><div style="font-size:24px;margin-bottom:8px">✅</div><div style="font-size:12px">Sin alertas pendientes</div></div>';
    return;
  }

  const sevIcons = { critical: '🔴', warning: '🟡', info: '🔵' };
  const sevColors = { critical: 'var(--red, #ef4444)', warning: '#f59e0b', info: '#3b82f6' };

  let html = `
    <div style="display:flex;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border)">
      ${criticals > 0 ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(239,68,68,.1);color:#ef4444;font-weight:600">${criticals} críticas</span>` : ''}
      ${warnings > 0 ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(245,158,11,.1);color:#f59e0b;font-weight:600">${warnings} advertencias</span>` : ''}
      <button onclick="dismissAllAlerts()" style="margin-left:auto;font-size:10px;color:var(--text-muted);background:none;border:none;cursor:pointer;text-decoration:underline">Descartar todas</button>
    </div>
    <div class="alert-list-scroll">`;

  active.forEach(a => {
    html += `
      <div class="alert-item" style="border-left:3px solid ${sevColors[a.severity]}">
        <div class="alert-item-header">
          <span>${sevIcons[a.severity]}</span>
          <span class="alert-case-name">${typeof esc === 'function' ? esc(a.caseName) : a.caseName}</span>
          ${a.caseRol ? `<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${typeof esc === 'function' ? esc(a.caseRol) : a.caseRol}</span>` : ''}
          <button class="alert-dismiss" onclick="event.stopPropagation();dismissAlertById('${typeof esc === 'function' ? esc(a.id) : a.id}')" title="Descartar">✕</button>
        </div>
        <div class="alert-message">${typeof esc === 'function' ? esc(a.message) : a.message}</div>
        <button class="alert-goto" onclick="alertGoToCase('${typeof esc === 'function' ? esc(a.caseId) : a.caseId}')">Ver caso →</button>
      </div>`;
  });

  html += '</div>';
  if(dismissedIds.size > 0){
    html += `<div style="text-align:center;padding:6px;border-top:1px solid var(--border)"><button onclick="clearDismissedAlerts()" style="font-size:10px;color:var(--gold);background:none;border:none;cursor:pointer">Restaurar ${dismissedIds.size} descartadas</button></div>`;
  }

  panel.innerHTML = html;
}

/* ── Panel de configuración ── */
function renderSettingsPanel(){
  const panel = document.getElementById('alertSettingsBody');
  if(!panel) return;

  panel.innerHTML = `
    <div class="alert-setting-row">
      <label>Alertas activas</label>
      <label class="alert-toggle">
        <input type="checkbox" ${settings.enabled ? 'checked' : ''} onchange="toggleAlertSetting('enabled', this.checked)"/>
        <span class="alert-toggle-slider"></span>
      </label>
    </div>
    <div class="alert-setting-row">
      <label>Días sin actividad: <strong>${settings.noActivityDays}</strong></label>
      <input type="range" min="1" max="30" value="${settings.noActivityDays}" oninput="updateAlertSetting('noActivityDays', +this.value)"/>
    </div>
    <div class="alert-setting-row">
      <label>Umbral tareas pendientes: <strong>${settings.pendingTasksThreshold}</strong></label>
      <input type="range" min="1" max="20" value="${settings.pendingTasksThreshold}" oninput="updateAlertSetting('pendingTasksThreshold', +this.value)"/>
    </div>
    <div class="alert-setting-row">
      <label>Solo alertas críticas</label>
      <label class="alert-toggle">
        <input type="checkbox" ${settings.showCriticalOnly ? 'checked' : ''} onchange="toggleAlertSetting('showCriticalOnly', this.checked)"/>
        <span class="alert-toggle-slider"></span>
      </label>
    </div>
    <button class="btn-sm" style="width:100%;margin-top:10px" onclick="resetAlertSettings()">Restaurar valores predeterminados</button>`;
}

/* ── Funciones globales ── */
window.dismissAlertById = function(id){ dismissAlert(id); };
window.dismissAllAlerts = function(){ dismissAll(); };
window.clearDismissedAlerts = function(){ clearDismissed(); };
window.alertGoToCase = function(caseId){
  closeAlertPanel();
  if(typeof pickCaseById === 'function') pickCaseById(caseId);
};
window.toggleAlertSetting = function(key, val){
  settings[key] = val;
  saveSettings();
  generateAlerts();
  renderSettingsPanel();
};
window.updateAlertSetting = function(key, val){
  settings[key] = val;
  saveSettings();
  renderSettingsPanel();
  generateAlerts();
};
window.resetAlertSettings = function(){
  settings = { enabled: true, noActivityDays: 7, pendingTasksThreshold: 3, showCriticalOnly: false };
  saveSettings();
  renderSettingsPanel();
  generateAlerts();
};
window.openAlertPanel = function(){
  const panel = document.getElementById('alertPanel');
  if(panel){
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if(panel.style.display !== 'none'){
      generateAlerts().then(() => { renderAlertPanel(); renderSettingsPanel(); });
    }
  }
};
function closeAlertPanel(){
  const panel = document.getElementById('alertPanel');
  if(panel) panel.style.display = 'none';
}
window.closeAlertPanel = closeAlertPanel;
window.switchAlertTab = function(tab){
  document.querySelectorAll('.alert-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const alertBody = document.getElementById('alertPanelBody');
  const settingsBody = document.getElementById('alertSettingsBody');
  if(alertBody) alertBody.style.display = tab === 'alerts' ? '' : 'none';
  if(settingsBody) settingsBody.style.display = tab === 'settings' ? '' : 'none';
};

/* ── Inyectar UI ── */
function injectAlertUI(){
  // Botón en sidebar (junto al título o en la toolbar)
  const toolbar = document.querySelector('.casos-toolbar');
  if(toolbar && !document.getElementById('alertTrigger')){
    const btn = document.createElement('button');
    btn.id = 'alertTrigger';
    btn.className = 'btn-sm';
    btn.style.cssText = 'position:relative;margin-left:6px;';
    btn.innerHTML = '🔔 Alertas <span id="alertBadge" style="display:none;position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;color:white;font-size:9px;font-weight:700;text-align:center;line-height:16px;padding:0 3px"></span>';
    btn.onclick = () => openAlertPanel();
    toolbar.querySelector('div[style*="margin-left"]')?.prepend(btn);
  }

  // Panel flotante
  if(!document.getElementById('alertPanel')){
    const panel = document.createElement('div');
    panel.id = 'alertPanel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="alert-panel-header">
        <span style="font-weight:600;font-size:13px">🔔 Alertas</span>
        <button onclick="closeAlertPanel()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px">✕</button>
      </div>
      <div class="alert-tabs">
        <div class="alert-tab active" data-tab="alerts" onclick="switchAlertTab('alerts')">Alertas</div>
        <div class="alert-tab" data-tab="settings" onclick="switchAlertTab('settings')">Configuración</div>
      </div>
      <div id="alertPanelBody"></div>
      <div id="alertSettingsBody" style="display:none;padding:12px"></div>`;
    document.body.appendChild(panel);
  }
}

/* ── CSS ── */
(function(){
  const old = document.getElementById('alertas-css');
  if(old) old.remove();
  const s = document.createElement('style');
  s.id = 'alertas-css';
  s.textContent = `
    #alertPanel {
      position: fixed; top: 60px; right: 20px; width: 360px; max-height: 520px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: 0 8px 32px rgba(0,0,0,.25);
      z-index: 3000; display: flex; flex-direction: column; overflow: hidden;
    }
    .alert-panel-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; border-bottom: 1px solid var(--border);
    }
    .alert-tabs {
      display: flex; border-bottom: 1px solid var(--border);
    }
    .alert-tab {
      flex: 1; text-align: center; padding: 8px; font-size: 11px;
      cursor: pointer; color: var(--text-muted); transition: all .15s;
      border-bottom: 2px solid transparent;
    }
    .alert-tab.active { color: var(--gold); border-bottom-color: var(--gold); font-weight: 600; }
    .alert-list-scroll { max-height: 340px; overflow-y: auto; }
    .alert-item {
      padding: 10px 12px; border-bottom: 1px solid var(--border);
      transition: background .1s; cursor: default;
    }
    .alert-item:hover { background: var(--surface2); }
    .alert-item-header {
      display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
    }
    .alert-case-name { font-size: 12px; font-weight: 600; color: var(--text); flex: 1; }
    .alert-dismiss {
      background: none; border: none; cursor: pointer; color: var(--text-muted);
      font-size: 12px; opacity: 0; transition: opacity .15s; padding: 2px 4px;
    }
    .alert-item:hover .alert-dismiss { opacity: 1; }
    .alert-message { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
    .alert-goto {
      font-size: 10px; color: var(--gold); background: none; border: none;
      cursor: pointer; padding: 0; text-decoration: underline;
    }
    .alert-setting-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px;
    }
    .alert-setting-row input[type="range"] { width: 120px; accent-color: var(--gold); }
    .alert-toggle { position: relative; width: 36px; height: 20px; cursor: pointer; }
    .alert-toggle input { opacity: 0; width: 0; height: 0; }
    .alert-toggle-slider {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: var(--border2); border-radius: 10px; transition: .2s;
    }
    .alert-toggle-slider::before {
      content: ""; position: absolute; width: 16px; height: 16px;
      left: 2px; bottom: 2px; background: white; border-radius: 50%;
      transition: .2s;
    }
    .alert-toggle input:checked + .alert-toggle-slider { background: var(--gold); }
    .alert-toggle input:checked + .alert-toggle-slider::before { transform: translateX(16px); }
  `;
  document.head.appendChild(s);
})();

/* ── Init ── */
function init(){
  loadPersistedState();
  injectAlertUI();
  // Generar alertas después de que los casos se carguen
  const checkReady = setInterval(() => {
    if(typeof allCases !== 'undefined' && allCases.length > 0 && session){
      clearInterval(checkReady);
      generateAlerts();
      // Auto-refresh cada 5 minutos
      refreshTimer = setInterval(generateAlerts, REFRESH_MS);
    }
  }, 2000);
  console.log('[alertas-casos] Módulo cargado ✓');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
