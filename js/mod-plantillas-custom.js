/* ══════════════════════════════════════════════════════════════
   mod-plantillas-custom.js  —  Plantillas personalizables
   CRUD de plantillas con editor de variables, catálogo por etapa,
   y vinculación con el modo guiado.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : null;
const _esc = s => typeof esc === 'function' ? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── Tipos de plantilla ── */
const TYPE_LABELS = {
  RES: { label: 'Resolución', icon: '📜' },
  OFI: { label: 'Oficio', icon: '📨' },
  ACT: { label: 'Acta', icon: '📋' },
  CON: { label: 'Constancia', icon: '🛡️' },
  CER: { label: 'Certificado', icon: '✅' },
  INF: { label: 'Informe', icon: '📄' }
};

/* ── Categorías por etapa ── */
const CATEGORY_LABELS = {
  indagatoria: 'Indagatoria',
  cargos: 'Cargos',
  descargos: 'Descargos',
  vista: 'Vista Fiscal',
  resolucion: 'Resolución',
  custom: 'Personalizadas'
};

/* ── Estado ── */
let customTemplates = [];
let editingTemplate = null;
let isCreating = false;

/* ── CRUD: Cargar plantillas ── */
async function loadTemplates(){
  const s = _sb();
  if(!s || !session) return;
  const { data, error } = await s.from('custom_templates').select('*')
    .eq('user_id', session.user.id).eq('is_active', true).order('name');
  if(error){ console.warn('[plantillas] Error:', error); return; }
  customTemplates = data || [];
  renderTemplatesView();
}

/* ── CRUD: Guardar plantilla ── */
async function saveTemplate(formData){
  const s = _sb();
  if(!s || !session) return;

  // Detectar variables en la estructura
  const detectedVars = extractVariables(formData.structure);

  const payload = {
    user_id: session.user.id,
    name: formData.name,
    code: formData.code,
    type: formData.type,
    category: formData.category,
    description: formData.description || null,
    structure: formData.structure,
    variables: formData.variables || detectedVars.map(k => ({ key: k, label: humanize(k), type: 'text', required: false })),
    is_active: true,
    updated_at: new Date().toISOString()
  };

  let error;
  if(editingTemplate){
    ({ error } = await s.from('custom_templates').update(payload).eq('id', editingTemplate.id));
  } else {
    payload.created_at = new Date().toISOString();
    ({ error } = await s.from('custom_templates').insert(payload));
  }

  if(error){
    if(typeof showToast === 'function') showToast('⚠ Error: ' + error.message);
    return;
  }

  editingTemplate = null;
  isCreating = false;
  if(typeof showToast === 'function') showToast('✓ Plantilla guardada');
  await loadTemplates();
}

/* ── CRUD: Eliminar plantilla ── */
async function deleteTemplate(id){
  if(!confirm('¿Eliminar esta plantilla?')) return;
  const s = _sb();
  if(!s) return;
  const { error } = await s.from('custom_templates').delete().eq('id', id);
  if(error){
    if(typeof showToast === 'function') showToast('⚠ Error: ' + error.message);
    return;
  }
  if(typeof showToast === 'function') showToast('✓ Plantilla eliminada');
  await loadTemplates();
}

