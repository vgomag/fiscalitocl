/* ══════════════════════════════════════════════════════════════════════
   MOD-MONDAY-BRIDGE.JS — Mensajes a actuarias en Monday desde Fiscalito
   v1.0 · 2026-04-29 · Fiscalito / UMAG
   ══════════════════════════════════════════════════════════════════════
   Permite a la fiscal enviar updates (comentarios) a sus actuarias
   directamente desde "Mis Casos", apuntando al item de Monday vinculado
   al caso. Los mensajes pueden incluir contexto automático del caso:
   - Carta Gantt (etapas y plazos)
   - Pendientes/acciones del caso
   - Estado actual de la etapa procesal

   El mapping case_id ↔ monday_item_id se persiste en `monday_mappings`
   en Supabase, así no se busca por ROL cada vez (evita rate-limits).

   API expuesta en window:
     - openMondayBridge(caseId)
     - closeMondayBridge()
     - mondaySendMessage()
     - mondayInsertQuickFill(template)
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])));
const _toast = (msg, dur) => (typeof showToast==='function')?showToast(msg, dur):console.log('[monday]', msg);
const _MONDAY_BOARD_ID = '9728211031'; // Board principal de Verónica

const ENDPOINT = '/.netlify/functions/monday';

const state = {
  open: false,
  caseId: null,
  caseObj: null,
  mapping: null,        // {monday_item_id, monday_item_name}
  mondayItem: null,     // datos completos del item desde la API
  users: [],            // lista de usuarios Monday para mention
  selectedUsers: [],    // usuarios a mencionar
  pendientes: [],       // acciones pendientes del caso (Fiscalito)
  sending: false,
  searching: false
};

/* ══════════════════════════════════════════════════════════════════════
   CALL al API de Monday vía Netlify proxy
   ══════════════════════════════════════════════════════════════════════ */
async function _api(action, payload){
  const _doFetch = (typeof authFetch === 'function') ? authFetch : fetch;
  const r = await _doFetch(ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...(payload||{}) })
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

/* ══════════════════════════════════════════════════════════════════════
   CARGAR MAPPING o BUSCAR EN MONDAY
   ══════════════════════════════════════════════════════════════════════ */
async function loadMapping(caseId){
  const s = _sb();
  const { data } = await s.from('monday_mappings')
    .select('monday_item_id, monday_item_name, monday_board_id, last_synced_at, last_message_at')
    .eq('case_id', caseId).maybeSingle();
  return data || null;
}

async function searchInMonday(rol){
  if(!rol) return null;
  state.searching = true;
  _renderBody();
  try {
    const result = await _api('find_item_by_rol', { boardId: _MONDAY_BOARD_ID, rol });
    if(result.found){
      /* Persistir el mapping para futuras veces */
      const s = _sb();
      await s.from('monday_mappings').upsert({
        case_id: state.caseId,
        user_id: state.caseObj.user_id,
        monday_item_id: result.item_id,
        monday_board_id: _MONDAY_BOARD_ID,
        monday_item_name: result.item_name,
        last_synced_at: new Date().toISOString()
      }, { onConflict: 'case_id' });
      return { monday_item_id: result.item_id, monday_item_name: result.item_name, monday_board_id: _MONDAY_BOARD_ID };
    }
    return null;
  } finally { state.searching = false; _renderBody(); }
}

async function loadMondayItem(itemId){
  if(!itemId) return null;
  try {
    const { item } = await _api('get_item', { itemId });
    return item;
  } catch(e){ console.warn('[monday-bridge] get_item falló:', e); return null; }
}

async function loadUsers(){
  if(state.users.length > 0) return state.users;
  try {
    const { users } = await _api('list_users');
    state.users = users || [];
  } catch(e){ console.warn('[monday-bridge] list_users falló:', e); }
  return state.users;
}

async function loadPendientes(caseId){
  const s = _sb();
  const { data } = await s.from('acciones_pendientes')
    .select('title, description, due_date, status')
    .eq('case_id', caseId)
    .neq('status', 'completado')
    .order('due_date', { nullsFirst: false });
  return data || [];
}

/* ══════════════════════════════════════════════════════════════════════
   QUICK FILLS — plantillas de mensajes que la fiscal puede insertar
   ══════════════════════════════════════════════════════════════════════ */
