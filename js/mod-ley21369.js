/* ================================================================
   MOD-LEY21369.JS — Módulo completo Ley 21.369
   Implementación Ley sobre Acoso Sexual, Violencia y
   Discriminación de Género en Instituciones de Educación Superior
   ================================================================
   Versión: 2.0 · Refundido · 2026-03-25
   Integración: Fiscalito / UMAG
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   CONSTANTES
   ──────────────────────────────────────────────────────────────── */
const LEY_AREAS = [
  { id:'protocolo',           label:'Protocolo de actuación',          icon:'📋' },
  { id:'modelo_prevencion',   label:'Modelo de prevención',            icon:'🛡️' },
  { id:'capacitacion',        label:'Capacitación y formación',        icon:'🎓' },
  { id:'difusion',            label:'Difusión y sensibilización',      icon:'📢' },
  { id:'canales_denuncia',    label:'Canales de denuncia',             icon:'📞' },
  { id:'investigacion',       label:'Procedimientos de investigación', icon:'🔍' },
  { id:'medidas_reparacion',  label:'Medidas de reparación',           icon:'🤝' },
  { id:'registro_estadistico',label:'Registro estadístico',            icon:'📊' },
  { id:'organo_encargado',    label:'Órgano encargado',                icon:'🏛️' },
  { id:'general',             label:'General / Otros',                 icon:'📁' },
];

const LEY_STATUS = {
  pendiente:  { label:'Pendiente',  cls:'ley-badge-pendiente'  },
  en_proceso: { label:'En proceso', cls:'ley-badge-en_proceso' },
  cumplido:   { label:'Cumplido',   cls:'ley-badge-cumplido'   },
  no_aplica:  { label:'No aplica',  cls:'ley-badge-no_aplica'  },
};

// Requisitos normativos por artículo para el tab Cumplimiento
const LEY_REQUISITOS_LEGALES = [
  { art:'Art. 1', titulo:'Objeto',                reqs:[
    { k:'1.1', txt:'Políticas integrales contra acoso sexual, violencia y discriminación de género' },
    { k:'1.2', txt:'Ambiente seguro y libre de acoso para toda la comunidad universitaria' },
  ]},
  { art:'Art. 2', titulo:'Protocolo de actuación', reqs:[
    { k:'2.1', txt:'Protocolo aprobado para enfrentar denuncias' },
    { k:'2.2', txt:'Protocolo difundido a toda la comunidad universitaria' },
    { k:'2.3', txt:'Procedimiento claro de recepción y tramitación de denuncias' },
    { k:'2.4', txt:'Plazos definidos para cada etapa del procedimiento' },
    { k:'2.5', txt:'Garantías de debido proceso y derecho a defensa' },
  ]},
  { art:'Art. 3', titulo:'Modelo de prevención',   reqs:[
    { k:'3.1', txt:'Política institucional de prevención aprobada' },
    { k:'3.2', txt:'Diagnóstico institucional sobre la materia realizado' },
    { k:'3.3', txt:'Plan de acción con medidas preventivas específicas' },
  ]},
  { art:'Art. 4', titulo:'Capacitación',            reqs:[
    { k:'4.1', txt:'Programa de capacitación obligatoria para funcionarios y académicos' },
    { k:'4.2', txt:'Capacitación especial para quienes investigan denuncias' },
    { k:'4.3', txt:'Actividades formativas para estudiantes' },
  ]},
  { art:'Art. 5', titulo:'Canales de denuncia',     reqs:[
    { k:'5.1', txt:'Canales formales de denuncia accesibles para toda la comunidad' },
    { k:'5.2', txt:'Garantía de confidencialidad en la recepción de denuncias' },
    { k:'5.3', txt:'Posibilidad de denuncia presencial y remota' },
  ]},
  { art:'Art. 6', titulo:'Medidas de protección',   reqs:[
    { k:'6.1', txt:'Catálogo de medidas cautelares y de resguardo' },
    { k:'6.2', txt:'Medidas de acompañamiento y reparación para personas afectadas' },
    { k:'6.3', txt:'Seguimiento de medidas adoptadas' },
  ]},
  { art:'Art. 7', titulo:'Órgano encargado',        reqs:[
    { k:'7.1', txt:'Unidad o encargado/a de género designado formalmente' },
    { k:'7.2', txt:'Independencia funcional del órgano encargado' },
    { k:'7.3', txt:'Recursos humanos y materiales asignados' },
  ]},
  { art:'Art. 8', titulo:'Registro estadístico',    reqs:[
    { k:'8.1', txt:'Sistema de registro estadístico de denuncias y casos' },
    { k:'8.2', txt:'Datos desagregados por tipo, estamento y resultado' },
    { k:'8.3', txt:'Informe periódico de gestión (al menos anual) enviado a la SES' },
  ]},
  { art:'Art. 9', titulo:'Difusión',                reqs:[
    { k:'9.1', txt:'Plan de difusión del protocolo y canales de denuncia' },
    { k:'9.2', txt:'Material informativo accesible (web, afiches, inducción)' },
    { k:'9.3', txt:'Campañas de sensibilización periódicas' },
  ]},
  { art:'SES',    titulo:'Directrices SES',          reqs:[
    { k:'SES.1', txt:'Respuestas oportunas a requerimientos de la Superintendencia de Educación Superior' },
    { k:'SES.2', txt:'Documentación de respaldo organizada y disponible' },
    { k:'SES.3', txt:'Directrices SES incorporadas en protocolos internos' },
  ]},
];

const LEY_KEYWORDS = [
  'acoso sexual','violencia de género','violencia de genero',
  'discriminación de género','discriminacion de genero',
  'ley 21.369','ley 21369','protocolo de género','protocolo de genero',
  'acoso por medios digitales','represalias',
];

/* ────────────────────────────────────────────────────────────────
   ESTADO GLOBAL
   ──────────────────────────────────────────────────────────────── */
const ley21369State = {
  items:       [],
  documents:   [],
  leyCases:    [],
  tab:         'semaforo',  // semaforo | checklist | cumplimiento | tabla | alertas | casos | chat | informe
  expandedArts: new Set(LEY_REQUISITOS_LEGALES.map(r => r.art)),
  chat: { messages:[], loading:false },
  informe: { content:'', generating:false },
  tabla: { filter:'', statusFilter:'' },
  initialized: false,
};

/* ────────────────────────────────────────────────────────────────
   APERTURA Y CARGA
   ──────────────────────────────────────────────────────────────── */
function openLey21369() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewLey21369');
  if (!ley21369State.initialized) {
    loadLey21369();
  } else {
    renderLey21369KPIs();
    renderLey21369Tab(ley21369State.tab);
  }
}

async function loadLey21369() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof sb !== 'undefined' ? sb : null);
  if (!sb) return;

  try {
    const [itemsRes, docsRes] = await Promise.all([
      sb.from('ley21369_items').select('*').order('sort_order', { ascending: true }),
      sb.from('ley21369_documents').select('*').order('created_at', { ascending: false }),
    ]);

    if (itemsRes.error?.message?.includes('does not exist')) {
      ley21369ShowMigrationWarning();
      return;
    }

    ley21369State.items     = itemsRes.data  || [];
    ley21369State.documents = docsRes.data   || [];
    ley21369State.initialized = true;

    // Load linked cases in background
    loadLey21369Cases();

    renderLey21369KPIs();
    renderLey21369Tab(ley21369State.tab);
  } catch (err) {
    console.error('Ley21369 load:', err);
  }
}

async function loadLey21369Cases() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const [casesRes, metaRes, partsRes] = await Promise.all([
      sb.from('cases').select('id,name,rol,caratula,status,description,created_at').is('deleted_at', null).limit(200),
      sb.from('case_metadata').select('case_id,key,value').limit(2000),
      sb.from('case_participants').select('case_id,role,name,estamento').limit(2000),
    ]);
    const cases = casesRes.data || [];
    const meta  = metaRes.data  || [];
    const parts = partsRes.data || [];

    ley21369State.leyCases = cases.filter(c => {
      const hasMeta = meta.some(m => m.case_id === c.id && m.key === 'protocolo_aplicable' && m.value.toLowerCase().includes('21.369'));
      if (hasMeta) return true;
      const txt = [c.caratula, c.description, c.name, ...meta.filter(m => m.case_id === c.id).map(m => m.value)].filter(Boolean).join(' ').toLowerCase();
      return LEY_KEYWORDS.some(kw => txt.includes(kw));
    }).map(c => ({
      ...c,
      _meta: meta.filter(m => m.case_id === c.id),
      _parts: parts.filter(p => p.case_id === c.id),
    }));

    if (ley21369State.tab === 'casos') renderLey21369Tab('casos');
  } catch (err) { /* casos no críticos */ }
}

