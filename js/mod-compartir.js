/**
 * MOD-COMPARTIR.JS
 * ─────────────────
 * Sistema de compartir casos y Ley 21.369 con otros usuarios.
 * Roles: fiscal (acceso completo), actuaria (edita diligencias/notas), consultor (solo lectura).
 */

/* ── Configuración de roles ── */
const SHARE_ROLES={
  fiscal:    {label:'Fiscal',      icon:'⚖️', color:'#7c3aed', desc:'Acceso completo: editar, compartir, eliminar'},
  actuaria:  {label:'Actuaria/o',  icon:'📋', color:'#0891b2', desc:'Editar diligencias, notas, cronología. Sin eliminar caso'},
  consultor: {label:'Consultor/a', icon:'👁️', color:'#6b7280', desc:'Solo lectura: ver expediente completo sin modificar'},
};

const LEY_ROLES={
  admin:     {label:'Administrador', icon:'👑', color:'#7c3aed', desc:'Acceso completo al dashboard Ley 21.369'},
  editor:    {label:'Editor',        icon:'✏️', color:'#0891b2', desc:'Editar ítems y documentos, sin gestionar accesos'},
  consultor: {label:'Consultor/a',   icon:'👁️', color:'#6b7280', desc:'Solo lectura del dashboard'},
};

/* ═══════════════════════════════════════
   PERMISOS — Funciones de verificación
   ═══════════════════════════════════════ */

/** Obtener el rol del usuario actual en un caso */
async function getCaseRole(caseId){
  if(!session?.user?.id||!caseId)return null;
  const uid=session.user.id;

  /* Dueño del caso = fiscal automático */
  if(currentCase&&currentCase.id===caseId&&currentCase.user_id===uid)return 'fiscal';

  /* Buscar en case_shares */
  const{data}=await sb.from('case_shares').select('role')
    .eq('case_id',caseId).eq('user_id',uid).maybeSingle();
  if(data)return data.role;

  /* Si no tiene share explícito pero el caso no tiene user_id (legacy), dar lectura */
  return 'consultor';
}

/** Verificar si puede editar (fiscal o actuaria) */
function canEdit(role){return role==='fiscal'||role==='actuaria';}
function canDelete(role){return role==='fiscal';}
function canShare(role){return role==='fiscal';}
function isReadOnly(role){return role==='consultor';}

/** Obtener rol en Ley 21.369 */
async function getLeyRole(){
  if(!session?.user?.id)return null;
  const uid=session.user.id;

  /* Verificar si es admin (quien creó el primer ítem o tiene rol admin) */
  const{data}=await sb.from('ley21369_shares').select('role')
    .eq('user_id',uid).maybeSingle();
  if(data)return data.role;

  /* Si no hay shares, el usuario actual es admin por defecto */
  const{count}=await sb.from('ley21369_shares').select('id',{count:'exact',head:true});
  if(!count||count===0)return 'admin';

  return 'consultor';
}

/* ═══════════════════════════════════════
   COMPARTIR CASO — Modal principal
   ═══════════════════════════════════════ */

