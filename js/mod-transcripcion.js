/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   Grabación, carga, transcripción con IA, estructuración
   ========================================================= */

const transcripcion = {
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  audioFile: null,
  audioUrl: null,
  baseDocText: '',
  rawText: '',
  structuredText: '',
  summary: '',
  segments: [],   // diarization
  step: 'upload', // upload | transcribing | structuring | result
  isProcessing: false,
  isGeneratingSummary: false,
};

/* ── INICIALIZAR PANEL F11 ── */
function initF11Transcripcion() {
  // Replace F11 function panel with transcription UI
  showFnPanel('F11');
}

/* ── HTML DEL PANEL F11 ── */
function showF11TranscripcionPanel() {
  const panel = document.getElementById('fnPanel');
  if (!panel) return;

  // Hide msgs, show panel
  const msgs = document.getElementById('msgs');
  const ragBar = document.getElementById('ragBar');
  if (msgs) msgs.style.display = 'none';
  if (ragBar) ragBar.style.display = 'none';
  panel.style.display = 'flex';

  panel.innerHTML = buildTranscripcionHTML();
}

function buildTranscripcionHTML() {
  const caseInfo = currentCase
    ? `<div style="font-size:11px;color:var(--gold);margin-top:4px">📂 ${escHtml(currentCase.name)}${currentCase.rol ? ' · ' + currentCase.rol : ''}</div>`
    : '';

  // Step indicator
  const steps = [
    { id:'upload',     label:'1. Audio' },
    { id:'transcribe', label:'2. Transcribir' },
    { id:'structure',  label:'3. Estructurar' },
    { id:'result',     label:'4. Resultado' },
  ];
  const stepsHtml = `<div class="trans-steps">
    ${steps.map(s => `<div class="trans-step ${transcripcion.step === s.id ? 'current' : (steps.findIndex(x=>x.id===s.id) < steps.findIndex(x=>x.id===transcripcion.step) ? 'done' : '')}">${s.label}</div>`).join('<div class="trans-step-sep">›</div>')}
  </div>`;

  let bodyHtml = '';

  if (transcripcion.step === 'upload') {
    bodyHtml = `
      <div class="trans-section">
        <div class="trans-label">Cargar o grabar audio</div>
        <div class="trans-audio-row">
          <button class="btn-sm ${transcripcion.isRecording ? 'active' : ''}" onclick="${transcripcion.isRecording ? 'stopTransRecording()' : 'startTransRecording()'}">
            ${transcripcion.isRecording ? '⏹ Detener grabación' : '🎙 Grabar desde micrófono'}
          </button>
          <label class="btn-sm" style="cursor:pointer">
            📁 Cargar archivo
            <input type="file" id="transAudioInput" accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.webm,.ogg" style="display:none" onchange="handleTransAudioUpload(this)"/>
          </label>
        </div>
        ${transcripcion.audioFile ? `
          <div class="trans-file-info">
            🔊 ${escHtml(transcripcion.audioFile.name)} · ${(transcripcion.audioFile.size/1024/1024).toFixed(1)} MB
            ${transcripcion.audioUrl ? `<audio controls src="${transcripcion.audioUrl}" style="width:100%;margin-top:8px;height:32px"></audio>` : ''}
          </div>` : ''}
      </div>
      <div class="trans-section">
        <div class="trans-label">Documento base <span style="font-weight:400;color:var(--text-muted)">(opcional — para texto refundido)</span></div>
        <label class="btn-sm" style="cursor:pointer">
          📄 Cargar acta previa
          <input type="file" id="transDocInput" accept=".pdf,.docx,.doc,.txt" style="display:none" onchange="handleTransDocUpload(this)"/>
        </label>
        ${transcripcion.baseDocText ? `<div style="font-size:10px;color:var(--green);margin-top:5px">✓ Documento base cargado (${transcripcion.baseDocText.length.toLocaleString()} chars)</div>` : ''}
      </div>
      ${caseInfo}
      <button class="btn-save" style="width:100%;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:7px"
        onclick="transcribeAudio()" ${!transcripcion.audioFile ? 'disabled' : ''}>
        ✨ Transcribir Audio
      </button>`;

  } else if (transcripcion.step === 'transcribe' && transcripcion.isProcessing) {
    bodyHtml = `<div class="trans-processing">
      <div class="typing" style="justify-content:center"><div class="da"></div><div class="da"></div><div class="da"></div></div>
      <div style="margin-top:10px;font-size:12px">Transcribiendo audio… esto puede tomar unos minutos</div>
    </div>`;

  } else if (transcripcion.step === 'structure' || (transcripcion.step === 'result' && !transcripcion.structuredText)) {
    bodyHtml = `
      <div class="trans-section">
        <div class="trans-label">Transcripción obtenida</div>
        <div class="trans-raw-box">${escHtml(transcripcion.rawText.substring(0, 500))}${transcripcion.rawText.length > 500 ? '…' : ''}</div>
        ${transcripcion.segments.length > 1 ? `<div style="font-size:10px;color:var(--green);margin-top:5px">👥 ${new Set(transcripcion.segments.map(s=>s.speaker)).size} hablantes detectados</div>` : ''}
      </div>
      <div class="trans-actions-row">
        <button class="btn-save" style="flex:1" onclick="structureTranscripcion()" ${transcripcion.isProcessing ? 'disabled' : ''}>
          ${transcripcion.isProcessing ? '⏳ Estructurando…' : '📋 Estructurar como Acta'}
        </button>
        <button class="btn-sm" onclick="generateTransSummary()" ${transcripcion.isProcessing || transcripcion.isGeneratingSummary ? 'disabled' : ''}>
          ${transcripcion.isGeneratingSummary ? '⏳' : '📊 Resumen IA'}
        </button>
        <button class="btn-cancel" onclick="resetTranscripcion()">↺ Reiniciar</button>
      </div>`;

  } else if (transcripcion.step === 'result') {
    const displayText = transcripcion.structuredText || transcripcion.rawText;
    bodyHtml = `
      <div class="trans-result-actions">
        <button class="btn-export" onclick="copyTranscripcion()">📋 Copiar</button>
        <button class="btn-export" onclick="downloadTransWord()">⬇ Word</button>
        <button class="btn-export" onclick="switchTransView()" id="transSwitchBtn">Ver ${transcripcion.structuredText ? 'original' : 'estructurado'}</button>
        <button class="btn-cancel" onclick="resetTranscripcion()" style="margin-left:auto">↺ Nueva</button>
      </div>
      ${transcripcion.summary ? `<div class="trans-summary-box"><div class="trans-label" style="margin-bottom:5px">📊 Resumen ejecutivo</div><div style="font-size:12px;line-height:1.65">${md(transcripcion.summary)}</div></div>` : ''}
      <div class="trans-result-box" id="transResultBox">${md(displayText)}</div>`;
  }

  return `<div class="trans-panel" style="width:100%;max-width:700px;">
    <div class="trans-header">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:16px">🎙</span>
        <span style="font-size:14px;font-weight:700;color:var(--text)">F11 — Transcripción de Actas</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-dim)">Transcribe declaraciones y actas desde audio, con diarización de hablantes y estructuración como acta formal.</div>
      ${caseInfo}
    </div>
    ${stepsHtml}
    <div class="trans-body">${bodyHtml}</div>
  </div>`;
}