function ley21369ShowMigrationWarning() {
  const grid = document.getElementById('leySemaforoGrid');
  if (grid) grid.innerHTML = `<div class="ley-empty" style="grid-column:1/-1">
    <div style="font-size:30px;margin-bottom:10px">⚠️</div>
    <p style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:6px">Tablas no encontradas en Supabase</p>
    <p style="font-size:11px;color:var(--text-muted)">Ejecuta <strong>supabase_migration_ley21369.sql</strong> en tu proyecto para activar este módulo.</p>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   KPIs
   ──────────────────────────────────────────────────────────────── */
function renderLey21369KPIs() {
  const { items, documents } = ley21369State;
  const total     = items.length;
  const cumplidos = items.filter(i => i.status === 'cumplido').length;
  const enProceso = items.filter(i => i.status === 'en_proceso').length;
  const pendientes= items.filter(i => i.status === 'pendiente').length;
  const pct       = total > 0 ? Math.round((cumplidos / total) * 100) : 0;
  const today     = new Date().toISOString().split('T')[0];
  const vencidos  = items.filter(i => i.due_date && i.due_date < today && i.status !== 'cumplido' && i.status !== 'no_aplica').length;
  const sinVerif  = items.filter(i => i.status === 'cumplido' && !documents.some(d => d.item_id === i.id)).length;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('leyKpiPct',        total > 0 ? pct + '%' : '—');
  set('leyKpiCumplidos',  cumplidos);
  set('leyKpiEnProceso',  enProceso);
  set('leyKpiPendientes', pendientes);
  set('leyKpiVencidos',   vencidos);

  const bar = document.getElementById('leyKpiBar');
  if (bar) bar.style.width = pct + '%';

  // Warning banner: cumplidos sin verificador
  const warn = document.getElementById('leyWarnBanner');
  if (warn) {
    warn.style.display = sinVerif > 0 ? 'flex' : 'none';
    warn.querySelector('#leyWarnCount') && (warn.querySelector('#leyWarnCount').textContent = sinVerif);
  }
}

/* ────────────────────────────────────────────────────────────────
   TABS
   ──────────────────────────────────────────────────────────────── */
function switchLeyTab(tabId, btn) {
  document.querySelectorAll('.ley-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const ALL_TABS = ['semaforo','checklist','cumplimiento','tabla','alertas','casos','chat','informe'];
  ALL_TABS.forEach(id => {
    const el = document.getElementById('leyBody_' + id);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById('leyBody_' + tabId);
  if (target) target.style.display = tabId === 'chat' ? 'flex' : 'block';
  ley21369State.tab = tabId;
  renderLey21369Tab(tabId);
}

function renderLey21369Tab(tabId) {
  switch (tabId) {
    case 'semaforo':     renderLeySemaforo();     break;
    case 'checklist':    renderLeyChecklist();    break;
    case 'cumplimiento': renderLeyCumplimiento(); break;
    case 'tabla':        renderLeyTabla();        break;
    case 'alertas':      renderLeyAlertas();      break;
    case 'casos':        renderLeyCasos();        break;
  }
}

/* ────────────────────────────────────────────────────────────────
   TAB 1: SEMÁFORO
   ──────────────────────────────────────────────────────────────── */
function renderLeySemaforo() {
  const grid = document.getElementById('leySemaforoGrid');
  if (!grid) return;
  const { items } = ley21369State;

  if (!items.length) {
    grid.innerHTML = `<div class="ley-empty" style="grid-column:1/-1">Sin requisitos. Haz clic en <strong>+ Requisito</strong> para comenzar.</div>`;
    return;
  }

  // Global progress ring visual
  const total     = items.length;
  const cumplidos = items.filter(i => i.status === 'cumplido').length;
  const pct       = total > 0 ? Math.round((cumplidos / total) * 100) : 0;

  const cards = LEY_AREAS.map(area => {
    const ai  = items.filter(i => i.area === area.id);
    if (!ai.length) return '';
    const ac  = ai.filter(i => i.status === 'cumplido').length;
    const ep  = ai.filter(i => i.status === 'en_proceso').length;
    const pen = ai.filter(i => i.status === 'pendiente').length;
    const p   = Math.round(ac / ai.length * 100);
    const [barCls, dotColor, emoji] = p >= 80
      ? ['ley-bar-verde', '#059669', '🟢']
      : p >= 50
        ? ['ley-bar-naranja', '#f59e0b', '🟡']
        : ['ley-bar-rojo', '#ef4444', '🔴'];
    return `<div class="ley-semaforo-card">
      <div class="ley-semaforo-icon">${area.icon}</div>
      <div class="ley-semaforo-area">${area.label}</div>
      <div class="ley-semaforo-pct" style="color:${dotColor}">${p}% ${emoji}</div>
      <div class="ley-semaforo-bar"><div class="ley-semaforo-bar-fill ${barCls}" style="width:${p}%"></div></div>
      <div class="ley-semaforo-meta">${ac} cumplidos · ${ep} en proceso · ${pen} pendientes</div>
    </div>`;
  }).join('');

  grid.innerHTML = cards || `<div class="ley-empty" style="grid-column:1/-1">Sin datos por área.</div>`;
}

/* ────────────────────────────────────────────────────────────────
   TAB 2: CHECKLIST (por área, CRUD inline)
   ──────────────────────────────────────────────────────────────── */
function renderLeyChecklist() {
  const container = document.getElementById('leyChecklistContainer');
  if (!container) return;
  const { items, documents } = ley21369State;

  if (!items.length) {
    container.innerHTML = `<div class="ley-empty">Sin requisitos. Usa <strong>+ Requisito</strong> para agregar.</div>`;
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  let html = '';

  LEY_AREAS.forEach(area => {
    const ai  = items.filter(i => i.area === area.id);
    if (!ai.length) return;
    const ac  = ai.filter(i => i.status === 'cumplido').length;
    const pct = Math.round(ac / ai.length * 100);

    html += `<div class="ley-area-block">
      <div class="ley-area-header" onclick="toggleLeyArea('${area.id}')">
        <div class="ley-area-title">${area.icon} ${area.label}
          <span style="font-size:9.5px;font-weight:400;color:var(--text-muted);margin-left:4px">(${ai.length})</span>
        </div>
        <div class="ley-area-progress">
          <span class="ley-area-pct">${pct}%</span>
          <div class="ley-area-bar-wrap"><div class="ley-area-bar-fill" style="width:${pct}%"></div></div>
          <span class="ley-area-chevron open" id="leyChev-${area.id}">▼</span>
        </div>
      </div>
      <div class="ley-area-body" id="leyAreaBody-${area.id}">`;

    ai.forEach(item => {
      const docs  = documents.filter(d => d.item_id === item.id);
      const venc  = item.due_date && item.due_date < today && item.status !== 'cumplido' && item.status !== 'no_aplica';
      const stCls = (LEY_STATUS[item.status] || LEY_STATUS.pendiente).cls;
      const stLbl = (LEY_STATUS[item.status] || LEY_STATUS.pendiente).label;

      html += `<div class="ley-item">
        <div class="ley-item-left">
          <div class="ley-item-req"${venc ? ' style="color:var(--red)"' : ''}>
            ${escLey(item.requirement)}
            ${venc ? '<span style="font-size:9px;color:var(--red);margin-left:5px">⚠️ vencido</span>' : ''}
          </div>
          ${item.responsible || item.due_date ? `<div class="ley-item-meta">
            ${item.responsible ? `<span class="ley-alert-badge">👤 ${escLey(item.responsible)}</span>` : ''}
            ${item.due_date    ? `<span class="ley-alert-badge">📅 ${item.due_date}</span>` : ''}
            ${docs.length      ? `<span class="ley-alert-badge">📎 ${docs.length} verif.</span>` : ''}
          </div>` : ''}
          <textarea class="ley-notes-input" rows="1" placeholder="Notas de verificación…"
            onchange="updateLeyNotes('${item.id}',this.value)"
            style="margin-top:5px">${escLey(item.verification_notes || '')}</textarea>
        </div>
        <div class="ley-item-right">
          <select class="ley-status-sel" onchange="updateLeyStatus('${item.id}',this.value)">
            <option value="pendiente"  ${item.status==='pendiente'  ?'selected':''}>Pendiente</option>
            <option value="en_proceso" ${item.status==='en_proceso' ?'selected':''}>En proceso</option>
            <option value="cumplido"   ${item.status==='cumplido'   ?'selected':''}>Cumplido</option>
            <option value="no_aplica"  ${item.status==='no_aplica'  ?'selected':''}>No aplica</option>
          </select>
          <span class="ley-badge ${stCls}">${stLbl}</span>
          <button class="btn-del" onclick="deleteLeyItem('${item.id}')" title="Eliminar">✕</button>
        </div>
      </div>`;
    });

    html += `<div class="ley-add-item-row">
        <input type="text" class="ley-add-item-input" id="leyInline-${area.id}"
          placeholder="Agregar requisito rápido en ${area.label}…"
          onkeydown="if(event.key==='Enter')saveInlineLeyItem('${area.id}')"/>
        <button class="btn-save" style="padding:5px 12px;font-size:11px"
          onclick="saveInlineLeyItem('${area.id}')">+</button>
      </div>
      </div>
    </div>`;
  });

  container.innerHTML = html || `<div class="ley-empty">Sin áreas con datos.</div>`;
}

function toggleLeyArea(areaId) {
  const body = document.getElementById('leyAreaBody-' + areaId);
  const chev = document.getElementById('leyChev-' + areaId);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chev) chev.classList.toggle('open', !open);
}

/* ────────────────────────────────────────────────────────────────
   TAB 3: CUMPLIMIENTO NORMATIVO (por artículo de la ley)
   ──────────────────────────────────────────────────────────────── */
function renderLeyCumplimiento() {
  const container = document.getElementById('leyCumplimientoContainer');
  if (!container) return;
  const { items, expandedArts } = ley21369State;

  let totalReqs = 0, fulfilled = 0;
  const articles = LEY_REQUISITOS_LEGALES.map(article => {
    const reqs = article.reqs.map(req => {
      totalReqs++;
      const keywords = req.txt.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matches  = items.filter(item => {
        const txt  = `${item.requirement} ${item.area}`.toLowerCase();
        return keywords.filter(kw => txt.includes(kw)).length >= 2;
      });
      const best = matches.find(i => i.status === 'cumplido') || matches[0] || null;
      const status = best ? best.status : 'sin_registro';
      if (status === 'cumplido') fulfilled++;
      return { ...req, status, matchedItem: best };
    });
    const artFulfilled = reqs.filter(r => r.status === 'cumplido').length;
    return { ...article, reqs, pct: Math.round(artFulfilled / reqs.length * 100), fulfilled: artFulfilled };
  });

  const globalPct = totalReqs > 0 ? Math.round(fulfilled / totalReqs * 100) : 0;

  const statusIcon = s => {
    if (s === 'cumplido')   return '✅';
    if (s === 'en_proceso') return '🔵';
    if (s === 'pendiente')  return '⚠️';
    return '⭕';
  };
  const statusBadge = s => {
    const map = { cumplido:'ley-badge-cumplido', en_proceso:'ley-badge-en_proceso', pendiente:'ley-badge-pendiente', sin_registro:'ley-badge-no_aplica' };
    const lbl = { cumplido:'Cumplido', en_proceso:'En proceso', pendiente:'Pendiente', sin_registro:'Sin registro' };
    return `<span class="ley-badge ${map[s]||'ley-badge-no_aplica'}">${lbl[s]||s}</span>`;
  };

  let html = `<div class="ley-cumpl-global">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span style="font-size:13px;font-weight:600">⚖️ Cumplimiento normativo: ${globalPct}%</span>
      <span style="font-size:11px;color:var(--text-muted)">${fulfilled} / ${totalReqs} requisitos legales</span>
    </div>
    <div class="ley-semaforo-bar" style="height:6px"><div class="ley-semaforo-bar-fill ${globalPct>=80?'ley-bar-verde':globalPct>=50?'ley-bar-naranja':'ley-bar-rojo'}" style="width:${globalPct}%"></div></div>
  </div>`;

  articles.forEach(article => {
    const isOpen = expandedArts.has(article.art);
    html += `<div class="ley-area-block" style="margin-bottom:8px">
      <div class="ley-area-header" onclick="toggleLeyCumplArt('${article.art}')">
        <div class="ley-area-title" style="font-size:12px">
          <strong>${article.art}</strong> — ${article.titulo}
          <span style="font-size:9.5px;font-weight:400;color:var(--text-muted);margin-left:4px">(${article.fulfilled}/${article.reqs.length})</span>
        </div>
        <div class="ley-area-progress">
          <span class="ley-area-pct">${article.pct}%</span>
          <div class="ley-area-bar-wrap"><div class="ley-area-bar-fill" style="width:${article.pct}%"></div></div>
          <span class="ley-area-chevron ${isOpen?'open':''}" id="leyCumplChev-${article.art}">▼</span>
        </div>
      </div>
      <div class="ley-area-body" id="leyCumplBody-${article.art}" style="${isOpen?'':'display:none'}">
        ${article.reqs.map(req => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-bottom:1px solid var(--border)">
            <span style="font-size:13px;flex-shrink:0;margin-top:1px">${statusIcon(req.status)}</span>
            <div style="flex:1">
              <div style="font-size:12px;margin-bottom:2px">${escLey(req.txt)}</div>
              ${req.matchedItem ? `<div style="font-size:10px;color:var(--text-muted)">→ Vinculado: "${escLey(req.matchedItem.requirement)}"</div>` : ''}
            </div>
            ${statusBadge(req.status)}
          </div>`).join('')}
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function toggleLeyCumplArt(art) {
  const { expandedArts } = ley21369State;
  const body = document.getElementById('leyCumplBody-' + art);
  const chev = document.getElementById('leyCumplChev-' + art);
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (open) expandedArts.delete(art); else expandedArts.add(art);
  if (chev) chev.classList.toggle('open', !open);
}

/* ────────────────────────────────────────────────────────────────
   TAB 4: TABLA (editable, filtros)
   ──────────────────────────────────────────────────────────────── */
function renderLeyTabla() {
  const tbody = document.getElementById('leyTablaTbody');
  if (!tbody) return;
  const { items, documents, tabla } = ley21369State;

  let filtered = items;
  if (tabla.filter)       filtered = filtered.filter(i => i.requirement.toLowerCase().includes(tabla.filter));
  if (tabla.statusFilter) filtered = filtered.filter(i => i.status === tabla.statusFilter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="ley-empty">Sin resultados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const area = LEY_AREAS.find(a => a.id === item.area) || { icon:'📁', label: item.area };
    const docs = documents.filter(d => d.item_id === item.id);
    return `<tr>
      <td style="font-size:10.5px;color:var(--text-dim)">${area.icon} ${area.label}</td>
      <td style="font-size:11.5px;max-width:240px">${escLey(item.requirement)}</td>
      <td>
        <select class="ley-status-sel" onchange="updateLeyStatus('${item.id}',this.value)" style="width:100px">
          <option value="pendiente"  ${item.status==='pendiente'  ?'selected':''}>Pendiente</option>
          <option value="en_proceso" ${item.status==='en_proceso' ?'selected':''}>En proceso</option>
          <option value="cumplido"   ${item.status==='cumplido'   ?'selected':''}>Cumplido</option>
          <option value="no_aplica"  ${item.status==='no_aplica'  ?'selected':''}>No aplica</option>
        </select>
      </td>
      <td><input class="ley-tabla-input" style="width:110px" value="${escLey(item.responsible||'')}"
            onblur="updateLeyField('${item.id}','responsible',this.value)" placeholder="Responsable"/></td>
      <td><input class="ley-tabla-input" type="date" style="width:130px" value="${item.due_date||''}"
            onblur="updateLeyField('${item.id}','due_date',this.value||null)"/></td>
      <td style="text-align:center;color:var(--text-muted);font-size:11px">${docs.length}</td>
      <td><button class="btn-del" onclick="deleteLeyItem('${item.id}')">✕</button></td>
    </tr>`;
  }).join('');
}

function filterLeyTabla(q) {
  if (q !== undefined) ley21369State.tabla.filter = q.toLowerCase();
  ley21369State.tabla.statusFilter = document.getElementById('leyTablaStatusFilter')?.value || '';
  renderLeyTabla();
}

/* ────────────────────────────────────────────────────────────────
   TAB 5: ALERTAS (vencidos / próximos)
   ──────────────────────────────────────────────────────────────── */
function renderLeyAlertas() {
  const container = document.getElementById('leyAlertasContainer');
  if (!container) return;

  const today = new Date(); today.setHours(0,0,0,0);
  const in7   = new Date(today); in7.setDate(in7.getDate() + 7);
  const in30  = new Date(today); in30.setDate(in30.getDate() + 30);
  const active = ley21369State.items.filter(i => i.status !== 'cumplido' && i.status !== 'no_aplica' && i.due_date);
  const venc = [], pronto = [], prox = [];

  active.forEach(item => {
    const d = new Date(item.due_date + 'T00:00:00');
    if (d < today) venc.push(item);
    else if (d <= in7) pronto.push(item);
    else if (d <= in30) prox.push(item);
  });

  if (!venc.length && !pronto.length && !prox.length) {
    container.innerHTML = `<div class="ley-empty"><div style="font-size:28px;margin-bottom:8px">🔔</div><p>No hay alertas de plazos activas.</p><p style="margin-top:4px;font-size:11px">Agrega fechas límite a los requisitos para activar alertas.</p></div>`;
    return;
  }

  const renderItems = (list, sev) => list.map(item => {
    const d = new Date(item.due_date + 'T00:00:00');
    const diff = Math.ceil((d - today) / 86400000);
    const daysTxt = diff < 0 ? `${Math.abs(diff)} días vencido` : diff === 0 ? 'Vence hoy' : `${diff} días restantes`;
    const area = LEY_AREAS.find(a => a.id === item.area) || { icon:'📁', label: item.area };
    return `<div class="ley-alert-item">
      <div class="ley-alert-req">
        ${area.icon} ${escLey(item.requirement)}
        <div class="ley-alert-meta">
          <span class="ley-alert-badge">${area.label}</span>
          ${item.responsible ? `<span class="ley-alert-badge">👤 ${escLey(item.responsible)}</span>` : ''}
        </div>
        <div class="ley-alert-days ${sev}">📅 ${item.due_date} — ${daysTxt}</div>
      </div>
    </div>`;
  }).join('');

  let html = '';
  if (venc.length)  html += `<div class="ley-alert-group ley-alert-vencido"><div class="ley-alert-group-title">⚠️ Plazos vencidos (${venc.length})</div>${renderItems(venc,'red')}</div>`;
  if (pronto.length)html += `<div class="ley-alert-group ley-alert-pronto"><div class="ley-alert-group-title">🔔 Vencen esta semana (${pronto.length})</div>${renderItems(pronto,'orange')}</div>`;
  if (prox.length)  html += `<div class="ley-alert-group ley-alert-prox"><div class="ley-alert-group-title">📅 Próximos 30 días (${prox.length})</div>${renderItems(prox,'blue')}</div>`;
  container.innerHTML = html;
}

/* ────────────────────────────────────────────────────────────────
   TAB 6: CASOS PROTOCOLO (expedientes vinculados a Ley 21.369)
   ──────────────────────────────────────────────────────────────── */
function renderLeyCasos() {
  const container = document.getElementById('leyCasosContainer');
  if (!container) return;
  const { leyCases } = ley21369State;

  if (!leyCases.length) {
    container.innerHTML = `<div class="ley-empty">
      <div style="font-size:28px;margin-bottom:8px">🛡️</div>
      <p style="font-size:13px;font-weight:500;margin-bottom:5px">Sin casos vinculados</p>
      <p style="font-size:11px">Etiqueta expedientes con <code>protocolo_aplicable: Ley 21.369</code> en sus metadatos, o usa palabras clave como "acoso sexual" en la descripción.</p>
    </div>`;
    return;
  }

  // Stats
  const total      = leyCases.length;
  const activos    = leyCases.filter(c => c.status === 'active').length;
  const terminados = leyCases.filter(c => ['archived','completed','terminado','cerrado'].includes(c.status)).length;
  const conMedida  = leyCases.filter(c => c._meta?.some(m => m.key === 'medida_cautelar' && ['si','sí'].includes((m.value||'').toLowerCase()))).length;

  // Materia breakdown
  const materias = {};
  leyCases.forEach(c => {
    const m = c._meta?.find(x => x.key === 'materia_genero' || x.key === 'materia')?.value || 'Sin clasificar';
    materias[m] = (materias[m] || 0) + 1;
  });

  const kpis = [
    { val: total,      label: 'Total denuncias',    color: 'var(--gold)' },
    { val: activos,    label: 'En tramitación',      color: '#f59e0b' },
    { val: terminados, label: 'Terminados',           color: 'var(--green)' },
    { val: conMedida,  label: 'Con medida cautelar', color: 'var(--blue)' },
  ];

  const kpiHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
    ${kpis.map(k => `<div class="ley-kpi-card">
      <div class="ley-kpi-val" style="color:${k.color}">${k.val}</div>
      <div class="ley-kpi-label">${k.label}</div>
    </div>`).join('')}
  </div>`;

  const materiasHtml = Object.keys(materias).length ? `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:600;margin-bottom:8px">📊 Distribución por materia</div>
    ${Object.entries(materias).sort((a,b)=>b[1]-a[1]).map(([mat,n]) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <div style="font-size:11.5px;flex:1;color:var(--text-dim)">${escLey(mat)}</div>
        <div style="height:5px;width:${Math.round(n/total*120)}px;background:linear-gradient(90deg,var(--gold-dim),var(--gold));border-radius:3px"></div>
        <span style="font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace;min-width:20px">${n}</span>
      </div>`).join('')}
  </div>` : '';

  const tableHtml = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
    <div style="padding:9px 12px;border-bottom:1px solid var(--border);background:var(--surface2);font-size:11px;font-weight:600">
      📋 Listado de casos (${leyCases.length})
    </div>
    <div style="overflow-x:auto">
      <table class="ley-tabla">
        <thead><tr>
          <th>Expediente</th><th>Carátula</th><th>Materia</th><th>Estado</th><th>Medida</th><th>Año</th>
        </tr></thead>
        <tbody>
          ${leyCases.map(c => {
            const materia  = c._meta?.find(m => m.key==='materia_genero'||m.key==='materia')?.value || '—';
            const hasMC    = c._meta?.some(m => m.key==='medida_cautelar' && ['si','sí'].includes((m.value||'').toLowerCase()));
            const anio     = c.created_at ? new Date(c.created_at).getFullYear() : '—';
            const stsColor = c.status==='active'?'var(--green)':c.status==='archived'||c.status==='terminado'?'var(--text-muted)':'var(--gold)';
            const stsLabel = c.status==='active'?'Activo':c.status==='archived'||c.status==='terminado'?'Terminado':'En proceso';
            return `<tr style="cursor:pointer" onclick="${typeof pickCaseById!=='undefined'?`pickCaseById('${c.id}')`:''}">
              <td style="font-weight:600;color:var(--gold)">${escLey(c.name||'—')}</td>
              <td style="font-size:10.5px">${escLey(c.caratula||'—')}</td>
              <td style="font-size:10.5px;max-width:160px">${escLey(materia)}</td>
              <td><span style="font-size:10px;color:${stsColor}">${stsLabel}</span></td>
              <td style="text-align:center">${hasMC?'<span class="mc-badge">Sí</span>':'<span class="no-badge">No</span>'}</td>
              <td style="font-size:10px;color:var(--text-muted)">${anio}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;

  container.innerHTML = kpiHtml + materiasHtml + tableHtml;
}

