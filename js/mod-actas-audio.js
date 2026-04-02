/**
 * MOD-ACTAS-AUDIO.JS — Integración Audio + Transcripción en Cuestionarios y Actas
 * ──────────────────────────────────────────────────────────────────────────────────
 * v2.0 — Flujo de 3 pasos:
 *   PASO 1: Grabar/subir audio → transcribir con ElevenLabs/Whisper (sb.functions)
 *   PASO 2: Edición IA — aplicar prompt + cuestionario como guía → texto refundido
 *   PASO 3: Acta lista para firmar — formato formal con espacios de firma
 *
 * Dependencias: mod-cuestionarios.js, mod-transcripcion.js (constantes globales)
 */

/* ═══ STATE ═══ */
let _actaAudioBlob = null;
let _actaAudioUrl = null;
let _actaDocFile = null;
let _actaDocText = '';
let _actaRawTranscripcion = '';   // Paso 1: texto crudo del audio
let _actaEditedText = '';          // Paso 2: texto refundido/editado
let _actaFinalActa = '';           // Paso 3: acta lista para firmar
let _actaRecorder = null;
let _actaRecording = false;
let _actaCurrentStep = 0;         // 0=inicio, 1=transcrito, 2=editado, 3=acta lista
let _actaIsProcessing = false;
let _actaProcessLabel = '';

/* ═══ CONSTANTES TRANSCRIPCIÓN ═══ */
const _ACTA_BASE64_LIMIT = 25 * 1024 * 1024; // 25MB — encima usa Storage
const _ACTA_STORAGE_BUCKET = 'transcripcion-audio';

/* ═══ UTILIDADES ═══ */
function _actaToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 0x8000;
  let raw = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(raw);
}

