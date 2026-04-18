/**
 * MOD-BRANDING.JS — Configuración visual y personalización
 * ─────────────────────────────────────────────────────────
 * Permite al usuario cambiar colores, logo, fuentes y modo oscuro.
 * Guarda preferencias en localStorage y las aplica al cargar.
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-branding';
  const LS_KEY = 'fiscalito_branding';

  /* ── Temas predefinidos ── */
  const THEMES = {
    default: {
      label: 'Institucional UMAG',
      '--gold': '#4f46e5',
      '--bg': '#f5f5f7',
      '--surface': '#ffffff',
      '--surface2': '#f9fafb',
      '--text': '#1a1a1a',
      '--text-dim': '#4a4a4a',
      '--text-muted': '#9ca3af',
      '--border': '#e5e7eb',
      '--border2': '#d1d5db',
      '--green': '#059669',
      '--red': '#ef4444',
      '--blue': '#3b82f6',
      '--font-body': "'Plus Jakarta Sans', sans-serif",
      '--font-serif': "'EB Garamond', serif",
      '--font-mono': "'Geist Mono', monospace"
    },
    dark: {
      label: 'Modo Oscuro',
      '--gold': '#818cf8',
      '--bg': '#0f1117',
      '--surface': '#1a1d27',
      '--surface2': '#22252f',
      '--text': '#e5e7eb',
      '--text-dim': '#9ca3af',
      '--text-muted': '#6b7280',
      '--border': '#2d3140',
      '--border2': '#374151',
      '--green': '#34d399',
      '--red': '#f87171',
      '--blue': '#60a5fa'
    },
    navy: {
      label: 'Azul Marino',
      '--gold': '#3b82f6',
      '--bg': '#f0f4f8',
      '--surface': '#ffffff',
      '--surface2': '#e8eef4',
      '--text': '#0f172a',
      '--text-dim': '#334155',
      '--text-muted': '#94a3b8',
      '--border': '#cbd5e1',
      '--border2': '#94a3b8',
      '--green': '#059669',
      '--red': '#dc2626',
      '--blue': '#2563eb'
    },
    warm: {
      label: 'Cálido',
      '--gold': '#b45309',
      '--bg': '#fefbf5',
      '--surface': '#ffffff',
      '--surface2': '#fef3c7',
      '--text': '#1c1917',
      '--text-dim': '#44403c',
      '--text-muted': '#a8a29e',
      '--border': '#e7e5e4',
      '--border2': '#d6d3d1',
      '--green': '#15803d',
      '--red': '#dc2626',
      '--blue': '#1d4ed8'
    }
  };

  /* ── Cargar preferencias ── */
  function loadPrefs(){
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
    catch{ return {}; }
  }

  function savePrefs(p){
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  }

  /* ── Aplicar tema ── */
  function applyTheme(themeName){
    const theme = THEMES[themeName];
    if(!theme) return;
    const root = document.documentElement;
    Object.entries(theme).forEach(function(kv){
      if(kv[0].startsWith('--')) root.style.setProperty(kv[0], kv[1]);
    });
    // gold-glow derivado
    const goldVal = theme['--gold'] || '#4f46e5';
    root.style.setProperty('--gold-glow', goldVal + '18');
  }

  function applyCustomProps(prefs){
    const root = document.documentElement;
    if(prefs.customGold) root.style.setProperty('--gold', prefs.customGold);
    if(prefs.customBg) root.style.setProperty('--bg', prefs.customBg);
    if(prefs.fontSize){
      root.style.setProperty('--base-font-size', prefs.fontSize + 'px');
      root.style.fontSize = prefs.fontSize + 'px';
    }
    if(prefs.sidebarWidth){
      const sidebar = document.querySelector('.sidebar');
      if(sidebar) sidebar.style.width = prefs.sidebarWidth + 'px';
    }
  }

  /* ── CSS del panel ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .branding-panel { position:fixed; right:-380px; top:0; width:380px; height:100vh; background:var(--surface); border-left:1px solid var(--border); z-index:9999; transition:right .3s ease; box-shadow:-4px 0 20px rgba(0,0,0,.1); overflow-y:auto; font-size:13px; }
      .branding-panel.open { right:0; }
      .branding-panel h3 { font-family:var(--font-serif); font-size:16px; margin:0 0 16px; padding:20px 20px 0; }
      .branding-section { padding:12px 20px; border-bottom:1px solid var(--border); }
      .branding-section label { display:block; font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
      .branding-swatch { display:inline-block; width:32px; height:32px; border-radius:8px; cursor:pointer; border:2px solid transparent; transition:all .15s; margin:4px; }
      .branding-swatch:hover, .branding-swatch.active { border-color:var(--gold); transform:scale(1.1); }
      .branding-input { width:100%; background:var(--surface2); border:1px solid var(--border2); color:var(--text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:var(--font-body); }
      .branding-range { width:100%; accent-color:var(--gold); }
      .branding-theme-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
      .branding-theme-card { padding:10px; border:2px solid var(--border); border-radius:var(--radius); cursor:pointer; text-align:center; transition:all .15s; }
      .branding-theme-card:hover, .branding-theme-card.active { border-color:var(--gold); }
      .branding-theme-card .preview { display:flex; gap:4px; justify-content:center; margin-bottom:6px; }
      .branding-close { position:absolute; top:16px; right:16px; background:none; border:none; font-size:18px; cursor:pointer; color:var(--text-muted); padding:4px; }
      .branding-btn { background:var(--gold); color:#fff; border:none; padding:8px 16px; border-radius:var(--radius); font-size:12px; cursor:pointer; width:100%; margin-top:8px; }
      .branding-overlay { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:9998; display:none; }
      .branding-overlay.open { display:block; }
    `;
    document.head.appendChild(s);
  }

  /* ── Panel HTML ── */
  function createPanel(){
    if(document.getElementById('brandingPanel')) return;
    const overlay = document.createElement('div');
    overlay.className = 'branding-overlay';
    overlay.id = 'brandingOverlay';
    overlay.onclick = function(){ closePanel(); };
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.className = 'branding-panel';
    panel.id = 'brandingPanel';

    const prefs = loadPrefs();
    const currentTheme = prefs.theme || 'default';

    let html = `<button class="branding-close" onclick="closeBrandingPanel()">&times;</button>
      <h3>🎨 Personalización</h3>

      <div class="branding-section">
        <label>Tema</label>
        <div class="branding-theme-grid">`;

    Object.entries(THEMES).forEach(function(kv){
      const name = kv[0], t = kv[1];
      const active = currentTheme === name ? ' active' : '';
      html += `<div class="branding-theme-card${active}" data-theme="${name}" onclick="applyBrandingTheme('${name}')">
        <div class="preview">
          <div style="width:12px;height:12px;border-radius:50%;background:${t['--gold']||'#4f46e5'}"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:${t['--bg']||'#fff'}; border:1px solid ${t['--border']||'#eee'}"></div>
          <div style="width:12px;height:12px;border-radius:50%;background:${t['--text']||'#000'}"></div>
        </div>
        <div style="font-size:11px;font-weight:500">${t.label}</div>
      </div>`;
    });

    html += `</div></div>

      <div class="branding-section">
        <label>Color acento personalizado</label>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
          <input type="color" id="brandingAccent" value="${prefs.customGold||'#4f46e5'}" style="width:40px;height:32px;border:none;cursor:pointer" onchange="updateBrandingAccent(this.value)">
          <input type="text" class="branding-input" id="brandingAccentText" value="${prefs.customGold||''}" placeholder="#4f46e5" style="flex:1" onchange="updateBrandingAccent(this.value)">
        </div>
      </div>

      <div class="branding-section">
        <label>Tamaño de fuente base (${prefs.fontSize||13}px)</label>
        <input type="range" class="branding-range" min="11" max="18" value="${prefs.fontSize||13}" oninput="updateBrandingFontSize(this.value)">
      </div>

      <div class="branding-section">
        <label>Ancho del sidebar (${prefs.sidebarWidth||220}px)</label>
        <input type="range" class="branding-range" min="180" max="320" value="${prefs.sidebarWidth||220}" oninput="updateBrandingSidebar(this.value)">
      </div>

      <div class="branding-section">
        <button class="branding-btn" onclick="resetBranding()">↻ Restaurar valores por defecto</button>
      </div>`;

    panel.innerHTML = html;
    document.body.appendChild(panel);
  }

  /* ── Abrir / cerrar ── */
  function openPanel(){
    createPanel();
    setTimeout(function(){
      document.getElementById('brandingPanel').classList.add('open');
      document.getElementById('brandingOverlay').classList.add('open');
    }, 10);
  }

  function closePanel(){
    const p = document.getElementById('brandingPanel');
    const o = document.getElementById('brandingOverlay');
    if(p) p.classList.remove('open');
    if(o) o.classList.remove('open');
  }

  /* ── Acciones globales ── */
  window.openBrandingPanel = openPanel;
  window.closeBrandingPanel = closePanel;

  window.applyBrandingTheme = function(name){
    applyTheme(name);
    const prefs = loadPrefs();
    prefs.theme = name;
    delete prefs.customGold;
    delete prefs.customBg;
    savePrefs(prefs);
    // Actualizar tarjetas
    document.querySelectorAll('.branding-theme-card').forEach(function(c){
      c.classList.toggle('active', c.dataset.theme === name);
    });
  };

  window.updateBrandingAccent = function(color){
    if(!color || !color.match(/^#[0-9a-fA-F]{3,8}$/)) return;
    document.documentElement.style.setProperty('--gold', color);
    document.documentElement.style.setProperty('--gold-glow', color + '18');
    const prefs = loadPrefs();
    prefs.customGold = color;
    savePrefs(prefs);
    const picker = document.getElementById('brandingAccent');
    const text = document.getElementById('brandingAccentText');
    if(picker) picker.value = color;
    if(text) text.value = color;
  };

  window.updateBrandingFontSize = function(val){
    const size = parseInt(val);
    document.documentElement.style.fontSize = size + 'px';
    const prefs = loadPrefs();
    prefs.fontSize = size;
    savePrefs(prefs);
  };

  window.updateBrandingSidebar = function(val){
    const w = parseInt(val);
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.style.width = w + 'px';
    const prefs = loadPrefs();
    prefs.sidebarWidth = w;
    savePrefs(prefs);
  };

  window.resetBranding = function(){
    localStorage.removeItem(LS_KEY);
    applyTheme('default');
    document.documentElement.style.fontSize = '';
    const sidebar = document.querySelector('.sidebar');
    if(sidebar) sidebar.style.width = '';
    closePanel();
    if(typeof showToast==='function') showToast('Branding restaurado','success');
  };

  /* ── Botón en sidebar ── */
  function addSidebarButton(){
    const nav = document.querySelector('.sidebar');
    if(!nav || document.getElementById('brandingNavBtn')) return;
    const btn = document.createElement('div');
    btn.id = 'brandingNavBtn';
    btn.className = 'sidebar-nav-item';
    btn.innerHTML = '🎨 Personalizar';
    btn.style.cssText = 'cursor:pointer;padding:8px 16px;font-size:12px;color:var(--text-muted);transition:color .15s;border-top:1px solid var(--border);margin-top:auto';
    btn.onclick = openPanel;
    btn.onmouseover = function(){ this.style.color='var(--gold)'; };
    btn.onmouseout = function(){ this.style.color='var(--text-muted)'; };
    /* Bug-fix UX: insertar ANTES del div de account actions (Cambiar contraseña /
       Cerrar sesión). Antes se hacía nav.appendChild(btn) que lo metía como último
       hijo del sidebar, quedando DEBAJO de los account actions y cortado/tapado
       por el borde inferior del sidebar. */
    const accountActions = document.getElementById('sidebarAccountActions');
    if (accountActions && accountActions.parentNode === nav) {
      nav.insertBefore(btn, accountActions);
    } else {
      /* Fallback: sidebar viejo sin id — comportamiento original. */
      nav.appendChild(btn);
    }
  }

  /* ── Init: aplicar tema guardado ── */
  function init(){
    const prefs = loadPrefs();
    if(prefs.theme) applyTheme(prefs.theme);
    applyCustomProps(prefs);
    addSidebarButton();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
