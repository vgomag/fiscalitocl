/**
 * MOD-OFICIOS.JS
 * ──────────────
 * Sistema de generación de Oficios, Memorándums y Resoluciones
 * con numeración correlativa, formato personalizable y export a Word.
 * Dependencias: supabaseClient (sb), mod-export-word.js (WORD_FORMAT helpers)
 */
(function(){
"use strict";

/* ══════════════════════════════════════════
   ESTADO DEL MÓDULO
   ══════════════════════════════════════════ */
const oficios = {
  counters: {},        // { oficio: {last_number, prefix, format_template}, memo: {...}, resolucion: {...} }
  history: [],         // Últimos docs generados
  currentType: 'oficio',
  loaded: false,
};
window._oficiosState = oficios;

/* ══════════════════════════════════════════
   CARGAR CONTADORES DESDE SUPABASE
   ══════════════════════════════════════════ */
async function loadDocCounters() {
  if (!window.session) return;
  const year = new Date().getFullYear();
  try {
    const { data, error } = await sb.from('document_counters')
      .select('doc_type,last_number,prefix,format_template')
      .eq('user_id', session.user.id)
      .eq('year', year);
    if (error) { console.warn('loadDocCounters:', error); return; }
    // Defaults
    oficios.counters = {
      oficio:     { last_number: 0, prefix: 'OF',   format_template: '{PREFIX}-{NUM}/{YEAR}' },
      memo:       { last_number: 0, prefix: 'MEMO', format_template: '{PREFIX}-{NUM}/{YEAR}' },
      resolucion: { last_number: 0, prefix: 'RES',  format_template: '{PREFIX}-{NUM}/{YEAR}' },
    };
    if (data) {
      data.forEach(d => {
        oficios.counters[d.doc_type] = {
          last_number: d.last_number,
          prefix: d.prefix,
          format_template: d.format_template,
        };
      });
    }
    oficios.loaded = true;
  } catch (e) { console.warn('loadDocCounters error:', e); }
}

/* ══════════════════════════════════════════
   OBTENER SIGUIENTE NÚMERO (VÍA RPC ATÓMICA)
   ══════════════════════════════════════════ */
async function getNextDocNumber(docType) {
  if (!window.session) throw new Error('Sin sesión');
  const year = new Date().getFullYear();
  const { data, error } = await sb.rpc('next_doc_number', {
    p_user_id: session.user.id,
    p_doc_type: docType,
    p_year: year,
  });
  if (error) throw error;
  if (!data || !data.length) throw new Error('Sin respuesta de next_doc_number');
  // Actualizar estado local
  if (oficios.counters[docType]) {
    oficios.counters[docType].last_number = data[0].next_number;
  }
  return { number: data[0].next_number, formatted: data[0].formatted };
}

/* ══════════════════════════════════════════
   PREVISUALIZAR NÚMERO (SIN CONSUMIR)
   ══════════════════════════════════════════ */
function previewNextNumber(docType) {
  const c = oficios.counters[docType];
  if (!c) return '—';
  const next = c.last_number + 1;
  const year = new Date().getFullYear();
  let fmt = c.format_template || '{PREFIX}-{NUM}/{YEAR}';
  fmt = fmt.replace('{PREFIX}', c.prefix);
  fmt = fmt.replace('{NUM}', String(next).padStart(3, '0'));
  fmt = fmt.replace('{YEAR}', year);
  return fmt;
}

/* ══════════════════════════════════════════
   GUARDAR DOCUMENTO GENERADO
   ══════════════════════════════════════════ */
async function saveGeneratedDoc(docType, docNumber, sequential, title, destinatario, content, metadata = {}) {
  if (!window.session) return;
  const year = new Date().getFullYear();
  const caseId = window.currentCase?.id || null;
  const { error } = await sb.from('generated_documents').insert({
    user_id: session.user.id,
    case_id: caseId,
    doc_type: docType,
    doc_number: docNumber,
    sequential: sequential,
    year: year,
    title: title,
    destinatario: destinatario,
    content: content,
    metadata: metadata,
  });
  if (error) console.warn('saveGeneratedDoc:', error);
}

/* ══════════════════════════════════════════
   CARGAR HISTORIAL DE DOCUMENTOS
   ══════════════════════════════════════════ */
async function loadDocHistory() {
  if (!window.session) return [];
  const year = new Date().getFullYear();
  const { data, error } = await sb.from('generated_documents')
    .select('id,doc_type,doc_number,sequential,title,destinatario,created_at,case_id')
    .eq('user_id', session.user.id)
    .eq('year', year)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('loadDocHistory:', error); return []; }
  oficios.history = data || [];
  return oficios.history;
}

/* ══════════════════════════════════════════
   RENDER PANEL F12
   ══════════════════════════════════════════ */
async function renderF12Panel() {
  const panel = document.getElementById('fnPanel');
  if (!panel) return;

  if (!oficios.loaded) await loadDocCounters();

  const nextOf  = previewNextNumber('oficio');
  const nextMem = previewNextNumber('memo');
  const nextRes = previewNextNumber('resolucion');

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="padding:16px;max-width:700px">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--gold),#d97706);display:flex;align-items:center;justify-content:center;font-size:18px">📨</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">Oficios, Memos y Resoluciones</div>
          <div style="font-size:12px;color:var(--text-dim)">Generación con numeración correlativa automática</div>
        </div>
      </div>

      <!-- Contadores actuales -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('oficio')" id="oficioCard_oficio">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Oficio</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_oficio">${nextOf}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('memo')" id="oficioCard_memo">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Memorándum</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_memo">${nextMem}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('resolucion')" id="oficioCard_resolucion">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Resolución</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_resolucion">${nextRes}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
      </div>

      <!-- Formulario rápido -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px" id="oficioFormArea">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">📝 Datos del documento <span style="font-size:11px;color:var(--text-muted);font-weight:400">(opcional — también puedes escribir directamente en el chat)</span></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Tipo</label>
            <select id="oficioType" onchange="oficioSelectType(this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px">
              <option value="oficio">Oficio</option>
              <option value="memo">Memorándum</option>
              <option value="resolucion">Resolución</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Destinatario / A:</label>
            <input id="oficioDestinatario" type="text" placeholder="Nombre, cargo o unidad" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;box-sizing:border-box"/>
          </div>
        </div>

        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Asunto / Materia</label>
          <input id="oficioAsunto" type="text" placeholder="Ej: Notificación resultado investigación sumaria" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;box-sizing:border-box"/>
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Instrucciones adicionales <span style="color:var(--text-muted)">(opcional)</span></label>
          <textarea id="oficioInstrucciones" rows="2" placeholder="Ej: Tono formal, mencionar resolución exenta N°123, incluir plazo de 5 días hábiles..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea>
        </div>

        <button onclick="generarOficioConFormulario()" style="width:100%;padding:8px 16px;background:var(--gold);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
          📨 Generar con número correlativo
        </button>
      </div>

      <!-- Configuración de formato -->
      <details style="margin-bottom:12px">
        <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none">⚙️ Configurar formato de numeración</summary>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            ${['oficio','memo','resolucion'].map(t => {
              const c = oficios.counters[t] || {};
              return `<div>
                <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">${t.charAt(0).toUpperCase()+t.slice(1)} — Prefijo</label>
                <input id="oficioPrefix_${t}" value="${c.prefix||''}" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:11px;box-sizing:border-box"/>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Plantilla de formato</label>
            <select id="oficioFormatTemplate" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:11px" onchange="oficioPreviewFormats()">
              <option value="{PREFIX}-{NUM}/{YEAR}">{PREFIX}-001/2026</option>
              <option value="{NUM}-{YEAR}-{PREFIX}">001-2026-{PREFIX}</option>
              <option value="{PREFIX} N° {NUM}/{YEAR}">{PREFIX} N° 001/2026</option>
              <option value="{PREFIX} {NUM}/{YEAR}">{PREFIX} 001/2026</option>
            </select>
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px" id="oficioFormatPreview">Vista previa: ${nextOf}</div>
          <button onclick="saveDocFormats()" style="padding:5px 14px;background:var(--gold);color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">Guardar formato</button>
        </div>
      </details>

      <!-- Historial de documentos -->
      <details>
        <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none" onclick="oficioLoadHistory()">📋 Historial de documentos generados</summary>
        <div id="oficioHistoryList" style="margin-top:8px;max-height:250px;overflow-y:auto">
          <div style="font-size:11px;color:var(--text-muted);padding:8px">Cargando...</div>
        </div>
      </details>
    </div>
  `;

  // Marcar tipo activo
  oficioSelectType(oficios.currentType || 'oficio');
}