function _actaSz(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function _actaExt(name) {
  if (!name) return '';
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function _actaMime(file) {
  const MIME_MAP = {
    mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', aac:'audio/aac',
    ogg:'audio/ogg', opus:'audio/opus', flac:'audio/flac', webm:'audio/webm',
    mp4:'video/mp4', mov:'video/quicktime', '3gp':'audio/3gpp'
  };
  const ext = _actaExt(file.name);
  return MIME_MAP[ext] || (file.type && file.type !== 'application/octet-stream' ? file.type : 'audio/mpeg');
}

/* ═══ INJECT PANEL ═══ */
function injectActaAudioPanel() {
  const container = document.getElementById('viewCuestionarios');
  if (!container || container.style.display === 'none') return;
  if (document.getElementById('actaAudioPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'actaAudioPanel';
  panel.style.cssText = 'margin-top:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);overflow:hidden';
  panel.innerHTML = _buildActaPanelHTML();
  container.appendChild(panel);

  /* Set today's date */
  const today = new Date().toISOString().split('T')[0];
  const fechaEl = document.getElementById('actaFecha');
  if (fechaEl) fechaEl.value = today;
}

/* ═══ BUILD PANEL HTML ═══ */
function _buildActaPanelHTML() {
  const stepLabels = ['Transcribir Audio', 'Editar con IA', 'Acta para Firmar'];
  const stepIcons = ['🎙️', '✏️', '📝'];

  return `
    <div onclick="toggleActaAudioPanel()" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;background:var(--surface2);border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🎙️</span>
        <div>
          <div style="font-size:13px;font-weight:600">Audio y Transcripción de Acta</div>
          <div style="font-size:10.5px;color:var(--text-muted)">3 pasos: Transcribir → Editar → Acta lista</div>
        </div>
      </div>
      <span id="actaAudioToggle" style="font-size:18px;transition:transform .2s">▸</span>
    </div>
    <div id="actaAudioBody" style="display:none;padding:14px">

      <!-- Indicador de pasos -->
      <div id="actaStepsIndicator" style="display:flex;gap:4px;margin-bottom:14px">
        ${stepLabels.map((label, i) => `
          <div class="acta-step-indicator ${i === 0 ? 'acta-step-active' : ''}" id="actaStepInd${i}" style="flex:1;text-align:center;padding:8px 6px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);transition:all .2s">
            <div style="font-size:14px">${stepIcons[i]}</div>
            <div style="font-size:10px;font-weight:600;margin-top:2px">Paso ${i + 1}</div>
            <div style="font-size:9.5px;color:var(--text-muted)">${label}</div>
          </div>
        `).join('')}
      </div>

      <!-- Caso vinculado -->
      <div id="actaAudioCaseInfo" style="margin-bottom:12px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;color:var(--text-muted)">
        ${typeof currentCase !== 'undefined' && currentCase ? '⚖️ Caso: <strong style="color:var(--gold)">' + (currentCase.name || currentCase.nueva_resolucion || '—') + '</strong>' : '⚠️ Vincula un caso primero desde el panel de Cuestionarios'}
      </div>

      <!-- Sección 1: Datos del Acta -->
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">📋 Datos del Acta</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div class="form-field">
            <label>Tipo de acta</label>
            <select id="actaTipo" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%">
              <option value="testigo">Declaración de testigo</option>
              <option value="denunciante">Ratificación de denuncia</option>
              <option value="denunciado">Declaración persona denunciada</option>
              <option value="otro">Otra diligencia</option>
            </select>
          </div>
          <div class="form-field">
            <label>Nombre del declarante</label>
            <input id="actaNombreDeclarante" placeholder="Nombre completo" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
          <div class="form-field">
            <label>Fecha de la diligencia</label>
            <input id="actaFecha" type="date" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
          </div>
          <div class="form-field">
            <label>Lugar</label>
            <input id="actaLugar" value="Punta Arenas" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
          </div>
        </div>
      </div>

      <!-- Sección 2: Cuestionario Word -->
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">📄 Cuestionario de Preguntas (Word) — guía para edición</div>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text-muted);transition:border-color .2s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
            <input type="file" accept=".docx,.doc,.pdf,.txt" onchange="handleActaDocUpload(this.files[0])" style="display:none"/>
            📎 <span id="actaDocName">Seleccionar archivo de preguntas…</span>
          </label>
          <button class="btn-sm" id="actaDocClearBtn" style="display:none" onclick="clearActaDoc()">✕</button>
        </div>
        <div id="actaDocPreview" style="display:none;margin-top:8px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;max-height:150px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim)"></div>
      </div>

      <!-- Sección 3: Audio -->
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">🎙️ Audio de la Entrevista</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text);transition:background .15s" onmouseover="this.style.background='var(--gold-glow)'" onmouseout="this.style.background='var(--surface2)'">
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onchange="handleActaAudioUpload(this.files[0])" style="display:none"/>
            📁 Cargar audio
          </label>
          <button class="btn-sm" id="actaRecordBtn" onclick="toggleActaRecording()" style="display:flex;align-items:center;gap:4px">
            <span id="actaRecordIcon">⏺</span> <span id="actaRecordLabel">Grabar</span>
          </button>
          <button class="btn-sm" id="actaAudioClearBtn" style="display:none" onclick="clearActaAudio()">✕ Quitar audio</button>
        </div>
        <div id="actaAudioPreview" style="display:none;margin-top:8px">
          <audio id="actaAudioPlayer" controls style="width:100%;height:36px"></audio>
          <div id="actaAudioInfo" style="font-size:10px;color:var(--text-muted);margin-top:4px"></div>
        </div>
      </div>

      <!-- PASO 1: Botón Transcribir -->
      <div id="actaStep1Section" style="margin-bottom:14px">
        <button class="btn-save" id="actaTranscribeBtn" onclick="actaPaso1_Transcribir()" disabled style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px">
          🎙️ Paso 1: Transcribir Audio (ElevenLabs/Whisper)
        </button>
        <div id="actaTransProgress" style="display:none;margin-top:8px">
          <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="actaTransBar" style="height:100%;background:var(--gold);width:0%;transition:width .5s"></div></div>
          <div id="actaTransStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Procesando...</div>
        </div>
      </div>

      <!-- PASO 1 Resultado: Transcripción cruda -->
      <div id="actaRawResultSection" style="display:none;margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-dim)">🎙️ Paso 1: Transcripción cruda (texto extraído del audio)</div>
        <textarea id="actaRawResult" style="width:100%;min-height:120px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--bg);color:var(--text);box-sizing:border-box" readonly></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-sm" onclick="copyActaText(_actaRawTranscripcion)">📋 Copiar crudo</button>
          <button class="btn-sm" onclick="downloadActaText(_actaRawTranscripcion, 'transcripcion_cruda')">⬇ Descargar .txt</button>
        </div>
      </div>

      <!-- PASO 2: Botón Editar -->
      <div id="actaStep2Section" style="display:none;margin-bottom:14px">
        <div style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:10px;margin-bottom:8px">
          <div style="font-size:11px;color:var(--gold);font-weight:600">✏️ Paso 2: Edición con IA</div>
          <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">Se usará el cuestionario como guía para estructurar las respuestas en un texto refundido, coordinado y sistematizado.</div>
        </div>
        <button class="btn-save" id="actaEditBtn" onclick="actaPaso2_Editar()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px">
          ✏️ Paso 2: Editar y Refundir con IA
        </button>
        <div id="actaEditProgress" style="display:none;margin-top:8px">
          <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="actaEditBar" style="height:100%;background:#818cf8;width:0%;transition:width .5s"></div></div>
          <div id="actaEditStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Editando...</div>
        </div>
      </div>

      <!-- PASO 2 Resultado: Texto editado/refundido -->
      <div id="actaEditedResultSection" style="display:none;margin-bottom:14px">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-dim)">✏️ Paso 2: Texto Refundido (editado con IA)</div>
        <textarea id="actaEditedResult" style="width:100%;min-height:150px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--bg);color:var(--text);box-sizing:border-box"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-sm" onclick="copyActaText(_actaEditedText)">📋 Copiar editado</button>
          <button class="btn-sm" onclick="downloadActaText(_actaEditedText, 'texto_refundido')">⬇ Descargar .txt</button>
        </div>
      </div>

      <!-- PASO 3: Botón Generar Acta -->
      <div id="actaStep3Section" style="display:none;margin-bottom:14px">
        <div style="background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.25);border-radius:var(--radius);padding:10px;margin-bottom:8px">
          <div style="font-size:11px;color:var(--green);font-weight:600">📝 Paso 3: Acta Lista para Firmar</div>
          <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">Se generará el acta formal con encabezado UMAG, advertencias legales y espacios para firmas.</div>
        </div>
        <button class="btn-save" id="actaGenerateBtn" onclick="actaPaso3_GenerarActa()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--green);border-color:var(--green)">
          📝 Paso 3: Generar Acta para Firmar
        </button>
        <div id="actaGenerateProgress" style="display:none;margin-top:8px">
          <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="actaGenerateBar" style="height:100%;background:var(--green);width:0%;transition:width .5s"></div></div>
          <div id="actaGenerateStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Generando acta...</div>
        </div>
      </div>

      <!-- PASO 3 Resultado: Acta final -->
      <div id="actaFinalSection" style="display:none">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--green)">📝 Acta Lista para Firmar</div>
        <div id="actaFinalPreview" style="background:#fff;color:#111;border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;font-size:13px;line-height:1.8;max-height:400px;overflow-y:auto;font-family:'EB Garamond',Georgia,serif"></div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn-save" onclick="saveActaToCase()" style="flex:1">💾 Guardar en el caso</button>
          <button class="btn-sm" onclick="downloadActaCompleta()" style="background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:600">📄 Descargar Word</button>
          <button class="btn-sm" onclick="copyActaText(_actaFinalActa)">📋 Copiar</button>
          <button class="btn-sm" onclick="resetActaAudio()">↺ Nueva</button>
        </div>
      </div>
    </div>
  `;
}

/* ═══ UPDATE STEP INDICATORS ═══ */
function _updateActaStepIndicators() {
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById('actaStepInd' + i);
    if (!el) continue;
    el.classList.remove('acta-step-active', 'acta-step-done');
    if (i < _actaCurrentStep) {
      el.classList.add('acta-step-done');
    } else if (i === _actaCurrentStep) {
      el.classList.add('acta-step-active');
    }
  }
}

/* ═══ TOGGLE PANEL ═══ */
function toggleActaAudioPanel() {
  const body = document.getElementById('actaAudioBody');
  const toggle = document.getElementById('actaAudioToggle');
  if (!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  toggle.style.transform = open ? 'rotate(90deg)' : 'rotate(0deg)';
}

/* ═══ DOCUMENT UPLOAD ═══ */
async function handleActaDocUpload(file) {
  if (!file) return;
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  const ALLOWED_TYPES = ['text/plain', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const isValidType = file.type && ALLOWED_TYPES.includes(file.type) || /\.(txt|pdf|doc|docx)$/i.test(file.name);

  if (file.size > MAX_FILE_SIZE) {
    if (typeof showToast === 'function') showToast('⚠ El archivo excede 50 MB');
    return;
  }
  if (!isValidType) {
    if (typeof showToast === 'function') showToast('⚠ Solo se aceptan TXT, PDF o Word (.doc/.docx)');
    return;
  }
  _actaDocFile = file;
  document.getElementById('actaDocName').textContent = file.name;
  document.getElementById('actaDocClearBtn').style.display = 'inline-block';

  const preview = document.getElementById('actaDocPreview');
  try {
    if (file.name.endsWith('.txt')) {
      _actaDocText = await file.text();
    } else {
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const r = await authFetch(CHAT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: file.type || 'application/octet-stream', data: base64 } },
              { type: 'text', text: 'Extrae el texto completo de este documento. Incluye todas las preguntas. Responde SOLO con el texto extraído, sin comentarios.' }
            ]
          }]
        })
      });
      if (r.ok) {
        const data = await r.json();
        _actaDocText = (data.content || []).map(b => b.text || '').join('');
      }
    }
    if (_actaDocText) {
      preview.textContent = _actaDocText.substring(0, 2000) + (_actaDocText.length > 2000 ? '\n...(continúa)' : '');
      preview.style.display = 'block';
    }
  } catch (e) {
    console.error('Error reading doc:', e);
    preview.textContent = '⚠ No se pudo leer el archivo. Continúa con la grabación.';
    preview.style.display = 'block';
  }
}

