/* =========================================================
   MOD-PENDIENTES.JS  v4  —  Pendientes por Caso
   Fiscalito · 2026-03-25
   ========================================================= */

const pend = {
  acciones: [], cases: {}, loading: false,
  catTab: 'all', statusTab: 'all',
  search: '', caseFilter: 'all',
  viewMode: 'lista', collapsed: new Set(),
};

function openPendientes() {
  document.querySelectorAll('.sidebar-nav-item').forEach(e => e.classList.remove('active'));
  if (typeof event !== 'undefined') event?.currentTarget?.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewPendientes');
  loadPendientesData();
}

async function loadPendientesData() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  pend.loading = true;
  const m = document.getElementById('pendMain');
  if (m) m.innerHTML = '<div style="padding:48px;text-align:center;color:#9ca3af;font-size:13px">Cargando pendientes…</div>';
  try {
    const [acR, caR] = await Promise.all([
      sb.from('acciones_pendientes').select('id,case_id,title,description,status,priority,due_date,created_at,completed_at').order('due_date',{ascending:true,nullsFirst:false}),
      sb.from('cases').select('id,name,rol,categoria,status,tipo_procedimiento,materia').is('deleted_at',null),
    ]);
    pend.acciones = acR.data || [];
    pend.cases = {};
    (caR.data || []).forEach(c => { pend.cases[c.id] = c; });
  } catch(err) { if(typeof showToast==='function') showToast('⚠ '+err.message); }
  finally { pend.loading = false; pendRender(); }
}