/* ══════════════════════════════════════════
   SELECCIONAR TIPO DE DOCUMENTO
   ══════════════════════════════════════════ */
window.oficioSelectType = function(type) {
  oficios.currentType = type;
  ['oficio','memo','resolucion'].forEach(t => {
    const card = document.getElementById('oficioCard_' + t);
    if (card) {
      card.style.borderColor = t === type ? 'var(--gold)' : 'var(--border)';
      card.style.background = t === type ? 'var(--gold-glow, rgba(217,119,6,.08))' : 'var(--surface2)';
    }
  });
  const sel = document.getElementById('oficioType');
  if (sel) sel.value = type;
};

/* ══════════════════════════════════════════
   GENERAR DOCUMENTO DESDE FORMULARIO
   ══════════════════════════════════════════ */
window.generarOficioConFormulario = function() {
  const type = document.getElementById('oficioType')?.value || 'oficio';
  const dest = document.getElementById('oficioDestinatario')?.value.trim() || '';
  const asunto = document.getElementById('oficioAsunto')?.value.trim() || '';
  const instrucciones = document.getElementById('oficioInstrucciones')?.value.trim() || '';

  if (!asunto) {
    showToast('⚠️ Ingresa al menos el asunto del documento');
    return;
  }

  const tipoLabel = { oficio: 'oficio', memo: 'memorándum', resolucion: 'resolución' }[type] || type;
  const nextNum = previewNextNumber(type);

  let prompt = `Genera un ${tipoLabel} con número correlativo ${nextNum}.`;
  if (dest) prompt += `\nDestinatario: ${dest}`;
  prompt += `\nAsunto/Materia: ${asunto}`;
  if (instrucciones) prompt += `\nInstrucciones adicionales: ${instrucciones}`;
  if (window.currentCase) prompt += `\nExpediente vinculado: ${currentCase.name} (${currentCase.materia || '—'})`;

  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = prompt;
    sendMessage();
  }
};