function clearActaDoc() {
  _actaDocFile = null;
  _actaDocText = '';
  document.getElementById('actaDocName').textContent = 'Seleccionar archivo de preguntas…';
  document.getElementById('actaDocClearBtn').style.display = 'none';
  document.getElementById('actaDocPreview').style.display = 'none';
}

/* ═══ AUDIO UPLOAD ═══ */
function handleActaAudioUpload(file) {
  if (!file) return;
  const MAX_AUDIO_SIZE = 500 * 1024 * 1024;
  const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];
  const isValidAudio = file.type && ALLOWED_AUDIO_TYPES.includes(file.type) || /\.(mp3|wav|ogg|webm|m4a|aac)$/i.test(file.name);

  if (file.size > MAX_AUDIO_SIZE) {
    if (typeof showToast === 'function') showToast('⚠ El audio excede 500 MB');
    return;
  }
  if (!isValidAudio) {
    if (typeof showToast === 'function') showToast('⚠ Solo se aceptan MP3, WAV, OGG, WebM o M4A');
    return;
  }

  _actaAudioBlob = file;
  if (_actaAudioUrl) URL.revokeObjectURL(_actaAudioUrl);
  _actaAudioUrl = URL.createObjectURL(file);

  const player = document.getElementById('actaAudioPlayer');
  player.src = _actaAudioUrl;
  document.getElementById('actaAudioPreview').style.display = 'block';
  document.getElementById('actaAudioClearBtn').style.display = 'inline-block';
  document.getElementById('actaAudioInfo').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  document.getElementById('actaTranscribeBtn').disabled = false;
}