async function openShareCaseModal(caseId){
  const cs=caseId||currentCase?.id;
  if(!cs||!session?.user?.id){showToast('⚠️ Selecciona un caso primero');return;}

  const myRole=await getCaseRole(cs);
  if(!canShare(myRole)){showToast('⚠️ Solo el fiscal puede compartir este caso');return;}

  /* Cargar shares existentes */
  const{data:shares}=await sb.from('case_shares')
    .select('id,user_id,role,created_at')
    .eq('case_id',cs)
    .order('created_at',{ascending:true});

  /* Cargar emails de usuarios compartidos (batch query en vez de N+1) */
  let userEmails={};
  if(shares?.length){
    const uids=[...new Set(shares.map(s=>s.user_id))];
    try{
      const{data:profiles}=await sb.from('profiles').select('id,email,full_name').in('id',uids);
      if(profiles?.length) profiles.forEach(p=>{ userEmails[p.id]=p; });
    }catch(e){ console.warn('[compartir] Error cargando perfiles:', e); }
  }

  const caseName=currentCase?.name||'Caso';

  const modal=document.createElement('div');
  modal.id='shareCaseModal';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:20px';

  let sharesHtml='';
  if(shares?.length){
    sharesHtml=shares.map(s=>{
      const r=SHARE_ROLES[s.role]||SHARE_ROLES.consultor;
      const u=userEmails[s.user_id];
      const name=u?.full_name||u?.email||s.user_id.substring(0,8)+'…';
      const email=u?.email||'';
      // esc() también aplica a los IDs aunque sean UUIDs, por defensa en
      // profundidad: si alguna vez un id llega con caracteres raros no rompe
      // el HTML/JS. Se usan data-* + event delegation abajo.
      return `<div class="share-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</div>
          ${email?`<div style="font-size:10.5px;color:var(--text-muted)">${esc(email)}</div>`:''}
        </div>
        <select data-action="update-role" data-share-id="${esc(s.id)}" data-case-id="${esc(cs)}" style="padding:4px 8px;border-radius:var(--radius);border:1px solid var(--border);font-size:11px;background:var(--surface2);color:var(--text)">
          ${Object.entries(SHARE_ROLES).map(([k,v])=>`<option value="${k}"${k===s.role?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button data-action="remove-share" data-share-id="${esc(s.id)}" data-case-id="${esc(cs)}" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--red);padding:2px 6px" title="Quitar acceso">✕</button>
      </div>`;
    }).join('');
  }

  modal.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius-lg);max-width:520px;width:100%;box-shadow:var(--shadow-md);display:flex;flex-direction:column;max-height:90vh">
    <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px">🔗 Compartir caso</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${esc(caseName)}</div>
      </div>
      <button onclick="document.getElementById('shareCaseModal')?.remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);padding:4px 8px">✕</button>
    </div>

    <div style="padding:18px 20px;overflow-y:auto;flex:1">
      <!-- Invite form -->
      <div style="margin-bottom:16px">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Invitar usuario</div>
        <div style="display:flex;gap:6px">
          <input id="shareEmailInput" type="email" placeholder="email@umag.cl" style="flex:1;padding:8px 12px;border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;background:var(--surface2);color:var(--text)"/>
          <select id="shareRoleSelect" style="padding:8px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-size:11px;background:var(--surface2);color:var(--text)">
            ${Object.entries(SHARE_ROLES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select>
          <button class="btn-save" onclick="inviteUserToCase('${cs}')" style="padding:8px 14px;font-size:11px;white-space:nowrap">+ Invitar</button>
        </div>
      </div>

      <!-- Role legend -->
      <div style="margin-bottom:16px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Roles disponibles</div>
        ${Object.entries(SHARE_ROLES).map(([k,v])=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px">
          <span style="color:${v.color};font-weight:600">${v.icon} ${v.label}:</span>
          <span style="color:var(--text-dim)">${v.desc}</span>
        </div>`).join('')}
      </div>

      <!-- Current shares -->
      <div>
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);font-weight:600;margin-bottom:8px">Usuarios con acceso (${shares?.length||0})</div>
        ${sharesHtml||'<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Aún no has compartido este caso con nadie</div>'}
      </div>
    </div>

    <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
      <button class="btn-cancel" onclick="document.getElementById('shareCaseModal')?.remove()">Cerrar</button>
    </div>
  </div>`;

  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}

/* ── Invitar usuario por email ── */
async function inviteUserToCase(caseId){
  const emailInput=document.getElementById('shareEmailInput');
  const roleSelect=document.getElementById('shareRoleSelect');
  const email=emailInput?.value.trim().toLowerCase();
  const role=roleSelect?.value||'consultor';

  if(!email||!email.includes('@')){showToast('⚠️ Ingresa un email válido');return;}
  if(email===session.user.email){showToast('⚠️ No puedes compartir contigo mismo');return;}

  try{
    /* Buscar usuario por email en auth.users via RPC o profiles */
    let targetUserId=null;

    /* Intentar buscar en profiles */
    const{data:prof}=await sb.from('profiles').select('id').eq('email',email).maybeSingle();
    if(prof){
      targetUserId=prof.id;
    } else {
      /* Intentar buscar por email en auth via rpc si existe */
      const{data:authUser}=await sb.rpc('get_user_id_by_email',{email_input:email}).catch(()=>({data:null}));
      if(authUser)targetUserId=authUser;
    }

    if(!targetUserId){
      showToast('⚠️ No se encontró un usuario con ese email. Debe registrarse primero en Fiscalito.');
      return;
    }

    /* Verificar si ya tiene acceso */
    const{data:existing}=await sb.from('case_shares').select('id')
      .eq('case_id',caseId).eq('user_id',targetUserId).maybeSingle();
    if(existing){
      showToast('⚠️ Este usuario ya tiene acceso al caso');
      return;
    }

    /* Insertar share */
    const{error}=await sb.from('case_shares').insert({
      case_id:caseId,
      user_id:targetUserId,
      shared_by:session.user.id,
      role:role
    });
    if(error)throw error;

    logAuditEvent('share_case',{case_id:caseId,shared_with_user_id:targetUserId,shared_with_email:email,role:role});

    showToast(`✅ Caso compartido con ${email} como ${SHARE_ROLES[role]?.label||role}`);
    document.getElementById('shareCaseModal')?.remove();
    openShareCaseModal(caseId); /* Refresh */

  }catch(err){
    showToast('❌ Error: '+err.message);
  }
}

/* ── Actualizar rol de un share ── */
async function updateShareRole(shareId,caseId,newRole){
  const{error}=await sb.from('case_shares').update({role:newRole,updated_at:new Date().toISOString()}).eq('id',shareId);
  if(error){showToast('❌ '+error.message);return;}
  showToast(`✅ Rol actualizado a ${SHARE_ROLES[newRole]?.label||newRole}`);
}

/* ── Quitar acceso ── */
async function removeShare(shareId,caseId){
  if(!confirm('¿Quitar acceso a este usuario?'))return;
  const{error}=await sb.from('case_shares').delete().eq('id',shareId);
  if(error){showToast('❌ '+error.message);return;}
  logAuditEvent('unshare_case',{case_id:caseId,share_id:shareId});
  showToast('✅ Acceso removido');
  document.getElementById('shareCaseModal')?.remove();
  openShareCaseModal(caseId);
}

/* ═══════════════════════════════════════
   COMPARTIR LEY 21.369
   ═══════════════════════════════════════ */

async function openShareLeyModal(){
  if(!session?.user?.id){showToast('⚠️ Inicia sesión primero');return;}

  const myRole=await getLeyRole();
  if(myRole!=='admin'){showToast('⚠️ Solo el administrador puede gestionar accesos');return;}

  const{data:shares}=await sb.from('ley21369_shares')
    .select('id,user_id,role,created_at')
    .order('created_at',{ascending:true});

  let userEmails={};
  if(shares?.length){
    const uids=[...new Set(shares.map(s=>s.user_id))];
    try{
      const{data:profiles}=await sb.from('profiles').select('id,email,full_name').in('id',uids);
      if(profiles?.length) profiles.forEach(p=>{ userEmails[p.id]=p; });
    }catch(e){ console.warn('[compartir] Error cargando perfiles Ley:', e); }
  }

  const modal=document.createElement('div');
  modal.id='shareLeyModal';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:20px';

  let sharesHtml='';
  if(shares?.length){
    sharesHtml=shares.map(s=>{
      const r=LEY_ROLES[s.role]||LEY_ROLES.consultor;
      const u=userEmails[s.user_id];
      const name=u?.full_name||u?.email||s.user_id.substring(0,8)+'…';
      const email=u?.email||'';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</div>
          ${email?`<div style="font-size:10.5px;color:var(--text-muted)">${esc(email)}</div>`:''}
        </div>
        <select onchange="updateLeyShareRole('${s.id}',this.value)" style="padding:4px 8px;border-radius:var(--radius);border:1px solid var(--border);font-size:11px;background:var(--surface2);color:var(--text)">
          ${Object.entries(LEY_ROLES).map(([k,v])=>`<option value="${k}"${k===s.role?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
        <button onclick="removeLeyShare('${s.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--red);padding:2px 6px" title="Quitar acceso">✕</button>
      </div>`;
    }).join('');
  }

  modal.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius-lg);max-width:520px;width:100%;box-shadow:var(--shadow-md);display:flex;flex-direction:column;max-height:90vh">
    <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
      <div>
        <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px">🔗 Compartir Dashboard Ley 21.369</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">Gestiona quién puede ver y editar el cumplimiento normativo</div>
      </div>
      <button onclick="document.getElementById('shareLeyModal')?.remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">✕</button>
    </div>
    <div style="padding:18px 20px;overflow-y:auto;flex:1">
      <div style="margin-bottom:16px">
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Invitar usuario</div>
        <div style="display:flex;gap:6px">
          <input id="shareLeyEmailInput" type="email" placeholder="email@umag.cl" style="flex:1;padding:8px 12px;border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;background:var(--surface2);color:var(--text)"/>
          <select id="shareLeyRoleSelect" style="padding:8px 10px;border:1px solid var(--border2);border-radius:var(--radius);font-size:11px;background:var(--surface2);color:var(--text)">
            ${Object.entries(LEY_ROLES).map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select>
          <button class="btn-save" onclick="inviteUserToLey()" style="padding:8px 14px;font-size:11px;white-space:nowrap">+ Invitar</button>
        </div>
      </div>
      <div style="margin-bottom:16px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Roles</div>
        ${Object.entries(LEY_ROLES).map(([k,v])=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:11px">
          <span style="color:${v.color};font-weight:600">${v.icon} ${v.label}:</span>
          <span style="color:var(--text-dim)">${v.desc}</span>
        </div>`).join('')}
      </div>
      <div>
        <div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);font-weight:600;margin-bottom:8px">Usuarios con acceso (${shares?.length||0})</div>
        ${sharesHtml||'<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px">Aún no has compartido el dashboard</div>'}
      </div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end">
      <button class="btn-cancel" onclick="document.getElementById('shareLeyModal')?.remove()">Cerrar</button>
    </div>
  </div>`;

  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}

async function inviteUserToLey(){
  const email=document.getElementById('shareLeyEmailInput')?.value.trim().toLowerCase();
  const role=document.getElementById('shareLeyRoleSelect')?.value||'consultor';

  if(!email||!email.includes('@')){showToast('⚠️ Ingresa un email válido');return;}

  try{
    let targetUserId=null;
    const{data:prof}=await sb.from('profiles').select('id').eq('email',email).maybeSingle();
    if(prof)targetUserId=prof.id;
    else{
      const{data:authUser}=await sb.rpc('get_user_id_by_email',{email_input:email}).catch(()=>({data:null}));
      if(authUser)targetUserId=authUser;
    }

    if(!targetUserId){showToast('⚠️ Usuario no encontrado. Debe registrarse en Fiscalito.');return;}

    const{data:existing}=await sb.from('ley21369_shares').select('id').eq('user_id',targetUserId).maybeSingle();
    if(existing){showToast('⚠️ Este usuario ya tiene acceso');return;}

    const{error}=await sb.from('ley21369_shares').insert({
      user_id:targetUserId,
      shared_by:session.user.id,
      role:role
    });
    if(error)throw error;

    logAuditEvent('share_ley21369',{shared_with_user_id:targetUserId,shared_with_email:email,role:role});

    showToast(`✅ Dashboard compartido con ${email} como ${LEY_ROLES[role]?.label||role}`);
    document.getElementById('shareLeyModal')?.remove();
    openShareLeyModal();
  }catch(err){showToast('❌ '+err.message);}
}

async function updateLeyShareRole(shareId,newRole){
  const{error}=await sb.from('ley21369_shares').update({role:newRole}).eq('id',shareId);
  if(error){showToast('❌ '+error.message);return;}
  showToast(`✅ Rol actualizado a ${LEY_ROLES[newRole]?.label||newRole}`);
}

async function removeLeyShare(shareId){
  if(!confirm('¿Quitar acceso a este usuario?'))return;
  const{error}=await sb.from('ley21369_shares').delete().eq('id',shareId);
  if(error){showToast('❌ '+error.message);return;}
  logAuditEvent('unshare_ley21369',{share_id:shareId});
  showToast('✅ Acceso removido');
  document.getElementById('shareLeyModal')?.remove();
  openShareLeyModal();
}

/* ═══════════════════════════════════════
   INDICADOR DE COLABORADORES EN EL CASO
   ═══════════════════════════════════════ */

/** Renderiza chips de colaboradores en el header del caso */
async function renderCaseCollaborators(caseId){
  const el=document.getElementById('caseCollaborators');
  if(!el)return;

  const{data:shares}=await sb.from('case_shares')
    .select('user_id,role')
    .eq('case_id',caseId);

  if(!shares?.length){el.innerHTML='';return;}

  let html='<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">';
  html+='<span style="font-size:10px;color:var(--text-muted);margin-right:2px">Compartido con:</span>';

  /* Batch: cargar perfiles de colaboradores de una vez */
  const collabUids=shares.slice(0,5).map(s=>s.user_id);
  let collabProfiles={};
  try{
    const{data:profs}=await sb.from('profiles').select('id,email,full_name').in('id',collabUids);
    if(profs?.length) profs.forEach(p=>{ collabProfiles[p.id]=p; });
  }catch(e){}

  for(const s of shares.slice(0,5)){
    const r=SHARE_ROLES[s.role]||SHARE_ROLES.consultor;
    const prof=collabProfiles[s.user_id];
    const name=prof?.full_name||prof?.email?.split('@')[0]||'Usuario';
    html+=`<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:${r.color}15;color:${r.color};font-weight:500;display:inline-flex;align-items:center;gap:3px" title="${r.label}: ${name}">${r.icon} ${esc(name)}</span>`;
  }
  if(shares.length>5)html+=`<span style="font-size:10px;color:var(--text-muted)">+${shares.length-5} más</span>`;
  html+='</div>';
  el.innerHTML=html;
}