function pendGetFiltered() {
  let list = pend.acciones;
  if (pend.catTab !== 'all') list = list.filter(a => pend.cases[a.case_id]?.categoria === pend.catTab);
  if (pend.statusTab !== 'all') list = list.filter(a => a.status === pend.statusTab);
  if (pend.caseFilter !== 'all') list = list.filter(a => a.case_id === pend.caseFilter);
  if (pend.search.trim()) {
    const q = pend.search.toLowerCase();
    list = list.filter(a => (a.title||'').toLowerCase().includes(q)||(pend.cases[a.case_id]?.name||'').toLowerCase().includes(q)||(pend.cases[a.case_id]?.rol||'').toLowerCase().includes(q));
  }
  return list;
}
function pendCatCnt(cat) { return cat==='all'?pend.acciones.length:pend.acciones.filter(a=>pend.cases[a.case_id]?.categoria===cat).length; }
function pendFmt(d) { if(!d)return''; try{return new Date(d.includes('T')?d:d+'T12:00:00').toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch{return d;} }
function pendOvd(a) { return a.due_date&&a.status!=='completado'&&new Date(a.due_date)<new Date(); }

function pendRender() {
  const main = document.getElementById('pendMain');
  if (!main) return;
  main.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;background:#f5f5f7;';

  const filtered = pendGetFiltered();
  const caseCount = new Set(filtered.map(a=>a.case_id)).size;
  const catBase = pend.catTab==='all' ? pend.acciones : pend.acciones.filter(a=>pend.cases[a.case_id]?.categoria===pend.catTab);
  const CATS=[{id:'all',l:'Todos',i:'📋'},{id:'genero',l:'Género',i:'👥'},{id:'no_genero',l:'No Género',i:'📂'},{id:'cargos',l:'Cargos',i:'⚖️'},{id:'finalizacion',l:'Finalización',i:'✅'}];
  const STATS=[{id:'all',l:'Todos'},{id:'pendiente',l:'Pendientes'},{id:'en_progreso',l:'En progreso'},{id:'completado',l:'Completadas'}];

  main.innerHTML = `
<div style="display:flex;flex-direction:column;">
  <div class="pt-topbar">
    <div><div class="pt-title">Pendientes por Caso</div><div class="pt-sub">Organiza las próximas acciones de todos tus casos</div></div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="pt-btn-ia" onclick="pendAnalyzarIA()"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 8.5L7 10l3.5-4"/></svg> Analizar con IA</button>
      <button class="pt-btn-new" onclick="pendShowNueva()">+ Nueva acción</button>
    </div>
  </div>
  <div class="pt-cat-tabs">
    ${CATS.map(c=>`<button class="pt-cat-tab ${pend.catTab===c.id?'act':''}" onclick="pend.catTab='${c.id}';pend.statusTab='all';pendRender()">${c.i} ${c.l} <span class="pt-chip">${pendCatCnt(c.id)}</span></button>`).join('')}
  </div>
  <div class="pt-toolbar">
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
      ${STATS.map(s=>{const cnt=s.id==='all'?catBase.length:catBase.filter(a=>a.status===s.id).length;return`<button class="pt-sbtn ${pend.statusTab===s.id?'act':''} st-${s.id}" onclick="pend.statusTab='${s.id}';pendRender()">${s.l} (${cnt})</button>`;}).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div class="pt-sw"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg><input class="pt-si" placeholder="Buscar…" value="${esc(pend.search)}" oninput="pend.search=this.value;pendRender()"/></div>
      <select class="pt-sel" onchange="pend.caseFilter=this.value;pendRender()">
        <option value="all">Todos los casos</option>
        ${Object.values(pend.cases).filter(c=>pend.acciones.some(a=>a.case_id===c.id)).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>`<option value="${c.id}" ${pend.caseFilter===c.id?'selected':''}>${esc(c.name||'—')}</option>`).join('')}
      </select>
      <div style="display:flex;border:1px solid rgba(0,0,0,.1);border-radius:7px;overflow:hidden">
        <button class="pt-vb ${pend.viewMode==='lista'?'act':''}" onclick="pend.viewMode='lista';pendRender()">≡ Lista</button>
        <button class="pt-vb ${pend.viewMode==='kanban'?'act':''}" onclick="pend.viewMode='kanban';pendRender()">⊞ Kanban</button>
      </div>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;padding:5px 16px;font-size:11px;color:#9ca3af;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)">
    <span>Mostrando ${filtered.length} de ${pend.acciones.length} acciones en ${caseCount} casos</span>
    <button style="background:none;border:none;cursor:pointer;font-size:11px;color:#4f46e5;font-family:inherit;padding:2px 6px;" onclick="pendToggleAll()">${pend.collapsed.size>0?'Expandir todos':'Colapsar todos'}</button>
  </div>
  <div id="pendContent" style="padding:10px 14px;display:flex;flex-direction:column;gap:6px;">
    ${pend.viewMode==='lista'?pendRenderLista(filtered):pendRenderKanban(filtered)}
  </div>
</div>
<div id="pendNuevaModal" class="pt-overlay" style="display:none" onclick="if(event.target===this)pendHideNueva()">
  <div class="pt-modal">
    <div class="pt-modal-title">+ Nueva acción pendiente</div>
    <div class="pt-f"><label>Caso *</label><select id="pnCase"><option value="">— Seleccionar expediente —</option>${Object.values(pend.cases).sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>`<option value="${c.id}">${esc(c.name||'—')}${c.rol?' · '+esc(c.rol):''}</option>`).join('')}</select></div>
    <div class="pt-f"><label>Título *</label><input id="pnTitle" placeholder="Ej: Citar a denunciante - Res. 60/2026"/></div>
    <div class="pt-f"><label>Descripción</label><textarea id="pnDesc" rows="2" placeholder="Descripción opcional…" style="resize:vertical"></textarea></div>
    <div style="display:flex;gap:10px">
      <div class="pt-f" style="flex:1"><label>Prioridad</label><select id="pnPriority"><option value="alta">🔴 Urgente</option><option value="normal" selected>🟡 Normal</option><option value="baja">⚪ Baja</option></select></div>
      <div class="pt-f" style="flex:1"><label>Fecha límite</label><input type="date" id="pnDate"/></div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
      <button class="pt-btn-cancel" onclick="pendHideNueva()">Cancelar</button>
      <button class="pt-btn-new" onclick="pendSaveNueva()">Guardar acción</button>
    </div>
  </div>
</div>`;
}

function pendRenderLista(filtered) {
  if(!filtered.length) return '<div style="padding:48px;text-align:center;color:#9ca3af;font-size:13px">Sin acciones que coincidan con los filtros.</div>';
  const byCase={};
  filtered.forEach(a=>{if(!byCase[a.case_id])byCase[a.case_id]=[];byCase[a.case_id].push(a);});
  const sorted=Object.entries(byCase).sort(([,al],[,bl])=>(al.some(a=>a.priority==='alta'||a.priority==='urgente')?0:1)-(bl.some(b=>b.priority==='alta'||b.priority==='urgente')?0:1));
  const CAT_CLR={genero:'#db2777',no_genero:'#d97706',cargos:'#4f46e5',finalizacion:'#059669',terminado:'#6b7280'};
  return sorted.map(([cid,items])=>{
    const c=pend.cases[cid]||{};
    const isOpen=!pend.collapsed.has(cid);
    const urgCnt=items.filter(a=>a.priority==='alta'||a.priority==='urgente').length;
    const ovdCnt=items.filter(a=>pendOvd(a)).length;
    return `<div class="pt-group">
  <div class="pt-gh" onclick="pendToggleCase('${cid}')">
    <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
      <svg style="flex-shrink:0;transition:transform .18s;transform:${isOpen?'rotate(0deg)':'rotate(-90deg)'};color:#9ca3af" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="2,4 6,8 10,4"/></svg>
      ${c.categoria?`<span style="width:7px;height:7px;border-radius:50%;background:${CAT_CLR[c.categoria]||'#9ca3af'};flex-shrink:0;display:inline-block"></span>`:''}
      <span style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.name||'—')}</span>
      ${c.rol?`<span style="font-size:10.5px;color:#9ca3af;font-family:var(--font-mono,'DM Mono',monospace);flex-shrink:0">${esc(c.rol)}</span>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
      ${ovdCnt>0?`<span class="pt-ovd-chip">⚠ ${ovdCnt} vencida${ovdCnt>1?'s':''}</span>`:''}
      ${urgCnt>0?`<span class="pt-urg-chip">${urgCnt} urgente${urgCnt>1?'s':''}</span>`:''}
      <span class="pt-tot-chip">${items.length} acción${items.length!==1?'es':''}</span>
      <button style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:3px 5px;border-radius:4px;display:flex;align-items:center" title="Abrir caso" onclick="event.stopPropagation();typeof pickCaseById!=='undefined'&&pickCaseById('${cid}')"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9"/><path d="M13 1h2v2M9.5 6.5l5-5"/></svg></button>
    </div>
  </div>
  <div id="ptb-${cid}" style="border-top:1px solid rgba(0,0,0,.06);${isOpen?'':'display:none'}">
    ${items.map(a=>pendRenderRow(a)).join('')}
  </div>
</div>`;
  }).join('');
}

function pendRenderRow(a) {
  const done=a.status==='completado',inProg=a.status==='en_progreso',ovd=pendOvd(a),urg=a.priority==='alta'||a.priority==='urgente';
  const dotClr=urg?'#ef4444':inProg?'#4f46e5':'#d1d5db';
  const slabel=done?'Completada':inProg?'En progreso':'Pendiente';
  const scls=done?'pill-done':inProg?'pill-prog':'pill-pend';
  return `<div class="pt-row ${done?'pt-row-done':''}" onclick="pendOpenDetail('${a.id}')">
  <input type="checkbox" style="width:14px;height:14px;cursor:pointer;accent-color:#4f46e5;flex-shrink:0" ${done?'checked':''} onclick="event.stopPropagation()" onchange="pendToggleDone('${a.id}',this.checked)"/>
  <span style="width:7px;height:7px;border-radius:50%;background:${dotClr};flex-shrink:0;display:inline-block"></span>
  <div style="flex:1;min-width:0">
    <div style="font-size:12.5px;font-weight:500;color:${done?'#9ca3af':'#111'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${done?'text-decoration:line-through':''}${ovd?';color:#ef4444':''}">${esc(a.title||'—')}</div>
    ${a.due_date?`<div style="font-size:10.5px;color:${ovd?'#ef4444':'#9ca3af'};font-family:var(--font-mono,'DM Mono',monospace)">📅 ${pendFmt(a.due_date)}${ovd?' · Vencida':''}</div>`:''}
  </div>
  <span class="pt-pill ${scls}">${slabel}</span>
  <svg style="flex-shrink:0" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"><polyline points="6,4 10,8 6,12"/></svg>
</div>`;
}

function pendRenderKanban(filtered) {
  const cols=[{id:'pendiente',l:'Pendientes',c:'#f59e0b'},{id:'en_progreso',l:'En progreso',c:'#4f46e5'},{id:'completado',l:'Completadas',c:'#059669'}];
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
  ${cols.map(col=>{
    const items=filtered.filter(a=>a.status===col.id);
    return `<div style="background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.06);background:#fafafa;border-top:3px solid ${col.c}">
        <b style="font-size:12px">${col.l}</b><span class="pt-tot-chip">${items.length}</span>
      </div>
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px;max-height:520px;overflow-y:auto">
        ${items.length===0?'<div style="font-size:11px;color:#9ca3af;text-align:center;padding:16px">Sin acciones</div>':
          items.map(a=>{const c=pend.cases[a.case_id]||{};const ovd=pendOvd(a);const urg=a.priority==='alta'||a.priority==='urgente';
            return `<div style="background:#fff;border:1px solid rgba(0,0,0,.08);${ovd?'border-left:3px solid #ef4444':''}border-radius:7px;padding:10px 12px;cursor:pointer;transition:all .12s" onclick="pendOpenDetail('${a.id}')">
              <div style="font-size:12px;font-weight:500;margin-bottom:5px;line-height:1.4">${esc(a.title||'—')}</div>
              <div style="font-size:10.5px;color:#9ca3af;display:flex;align-items:center;gap:5px;margin-bottom:3px"><span style="color:${urg?'#ef4444':'#d1d5db'}">●</span>${esc(c.name||'—')}${c.rol?' · '+esc(c.rol):''}</div>
              ${a.due_date?`<div style="font-size:10px;font-family:var(--font-mono,'DM Mono',monospace);color:${ovd?'#ef4444':'#9ca3af'}">📅 ${pendFmt(a.due_date)}</div>`:''}
            </div>`;}).join('')}
      </div>
    </div>`;
  }).join('')}
  </div>`;
}

function pendOpenDetail(id) {
  const a=pend.acciones.find(x=>x.id===id); if(!a) return;
  const c=pend.cases[a.case_id]||{};const ovd=pendOvd(a);const urg=a.priority==='alta'||a.priority==='urgente';
  document.getElementById('miniModalTitle').textContent='Detalle de acción';
  document.getElementById('miniModalBody').innerHTML=`<div style="display:flex;flex-direction:column;gap:12px">
    <div style="background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.18);border-radius:8px;padding:12px 14px">
      <div style="font-size:13.5px;font-weight:600;margin-bottom:5px;line-height:1.4">${esc(a.title||'—')}</div>
      <div style="font-size:11px;color:#9ca3af">📋 ${esc(c.name||'—')}${c.rol?' · '+esc(c.rol):''}</div>
    </div>
    ${a.description?`<p style="font-size:12.5px;color:#374151;line-height:1.65;margin:0">${esc(a.description)}</p>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Estado</div>
        <select onchange="pendUpdateStatus('${a.id}',this.value);typeof closeMiniModal!=='undefined'&&closeMiniModal()" style="width:100%;background:#fafafa;border:1px solid rgba(0,0,0,.1);color:#111;padding:5px 9px;border-radius:6px;font-size:12px;outline:none">
          <option value="pendiente" ${a.status==='pendiente'?'selected':''}>Pendiente</option>
          <option value="en_progreso" ${a.status==='en_progreso'?'selected':''}>En progreso</option>
          <option value="completado" ${a.status==='completado'?'selected':''}>Completada</option>
        </select>
      </div>
      <div><div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Prioridad</div>
        <div style="padding:5px 0;font-weight:500;color:${urg?'#ef4444':'#9ca3af'}">${urg?'🔴 Urgente':'🟡 Normal'}</div>
      </div>
      ${a.due_date?`<div><div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:4px">Fecha límite</div><div style="color:${ovd?'#ef4444':'#374151'}">${pendFmt(a.due_date)}${ovd?' ⚠':''}</div></div>`:''}
    </div>
    <div style="display:flex;gap:8px">
      <button onclick="pendUpdateStatus('${a.id}','completado')" style="flex:1;padding:7px;background:#4f46e5;color:#fff;border:none;border-radius:7px;cursor:pointer;font-weight:600;font-size:12.5px;font-family:inherit">✓ Marcar completada</button>
      <button onclick="typeof pickCaseById!=='undefined'&&pickCaseById('${a.case_id}');typeof closeMiniModal!=='undefined'&&closeMiniModal()" style="padding:7px 12px;background:#fafafa;border:1px solid rgba(0,0,0,.1);color:#374151;border-radius:7px;cursor:pointer;font-size:12px;font-family:inherit">Abrir caso</button>
      <button onclick="pendDelete('${a.id}')" style="padding:7px 11px;background:#fef2f2;border:1px solid #fecaca;color:#ef4444;border-radius:7px;cursor:pointer;font-size:12px">🗑</button>
    </div>
  </div>`;
  document.getElementById('miniModalSaveBtn').style.display='none';
  window._miniModalSave=null;
  if(typeof openMiniModal==='function') openMiniModal();
}

async function pendToggleDone(id,done) {
  const sb=typeof supabaseClient!=='undefined'?supabaseClient:null; if(!sb)return;
  const status=done?'completado':'pendiente';
  const{error}=await sb.from('acciones_pendientes').update({status,completed_at:done?new Date().toISOString():null}).eq('id',id);
  if(error){if(typeof showToast==='function')showToast('⚠ '+error.message);return;}
  const a=pend.acciones.find(x=>x.id===id);if(a){a.status=status;a.completed_at=done?new Date().toISOString():null;}
  pendRender();if(typeof showToast==='function')showToast(done?'✓ Completada':'↺ Reabierta');
}

async function pendUpdateStatus(id,newStatus) {
  const sb=typeof supabaseClient!=='undefined'?supabaseClient:null; if(!sb)return;
  const{error}=await sb.from('acciones_pendientes').update({status:newStatus,completed_at:newStatus==='completado'?new Date().toISOString():null}).eq('id',id);
  if(error){if(typeof showToast==='function')showToast('⚠ '+error.message);return;}
  const a=pend.acciones.find(x=>x.id===id);if(a)a.status=newStatus;
  pendRender();if(typeof showToast==='function')showToast('✓ Estado actualizado');
}

async function pendDelete(id) {
  if(!confirm('¿Eliminar esta acción?'))return;
  const sb=typeof supabaseClient!=='undefined'?supabaseClient:null; if(!sb)return;
  await sb.from('acciones_pendientes').delete().eq('id',id);
  pend.acciones=pend.acciones.filter(a=>a.id!==id);
  if(typeof closeMiniModal==='function')closeMiniModal();
  pendRender();if(typeof showToast==='function')showToast('✓ Eliminada');
}

function pendShowNueva(){const m=document.getElementById('pendNuevaModal');if(m)m.style.display='flex';}
function pendHideNueva(){const m=document.getElementById('pendNuevaModal');if(m)m.style.display='none';}

async function pendSaveNueva() {
  const caseId=document.getElementById('pnCase')?.value;
  const title=document.getElementById('pnTitle')?.value.trim();
  const desc=document.getElementById('pnDesc')?.value.trim();
  const priority=document.getElementById('pnPriority')?.value||'normal';
  const dueDate=document.getElementById('pnDate')?.value;
  if(!caseId){if(typeof showToast==='function')showToast('⚠ Selecciona un expediente');return;}
  if(!title){if(typeof showToast==='function')showToast('⚠ El título es obligatorio');return;}
  const sb=typeof supabaseClient!=='undefined'?supabaseClient:null; if(!sb)return;
  const{data:{user}}=await sb.auth.getUser();
  const{data,error}=await sb.from('acciones_pendientes').insert({case_id:caseId,user_id:user.id,title,description:desc||null,priority,status:'pendiente',due_date:dueDate||null}).select('*').single();
  if(error){if(typeof showToast==='function')showToast('⚠ '+error.message);return;}
  pend.acciones.unshift(data);
  pendHideNueva();pendRender();if(typeof showToast==='function')showToast('✓ Acción creada');
}

function pendToggleCase(cid) {
  if(pend.collapsed.has(cid))pend.collapsed.delete(cid);else pend.collapsed.add(cid);
  const body=document.getElementById('ptb-'+cid);
  if(body)body.style.display=pend.collapsed.has(cid)?'none':'';
  // Rotate chevron
  const hdr=document.querySelector(`[onclick*="pendToggleCase('${cid}')"] svg`);
  if(hdr)hdr.style.transform=pend.collapsed.has(cid)?'rotate(-90deg)':'rotate(0deg)';
}

function pendToggleAll() {
  const ids=[...new Set(pendGetFiltered().map(a=>a.case_id))];
  const allC=pend.collapsed.size>=ids.length;
  if(allC)pend.collapsed.clear();else ids.forEach(id=>pend.collapsed.add(id));
  pendRender();
}

function pendAnalyzarIA() {
  const filtered=pendGetFiltered().filter(a=>a.status!=='completado');
  if(!filtered.length){if(typeof showToast==='function')showToast('Sin acciones pendientes para analizar');return;}
  const grouped={};
  filtered.forEach(a=>{const c=pend.cases[a.case_id];if(!grouped[a.case_id])grouped[a.case_id]={name:c?.name||'—',tipo:c?.tipo_procedimiento||'—',items:[]};grouped[a.case_id].items.push(a);});
  const ctx=Object.values(grouped).map(g=>`CASO: ${g.name} (${g.tipo})\n${g.items.map(a=>`  - ${a.title}${a.due_date?' ['+pendFmt(a.due_date)+']':''}${(a.priority==='alta'||a.priority==='urgente')?' ⚠URGENTE':''}`).join('\n')}`).join('\n\n');
  if(typeof showView==='function')showView('viewCase');
  if(typeof showTab==='function')showTab('tabChat');
  setTimeout(()=>{const inp=document.getElementById('inputBox');if(inp)inp.value=`Analiza estas acciones pendientes y recomienda priorización, plazos críticos y riesgos:\n\n${ctx}`;},300);
  if(typeof showToast==='function')showToast('✓ Enviando al Chat IA');
}

/* ── INJECT VIEW ── */
(function(){
  if(document.getElementById('viewPendientes'))return;
  const v=document.createElement('div');
  v.id='viewPendientes';v.className='view';
  v.innerHTML='<div id="pendMain" style="flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;background:#f5f5f7"></div>';
  const ref=document.getElementById('viewWelcome');
  if(ref)ref.parentNode.insertBefore(v,ref);else document.querySelector('.main')?.appendChild(v);
})();

/* ── CSS ── */
(function(){
  const old=document.getElementById('pend-css');if(old)old.remove();
  const s=document.createElement('style');s.id='pend-css';
  s.textContent=`
#viewPendientes{display:none;flex-direction:column;overflow:hidden;}
#viewPendientes.active{display:flex;}
#pendMain{flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;background:#f5f5f7;}
.pt-topbar{display:flex;align-items:center;justify-content:space-between;padding:13px 18px 10px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);}
.pt-title{font-family:var(--font-serif,'EB Garamond',Georgia,serif);font-size:20px;font-weight:400;}
.pt-sub{font-size:11px;color:#9ca3af;margin-top:2px;}
.pt-btn-ia{display:flex;align-items:center;gap:5px;padding:6px 12px;font-size:11.5px;background:#fff;border:1px solid rgba(0,0,0,.1);color:#374151;border-radius:7px;cursor:pointer;font-family:inherit;}
.pt-btn-ia:hover{border-color:#4f46e5;color:#4f46e5;}
.pt-btn-new{padding:7px 15px;font-size:12px;font-weight:600;background:#4f46e5;color:#fff;border:none;border-radius:7px;cursor:pointer;font-family:inherit;}
.pt-btn-new:hover{background:#4338ca;}
.pt-cat-tabs{display:flex;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 16px;overflow-x:auto;}
.pt-cat-tab{display:inline-flex;align-items:center;gap:5px;padding:8px 12px;font-size:12px;font-weight:500;color:#9ca3af;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;white-space:nowrap;font-family:inherit;}
.pt-cat-tab.act{color:#4f46e5;border-bottom-color:#4f46e5;font-weight:600;}
.pt-chip{font-size:10px;padding:1px 6px;border-radius:9px;background:#f3f4f6;color:#9ca3af;border:1px solid rgba(0,0,0,.06);}
.pt-cat-tab.act .pt-chip{background:rgba(79,70,229,.1);color:#4f46e5;}
.pt-toolbar{padding:8px 14px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);}
.pt-sbtn{padding:4px 11px;font-size:11.5px;border-radius:18px;border:1px solid rgba(0,0,0,.1);background:none;color:#9ca3af;cursor:pointer;font-family:inherit;font-weight:500;}
.pt-sbtn.act{background:rgba(79,70,229,.07);border-color:rgba(79,70,229,.2);color:#4f46e5;}
.pt-sbtn.st-pendiente.act{background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.3);color:#d97706;}
.pt-sbtn.st-en_progreso.act{background:rgba(79,70,229,.07);border-color:rgba(79,70,229,.2);color:#4f46e5;}
.pt-sbtn.st-completado.act{background:rgba(5,150,105,.07);border-color:rgba(5,150,105,.25);color:#059669;}
.pt-sw{display:flex;align-items:center;gap:6px;background:#fafafa;border:1px solid rgba(0,0,0,.1);border-radius:7px;padding:5px 10px;flex:1;min-width:150px;max-width:300px;}
.pt-si{border:none;background:none;outline:none;font-size:12px;font-family:inherit;color:#111;width:100%;}
.pt-si::placeholder{color:#9ca3af;}
.pt-sel{background:#fafafa;border:1px solid rgba(0,0,0,.1);color:#374151;padding:5px 9px;border-radius:7px;font-size:12px;font-family:inherit;outline:none;}
.pt-vb{padding:5px 10px;font-size:11.5px;background:none;border:none;cursor:pointer;color:#9ca3af;font-family:inherit;}
.pt-vb.act{background:rgba(79,70,229,.07);color:#4f46e5;}
.pt-group{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;}
.pt-gh{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;cursor:pointer;user-select:none;border-radius:8px;}
.pt-gh:hover{background:#fafafa;}
.pt-ovd-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:#ef4444;}
.pt-urg-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#d97706;}
.pt-tot-chip{font-size:10px;padding:1px 7px;border-radius:8px;background:#f3f4f6;border:1px solid rgba(0,0,0,.06);color:#9ca3af;}
.pt-row{display:flex;align-items:center;gap:9px;padding:8px 12px;border-bottom:1px solid rgba(0,0,0,.05);cursor:pointer;}
.pt-row:last-child{border-bottom:none;}
.pt-row:hover{background:#fafafa;}
.pt-row-done{opacity:.55;}
.pt-pill{font-size:10px;font-weight:500;padding:2px 8px;border-radius:9px;white-space:nowrap;flex-shrink:0;}
.pill-pend{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#d97706;}
.pill-prog{background:rgba(79,70,229,.07);border:1px solid rgba(79,70,229,.18);color:#4f46e5;}
.pill-done{background:rgba(5,150,105,.07);border:1px solid rgba(5,150,105,.2);color:#059669;}
.pt-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:200;display:flex;align-items:center;justify-content:center;}
.pt-modal{background:#fff;border-radius:12px;padding:20px;width:480px;max-width:94vw;box-shadow:0 20px 60px rgba(0,0,0,.15);}
.pt-modal-title{font-size:14px;font-weight:600;margin-bottom:14px;}
.pt-f{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.pt-f label{font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:#9ca3af;}
.pt-f input,.pt-f select,.pt-f textarea{background:#fafafa;border:1px solid rgba(0,0,0,.1);color:#111;padding:7px 10px;border-radius:7px;font-size:13px;font-family:inherit;outline:none;}
.pt-btn-cancel{padding:7px 16px;background:#fafafa;border:1px solid rgba(0,0,0,.1);color:#374151;border-radius:7px;cursor:pointer;font-family:inherit;font-size:12.5px;}
`;
  document.head.appendChild(s);
})();