function clearActaAudio() {
  _actaAudioBlob = null;
  if (_actaAudioUrl) URL.revokeObjectURL(_actaAudioUrl);
  _actaAudioUrl = null;
  document.getElementById('actaAudioPreview').style.display = 'none';
  document.getElementById('actaAudioClearBtn').style.display = 'none';
  document.getElementById('actaTranscribeBtn').disabled = true;
  if (_actaRecording) stopActaRecording();
}

/* ═══ AUDIO RECORDING ═══ */
async function toggleActaRecording() {
  if (_actaRecording) { stopActaRecording(); }
  else { await startActaRecording(); }
}

async function startActaRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
    });
    const chunks = [];

    /* Preferir mp4 > webm > ogg para mejor compatibilidad con transcripción */
    const mimeOptions = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    let selectedMime = '';
    for (const m of mimeOptions) {
      if (MediaRecorder.isTypeSupported(m)) { selectedMime = m; break; }
    }

    _actaRecorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : {});
    _actaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    _actaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const mimeType = _actaRecorder.mimeType || 'audio/webm';
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      _actaAudioBlob = new Blob(chunks, { type: mimeType });

      if (_actaAudioUrl) URL.revokeObjectURL(_actaAudioUrl);
      _actaAudioUrl = URL.createObjectURL(_actaAudioBlob);

      /* Convertir Blob a File para compatibilidad con pipeline de transcripción */
      const fileName = 'grabacion_' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.' + ext;
      _actaAudioBlob = new File([_actaAudioBlob], fileName, { type: mimeType });

      document.getElementById('actaAudioPlayer').src = _actaAudioUrl;
      document.getElementById('actaAudioPreview').style.display = 'block';
      document.getElementById('actaAudioClearBtn').style.display = 'inline-block';
      document.getElementById('actaAudioInfo').textContent = `Grabación · ${(_actaAudioBlob.size / 1024 / 1024).toFixed(1)} MB`;
      document.getElementById('actaTranscribeBtn').disabled = false;
    };
    _actaRecorder.start(1000);
    _actaRecording = true;
    document.getElementById('actaRecordIcon').textContent = '⏹';
    document.getElementById('actaRecordLabel').textContent = 'Detener';
    document.getElementById('actaRecordBtn').style.background = 'var(--red)';
    document.getElementById('actaRecordBtn').style.color = '#fff';
  } catch (e) {
    alert('No se pudo acceder al micrófono: ' + e.message);
  }
}

function stopActaRecording() {
  if (_actaRecorder && _actaRecorder.state !== 'inactive') _actaRecorder.stop();
  _actaRecording = false;
  document.getElementById('actaRecordIcon').textContent = '⏺';
  document.getElementById('actaRecordLabel').textContent = 'Grabar';
  document.getElementById('actaRecordBtn').style.background = '';
  document.getElementById('actaRecordBtn').style.color = '';
}

/* ════════════════════════════════════════════════════════════
   PASO 1: TRANSCRIBIR AUDIO con ElevenLabs/Whisper
   Usa sb.functions.invoke('transcribe-audio') — mismo pipeline
   que mod-transcripcion.js (F11), NO envía audio a Claude.
   ════════════════════════════════════════════════════════════ */