/* ────────────────────────────────────────────────────────────────
   TAB 7: CHAT IA
   ──────────────────────────────────────────────────────────────── */
function leyQuickQuery(text) {
  const input = document.getElementById('leyChatInput');
  if (input) input.value = text;
  sendLeyChat();
}

async function sendLeyChat() {
  const input = document.getElementById('leyChatInput');
  if (!input || !input.value.trim() || ley21369State.chat.loading) return;
  const text = input.value.trim();
  input.value = '';
  input.style.height = 'auto';

  ley21369State.chat.messages.push({ role:'user', content:text });
  appendLeyChatMsg('user', text);
  const typing = appendLeyChatTyping();
  ley21369State.chat.loading = true;
  const btn = document.getElementById('leyChatSendBtn');
  if (btn) btn.disabled = true;

  try {
    const { items, documents, leyCases } = ley21369State;
    const total     = items.length;
    const cumplidos = items.filter(i => i.status === 'cumplido').length;
    const pct       = total > 0 ? Math.round(cumplidos/total*100) : 0;
    const today     = new Date().toISOString().split('T')[0];
    const vencidos  = items.filter(i => i.due_date && i.due_date < today && i.status!=='cumplido' && i.status!=='no_aplica').length;
    const areasSummary = LEY_AREAS.map(area => {
      const ai = items.filter(i => i.area === area.id);
      if (!ai.length) return null;
      const ac = ai.filter(i => i.status==='cumplido').length;
      return `${area.label}: ${Math.round(ac/ai.length*100)}% (${ac}/${ai.length})`;
    }).filter(Boolean).join(', ');

    const detallePendientes = items.filter(i => i.status === 'pendiente').slice(0, 10).map(i => `- ${i.requirement}${i.responsible?' ('+i.responsible+')':''}`).join('\n');

    const systemPrompt = `Eres Fiscalito, asistente especializado en la Ley 21.369 de Chile (Ley que Regula el Acoso Sexual, la Violencia y la Discriminación de Género en el Ámbito de la Educación Superior).

ESTADO DE CUMPLIMIENTO UMAG:
- Requisitos totales: ${total} | Cumplidos: ${cumplidos} (${pct}%) | Pendientes: ${items.filter(i=>i.status==='pendiente').length} | En proceso: ${items.filter(i=>i.status==='en_proceso').length} | Plazos vencidos: ${vencidos}
- Documentos verificadores: ${documents.length}
- Casos protocolo vinculados: ${leyCases.length}
Por área: ${areasSummary || 'sin datos'}
${detallePendientes ? `\nRequisitos pendientes:\n${detallePendientes}` : ''}

Responde consultas sobre:
• Contenido y obligaciones de la Ley 21.369 (arts. 1-9)
• Protocolo de género y procedimientos disciplinarios UMAG
• Plazos, etapas y actos procesales
• Derechos de denunciantes y denunciados
• Directrices de la SES
• Medidas cautelares y sanciones
• Estado de cumplimiento de la institución
• Comparación entre la situación actual y los requisitos legales

Sé preciso, cita artículos cuando sea relevante. Lenguaje formal institucional. Formato Markdown.`;

    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1800,
        system: systemPrompt,
        messages: ley21369State.chat.messages.slice(-14),
      }),
    });

    if (typing) typing.remove();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      appendLeyChatMsg('assistant', '⚠️ ' + (err.error || `Error ${resp.status}`));
      return;
    }

    const data  = await resp.json();
    const reply = data.content?.filter(b => b.type==='text').map(b => b.text).join('') || 'Sin respuesta.';
    ley21369State.chat.messages.push({ role:'assistant', content:reply });
    appendLeyChatMsg('assistant', reply);
  } catch (err) {
    if (typing) typing.remove();
    appendLeyChatMsg('assistant', '⚠️ Error de conexión: ' + err.message);
  } finally {
    ley21369State.chat.loading = false;
    if (btn) btn.disabled = false;
  }
}

