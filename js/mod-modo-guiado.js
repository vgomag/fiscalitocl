/* ══════════════════════════════════════════════════════════════
   mod-modo-guiado.js  —  Modo guiado / Wizard para documentos
   Generación paso a paso de documentos legales con variables,
   auto-relleno desde caso vinculado, y exportación.
   ══════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : null;
const _esc = s => typeof esc === 'function' ? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── Estado del wizard ── */
let wizardState = {
  template: null,          // { code, name, type, structure, blocks, variables }
  variant: null,           // null | 'presencial' | 'telematica'
  linkedCase: null,        // { id, name, rol, ... } del caso vinculado
  linkedParticipants: [],  // participantes del caso
  values: {},              // variable_key → valor
  currentBlock: 0,         // índice del bloque actual
  generatedDoc: null,      // documento generado (string)
  isOpen: false
};

/* ── Definición de bloques de plantilla estándar ── */
/* Cada plantilla se divide en bloques con variables */
const DEFAULT_BLOCKS = [
  {
    title: 'Datos del Procedimiento',
    description: 'Información básica del caso e identificación',
    variables: [
      { key: 'proc_nombre_caso', label: 'Nombre/Número del caso', type: 'text', required: true },
      { key: 'proc_rol', label: 'ROL / Resolución que instruye', type: 'text', required: true },
      { key: 'proc_caratula', label: 'Carátula (partes)', type: 'text', required: false },
      { key: 'proc_tipo', label: 'Tipo de procedimiento', type: 'select', required: true,
        options: ['Investigación Sumaria', 'Sumario Administrativo', 'Procedimiento Disciplinario'] },
      { key: 'proc_normativa', label: 'Normativa aplicable', type: 'text', required: false }
    ]
  },
  {
    title: 'Intervinientes',
    description: 'Datos de denunciantes, denunciados y fiscal',
    variables: [
      { key: 'den_nombre', label: 'Nombre denunciante(s)', type: 'text', required: true },
      { key: 'den_estamento', label: 'Estamento denunciante', type: 'text', required: false },
      { key: 'den_rut', label: 'RUT denunciante', type: 'text', required: false },
      { key: 'inc_nombre', label: 'Nombre denunciado/a(s)', type: 'text', required: true },
      { key: 'inc_estamento', label: 'Estamento denunciado/a', type: 'text', required: false },
      { key: 'inc_rut', label: 'RUT denunciado/a', type: 'text', required: false },
      { key: 'fis_nombre', label: 'Nombre del fiscal', type: 'text', required: false },
      { key: 'act_nombre', label: 'Nombre actuario/a', type: 'text', required: false }
    ]
  },
  {
    title: 'Antecedentes y Hechos',
    description: 'Descripción de los hechos investigados',
    variables: [
      { key: 'fecha_hechos', label: 'Fecha de los hechos', type: 'date', required: false },
      { key: 'lugar_hechos', label: 'Lugar de los hechos', type: 'text', required: false },
      { key: 'hechos_descripcion', label: 'Descripción de los hechos', type: 'textarea', required: true },
      { key: 'normas_infringidas', label: 'Normas presuntamente infringidas', type: 'textarea', required: false }
    ]
  },
  {
    title: 'Resolución y Determinaciones',
    description: 'Decisión, fundamentos y medidas',
    variables: [
      { key: 'resolucion_texto', label: 'Texto de la resolución / determinación', type: 'textarea', required: true },
      { key: 'fundamentos', label: 'Fundamentos de hecho y derecho', type: 'textarea', required: false },
      { key: 'medidas', label: 'Medidas o sanciones propuestas', type: 'textarea', required: false },
      { key: 'observaciones_final', label: 'Observaciones adicionales', type: 'textarea', required: false }
    ]
  }
];