async function actaPaso1_Transcribir() {
  if (!_actaAudioBlob) return;
  if (_actaIsProcessing) return;

  const btn = document.getElementById('actaTranscribeBtn');
  const progress = document.getElementById('actaTransProgress');
  const bar = document.getElementById('actaTransBar');
  const status = document.getElementById('actaTransStatus');

  _actaIsProcessing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Transcribiendo con ElevenLabs/Whisper…';
  progress.style.display = 'block';
  bar.style.width = '5%';
  bar.style.background = 'var(--gold)';
  status.textContent = 'Preparando audio…';

  let storagePath = null;

  try {
    const file = _actaAudioBlob;
    const useStorage = file.size > _ACTA_BASE64_LIMIT;
    let invokeBody;

    if (useStorage) {
      /* Archivo grande: subir a Supabase Storage primero */
      bar.style.width = '10%';
      status.textContent = 'Subiendo audio a almacenamiento (' + _actaSz(file.size) + ')…';

      const userId = (typeof session !== 'undefined' && session?.user?.id) || 'anon';
      const ts = Date.now();
      const ext = _actaExt(file.name) || 'bin';
      const path = `${userId}/${ts}.${ext}`;

      const { data, error } = await sb.storage.from(_ACTA_STORAGE_BUCKET).upload(path, file, {
        contentType: _actaMime(file), upsert: true
      });

      if (error) {
        /* Intentar crear bucket si no existe */
        if (error.message?.includes('not found') || error.statusCode === 404) {
          await sb.storage.createBucket(_ACTA_STORAGE_BUCKET, { public: false });
          const retry = await sb.storage.from(_ACTA_STORAGE_BUCKET).upload(path, file, { contentType: _actaMime(file), upsert: true });
          if (retry.error) throw new Error(retry.error.message);
        } else {
          throw new Error('Error subiendo audio: ' + error.message);
        }
      }
      storagePath = path;
      invokeBody = { storagePath: storagePath, mimeType: _actaMime(file) };
      bar.style.width = '25%';
      status.textContent = 'Audio subido. Enviando a transcripción…';
    } else {
      /* Archivo normal: base64 directo */
      bar.style.width = '10%';
      status.textContent = 'Codificando audio (' + _actaSz(file.size) + ')…';
      const arrayBuffer = await file.arrayBuffer();
      const base64Audio = _actaToBase64(arrayBuffer);
      invokeBody = { audio: base64Audio, mimeType: _actaMime(file) };
      bar.style.width = '25%';
      status.textContent = 'Enviando a transcripción…';
    }

    /* Llamar Edge Function: transcribe-audio (ElevenLabs/Whisper) */
    bar.style.width = '35%';
    status.textContent = 'Transcribiendo con ElevenLabs/Whisper…';

    const { data, error } = await sb.functions.invoke('transcribe-audio', { body: invokeBody });

    bar.style.width = '85%';
    status.textContent = 'Procesando resultado…';

    if (error) {
      let errMsg = error.message || String(error);
      try {
        if (error.context) {
          const body = await error.context.json();
          errMsg = body.error || errMsg;
        }
      } catch (e) {}
      throw new Error(errMsg);
    }

    const transcriptText = data?.text || data?.transcript || '';
    if (!transcriptText) {
      throw new Error(data?.error || 'Sin texto de transcripción en la respuesta');
    }

    /* Éxito: guardar transcripción cruda */
    _actaRawTranscripcion = transcriptText;
    _actaCurrentStep = 1;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Transcripción completada — texto crudo guardado';

    /* Mostrar resultado del Paso 1 */
    document.getElementById('actaRawResult').value = _actaRawTranscripcion;
    document.getElementById('actaRawResultSection').style.display = 'block';

    /* Habilitar Paso 2 */
    document.getElementById('actaStep2Section').style.display = 'block';

    _updateActaStepIndicators();
    showToast('✅ Paso 1 completado: transcripción cruda guardada');

  } catch (e) {
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[Acta-Audio] Paso 1 error:', e);
    showToast('❌ Error en transcripción: ' + e.message);
  } finally {
    _actaIsProcessing = false;
    btn.textContent = '🎙️ Paso 1: Transcribir Audio (ElevenLabs/Whisper)';
    btn.disabled = !_actaAudioBlob;
    /* Limpiar storage si se usó */
    if (storagePath) {
      try { await sb.storage.from(_ACTA_STORAGE_BUCKET).remove([storagePath]); } catch (e) {}
    }
  }
}

/* ════════════════════════════════════════════════════════════
   PASO 2: EDITAR con IA — Texto Refundido
   Aplica prompt + cuestionario como guía sobre el texto crudo.
   Usa /.netlify/functions/structure (Claude Haiku).
   ════════════════════════════════════════════════════════════ */