/* ── GRABACIÓN ── */
async function startTransRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    transcripcion.mediaRecorder = mr;
    transcripcion.audioChunks = [];

    mr.ondataavailable = e => { if (e.data.size > 0) transcripcion.audioChunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(transcripcion.audioChunks, { type: 'audio/webm' });
      transcripcion.audioFile = new File([blob], 'grabacion.webm', { type: 'audio/webm' });
      transcripcion.audioUrl = URL.createObjectURL(blob);
      stream.getTracks().forEach(t => t.stop());
      transcripcion.isRecording = false;
      showToast('✓ Grabación guardada');
      updateTransPanel();
    };
    mr.start();
    transcripcion.isRecording = true;
    showToast('🎙 Grabando…');
    updateTransPanel();
  } catch (err) {
    showToast('⚠ No se pudo acceder al micrófono: ' + err.message);
  }
}

function stopTransRecording() {
  transcripcion.mediaRecorder?.stop();
}

function handleTransAudioUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  transcripcion.audioFile = file;
  transcripcion.audioUrl = URL.createObjectURL(file);
  showToast(`✓ Archivo cargado: ${file.name}`);
  updateTransPanel();
}

async function handleTransDocUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    transcripcion.baseDocText = text;
    showToast(`✓ Documento base: ${file.name}`);
    updateTransPanel();
  } catch (err) {
    showToast('⚠ Error al leer el documento');
  }
}

