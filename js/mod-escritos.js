/* =========================================================
   MOD-ESCRITOS.JS — Escritos Judiciales
   Gestión de escritos con IA + streaming + borradores
   ========================================================= */

const ESCRITOS_TEMPLATES = [
  { id:'demanda',             icon:'⚖️',  label:'Demanda',               desc:'Demanda laboral o civil' },
  { id:'recurso_proteccion',  icon:'🛡️', label:'Recurso de Protección', desc:'Recurso ante Corte de Apelaciones' },
  { id:'contestacion',        icon:'📋', label:'Contestación',           desc:'Contestación de demanda' },
  { id:'apelacion',           icon:'⬆️', label:'Apelación',              desc:'Recurso de apelación' },
  { id:'tutela',              icon:'🤝', label:'Tutela Laboral',          desc:'Acción de tutela laboral' },
  { id:'otro',                icon:'📝', label:'Otro escrito',            desc:'Escrito judicial personalizado' },
];

const escritos = {
  selectedTemplate: null,
  drafts: [],           // {id, template, title, content, createdAt}
  activeDraftId: null,
  isGenerating: false,
  streamingContent: '',
};

/* ── ABRIR VISTA ── */
function openEscritosJudiciales() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  currentCase = null;
  showView('viewEscritosJudiciales');
  renderEscritosView();
}

/* ── RENDER PRINCIPAL ── */
function renderEscritosView() {
  const container = document.getElementById('escritosContainer');
  if (!container) return;

  const draftsHtml = escritos.drafts.length ? `
    <div class="esc-drafts-panel">
      <div class="esc-section-label">Borradores (${escritos.drafts.length})</div>
      <div class="esc-drafts-list" id="escritosDraftsList">
        ${escritos.drafts.map(d => {
          const tpl = ESCRITOS_TEMPLATES.find(t => t.id === d.template) || { icon: '📝', label: d.template };
          return `<div class="esc-draft-item ${escritos.activeDraftId === d.id ? 'active' : ''}" onclick="selectEscritoDraft('${d.id}')">
            <span class="esc-draft-icon">${tpl.icon}</span>
            <div class="esc-draft-info">
              <div class="esc-draft-title">${esc(d.title)}</div>
              <div class="esc-draft-date">${new Date(d.createdAt).toLocaleString('es-CL')}</div>
            </div>
            <button class="btn-del" onclick="event.stopPropagation();deleteEscritoDraft('${d.id}')" title="Eliminar">✕</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const activeDraft = escritos.drafts.find(d => d.id === escritos.activeDraftId);

  let previewHtml;
  if (escritos.isGenerating && escritos.streamingContent) {
    previewHtml = `<div class="esc-preview-wrap">
      <div class="esc-preview-header">
        <span class="esc-streaming-badge"><div class="da" style="display:inline-block;width:7px;height:7px;background:var(--gold-dim);border-radius:50%;margin-right:5px;animation:pulse 1.4s infinite"></div>Redactando…</span>
      </div>
      <div class="esc-preview-body" id="escritosStreamBox">${md(escritos.streamingContent)}</div>
    </div>`;
  } else if (activeDraft) {
    const tpl = ESCRITOS_TEMPLATES.find(t => t.id === activeDraft.template) || { icon: '📝', label: activeDraft.template };
    previewHtml = `<div class="esc-preview-wrap">
      <div class="esc-preview-header">
        <span style="font-size:13px;font-weight:600">${tpl.icon} ${esc(activeDraft.title)}</span>
        <span class="esc-tpl-badge">${tpl.label}</span>
        <div class="esc-preview-actions">
          <button class="btn-export" onclick="copyEscritos('${activeDraft.id}')">📋 Copiar</button>
          <button class="btn-export" onclick="exportEscritosWord('${activeDraft.id}')">⬇ Word</button>
          <button class="btn-del" onclick="deleteEscritoDraft('${activeDraft.id}')">✕</button>
        </div>
      </div>
      <div class="esc-preview-body">${md(activeDraft.content)}</div>
    </div>`;
  } else {
    previewHtml = `<div class="esc-preview-empty">
      <div style="font-size:36px;margin-bottom:12px">⚖️</div>
      <div style="font-size:14px;font-weight:500;margin-bottom:6px">Escritos Judiciales</div>
      <div style="font-size:12px;color:var(--text-muted);max-width:380px;line-height:1.6">Selecciona un tipo de escrito, describe las instrucciones y la IA generará un borrador completo basado en los modelos de la biblioteca.</div>
    </div>`;
  }

  container.innerHTML = `
    <div class="esc-layout">
      <!-- Panel izquierdo -->
      <div class="esc-left">
        <div class="esc-section-label">Tipo de Escrito</div>
        <div class="esc-templates-grid">
          ${ESCRITOS_TEMPLATES.map(tpl => `
            <button class="esc-tpl-btn ${escritos.selectedTemplate === tpl.id ? 'active' : ''}"
              onclick="selectEscritosTemplate('${tpl.id}')" title="${esc(tpl.desc)}">
              <span class="esc-tpl-icon">${tpl.icon}</span>
              <span class="esc-tpl-label">${tpl.label}</span>
            </button>`).join('')}
        </div>
        <div class="esc-section-label" style="margin-top:12px">Instrucciones</div>
        <textarea id="escritosInstructions" class="esc-textarea"
          placeholder="Describe las partes, hechos, pretensiones, tribunal competente, fundamentos de derecho..."
          rows="8" ${escritos.isGenerating ? 'disabled' : ''}></textarea>
        <button class="btn-save" style="width:100%;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px"
          onclick="generateEscrito()" ${escritos.isGenerating || !escritos.selectedTemplate ? 'disabled' : ''}>
          ${escritos.isGenerating
            ? '<div class="da" style="width:8px;height:8px;background:#fff;border-radius:50%;animation:pulse 1.4s infinite;margin-right:4px"></div> Generando...'
            : '✍️ Generar Escrito'}
        </button>
        ${draftsHtml}
      </div>
      <!-- Panel derecho -->
      <div class="esc-right">
        ${previewHtml}
      </div>
    </div>`;
}