/* ══════════════════════════════════════════
   PREVISUALIZAR FORMATOS
   ══════════════════════════════════════════ */
window.oficioPreviewFormats = function() {
  const tpl = document.getElementById('oficioFormatTemplate')?.value || '{PREFIX}-{NUM}/{YEAR}';
  const year = new Date().getFullYear();
  const preview = document.getElementById('oficioFormatPreview');
  if (!preview) return;

  const examples = ['oficio','memo','resolucion'].map(t => {
    const c = oficios.counters[t] || {};
    const pfx = document.getElementById('oficioPrefix_' + t)?.value || c.prefix || t.toUpperCase().slice(0,3);
    let f = tpl.replace('{PREFIX}', pfx).replace('{NUM}', '001').replace('{YEAR}', year);
    return f;
  });
  preview.textContent = 'Vista previa: ' + examples.join(' · ');
};

/* ══════════════════════════════════════════
   GUARDAR CONFIGURACIÓN DE FORMATOS
   ══════════════════════════════════════════ */
window.saveDocFormats = async function() {
  if (!window.session) return;
  const tpl = document.getElementById('oficioFormatTemplate')?.value || '{PREFIX}-{NUM}/{YEAR}';
  const year = new Date().getFullYear();

  for (const t of ['oficio','memo','resolucion']) {
    const pfx = document.getElementById('oficioPrefix_' + t)?.value.trim() || oficios.counters[t]?.prefix || '';
    const { error } = await sb.from('document_counters').upsert({
      user_id: session.user.id,
      doc_type: t,
      year: year,
      last_number: oficios.counters[t]?.last_number || 0,
      prefix: pfx,
      format_template: tpl,
    }, { onConflict: 'user_id,doc_type,year' });
    if (error) { console.warn('saveDocFormats:', error); showToast('⚠️ Error guardando formato'); return; }
    oficios.counters[t] = { ...oficios.counters[t], prefix: pfx, format_template: tpl };
  }
  showToast('✓ Formato de numeración guardado');

  // Actualizar previews
  ['oficio','memo','resolucion'].forEach(t => {
    const el = document.getElementById('oficioNext_' + t);
    if (el) el.textContent = previewNextNumber(t);
  });
};

/* ══════════════════════════════════════════
   CARGAR Y RENDERIZAR HISTORIAL
   ══════════════════════════════════════════ */