/* ── TRANSCRIBIR ── */
async function transcribeAudio() {
  if (!transcripcion.audioFile) return;
  transcripcion.step = 'transcribe';
  transcripcion.isProcessing = true;
  updateTransPanel();

  try {
    // Try Supabase function first, fall back to Claude
    const arrayBuffer = await transcripcion.audioFile.arrayBuffer();
    const base64 = btoa(new Uint8Array(arrayBuffer).reduce((d, b) => d + String.fromCharCode(b), ''));

    let transcribed = false;
    // Try supabase function
    try {
      const { data, error } = await supabaseClient.functions.invoke('transcribe-audio', {
        body: { audio: base64, mimeType: transcripcion.audioFile.type }
      });
      if (!error && data?.text) {
        transcripcion.rawText = data.text;
        transcripcion.segments = data.segments || [];
        transcribed = true;
        const speakers = new Set((data.segments || []).map(s => s.speaker)).size;
        showToast(`✓ Transcripción completada${speakers > 1 ? ` · ${speakers} hablantes` : ''}`);
      }
    } catch (e) { console.warn('Supabase transcribe-audio not available:', e.message); }

    // Fallback: use Claude via chat endpoint with audio description
    if (!transcribed) {
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          system: 'Eres un asistente de transcripción. El usuario ha cargado un archivo de audio pero el servicio de transcripción automática no está disponible. Ayúdale a estructurar manualmente una declaración.',
          messages: [{ role: 'user', content: `El usuario cargó el audio "${transcripcion.audioFile.name}" para transcribir. El servicio automático no está disponible. Indica al usuario que puede pegar el texto de la declaración manualmente en el área de texto, o que contacte al administrador para configurar el servicio ElevenLabs.` }]
        })
      });
      const data = await resp.json();
      transcripcion.rawText = data.content?.[0]?.text || 'Servicio de transcripción no disponible. Por favor pega el texto de la declaración manualmente.';
    }

    transcripcion.step = 'structure';
  } catch (err) {
    showToast('⚠ Error al transcribir: ' + err.message);
    transcripcion.step = 'upload';
  } finally {
    transcripcion.isProcessing = false;
    updateTransPanel();
  }
}

