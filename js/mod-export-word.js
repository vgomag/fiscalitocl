/**
 * MOD-EXPORT-WORD.JS
 * ──────────────────
 * Exportación a Word (.docx) de Actas de Transcripción y Vistas Fiscales.
 * Formato: Folio (8.5"x13"), Arial 11pt, justificado, espaciado 1.5, negro.
 * Dependencia: docx (CDN cargada en index.html)
 */

/* ── Esperar a que docx esté disponible ── */
function _waitDocx(){
  return new Promise((resolve,reject)=>{
    if(window.docx)return resolve(window.docx);
    let tries=0;
    const check=()=>{
      if(window.docx)return resolve(window.docx);
      if(++tries>50)return reject(new Error('Librería docx no cargada'));
      setTimeout(check,100);
    };check();
  });
}

/* ══════════════════════════════════════════
   CONSTANTES DE FORMATO
   ══════════════════════════════════════════ */
const WORD_FORMAT = {
  /* Folio: 8.5" x 13" en DXA (1 inch = 1440 DXA) */
  pageWidth: 12240,   // 8.5"
  pageHeight: 18720,  // 13"
  /* Márgenes: 1" arriba/abajo, 1.18" izq/der (aprox. 3cm) */
  marginTop: 1440,
  marginBottom: 1440,
  marginLeft: 1701,   // ~3cm
  marginRight: 1701,  // ~3cm
  /* Tipografía */
  font: 'Arial',
  fontSize: 22,       // 11pt (en half-points)
  fontColor: '000000',
  /* Espaciado 1.5 líneas = 360 (en 240ths of a line) */
  lineSpacing: 360,
  /* Justificado */
  alignment: 'both',  // AlignmentType.JUSTIFIED
};

/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */

/* Parsear texto con formato básico: **negrita**, saltos de línea, encabezados */
function parseTextToRuns(text, docxLib) {
  const { TextRun } = docxLib;
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({
        text: part.slice(2, -2),
        bold: true,
        font: WORD_FORMAT.font,
        size: WORD_FORMAT.fontSize,
        color: WORD_FORMAT.fontColor,
      }));
    } else if (part.trim()) {
      runs.push(new TextRun({
        text: part,
        font: WORD_FORMAT.font,
        size: WORD_FORMAT.fontSize,
        color: WORD_FORMAT.fontColor,
      }));
    }
  });
  return runs;
}

/* Crear párrafo estándar */
function makePara(text, docxLib, options = {}) {
  const { Paragraph, AlignmentType } = docxLib;
  const align = options.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED;
  return new Paragraph({
    alignment: align,
    spacing: {
      line: options.spacing || WORD_FORMAT.lineSpacing,
      before: options.before || 0,
      after: options.after || 120,
    },
    indent: options.indent ? { firstLine: 720 } : undefined,
    children: parseTextToRuns(text, docxLib),
  });
}

/* Crear título/encabezado */
function makeHeading(text, docxLib, level) {
  const { Paragraph, TextRun, AlignmentType } = docxLib;
  const sizes = { 1: 28, 2: 24, 3: 22 }; // 14pt, 12pt, 11pt
  return new Paragraph({
    alignment: level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: level === 1 ? 240 : 180, after: 120, line: WORD_FORMAT.lineSpacing },
    children: [new TextRun({
      text: text,
      bold: true,
      font: WORD_FORMAT.font,
      size: sizes[level] || WORD_FORMAT.fontSize,
      color: WORD_FORMAT.fontColor,
    })],
  });
}

/* Línea de firma */
function makeSignatureLine(name, role, docxLib) {
  const { Paragraph, TextRun, AlignmentType } = docxLib;
  const children = [];
  // Línea
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 0, line: WORD_FORMAT.lineSpacing },
    children: [new TextRun({
      text: '________________________________________',
      font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor,
    })],
  }));
  // Nombre
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: WORD_FORMAT.lineSpacing },
    children: [new TextRun({
      text: name || '[NOMBRE]',
      bold: true,
      font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor,
    })],
  }));
  // Rol
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120, line: WORD_FORMAT.lineSpacing },
    children: [new TextRun({
      text: role || '[ROL]',
      font: WORD_FORMAT.font, size: 20, color: WORD_FORMAT.fontColor,
    })],
  }));
  return children;
}

/* ══════════════════════════════════════════
   EXPORTAR ACTA DE TRANSCRIPCIÓN
   ══════════════════════════════════════════ */
