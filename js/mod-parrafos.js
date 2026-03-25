/* =========================================================
   MOD-PARRAFOS.JS — Párrafos Modelo para Vista Fiscal (F7)
   Integrado como panel adicional en la función F7
   y como módulo autónomo en F7 / Párrafos Tipo
   ========================================================= */

/* ── CONTENIDO DE PÁRRAFOS (del módulo fuente) ── */
const PARRAFOS_CATS = [
  { id:'antecedentes',  label:'Antecedentes procesales',    color:'#4f46e5' },
  { id:'hechos',        label:'Hechos acreditados',         color:'#059669' },
  { id:'valoracion',    label:'Valoración de la prueba',    color:'#0891b2' },
  { id:'analisis',      label:'Análisis jurídico',          color:'#7c3aed' },
  { id:'sancion',       label:'Propuesta de sanción',       color:'#dc2626' },
  { id:'sobreseimiento',label:'Sobreseimiento',             color:'#ca8a04' },
  { id:'por_tanto',     label:'Por Tanto',                  color:'#1d4ed8' },
  { id:'genero',        label:'Perspectiva de género',      color:'#be185d' },
  { id:'eximentes',     label:'Eximentes y atenuantes',     color:'#15803d' },
];

const PARRAFOS_DB = [
  {
    id:'p_prop_sancion',
    cat:'sancion',
    label:'Propuesta de sanción',
    text:`Que, habiéndose acreditado la responsabilidad administrativa de don/doña [NOMBRE_COMPLETO] en los hechos investigados, esta Fiscalía concluye que la conducta desplegada configura una infracción [GRAVE/GRAVÍSIMA/LEVE] a los deberes funcionarios establecidos en el artículo [ARTÍCULO] del Estatuto Administrativo.

Que, para la determinación de la sanción procedente, se han tenido en especial consideración la gravedad de los hechos acreditados, el daño causado a la institución y a terceros, la conducta funcionaria anterior del inculpado/a, y las demás circunstancias atenuantes y agravantes concurrentes.

Que, en mérito de lo expuesto, esta Fiscalía propone sancionar a don/doña [NOMBRE_COMPLETO] con la medida disciplinaria de [SANCIÓN], de conformidad con lo establecido en el artículo 121 letra "[LETRA]" del DFL N°29 de 2005.`
  },
  {
    id:'p_valoracion',
    cat:'valoracion',
    label:'Valoración de la prueba',
    text:`Que, en cuanto a la prueba rendida en autos, esta Fiscalía la valora conforme a la sana crítica, esto es, mediante la aplicación de los principios de la lógica, las máximas de la experiencia y los conocimientos científicamente afianzados.

Que, del examen de la prueba rendida, se aprecia que los testimonios de los testigos [NOMBRES_TESTIGOS] son concordantes entre sí y con los antecedentes documentales del expediente, lo que otorga plena credibilidad a sus declaraciones.

Que, en contraste, los descargos del inculpado/a no han sido respaldados por elementos probatorios suficientes que permitan desvirtuar los hechos acreditados por la investigación, no siendo suficiente la mera negativa del imputado para enervar los cargos formulados en su contra.`
  },
  {
    id:'p_gravedad',
    cat:'analisis',
    label:'Gravedad de la infracción',
    text:`Que, respecto a la gravedad de la infracción imputada, cabe señalar que la conducta acreditada constituye una vulneración [GRAVE/LEVE/GRAVÍSIMA] a los principios de [PROBIDAD/BUENA FE/EFICIENCIA] que deben regir la actuación de los funcionarios públicos.

Que, la gravedad de los hechos se ve agravada por [CIRCUNSTANCIA_AGRAVANTE: la posición jerárquica del funcionario / el carácter reiterado de la conducta / el daño causado a la institución / la posición de confianza ejercida], lo que amerita una sanción proporcional a dicha gravedad.

Que, lo anterior, conforme a la doctrina de la Contraloría General de la República, constituye suficiente mérito para proponer la aplicación de la sanción disciplinaria solicitada (Dictamen CGR N°[NÚMERO]).`
  },
  {
    id:'p_atenuantes',
    cat:'eximentes',
    label:'Atenuantes y agravantes (Art. 121 EA)',
    text:`Que, para determinar la sanción procedente, se han analizado las circunstancias modificatorias de responsabilidad concurrentes en el presente caso.

ATENUANTES:
- [La conducta funcionaria anterior del inculpado/a ha sido irreprochable, sin registrar anotaciones en su hoja de vida]
- [La ambigüedad normativa existente en el período de los hechos generó incertidumbre razonable en el funcionario]
- [El funcionario colaboró con la investigación y reconoció los hechos oportunamente]

AGRAVANTES:
- [La posición jerárquica del funcionario implicaba una mayor responsabilidad institucional]
- [La conducta tuvo carácter reiterado, lo que denota dolo o negligencia inexcusable]
- [Se causó perjuicio concreto a la institución o a terceros]`
  },
  {
    id:'p_prescripcion',
    cat:'sobreseimiento',
    label:'Prescripción de la acción disciplinaria',
    text:`Que, en lo que respecta a la prescripción de la acción disciplinaria, cabe señalar que conforme al artículo 157 del D.F.L. N°29 de 2005, la acción disciplinaria prescribe en el plazo de cuatro años contados desde la fecha en que se hubiere incurrido en la falta.

Que, del análisis de los antecedentes del expediente, se advierte que los hechos investigados habrían ocurrido el [FECHA_HECHOS], habiendo transcurrido más de cuatro años desde dicha fecha hasta [FECHA_RESOLUCION_INCOATORIA], fecha en que se dictó la resolución que ordenó instruir el presente procedimiento disciplinario.

Que, en consecuencia, habiendo operado la prescripción de la acción disciplinaria, esta Fiscalía propone el sobreseimiento definitivo del procedimiento, de conformidad con el artículo 157 del Estatuto Administrativo.`
  },
  {
    id:'p_por_tanto_sancion',
    cat:'por_tanto',
    label:'Por Tanto — Sanción',
    text:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en los artículos 121 y 122 del D.F.L. N°29 del año 2005, y habiéndose acreditado la responsabilidad administrativa de don/doña [NOMBRE_COMPLETO], se propone al Sr. Rector, salvo su superior resolución:

Sancionar a don/doña [NOMBRE_COMPLETO], cédula de identidad N°[RUT], [CARGO_ESTAMENTO], con la medida disciplinaria contemplada en el artículo 121 letra "[LETRA]" del D.F.L. N°29 de 2005, [DESCRIPCIÓN_SANCIÓN].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución. Es todo cuanto tengo por informar.`
  },
  {
    id:'p_por_tanto_sob',
    cat:'por_tanto',
    label:'Por Tanto — Sobreseimiento',
    text:`P O R T A N T O, SE RESUELVE O SUGIERE:

Que teniendo en consideración lo preceptuado en el D.F.L. N°29 del año 2005, y [FUNDAMENTO_SOBRESEIMIENTO], se propone al Sr. Rector, salvo su superior resolución:

SOBRESEER [DEFINITIVA/TEMPORALMENTE] el presente procedimiento disciplinario [NÚMERO_ROL] instruido en contra de don/doña [NOMBRE_COMPLETO], cédula de identidad N°[RUT], [CARGO], por [CAUSAL_SOBRESEIMIENTO].

Remítanse los antecedentes y elévese el expediente al Sr. Rector para su Superior Resolución. Es todo cuanto tengo por informar.`
  },
  {
    id:'p_genero',
    cat:'genero',
    label:'Perspectiva de género',
    text:`Que, atendida la naturaleza de los hechos denunciados, que dicen relación con conductas constitutivas de [TIPO_VIOLENCIA], esta Fiscalía ha incorporado en su análisis la perspectiva de género conforme a la normativa vigente.

Que, en particular, se ha tenido en consideración: la Ley N°21.369 (acoso sexual en IES), la Ley N°21.643 (Ley Karin), y el Protocolo de Género UMAG (Decreto N°30/SU/2022).

Que, en la valoración de la prueba, se ha considerado el contexto de asimetría de poder entre las partes, las dinámicas propias de las situaciones de violencia de género, y la dificultad probatoria inherente a este tipo de conductas.

Que, se ha evitado incurrir en estereotipos de género que pudieran afectar la objetividad del análisis.`
  },
];

/* ── ESTADO DEL MÓDULO ── */
const parrafos = {
  selected: [],       // párrafos seleccionados para insertar
  customText: '',
  generating: false,
};

/* ── INTEGRACIÓN: openBiblioteca('parrafos') ORIGINAL ── */
// Override the original openBiblioteca function call for párrafos
const _origOpenBibliotecaParrafos = typeof openBiblioteca === 'function' ? openBiblioteca : null;

/* ── PANEL DE PÁRRAFOS EN F7 ── */
function buildParrafosPanel(caseContext) {
  const selectedHtml = parrafos.selected.length
    ? `<div class="parr-selected-header">📋 Párrafos seleccionados (${parrafos.selected.length})</div>
       <div class="parr-selected-list">
         ${parrafos.selected.map((id, idx) => {
           const p = PARRAFOS_DB.find(x => x.id === id);
           return p ? `<div class="parr-sel-item">
             <div class="parr-sel-num">${idx + 1}</div>
             <div class="parr-sel-label">${escHtml(p.label)}</div>
             <div style="display:flex;gap:4px">
               <button class="btn-sm" onclick="parrafosUseInChat('${id}')">→ Chat</button>
               <button class="btn-del" onclick="parrafosRemove('${idx}')">✕</button>
             </div>
           </div>` : '';
         }).join('')}
       </div>
       <button class="btn-save" style="width:100%;margin-bottom:14px" onclick="parrafosInsertAll()">✍️ Insertar todos en F7 →</button>`
    : '';

  return `<div style="width:100%;max-width:700px">
    <div class="parr-header">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">📝 Párrafos Modelo — Vista Fiscal</div>
      <div style="font-size:11.5px;color:var(--text-dim)">Selecciona párrafos tipo para incorporar a tu informe. Los placeholders [MAYÚSCULAS] deben reemplazarse con los datos del caso.</div>
    </div>
    ${selectedHtml}
    <div class="parr-ai-section">
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim);font-family:'DM Mono',monospace;margin-bottom:6px">Generar párrafo con IA</div>
      <div style="display:flex;gap:7px">
        <input id="parrAiInput" class="search-box" style="flex:1" placeholder="Ej: párrafo sobre prescripción con fecha 15-03-2022…"/>
        <button class="btn-save" onclick="generateParrafoIA()" style="padding:6px 12px;white-space:nowrap" ${parrafos.generating?'disabled':''}>
          ${parrafos.generating ? '⏳' : '✨ Generar'}
        </button>
      </div>
    </div>
    ${PARRAFOS_CATS.map(cat => {
      const catParrs = PARRAFOS_DB.filter(p => p.cat === cat.id);
      if (!catParrs.length) return '';
      return `<div class="parr-cat-section">
        <div class="parr-cat-label" style="border-color:${cat.color};color:${cat.color}">${cat.label}</div>
        ${catParrs.map(p => `
          <div class="parr-item ${parrafos.selected.includes(p.id) ? 'selected' : ''}" onclick="toggleParrafo('${p.id}')">
            <div class="parr-item-header">
              <span class="parr-item-label">${escHtml(p.label)}</span>
              <div style="display:flex;gap:5px">
                <button class="btn-sm" onclick="event.stopPropagation();parrafosUseInChat('${p.id}')" title="Insertar en chat">→ Chat</button>
                <button class="btn-sm" onclick="event.stopPropagation();copyParrafo('${p.id}')" title="Copiar">📋</button>
              </div>
            </div>
            <div class="parr-item-preview">${escHtml(p.text.substring(0, 180))}…</div>
          </div>`).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

/* ── ACCIONES DE PÁRRAFOS ── */
function toggleParrafo(id) {
  const idx = parrafos.selected.indexOf(id);
  if (idx === -1) parrafos.selected.push(id);
  else parrafos.selected.splice(idx, 1);
  // Re-render panel if visible
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);
}

function parrafosRemove(idx) {
  parrafos.selected.splice(idx, 1);
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);
}

function parrafosUseInChat(id) {
  const p = PARRAFOS_DB.find(x => x.id === id);
  if (!p) return;
  // Navigate to chat tab and prefill
  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = `Adapta el siguiente párrafo modelo al expediente${currentCase ? ' ' + currentCase.name : ''}. Reemplaza los placeholders con los datos reales:\n\n${p.text}`;
  }
  // Make sure we're in F7
  if (activeFn !== 'F7') pickFn && pickFn('F7');
  showTab && showTab('tabChat');
  showToast(`✓ Párrafo "${p.label}" enviado al chat`);
}

function parrafosInsertAll() {
  const texts = parrafos.selected.map(id => {
    const p = PARRAFOS_DB.find(x => x.id === id);
    return p ? `## ${p.label}\n\n${p.text}` : '';
  }).filter(Boolean).join('\n\n---\n\n');

  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = `Adapta e integra los siguientes párrafos modelo al expediente${currentCase ? ' ' + currentCase.name : ''}. Reemplaza todos los placeholders [MAYÚSCULAS] con los datos reales del caso y redacta el texto refundido:\n\n${texts}`;
  }
  if (activeFn !== 'F7') pickFn && pickFn('F7');
  showTab && showTab('tabChat');
  showToast(`✓ ${parrafos.selected.length} párrafos enviados al chat`);
}