/* ── ESTRUCTURAR COMO ACTA ── */
async function structureTranscripcion() {
  if (!transcripcion.rawText) return;
  transcripcion.isProcessing = true;
  updateTransPanel();

  try {
    // Try Supabase function
    let structured = false;
    try {
      const { data, error } = await supabaseClient.functions.invoke('structure-transcription', {
        body: {
          transcription: transcripcion.rawText,
          baseDocument: transcripcion.baseDocText || undefined,
          caseInfo: currentCase ? { caseId: currentCase.id, caseName: currentCase.name, caseRol: currentCase.rol } : null
        }
      });
      if (!error && data?.structured) {
        transcripcion.structuredText = data.structured;
        structured = true;
      }
    } catch (e) { console.warn('structure-transcription not available'); }

    // Fallback: Claude
    if (!structured) {
      const caseCtx = currentCase ? `Expediente: ${currentCase.name}${currentCase.rol ? ' · ' + currentCase.rol : ''}` : '';
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: `Eres Fiscalito, asistente jurídico. Estructuras transcripciones de declaraciones como actas formales de procedimientos disciplinarios administrativos de la UMAG. Usa formato pregunta-respuesta, lenguaje formal e identifica los hablantes correctamente.`,
          messages: [{
            role: 'user',
            content: `${caseCtx ? caseCtx + '\n\n' : ''}Estructura la siguiente transcripción como un Acta de Declaración formal en formato pregunta-respuesta:\n\n${transcripcion.rawText}`
          }]
        })
      });
      const data = await resp.json();
      transcripcion.structuredText = data.content?.[0]?.text || '';
    }

    transcripcion.step = 'result';
    showToast('✓ Acta estructurada correctamente');
  } catch (err) {
    showToast('⚠ Error al estructurar: ' + err.message);
  } finally {
    transcripcion.isProcessing = false;
    updateTransPanel();
  }
}

/* ── RESUMEN EJECUTIVO ── */
async function generateTransSummary() {
  if (!transcripcion.rawText) return;
  transcripcion.isGeneratingSummary = true;
  updateTransPanel();

  try {
    try {
      const { data, error } = await supabaseClient.functions.invoke('summarize-transcription', {
        body: {
          transcription: transcripcion.rawText,
          segments: transcripcion.segments,
          caseInfo: currentCase ? { caseId: currentCase.id, caseName: currentCase.name } : null
        }
      });
      if (!error && data?.summary) {
        transcripcion.summary = data.summary;
        showToast('✓ Resumen generado');
        updateTransPanel();
        return;
      }
    } catch (e) { console.warn('summarize-transcription not available'); }

    // Fallback: Claude
    const resp = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: 'Eres Fiscalito. Generas resúmenes ejecutivos de declaraciones para procedimientos disciplinarios.',
        messages: [{ role: 'user', content: `Genera un resumen ejecutivo de esta declaración, incluyendo: participantes identificados, hechos principales declarados, contradicciones o puntos relevantes, y conclusiones jurídicas preliminares:\n\n${transcripcion.rawText}` }]
      })
    });
    const data = await resp.json();
    transcripcion.summary = data.content?.[0]?.text || '';
    showToast('✓ Resumen generado');
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  } finally {
    transcripcion.isGeneratingSummary = false;
    updateTransPanel();
  }
}

/* ── ACCIONES RESULTADO ── */
function copyTranscripcion() {
  const text = transcripcion.structuredText || transcripcion.rawText;
  navigator.clipboard.writeText(text).then(() => showToast('✓ Copiado al portapapeles'));
}

let _transShowStructured = true;
function switchTransView() {
  _transShowStructured = !_transShowStructured;
  const box = document.getElementById('transResultBox');
  const btn = document.getElementById('transSwitchBtn');
  if (box) {
    const text = _transShowStructured ? (transcripcion.structuredText || transcripcion.rawText) : transcripcion.rawText;
    box.innerHTML = md(text);
  }
  if (btn) btn.textContent = _transShowStructured ? 'Ver original' : 'Ver estructurado';
}