/* ── SELECCIONAR TEMPLATE ── */
function selectEscritosTemplate(id) {
  escritos.selectedTemplate = id;
  renderEscritosView();
  document.getElementById('escritosInstructions')?.focus();
}

/* ── SELECCIONAR BORRADOR ── */
function selectEscritoDraft(id) {
  escritos.activeDraftId = id;
  renderEscritosView();
}

/* ── ELIMINAR BORRADOR ── */
function deleteEscritoDraft(id) {
  escritos.drafts = escritos.drafts.filter(d => d.id !== id);
  if (escritos.activeDraftId === id) {
    escritos.activeDraftId = escritos.drafts[0]?.id || null;
  }
  renderEscritosView();
}

/* ── GENERAR ESCRITO CON IA (streaming) ── */
async function generateEscrito() {
  const instructions = document.getElementById('escritosInstructions')?.value.trim();
  if (!escritos.selectedTemplate || !instructions) {
    showToast('⚠ Selecciona un tipo y describe las instrucciones');
    return;
  }
  if (escritos.isGenerating) return;

  const tpl = ESCRITOS_TEMPLATES.find(t => t.id === escritos.selectedTemplate);
  escritos.isGenerating = true;
  escritos.streamingContent = '';
  escritos.activeDraftId = null;
  renderEscritosView();

  const prompt = `Redacta un escrito judicial de tipo "${tpl?.label || escritos.selectedTemplate}".

INSTRUCCIONES DEL USUARIO:
${instructions}

REQUISITOS:
- Utiliza estructura formal completa (encabezado, suma, cuerpo, petitorio, otrosí si corresponde)
- Incluye fórmulas procesales apropiadas para los tribunales chilenos
- Adapta el nivel de formalidad y las citas normativas al tipo de escrito
- Genera el documento completo y listo para revisión
- Cita artículos del Código del Trabajo, Código de Procedimiento Civil u otras normas pertinentes`;

  try {
    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: `Eres Fiscalito, asistente jurídico especializado en escritos judiciales chilenos. Generas documentos formales completos con estructura procesal correcta, citas normativas precisas y lenguaje institucional formal. Tus escritos son listos para revisión del abogado.`,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal:_ctrl.signal
      });

      if (!resp.ok) {
        const err = await resp.json();
        showToast('⚠ Error: ' + (err.error || 'Error al generar'));
        escritos.isGenerating = false;
        renderEscritosView();
        return;
      }

      const data = await resp.json();
      const content = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';

      const newDraft = {
        id: crypto.randomUUID(),
        template: escritos.selectedTemplate,
        title: `${tpl?.label} — ${new Date().toLocaleDateString('es-CL')}`,
        content,
        createdAt: new Date().toISOString()
      };
      escritos.drafts.unshift(newDraft);
      escritos.activeDraftId = newDraft.id;
      escritos.streamingContent = '';
      showToast('✓ Escrito generado exitosamente');
    }finally{
      clearTimeout(_tout);
    }
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    escritos.isGenerating = false;
    renderEscritosView();
  }
}

/* ── COPIAR ── */
function copyEscritos(id) {
  const draft = escritos.drafts.find(d => d.id === id);
  if (!draft) return;
  // Plain text version (strip markdown)
  const plain = draft.content.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/^#+\s+/gm,'').replace(/^[-*]\s+/gm,'• ');
  navigator.clipboard.writeText(plain).then(() => showToast('✓ Escrito copiado al portapapeles'));
}