function appendLeyChatMsg(role, content) {
  const msgs = document.getElementById('leyChatMsgs');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'ley-chat-msg ' + role;
  const md_fn = typeof md === 'function' ? md : (t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  div.innerHTML = `<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${role==='user'?escLey(content):md_fn(content)}</div></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function appendLeyChatTyping() {
  const msgs = document.getElementById('leyChatMsgs');
  if (!msgs) return null;
  const div = document.createElement('div');
  div.className = 'ley-chat-msg assistant';
  div.innerHTML = '<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub"><div class="typing"><div class="da"></div><div class="da"></div><div class="da"></div></div></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

function clearLeyChat() {
  ley21369State.chat.messages = [];
  const msgs = document.getElementById('leyChatMsgs');
  if (msgs) msgs.innerHTML = `<div class="ley-chat-msg assistant"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub"><strong>Asistente Ley 21.369</strong><br>Chat reiniciado. ¿En qué te puedo ayudar?</div></div></div>`;
}

/* ────────────────────────────────────────────────────────────────
   TAB 8: INFORME IA
   ──────────────────────────────────────────────────────────────── */
async function generateLey21369Report() {
  const container = document.getElementById('leyInformeContent');
  const btn1 = document.getElementById('leyReportBtn');
  const btn2 = document.getElementById('leyInformeBtn');

  // Ir al tab informe
  const tabBtn = document.querySelector('[data-ltab="informe"]');
  if (tabBtn) switchLeyTab('informe', tabBtn);

  if (container) container.innerHTML = `<div class="ley-empty">
    <div style="width:14px;height:14px;border-radius:50%;background:var(--gold-dim);margin:0 auto 12px;animation:pulse 1.4s infinite"></div>
    Generando informe con IA…<br><span style="font-size:10px;color:var(--text-muted)">Puede tardar unos segundos</span>
  </div>`;
  [btn1,btn2].forEach(b => { if(b){b.disabled=true;b.textContent='⏳ Generando…';} });

  try {
    const { items, documents, leyCases } = ley21369State;
    const total     = items.length;
    const cumplidos = items.filter(i => i.status === 'cumplido').length;
    const enProceso = items.filter(i => i.status === 'en_proceso').length;
    const pendientes= items.filter(i => i.status === 'pendiente').length;
    const pct       = total > 0 ? Math.round(cumplidos/total*100) : 0;
    const today     = new Date().toISOString().split('T')[0];
    const vencidos  = items.filter(i => i.due_date && i.due_date < today && i.status!=='cumplido' && i.status!=='no_aplica').length;

    const areaDetail = LEY_AREAS.map(area => {
      const ai = items.filter(i => i.area === area.id);
      if (!ai.length) return null;
      const ac  = ai.filter(i => i.status==='cumplido').length;
      const ep  = ai.filter(i => i.status==='en_proceso').length;
      const pen = ai.filter(i => i.status==='pendiente').length;
      const p   = Math.round(ac/ai.length*100);
      const detalle = ai.map(i =>
        `  - ${i.requirement} [${i.status.toUpperCase()}]${i.responsible?' ('+i.responsible+')':''}${i.verification_notes?' Nota: '+i.verification_notes.substring(0,80)+'…':''}`
      ).join('\n');
      return `### ${area.icon} ${area.label} — ${p}% (${ac}/${ai.length})\nCumplidos: ${ac} | En proceso: ${ep} | Pendientes: ${pen}\n${detalle}`;
    }).filter(Boolean).join('\n\n');

    const ENDPOINT = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: `Eres un experto en cumplimiento normativo de la Ley 21.369 de Chile (Ley que Regula el Acoso Sexual, la Violencia y la Discriminación de Género en Instituciones de Educación Superior). Generas informes formales para presentar ante la Superintendencia de Educación Superior (SES). Usa lenguaje institucional formal, citas normativas específicas y formato Markdown estructurado.`,
        messages: [{
          role: 'user',
          content: `Genera un INFORME DE CUMPLIMIENTO formal de la Ley 21.369 para la Universidad de Magallanes (UMAG) con los siguientes datos reales:

ESTADÍSTICAS GLOBALES:
- Total de requisitos registrados: ${total}
- Requisitos cumplidos: ${cumplidos} (${pct}%)
- En proceso: ${enProceso}
- Pendientes: ${pendientes}
- Plazos vencidos: ${vencidos}
- Documentos verificadores: ${documents.length}
- Casos protocolo vinculados: ${leyCases.length}

DETALLE POR ÁREA:
${areaDetail || 'Sin datos de áreas'}

Fecha de generación: ${new Date().toLocaleDateString('es-CL', { year:'numeric', month:'long', day:'numeric' })}

El informe debe incluir:
1. **RESUMEN EJECUTIVO** — Estado global, porcentaje de cumplimiento, fortalezas principales
2. **ANÁLISIS POR ÁREA** — Avance, brechas y evidencias por cada área (usa los datos reales)
3. **BRECHAS CRÍTICAS** — Requisitos más urgentes, plazo de resolución recomendado y nivel de criticidad
4. **PLAN DE ACCIÓN** — Recomendaciones priorizadas con responsable sugerido y plazo
5. **CRONOGRAMA** — Hitos propuestos para los próximos 3-6 meses
6. **CONCLUSIÓN** — Evaluación general y riesgos ante fiscalización SES`
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (container) container.innerHTML = `<div class="ley-empty" style="color:var(--red)">⚠️ ${err.error || 'Error al generar.'}</div>`;
      return;
    }

    const data   = await resp.json();
    const report = data.content?.filter(b => b.type==='text').map(b => b.text).join('') || '';
    ley21369State.informe.content = report;

    const md_fn = typeof md === 'function' ? md : (t => `<pre style="white-space:pre-wrap">${t}</pre>`);
    if (container) container.innerHTML = `
      <div class="ley-report-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">📄 Informe de Cumplimiento — Ley 21.369</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Generado el ${new Date().toLocaleDateString('es-CL')} · UMAG</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn-export" onclick="copyLeyReport()">📋 Copiar</button>
            <button class="btn-export" onclick="downloadLeyReportTxt()">⬇ .txt</button>
            <button class="btn-export" onclick="generateLey21369Report()">🔄 Regenerar</button>
          </div>
        </div>
        <div class="ley-report-content" id="leyReportBody">${md_fn(report)}</div>
      </div>`;
    showToast('✓ Informe generado correctamente');
  } catch (err) {
    if (container) container.innerHTML = `<div class="ley-empty" style="color:var(--red)">⚠️ Error: ${err.message}</div>`;
  } finally {
    [btn1,btn2].forEach(b => { if(b){b.disabled=false;b.textContent=b.id==='leyReportBtn'?'✨ Informe IA':'✨ Generar Informe con IA';} });
  }
}

function copyLeyReport() {
  const body = document.getElementById('leyReportBody');
  if (body) navigator.clipboard.writeText(body.innerText).then(() => showToast('✓ Informe copiado'));
}

function downloadLeyReportTxt() {
  const { content } = ley21369State.informe;
  if (!content) return;
  const blob = new Blob([content], { type:'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `informe_ley21369_${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Informe descargado');
}

/* ────────────────────────────────────────────────────────────────
   CRUD — ITEMS
   ──────────────────────────────────────────────────────────────── */
async function updateLeyStatus(itemId, status) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const update = { status, updated_at: new Date().toISOString() };
  if (status === 'cumplido') update.completed_at = new Date().toISOString();
  else update.completed_at = null;
  if (sb) await sb.from('ley21369_items').update(update).eq('id', itemId);
  const idx = ley21369State.items.findIndex(i => i.id === itemId);
  if (idx !== -1) Object.assign(ley21369State.items[idx], update);
  renderLey21369KPIs();
  renderLey21369Tab(ley21369State.tab);
}

async function updateLeyField(itemId, field, value) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const update = { [field]: value || null, updated_at: new Date().toISOString() };
  if (sb) await sb.from('ley21369_items').update(update).eq('id', itemId);
  const idx = ley21369State.items.findIndex(i => i.id === itemId);
  if (idx !== -1) ley21369State.items[idx][field] = value || null;
}

let _leyNotesTimer = null;
function updateLeyNotes(itemId, value) {
  clearTimeout(_leyNotesTimer);
  _leyNotesTimer = setTimeout(() => updateLeyField(itemId, 'verification_notes', value), 700);
}

async function deleteLeyItem(itemId) {
  if (!confirm('¿Eliminar este requisito?')) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (sb) await sb.from('ley21369_items').delete().eq('id', itemId);
  ley21369State.items = ley21369State.items.filter(i => i.id !== itemId);
  renderLey21369KPIs();
  renderLey21369Tab(ley21369State.tab);
  showToast('✓ Requisito eliminado');
}

/* ── Modal agregar item ── */
function openLey21369AddItem(areaId) {
  const sel = document.getElementById('leyAddArea');
  if (sel && areaId) sel.value = areaId;
  document.getElementById('leyAddItemModal').style.display = 'block';
  document.getElementById('leyAddReq')?.focus();
}
function closeLey21369AddItem() {
  document.getElementById('leyAddItemModal').style.display = 'none';
  ['leyAddReq','leyAddDesc','leyAddResp'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  const d = document.getElementById('leyAddDate'); if (d) d.value = '';
  const s = document.getElementById('leyAddStatus'); if (s) s.value = 'pendiente';
}

async function saveLey21369Item() {
  const req    = document.getElementById('leyAddReq')?.value.trim();
  if (!req) { alert('El requisito es obligatorio.'); return; }
  const area   = document.getElementById('leyAddArea')?.value    || 'general';
  const desc   = document.getElementById('leyAddDesc')?.value.trim();
  const resp   = document.getElementById('leyAddResp')?.value.trim();
  const date   = document.getElementById('leyAddDate')?.value;
  const status = document.getElementById('leyAddStatus')?.value  || 'pendiente';

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) { showToast('⚠ Sin conexión Supabase'); return; }
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) return;

  const sortOrder = ley21369State.items.filter(i => i.area === area).length;
  const { data, error } = await sb.from('ley21369_items').insert({
    user_id: user.id, area, requirement: req,
    description: desc || null, responsible: resp || null,
    due_date: date || null, status, sort_order: sortOrder,
  }).select().single();

  if (error) { showToast('⚠ Error: ' + error.message); return; }
  ley21369State.items.push(data);
  closeLey21369AddItem();
  renderLey21369KPIs();
  renderLey21369Tab(ley21369State.tab);
  showToast('✓ Requisito agregado');
}