async function actaPaso2_Editar() {
  if (!_actaRawTranscripcion) return showToast('⚠ Primero completa el Paso 1');
  if (_actaIsProcessing) return;

  const btn = document.getElementById('actaEditBtn');
  const progress = document.getElementById('actaEditProgress');
  const bar = document.getElementById('actaEditBar');
  const status = document.getElementById('actaEditStatus');

  _actaIsProcessing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Editando con IA…';
  progress.style.display = 'block';
  bar.style.width = '10%';
  bar.style.background = '#818cf8';
  status.textContent = 'Preparando contexto…';

  try {
    /* Obtener metadatos */
    const tipo = document.getElementById('actaTipo')?.value || 'testigo';
    const nombre = document.getElementById('actaNombreDeclarante')?.value || '';
    const fecha = document.getElementById('actaFecha')?.value || '';
    const lugar = document.getElementById('actaLugar')?.value || 'Punta Arenas';
    const tipoLabel = { testigo: 'testigo', denunciante: 'denunciante', denunciado: 'persona denunciada', otro: 'compareciente' }[tipo] || 'declarante';
    const tipoActaLabel = { testigo: 'DECLARACIÓN DE TESTIGO', denunciante: 'RATIFICACIÓN DE DENUNCIA', denunciado: 'DECLARACIÓN DE PERSONA DENUNCIADA', otro: 'DILIGENCIA' }[tipo] || 'DECLARACIÓN';

    const fechaStr = fecha
      ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    /* Construir contexto del caso */
    const lnk = (typeof currentCase !== 'undefined' ? currentCase : null);
    let caseCtx = `\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${nombre || '[COMPLETAR NOMBRE]'}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${lugar || '[COMPLETAR]'}`;

    if (lnk) {
      const fmtArr = v => { if (!v) return ''; if (Array.isArray(v)) return v.join(', '); try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(', ') : String(v); } catch { return String(v); } };
      caseCtx += `\n\nDATOS DEL EXPEDIENTE:\n- Expediente: ${lnk.name || '[EXPEDIENTE]'}\n- ROL: ${lnk.rol || '[ROL]'}\n- Tipo: ${lnk.tipo_procedimiento || '[TIPO]'}\n- Materia: ${lnk.materia || '[MATERIA]'}\n- Denunciante(s): ${fmtArr(lnk.denunciantes) || '[DENUNCIANTE]'}\n- Denunciado/a(s): ${fmtArr(lnk.denunciados) || '[DENUNCIADO/A]'}`;
    }

    /* Determinar modo según si hay cuestionario base */
    const hasBaseDoc = !!_actaDocText?.trim();
    const mode = hasBaseDoc ? 'fill_acta' : 'pregunta_respuesta';

    /* Auth token */
    let authToken = '';
    try {
      if (typeof session !== 'undefined' && session?.access_token) { authToken = session.access_token; }
      else if (typeof sb !== 'undefined') {
        const { data: sessData } = await sb.auth.getSession();
        authToken = sessData?.session?.access_token || '';
      }
    } catch (e) {}

    bar.style.width = '30%';
    status.textContent = hasBaseDoc ? 'Aplicando cuestionario como guía…' : 'Estructurando pregunta-respuesta…';

    /* Llamar a structure.js */
    const rawText = _actaRawTranscripcion.substring(0, 14000);
    const resp = await fetch('/.netlify/functions/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
      body: JSON.stringify({
        rawText: rawText,
        mode: mode,
        caseContext: caseCtx,
        baseDocText: _actaDocText || ''
      })
    });

    bar.style.width = '80%';
    status.textContent = 'Procesando texto refundido…';

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'HTTP ' + resp.status);
    }

    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Sin respuesta');

    _actaEditedText = data.structuredText;
    _actaCurrentStep = 2;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Texto refundido generado';

    /* Mostrar resultado Paso 2 */
    document.getElementById('actaEditedResult').value = _actaEditedText;
    document.getElementById('actaEditedResultSection').style.display = 'block';

    /* Habilitar Paso 3 */
    document.getElementById('actaStep3Section').style.display = 'block';

    _updateActaStepIndicators();
    showToast('✅ Paso 2 completado: texto refundido listo');

  } catch (e) {
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[Acta-Audio] Paso 2 error:', e);
    showToast('❌ Error en edición: ' + e.message);
  } finally {
    _actaIsProcessing = false;
    btn.textContent = '✏️ Paso 2: Editar y Refundir con IA';
    btn.disabled = false;
  }
}

/* ════════════════════════════════════════════════════════════
   PASO 3: GENERAR ACTA LISTA PARA FIRMAR
   Toma el texto refundido (editado) y genera el documento
   formal con encabezado UMAG, advertencias legales y firmas.
   ════════════════════════════════════════════════════════════ */
