/**
 * MOD-ACTAS-AUDIO.JS — Integración Audio + Transcripción en Cuestionarios y Actas
 * ──────────────────────────────────────────────────────────────────────────────────
 * Agrega panel de grabación/carga de audio y transcripción directa dentro de
 * Cuestionarios y Actas, vinculado al caso activo.
 * Dependencias: mod-cuestionarios.js, mod-transcripcion.js (funciones globales)
 */

/* ═══ STATE ═══ */
let _actaAudioBlob = null;
let _actaAudioUrl = null;
let _actaDocFile = null;
let _actaDocText = '';
let _actaTranscripcion = '';
let _actaRecorder = null;
let _actaRecording = false;

/* ═══ INJECT PANEL ═══ */
function injectActaAudioPanel() {
  /* Solo inyectar si estamos en la vista de cuestionarios */
  const container = document.getElementById('viewCuestionarios');
  if (!container || container.style.display === 'none') return;

  /* No duplicar */
  if (document.getElementById('actaAudioPanel')) return;

  const panel = document.createElement('div');
  panel.id = 'actaAudioPanel';
  panel.style.cssText = 'margin-top:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);overflow:hidden';
  panel.innerHTML = `
    <div onclick="toggleActaAudioPanel()" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;background:var(--surface2);border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🎙️</span>
        <div>
          <div style="font-size:13px;font-weight:600">Audio y Transcripción de Acta</div>
          <div style="font-size:10.5px;color:var(--text-muted)">Sube el cuestionario Word + graba o carga el audio de la entrevista</div>
        </div>
      </div>
      <span id="actaAudioToggle" style="font-size:18px;transition:transform .2s">▸</span>
    </div>
    <div id="actaAudioBody" style="display:none;padding:14px">
      <!-- Caso vinculado -->
      <div id="actaAudioCaseInfo" style="margin-bottom:12px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;color:var(--text-muted)">
        ${currentCase ? '⚖️ Caso: <strong style="color:var(--gold)">' + (currentCase.name || currentCase.nueva_resolucion || '—') + '</strong>' : '⚠️ Vincula un caso primero desde el panel de Cuestionarios'}
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
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">📄 Cuestionario de Preguntas (Word)</div>
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
          <!-- Upload audio -->
          <label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text);transition:background .15s" onmouseover="this.style.background='var(--gold-glow)'" onmouseout="this.style.background='var(--surface2)'">
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onchange="handleActaAudioUpload(this.files[0])" style="display:none"/>
            📁 Cargar audio
          </label>
          <!-- Record -->
          <button class="btn-sm" id="actaRecordBtn" onclick="toggleActaRecording()" style="display:flex;align-items:center;gap:4px">
            <span id="actaRecordIcon">⏺</span> <span id="actaRecordLabel">Grabar</span>
          </button>
          <!-- Clear -->
          <button class="btn-sm" id="actaAudioClearBtn" style="display:none" onclick="clearActaAudio()">✕ Quitar audio</button>
        </div>
        <!-- Audio preview -->
        <div id="actaAudioPreview" style="display:none;margin-top:8px">
          <audio id="actaAudioPlayer" controls style="width:100%;height:36px"></audio>
          <div id="actaAudioInfo" style="font-size:10px;color:var(--text-muted);margin-top:4px"></div>
        </div>
      </div>

      <!-- Sección 4: Transcribir -->
      <div style="margin-bottom:14px">
        <button class="btn-save" id="actaTranscribeBtn" onclick="transcribeActaAudio()" disabled style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px">
          🎙️ Transcribir Audio
        </button>
        <div id="actaTransProgress" style="display:none;margin-top:8px">
          <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="actaTransBar" style="height:100%;background:var(--gold);width:0%;transition:width .5s"></div></div>
          <div id="actaTransStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Procesando...</div>
        </div>
      </div>

      <!-- Sección 5: Resultado -->
      <div id="actaResultSection" style="display:none">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">📝 Transcripción</div>
        <textarea id="actaTransResult" style="width:100%;min-height:200px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--bg);color:var(--text);box-sizing:border-box"></textarea>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="btn-save" onclick="saveActaToCase()" style="flex:1">💾 Guardar en el caso</button>
          <button class="btn-sm" onclick="downloadActaCompleta()">📥 Descargar Word</button>
          <button class="btn-sm" onclick="copyActaTranscripcion()">📋 Copiar</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(panel);
  /* Set today's date */
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('actaFecha').value = today;
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
  _actaDocFile = file;
  document.getElementById('actaDocName').textContent = file.name;
  document.getElementById('actaDocClearBtn').style.display = 'inline-block';

  /* Try to extract text */
  const preview = document.getElementById('actaDocPreview');
  try {
    if (file.name.endsWith('.txt')) {
      _actaDocText = await file.text();
    } else {
      /* For Word/PDF, read as base64 and send to AI to extract */
      const reader = new FileReader();
      const base64 = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      /* Use OCR/chat endpoint to extract text */
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    _actaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    _actaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    _actaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      _actaAudioBlob = new Blob(chunks, { type: 'audio/webm' });
      if (_actaAudioUrl) URL.revokeObjectURL(_actaAudioUrl);
      _actaAudioUrl = URL.createObjectURL(_actaAudioBlob);
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

/* ═══ TRANSCRIBE ═══ */
async function transcribeActaAudio() {
  if (!_actaAudioBlob) return;

  const btn = document.getElementById('actaTranscribeBtn');
  const progress = document.getElementById('actaTransProgress');
  const bar = document.getElementById('actaTransBar');
  const status = document.getElementById('actaTransStatus');

  btn.disabled = true;
  btn.textContent = '⏳ Transcribiendo…';
  progress.style.display = 'block';
  bar.style.width = '10%';
  status.textContent = 'Preparando audio…';

  try {
    /* Convert audio to base64 */
    const reader = new FileReader();
    const base64 = await new Promise((res, rej) => {
      reader.onload = () => res(reader.result.split(',')[1]);
      reader.onerror = rej;
      reader.readAsDataURL(_actaAudioBlob);
    });

    bar.style.width = '30%';
    status.textContent = 'Enviando a transcripción…';

    /* Build context */
    const tipo = document.getElementById('actaTipo').value;
    const nombre = document.getElementById('actaNombreDeclarante').value;
    const fecha = document.getElementById('actaFecha').value;
    const lugar = document.getElementById('actaLugar').value;
    const tipoLabel = { testigo: 'testigo', denunciante: 'denunciante', denunciado: 'persona denunciada', otro: 'diligencia' }[tipo] || 'declaración';

    let systemPrompt = `Eres un transcriptor legal experto. Transcribe el audio de una declaración de ${tipoLabel} en un procedimiento disciplinario universitario.`;
    if (_actaDocText) {
      systemPrompt += `\n\nCUESTIONARIO DE PREGUNTAS PREPARADO:\n${_actaDocText}\n\nUsa este cuestionario como guía para estructurar la transcripción: identifica cada pregunta y su respectiva respuesta.`;
    }
    systemPrompt += `\n\nFormato de salida:
- Encabezado: ACTA DE DECLARACIÓN DE ${tipoLabel.toUpperCase()}
- Fecha: ${fecha || 'No especificada'}, Lugar: ${lugar || 'No especificado'}
- Declarante: ${nombre || 'No identificado'}
- Transcribe fielmente, con formato pregunta-respuesta si corresponde
- Incluye marcas de tiempo aproximadas [HH:MM:SS] cada pocos minutos
- Mantén el lenguaje exacto del declarante`;

    /* Determine media type */
    const mimeType = _actaAudioBlob.type || 'audio/webm';
    const mediaType = mimeType.includes('mp3') ? 'audio/mp3' :
                      mimeType.includes('wav') ? 'audio/wav' :
                      mimeType.includes('m4a') ? 'audio/mp4' :
                      mimeType.includes('ogg') ? 'audio/ogg' : 'audio/webm';

    bar.style.width = '50%';
    status.textContent = 'Transcribiendo con IA…';

    const r = await authFetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Transcribe esta grabación de audio de la declaración de ${tipoLabel}: ${nombre || ''}. Incluye todas las preguntas y respuestas fielmente.` }
          ]
        }]
      })
    });

    bar.style.width = '90%';
    status.textContent = 'Procesando resultado…';

    if (!r.ok) throw new Error('Error en la transcripción: ' + r.status);

    const data = await r.json();
    _actaTranscripcion = (data.content || []).map(b => b.text || '').join('');

    /* Show result */
    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Transcripción completada';

    document.getElementById('actaTransResult').value = _actaTranscripcion;
    document.getElementById('actaResultSection').style.display = 'block';

  } catch (e) {
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('Transcription error:', e);
  }

  btn.textContent = '🎙️ Transcribir Audio';
  btn.disabled = !_actaAudioBlob;
}