/* ── CRUD: Duplicar plantilla ── */
async function duplicateTemplate(tmpl){
  const s = _sb();
  if(!s || !session) return;
  const { error } = await s.from('custom_templates').insert({
    user_id: session.user.id,
    name: tmpl.name + ' (copia)',
    code: tmpl.code + '-COPIA',
    type: tmpl.type,
    category: tmpl.category,
    description: tmpl.description,
    structure: tmpl.structure,
    variables: tmpl.variables,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  if(error){
    if(typeof showToast === 'function') showToast('⚠ Error: ' + error.message);
    return;
  }
  if(typeof showToast === 'function') showToast('✓ Plantilla duplicada');
  await loadTemplates();
}

/* ── Extraer variables {variable} del texto ── */
function extractVariables(text){
  const matches = text.match(/\{([^}]+)\}/g) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

/* ── Humanizar key → label ── */
function humanize(key){
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Renderizar vista principal de plantillas ── */
function renderTemplatesView(){
  const container = document.getElementById('plantillasContent');
  if(!container) return;

  if(isCreating || editingTemplate){
    renderEditor(container);
    return;
  }

  // Agrupar por categoría
  const grouped = {};
  customTemplates.forEach(t => {
    const cat = t.category || 'custom';
    if(!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:14px;font-weight:600">Mis Plantillas</div>
        <div style="font-size:11px;color:var(--text-muted)">${customTemplates.length} plantillas personalizadas</div>
      </div>
      <button class="btn-save" onclick="createNewTemplate()" style="font-size:12px;padding:6px 16px">+ Nueva plantilla</button>
    </div>`;

  if(customTemplates.length === 0){
    html += `
      <div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:10px">📋</div>
        <div style="font-size:13px;margin-bottom:6px">No tienes plantillas personalizadas aún</div>
        <div style="font-size:11px">Crea una plantilla para reutilizar modelos de documentos con variables auto-rellenables.</div>
      </div>`;
  } else {
    // Renderizar por categoría
    Object.entries(CATEGORY_LABELS).forEach(([catKey, catLabel]) => {
      const templates = grouped[catKey];
      if(!templates || !templates.length) return;

      html += `
        <div class="tmpl-category">
          <div class="tmpl-category-header" onclick="toggleTmplCategory('${catKey}')">
            <span>${catLabel}</span>
            <span class="tmpl-count">${templates.length}</span>
            <span class="tmpl-arrow" id="tmpl-arrow-${catKey}">▾</span>
          </div>
          <div class="tmpl-category-body" id="tmpl-body-${catKey}">`;

      templates.forEach(t => {
        const typeInfo = TYPE_LABELS[t.type] || { label: t.type, icon: '📄' };
        const varCount = (t.variables || []).length;

        html += `
          <div class="tmpl-item">
            <div class="tmpl-item-left">
              <span class="tmpl-type-icon" style="background:var(--gold-glow);color:var(--gold)">${typeInfo.icon}</span>
              <div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-family:var(--font-mono);font-size:10px;color:var(--gold)">${_esc(t.code)}</span>
                  <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(245,158,11,.1);color:#f59e0b">Personal</span>
                </div>
                <div style="font-size:12px;font-weight:500;margin-top:2px">${_esc(t.name)}</div>
                ${t.description ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px">${_esc(t.description)}</div>` : ''}
                <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${typeInfo.label} · ${varCount} variables</div>
              </div>
            </div>
            <div class="tmpl-item-actions">
              <button class="btn-action" title="Usar en modo guiado" onclick="useTmplInWizard('${t.id}')">✨</button>
              <button class="btn-action" title="Editar" onclick="editCustomTemplate('${t.id}')">✎</button>
              <button class="btn-action" title="Duplicar" onclick="duplicateCustomTemplate('${t.id}')">📑</button>
              <button class="btn-action" title="Eliminar" onclick="deleteCustomTemplate('${t.id}')" style="color:var(--red)">🗑</button>
            </div>
          </div>`;
      });

      html += '</div></div>';
    });
  }

  container.innerHTML = html;
}

/* ── Renderizar editor de plantilla ── */
function renderEditor(container){
  const t = editingTemplate || {};
  const vars = t.variables || [];

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:14px;font-weight:600">${editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</div>
      <button class="btn-sm" onclick="cancelTemplateEdit()" style="color:var(--text-muted)">✕ Cancelar</button>
    </div>

    <div class="tmpl-editor-form">
      <div class="form-row">
        <div class="form-field">
          <label>Nombre *</label>
          <input id="tmplName" value="${_esc(t.name || '')}" placeholder="Ej: Resolución de Cargos"/>
        </div>
        <div class="form-field">
          <label>Código *</label>
          <input id="tmplCode" value="${_esc(t.code || '')}" placeholder="Ej: RES-CARGOS-01"/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Tipo</label>
          <select id="tmplType">
            ${Object.entries(TYPE_LABELS).map(([k,v]) =>
              `<option value="${k}"${t.type === k ? ' selected' : ''}>${v.icon} ${v.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Categoría / Etapa</label>
          <select id="tmplCategory">
            ${Object.entries(CATEGORY_LABELS).map(([k,v]) =>
              `<option value="${k}"${t.category === k ? ' selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="form-field">
        <label>Descripción</label>
        <input id="tmplDesc" value="${_esc(t.description || '')}" placeholder="Breve descripción del uso de esta plantilla"/>
      </div>
      <div class="form-field">
        <label>Estructura del documento *</label>
        <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">
          Usa {nombre_variable} para insertar variables. Ej: "El/La fiscal {fis_nombre} resuelve…"
        </div>
        <textarea id="tmplStructure" rows="10" style="font-family:var(--font-mono);font-size:11px" placeholder="Escriba la estructura del documento aquí…&#10;Use {variable} para campos dinámicos.">${_esc(t.structure || '')}</textarea>
      </div>

      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <label style="font-weight:600;font-size:12px">Variables detectadas</label>
          <button class="btn-sm" onclick="detectTmplVars()" style="font-size:10px">🔍 Detectar del texto</button>
        </div>
        <div id="tmplVarsList">`;

  // Renderizar variables existentes
  vars.forEach((v, i) => {
    html += renderVarRow(v, i);
  });

  html += `</div>
        <button class="btn-sm" onclick="addTmplVar()" style="margin-top:8px;font-size:10px">+ Agregar variable</button>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-sm" onclick="cancelTemplateEdit()">Cancelar</button>
        <button class="btn-save" onclick="saveCurrentTemplate()" style="font-size:12px;padding:8px 20px">
          ${editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
        </button>
      </div>
    </div>`;

  container.innerHTML = html;
}

/* ── Renderizar fila de variable ── */
function renderVarRow(v, idx){
  return `
    <div class="tmpl-var-row" data-idx="${idx}">
      <input class="tmpl-var-key" value="${_esc(v.key)}" placeholder="clave_variable" style="width:140px"/>
      <input class="tmpl-var-label" value="${_esc(v.label)}" placeholder="Etiqueta" style="flex:1"/>
      <select class="tmpl-var-type" style="width:90px">
        <option value="text"${v.type==='text'?' selected':''}>Texto</option>
        <option value="textarea"${v.type==='textarea'?' selected':''}>Texto largo</option>
        <option value="date"${v.type==='date'?' selected':''}>Fecha</option>
        <option value="select"${v.type==='select'?' selected':''}>Lista</option>
      </select>
      <label style="font-size:10px;display:flex;align-items:center;gap:3px;white-space:nowrap">
        <input type="checkbox" class="tmpl-var-req" ${v.required?'checked':''}/> Req.
      </label>
      <button class="btn-action" onclick="removeTmplVar(${idx})" style="color:var(--red)">✕</button>
    </div>`;
}

/* ── Funciones globales ── */
window.createNewTemplate = function(){
  isCreating = true;
  editingTemplate = null;
  renderTemplatesView();
};
window.cancelTemplateEdit = function(){
  isCreating = false;
  editingTemplate = null;
  renderTemplatesView();
};
window.editCustomTemplate = function(id){
  editingTemplate = customTemplates.find(t => t.id === id);
  if(editingTemplate) renderTemplatesView();
};
window.deleteCustomTemplate = function(id){
  deleteTemplate(id);
};
window.duplicateCustomTemplate = function(id){
  const t = customTemplates.find(x => x.id === id);
  if(t) duplicateTemplate(t);
};
window.useTmplInWizard = function(id){
  const t = customTemplates.find(x => x.id === id);
  if(!t) return;
  // Convertir a formato wizard
  const blocks = [{
    title: t.name,
    description: t.description || 'Plantilla personalizada',
    variables: (t.variables || []).map(v => ({
      key: v.key,
      label: v.label,
      type: v.type || 'text',
      required: !!v.required,
      options: v.options,
      placeholder: v.placeholder
    }))
  }];
  const wizTemplate = { ...t, blocks };
  if(typeof openWizard === 'function') openWizard(wizTemplate);
};
window.toggleTmplCategory = function(catKey){
  const body = document.getElementById('tmpl-body-' + catKey);
  const arrow = document.getElementById('tmpl-arrow-' + catKey);
  if(body){
    const visible = body.style.display !== 'none';
    body.style.display = visible ? 'none' : '';
    if(arrow) arrow.textContent = visible ? '▸' : '▾';
  }
};
window.detectTmplVars = function(){
  const structure = document.getElementById('tmplStructure')?.value || '';
  const detected = extractVariables(structure);
  const list = document.getElementById('tmplVarsList');
  if(!list) return;
  // Merge con existentes
  const existingKeys = new Set([...list.querySelectorAll('.tmpl-var-key')].map(i => i.value));
  const newVars = detected.filter(k => !existingKeys.has(k));
  if(newVars.length === 0){
    if(typeof showToast === 'function') showToast('No hay variables nuevas por detectar');
    return;
  }
  newVars.forEach(k => {
    const idx = list.children.length;
    const div = document.createElement('div');
    div.innerHTML = renderVarRow({ key: k, label: humanize(k), type: 'text', required: false }, idx);
    list.appendChild(div.firstElementChild);
  });
  if(typeof showToast === 'function') showToast(`✓ ${newVars.length} variable(s) detectada(s)`);
};
window.addTmplVar = function(){
  const list = document.getElementById('tmplVarsList');
  if(!list) return;
  const idx = list.children.length;
  const div = document.createElement('div');
  div.innerHTML = renderVarRow({ key: '', label: '', type: 'text', required: false }, idx);
  list.appendChild(div.firstElementChild);
};
window.removeTmplVar = function(idx){
  const list = document.getElementById('tmplVarsList');
  if(!list) return;
  const row = list.querySelector(`[data-idx="${idx}"]`);
  if(row) row.remove();
};
window.saveCurrentTemplate = function(){
  const name = document.getElementById('tmplName')?.value?.trim();
  const code = document.getElementById('tmplCode')?.value?.trim();
  if(!name || !code) return alert('Nombre y código son obligatorios.');

  const structure = document.getElementById('tmplStructure')?.value || '';
  const type = document.getElementById('tmplType')?.value || 'RES';
  const category = document.getElementById('tmplCategory')?.value || 'custom';
  const description = document.getElementById('tmplDesc')?.value?.trim() || '';

  // Recopilar variables del DOM
  const varRows = document.querySelectorAll('#tmplVarsList .tmpl-var-row');
  const variables = [...varRows].map(row => ({
    key: row.querySelector('.tmpl-var-key')?.value?.trim() || '',
    label: row.querySelector('.tmpl-var-label')?.value?.trim() || '',
    type: row.querySelector('.tmpl-var-type')?.value || 'text',
    required: row.querySelector('.tmpl-var-req')?.checked || false
  })).filter(v => v.key);

  saveTemplate({ name, code, type, category, description, structure, variables });
};

/* ── Crear tabla custom_templates si no existe ── */
async function ensureTable(){
  const s = _sb();
  if(!s) return;
  try {
    // Intentar leer — si la tabla no existe saltará error
    await s.from('custom_templates').select('id').limit(1);
  } catch(e){
    console.warn('[plantillas] Tabla custom_templates podría no existir. Contacte al admin para crearla.');
  }
}

/* ── Inyectar vista en viewTabla area ── */
function injectPlantillasView(){
  // Crear view
  if(!document.getElementById('viewPlantillas')){
    const v = document.createElement('div');
    v.id = 'viewPlantillas';
    v.className = 'view';
    v.innerHTML = '<div id="plantillasContent" style="padding:16px;overflow-y:auto;flex:1"></div>';
    const ref = document.getElementById('viewWelcome');
    if(ref) ref.parentNode.insertBefore(v, ref);
    else document.querySelector('.main')?.appendChild(v);
  }

  // Añadir nav item en sidebar
  const nav = document.querySelector('.sidebar-bottom') || document.querySelector('.sidebar');
  if(nav && !document.getElementById('navPlantillas')){
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const lastNav = navItems[navItems.length - 1];

    const item = document.createElement('div');
    item.id = 'navPlantillas';
    item.className = 'sidebar-nav-item';
    item.onclick = function(){
      document.querySelectorAll('.sidebar-nav-item').forEach(e => e.classList.remove('active'));
      this.classList.add('active');
      if(typeof currentCase !== 'undefined') window.currentCase = null;
      showView('viewPlantillas');
      loadTemplates();
    };
    item.innerHTML = '<span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h6M3 15h6"/></svg></span>Plantillas';
    if(lastNav) lastNav.after(item);
    else nav.appendChild(item);
  }
}

/* ── CSS ── */
(function(){
  const old = document.getElementById('plantillas-css');
  if(old) old.remove();
  const s = document.createElement('style');
  s.id = 'plantillas-css';
  s.textContent = `
    .tmpl-category { margin-bottom: 8px; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .tmpl-category-header {
      display: flex; align-items: center; gap: 8px; padding: 10px 12px;
      cursor: pointer; font-size: 12px; font-weight: 600; transition: background .15s;
    }
    .tmpl-category-header:hover { background: var(--surface2); }
    .tmpl-count {
      font-size: 10px; padding: 1px 6px; border-radius: 8px;
      background: var(--gold-glow); color: var(--gold); font-weight: 600;
    }
    .tmpl-arrow { margin-left: auto; font-size: 10px; color: var(--text-muted); }
    .tmpl-item {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 14px; border-top: 1px solid var(--border); transition: background .1s;
    }
    .tmpl-item:hover { background: var(--surface2); }
    .tmpl-item-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; }
    .tmpl-type-icon {
      width: 32px; height: 32px; border-radius: 6px; display: flex;
      align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;
    }
    .tmpl-item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity .15s; }
    .tmpl-item:hover .tmpl-item-actions { opacity: 1; }
    .tmpl-editor-form .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
    .tmpl-editor-form .form-field { display: flex; flex-direction: column; }
    .tmpl-editor-form .form-field label { font-size: 10px; text-transform: uppercase; color: var(--text-muted); letter-spacing: .5px; margin-bottom: 4px; }
    .tmpl-editor-form input, .tmpl-editor-form select, .tmpl-editor-form textarea {
      padding: 8px 10px; font-size: 12px; background: var(--surface2);
      border: 1px solid var(--border); border-radius: var(--radius); color: var(--text);
      font-family: var(--font-body);
    }
    .tmpl-editor-form input:focus, .tmpl-editor-form select:focus, .tmpl-editor-form textarea:focus { outline: none; border-color: var(--gold); }
    .tmpl-var-row {
      display: flex; align-items: center; gap: 6px; padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .tmpl-var-row input, .tmpl-var-row select {
      padding: 4px 8px; font-size: 11px; background: var(--surface2);
      border: 1px solid var(--border); border-radius: var(--radius); color: var(--text);
    }
  `;
  document.head.appendChild(s);
})();

/* ── Init ── */
function init(){
  ensureTable();
  injectPlantillasView();
  console.log('[plantillas-custom] Módulo cargado ✓');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
