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
   -- Tabla de logs de uso IA (ACTUALIZAR si ya existe)
   create table if not exists ai_usage_logs (
     id         uuid primary key default gen_random_uuid(),
     user_id    uuid references auth.users on delete cascade,
     fn_code    text not null,
     detail     text,
     tokens_used integer default 0,
     cost_usd   numeric(10,4) default 0,
     logged_at  timestamptz not null default now()
   );

   -- Agregar columnas si no existen (para tablas existentes):
   ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS tokens_used integer default 0;
   ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS cost_usd numeric(10,4) default 0;

   -- Límites mensuales por rol (ACTUALIZAR)
   create table if not exists ai_usage_limits (
     role              text primary key,
     monthly_budget_usd numeric(10,2) not null default 10.00
   );
   insert into ai_usage_limits(role, monthly_budget_usd) values
     ('admin',9999.99),('fiscal',10.00),('consultor',5.00)
   on conflict(role) do update set monthly_budget_usd = excluded.monthly_budget_usd;

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
    // maybeSingle: no lanza error si no hay fila (devuelve data=null).
    const { data, error } = await sb.from('user_roles')
      .select('role').eq('user_id', user.id).maybeSingle();
    if (error) console.warn('[ROLES] fetch role:', error);
    // Fallback al rol MENOS privilegiado (consultor = solo lectura).
    // Usar 'fiscal' como fallback daba acceso completo a usuarios sin rol asignado.
    roles.currentRole = (data?.role === 'admin' || data?.role === 'fiscal' || data?.role === 'consultor')
      ? data.role
      : 'consultor';

    // Si es admin, mostrar item de admin en sidebar
    if (roles.currentRole === 'admin') injectAdminSidebarItem();

    // Verificar límite y actualizar badge
    await refreshAIUsageBadge();
  } catch (err) {
    console.warn('[ROLES] loadCurrentUserRole:', err);
    roles.currentRole = 'consultor'; // fallback de mínimo privilegio
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

    // Obtener costo total del mes actual
    const { data: logs, error: logsErr } = await sb.from('ai_usage_logs')
      .select('cost_usd')
      .eq('user_id', user.id)
      .gte('logged_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

    const usedUSD = logs?.reduce((sum, log) => sum + (parseFloat(log.cost_usd) || 0), 0) || 0;

    // Obtener presupuesto del mes
    const { data: roleData } = await sb.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    const userRole = roleData?.role || 'consultor';
    const { data: limitData } = await sb.from('ai_usage_limits').select('monthly_budget_usd').eq('role', userRole).maybeSingle();
    // Si no hay límite configurado para el rol, usar un valor conservador bajo.
    const budgetUSD = parseFloat(limitData?.monthly_budget_usd) || 1.00;

    const pct = Math.min(100, Math.round(usedUSD / budgetUSD * 100));
    const color = pct >= 90 ? 'var(--red)' : pct >= 70 ? '#f59e0b' : 'var(--green)';

    // Alertas por porcentaje
    const prevAlert = window._lastAIAlert || 0;
    if (pct >= 90 && prevAlert < 90) {
      showToast(`⚠️ Alerta: Ya gastaste $${usedUSD.toFixed(2)} de tu presupuesto de $${budgetUSD.toFixed(2)}`);
      window._lastAIAlert = 90;
    } else if (pct >= 70 && prevAlert < 70) {
      showToast(`📊 Recordatorio: Gastaste $${usedUSD.toFixed(2)} de $${budgetUSD.toFixed(2)} (${pct}%)`);
      window._lastAIAlert = 70;
    }

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
        title="Gasto IA este mes: $${usedUSD.toFixed(2)}/$${budgetUSD.toFixed(2)}" onclick="openAdminUsersView()">
        <span style="color:${color}">💰</span>
        <span style="color:${color};font-weight:600">$${usedUSD.toFixed(2)}</span>
        <span style="color:var(--text-muted)">/${budgetUSD.toFixed(2)}</span>
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

function injectAdminSidebarItem(attempt = 0) {
  if (document.getElementById('adminNavItem')) return;
  const scrollArea = document.querySelector('.sidebar .sidebar-section-label');
  if (!scrollArea?.parentNode) {
    // Reintentar: el sidebar puede no estar listo aún al llamarse desde
    // onAuthStateChange(INITIAL_SESSION), que dispara antes del render.
    if (attempt < 40) { // ~10s máx (40 × 250ms)
      setTimeout(() => injectAdminSidebarItem(attempt + 1), 250);
    } else {
      console.warn('[ROLES] No se encontró .sidebar-section-label para inyectar Admin');
    }
    return;
  }

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
    { id:'alertas',     label:'🚨 Alertas' },
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

  if (roles.panel === 'usuarios')       await renderUsersTab(body);
  else if (roles.panel === 'uso_ia')   await renderUsageTab(body);
  else if (roles.panel === 'limites')  await renderLimitsTab(body);
  else if (roles.panel === 'auditoria') await renderAuditTab(body);
  else if (roles.panel === 'alertas')  await renderAlertasTab(body);
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
      <button onclick="openInviteUserModal()" style="background:var(--gold);color:#fff;border:none;padding:6px 12px;border-radius:var(--radius);font-size:11px;cursor:pointer;font-weight:500">+ Nuevo usuario</button>
    </div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th class="admin-th">Usuario</th>
        <th class="admin-th">Rol actual</th>
        <th class="admin-th">Cambiar rol</th>
        <th class="admin-th">Registro</th>
        <th class="admin-th">Acciones</th>
      </tr></thead>
      <tbody>
      ${profiles.map(p => {
        const role = rolesMap[p.id] || 'fiscal';
        const rc = ROLE_CONFIG[role] || ROLE_CONFIG.fiscal;
        const isSelf = p.id === user?.id;
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
              onchange="adminChangeRole('${p.id}',this.value)">
              ${Object.entries(ROLE_CONFIG).map(([k,v])=>`<option value="${k}" ${role===k?'selected':''}>${v.label}</option>`).join('')}
            </select>`}
          </td>
          <td class="admin-td" style="font-size:10.5px;color:var(--text-muted);font-family:'DM Mono',monospace">
            ${p.created_at ? new Date(p.created_at).toLocaleDateString('es-CL') : '—'}
          </td>
          <td class="admin-td">
            ${isSelf ? '' : `<button onclick="adminResetPassword('${esc(p.email)}')" style="background:none;border:1px solid var(--border);border-radius:var(--radius);padding:3px 8px;font-size:10px;cursor:pointer;color:var(--text-muted);transition:all .15s" onmouseover="this.style.borderColor='var(--gold)';this.style.color='var(--gold)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'" title="Enviar enlace para restablecer contraseña">🔑 Reenviar enlace</button>`}
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
    // Validar que no se cambie el propio rol
    const { data: { user } } = await sb.auth.getUser();
    if (user && user.id === userId) {
      showToast('⚠ No puedes cambiar tu propio rol');
      loadAdminData(); // Re-render para restaurar select
      return;
    }
    // Validar rol válido
    if (!ROLE_CONFIG[newRole]) {
      showToast('⚠ Rol no válido');
      return;
    }
    // unique constraint es (user_id, role), así que usamos DELETE + INSERT
    // para garantizar un único rol por usuario.
    const delRes = await sb.from('user_roles').delete().eq('user_id', userId);
    if (delRes.error) throw delRes.error;
    const insRes = await sb.from('user_roles').insert({ user_id: userId, role: newRole });
    if (insRes.error) throw insRes.error;
    showToast(`✓ Rol actualizado a ${ROLE_CONFIG[newRole]?.label || newRole}`);
  } catch (err) {
    showToast(`⚠ Error al cambiar rol: ${err.message}`);
  }
}

/* ── REENVIAR ENLACE DE CONTRASEÑA ── */
async function adminResetPassword(email) {
  if (!email) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showToast(`✓ Enlace enviado a ${email}`);
  } catch (err) {
    showToast(`⚠ Error: ${err.message}`);
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
      sb.from('profiles').select('id, email, full_name'),
      sb.from('user_roles').select('user_id, role'),
    ]);

    const usage    = usageRes.data  || [];
    const profiles = profilesRes.data || [];
    const rolesMap = {};
    (rolesRes.data || []).forEach(r => { rolesMap[r.user_id] = r.role; });

    // Mapear perfiles
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.id] = p; });

    // Agrupar por usuario (ahora con costo USD)
    const byUser = {};
    usage.forEach(u => {
      if (!byUser[u.user_id]) byUser[u.user_id] = { calls: 0, costUSD: 0, fns: {} };
      byUser[u.user_id].calls++;
      byUser[u.user_id].costUSD += parseFloat(u.cost_usd) || 0;
      byUser[u.user_id].fns[u.fn_code] = (byUser[u.user_id].fns[u.fn_code] || 0) + 1;
    });

    // Stats globales en USD
    const totalCalls = usage.length;
    const totalCostUSD = usage.reduce((sum, u) => sum + (parseFloat(u.cost_usd) || 0), 0);
    const topFns = {};
    usage.forEach(u => { topFns[u.fn_code] = (topFns[u.fn_code] || 0) + 1; });
    const fnTop = Object.entries(topFns).sort((a,b)=>b[1]-a[1]).slice(0,6);

    body.innerHTML = `
    <!-- KPI -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
      <div class="dash-card"><div class="dash-card-val gold">$${totalCostUSD.toFixed(2)}</div><div class="dash-card-label">Gasto total IA</div></div>
      <div class="dash-card"><div class="dash-card-val blue">${Object.keys(byUser).length}</div><div class="dash-card-label">Usuarios activos</div></div>
      <div class="dash-card"><div class="dash-card-val green">${totalCalls}</div><div class="dash-card-label">Llamadas totales</div></div>
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
    <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Gasto por usuario</div>
    <div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead><tr>
        <th class="admin-th">Usuario</th>
        <th class="admin-th">Rol</th>
        <th class="admin-th">Gasto USD</th>
        <th class="admin-th">Presupuesto</th>
        <th class="admin-th">% Usado</th>
      </tr></thead>
      <tbody>
      ${Object.entries(byUser)
        .sort((a,b)=>b[1].costUSD-a[1].costUSD)
        .map(([uid, stats]) => {
          const p = profileMap[uid];
          const role  = rolesMap[uid] || 'fiscal';
          const limitData = { admin: 9999.99, fiscal: 10.00, consultor: 5.00 };
          const budgetUSD = limitData[role] || 10.00;
          const pct   = Math.min(100, Math.round(stats.costUSD/budgetUSD*100));
          const barColor = pct>=90?'var(--red)':pct>=70?'#f59e0b':'var(--green)';
          const rc = ROLE_CONFIG[role] || ROLE_CONFIG.fiscal;
          return `<tr>
            <td class="admin-td">
              <div style="font-weight:500">${esc(p?.full_name||p?.email?.split('@')[0]||uid.substring(0,8)+'…')}</div>
              <div style="font-size:10px;color:var(--text-muted)">${esc(p?.email||'—')}</div>
            </td>
            <td class="admin-td"><span style="font-size:10px;color:${rc.color}">${rc.badge} ${rc.label}</span></td>
            <td class="admin-td" style="font-family:'DM Mono',monospace;text-align:right;font-weight:500;color:${barColor}">$${stats.costUSD.toFixed(2)}</td>
            <td class="admin-td" style="font-family:'DM Mono',monospace;text-align:right">${role==='admin'?'∞':'$'+budgetUSD.toFixed(2)}</td>
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

/* ── TAB AUDITORÍA (con filtros y paginación) ── */
let _auditPage = 0;
let _auditFilter = 'all';
let _auditSearch = '';

async function renderAuditTab(body) {
  const actionColors = { view:'var(--blue)', create:'var(--green)', update:'#f59e0b', delete:'var(--red)', login:'#6366f1', logout:'#8b5cf6', export:'#0d9488', share:'#ec4899' };
  const actions = ['all','view','create','update','delete','login','logout','export','share'];

  // Usar loadAuditLogs de mod-seguridad si está disponible
  let result;
  if (typeof window.loadAuditLogs === 'function') {
    result = await window.loadAuditLogs({ action: _auditFilter, search: _auditSearch, page: _auditPage, pageSize: 50 });
  } else {
    const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
    if (!sb) return;
    const { data, count } = await sb.from('audit_access_logs')
      .select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(_auditPage*50, _auditPage*50+49);
    result = { data: data || [], count: count || 0 };
  }

  const logs = result.data;
  const total = result.count;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  body.innerHTML = `
  <!-- Filtros -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <select id="auditActionFilter" class="juri-select" style="font-size:11px;min-width:100px" onchange="_auditFilter=this.value;_auditPage=0;loadAdminData()">
      ${actions.map(a => `<option value="${a}" ${_auditFilter===a?'selected':''}>${a === 'all' ? 'Todas las acciones' : a.charAt(0).toUpperCase()+a.slice(1)}</option>`).join('')}
    </select>
    <input id="auditSearchInput" type="text" placeholder="Buscar tabla, usuario…" value="${_auditSearch}" class="juri-input" style="font-size:11px;flex:1;min-width:140px;max-width:220px"
      onkeydown="if(event.key==='Enter'){_auditSearch=this.value;_auditPage=0;loadAdminData();}"/>
    <button onclick="_auditSearch=document.getElementById('auditSearchInput')?.value||'';_auditPage=0;loadAdminData()" class="btn-save" style="padding:5px 10px;font-size:10px">Buscar</button>
    <div style="margin-left:auto;font-size:10.5px;color:var(--text-muted)">${total} registros</div>
  </div>
  ${!logs?.length ? '<div class="empty-state">Sin logs de auditoría.</div>' : `
  <div style="overflow-x:auto;font-size:11.5px">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th class="admin-th">Fecha</th><th class="admin-th">Acción</th>
        <th class="admin-th">Tabla</th><th class="admin-th">Campos</th><th class="admin-th">Detalles</th>
      </tr></thead>
      <tbody>${logs.map(l => {
        const ac = actionColors[l.action] || 'var(--text-muted)';
        const fields = l.accessed_fields ? (Array.isArray(l.accessed_fields) ? l.accessed_fields : []).slice(0,4).map(f => `<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:var(--surface2);color:var(--text-dim);margin-right:2px">${f}</span>`).join('') : '—';
        const meta = l.metadata ? (typeof l.metadata === 'object' ? (l.metadata.name || l.metadata.role || JSON.stringify(l.metadata).substring(0,60)) : String(l.metadata).substring(0,60)) : '—';
        return `<tr>
          <td class="admin-td" style="font-family:'DM Mono',monospace;white-space:nowrap;font-size:10.5px">${new Date(l.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
          <td class="admin-td"><span style="font-size:9.5px;padding:1px 7px;border-radius:8px;background:${ac}22;color:${ac};font-weight:500">${l.action||'—'}</span></td>
          <td class="admin-td" style="color:var(--text-dim);font-size:11px">${l.table_name||'—'}</td>
          <td class="admin-td">${fields}</td>
          <td class="admin-td" style="font-size:10px;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${typeof esc==='function'?esc(String(meta)):meta}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>
  <!-- Paginación -->
  <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:10px;font-size:11px">
    <button onclick="_auditPage=Math.max(0,_auditPage-1);loadAdminData()" ${_auditPage===0?'disabled':''} style="padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);cursor:pointer;font-size:10px;color:var(--text-muted)">← Anterior</button>
    <span style="color:var(--text-muted)">Pág. ${_auditPage+1} de ${totalPages}</span>
    <button onclick="_auditPage=Math.min(${totalPages-1},_auditPage+1);loadAdminData()" ${_auditPage>=totalPages-1?'disabled':''} style="padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);cursor:pointer;font-size:10px;color:var(--text-muted)">Siguiente →</button>
  </div>`}`;
}

/* ── TAB ALERTAS DE SEGURIDAD ── */
async function renderAlertasTab(body) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  try {
    // Cargar destinatarios y alertas en paralelo
    const [recipientsRes, alertsData] = await Promise.all([
      sb.from('security_alert_recipients').select('*').order('created_at'),
      typeof window.loadSecurityAlerts === 'function' ? window.loadSecurityAlerts() : sb.from('security_alerts_sent').select('*').order('created_at', { ascending: false }).limit(50).then(r => r.data || [])
    ]);

    const recipients = recipientsRes.data || [];
    const alerts = Array.isArray(alertsData) ? alertsData : [];

    const sevColors = { critical:'var(--red)', warning:'#f59e0b', info:'var(--blue)' };
    const typeLabels = { mass_deletion:'Eliminación masiva', bulk_participant_access:'Acceso masivo', suspicious_access:'Acceso sospechoso', off_hours:'Fuera de horario' };

    body.innerHTML = `
    <!-- Sub-tabs -->
    <div style="display:flex;gap:4px;margin-bottom:14px">
      <button id="alertTabRecip" class="admin-tab active" onclick="document.getElementById('alertRecipPanel').style.display='';document.getElementById('alertHistPanel').style.display='none';this.classList.add('active');document.getElementById('alertTabHist').classList.remove('active')" style="font-size:11px;padding:5px 12px">📧 Destinatarios (${recipients.length})</button>
      <button id="alertTabHist" class="admin-tab" onclick="document.getElementById('alertHistPanel').style.display='';document.getElementById('alertRecipPanel').style.display='none';this.classList.add('active');document.getElementById('alertTabRecip').classList.remove('active')" style="font-size:11px;padding:5px 12px">📋 Historial (${alerts.length})</button>
    </div>

    <!-- Destinatarios -->
    <div id="alertRecipPanel">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;line-height:1.5">
        Emails que recibirán alertas de seguridad automáticas (eliminación masiva, acceso sospechoso).
      </div>
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <input id="newAlertEmail" type="email" placeholder="email@umag.cl" class="juri-input" style="flex:1;font-size:11px"/>
        <button onclick="addAlertRecipient()" class="btn-save" style="padding:6px 12px;font-size:10px;white-space:nowrap">+ Agregar</button>
      </div>
      ${recipients.length ? recipients.map(r => `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:5px">
        <span style="flex:1;font-size:12px;color:var(--text)">${typeof esc==='function'?esc(r.email):r.email}</span>
        <button onclick="toggleAlertRecipient('${r.id}',${!r.is_active})" style="font-size:10px;padding:2px 8px;border-radius:8px;border:1px solid ${r.is_active?'var(--green)':'var(--border)'};background:${r.is_active?'var(--green)11':'var(--surface)'};color:${r.is_active?'var(--green)':'var(--text-muted)'};cursor:pointer">${r.is_active?'✓ Activo':'Inactivo'}</button>
        <button onclick="removeAlertRecipient('${r.id}')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:13px" title="Eliminar">✕</button>
      </div>`).join('') : '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Sin destinatarios configurados</div>'}

      <div style="margin-top:12px;padding:10px 12px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px">Tipos de alerta monitoreados</div>
        <div style="font-size:11px;color:var(--text-dim);line-height:1.6">
          🔴 <strong>Eliminación masiva:</strong> 5+ eliminaciones de participantes en 5 min<br/>
          🟡 <strong>Acceso masivo:</strong> 50+ accesos a participantes en 5 min<br/>
          🔵 <strong>Acceso sospechoso:</strong> patrones inusuales de consulta
        </div>
      </div>
    </div>

    <!-- Historial -->
    <div id="alertHistPanel" style="display:none">
      ${alerts.length ? `<div style="overflow-x:auto;font-size:11.5px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th class="admin-th">Fecha</th><th class="admin-th">Tipo</th>
            <th class="admin-th">Severidad</th><th class="admin-th">Enviada a</th>
          </tr></thead>
          <tbody>${alerts.map(a => {
            const sc = sevColors[a.severity] || 'var(--text-muted)';
            const tl = typeLabels[a.alert_type] || a.alert_type || '—';
            const emails = a.email_sent_to ? (Array.isArray(a.email_sent_to) ? a.email_sent_to.join(', ') : a.email_sent_to) : '—';
            return `<tr>
              <td class="admin-td" style="font-family:'DM Mono',monospace;white-space:nowrap;font-size:10.5px">${new Date(a.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</td>
              <td class="admin-td" style="font-size:11px">${tl}</td>
              <td class="admin-td"><span style="font-size:9.5px;padding:1px 7px;border-radius:8px;background:${sc}22;color:${sc};font-weight:500">${a.severity||'—'}</span></td>
              <td class="admin-td" style="font-size:10px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${typeof esc==='function'?esc(String(emails)):emails}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>` : '<div class="empty-state">Sin alertas registradas.</div>'}
    </div>`;
  } catch (err) {
    body.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

/* ── CRUD destinatarios alertas ── */
async function addAlertRecipient() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const email = document.getElementById('newAlertEmail')?.value.trim();
  if (!email || !email.includes('@')) { showToast('⚠ Ingresa un email válido'); return; }
  try {
    const { error } = await sb.from('security_alert_recipients').insert({ email, is_active: true });
    if (error) throw error;
    showToast('✓ Destinatario agregado');
    loadAdminData();
  } catch (err) { showToast('⚠ ' + err.message); }
}

async function toggleAlertRecipient(id, active) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { error } = await sb.from('security_alert_recipients').update({ is_active: active }).eq('id', id);
    if (error) throw error;
    showToast(active ? '✓ Activado' : '✓ Desactivado');
    loadAdminData();
  } catch (err) { showToast('⚠ ' + err.message); }
}

async function removeAlertRecipient(id) {
  if (!confirm('¿Eliminar este destinatario?')) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { error } = await sb.from('security_alert_recipients').delete().eq('id', id);
    if (error) throw error;
    showToast('✓ Eliminado');
    loadAdminData();
  } catch (err) { showToast('⚠ ' + err.message); }
}

/* ────────────────────────────────────────────────────────────────
   6 · CARGA DE LÍMITES DESDE BD
   ──────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────
   4 · REGISTRAR USO IA CON COSTO
   ──────────────────────────────────────────────────────────────── */

/**
 * Registra uso de IA con cálculo automático de costo
 * @param {string} fnCode - Código de la función (ej: "chat", "analyze")
 * @param {number} tokensUsed - Tokens procesados (aprox. 4 chars = 1 token)
 * @param {string} detail - Detalle opcional del uso
 */
async function logAIUsage(fnCode, tokensUsed = 0, detail = '') {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return false;

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;

    // Calcular costo: $0.01 por 1000 tokens (parecido a Claude)
    const costUSD = (tokensUsed / 1000) * 0.01;

    // Registrar en ai_usage_logs
    const { error } = await sb.from('ai_usage_logs').insert({
      user_id: user.id,
      fn_code: fnCode,
      detail: detail,
      tokens_used: Math.round(tokensUsed),
      cost_usd: costUSD
    });

    if (error) {
      console.warn('[AI_LOG] Error:', error);
      return false;
    }

    // Actualizar badge
    await refreshAIUsageBadge();
    return true;
  } catch (err) {
    console.warn('[AI_LOG] Exception:', err);
    return false;
  }
}

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

/* ── Fin módulo (archivo quedó truncado; bloque de separador removido para que parse) ── */