async function actaPaso3_GenerarActa() {
  /* Usar texto editado; si el usuario lo modificó en el textarea, tomar esa versión */
  const editedTextArea = document.getElementById('actaEditedResult');
  const textoBase = editedTextArea ? editedTextArea.value.trim() : _actaEditedText;
  if (!textoBase) return showToast('⚠ Primero completa el Paso 2');
  if (_actaIsProcessing) return;

  const btn = document.getElementById('actaGenerateBtn');
  const progress = document.getElementById('actaGenerateProgress');
  const bar = document.getElementById('actaGenerateBar');
  const status = document.getElementById('actaGenerateStatus');

  _actaIsProcessing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Generando acta formal…';
  progress.style.display = 'block';
  bar.style.width = '10%';
  status.textContent = 'Preparando acta formal…';

  try {
    /* Obtener metadatos */
    const tipo = document.getElementById('actaTipo')?.value || 'testigo';
    const nombre = document.getElementById('actaNombreDeclarante')?.value || '[COMPLETAR NOMBRE]';
    const fecha = document.getElementById('actaFecha')?.value || '';
    const lugar = document.getElementById('actaLugar')?.value || 'Punta Arenas';
    const tipoLabel = { testigo: 'testigo', denunciante: 'denunciante', denunciado: 'persona denunciada', otro: 'compareciente' }[tipo] || 'declarante';
    const tipoActaLabel = { testigo: 'DECLARACIÓN DE TESTIGO', denunciante: 'RATIFICACIÓN DE DENUNCIA', denunciado: 'DECLARACIÓN DE PERSONA DENUNCIADA', otro: 'DILIGENCIA' }[tipo] || 'DECLARACIÓN';

    const fechaStr = fecha
      ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const lnk = (typeof currentCase !== 'undefined' ? currentCase : null);
    const rolStr = lnk?.rol || '[ROL]';
    const tipoProcStr = lnk?.tipo_procedimiento || '[TIPO DE PROCEDIMIENTO]';

    bar.style.width = '30%';
    status.textContent = 'Formateando acta…';

    /* Auth token */
    let authToken = '';
    try {
      if (typeof session !== 'undefined' && session?.access_token) { authToken = session.access_token; }
      else if (typeof sb !== 'undefined') {
        const { data: sessData } = await sb.auth.getSession();
        authToken = sessData?.session?.access_token || '';
      }
    } catch (e) {}

    /* Llamar a structure.js en modo 'directa' con el texto ya editado */
    let caseCtx = `\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${nombre}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${lugar}\n- Rol: ${rolStr}\n- Procedimiento: ${tipoProcStr}`;

    if (lnk) {
      const fmtArr = v => { if (!v) return ''; if (Array.isArray(v)) return v.join(', '); try { const a = JSON.parse(v); return Array.isArray(a) ? a.join(', ') : String(v); } catch { return String(v); } };
      caseCtx += `\n- Denunciante(s): ${fmtArr(lnk.denunciantes) || '[DENUNCIANTE]'}\n- Denunciado/a(s): ${fmtArr(lnk.denunciados) || '[DENUNCIADO/A]'}`;
    }

    bar.style.width = '50%';
    status.textContent = 'Generando documento formal con IA…';

    const resp = await fetch('/.netlify/functions/structure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
      body: JSON.stringify({
        rawText: textoBase.substring(0, 14000),
        mode: 'con_expediente',
        caseContext: caseCtx
      })
    });

    bar.style.width = '85%';
    status.textContent = 'Finalizando acta…';

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || 'HTTP ' + resp.status);
    }

    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Sin respuesta');

    _actaFinalActa = data.structuredText;
    _actaCurrentStep = 3;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Acta lista para firmar';

    /* Mostrar acta final con formato */
    const preview = document.getElementById('actaFinalPreview');
    if (preview) {
      preview.innerHTML = _actaFinalActa
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/_(30,)_/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
        .replace(/\n/g, '<br>');
    }
    document.getElementById('actaFinalSection').style.display = 'block';

    _updateActaStepIndicators();
    showToast('✅ Paso 3 completado: acta lista para firmar');

  } catch (e) {
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[Acta-Audio] Paso 3 error:', e);
    showToast('❌ Error generando acta: ' + e.message);
  } finally {
    _actaIsProcessing = false;
    btn.textContent = '📝 Paso 3: Generar Acta para Firmar';
    btn.disabled = false;
  }
}

/* ═══ SAVE TO CASE ═══ */
async function saveActaToCase() {
  if (!currentCase || !session) return showToast('⚠ Vincula un caso primero');

  /* Guardar el acta final; si no existe, usar texto editado */
  const actaText = _actaFinalActa || _actaEditedText || _actaRawTranscripcion;
  if (!actaText) return showToast('⚠ Sin texto para guardar');

  const tipo = document.getElementById('actaTipo')?.value || 'testigo';
  const nombre = (document.getElementById('actaNombreDeclarante')?.value || '').trim();
  const fecha = document.getElementById('actaFecha')?.value || '';
  const lugar = (document.getElementById('actaLugar')?.value || '').trim();
  const tipoLabel = { testigo: 'Declaración testigo', denunciante: 'Ratificación denuncia', denunciado: 'Declaración denunciado/a', otro: 'Diligencia' }[tipo];
  const label = `${tipoLabel}${nombre ? ': ' + nombre : ''}`;

  try {
    /* Save as diligencia */
    const { error: errDil } = await sb.from('diligencias').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      diligencia_type: tipo === 'testigo' ? 'declaracion_testigo' : tipo === 'denunciante' ? 'ratificacion' : tipo === 'denunciado' ? 'declaracion_denunciado' : 'otro',
      diligencia_label: label,
      fecha_diligencia: fecha || null,
      extracted_text: actaText,
      ai_summary: `Acta de ${tipoLabel.toLowerCase()}${nombre ? ' de ' + nombre : ''} realizada en ${lugar || '—'} el ${fecha || '—'}`,
      is_processed: true,
      processing_status: 'acta_firmable',
    });
    if (errDil) throw errDil;

    /* Also save as note — include both raw and final */
    const noteContent = `📝 ${label}\n📅 ${fecha || '—'} · 📍 ${lugar || '—'}\n\n` +
      `═══ ACTA FINAL ═══\n${actaText}` +
      (_actaRawTranscripcion ? `\n\n═══ TRANSCRIPCIÓN CRUDA (referencia) ═══\n${_actaRawTranscripcion}` : '');

    await sb.from('case_notes').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      content: noteContent,
    });

    showToast('✅ Acta guardada en diligencias y notas del caso');
  } catch (e) {
    showToast('❌ Error: ' + e.message);
    console.error('Save error:', e);
  }
}

