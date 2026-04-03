/* ================================================================
   MOD-USUARIOS-ROLES.JS — Usuarios, Roles, Límites IA y Admin
   Panel admin · Roles fiscal/admin/consultor · Control uso IA
   ================================================================
   v1.0 · 2026-03-25 · Fiscalito / UMAG
   ================================================================
   Basado en Usuarios_Roles_Colaboracion_Modulo_Completo.js
   - Roles: admin | fiscal | consultor
   - Panel admin: usuarios, cambio de rol, uso IA
   - Límite mensual de uso IA por usuario
   - Tabla: user_roles · profiles · ai_usage_logs
   ================================================================

   SQL REQUERIDO (Supabase → SQL Editor):
   ──────────────────────────────────────
   -- Tabla de logs de uso IA
   create table if not exists ai_usage_logs (
     id         uuid primary key default gen_random_uuid(),
     user_id    uuid references auth.users on delete cascade,
     fn_code    text not null,
     detail     text,
     logged_at  timestamptz not null default now()
   );

   -- Límites mensuales por rol (config)
   create table if not exists ai_usage_limits (
     role       text primary key,
     monthly_limit integer not null default 500
   );
   insert into ai_usage_limits(role, monthly_limit) values
     ('admin',500000),('fiscal',500),('consultor',50)
   on conflict(role) do nothing;

   -- Función check_ai_usage_limit
   create or replace function check_ai_usage_limit(p_user_id uuid)
   returns boolean language plpgsql security definer as $$
   declare
     v_role text;
     v_limit int;
     v_count int;
   begin
     select role into v_role from user_roles where user_id = p_user_id limit 1;
     if v_role = 'admin' then return true; end if;
     select monthly_limit into v_limit from ai_usage_limits where role = coalesce(v_role,'fiscal');
     if v_limit is null then return true; end if;
     select count(*) into v_count from ai_usage_logs
       where user_id = p_user_id
         and logged_at >= date_trunc('month', now());
     return v_count < v_limit;
   end;
   $$;
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   1 · ESTADO GLOBAL DEL MÓDULO
   ──────────────────────────────────────────────────────────────── */

const roles = {
  currentRole:  null,    // 'admin' | 'fiscal' | 'consultor' | null
  usersList:    [],
  usageStats:   [],
  usageLimits:  { admin: 500000, fiscal: 500, consultor: 50 },
  panel:        'usuarios', // tab activo en admin panel
  loading:      false,
};

const ROLE_CONFIG = {
  admin:     { label:'Administrador', badge:'🔑', desc:'Acceso total. Gestiona usuarios y configura el sistema.', color:'var(--gold)' },
  fiscal:    { label:'Fiscal',        badge:'⚖️',  desc:'Crea y gestiona sus propios casos. Acceso completo a IA.', color:'var(--blue)' },
  consultor: { label:'Consultor',     badge:'👁',  desc:'Solo lectura. Sin crear casos. Acceso limitado a IA.',  color:'var(--text-muted)' },
};

/* ────────────────────────────────────────────────────────────────
   2 · CARGA DE ROL ACTUAL (se llama en initApp)
   ──────────────────────────────────────────────────────────────── */

async function loadCurrentUserRole() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb.from('user_roles').select('role').eq('user_id', user.id).single();
    roles.currentRole = data?.role || 'fiscal';

    // Si es admin, mostrar item de admin en sidebar
    if (roles.currentRole === 'admin') injectAdminSidebarItem();

    // Verificar límite y actualizar badge
    await refreshAIUsageBadge();
  } catch (err) {
    console.warn('[ROLES] loadCurrentUserRole:', err);
    roles.currentRole = 'fiscal'; // fallback seguro
  }
}

/* ────────────────────────────────────────────────────────────────
   3 · BADGE DE USO IA EN HEADER DEL CHAT
   ──────────────────────────────────────────────────────────────── */