async function exportActaToWord() {
  const text = transcripcion.structuredText || transcripcion.rawText;
  if (!text) { showToast('⚠ Sin texto para exportar'); return; }

  showToast('📄 Generando Word…');
  try {
    const d = await _waitDocx();
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber } = d;

    const caseRef = transcripcion.linkedCase || (typeof currentCase !== 'undefined' ? currentCase : null);
    const mt = transcripcion.meta || {};
    const fechaStr = mt.fecha ? new Date(mt.fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const tipoActa = { testigo: 'DECLARACIÓN DE TESTIGO', denunciante: 'RATIFICACIÓN DE DENUNCIA', denunciado: 'DECLARACIÓN DE PERSONA DENUNCIADA', otro: 'DILIGENCIA' }[mt.tipoDeclarante] || 'DECLARACIÓN';
    const audioName = transcripcion.audioFile?.name || 'audio';

    /* Build document content */
    const children = [];

    /* Encabezado institucional */
    children.push(makePara('UNIVERSIDAD DE MAGALLANES', d, { center: true, bold: true }));
    children.push(makeHeading('ACTA DE ' + tipoActa, d, 1));

    if (caseRef) {
      children.push(makePara(`Expediente: ${caseRef.name || '[EXPEDIENTE]'}  —  ROL: ${caseRef.rol || '[ROL]'}`, d, { center: true }));
      children.push(makePara(`Procedimiento: ${caseRef.tipo_procedimiento || '[TIPO]'}  —  Materia: ${caseRef.materia || '[MATERIA]'}`, d, { center: true }));
    }
    if (mt.nombreDeclarante) {
      children.push(makePara(`Declarante: ${mt.nombreDeclarante}`, d, { center: true }));
    }

    children.push(makePara(`${mt.lugar || 'Punta Arenas'}, ${fechaStr}`, d, { center: true, after: 240 }));
    children.push(makePara('', d)); // Línea vacía

    /* Cuerpo de la declaración */
    const paragraphs = text.split('\n').filter(p => p.trim());
    paragraphs.forEach(p => {
      const trimmed = p.trim();
      /* Detectar preguntas (líneas que terminan en ?) */
      if (trimmed.endsWith('?') || trimmed.startsWith('PREGUNTA') || trimmed.startsWith('P:') || trimmed.match(/^\d+[\.\)]/)) {
        children.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 180, after: 60, line: WORD_FORMAT.lineSpacing },
          children: [new TextRun({
            text: trimmed,
            bold: true,
            font: WORD_FORMAT.font,
            size: WORD_FORMAT.fontSize,
            color: WORD_FORMAT.fontColor,
          })],
        }));
      } else if (trimmed.startsWith('#')) {
        /* Encabezados markdown */
        const level = (trimmed.match(/^#+/) || ['#'])[0].length;
        const cleanText = trimmed.replace(/^#+\s*/, '');
        children.push(makeHeading(cleanText, d, Math.min(level, 3)));
      } else {
        children.push(makePara(trimmed, d, { indent: true }));
      }
    });

    /* Cierre formal */
    children.push(makePara('', d)); // Línea vacía
    children.push(makePara('Leída que le fue su declaración, se ratifica y firma para constancia, en la fecha indicada.', d, { before: 360, indent: true }));

    /* Firmas */
    const declaranteName = caseRef ? _fmtArr(caseRef.denunciantes) || _fmtArr(caseRef.denunciados) || '[DECLARANTE]' : '[DECLARANTE]';
    children.push(...makeSignatureLine(declaranteName, 'Declarante', d));
    children.push(...makeSignatureLine('[FISCAL INVESTIGADOR/A]', 'Fiscal Investigador/a', d));
    children.push(...makeSignatureLine('[ACTUARIO/A]', 'Ministro/a de Fe', d));

    /* Create document */
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: WORD_FORMAT.pageWidth, height: WORD_FORMAT.pageHeight },
            margin: {
              top: WORD_FORMAT.marginTop, bottom: WORD_FORMAT.marginBottom,
              left: WORD_FORMAT.marginLeft, right: WORD_FORMAT.marginRight,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ text: ' de ', font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: WORD_FORMAT.font, size: 16, color: '999999' }),
              ],
            })],
          }),
        },
        children,
      }],
    });

    /* Generate and download */
    const buffer = await Packer.toBlob(doc);
    const declName = (mt.nombreDeclarante || '').replace(/\s+/g, '_') || 'declarante';
    const filename = `Acta_${tipoActa.replace(/\s+/g, '_')}_${declName}_${mt.fecha || new Date().toISOString().split('T')[0]}.docx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buffer);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('✅ ' + filename + ' descargado');

  } catch (err) {
    console.error('exportActaToWord:', err);
    showToast('⚠ Error: ' + err.message);
  }
}

/* ══════════════════════════════════════════
   EXPORTAR VISTA FISCAL / INFORME
   ══════════════════════════════════════════ */
async function exportVistaFiscalToWord(text, title) {
  if (!text) { showToast('⚠ Sin texto para exportar'); return; }

  showToast('📄 Generando Word…');
  try {
    const d = await _waitDocx();
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber } = d;

    const caseRef = typeof currentCase !== 'undefined' ? currentCase : null;
    const docTitle = title || 'VISTA FISCAL';
    const fecha = new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

    const children = [];

    /* Título */
    children.push(makeHeading(docTitle, d, 1));
    if (caseRef) {
      children.push(makePara(`Expediente: ${caseRef.name || '[EXP]'}  —  ROL: ${caseRef.rol || '[ROL]'}`, d, { center: true }));
      if (caseRef.caratula) children.push(makePara(`Carátula: ${caseRef.caratula}`, d, { center: true }));
    }
    children.push(makePara('', d));

    /* Cuerpo */
    const paragraphs = text.split('\n').filter(p => p.trim());
    paragraphs.forEach(p => {
      const trimmed = p.trim();

      /* Detectar secciones VISTOS / CONSIDERANDO / POR TANTO */
      if (/^(VISTOS|CONSIDERANDO|POR TANTO|RESUELVO|SE PROPONE)/i.test(trimmed)) {
        children.push(makeHeading(trimmed, d, 2));
      }
      /* Detectar párrafos numerados "Que," */
      else if (/^\d+[\.\)°]/.test(trimmed) || trimmed.startsWith('Que,')) {
        children.push(makePara(trimmed, d, { indent: true, before: 60 }));
      }
      /* Encabezados markdown */
      else if (trimmed.startsWith('#')) {
        const level = (trimmed.match(/^#+/) || ['#'])[0].length;
        children.push(makeHeading(trimmed.replace(/^#+\s*/, ''), d, Math.min(level, 3)));
      }
      /* Párrafo normal */
      else {
        children.push(makePara(trimmed, d, { indent: true }));
      }
    });

    /* Firmas */
    children.push(makePara('', d));
    children.push(...makeSignatureLine('[FISCAL INVESTIGADOR/A]', 'Fiscal Investigador/a', d));

    /* Create document */
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: WORD_FORMAT.font, size: WORD_FORMAT.fontSize, color: WORD_FORMAT.fontColor },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: WORD_FORMAT.pageWidth, height: WORD_FORMAT.pageHeight },
            margin: {
              top: WORD_FORMAT.marginTop, bottom: WORD_FORMAT.marginBottom,
              left: WORD_FORMAT.marginLeft, right: WORD_FORMAT.marginRight,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ text: ' de ', font: WORD_FORMAT.font, size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: WORD_FORMAT.font, size: 16, color: '999999' }),
              ],
            })],
          }),
        },
        children,
      }],
    });

    const buffer = await Packer.toBlob(doc);
    const filename = `${docTitle.replace(/\s+/g, '_')}_${caseRef?.name || 'caso'}_${new Date().toISOString().split('T')[0]}.docx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buffer);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('✅ ' + filename + ' descargado');

  } catch (err) {
    console.error('exportVistaFiscalToWord:', err);
    showToast('⚠ Error: ' + err.message);
  }
}