/* ═══ DOWNLOAD WORD ═══ */
async function downloadActaCompleta() {
  const actaText = _actaFinalActa || _actaEditedText;
  if (!actaText) return showToast('⚠ Sin acta para descargar');

  const tipo = document.getElementById('actaTipo')?.value || 'testigo';
  const nombre = (document.getElementById('actaNombreDeclarante')?.value || '').trim();
  const fecha = document.getElementById('actaFecha')?.value || '';
  const tipoLabel = { testigo: 'Declaración de testigo', denunciante: 'Ratificación de denuncia', denunciado: 'Declaración persona denunciada', otro: 'Diligencia' }[tipo];

  /* Intentar usar exportActaToWord de mod-export-word si está disponible */
  if (typeof exportTextToWord === 'function') {
    try {
      exportTextToWord(actaText, `Acta_${tipoLabel.replace(/\s+/g, '_')}_${nombre || 'declarante'}_${fecha || 'sin_fecha'}`);
      showToast('📥 Acta descargada como Word');
      return;
    } catch (e) { console.warn('Export Word fallback:', e); }
  }

  /* Fallback: descargar como .doc simple */
  const blob = new Blob([actaText], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Acta_${tipoLabel.replace(/\s+/g, '_')}_${nombre || 'declarante'}_${fecha || 'sin_fecha'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📥 Acta descargada');
}

/* ═══ UTILIDADES DE UI ═══ */
function copyActaText(text) {
  if (text) {
    navigator.clipboard.writeText(text);
    showToast('📋 Texto copiado');
  }
}

function downloadActaText(text, prefix) {
  if (!text) return;
  const nombre = (document.getElementById('actaNombreDeclarante')?.value || '').trim().replace(/\s+/g, '_') || 'declarante';
  const fecha = document.getElementById('actaFecha')?.value || new Date().toISOString().split('T')[0];
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}_${nombre}_${fecha}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('⬇ Archivo descargado');
}

function resetActaAudio() {
  _actaAudioBlob = null;
  if (_actaAudioUrl) URL.revokeObjectURL(_actaAudioUrl);
  _actaAudioUrl = null;
  _actaDocFile = null;
  _actaDocText = '';
  _actaRawTranscripcion = '';
  _actaEditedText = '';
  _actaFinalActa = '';
  _actaCurrentStep = 0;
  _actaIsProcessing = false;

  /* Re-render panel */
  const panel = document.getElementById('actaAudioPanel');
  if (panel) {
    panel.innerHTML = _buildActaPanelHTML();
    const today = new Date().toISOString().split('T')[0];
    const fechaEl = document.getElementById('actaFecha');
    if (fechaEl) fechaEl.value = today;
  }
}

/* ═══ CSS PARA STEPS ═══ */
(function() {
  if (document.getElementById('acta-audio-css')) return;
  const s = document.createElement('style');
  s.id = 'acta-audio-css';
  s.textContent = `
.acta-step-indicator { opacity: 0.5; }
.acta-step-active {
  opacity: 1;
  background: var(--gold-glow) !important;
  border-color: var(--gold-dim) !important;
  box-shadow: 0 0 8px rgba(79,70,229,.15);
}
.acta-step-done {
  opacity: 1;
  background: rgba(5,150,105,.08) !important;
  border-color: rgba(5,150,105,.25) !important;
  color: var(--green);
}
.acta-step-done::after {
  content: ' ✓';
  color: var(--green);
  font-weight: bold;
}
`;
  document.head.appendChild(s);
})();

/* ═══ AUTO-INJECT ═══ */
const _origOpenCuestionarios = typeof openCuestionarios === 'function' ? openCuestionarios : null;
if (_origOpenCuestionarios) {
  window.openCuestionarios = function() {
    _origOpenCuestionarios.apply(this, arguments);
    setTimeout(injectActaAudioPanel, 600);
  };
} else {
  const _actaObserver = new MutationObserver(() => {
    const cuestView = document.getElementById('viewCuestionarios');
    if (cuestView && cuestView.classList.contains('active')) {
      setTimeout(injectActaAudioPanel, 500);
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    _actaObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  });
}

setTimeout(() => {
  const v = document.getElementById('viewCuestionarios');
  if (v && (v.classList.contains('active') || v.style.display !== 'none')) injectActaAudioPanel();
}, 2000);

console.log('%c🎙️ Módulo Actas-Audio v2.0 cargado — Flujo 3 pasos: Transcribir → Editar → Acta', 'color:#f59e0b;font-weight:bold');
console.log('%c   ✓ ElevenLabs/Whisper (no Claude)  ✓ Texto crudo guardado  ✓ Edición separada  ✓ Acta firmable', 'color:#666');