async function saveInlineLeyItem(areaId) {
  const input = document.getElementById('leyInline-' + areaId);
  if (!input || !input.value.trim()) return;
  const req = input.value.trim(); input.value = '';

  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { data:{ user } } = await sb.auth.getUser();
  if (!user) return;

  const { data, error } = await sb.from('ley21369_items').insert({
    user_id: user.id, area: areaId, requirement: req,
    status: 'pendiente', sort_order: ley21369State.items.filter(i => i.area === areaId).length,
  }).select().single();

  if (error) { showToast('⚠ Error: ' + error.message); return; }
  ley21369State.items.push(data);
  renderLey21369KPIs();
  renderLeyChecklist();
  showToast('✓ Requisito agregado');
}

/* ────────────────────────────────────────────────────────────────
   UTILIDADES
   ──────────────────────────────────────────────────────────────── */
function escLey(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function refreshLey21369() {
  ley21369State.initialized = false;
  loadLey21369();
}

/* ────────────────────────────────────────────────────────────────
   CSS
   ──────────────────────────────────────────────────────────────── */
(function injectLey21369CSS() {
  if (document.getElementById('ley21369-css')) return;
  const style = document.createElement('style');
  style.id = 'ley21369-css';
  style.textContent = `
/* KPIs */
.ley-kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:10px 16px;flex-shrink:0;}
.ley-kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;text-align:center;}
.ley-kpi-val{font-family:'EB Garamond',serif;font-size:28px;line-height:1;margin-bottom:2px;}
.ley-kpi-val.verde{color:var(--green);} .ley-kpi-val.azul{color:var(--blue);} .ley-kpi-val.naranja{color:#f59e0b;} .ley-kpi-val.rojo{color:var(--red);} .ley-kpi-val.gold{color:var(--gold);}
.ley-kpi-label{font-size:10px;color:var(--text-muted);}
.ley-kpi-bar{height:3px;border-radius:2px;background:var(--border);margin-top:5px;overflow:hidden;}
.ley-kpi-bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--gold-dim),var(--gold));transition:width .5s ease;}

/* Header y tabs */
.ley-header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.ley-header-title{font-family:'EB Garamond',serif;font-size:18px;font-weight:500;color:var(--text);}
.ley-header-sub{font-size:10px;color:var(--text-muted);letter-spacing:.06em;text-transform:uppercase;}
.ley-header-actions{display:flex;gap:6px;align-items:center;}
.ley-tabs{display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface);padding:0 12px;overflow-x:auto;flex-shrink:0;}
.ley-tab{padding:8px 11px;font-size:11px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap;font-family:'Inter',sans-serif;background:none;border-top:none;border-left:none;border-right:none;}
.ley-tab:hover{color:var(--text);} .ley-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:500;}
.ley-body{flex:1;overflow-y:auto;padding:14px 16px;}

/* Semáforo */
.ley-semaforo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;}
.ley-semaforo-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;transition:border-color .15s;}
.ley-semaforo-card:hover{border-color:var(--border2);}
.ley-semaforo-icon{font-size:20px;margin-bottom:6px;}
.ley-semaforo-area{font-size:11.5px;font-weight:500;margin-bottom:4px;}
.ley-semaforo-pct{font-family:'EB Garamond',serif;font-size:24px;font-weight:500;line-height:1;margin-bottom:4px;}
.ley-semaforo-bar{height:4px;border-radius:2px;background:var(--border);overflow:hidden;margin-bottom:4px;}
.ley-semaforo-bar-fill{height:100%;border-radius:2px;transition:width .5s ease;}
.ley-bar-verde{background:var(--green);} .ley-bar-naranja{background:#f59e0b;} .ley-bar-rojo{background:var(--red);}
.ley-semaforo-meta{font-size:10px;color:var(--text-muted);}

/* Alertas */
.ley-alert-group{margin-bottom:12px;}
.ley-alert-group-title{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:8px 10px;border-radius:var(--radius) var(--radius) 0 0;margin-bottom:0;display:flex;align-items:center;gap:6px;}
.ley-alert-vencido .ley-alert-group-title{background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.25);color:var(--red);border-bottom:none;}
.ley-alert-pronto  .ley-alert-group-title{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);color:#d97706;border-bottom:none;}
.ley-alert-prox    .ley-alert-group-title{background:rgba(79,70,229,.07);border:1px solid var(--border);color:var(--text-dim);border-bottom:none;}
.ley-alert-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--surface);border:1px solid var(--border);}
.ley-alert-item:not(:last-child){border-bottom:none;}
.ley-alert-item:last-child{border-radius:0 0 var(--radius) var(--radius);}
.ley-alert-req{font-size:12px;font-weight:500;flex:1;}
.ley-alert-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px;}
.ley-alert-badge{font-size:9px;padding:1px 6px;border-radius:8px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-muted);}
.ley-alert-days{font-size:10px;font-weight:600;margin-top:2px;}
.ley-alert-days.red{color:var(--red);} .ley-alert-days.orange{color:#d97706;} .ley-alert-days.blue{color:var(--blue);}

/* Área / Checklist */
.ley-area-block{margin-bottom:10px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.ley-area-header{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--surface);cursor:pointer;transition:background .15s;}
.ley-area-header:hover{background:var(--surface2);}
.ley-area-title{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;}
.ley-area-progress{display:flex;align-items:center;gap:8px;}
.ley-area-pct{font-size:11px;color:var(--text-muted);font-family:'DM Mono',monospace;}
.ley-area-bar-wrap{width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;}
.ley-area-bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,var(--gold-dim),var(--gold));}
.ley-area-chevron{font-size:9px;color:var(--text-muted);transition:transform .15s;} .ley-area-chevron.open{transform:rotate(180deg);}
.ley-area-body{background:var(--surface2);border-top:1px solid var(--border);}
.ley-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);transition:background .15s;}
.ley-item:last-child{border-bottom:none;} .ley-item:hover{background:var(--surface);}
.ley-item-left{display:flex;flex-direction:column;gap:4px;flex:1;}
.ley-item-req{font-size:12px;font-weight:500;line-height:1.4;}
.ley-item-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;}
.ley-item-right{display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0;}
.ley-status-sel{background:var(--surface);border:1px solid var(--border2);color:var(--text-dim);padding:4px 7px;border-radius:var(--radius);font-size:10.5px;font-family:'Inter',sans-serif;outline:none;cursor:pointer;transition:border-color .15s;}
.ley-status-sel:focus{border-color:var(--gold-dim);} .ley-status-sel option{background:var(--surface);}
.ley-notes-input{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:11px;outline:none;resize:none;width:100%;min-height:34px;max-height:60px;transition:border-color .15s;}
.ley-notes-input:focus{border-color:var(--gold-dim);}
.ley-add-item-row{padding:8px 12px;display:flex;gap:6px;background:var(--surface);border-top:1px solid var(--border);}
.ley-add-item-input{flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:11.5px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s;}
.ley-add-item-input:focus{border-color:var(--gold-dim);}

/* Badges de estado */
.ley-badge{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;padding:2px 7px;border-radius:8px;font-weight:500;white-space:nowrap;}
.ley-badge-cumplido{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3);}
.ley-badge-en_proceso{background:rgba(79,70,229,.08);color:var(--blue);border:1px solid rgba(79,70,229,.2);}
.ley-badge-pendiente{background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.3);}
.ley-badge-no_aplica{background:var(--surface2);color:var(--text-muted);border:1px solid var(--border2);}

/* Tabla */
.ley-tabla-wrap{overflow-x:auto;}
.ley-tabla{width:100%;border-collapse:collapse;font-size:11.5px;}
.ley-tabla th{padding:7px 10px;text-align:left;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);background:var(--surface);font-weight:500;white-space:nowrap;position:sticky;top:0;z-index:1;}
.ley-tabla td{padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}
.ley-tabla tr:hover td{background:var(--surface);}
.ley-tabla-input{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:4px 7px;border-radius:var(--radius);font-size:11px;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s;width:100%;}
.ley-tabla-input:focus{border-color:var(--gold-dim);}

/* Chat */
.ley-chat-msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px;min-height:200px;max-height:420px;}
.ley-chat-msg{display:flex;gap:8px;animation:slideUp .2s ease;} .ley-chat-msg.user{flex-direction:row-reverse;}
.ley-chat-msg-body{max-width:82%;}
.ley-chat-msg-bub{padding:9px 12px;border-radius:var(--radius);font-size:12.5px;line-height:1.65;}
.ley-chat-msg.assistant .ley-chat-msg-bub{background:var(--surface);border:1px solid var(--border);color:var(--text);border-top-left-radius:2px;}
.ley-chat-msg.user      .ley-chat-msg-bub{background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--text);border-top-right-radius:2px;}
.ley-chat-msg-bub strong{color:var(--gold);} .ley-chat-msg-bub code{font-family:'DM Mono',monospace;font-size:11px;background:rgba(88,166,255,.1);padding:1px 4px;border-radius:3px;}
.ley-chat-msg-bub ul,.ley-chat-msg-bub ol{padding-left:16px;margin:4px 0;} .ley-chat-msg-bub li{margin-bottom:2px;}
.ley-chat-msg-bub h3{font-family:'EB Garamond',serif;font-size:15px;color:var(--gold);margin:6px 0 2px;}
.ley-chat-msg-bub p{margin-bottom:4px;}
.ley-chat-input-row{display:flex;gap:7px;align-items:flex-end;padding:10px 14px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0;}
.ley-chat-input{flex:1;background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:7px 11px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:13px;outline:none;resize:none;min-height:38px;max-height:100px;transition:border-color .15s;}
.ley-chat-input:focus{border-color:var(--gold-dim);}
.ley-chat-chips{display:flex;flex-wrap:wrap;gap:5px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--surface);}
.ley-chat-chip{background:none;border:1px solid var(--border2);color:var(--text-dim);padding:4px 11px;border-radius:16px;font-size:11px;font-family:'Inter',sans-serif;cursor:pointer;transition:all .15s;}
.ley-chat-chip:hover{color:var(--gold);border-color:var(--gold-dim);background:var(--gold-glow);}

/* Informe */
.ley-report-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;}
.ley-report-content{font-size:12.5px;line-height:1.75;color:var(--text);max-height:500px;overflow-y:auto;}
.ley-report-content h1,.ley-report-content h2,.ley-report-content h3{font-family:'EB Garamond',serif;color:var(--gold);margin:12px 0 4px;}
.ley-report-content h1{font-size:20px;} .ley-report-content h2{font-size:16px;} .ley-report-content h3{font-size:14px;}
.ley-report-content ul,.ley-report-content ol{padding-left:18px;margin:4px 0;} .ley-report-content li{margin-bottom:2px;}
.ley-report-content p{margin-bottom:6px;} .ley-report-content strong{color:var(--text);}
.ley-report-content hr{border:none;border-top:1px solid var(--border);margin:12px 0;}

/* Cumplimiento global box */
.ley-cumpl-global{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;}

/* Misc */
.ley-empty{text-align:center;padding:30px 20px;color:var(--text-muted);font-size:12px;}
.ley-warn-banner{background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.25);border-radius:var(--radius);padding:9px 12px;font-size:11.5px;color:#d97706;display:none;align-items:flex-start;gap:7px;margin:0 16px 8px;flex-shrink:0;}
`;
  document.head.appendChild(style);
})();

/* ────────────────────────────────────────────────────────────────
   HTML DE LA VISTA (se inyecta si no existe)
   ──────────────────────────────────────────────────────────────── */
(function injectLey21369View() {
  if (document.getElementById('viewLey21369')) return;

  const view = document.createElement('div');
  view.id = 'viewLey21369';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';

  view.innerHTML = `
    <!-- Header -->
    <div style="padding:12px 16px 0;flex-shrink:0;">
      <div class="ley-header-top">
        <div>
          <div class="ley-header-title">⚖️ Implementación Ley 21.369</div>
          <div class="ley-header-sub">Acoso sexual · Violencia y discriminación de género · UMAG</div>
        </div>
        <div class="ley-header-actions">
          <button class="btn-sm" onclick="openLey21369AddItem()">+ Requisito</button>
          <button class="btn-sm" onclick="generateLey21369Report()" id="leyReportBtn">✨ Informe IA</button>
          <button class="btn-sm" onclick="refreshLey21369()">↻</button>
        </div>
      </div>
    </div>

    <!-- Alerta sin verificadores -->
    <div class="ley-warn-banner" id="leyWarnBanner">
      ⚠️ <span><strong id="leyWarnCount">0</strong> requisitos "cumplidos" no tienen documentos verificadores adjuntos. Agrega evidencia para respaldar el cumplimiento ante la SES.</span>
    </div>

    <!-- KPIs -->
    <div class="ley-kpi-row">
      <div class="ley-kpi-card"><div class="ley-kpi-val gold" id="leyKpiPct">—</div><div class="ley-kpi-bar"><div class="ley-kpi-bar-fill" id="leyKpiBar" style="width:0%"></div></div><div class="ley-kpi-label">Cumplimiento global</div></div>
      <div class="ley-kpi-card"><div class="ley-kpi-val verde"   id="leyKpiCumplidos">—</div><div class="ley-kpi-label">Cumplidos</div></div>
      <div class="ley-kpi-card"><div class="ley-kpi-val azul"    id="leyKpiEnProceso">—</div><div class="ley-kpi-label">En proceso</div></div>
      <div class="ley-kpi-card"><div class="ley-kpi-val naranja" id="leyKpiPendientes">—</div><div class="ley-kpi-label">Pendientes</div></div>
      <div class="ley-kpi-card"><div class="ley-kpi-val rojo"    id="leyKpiVencidos">—</div><div class="ley-kpi-label">Plazos vencidos</div></div>
    </div>

    <!-- Tabs -->
    <div class="ley-tabs">
      <button class="ley-tab active" data-ltab="semaforo"     onclick="switchLeyTab('semaforo',this)">🚦 Semáforo</button>
      <button class="ley-tab"        data-ltab="checklist"    onclick="switchLeyTab('checklist',this)">✅ Checklist</button>
      <button class="ley-tab"        data-ltab="cumplimiento" onclick="switchLeyTab('cumplimiento',this)">⚖️ Cumplimiento</button>
      <button class="ley-tab"        data-ltab="tabla"        onclick="switchLeyTab('tabla',this)">📋 Tabla</button>
      <button class="ley-tab"        data-ltab="alertas"      onclick="switchLeyTab('alertas',this)">🔔 Alertas</button>
      <button class="ley-tab"        data-ltab="casos"        onclick="switchLeyTab('casos',this)">⚖️ Casos</button>
      <button class="ley-tab"        data-ltab="chat"         onclick="switchLeyTab('chat',this)">💬 Chat IA</button>
      <button class="ley-tab"        data-ltab="informe"      onclick="switchLeyTab('informe',this)">📄 Informe</button>
    </div>

    <!-- Bodies -->
    <div class="ley-body" id="leyBody_semaforo"><div class="ley-semaforo-grid" id="leySemaforoGrid"><div class="ley-empty">Cargando…</div></div></div>
    <div class="ley-body" id="leyBody_checklist"    style="display:none"><div id="leyChecklistContainer"><div class="ley-empty">Cargando…</div></div></div>
    <div class="ley-body" id="leyBody_cumplimiento" style="display:none"><div id="leyCumplimientoContainer"><div class="ley-empty">Cargando…</div></div></div>
    <div class="ley-body" id="leyBody_tabla"        style="display:none">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <input class="casos-search" placeholder="Buscar requisito…" oninput="filterLeyTabla(this.value)" style="width:220px;"/>
        <select id="leyTablaStatusFilter" onchange="filterLeyTabla()" style="background:var(--surface);border:1px solid var(--border2);color:var(--text);padding:6px 10px;border-radius:var(--radius);font-size:12px;outline:none;">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_proceso">En proceso</option>
          <option value="cumplido">Cumplido</option>
          <option value="no_aplica">No aplica</option>
        </select>
      </div>
      <div class="ley-tabla-wrap">
        <table class="ley-tabla">
          <thead><tr><th>Área</th><th>Requisito</th><th>Estado</th><th>Responsable</th><th>Fecha límite</th><th>Verif.</th><th></th></tr></thead>
          <tbody id="leyTablaTbody"><tr><td colspan="7" class="ley-empty">Cargando…</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="ley-body" id="leyBody_alertas" style="display:none"><div id="leyAlertasContainer"><div class="ley-empty">Cargando…</div></div></div>
    <div class="ley-body" id="leyBody_casos"   style="display:none"><div id="leyCasosContainer"><div class="ley-empty">Cargando casos vinculados…</div></div></div>

    <!-- Chat -->
    <div class="ley-body" id="leyBody_chat" style="display:none;padding:0;flex-direction:column;">
      <div class="ley-chat-chips">
        <button class="ley-chat-chip" onclick="leyQuickQuery('Dame un resumen del estado actual de cumplimiento y qué priorizar')">Estado y prioridades</button>
        <button class="ley-chat-chip" onclick="leyQuickQuery('¿Cuáles son los plazos y etapas del procedimiento de investigación?')">Plazos investigación</button>
        <button class="ley-chat-chip" onclick="leyQuickQuery('¿Qué medidas cautelares contempla el protocolo Ley 21.369?')">Medidas cautelares</button>
        <button class="ley-chat-chip" onclick="leyQuickQuery('¿Qué reportes y directrices exige la SES?')">Directrices SES</button>
        <button class="ley-chat-chip" onclick="leyQuickQuery('Genera un borrador de informe para la SES con el estado actual')">Borrador informe SES</button>
        <button class="ley-chat-chip" onclick="leyQuickQuery('¿Cuáles son los requisitos críticos pendientes y qué nivel de riesgo tienen?')">Requisitos críticos</button>
        <button class="btn-sm" onclick="clearLeyChat()" title="Limpiar chat" style="margin-left:auto">↺</button>
      </div>
      <div class="ley-chat-msgs" id="leyChatMsgs">
        <div class="ley-chat-msg assistant"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">
          <strong>Asistente Ley 21.369</strong><br>
          Hola 👋 Soy tu asistente especializado en la <strong>Ley 21.369</strong>. Puedo ayudarte con el contenido de la ley, plazos, procedimientos, directrices SES y el análisis del estado de cumplimiento de la institución. ¿En qué te puedo ayudar?
        </div></div></div>
      </div>
      <div class="ley-chat-input-row">
        <textarea class="ley-chat-input" id="leyChatInput" placeholder="Consulta sobre Ley 21.369, plazos, protocolos, SES…" rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendLeyChat()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
        <button class="send-btn" onclick="sendLeyChat()" id="leyChatSendBtn">
          <svg viewBox="0 0 16 16"><path d="M14.5 8L1.5 1.5l2 6.5-2 6.5z"/></svg>
        </button>
      </div>
    </div>

    <!-- Informe -->
    <div class="ley-body" id="leyBody_informe" style="display:none">
      <div id="leyInformeContent">
        <div style="text-align:center;padding:30px;color:var(--text-muted);">
          <div style="font-size:32px;margin-bottom:12px">📄</div>
          <p style="font-size:13px;font-weight:500;margin-bottom:8px">Informe de Cumplimiento — Ley 21.369</p>
          <p style="font-size:11.5px;margin-bottom:20px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.6">Genera un informe formal completo con resumen ejecutivo, análisis por área, brechas críticas y plan de acción para presentar ante la SES.</p>
          <button class="btn-save" onclick="generateLey21369Report()" id="leyInformeBtn"
            style="display:inline-flex;align-items:center;gap:7px;padding:10px 20px">
            ✨ Generar Informe con IA
          </button>
        </div>
      </div>
    </div>`;

  // Insertar antes del viewWelcome
  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();

/* ────────────────────────────────────────────────────────────────
   MODAL AGREGAR ITEM (se inyecta si no existe)
   ──────────────────────────────────────────────────────────────── */
(function injectLey21369Modal() {
  if (document.getElementById('leyAddItemModal')) return;
  const modal = document.createElement('div');
  modal.id = 'leyAddItemModal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="mini-modal-overlay" onclick="if(event.target===this)closeLey21369AddItem()">
      <div class="mini-modal">
        <div class="mini-modal-title">Agregar Requisito — Ley 21.369</div>
        <div class="mini-row">
          <div class="mini-field"><label>Área *</label>
            <select id="leyAddArea">
              <option value="protocolo">📋 Protocolo de actuación</option>
              <option value="modelo_prevencion">🛡️ Modelo de prevención</option>
              <option value="capacitacion">🎓 Capacitación</option>
              <option value="difusion">📢 Difusión</option>
              <option value="canales_denuncia">📞 Canales de denuncia</option>
              <option value="investigacion">🔍 Investigación</option>
              <option value="medidas_reparacion">🤝 Medidas de reparación</option>
              <option value="registro_estadistico">📊 Registro estadístico</option>
              <option value="organo_encargado">🏛️ Órgano encargado</option>
              <option value="general">📁 General</option>
            </select>
          </div>
          <div class="mini-field"><label>Estado inicial</label>
            <select id="leyAddStatus">
              <option value="pendiente">Pendiente</option>
              <option value="en_proceso">En proceso</option>
              <option value="cumplido">Cumplido</option>
              <option value="no_aplica">No aplica</option>
            </select>
          </div>
        </div>
        <div class="mini-field"><label>Requisito *</label>
          <input type="text" id="leyAddReq" placeholder="Ej: Protocolo de género aprobado y vigente" onkeydown="if(event.key==='Enter')saveLey21369Item()"/>
        </div>
        <div class="mini-field"><label>Descripción</label>
          <textarea id="leyAddDesc" rows="2" placeholder="Descripción adicional…"></textarea>
        </div>
        <div class="mini-row">
          <div class="mini-field"><label>Responsable</label>
            <input type="text" id="leyAddResp" placeholder="Nombre o cargo"/>
          </div>
          <div class="mini-field"><label>Fecha límite</label>
            <input type="date" id="leyAddDate"/>
          </div>
        </div>
        <div class="mini-modal-actions">
          <button class="btn-cancel" onclick="closeLey21369AddItem()">Cancelar</button>
          <button class="btn-save" onclick="saveLey21369Item()">Guardar requisito</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
})();