function copyParrafo(id) {
  const p = PARRAFOS_DB.find(x => x.id === id);
  if (!p) return;
  navigator.clipboard.writeText(p.text).then(() => showToast(`✓ "${p.label}" copiado`));
}

async function generateParrafoIA() {
  const input = document.getElementById('parrAiInput');
  const query = input?.value.trim();
  if (!query) return;

  parrafos.generating = true;
  const panel = document.getElementById('parrafosPanel');
  if (panel) panel.innerHTML = buildParrafosPanel(currentCase);

  try {
    const ctx = currentCase ? `Expediente: ${currentCase.name}${currentCase.description ? ' · ' + currentCase.description.substring(0, 200) : ''}` : '';
    const resp = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `Eres Fiscalito. Generas párrafos para Vistas Fiscales de procedimientos disciplinarios UMAG. Usa lenguaje formal institucional, citas normativas precisas (DFL N°29, EA, etc.) y estructura "Que," al inicio de cada párrafo. Usa placeholders [MAYÚSCULAS] para datos específicos que el usuario debe completar.`,
        messages: [{ role: 'user', content: `${ctx ? ctx + '\n\n' : ''}Genera el párrafo: ${query}` }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    // Add to custom list
    const newParr = {
      id: 'custom_' + Date.now(),
      cat: 'analisis',
      label: query.substring(0, 60),
      text,
    };
    PARRAFOS_DB.push(newParr);
    parrafos.selected.push(newParr.id);
    showToast('✓ Párrafo generado y agregado');
    if (input) input.value = '';
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    parrafos.generating = false;
    const panel2 = document.getElementById('parrafosPanel');
    if (panel2) panel2.innerHTML = buildParrafosPanel(currentCase);
  }
}

/* ── INYECCIÓN EN openBiblioteca('parrafos') ── */
// This patches the original openBiblioteca so 'parrafos' tab loads this panel
document.addEventListener('DOMContentLoaded', () => {
  const origOB = window.openBiblioteca;
  window.openBiblioteca = function(tipo) {
    if (tipo === 'parrafos') {
      document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
      event?.currentTarget?.classList.add('active');
      currentCase = window.currentCase || null;
      // Open biblioteca view and switch to parrafos tab
      if (typeof showView === 'function') showView('viewBiblioteca');
      if (typeof biblioteca !== 'undefined') {
        biblioteca.activeTab = 'parrafos';
        const body = document.getElementById('bibBody');
        if (body) body.innerHTML = renderBibParrafos();
        document.querySelectorAll('.bib-tab').forEach((t, i) => {
          const tabs = ['documentos','normas','parrafos','chat'];
          t.classList.toggle('active', tabs[i] === 'parrafos');
        });
      }
      return;
    }
    if (origOB) origOB.call(this, tipo);
  };
});

/* ── PANEL F7 — AGREGAR BOTÓN DE PÁRRAFOS ── */
// Adds a "Párrafos Modelo" toggle button to F7 panel
const _origF7Panel = null;

document.addEventListener('DOMContentLoaded', () => {
  const origSFP = window.showFnPanel;
  window.showFnPanel = function(code) {
    // Call original first
    if (code !== 'F11') { // F11 handled by transcripcion module
      origSFP && origSFP.call(this, code);
    }
    // After F7 renders, append párrafos button
    if (code === 'F7') {
      setTimeout(() => {
        const panel = document.getElementById('fnPanel');
        if (!panel) return;
        // Add párrafos section at end of panel
        const parrafosToggle = document.createElement('div');
        parrafosToggle.style.cssText = 'width:100%;max-width:700px;margin-top:4px;';
        parrafosToggle.innerHTML = `
          <button class="fn-panel-link" style="width:100%;justify-content:space-between;cursor:pointer"
            onclick="toggleParrafosPanel(this)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px">📝</span>
              <span style="font-size:11.5px;color:var(--text-dim)">Párrafos Modelo para Vista Fiscal</span>
            </div>
            <span style="font-size:11px;color:var(--gold);font-weight:500">Ver párrafos →</span>
          </button>
          <div id="parrafosPanel" style="display:none"></div>`;
        panel.appendChild(parrafosToggle);
      }, 50);
    }
  };
});

function toggleParrafosPanel(btn) {
  const panel = document.getElementById('parrafosPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) panel.innerHTML = buildParrafosPanel(currentCase);
  btn.querySelector('span:last-child').textContent = isOpen ? 'Ver párrafos →' : 'Ocultar párrafos ↑';
}

/* ── ESTILOS ── */
(function injectParrafosCSS() {
  const style = document.createElement('style');
  style.textContent = `
.parr-header{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;}
.parr-ai-section{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;}
.parr-cat-section{margin-bottom:14px;}
.parr-cat-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;padding:3px 0;border-bottom:2px solid;margin-bottom:6px;font-family:'DM Mono',monospace;}
.parr-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:9px 12px;margin-bottom:5px;cursor:pointer;transition:all .15s;}
.parr-item:hover{border-color:var(--gold-dim);}
.parr-item.selected{background:var(--gold-glow);border-color:var(--gold-dim);}
.parr-item-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.parr-item-label{font-size:12px;font-weight:500;color:var(--text);}
.parr-item-preview{font-size:10.5px;color:var(--text-muted);line-height:1.5;}
.parr-selected-header{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-dim);font-family:'DM Mono',monospace;margin-bottom:6px;}
.parr-selected-list{display:flex;flex-direction:column;gap:4px;margin-bottom:8px;}
.parr-sel-item{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);}
.parr-sel-num{width:18px;height:18px;border-radius:50%;background:var(--gold);color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.parr-sel-label{flex:1;font-size:11.5px;font-weight:500;color:var(--gold);}
`;
  document.head.appendChild(style);
})();