/* ═══ SAVE TO CASE ═══ */
async function saveActaToCase() {
  if (!currentCase || !session) return showToast('⚠ Vincula un caso primero');

  const transcripcion = document.getElementById('actaTransResult').value.trim();
  if (!transcripcion) return showToast('⚠ Sin transcripción');

  const tipo = document.getElementById('actaTipo').value;
  const nombre = document.getElementById('actaNombreDeclarante').value.trim();
  const fecha = document.getElementById('actaFecha').value;
  const lugar = document.getElementById('actaLugar').value.trim();
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
      extracted_text: transcripcion,
      ai_summary: `Acta de ${tipoLabel.toLowerCase()}${nombre ? ' de ' + nombre : ''} realizada en ${lugar || '—'} el ${fecha || '—'}`,
      is_processed: true,
      processing_status: 'transcrito',
    });
    if (errDil) throw errDil;

    /* Also save as note */
    await sb.from('case_notes').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      content: `📝 ${label}\n📅 ${fecha || '—'} · 📍 ${lugar || '—'}\n\n${transcripcion}`,
    });

    showToast('✅ Acta guardada en diligencias y notas del caso');
  } catch (e) {
    showToast('❌ Error: ' + e.message);
    console.error('Save error:', e);
  }
}

/* ═══ DOWNLOAD WORD ═══ */
async function downloadActaCompleta() {
  const transcripcion = document.getElementById('actaTransResult')?.value?.trim();
  if (!transcripcion) return;

  const tipo = document.getElementById('actaTipo').value;
  const nombre = document.getElementById('actaNombreDeclarante').value.trim();
  const fecha = document.getElementById('actaFecha').value;
  const lugar = document.getElementById('actaLugar').value.trim();
  const tipoLabel = { testigo: 'Declaración de testigo', denunciante: 'Ratificación de denuncia', denunciado: 'Declaración persona denunciada', otro: 'Diligencia' }[tipo];

  const header = `ACTA DE ${tipoLabel.toUpperCase()}\n\nExpediente: ${currentCase?.name || currentCase?.nueva_resolucion || '—'}\nFecha: ${fecha || '—'}\nLugar: ${lugar || '—'}\nDeclarante: ${nombre || '—'}\n${'─'.repeat(60)}\n\n`;

  const cuestionario = _actaDocText ? `CUESTIONARIO DE PREGUNTAS:\n${'─'.repeat(40)}\n${_actaDocText}\n\n${'─'.repeat(60)}\n\n` : '';

  const fullText = header + cuestionario + 'TRANSCRIPCIÓN:\n' + '─'.repeat(40) + '\n' + transcripcion;

  const blob = new Blob([fullText], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Acta_${tipoLabel.replace(/\s+/g, '_')}_${nombre || 'declarante'}_${fecha || 'sin_fecha'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📥 Acta descargada');
}

/* ═══ COPY ═══ */
function copyActaTranscripcion() {
  const text = document.getElementById('actaTransResult')?.value;
  if (text) {
    navigator.clipboard.writeText(text);
    showToast('📋 Transcripción copiada');
  }
}

/* ═══ AUTO-INJECT ═══ */
/* Hook into openCuestionarios to inject panel */
const _origOpenCuestionarios = typeof openCuestionarios === 'function' ? openCuestionarios : null;
if (_origOpenCuestionarios) {
  window.openCuestionarios = function() {
    _origOpenCuestionarios.apply(this, arguments);
    setTimeout(injectActaAudioPanel, 600);
  };
} else {
  /* Fallback: observer */
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

/* Also try injecting if cuestionarios is already visible */
setTimeout(() => {
  const v = document.getElementById('viewCuestionarios');
  if (v && (v.classList.contains('active') || v.style.display !== 'none')) injectActaAudioPanel();
}, 2000);

console.log('%c🎙️ Módulo Actas-Audio cargado', 'color:#f59e0b;font-weight:bold');