/* ── Auto-rellenar desde caso vinculado ── */
async function prefillFromCase(caseId){
  const s = _sb();
  if(!s || !caseId) return;

  try {
    const [caseRes, partRes] = await Promise.all([
      s.from('cases').select('*').eq('id', caseId).single(),
      s.from('case_participants').select('*').eq('case_id', caseId)
    ]);

    if(caseRes.data){
      const c = caseRes.data;
      wizardState.linkedCase = c;
      const fmtArr = v => { if(!v) return ''; if(Array.isArray(v)) return v.join(', '); try { return JSON.parse(v).join(', '); } catch { return String(v); }};

      // Mapeo desde caso
      const autoValues = {
        proc_nombre_caso: c.name || '',
        proc_rol: c.nueva_resolucion || c.rol || '',
        proc_caratula: c.caratula || '',
        proc_tipo: c.tipo_procedimiento || '',
        proc_normativa: c.protocolo ? 'Protocolo ' + c.protocolo : '',
        den_nombre: fmtArr(c.denunciantes),
        den_estamento: fmtArr(c.estamentos_denunciante),
        inc_nombre: fmtArr(c.denunciados),
        inc_estamento: fmtArr(c.estamentos_denunciado),
        fecha_hechos: c.fecha_denuncia || ''
      };

      // Mapeo desde participantes
      if(partRes.data){
        wizardState.linkedParticipants = partRes.data;
        partRes.data.forEach(p => {
          const role = (p.role || '').toLowerCase();
          if(role.includes('denunciante') || role.includes('víctima')){
            if(!autoValues.den_nombre) autoValues.den_nombre = p.name || '';
            if(!autoValues.den_rut) autoValues.den_rut = p.rut || '';
            if(!autoValues.den_estamento) autoValues.den_estamento = p.estamento || '';
          }
          if(role.includes('denunciado') || role.includes('inculpado')){
            if(!autoValues.inc_nombre) autoValues.inc_nombre = p.name || '';
            if(!autoValues.inc_rut) autoValues.inc_rut = p.rut || '';
            if(!autoValues.inc_estamento) autoValues.inc_estamento = p.estamento || '';
          }
          if(role.includes('fiscal')){
            autoValues.fis_nombre = p.name || '';
          }
          if(role.includes('actuari')){
            autoValues.act_nombre = p.name || '';
          }
        });
      }

      // Solo rellenar campos vacíos
      Object.entries(autoValues).forEach(([k, v]) => {
        if(v && !wizardState.values[k]) wizardState.values[k] = v;
      });
    }
  } catch(err){
    console.warn('[modo-guiado] Error prefill:', err);
  }
}

/* ── Generar documento ── */
function generateDocument(){
  const blocks = wizardState.template?.blocks || DEFAULT_BLOCKS;
  const allVars = blocks.flatMap(b => b.variables);

  let doc = '';
  // Encabezado
  doc += `${(wizardState.template?.name || 'DOCUMENTO GENERADO').toUpperCase()}\n`;
  doc += '═'.repeat(60) + '\n\n';

  // Por cada bloque, generar sección
  blocks.forEach(block => {
    doc += `${block.title.toUpperCase()}\n`;
    doc += '─'.repeat(40) + '\n';
    block.variables.forEach(v => {
      const val = wizardState.values[v.key]?.trim();
      doc += `${v.label}: ${val || '[NO CONSTA]'}\n`;
    });
    doc += '\n';
  });

  // Si hay plantilla con estructura, usar esa
  if(wizardState.template?.structure){
    doc = wizardState.template.structure;
    allVars.forEach(v => {
      const val = wizardState.values[v.key]?.trim();
      const regex = new RegExp('\\{' + v.key + '\\}', 'g');
      doc = doc.replace(regex, val || '[NO CONSTA]');
    });
  }

  wizardState.generatedDoc = doc;
  return doc;
}

/* ── Calcular completitud ── */
function getCompletionStatus(){
  const blocks = wizardState.template?.blocks || DEFAULT_BLOCKS;
  const allRequired = blocks.flatMap(b => b.variables.filter(v => v.required));
  const completed = allRequired.filter(v => wizardState.values[v.key]?.trim());
  const missing = allRequired.filter(v => !wizardState.values[v.key]?.trim());
  return {
    completed: completed.length,
    total: allRequired.length,
    percent: allRequired.length ? Math.round((completed.length / allRequired.length) * 100) : 100,
    missing: missing.map(v => v.label)
  };
}