function downloadTransWord() {
  const content = (transcripcion.structuredText || transcripcion.rawText);
  const caseLine = currentCase ? `Expediente: ${currentCase.name}${currentCase.rol ? ' · ROL: ' + currentCase.rol : ''}\n` : '';
  const summaryLine = transcripcion.summary ? `\nRESUMEN EJECUTIVO\n${'─'.repeat(40)}\n${transcripcion.summary}\n${'─'.repeat(40)}\n\n` : '';
  const fullText = `ACTA DE DECLARACIÓN\nFecha: ${new Date().toLocaleDateString('es-CL')}\n${caseLine}${'─'.repeat(60)}\n\n${summaryLine}${content}`;

  const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `acta_declaracion_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Descargado (abre en Word para formatear)');
}

function resetTranscripcion() {
  transcripcion.audioFile = null;
  transcripcion.audioUrl = null;
  transcripcion.baseDocText = '';
  transcripcion.rawText = '';
  transcripcion.structuredText = '';
  transcripcion.summary = '';
  transcripcion.segments = [];
  transcripcion.step = 'upload';
  transcripcion.isProcessing = false;
  transcripcion.isGeneratingSummary = false;
  updateTransPanel();
}

function updateTransPanel() {
  const panel = document.getElementById('fnPanel');
  if (!panel || panel.style.display === 'none') return;
  panel.innerHTML = buildTranscripcionHTML();
}

/* ── INTEGRACIÓN CON FN PANEL ── */
// Override showFnPanel for F11
const _origShowFnPanel = typeof showFnPanel === 'function' ? showFnPanel : null;
function showFnPanel_F11_hook(code) {
  if (code === 'F11') {
    const panel = document.getElementById('fnPanel');
    const msgs = document.getElementById('msgs');
    const ragBar = document.getElementById('ragBar');
    if (msgs) msgs.style.display = 'none';
    if (ragBar) ragBar.style.display = 'none';
    if (panel) { panel.style.display = 'flex'; panel.innerHTML = buildTranscripcionHTML(); }
    buildFnChips('F11');
    return;
  }
  if (_origShowFnPanel) _origShowFnPanel(code);
}

// Patch after core loads
document.addEventListener('DOMContentLoaded', () => {
  // Monkey-patch showFnPanel to intercept F11
  const orig = window.showFnPanel;
  window.showFnPanel = function(code) {
    if (code === 'F11') {
      const panel = document.getElementById('fnPanel');
      const msgs = document.getElementById('msgs');
      const ragBar = document.getElementById('ragBar');
      if (msgs) msgs.style.display = 'none';
      if (ragBar) ragBar.style.display = 'none';
      if (panel) { panel.style.display = 'flex'; panel.innerHTML = buildTranscripcionHTML(); }
      buildFnChips && buildFnChips('F11');
      return;
    }
    orig.call(this, code);
  };
});

/* ── ESTILOS ── */
(function injectTransCSS() {
  const style = document.createElement('style');
  style.textContent = `
.trans-panel{display:flex;flex-direction:column;gap:10px;}
.trans-header{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;}
.trans-steps{display:flex;align-items:center;gap:0;margin-bottom:0;}
.trans-step{padding:5px 10px;font-size:10.5px;color:var(--text-muted);background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);}
.trans-step.current{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:600;}
.trans-step.done{background:rgba(5,150,105,.08);border-color:rgba(5,150,105,.25);color:var(--green);}
.trans-step-sep{color:var(--text-muted);font-size:12px;padding:0 3px;}
.trans-body{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;}
.trans-section{margin-bottom:14px;}
.trans-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);font-weight:600;margin-bottom:7px;}
.trans-audio-row{display:flex;gap:7px;flex-wrap:wrap;}
.trans-file-info{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:8px 11px;font-size:11.5px;margin-top:8px;}
.trans-raw-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:11.5px;line-height:1.65;max-height:120px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim);}
.trans-actions-row{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px;}
.trans-processing{text-align:center;padding:30px;color:var(--text-muted);}
.trans-result-actions{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
.trans-summary-box{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;}
.trans-result-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:12.5px;line-height:1.75;max-height:400px;overflow-y:auto;}
.trans-result-box h1,.trans-result-box h2,.trans-result-box h3{font-family:'EB Garamond',serif;color:var(--gold);}
.trans-result-box strong{font-weight:700;}
.trans-result-box p{margin-bottom:6px;}
`;
  document.head.appendChild(style);
})();