async function refreshAIUsageBadge() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    const { count } = await sb.from('ai_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('logged_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    const limit = roles.usageLimits[roles.currentRole] ?? 500;
    const used  = count || 0;
    const pct   = Math.min(100, Math.round(used / limit * 100));
    const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? '#f59e0b' : 'var(--green)';

    // Inyectar/actualizar badge
    let badge = document.getElementById('aiUsageBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'aiUsageBadge';
      badge.style.cssText = 'position:fixed;top:10px;right:14px;z-index:200;';
      document.body.appendChild(badge);
    }
    const isAdmin = roles.currentRole === 'admin';
    badge.innerHTML = isAdmin ? '' : `
      <div style="display:flex;align-items:center;gap:5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:3px 10px;font-size:10px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.07)"
        title="Uso IA este mes: ${used}/${limit} llamadas" onclick="openAdminUsersView()">
        <span style="color:${color}">⚡</span>
        <span style="color:${color};font-weight:600">${used}</span>
        <span style="color:var(--text-muted)">/ ${limit}</span>
      </div>`;

    // Bloquear IA si límite superado
    if (!isAdmin && pct >= 100) {
      // Set flag to block AI calls when limit reached
      window.aiBlockedByLimit = true;
    }
  } catch (err) {
    console.warn('[ROLES] refreshAIUsageBadge:', err);
  }
}

/* ────────────────────────────────────────────────────────────────
   4 · ADMIN: INYECTAR ITEM SIDEBAR
   ──────────────────────────────────────────────────────────────── */

function injectAdminSidebarItem() {
  if (document.getElementById('adminNavItem')) return;
  const scrollArea = document.querySelector('.sidebar .sidebar-section-label');
  if (!scrollArea?.parentNode) return;

  const adminItem = document.createElement('div');
  adminItem.id = 'adminNavItem';
  adminItem.className = 'sidebar-nav-item';
  adminItem.setAttribute('onclick', 'openAdminUsersView()');
  adminItem.innerHTML = `<span class="nav-icon">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 14c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/>
      <circle cx="13" cy="4" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  </span>Admin Usuarios`;
  scrollArea.parentNode.insertBefore(adminItem, scrollArea);
}

/* ────────────────────────────────────────────────────────────────
   5 · PANEL ADMINISTRACIÓN DE USUARIOS
   ──────────────────────────────────────────────────────────────── */

async function openAdminUsersView() {
  if (roles.currentRole !== 'admin') { showToast('⚠ Solo accesible para administradores'); return; }
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('adminNavItem')?.classList.add('active');
  showView('viewAdminUsers');
  renderAdminView();
  loadAdminData();
}

function renderAdminView() {
  const main = document.getElementById('adminMain');
  if (!main) return;

  const tabs = [
    { id:'usuarios',    label:'👥 Usuarios' },
    { id:'uso_ia',      label:'⚡ Uso IA' },
    { id:'limites',     label:'⚙️ Límites' },
    { id:'auditoria',   label:'🔍 Auditoría' },
  ];

  main.innerHTML = `
    <div class="admin-tabs">
      ${tabs.map(t=>`<button class="admin-tab ${roles.panel===t.id?'active':''}" onclick="adminSwitchTab('${t.id}')">${t.label}</button>`).join('')}
    </div>
    <div class="admin-body" id="adminBody">
      <div class="loading">Cargando…</div>
    </div>`;
}

function adminSwitchTab(tab) {
  roles.panel = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.textContent.includes(tab) || t.getAttribute('onclick')?.includes(`'${tab}'`)));
  loadAdminData();
}

async function loadAdminData() {
  const body = document.getElementById('adminBody');
  if (!body) return;
  body.innerHTML = '<div class="loading">Cargando…</div>';

  if (roles.panel === 'usuarios')  await renderUsersTab(body);
  else if (roles.panel === 'uso_ia')   await renderUsageTab(body);
  else if (roles.panel === 'limites')  await renderLimitsTab(body);
  else if (roles.panel === 'auditoria') {
    await openAuditPanel?.(); // delegar a mod-seguridad si existe
    // Fallback inline
    await renderAuditTab(body);
  }
}