/* ── Renderizar el wizard ── */
function renderWizard(){
  const container = document.getElementById('wizardPanel');
  if(!container) return;

  if(!wizardState.isOpen){
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const blocks = wizardState.template?.blocks || DEFAULT_BLOCKS;
  const currentBlock = blocks[wizardState.currentBlock];
  const isFirst = wizardState.currentBlock === 0;
  const isLast = wizardState.currentBlock === blocks.length - 1;
  const status = getCompletionStatus();

  // ¿Mostrar documento generado?
  if(wizardState.generatedDoc){
    container.innerHTML = renderGeneratedView(status);
    return;
  }

  // Indicadores de bloque
  let indicators = '<div class="wizard-indicators">';
  blocks.forEach((b, i) => {
    const cls = i === wizardState.currentBlock ? 'indicator-current' :
                i < wizardState.currentBlock ? 'indicator-done' : 'indicator-pending';
    indicators += `<div class="wizard-indicator ${cls}" onclick="wizardGoToBlock(${i})" title="${_esc(b.title)}"></div>`;
    if(i < blocks.length - 1) indicators += '<div class="wizard-indicator-line' + (i < wizardState.currentBlock ? ' line-done' : '') + '"></div>';
  });
  indicators += '</div>';

  // Header
  let html = `
    <div class="wizard-header">
      <div>
        <div style="font-size:14px;font-weight:600">Modo Guiado</div>
        ${wizardState.template?.name ? `<div style="font-size:11px;color:var(--text-muted)">${_esc(wizardState.template.name)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${wizardState.linkedCase ? `<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:var(--gold-glow);color:var(--gold);font-weight:500">📋 ${_esc(wizardState.linkedCase.name)}</span>` : ''}
        <button class="btn-sm" onclick="closeWizard()" style="color:var(--text-muted)">✕ Cerrar</button>
      </div>
    </div>

    <div class="wizard-progress">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-bottom:4px">
        <span>Bloque ${wizardState.currentBlock + 1} de ${blocks.length}</span>
        <span>${status.percent}% completado</span>
      </div>
      <div class="wizard-progress-bar"><div class="wizard-progress-fill" style="width:${status.percent}%"></div></div>
      ${indicators}
    </div>

    <div class="wizard-body">
      <div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${_esc(currentBlock.title)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${_esc(currentBlock.description || '')}</div>
      </div>`;

  // Variables del bloque actual
  currentBlock.variables.forEach(v => {
    const val = wizardState.values[v.key] || '';
    const filled = !!val.trim();
    const fromCase = wizardState.linkedCase && val && !wizardState.template?.structure; // auto-filled hint

    html += `
      <div class="wizard-field">
        <div class="wizard-field-label">
          <span class="wizard-req-dot" style="background:${filled ? 'var(--gold)' : v.required ? 'var(--border2)' : 'transparent'}"></span>
          ${_esc(v.label)}${!v.required ? ' <span style="color:var(--text-muted)">(opcional)</span>' : ''}
          ${fromCase && filled ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--gold-glow);color:var(--gold);margin-left:4px">del expediente</span>' : ''}
        </div>`;

    if(v.type === 'textarea'){
      html += `<textarea class="wizard-input" rows="3" placeholder="${_esc(v.placeholder || 'Ingrese información…')}"
        oninput="wizardSetValue('${v.key}',this.value)">${_esc(val)}</textarea>`;
    } else if(v.type === 'select' && v.options){
      html += `<select class="wizard-input" onchange="wizardSetValue('${v.key}',this.value)">
        <option value="">— Seleccionar —</option>
        ${v.options.map(o => `<option value="${_esc(o)}"${val === o ? ' selected' : ''}>${_esc(o)}</option>`).join('')}
      </select>`;
    } else if(v.type === 'date'){
      html += `<input type="date" class="wizard-input" value="${_esc(val)}" onchange="wizardSetValue('${v.key}',this.value)"/>`;
    } else {
      html += `<input type="text" class="wizard-input" value="${_esc(val)}" placeholder="${_esc(v.placeholder || '')}"
        oninput="wizardSetValue('${v.key}',this.value)"/>`;
    }
    html += '</div>';
  });

  html += '</div>';

  // Navegación
  html += `
    <div class="wizard-nav">
      <button class="btn-sm" onclick="wizardPrev()" ${isFirst ? 'disabled style="opacity:.4"' : ''}>← Anterior</button>
      <button class="btn-save" onclick="${isLast ? 'wizardGenerate()' : 'wizardNext()'}" style="font-size:12px;padding:8px 20px">
        ${isLast ? '✨ Generar documento' : 'Siguiente →'}
      </button>
    </div>`;

  container.innerHTML = html;
}

/* ── Vista del documento generado ── */
function renderGeneratedView(status){
  return `
    <div class="wizard-header">
      <div style="font-size:14px;font-weight:600">📄 Documento Generado</div>
      <button class="btn-sm" onclick="closeWizard()" style="color:var(--text-muted)">✕ Cerrar</button>
    </div>
    <div class="wizard-body" style="flex:1;overflow-y:auto">
      <pre class="wizard-doc-preview">${_esc(wizardState.generatedDoc)}</pre>

      <div style="margin-top:12px;padding:10px;background:var(--surface2);border-radius:var(--radius);font-size:11px">
        <div style="font-weight:600;margin-bottom:4px">Completitud: ${status.completed}/${status.total} campos</div>
        ${status.missing.length ? `<div style="color:var(--red);margin-top:4px">Campos faltantes: ${status.missing.join(', ')}</div>` : '<div style="color:var(--green)">✅ Todos los campos obligatorios completados</div>'}
      </div>

      ${wizardState.template?.code ? `<div style="font-size:10px;color:var(--text-muted);margin-top:8px">Plantilla: ${_esc(wizardState.template.code)} · ${wizardState.variant ? 'Modalidad: ' + wizardState.variant : 'Sin variante'}</div>` : ''}
    </div>
    <div class="wizard-nav">
      <button class="btn-sm" onclick="wizardBackToEdit()">✎ Editar</button>
      <div style="display:flex;gap:6px">
        <button class="btn-sm" onclick="wizardCopy()">📋 Copiar</button>
        <button class="btn-sm" onclick="wizardSendToChat()">💬 Enviar al chat</button>
        <button class="btn-save" onclick="wizardExportWord()" style="font-size:12px;padding:8px 14px">📄 Descargar Word</button>
      </div>
    </div>`;
}

/* ── Funciones globales ── */
window.openWizard = function(template, caseId){
  wizardState = {
    template: template || null,
    variant: null,
    linkedCase: null,
    linkedParticipants: [],
    values: {},
    currentBlock: 0,
    generatedDoc: null,
    isOpen: true
  };
  if(caseId) prefillFromCase(caseId).then(renderWizard).catch(e=>{console.warn('[guiado] prefillFromCase:',e); renderWizard();});
  else if(typeof currentCase !== 'undefined' && currentCase){
    prefillFromCase(currentCase.id).then(renderWizard).catch(e=>{console.warn('[guiado] prefillFromCase:',e); renderWizard();});
  } else {
    renderWizard();
  }
};
window.openWizardForCurrentCase = function(){
  if(typeof currentCase !== 'undefined' && currentCase){
    openWizard(null, currentCase.id);
  } else {
    openWizard(null, null);
  }
};
window.closeWizard = function(){
  wizardState.isOpen = false;
  renderWizard();
};
window.wizardSetValue = function(key, val){
  wizardState.values[key] = val;
  // No re-render completo, solo actualizar indicadores/progreso
  const status = getCompletionStatus();
  const bar = document.querySelector('.wizard-progress-fill');
  if(bar) bar.style.width = status.percent + '%';
  const pctEl = document.querySelector('.wizard-progress span:last-child');
  if(pctEl) pctEl.textContent = status.percent + '% completado';
};
window.wizardNext = function(){
  const blocks = wizardState.template?.blocks || DEFAULT_BLOCKS;
  if(wizardState.currentBlock < blocks.length - 1){
    wizardState.currentBlock++;
    renderWizard();
  }
};
window.wizardPrev = function(){
  if(wizardState.currentBlock > 0){
    wizardState.currentBlock--;
    renderWizard();
  }
};
window.wizardGoToBlock = function(idx){
  wizardState.currentBlock = idx;
  renderWizard();
};
window.wizardGenerate = function(){
  generateDocument();
  renderWizard();
};
window.wizardBackToEdit = function(){
  wizardState.generatedDoc = null;
  renderWizard();
};
window.wizardCopy = function(){
  if(wizardState.generatedDoc){
    navigator.clipboard.writeText(wizardState.generatedDoc).then(() => {
      if(typeof showToast === 'function') showToast('✓ Copiado al portapapeles');
    });
  }
};
window.wizardSendToChat = function(){
  if(wizardState.generatedDoc && typeof currentCase !== 'undefined' && currentCase){
    closeWizard();
    showTab('tabChat');
    // Insertar el documento en el textarea del chat
    const ta = document.getElementById('chatInput') || document.querySelector('#tabChat textarea');
    if(ta){
      ta.value = 'Revisa y mejora el siguiente documento generado:\n\n' + wizardState.generatedDoc;
      ta.focus();
    }
  }
};
window.wizardExportWord = async function(){
  if(!wizardState.generatedDoc) return;
  if(typeof exportToWord === 'function'){
    exportToWord(wizardState.generatedDoc, (wizardState.template?.name || 'documento') + '.docx');
  } else if(typeof window.docx !== 'undefined'){
    // Note: uses async for logo loading
    // Fallback: exportar con docx
    try {
      const { Document, Packer, Paragraph, TextRun } = window.docx;
      const paragraphs = wizardState.generatedDoc.split('\n').map(line =>
        new Paragraph({
          alignment: window.docx.AlignmentType?.JUSTIFIED || 'both',
          spacing: { line: 360 },
          children: [new TextRun({ text: line, font: 'Arial', size: 22 })]
        })
      );
      /* Usar propiedades de sección con logo si están disponibles */
      const sectionProps = typeof getWordSectionProps === 'function'
        ? await getWordSectionProps(window.docx)
        : { properties: { page: { size: { width: 12240, height: 18720 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1701 } } } };
      const doc = new Document({ sections: [{ ...sectionProps, children: paragraphs }] });
      Packer.toBlob(doc).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (wizardState.template?.name || 'documento') + '.docx';
        a.click();
        URL.revokeObjectURL(url);
        if(typeof showToast === 'function') showToast('✓ Documento descargado');
      });
    } catch(err){
      console.error('[modo-guiado] Error export:', err);
      if(typeof showToast === 'function') showToast('⚠ Error al exportar');
    }
  }
};

/* ── Inyectar UI ── */
function injectWizardUI(){
  // Panel flotante del wizard
  if(!document.getElementById('wizardPanel')){
    const panel = document.createElement('div');
    panel.id = 'wizardPanel';
    panel.className = 'wizard-panel';
    panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  // Botón en la vista de caso (junto a los tabs)
  const caseTabs = document.getElementById('caseTabs');
  if(caseTabs && !document.getElementById('wizardTriggerBtn')){
    const btn = document.createElement('button');
    btn.id = 'wizardTriggerBtn';
    btn.className = 'btn-sm';
    btn.style.cssText = 'margin-left:auto;padding:4px 12px;font-size:11px;color:var(--gold)';
    btn.innerHTML = '✨ Modo Guiado';
    btn.onclick = () => openWizardForCurrentCase();
    caseTabs.appendChild(btn);
  }
}

/* ── CSS ── */
(function(){
  const old = document.getElementById('wizard-css');
  if(old) old.remove();
  const s = document.createElement('style');
  s.id = 'wizard-css';
  s.textContent = `
    .wizard-panel {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 620px; max-height: 85vh; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
      box-shadow: 0 16px 48px rgba(0,0,0,.3); z-index: 4000;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .wizard-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid var(--border);
    }
    .wizard-progress { padding: 10px 16px; border-bottom: 1px solid var(--border); }
    .wizard-progress-bar {
      height: 4px; background: var(--surface2); border-radius: 2px; overflow: hidden;
    }
    .wizard-progress-fill {
      height: 100%; background: var(--gold); transition: width .3s;
    }
    .wizard-indicators {
      display: flex; align-items: center; justify-content: center; gap: 0; margin-top: 8px;
    }
    .wizard-indicator {
      width: 10px; height: 10px; border-radius: 50%; cursor: pointer;
      transition: all .2s;
    }
    .indicator-current { background: var(--gold); box-shadow: 0 0 0 3px var(--gold-glow); }
    .indicator-done { background: var(--green); }
    .indicator-pending { background: var(--border2); }
    .wizard-indicator-line { width: 20px; height: 2px; background: var(--border2); }
    .wizard-indicator-line.line-done { background: var(--green); }
    .wizard-body {
      flex: 1; overflow-y: auto; padding: 16px;
    }
    .wizard-field { margin-bottom: 12px; }
    .wizard-field-label {
      display: flex; align-items: center; gap: 6px; font-size: 11px;
      font-weight: 500; margin-bottom: 4px; color: var(--text);
    }
    .wizard-req-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .wizard-input {
      width: 100%; padding: 8px 10px; font-size: 12px; border: 1px solid var(--border);
      border-radius: var(--radius); background: var(--surface2); color: var(--text);
      font-family: var(--font-body); resize: vertical;
    }
    .wizard-input:focus { outline: none; border-color: var(--gold); }
    .wizard-nav {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-top: 1px solid var(--border);
    }
    .wizard-doc-preview {
      white-space: pre-wrap; font-family: var(--font-mono); font-size: 11.5px;
      line-height: 1.6; color: var(--text); padding: 12px; background: var(--bg);
      border: 1px solid var(--border); border-radius: var(--radius);
      max-height: 400px; overflow-y: auto;
    }
    @media(max-width:700px){ .wizard-panel { width: 95vw; } }
  `;
  document.head.appendChild(s);
})();

/* ── Init ── */
function init(){
  injectWizardUI();
  console.log('[modo-guiado] Módulo cargado ✓');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