const QUICK_FILLS = {
  estado: {
    label: '📍 Estado actual',
    desc: 'Inserta la etapa procesal actual y la fecha límite',
    build: (c, item) => {
      const etapa = c.estado_procedimiento || c.categoria || '—';
      return `<p><strong>Estado actual:</strong> ${_esc(etapa)}</p>` +
             `<p><strong>Fecha de recepción fiscalía:</strong> ${_esc(c.fecha_recepcion_fiscalia||'—')}</p>`;
    }
  },
  pendientes: {
    label: '⚡ Pendientes',
    desc: 'Lista de acciones pendientes del caso desde Fiscalito',
    build: (c, item, pendientes) => {
      if(!pendientes || pendientes.length === 0)
        return '<p><em>Este caso no tiene acciones pendientes registradas en Fiscalito.</em></p>';
      const items = pendientes.slice(0, 8).map(p =>
        `<li><strong>${_esc(p.title||'Pendiente')}</strong>${p.due_date?` (vence ${_esc(p.due_date)})`:''}${p.description?` — ${_esc(p.description.substring(0,160))}`:''}</li>`
      ).join('');
      return `<p><strong>Pendientes a abordar:</strong></p><ul>${items}</ul>`;
    }
  },
  gantt: {
    label: '📊 Carta Gantt',
    desc: 'Resumen de etapas y plazos legales del procedimiento',
    build: (c) => {
      const tipo = (c.tipo_procedimiento||'').toLowerCase();
      const isSumario = tipo.includes('sumario');
      const plazoIndag = isSumario ? '20 días hábiles' : '5 días hábiles';
      const plazoCargos = '5 días hábiles desde notificación';
      const plazoDescargos = '2 días hábiles para alegar';
      const plazoVista = '5 días hábiles';
      return `<p><strong>Carta Gantt — ${_esc(c.tipo_procedimiento||'Procedimiento')}:</strong></p>` +
             `<ul>` +
             `<li><strong>Indagatoria:</strong> ${plazoIndag} (Art. 135 EA)</li>` +
             `<li><strong>Formulación de cargos:</strong> ${plazoCargos} (Art. 138 EA)</li>` +
             `<li><strong>Descargos y prueba:</strong> ${plazoDescargos} (Art. 139 EA)</li>` +
             `<li><strong>Vista fiscal:</strong> ${plazoVista} (Art. 141 EA)</li>` +
             `</ul>`;
    }
  },
  proximos: {
    label: '🎯 Próximos pasos',
    desc: 'Indica las siguientes acciones según la etapa actual',
    build: (c) => {
      const etapa = (c.categoria||'').toLowerCase();
      let pasos = [];
      if(etapa==='indagatoria_inicial')      pasos = ['Notificar denuncia y/o resolución que instruye', 'Citar a denunciante para ratificar', 'Programar declaraciones iniciales'];
      else if(etapa==='termino_indagatoria') pasos = ['Cerrar etapa indagatoria con resolución', 'Preparar oficio de cargos', 'Notificar formulación de cargos al inculpado'];
      else if(etapa==='discusion_prueba')    pasos = ['Recibir descargos del inculpado', 'Programar audiencia de prueba', 'Decretar diligencias probatorias necesarias'];
      else if(etapa==='preparacion_vista')   pasos = ['Cerrar término probatorio', 'Redactar borrador de Vista Fiscal', 'Foliar expediente y enviar a autoridad'];
      else if(etapa==='decision')            pasos = ['Esperar resolución de la autoridad', 'Notificar resolución al inculpado', 'Preparar acto de término'];
      else                                    pasos = ['Revisar próximas acciones según etapa'];
      const items = pasos.map(p => `<li>${_esc(p)}</li>`).join('');
      return `<p><strong>Próximos pasos sugeridos:</strong></p><ul>${items}</ul>`;
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════
   ABRIR / CERRAR MODAL
   ══════════════════════════════════════════════════════════════════════ */
async function open(caseId){
  const c = (typeof allCases!=='undefined') ? allCases.find(x => x.id===caseId) : null;
  if(!c){ _toast('⚠ Caso no encontrado'); return; }
  state.open = true;
  state.caseId = caseId;
  state.caseObj = c;
  state.mapping = null;
  state.mondayItem = null;
  state.selectedUsers = [];
  _renderModal();

  /* Cargar mapping local; si no existe buscar en Monday por ROL */
  state.mapping = await loadMapping(caseId);
  if(!state.mapping){
    _renderBody();
    state.mapping = await searchInMonday(c.nueva_resolucion || c.name);
  }

  /* Cargar item completo + pendientes + usuarios */
  if(state.mapping?.monday_item_id){
    const [item, pend] = await Promise.all([
      loadMondayItem(state.mapping.monday_item_id),
      loadPendientes(caseId)
    ]);
    state.mondayItem = item;
    state.pendientes = pend;
    /* Pre-seleccionar la actuaria del item Monday */
    if(item){
      const personCol = (item.column_values||[]).find(cv => cv.id==='person');
      if(personCol?.persons_and_teams){
        personCol.persons_and_teams.filter(p=>p.kind==='person').forEach(p=>{
          state.selectedUsers.push(String(p.id));
        });
      }
    }
    loadUsers();
  }
  _renderBody();
}

function close(){
  state.open = false;
  const m = document.getElementById('mondayModal');
  if(m) m.remove();
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER
   ══════════════════════════════════════════════════════════════════════ */
function _renderModal(){
  let m = document.getElementById('mondayModal');
  if(m) m.remove();
  m = document.createElement('div');
  m.id = 'mondayModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  m.innerHTML = `
    <div style="background:var(--bg);width:min(880px,100%);max-height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);border:1px solid var(--border)">
      <div id="mondayHeader" style="flex-shrink:0;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px"></div>
      <div id="mondayBody" style="flex:1;overflow-y:auto;padding:16px 20px"></div>
      <div id="mondayFooter" style="flex-shrink:0;padding:12px 20px;border-top:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:10px;flex-wrap:wrap"></div>
    </div>`;
  document.body.appendChild(m);
  m.addEventListener('click', e => { if(e.target===m) close(); });
  document.addEventListener('keydown', _esc_listener);
  _renderHeader();
  _renderBody();
  _renderFooter();
}
function _esc_listener(e){
  if(e.key === 'Escape' && state.open) close();
  if(e.key === 'Escape') document.removeEventListener('keydown', _esc_listener);
}

function _renderHeader(){
  const el = document.getElementById('mondayHeader');
  if(!el || !state.caseObj) return;
  const c = state.caseObj;
  el.innerHTML = `
    <div style="flex:1;min-width:0">
      <div style="font-family:var(--font-serif,serif);font-size:17px;font-weight:600">📤 Mensaje a actuaria · Monday</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">
        Caso <strong style="color:var(--gold);font-family:var(--font-mono,monospace)">${_esc(c.nueva_resolucion || c.name || '?')}</strong>
        · ${_esc(c.materia||'—')}
      </div>
    </div>
    <button onclick="closeMondayBridge()" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:15px">✕</button>
  `;
}

function _renderBody(){
  const el = document.getElementById('mondayBody');
  if(!el) return;

  if(!state.mapping){
    if(state.searching){
      el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">🔍 Buscando este caso en Monday…</div>`;
      return;
    }
    el.innerHTML = `
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:14px">
        <div style="font-weight:600;color:#92400e;margin-bottom:6px">⚠️ Este caso no está vinculado a Monday</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">No encontré un item con el ROL <strong>${_esc(state.caseObj.nueva_resolucion||state.caseObj.name)}</strong> en tu board principal. Puede ser que no esté creado, o que el formato del N° de Resolución sea distinto.</div>
        <button onclick="resolveMondaySearchManual()" style="background:var(--gold);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit">↻ Reintentar búsqueda</button>
      </div>`;
    return;
  }

  /* Item encontrado, render principal */
  const item = state.mondayItem;
  const statusVal = item ? (item.column_values||[]).find(c=>c.id==='status') : null;
  const personVal = item ? (item.column_values||[]).find(c=>c.id==='person') : null;
  const personasArr = personVal?.persons_and_teams || [];
  const userOptions = state.users.map(u=>{
    const sel = state.selectedUsers.includes(String(u.id));
    return `<label style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;background:${sel?'rgba(124,58,237,.12)':'var(--bg)'};border:1px solid ${sel?'var(--gold)':'var(--border)'};border-radius:14px;cursor:pointer;font-size:11px;margin:0 4px 4px 0">
      <input type="checkbox" ${sel?'checked':''} onchange="toggleMondayMention('${u.id}')" style="margin:0"/>
      ${_esc(u.name)}
    </label>`;
  }).join('');

  el.innerHTML = `
    <!-- Item info -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Item Monday</div>
          <div style="font-size:14px;font-weight:600;margin-top:2px">${_esc(item?.name || state.mapping.monday_item_name || '?')}</div>
          ${item?.url?`<a href="${_esc(item.url)}" target="_blank" style="font-size:11px;color:var(--gold);text-decoration:none">Abrir en Monday ↗</a>`:''}
        </div>
        ${statusVal ? `
          <div style="background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);padding:4px 10px;border-radius:6px">
            <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Etapa Monday</div>
            <div style="font-size:12.5px;font-weight:600;color:#7c3aed;margin-top:1px">${_esc(statusVal.text||'—')}</div>
          </div>` : ''}
      </div>
      ${personasArr.length > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px">👤 Asignada en Monday: ${personasArr.length} persona(s)</div>` : ''}
    </div>

    <!-- Quick fills -->
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600">Insertar contexto del caso</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${Object.entries(QUICK_FILLS).map(([k,v]) => `
          <button onclick="mondayInsertQuickFill('${k}')" title="${_esc(v.desc)}"
            style="background:var(--bg);border:1px solid var(--border);padding:5px 10px;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;color:var(--text)">
            ${v.label}
          </button>`).join('')}
      </div>
    </div>

    <!-- Mensaje -->
    <div style="margin-bottom:14px">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600">Mensaje</div>
      <div id="mondayMsgEditor"
        contenteditable="true"
        style="min-height:140px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.5;outline:none;color:var(--text)"
        oninput="state_msg=this.innerHTML"
        placeholder="Escribe tu mensaje a la actuaria…"></div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Soporta HTML básico (negritas, listas). Los quick-fills insertan formato directo.</div>
    </div>

    <!-- Mentions -->
    <div>
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;font-weight:600">Mencionar (notifica por correo)</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px;min-height:38px">
        ${state.users.length > 0 ? userOptions : '<span style="font-size:11px;color:var(--text-muted)">Cargando usuarios…</span>'}
      </div>
    </div>
  `;
}

function _renderFooter(){
  const el = document.getElementById('mondayFooter');
  if(!el) return;
  const ready = state.mapping && !state.sending;
  el.innerHTML = `
    <button onclick="closeMondayBridge()" style="background:var(--bg);border:1px solid var(--border);padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;font-family:inherit;color:var(--text)">Cancelar</button>
    <div style="flex:1"></div>
    <button onclick="mondaySendMessage()" ${!ready?'disabled':''}
      style="background:${ready?'var(--gold)':'var(--text-muted)'};color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:12.5px;font-weight:600;cursor:${ready?'pointer':'not-allowed'};font-family:inherit">
      ${state.sending?'⏳ Enviando…':'📤 Enviar a Monday'}
    </button>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   ACCIONES UI
   ══════════════════════════════════════════════════════════════════════ */
window.toggleMondayMention = function(userId){
  const idx = state.selectedUsers.indexOf(String(userId));
  if(idx>=0) state.selectedUsers.splice(idx, 1);
  else state.selectedUsers.push(String(userId));
  _renderBody();
};

window.mondayInsertQuickFill = function(key){
  const tpl = QUICK_FILLS[key];
  if(!tpl) return;
  const html = tpl.build(state.caseObj, state.mondayItem, state.pendientes);
  const editor = document.getElementById('mondayMsgEditor');
  if(!editor) return;
  /* Insertar al inicio si está vacío, si no al final con separador */
  if(!editor.innerHTML.trim()){
    editor.innerHTML = html;
  } else {
    editor.innerHTML += '<br>' + html;
  }
  editor.focus();
};

window.resolveMondaySearchManual = async function(){
  if(!state.caseObj) return;
  state.mapping = await searchInMonday(state.caseObj.nueva_resolucion || state.caseObj.name);
  if(state.mapping?.monday_item_id){
    const [item, pend] = await Promise.all([
      loadMondayItem(state.mapping.monday_item_id),
      loadPendientes(state.caseId)
    ]);
    state.mondayItem = item;
    state.pendientes = pend;
    loadUsers();
  }
  _renderBody();
};

window.mondaySendMessage = async function(){
  if(state.sending || !state.mapping) return;
  const editor = document.getElementById('mondayMsgEditor');
  const html = editor ? editor.innerHTML.trim() : '';
  if(!html){ _toast('⚠ Escribe un mensaje primero'); return; }

  state.sending = true;
  _renderFooter();
  try {
    /* Construir mentions: Monday usa <mention> tags en el body para notificar */
    let body = html;
    if(state.selectedUsers.length > 0){
      const mentions = state.selectedUsers.map(uid => {
        const u = state.users.find(x=>String(x.id)===String(uid));
        return u ? `<a class="user-mention" href="https://monday.com/users/${u.id}" data-mention-type="User" data-mention-id="${u.id}">@${_esc(u.name)}</a>` : '';
      }).filter(Boolean).join(' ');
      if(mentions) body = mentions + ' ' + body;
    }

    const { update } = await _api('create_update', {
      itemId: state.mapping.monday_item_id,
      body
    });

    /* Persistir last_message_at */
    const s = _sb();
    await s.from('monday_mappings').update({
      last_message_at: new Date().toISOString()
    }).eq('case_id', state.caseId);

    _toast(`✅ Mensaje enviado a Monday · ${state.selectedUsers.length>0?state.selectedUsers.length+' mención(es)':'sin menciones'}`, 4000);
    close();
  } catch(e){
    console.error('[monday-bridge] send error:', e);
    _toast('❌ Error: ' + (e.message||e));
  } finally {
    state.sending = false;
    _renderFooter();
  }
};

window.openMondayBridge = open;
window.closeMondayBridge = close;

console.log('[mod-monday-bridge] Cargado ✓');
})();