/* ── TAB USUARIOS ── */
async function renderUsersTab(body) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    const [profilesRes, rolesRes] = await Promise.all([
      sb.from('profiles').select('*').order('created_at'),
      sb.from('user_roles').select('*'),
    ]);
    if(profilesRes.error) { console.error('Error loading profiles:', profilesRes.error); }
    if(rolesRes.error) { console.error('Error loading roles:', rolesRes.error); }
    const profiles = profilesRes.data || [];
    const rolesMap = {};
    (rolesRes.data || []).forEach(r => { rolesMap[r.user_id] = r.role; });

    body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:12px;color:var(--text-muted)">${profiles.length} usuarios registrados</div>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th class="admin-th">Usuario</th>
        <th class="admin-th">Rol actual</th>
        <th class="admin-th">Cambiar rol</th>
        <th class="admin-th">Registro</th>
      </tr></thead>
      <tbody>
      ${profiles.map(p => {
        const role = rolesMap[p.user_id] || rolesMap[p.id] || 'fiscal';
        const rc = ROLE_CONFIG[role] || ROLE_CONFIG.fiscal;
        const isSelf = p.user_id === user?.id || p.id === user?.id;
        return `<tr>
          <td class="admin-td">
            <div style="font-weight:500">${esc(p.full_name || p.email?.split('@')[0] || '—')}</div>
            <div style="font-size:10px;color:var(--text-muted)">${esc(p.email || '—')}</div>
          </td>
          <td class="admin-td">
            <span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${rc.color}22;border:1px solid ${rc.color}55;color:${rc.color}">
              ${rc.badge} ${rc.label}
            </span>
          </td>
          <td class="admin-td">
            ${isSelf ? `<span style="font-size:10px;color:var(--text-muted)">Tu cuenta</span>` : `
            <select class="juri-select" style="font-size:11px"
              onchange="adminChangeRole('${p.user_id||p.id}',this.value)">
              ${Object.entries(ROLE_CONFIG).map(([k,v])=>`<option value="${k}" ${role===k?'selected':''}>${v.label}</option>`).join('')}
            </select>`}
          </td>
          <td class="admin-td" style="font-size:10.5px;color:var(--text-muted);font-family:'DM Mono',monospace">
            ${p.created_at ? new Date(p.created_at).toLocaleDateString('es-CL') : '—'}
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
    </div>`;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

async function adminChangeRole(userId, newRole) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { error } = await sb.from('user_roles').upsert(
      { user_id: userId, role: newRole },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    showToast(`✓ Rol actualizado a ${ROLE_CONFIG[newRole]?.label || newRole}`);
  } catch (err) {
    showToast(`⚠ Error al cambiar rol: ${err.message}`);
  }
}

/* ── TAB USO IA ── */
async function renderUsageTab(body) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  body.innerHTML = '<div class="loading">Cargando estadísticas de uso…</div>';

  try {
    const [usageRes, profilesRes, rolesRes] = await Promise.all([
      sb.from('ai_usage_logs')
        .select('user_id, fn_code, logged_at')
        .gte('logged_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .order('logged_at', { ascending: false }),
      sb.from('profiles').select('user_id, id, email, full_name'),
      sb.from('user_roles').select('user_id, role'),
    ]);

    const usage    = usageRes.data  || [];
    const profiles = profilesRes.data || [];
    const rolesMap = {};
    (rolesRes.data || []).forEach(r => { rolesMap[r.user_id] = r.role; });

    // Mapear perfiles
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.user_id || p.id] = p; });

    // Agrupar por usuario
    const byUser = {};
    usage.forEach(u => {
      if (!byUser[u.user_id]) byUser[u.user_id] = { calls: 0, fns: {} };
      byUser[u.user_id].calls++;
      byUser[u.user_id].fns[u.fn_code] = (byUser[u.user_id].fns[u.fn_code] || 0) + 1;
    });

    // Stats globales
    const totalCalls = usage.length;
    const topFns = {};
    usage.forEach(u => { topFns[u.fn_code] = (topFns[u.fn_code] || 0) + 1; });
    const fnTop = Object.entries(topFns).sort((a,b)=>b[1]-a[1]).slice(0,6);

    body.innerHTML = `
    <!-- KPI -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div class="dash-card"><div class="dash-card-val gold">${totalCalls}</div><div class="dash-card-label">Llamadas este mes</div></div>
      <div class="dash-card"><div class="dash-card-val blue">${Object.keys(byUser).length}</div><div class="dash-card-label">Usuarios activos</div></div>
      <div class="dash-card"><div class="dash-card-val green">${fnTop[0]?.[0]||'—'}</div><div class="dash-card-label">Función más usada</div></div>
    </div>

    <!-- Top funciones -->
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Funciones</div>
      ${fnTop.map(([fn, count]) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <span style="background:var(--gold);color:#fff;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:3px;font-family:'DM Mono',monospace;min-width:28px;text-align:center">${fn}</span>
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(count/totalCalls*100)}%;background:var(--gold)"></div>
          </div>
          <span style="font-size:10.5px;color:var(--text-muted);min-width:30px;text-align:right">${count}</span>
        </div>`).join('')}
    </div>

    <!-- Por usuario -->
    <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Por usuario</div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr>
        <th class="admin-th">Usuario</th>
        <th class="admin-th">Rol</th>
        <th class="admin-th">Llamadas</th>
        <th class="admin-th">Límite</th>
        <th class="admin-th">Uso</th>
      </tr></thead>
      <tbody>
      ${Object.entries(byUser)
        .sort((a,b)=>b[1].calls-a[1].calls)
        .map(([uid, stats]) => {
          const p = profileMap[uid];
          const role  = rolesMap[uid] || 'fiscal';
          const limit = roles.usageLimits[role] || 500;
          const pct   = Math.min(100, Math.round(stats.calls/limit*100));
          const barColor = pct>=90?'var(--red)':pct>=70?'#f59e0b':'var(--green)';
          const rc = ROLE_CONFIG[role] || ROLE_CONFIG.fiscal;
          return `<tr>
            <td class="admin-td">
              <div style="font-weight:500">${esc(p?.full_name||p?.email?.split('@')[0]||uid.substring(0,8)+'…')}</div>
              <div style="font-size:10px;color:var(--text-muted)">${esc(p?.email||'—')}</div>
            </td>
            <td class="admin-td"><span style="font-size:10px;color:${rc.color}">${rc.badge} ${rc.label}</span></td>
            <td class="admin-td" style="font-family:'DM Mono',monospace;text-align:right">${stats.calls}</td>
            <td class="admin-td" style="font-family:'DM Mono',monospace;text-align:right">${limit===500000?'∞':limit}</td>
            <td class="admin-td" style="min-width:120px">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${barColor};transition:width .3s"></div>
                </div>
                <span style="font-size:10px;color:${barColor};min-width:32px;text-align:right">${pct}%</span>
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>`;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

/* ── TAB LÍMITES ── */
async function renderLimitsTab(body) {
  body.innerHTML = `
  <div style="max-width:480px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;line-height:1.5">
      Define el número máximo de llamadas IA por usuario al mes según su rol.
      Los contadores se reinician el 1° de cada mes.
    </div>
    ${Object.entries(ROLE_CONFIG).map(([role, rc]) => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)">
      <span style="font-size:16px">${rc.badge}</span>
      <div style="flex:1">
        <div style="font-size:12px;font-weight:500">${rc.label}</div>
        <div style="font-size:10.5px;color:var(--text-muted)">${rc.desc}</div>
      </div>
      <input type="number" class="juri-input" style="width:80px;text-align:right;font-family:'DM Mono',monospace"
        value="${role==='admin'?'∞':roles.usageLimits[role]}"
        id="limitInput_${role}"
        ${role==='admin'?'disabled':''}
        min="1" max="9999"/>
      <span style="font-size:10.5px;color:var(--text-muted)">/ mes</span>
    </div>`).join('')}
    <button class="btn-save" onclick="adminSaveLimits()" style="padding:7px 18px;margin-top:6px">
      💾 Guardar límites
    </button>
    <div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">
      Los cambios se aplican en la próxima verificación (al enviar el próximo mensaje).
    </div>
  </div>`;
}

async function adminSaveLimits() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  try {
    const updates = [];
    for (const role of ['fiscal', 'consultor']) {
      const val = parseInt(document.getElementById(`limitInput_${role}`)?.value);
      if (!isNaN(val) && val > 0) {
        roles.usageLimits[role] = val;
        updates.push({ role, monthly_limit: val });
      }
    }
    if (updates.length) {
      await sb.from('ai_usage_limits').upsert(updates, { onConflict: 'role' });
    }
    showToast('✓ Límites guardados');
    refreshAIUsageBadge();
  } catch (err) {
    showToast('⚠ Error al guardar: ' + err.message);
  }
}

/* ── TAB AUDITORÍA (fallback si mod-seguridad no está cargado) ── */
async function renderAuditTab(body) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: logs } = await sb.from('audit_access_logs')
      .select('*').order('created_at', { ascending: false }).limit(50);
    if (!logs?.length) { body.innerHTML = '<div class="empty-state">Sin logs de auditoría.</div>'; return; }
    const actionColors = { view:'var(--blue)', create:'var(--green)', update:'#f59e0b', delete:'var(--red)' };
    body.innerHTML = `<div style="overflow-x:auto;font-size:11.5px">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="admin-th">Fecha</th><th class="admin-th">Acción</th>
          <th class="admin-th">Tabla</th><th class="admin-th">Detalles</th>
        </tr></thead>
        <tbody>${logs.map(l=>`<tr>
          <td class="admin-td" style="font-family:'DM Mono',monospace;white-space:nowrap;font-size:10.5px">${new Date(l.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
          <td class="admin-td"><span style="font-size:9.5px;padding:1px 7px;border-radius:8px;background:${(actionColors[l.action]||'var(--text-muted)')}22;color:${actionColors[l.action]||'var(--text-muted)'}">${l.action||'—'}</span></td>
          <td class="admin-td" style="color:var(--text-dim)">${l.table_name||'—'}</td>
          <td class="admin-td" style="font-size:10px;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${JSON.stringify(l.metadata||{}).substring(0,80)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

/* ────────────────────────────────────────────────────────────────
   6 · CARGA DE LÍMITES DESDE BD
   ──────────────────────────────────────────────────────────────── */

async function loadAIUsageLimits() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data } = await sb.from('ai_usage_limits').select('role, monthly_limit');
    (data || []).forEach(r => { roles.usageLimits[r.role] = r.monthly_limit; });
  } catch {
    // tabla puede no existir aún — usar defaults
  }
}

/* ────────────────────────────────────────────────────────────────
   7 · HELPERS DE PERMISOS
   ──────────────────────────────────────────────────────────────── */

const isAdmin     = () => roles.currentRole === 'admin';
const isFiscal    = () => roles.currentRole === 'fiscal';
const isConsultor = () => roles.currentRole === 'consultor';
const canCreateCases  = () => roles.currentRole === 'admin' || roles.currentRole === 'fiscal';
const canEditAllCases = () => roles.currentRole === 'admin';

/* ────────────────────────────────────────────────────────────────
   8 · CSS
   ──────────────────────────────────────────────────────────────── */
(function injectRolesCSS() {
  if (document.getElementById('roles-css')) return;
  const s = document.createElement('style');
  s.id = 'roles-css';
  s.textContent = `
.admin-tabs{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 14px;flex-shrink:0;}
.admin-tab{padding:8px 12px;font-size:11.5px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',sans-serif;white-space:nowrap;}
.admin-tab:hover{color:var(--text);}
.admin-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:500;}
.admin-body{flex:1;overflow-y:auto;padding:14px;}
.admin-th{padding:6px 10px;text-align:left;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);background:var(--surface);font-weight:500;white-space:nowrap;}
.admin-td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}
`;
  document.head.appendChild(s);
})();

/* ────────────────────────────────────────────────────────────────
   9 · INYECCIÓN DE VISTA
   ──────────────────────────────────────────────────────────────── */
(function injectAdminView() {
  if (document.getElementById('viewAdminUsers')) return;
  const view = document.createElement('div');
  view.id = 'viewAdminUsers';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';
  view.innerHTML = `
    <div style="padding:10px 16px 6px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <div style="font-family:'EB Garamond',serif;font-size:21px;font-weight:400">👥 Administración de Usuarios</div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">Roles · Límites de uso IA · Auditoría</div>
    </div>
    <div id="adminMain" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div class="loading">Cargando…</div>
    </div>`;
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();

/* ────────────────────────────────────────────────────────────────
   10 · INICIALIZACIÓN (se engancha al initApp del index.html)
   ──────────────────────────────────────────────────────────────── */
window.addEventListener('load', () => {
  // Esperar a que initApp esté definido
  const origInit = window.initApp;
  if (typeof origInit === 'function') {
    window.initApp = async function() {
      await origInit.call(this);
      await loadCurrentUserRole();
      await loadAIUsageLimits();
    };
  } else {
    // Fallback: intentar cargar cuando la sesión esté lista
    const origAuth = window.sb?.auth?.onAuthStateChange;
    setTimeout(async () => {
      await loadCurrentUserRole();
      await loadAIUsageLimits();
    }, 1000);
  }
});
