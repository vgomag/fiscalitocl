/**
 * MOD-PDF-TOOLS-PATCH.JS
 * ──────────────────────
 * Parche para mod-pdf-tools.js:
 *   1. Reemplaza loadPdfLib() para usar jsdelivr (CDN confiable)
 *   2. Reemplaza doOcr() para usar Netlify function (CHAT_ENDPOINT con Claude)
 *      en vez de sb.functions.invoke('ocr-pdf-large') que no existe
 */

/* ═══ Fix loadPdfLib — usar jsdelivr como CDN principal ═══ */
window.loadPdfLib = function loadPdfLib() {
  return new Promise((resolve, reject) => {
    if (typeof PDFLib !== 'undefined') return resolve(PDFLib);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    s.onload = () => {
      if (typeof PDFLib !== 'undefined') resolve(PDFLib);
      else reject(new Error('pdf-lib loaded but PDFLib global not found'));
    };
    s.onerror = () => {
      /* Fallback: intentar cdnjs */
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
      s2.onload = () => {
        if (typeof PDFLib !== 'undefined') resolve(PDFLib);
        else reject(new Error('pdf-lib fallback loaded but global not found'));
      };
      s2.onerror = () => reject(new Error('No se pudo cargar pdf-lib desde ninguna CDN'));
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
};

/* ═══ Fix doOcr — usar Claude via Netlify en vez de sb.functions.invoke ═══ */
window.doOcr = async function doOcr() {
  const state = window._pdfTools || {};
  const file = state.ocrFile;
  if (!file) return showToast('⚠ Selecciona un archivo primero');

  const body = document.getElementById('pdfToolsBody');
  if (body) {
    const resultArea = body.querySelector('.pdft-ocr-result') || document.createElement('div');
    resultArea.className = 'pdft-ocr-result';
    resultArea.style.cssText = 'margin-top:12px;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)';
    resultArea.innerHTML = '<div style="color:var(--text-muted);font-size:12px">⏳ Extrayendo texto con IA… Esto puede tomar unos segundos.</div>';
    if (!body.querySelector('.pdft-ocr-result')) body.appendChild(resultArea);
  }

  try {
    /* Leer archivo como base64 */
    const reader = new FileReader();
    const base64 = await new Promise((res, rej) => {
      reader.onload = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    /* Determinar media type */
    const mimeType = file.type || 'application/pdf';
    const isPdf = file.name.endsWith('.pdf') || mimeType.includes('pdf');
    const isWord = file.name.endsWith('.docx') || file.name.endsWith('.doc') || mimeType.includes('word');
    const mediaType = isPdf ? 'application/pdf' :
                      isWord ? (file.name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword') :
                      mimeType;

    /* Enviar a Claude para extraer texto */
    const r = await authFetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        system: 'Eres un extractor de texto. Extrae TODO el texto del documento proporcionado. Mantén la estructura, encabezados, párrafos y formato. Responde SOLO con el texto extraído.',
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extrae el texto completo de este documento. Incluye todo: títulos, párrafos, tablas, notas al pie. Responde SOLO con el texto, sin comentarios.' }
          ]
        }]
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error('Error API: ' + r.status + ' ' + errText.substring(0, 100));
    }

    const data = await r.json();
    const text = (data.content || []).map(b => b.text || '').join('');

    if (!text || text.length < 10) throw new Error('No se pudo extraer texto del documento');

    /* Mostrar resultado */
    const resultArea = document.querySelector('.pdft-ocr-result');
    if (resultArea) {
      resultArea.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:12px;font-weight:600;color:var(--green)">✅ Texto extraído (${text.length.toLocaleString()} caracteres)</div>
          <div style="display:flex;gap:6px">
            <button class="btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('ocrResultText').value);showToast('📋 Copiado')">📋 Copiar</button>
            <button class="btn-sm" onclick="(function(){const b=new Blob([document.getElementById('ocrResultText').value],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='${file.name.replace(/\.[^.]+$/, '')}_ocr.txt';a.click();URL.revokeObjectURL(a.href);showToast('📥 Descargado')})()">📥 .txt</button>
          </div>
        </div>
        <textarea id="ocrResultText" style="width:100%;min-height:300px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--surface);color:var(--text);box-sizing:border-box">${text.replace(/</g,'&lt;')}</textarea>
      `;
    }

    showToast('✅ Texto extraído correctamente');

  } catch (err) {
    console.error('doOcr error:', err);
    const resultArea = document.querySelector('.pdft-ocr-result');
    if (resultArea) {
      resultArea.innerHTML = `<div style="color:var(--red);font-size:12px">❌ Error: ${err.message}</div>`;
    }
    showToast('❌ Error extrayendo texto: ' + err.message);
  }
};

console.log('%c📄 Parche PDF Tools cargado — loadPdfLib + doOcr corregidos', 'color:#3b82f6;font-weight:bold');