/* ══════════════════════════════════════════
   EXPORTAR PÁRRAFOS MODELO A WORD
   ══════════════════════════════════════════ */
async function exportParrafosModeloToWord() {
  if (!currentCase) return;
  const { data } = await sb.from('case_metadata')
    .select('value').eq('case_id', currentCase.id)
    .eq('key', 'parrafos_modelo_extractos').maybeSingle();
  if (!data?.value) { showToast('⚠ Sin párrafos modelo'); return; }
  await exportVistaFiscalToWord(data.value, 'PÁRRAFOS MODELO — VISTA FISCAL');
}

/* ══════════════════════════════════════════
   EXPORTAR CUALQUIER RESPUESTA DEL CHAT
   ══════════════════════════════════════════ */
async function exportChatResponseToWord(buttonEl) {
  const msgBub = buttonEl?.closest('.msg')?.querySelector('.msg-bub');
  if (!msgBub) return;
  const text = msgBub.innerText;
  if (!text) { showToast('⚠ Sin texto'); return; }

  /* Detect document type by content */
  const isVista = /VISTOS|CONSIDERANDO|POR TANTO|vista fiscal/i.test(text);
  const isActa = /ACTA DE DECLARACIÓN|declaración testimonial|se ratifica y firma/i.test(text);
  const isCargos = /FORMULACIÓN DE CARGOS|RESUELVO.*CARGO/i.test(text);
  const isInforme = /INFORME EN DERECHO|MARCO NORMATIVO|JURISPRUDENCIA/i.test(text);

  let title = 'DOCUMENTO';
  if (isVista) title = 'VISTA FISCAL';
  else if (isActa) title = 'ACTA DE DECLARACIÓN';
  else if (isCargos) title = 'FORMULACIÓN DE CARGOS';
  else if (isInforme) title = 'INFORME EN DERECHO';

  await exportVistaFiscalToWord(text, title);
}

console.log('%c📄 Módulo Export Word cargado — Folio, Arial 11, Justificado, 1.5', 'color:#4f46e5;font-weight:bold');