/* ═══════════════════════════════════════
   APLICAR PERMISOS EN LA UI
   ═══════════════════════════════════════ */

/** Aplica restricciones de UI según el rol del usuario en el caso actual */
async function applyCasePermissions(){
  if(!currentCase)return;
  const role=await getCaseRole(currentCase.id);
  window._currentCaseRole=role;

  /* Elementos que requieren edición */
  const editSelectors=[
    '#btnSaveCase','#btnDeleteCase',
    '.btn-action[title*="Editar"]','.btn-action[title*="Eliminar"]',
    '#btnImportDil','button[onclick*="processDiligencia"]',
    'button[onclick*="deleteDiligencia"]','button[onclick*="analyzeExpediente"]',
    'button[onclick*="generateParrafos"]',
    '.action-btn-edit,.action-btn-delete'
  ];

  /* Elementos que requieren ser fiscal */
  const fiscalSelectors=[
    '#btnDeleteCase','button[onclick*="openShareCaseModal"]'
  ];

  if(isReadOnly(role)){
    /* Ocultar botones de edición para consultores */
    editSelectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.style.display='none';
      });
    });
    /* Deshabilitar inputs */
    document.querySelectorAll('#caseForm input, #caseForm select, #caseForm textarea').forEach(el=>{
      el.disabled=true;
      el.style.opacity='0.6';
    });
    /* Mostrar badge de solo lectura */
    const badge=document.getElementById('readOnlyBadge');
    if(badge)badge.style.display='inline-flex';
  }

  if(!canShare(role)){
    fiscalSelectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>el.style.display='none');
    });
  }
}

/* ═══════════════════════════════════════
   TABLA profiles: crear si no existe
   Necesaria para buscar usuarios por email
   ═══════════════════════════════════════ */

/** Asegurar que el perfil del usuario actual existe */
async function ensureUserProfile(){
  if(!session?.user?.id)return;
  const uid=session.user.id;
  const email=session.user.email;
  const name=session.user.user_metadata?.full_name||session.user.user_metadata?.name||email?.split('@')[0]||'';

  try{
    const{data}=await sb.from('profiles').select('id').eq('id',uid).maybeSingle();
    if(!data){
      await sb.from('profiles').insert({
        id:uid,
        email:email,
        full_name:name
      }).catch(()=>{});
    }
  }catch(e){
    /* Table might not exist yet, create profile on next login */
  }
}

/* ── Auto-init on load ── */
document.addEventListener('DOMContentLoaded',()=>{
  /* Ensure profile exists after login */
  const origInitApp=window.initApp;
  if(origInitApp){
    window.initApp=async function(){
      await origInitApp.call(this);
      await ensureUserProfile();
    };
  }
});