window.oficioLoadHistory = async function() {
  const container = document.getElementById('oficioHistoryList');
  if (!container) return;
  container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px">Cargando...</div>';

  const history = await loadDocHistory();
  if (!history.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px">No hay documentos generados este año.</div>';
    return;
  }

  const typeIcons = { oficio: '📨', memo: '📋', resolucion: '📜' };
  container.innerHTML = history.map(d => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px">
      <span>${typeIcons[d.doc_type] || '📄'}</span>
      <span style="font-weight:600;color:var(--gold);min-width:90px">${d.doc_number}</span>
      <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.title || '(sin título)'}</span>
      <span style="color:var(--text-muted);font-size:10px;white-space:nowrap">${new Date(d.created_at).toLocaleDateString('es-CL')}</span>
    </div>
  `).join('');
};

/* ══════════════════════════════════════════
   ASIGNAR NÚMERO AL DOCUMENTO (POST-GENERACIÓN)
   — Llamada desde sendMessage cuando el IA genera un oficio/memo/res
   ══════════════════════════════════════════ */
window.assignDocNumber = async function(docType, title, destinatario, content) {
  try {
    const { number, formatted } = await getNextDocNumber(docType);
    await saveGeneratedDoc(docType, formatted, number, title, destinatario, content);

    // Actualizar UI
    const el = document.getElementById('oficioNext_' + docType);
    if (el) el.textContent = previewNextNumber(docType);

    showToast(`✓ Documento ${formatted} registrado`);
    return { number, formatted };
  } catch (e) {
    console.warn('assignDocNumber error:', e);
    showToast('⚠️ Error asignando número correlativo');
    return null;
  }
};

/* ══════════════════════════════════════════
   EXPORT A WORD — OFICIO / MEMO / RESOLUCIÓN
   ══════════════════════════════════════════ */
window.exportOficioToWord = async function(buttonEl) {
  const msgBub = buttonEl?.closest('.msg')?.querySelector('.msg-bub');
  if (!msgBub) { showToast('⚠ No se encontró el texto'); return; }
  const text = msgBub.innerText;
  if (!text || text.length < 30) { showToast('⚠ Texto muy corto para exportar'); return; }

  showToast('📄 Generando Word…');

  try {
    // Lazy load docx
    const DOCX_CDN = "https://unpkg.com/docx@9.0.2/build/index.umd.js";
    if (!window.docx) {
      await new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${DOCX_CDN}"]`)) {
          const check = () => window.docx ? resolve() : setTimeout(check, 100);
          check(); return;
        }
        const s = document.createElement('script');
        s.src = DOCX_CDN;
        s.onload = () => { const c = () => window.docx ? resolve() : setTimeout(c, 100); c(); };
        s.onerror = () => reject(new Error('No se pudo cargar docx'));
        document.head.appendChild(s);
      });
    }

    const D = window.docx;
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber, ImageRun } = D;

    // Detect doc type from content
    const isOficio = /oficio|OF-\d/i.test(text.substring(0, 200));
    const isMemo = /memor[aá]nd|MEMO-\d/i.test(text.substring(0, 200));
    const isResolucion = /resoluci[oó]n|RES-\d|RESUELVO|CONSIDERANDO/i.test(text.substring(0, 500));

    const docTitle = isOficio ? 'Oficio' : isMemo ? 'Memorándum' : isResolucion ? 'Resolución' : 'Documento';

    // Parse text into paragraphs
    const lines = text.split('\n').filter(l => l.trim());
    const children = [];

    // Add institutional header
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60, line: 276 },
      children: [new TextRun({ text: 'UNIVERSIDAD DE MAGALLANES', bold: true, font: 'Arial', size: 24, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: 276 },
      children: [new TextRun({ text: 'Fiscalía de Procesos Disciplinarios', font: 'Arial', size: 20, color: '444444', italics: true })],
    }));

    // Separator line
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', font: 'Arial', size: 16, color: 'B8860B' })],
    }));

    // Process body lines
    lines.forEach(line => {
      const trimmed = line.trim();
      // Headers (all caps or bold markers)
      const isHeader = /^(OFICIO|MEMORÁNDUM|MEMORANDUM|RESOLUCIÓN|RESOLUCION|DE:|PARA:|A:|MAT\.?:|MATERIA:|REF\.?:|REFERENCIA:|FECHA:|ANT\.?:|ANTECEDENTES:|DISTRIBUCIÓN:|VISTOS?:|CONSIDERANDO|POR TANTO|RESUELVO|ANÓTESE|COMUNÍQUESE)/i.test(trimmed);

      if (isHeader) {
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 180, after: 80, line: 360 },
          children: [new TextRun({ text: trimmed, bold: true, font: 'Arial', size: 22, color: '000000' })],
        }));
      } else {
        // Check for field patterns like "DE: xxx" or "PARA: xxx"
        const fieldMatch = trimmed.match(/^(DE|PARA|A|MAT|MATERIA|REF|REFERENCIA|FECHA|ANT|ANTECEDENTES)\s*[:.]\s*(.*)/i);
        if (fieldMatch) {
          children.push(new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 60, after: 60, line: 360 },
            children: [
              new TextRun({ text: fieldMatch[1].toUpperCase() + ': ', bold: true, font: 'Arial', size: 22, color: '000000' }),
              new TextRun({ text: fieldMatch[2], font: 'Arial', size: 22, color: '000000' }),
            ],
          }));
        } else {
          // Normal paragraph
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 120, line: 360 },
            indent: { firstLine: 720 },
            children: [new TextRun({ text: trimmed, font: 'Arial', size: 22, color: '000000' })],
          }));
        }
      }
    });

    // Signature block
    children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 0 },
      children: [new TextRun({ text: '________________________________________', font: 'Arial', size: 22, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'Fiscal/a Investigador/a', bold: true, font: 'Arial', size: 22, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'Universidad de Magallanes', font: 'Arial', size: 20, color: '444444' })],
    }));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 18720 },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1701 },
          },
        },
        children: children,
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', font: 'Arial', size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '999999' }),
              ],
            })],
          }),
        },
      }],
    });

    const blob = await Packer.toBlob(doc);
    const filename = `${docTitle}_${new Date().toISOString().slice(0,10)}.docx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast('✓ ' + filename + ' descargado');

  } catch (e) {
    console.error('exportOficioToWord:', e);
    showToast('⚠️ Error generando Word: ' + e.message);
  }
};

/* ══════════════════════════════════════════
   CHIPS F12
   ══════════════════════════════════════════ */
window.buildF12Chips = function() {
  const row = document.getElementById('fnChipsRow');
  if (!row) return;
  const chips = [
    'Oficio de notificación',
    'Memo interno',
    'Oficio remisorio de antecedentes',
    'Resolución exenta',
    'Oficio a Contraloría',
    'Comunicación de resultado',
    'Memo citación a declarar',
  ];
  row.innerHTML = chips.map(c => `<button class="fn-chip" onclick="setFnQuery('${c}')">${c}</button>`).join('');
};

/* ══════════════════════════════════════════
   ASIGNAR NÚMERO + EXPORTAR A WORD (COMBINADO)
   ══════════════════════════════════════════ */
window.oficioAssignAndExport = async function(buttonEl) {
  const msgBub = buttonEl?.closest('.msg')?.querySelector('.msg-bub');
  if (!msgBub) { showToast('⚠ No se encontró el texto'); return; }
  const text = msgBub.innerText;
  if (!text || text.length < 30) { showToast('⚠ Texto muy corto'); return; }

  // Detectar tipo de documento
  let detectedType = 'oficio';
  if (/memor[aá]nd|MEMO/i.test(text.substring(0, 300))) detectedType = 'memo';
  else if (/resoluci[oó]n|RESUELVO|CONSIDERANDO/i.test(text.substring(0, 500))) detectedType = 'resolucion';

  // Si el usuario tiene un tipo seleccionado en el formulario, usarlo
  const formType = document.getElementById('oficioType')?.value;
  if (formType) detectedType = formType;

  buttonEl.disabled = true;
  buttonEl.textContent = '⏳ Asignando…';

  try {
    // 1. Asignar número correlativo
    const result = await assignDocNumber(
      detectedType,
      document.getElementById('oficioAsunto')?.value || text.substring(0, 100).replace(/\n/g, ' '),
      document.getElementById('oficioDestinatario')?.value || '',
      text
    );

    if (result) {
      // 2. Actualizar el texto del mensaje con el número real (reemplazar placeholder)
      const numPattern = /(?:OF|MEMO|RES)-\d{3}\/\d{4}/;
      if (numPattern.test(msgBub.innerText)) {
        // Ya tiene un número placeholder — no reemplazar para no perder formato
      }
      // Mostrar badge con el número asignado
      const badge = document.createElement('div');
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--gold);color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px';
      badge.textContent = '✓ ' + result.formatted;
      msgBub.appendChild(badge);
    }

    // 3. Exportar a Word
    await exportOficioToWord(buttonEl);

    buttonEl.textContent = '✓ Listo';
    buttonEl.style.background = 'var(--green, #22c55e)';
  } catch (e) {
    console.error('oficioAssignAndExport:', e);
    showToast('⚠️ Error: ' + e.message);
    buttonEl.textContent = '📨 Asignar N° y Word';
    buttonEl.disabled = false;
  }
};

/* ══════════════════════════════════════════
   EXPONER FUNCIONES
   ══════════════════════════════════════════ */
window.renderF12Panel = renderF12Panel;
window.loadDocCounters = loadDocCounters;
window.previewNextNumber = previewNextNumber;

})();
