/**
 * MOD-SYNC-MONITOR.JS — Monitor de sincronización Supabase + Drive
 * ────────────────────────────────────────────────────────────────
 * Panel flotante que muestra:
 *   - Estado de conexión Supabase (realtime)
 *   - Último sync exitoso
 *   - Cola de operaciones pendientes
 *   - Health check periódico
 *   - Log de errores de red
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-sync-monitor';
  const CHECK_INTERVAL = 60000; // 1 min
  const MAX_LOG = 50;

  let syncLog = [];
  let pendingOps = [];
  let lastSync = null;
  let isOnline = navigator.onLine;
  let checkTimer = null;
  let supabaseStatus = 'checking'; // checking, connected, disconnected, error

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function ts(){ return new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }

  function addLog(type, msg){
    syncLog.unshift({ time: ts(), type, msg });
    if(syncLog.length > MAX_LOG) syncLog.length = MAX_LOG;
    updateBadge();
    if(document.getElementById('syncLogList')) renderLog();
  }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      #syncMonitorBtn { position:fixed; bottom:16px; left:16px; z-index:9990; width:40px; height:40px; border-radius:50%; background:var(--surface); border:1px solid var(--border); cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 2px 8px rgba(0,0,0,.1); transition:all .2s; }
      #syncMonitorBtn:hover { transform:scale(1.1); border-color:var(--gold); }
      #syncMonitorBtn .sm-dot { position:absolute; top:4px; right:4px; width:8px; height:8px; border-radius:50%; }
      #syncMonitorPanel { position:fixed; bottom:64px; left:16px; width:340px; max-height:480px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); z-index:9991; box-shadow:0 4px 20px rgba(0,0,0,.15); display:none; overflow:hidden; }
      #syncMonitorPanel.open { display:flex; flex-direction:column; }
      .sm-header { padding:12px 16px; border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; }
      .sm-header h4 { font-family:var(--font-serif); font-size:14px; margin:0; }
      .sm-body { padding:12px 16px; overflow-y:auto; flex:1; max-height:380px; }
      .sm-status { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:6px; margin-bottom:8px; font-size:12px; }
      .sm-status.ok { background:rgba(5,150,105,.08); }
      .sm-status.warn { background:rgba(245,158,11,.08); }
      .sm-status.err { background:rgba(239,68,68,.08); }
      .sm-dot-lg { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
      .sm-log-item { padding:6px 0; border-bottom:1px solid var(--border); font-size:11px; display:flex; gap:6px; align-items:flex-start; }
      .sm-log-item .time { color:var(--text-muted); font-family:var(--font-mono); white-space:nowrap; flex-shrink:0; }
      .sm-log-item .msg { line-height:1.4; }
      .sm-log-item.error .msg { color:var(--red); }
      .sm-log-item.success .msg { color:var(--green); }
      .sm-counter { display:inline-flex; align-items:center; justify-content:center; min-width:16px; height:16px; border-radius:8px; font-size:9px; font-weight:700; color:#fff; padding:0 4px; position:absolute; top:-2px; right:-4px; }
      .sm-tabs { display:flex; border-bottom:1px solid var(--border); }
      .sm-tab { flex:1; padding:8px; text-align:center; font-size:11px; cursor:pointer; border-bottom:2px solid transparent; color:var(--text-muted); transition:all .15s; }
      .sm-tab.active { color:var(--gold); border-bottom-color:var(--gold); }
    `;
    document.head.appendChild(s);
  }

  /* ── UI ── */
  function createUI(){
    if(document.getElementById('syncMonitorBtn')) return;

    // Botón flotante
    const btn = document.createElement('div');
    btn.id = 'syncMonitorBtn';
    btn.innerHTML = '📡<div class="sm-dot" id="syncDot" style="background:#9ca3af"></div>';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'syncMonitorPanel';
    panel.innerHTML = `
      <div class="sm-header">
        <h4>📡 Sync Monitor</h4>
        <button onclick="document.getElementById('syncMonitorPanel').classList.remove('open')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--text-muted)">&times;</button>
      </div>
      <div class="sm-tabs">
        <div class="sm-tab active" onclick="switchSyncTab('status',this)">Estado</div>
        <div class="sm-tab" onclick="switchSyncTab('log',this)">Log</div>
        <div class="sm-tab" onclick="switchSyncTab('queue',this)">Cola</div>
      </div>
      <div class="sm-body">
        <div id="syncTabStatus"></div>
        <div id="syncTabLog" style="display:none"></div>
        <div id="syncTabQueue" style="display:none"></div>
      </div>`;
    document.body.appendChild(panel);
  }

  function togglePanel(){
    const p = document.getElementById('syncMonitorPanel');
    if(!p) return;
    const open = p.classList.toggle('open');
    if(open){ renderStatus(); renderLog(); renderQueue(); }
  }

  window.switchSyncTab = function(tab, el){
    ['syncTabStatus','syncTabLog','syncTabQueue'].forEach(function(id){
      const d = document.getElementById(id);
      if(d) d.style.display = id === 'syncTab' + tab.charAt(0).toUpperCase() + tab.slice(1) ? '' : 'none';
    });
    el.parentElement.querySelectorAll('.sm-tab').forEach(function(t){ t.classList.remove('active'); });
    el.classList.add('active');
  };

  function renderStatus(){
    const el = document.getElementById('syncTabStatus');
    if(!el) return;

    const statusColors = { connected:'#059669', checking:'#f59e0b', disconnected:'#ef4444', error:'#ef4444' };
    const statusLabels = { connected:'Conectado', checking:'Verificando…', disconnected:'Desconectado', error:'Error' };
    const statusClasses = { connected:'ok', checking:'warn', disconnected:'err', error:'err' };

    el.innerHTML = `
      <div class="sm-status ${statusClasses[supabaseStatus]||'warn'}">
        <div class="sm-dot-lg" style="background:${statusColors[supabaseStatus]||'#9ca3af'}"></div>
        <div>
          <div style="font-weight:600">Supabase: ${statusLabels[supabaseStatus]||supabaseStatus}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${lastSync ? 'Último sync: '+lastSync : 'Sin sincronización reciente'}</div>
        </div>
      </div>
      <div class="sm-status ${isOnline?'ok':'err'}">
        <div class="sm-dot-lg" style="background:${isOnline?'#059669':'#ef4444'}"></div>
        <div>
          <div style="font-weight:600">Red: ${isOnline?'Conectado':'Sin conexión'}</div>
        </div>
      </div>
      <div class="sm-status ${pendingOps.length?'warn':'ok'}">
        <div class="sm-dot-lg" style="background:${pendingOps.length?'#f59e0b':'#059669'}"></div>
        <div>
          <div style="font-weight:600">Cola: ${pendingOps.length} operación(es) pendiente(s)</div>
        </div>
      </div>
      <div style="margin-top:10px;text-align:center">
        <button onclick="window._syncMonitor.forceCheck()" style="background:var(--gold);color:#fff;border:none;padding:6px 16px;border-radius:var(--radius);font-size:11px;cursor:pointer">🔄 Verificar ahora</button>
      </div>`;
  }

  function renderLog(){
    const el = document.getElementById('syncTabLog') || document.getElementById('syncLogList');
    if(!el) return;
    if(!syncLog.length){
      el.innerHTML = '<div style="padding:12px;color:var(--text-muted);text-align:center;font-size:11px">Sin entradas en el log</div>';
      return;
    }
    el.innerHTML = syncLog.map(function(l){
      return `<div class="sm-log-item ${l.type}"><span class="time">${l.time}</span><span class="msg">${escH(l.msg)}</span></div>`;
    }).join('');
  }

  function renderQueue(){
    const el = document.getElementById('syncTabQueue');
    if(!el) return;
    if(!pendingOps.length){
      el.innerHTML = '<div style="padding:12px;color:var(--text-muted);text-align:center;font-size:11px">Sin operaciones pendientes</div>';
      return;
    }
    el.innerHTML = pendingOps.map(function(op){
      return `<div class="sm-log-item"><span class="time">${op.time}</span><span class="msg">${escH(op.table)}.${escH(op.action)} → ${escH(op.status)}</span></div>`;
    }).join('');
  }

  function updateBadge(){
    const dot = document.getElementById('syncDot');
    if(!dot) return;
    const hasErrors = syncLog.some(function(l){ return l.type === 'error'; });
    if(!isOnline || supabaseStatus === 'disconnected') dot.style.background = '#ef4444';
    else if(hasErrors || pendingOps.length) dot.style.background = '#f59e0b';
    else dot.style.background = '#059669';
  }

  /* ── Health Check ── */
  async function healthCheck(){
    if(typeof sb === 'undefined'){ supabaseStatus = 'error'; addLog('error','Supabase client no disponible'); return; }
    try {
      const start = Date.now();
      const { data, error } = await sb.from('cases').select('id', { count: 'exact', head: true });
      const elapsed = Date.now() - start;
      if(error) throw error;
      supabaseStatus = 'connected';
      lastSync = ts();
      addLog('success', `Supabase OK (${elapsed}ms)`);
    } catch(err){
      supabaseStatus = 'error';
      addLog('error', `Supabase: ${err.message||'Error desconocido'}`);
    }
    updateBadge();
    if(document.getElementById('syncTabStatus')) renderStatus();
  }

  /* ── Interceptar operaciones Supabase para monitoreo ── */
  function monkeyPatchSupabase(){
    if(typeof sb === 'undefined') return;
    if(window._syncMonitorFetchPatched) return;
    window._syncMonitorFetchPatched = true;
    // Interceptar fetch global para detectar errores de Supabase
    const origFetch = window.fetch;
    window.fetch = function(){
      const url = arguments[0];
      const urlStr = typeof url === 'string' ? url : (url && url.url ? url.url : '');
      if(urlStr.includes('supabase.co')){
        return origFetch.apply(this, arguments).then(function(resp){
          if(!resp.ok){
            addLog('error', `Supabase ${resp.status}: ${urlStr.split('/').pop()}`);
          } else {
            lastSync = ts();
          }
          return resp;
        }).catch(function(err){
          addLog('error', `Red: ${err.message}`);
          throw err;
        });
      }
      return origFetch.apply(this, arguments);
    };
  }

  /* ── Eventos de red ── */
  window.addEventListener('online', function(){
    isOnline = true;
    addLog('success', 'Conexión restaurada');
    healthCheck();
  });

  window.addEventListener('offline', function(){
    isOnline = false;
    addLog('error', 'Conexión perdida');
    updateBadge();
  });

  /* ── API pública ── */
  window._syncMonitor = {
    forceCheck: healthCheck,
    addLog: addLog,
    getLog: function(){ return syncLog; },
    getPending: function(){ return pendingOps; }
  };

  /* ── Init ── */
  function init(){
    if(checkTimer){clearInterval(checkTimer);checkTimer=null;} /* Evitar doble-init */
    createUI();
    monkeyPatchSupabase();
    healthCheck();
    checkTimer = setInterval(healthCheck, CHECK_INTERVAL);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