/* ── EXPORTAR WORD (básico via blob) ── */
async function exportEscritosWord(id) {
  const draft = escritos.drafts.find(d => d.id === id);
  if (!draft) return;
  // Minimal RTF export that Word can open
  const rtfContent = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}
{\\f0\\fs24
${draft.content.replace(/\*\*(.*?)\*\*/g, '{\\b $1}').replace(/\n/g, '\\par\n')}
}
}`;
  const blob = new Blob([rtfContent], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = draft.title.replace(/[^a-z0-9\s]/gi, '_') + '.rtf';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Exportado como .rtf (abrir con Word)');
}

/* ── ESTILOS CSS ── */
(function injectEscritosCSS() {
  const style = document.createElement('style');
  style.textContent = `
.esc-layout{display:grid;grid-template-columns:280px 1fr;gap:16px;padding:16px;height:100%;overflow:hidden;}
.esc-left{display:flex;flex-direction:column;gap:0;overflow-y:auto;}
.esc-right{overflow-y:auto;display:flex;flex-direction:column;}
.esc-section-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);font-weight:600;margin-bottom:7px;margin-top:4px;}
.esc-templates-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
.esc-tpl-btn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:9px 5px;border-radius:var(--radius);border:1px solid var(--border2);background:var(--surface2);cursor:pointer;font-family:'Inter',sans-serif;transition:all .15s;color:var(--text-muted);}
.esc-tpl-btn:hover{border-color:var(--gold-dim);color:var(--gold);background:var(--gold-glow);}
.esc-tpl-btn.active{border-color:var(--gold-dim);background:var(--gold-glow);color:var(--gold);}
.esc-tpl-icon{font-size:18px;}
.esc-tpl-label{font-size:10.5px;font-weight:500;text-align:center;line-height:1.2;}
.esc-textarea{width:100%;background:var(--surface2);border:1px solid var(--border2);color:var(--text);padding:8px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12.5px;outline:none;resize:vertical;min-height:140px;transition:border-color .15s;line-height:1.5;}
.esc-textarea:focus{border-color:var(--gold-dim);}
.esc-drafts-panel{margin-top:14px;}
.esc-drafts-list{display:flex;flex-direction:column;gap:3px;}
.esc-draft-item{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:all .15s;}
.esc-draft-item:hover{border-color:var(--border2);background:var(--surface2);}
.esc-draft-item.active{border-color:var(--gold-dim);background:var(--gold-glow);}
.esc-draft-icon{font-size:14px;flex-shrink:0;}
.esc-draft-info{flex:1;min-width:0;}
.esc-draft-title{font-size:11.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.esc-draft-date{font-size:10px;color:var(--text-muted);margin-top:1px;}
.esc-preview-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;flex:1;overflow:hidden;}
.esc-preview-header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap;}
.esc-tpl-badge{font-size:9.5px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:2px 8px;border-radius:8px;white-space:nowrap;}
.esc-preview-actions{margin-left:auto;display:flex;gap:5px;align-items:center;}
.esc-preview-body{flex:1;overflow-y:auto;padding:16px;font-size:12.5px;line-height:1.75;color:var(--text);}
.esc-preview-body h1,.esc-preview-body h2,.esc-preview-body h3{font-family:'EB Garamond',serif;color:var(--text);margin:10px 0 4px;}
.esc-preview-body h1{font-size:18px;text-align:center;}
.esc-preview-body h2{font-size:15px;}
.esc-preview-body h3{font-size:13px;}
.esc-preview-body p{margin-bottom:8px;}
.esc-preview-body ul,.esc-preview-body ol{padding-left:18px;margin:4px 0;}
.esc-preview-body strong{color:var(--text);}
.esc-preview-body hr{border:none;border-top:1px solid var(--border);margin:10px 0;}
.esc-preview-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);text-align:center;padding:40px;}
.esc-streaming-badge{display:flex;align-items:center;font-size:12px;font-weight:500;color:var(--gold);}
`;
  document.head.appendChild(style);


// PDF export for escritos
function exportEscritosPDF(){
  var drafts = escritos.drafts || [];
  var activeId = escritos.activeDraftId || null;
  var draft = activeId ? drafts.find(function(d){return d.id===activeId}) : null;
  var content = draft ? draft.content : '';
  if(!content && escritos.streamingContent) content = escritos.streamingContent;
  if(!content){showToast('Sin contenido para exportar');return;}
  if(typeof exportToPDF === 'function'){
    exportToPDF(content, 'escrito_judicial_' + Date.now(), {title: draft ? draft.title : 'Escrito Judicial'});
  } else { showToast('Modulo de exportacion no cargado'); }
}
window.exportEscritosPDF = exportEscritosPDF;

})();
