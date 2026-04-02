/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v9.1 · 2026-04-02 · Fiscalito / UMAG
   =========================================================
   v9.1: Fix grabadora + error handling Paso 2/3
   · Grabadora: quita sampleRate constraint (OverconstrainedError),
     pre-checks mediaDevices/MediaRecorder, timeout getUserMedia 15 s,
     onerror handler, mensajes de error descriptivos con showToast
   · Paso 2/3: timeout 60 s con AbortController, validación Content-Type
     antes de parsear JSON, errores descriptivos por código HTTP
   v9.0: UI unificada estilo Actas-Audio (3 pasos visibles)
   · Paso 1: Grabar/subir → transcribir con ElevenLabs/Whisper
   · Paso 2: Edición IA — texto refundido con cuestionario guía
   · Paso 3: Acta formal lista para firmar
   · Renderiza en fnPanel (Chat IA → F11)
   ========================================================= */

/* ══════════════════ CONSTANTES ══════════════════ */
const T_MAX_INPUT_MB  = 100;
const T_MAX_INPUT     = T_MAX_INPUT_MB * 1024 * 1024;
const T_BASE64_LIMIT  = 25 * 1024 * 1024;
const T_STORAGE_BUCKET = 'transcripcion-audio';

const T_EXTS = [
  '.mp3','.wav','.m4a','.aac','.ogg','.oga','.opus','.flac',
  '.wma','.amr','.aiff','.aif','.caf','.webm','.weba','.3gp',
  '.spx','.ac3','.mka',
  '.mp4','.m4v','.mov','.avi','.mkv','.wmv','.flv','.ts','.mts',
];
const T_ACCEPT = 'audio/*,video/*,' + T_EXTS.join(',');

const T_MIME = {
  mp3:'audio/mpeg',wav:'audio/wav',wave:'audio/wav',m4a:'audio/mp4',
  aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/opus',
  flac:'audio/flac',wma:'audio/x-ms-wma',amr:'audio/amr',
  aiff:'audio/aiff',aif:'audio/aiff',caf:'audio/x-caf',
  webm:'audio/webm',weba:'audio/webm','3gp':'audio/3gpp',
  mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',
  avi:'video/x-msvideo',mkv:'video/x-matroska',
  wmv:'video/x-ms-wmv',flv:'video/x-flv',ts:'video/mp2t',mts:'video/mp2t',
};

/* ══════════════════ ESTADO ══════════════════ */
let _f11AudioBlob = null;
let _f11AudioUrl  = null;
let _f11DocFile   = null;
let _f11DocText   = '';
let _f11RawText   = '';   // Paso 1: texto crudo
let _f11EditedText = '';  // Paso 2: texto refundido
let _f11FinalActa  = ''; // Paso 3: acta firmable
let _f11Recorder   = null;
let _f11Recording  = false;
let _f11CurrentStep = 0;  // 0=inicio, 1=transcrito, 2=editado, 3=acta
let _f11Processing = false;

/* ── Legacy state object (para compatibilidad con index.html) ── */
const transcripcion = {
  isRecording:false, mediaRecorder:null, audioChunks:[],
  audioFile:null, audioUrl:null, audioDuration:null,
  baseDocText:'', baseDocName:'',
  rawText:'', structuredText:'', actaFinal:'', summary:'',
  segments:[], step:'upload',
  isProcessing:false, linkedCase:null,
  meta:{ tipoDeclarante:'testigo', nombreDeclarante:'', fecha:'', lugar:'Punta Arenas' },
};

/* ══════════════════ UTILIDADES ══════════════════ */
function _f11Ext(n) { if(!n)return''; const p=n.toLowerCase().split('.'); return p.length>1?p.pop():''; }
function _f11Mime(file) { const e=_f11Ext(file.name); return T_MIME[e]||(file.type&&file.type!=='application/octet-stream'?file.type:'audio/mpeg'); }
function _f11Sz(b) { if(b<1024)return b+' B'; if(b<1048576)return(b/1024).toFixed(1)+' KB'; return(b/1048576).toFixed(1)+' MB'; }
function _f11ToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 0x8000;
  let raw = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    raw += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(raw);
}

/* ══════════════════ PROMPTS PARA EDICIÓN IA ══════════════════ */
const _F11_PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).

OBJETIVO: Elaborar un Texto Refundido, Coordinado y Sistematizado que incorpore el contenido de la declaración transcrita, integrándolo al acta.

REGLAS DE EDICIÓN:
- Conservar la redacción en primera persona y el estilo del declarante
- Solo correcciones gramaticales menores: concordancia, puntuación, eliminación de muletillas
- NO agregar información nueva ni interpretar intenciones
- Conservar comillas, fechas, cifras y nombres propios exactamente como están
- Tono formal, claro y preciso, coherente con documento legal
- Respetar la terminología jurídica y la secuencia cronológica

ENTREGA: Solo la versión final, sin comentarios ni marcadores de edición.`;

const _F11_PROMPTS = {
  pregunta_respuesta: _F11_PROMPT_BASE + `

FORMATO: Pregunta-Respuesta
- Estructura como diálogo formal entre Fiscal y declarante
- Cada pregunta: "FISCAL:" / Cada respuesta: "DECLARANTE:"
- Párrafos separados, numerados si es posible`,

  fill_acta: _F11_PROMPT_BASE + `

MODO LLENAR ACTA EXISTENTE:
Se adjunta un DOCUMENTO BASE (plantilla/acta con preguntas).
LLENA esa plantilla con las respuestas del audio transcrito.

REGLAS:
1. PRESERVA la estructura del documento base
2. Después de cada pregunta, inserta la respuesta del audio
3. Si no hay respuesta: "[Sin respuesta en el audio]"
4. Info adicional al final como "DECLARACIÓN COMPLEMENTARIA"
5. Agrega cierre formal con espacios para firmas`,

  con_expediente: _F11_PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG — con datos del expediente.
Usa los DATOS DEL EXPEDIENTE para completar TODOS los campos del encabezado.
NO dejes [COMPLETAR] si el dato está disponible.

Genera con esta estructura:

UNIVERSIDAD DE MAGALLANES

**ACTA DE [TIPO DE ACTA según metadatos]**

En [LUGAR], a [FECHA], ante la Fiscal Investigadora, en el marco del procedimiento [TIPO] Rol N° [ROL], comparece:

**[NOMBRE DEL DECLARANTE]**, en calidad de [CALIDAD PROCESAL], previamente advertido/a de:
- Obligación de decir verdad (art. 17 Ley 19.880)
- Penas del falso testimonio (arts. 206 y ss. CP)
- Derecho a no declarar contra sí mismo/a (si corresponde)

Declara no tener inhabilidad y expone:

[CUERPO EN FORMATO Q&A]

Leída que le fue su declaración, se ratifica y firma.

_________________________________
[NOMBRE DECLARANTE] / [CALIDAD]

_________________________________
Fiscal Investigadora`
};

/* ══════════════════ STREAMING HELPER ══════════════════ */
/**
 * Llama a /api/chat-stream (edge function) con streaming SSE.
 * Evita el timeout de 26 s de Netlify Functions.
 * @param {Object} opts - { systemPrompt, userMsg, maxTokens, onProgress(text) }
 * @returns {Promise<string>} Texto completo generado
 */
async function _f11StreamStructure({ systemPrompt, userMsg, maxTokens, onProgress }){
  let authToken = '';
  try {
    if(typeof session!=='undefined' && session?.access_token){ authToken = session.access_token; }
    else if(typeof sb!=='undefined'){
      const {data:sessData} = await sb.auth.getSession();
      authToken = sessData?.session?.access_token || '';
    }
  } catch(e){}

  if(!authToken) throw new Error('Sesión no activa. Inicia sesión para usar esta función.');

  const resp = await fetch('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 5000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });

  if(!resp.ok){
    const ct = resp.headers.get('content-type') || '';
    let errMsg = 'HTTP ' + resp.status;
    try {
      if(ct.includes('json')){ const d = await resp.json(); errMsg = d.error || errMsg; }
      else { const t = await resp.text(); errMsg = t.substring(0,200) || errMsg; }
    } catch(e){}
    if(resp.status===401) throw new Error('Sesión expirada. Recarga la página e inicia sesión.');
    if(resp.status===500) throw new Error('Error en el servidor: ' + errMsg);
    throw new Error('Error: ' + errMsg);
  }

  /* ── Parsear stream SSE de Anthropic ── */
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while(true){
    const { done, value } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // guardar línea incompleta

    for(const line of lines){
      if(!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if(jsonStr === '[DONE]') continue;
      try {
        const evt = JSON.parse(jsonStr);
        if(evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta'){
          accumulated += evt.delta.text;
          if(onProgress) onProgress(accumulated);
        }
      } catch(e){ /* ignorar líneas no-JSON */ }
    }
  }

  if(!accumulated.trim()) throw new Error('La IA no generó texto. Verifica que ANTHROPIC_API_KEY esté configurada en Netlify.');
  return accumulated;
}

/* ══════════════════ MONKEY-PATCH showFnPanel ══════════════════ */
(function patchShowFnPanel(){
  const tryP=()=>{
    if(typeof window.showFnPanel!=='function'){setTimeout(tryP,50);return;}
    if(window.__f11Patched)return; window.__f11Patched=true;
    const orig=window.showFnPanel;
    window.showFnPanel=function(code){
      if(code==='F11'){renderF11Panel();return;} orig.call(this,code);
    };
  }; tryP();
})();

/* ══════════════════ CSS ══════════════════ */
(function(){
  if(document.getElementById('f11-steps-css'))return;
  const s=document.createElement('style');
  s.id='f11-steps-css';
  s.textContent=`
.f11-step-indicator { opacity:0.5; }
.f11-step-active {
  opacity:1;
  background:var(--gold-glow) !important;
  border-color:var(--gold-dim) !important;
  box-shadow:0 0 8px rgba(79,70,229,.15);
}
.f11-step-done {
  opacity:1;
  background:rgba(5,150,105,.08) !important;
  border-color:rgba(5,150,105,.25) !important;
  color:var(--green);
}
.f11-step-done::after {
  content:' ✓';
  color:var(--green);
  font-weight:bold;
}
.form-field label {
  display:block; font-size:10px; text-transform:uppercase;
  letter-spacing:.4px; color:var(--text-muted); margin-bottom:3px;
}
`;
  document.head.appendChild(s);
})();

/* ════════════════════════════════════════════
   RENDER PRINCIPAL — F11
   ════════════════════════════════════════════ */
function renderF11Panel(){
  const panel = document.getElementById('fnPanel');
  const msgs  = document.getElementById('msgs');
  const ragBar = document.getElementById('ragBar');
  if(!panel) return;
  if(msgs) msgs.style.display='none';
  if(ragBar) ragBar.style.display='none';
  panel.style.cssText='display:flex;flex-direction:column;padding:0;overflow:hidden;flex:1;';
  panel.innerHTML = _buildF11PanelHTML();
  _initF11Panel();
  buildF11Chips();
}

function updateTransPanel(){ renderF11Panel(); }

/* ══════════════════ BUILD HTML ══════════════════ */
function _buildF11PanelHTML(){
  const stepLabels = ['Transcribir Audio', 'Editar con IA', 'Acta para Firmar'];
  const stepIcons  = ['🎙️', '✏️', '📝'];
  const lnk = (typeof currentCase !== 'undefined' ? currentCase : null);

  return `
  <div style="flex:1;overflow-y:auto;padding:16px 20px;max-width:900px;margin:0 auto;width:100%;box-sizing:border-box">

    <!-- Título -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:16px">🎙️</span>
      <div>
        <div style="font-size:14px;font-weight:600">Audio y Transcripción de Acta</div>
        <div style="font-size:10.5px;color:var(--text-muted)">3 pasos: Transcribir → Editar → Acta lista</div>
      </div>
    </div>

    <!-- Indicador de pasos -->
    <div id="f11StepsIndicator" style="display:flex;gap:4px;margin-bottom:14px">
      ${stepLabels.map((label, i) => `
        <div class="f11-step-indicator ${i === 0 ? 'f11-step-active' : ''}" id="f11StepInd${i}" style="flex:1;text-align:center;padding:8px 6px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);transition:all .2s">
          <div style="font-size:14px">${stepIcons[i]}</div>
          <div style="font-size:10px;font-weight:600;margin-top:2px">Paso ${i + 1}</div>
          <div style="font-size:9.5px;color:var(--text-muted)">${label}</div>
        </div>
      `).join('')}
    </div>

    <!-- Caso vinculado -->
    <div id="f11CaseInfo" style="margin-bottom:12px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;color:var(--text-muted)">
      ${lnk
        ? '⚖️ Caso: <strong style="color:var(--gold)">' + (lnk.name || lnk.nueva_resolucion || '—') + '</strong>'
        : '⚠️ Vincula un caso primero desde el panel de Cuestionarios'}
    </div>

    <!-- Sección: Datos del Acta -->
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">📋 Datos del Acta</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="form-field">
          <label>Tipo de acta</label>
          <select id="f11Tipo" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%">
            <option value="testigo">Declaración de testigo</option>
            <option value="denunciante">Ratificación de denuncia</option>
            <option value="denunciado">Declaración persona denunciada</option>
            <option value="otro">Otra diligencia</option>
          </select>
        </div>
        <div class="form-field">
          <label>Nombre del declarante</label>
          <input id="f11NombreDeclarante" placeholder="Nombre completo" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div class="form-field">
          <label>Fecha de la diligencia</label>
          <input id="f11Fecha" type="date" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
        </div>
        <div class="form-field">
          <label>Lugar</label>
          <input id="f11Lugar" value="Punta Arenas" style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box"/>
        </div>
      </div>
    </div>

    <!-- Sección: Audio -->
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-dim)">🎙️ Audio de la Entrevista</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text);transition:background .15s" onmouseover="this.style.background='var(--gold-glow)'" onmouseout="this.style.background='var(--surface2)'">
          <input type="file" accept="${T_ACCEPT}" onchange="f11HandleAudioUpload(this.files[0])" style="display:none"/>
          📁 Cargar audio
        </label>
        <button class="btn-sm" id="f11RecordBtn" onclick="f11ToggleRecording()" style="display:flex;align-items:center;gap:4px">
          <span id="f11RecordIcon">⏺</span> <span id="f11RecordLabel">Grabar</span>
        </button>
        <button class="btn-sm" id="f11AudioClearBtn" style="display:none" onclick="f11ClearAudio()">✕ Quitar audio</button>
      </div>
      <div id="f11AudioPreview" style="display:none;margin-top:8px">
        <audio id="f11AudioPlayer" controls style="width:100%;height:36px"></audio>
        <div id="f11AudioInfo" style="font-size:10px;color:var(--text-muted);margin-top:4px"></div>
      </div>
    </div>

    <!-- PASO 1: Botón Transcribir -->
    <div id="f11Step1Section" style="margin-bottom:14px">
      <button class="btn-save" id="f11TranscribeBtn" onclick="f11Paso1_Transcribir()" disabled style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px">
        🎙️ Paso 1: Transcribir Audio (ElevenLabs/Whisper)
      </button>
      <div id="f11TransProgress" style="display:none;margin-top:8px">
        <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="f11TransBar" style="height:100%;background:var(--gold);width:0%;transition:width .5s"></div></div>
        <div id="f11TransStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Procesando...</div>
      </div>
    </div>

    <!-- PASO 1 Resultado -->
    <div id="f11RawResultSection" style="display:none;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-dim)">🎙️ Paso 1: Transcripción cruda (texto extraído del audio)</div>
      <textarea id="f11RawResult" style="width:100%;min-height:120px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--bg);color:var(--text);box-sizing:border-box" readonly></textarea>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        <button class="btn-save" onclick="f11SaveRawToCase()" style="flex:1">💾 Guardar transcripción en el caso</button>
        <button class="btn-sm" onclick="f11CopyText(_f11RawText)">📋 Copiar</button>
        <button class="btn-sm" onclick="f11DownloadText(_f11RawText, 'transcripcion_cruda')">⬇ .txt</button>
      </div>
    </div>

    <!-- PASO 2: Botón Editar -->
    <div id="f11Step2Section" style="display:none;margin-bottom:14px">
      <div style="background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:10px;margin-bottom:8px">
        <div style="font-size:11px;color:var(--gold);font-weight:600">✏️ Paso 2: Edición con IA</div>
        <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">Se usará el cuestionario como guía para estructurar las respuestas en un texto refundido, coordinado y sistematizado.</div>
      </div>
      <!-- Cuestionario Word — guía para edición (adjuntar aquí en Paso 2) -->
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--text-dim)">📄 Adjuntar Cuestionario (Word/PDF) — opcional, guía para editar</div>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="flex:1;display:flex;align-items:center;gap:6px;padding:10px;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text-muted);transition:border-color .2s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
            <input type="file" accept=".docx,.doc,.pdf,.txt" onchange="f11HandleDocUpload(this.files[0])" style="display:none"/>
            📎 <span id="f11DocName">Seleccionar archivo de preguntas…</span>
          </label>
          <button class="btn-sm" id="f11DocClearBtn" style="display:none" onclick="f11ClearDoc()">✕</button>
        </div>
        <div id="f11DocPreview" style="display:none;margin-top:6px;padding:8px 10px;background:var(--bg);border-radius:var(--radius);font-size:11px;max-height:120px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim)"></div>
      </div>
      <button class="btn-save" id="f11EditBtn" onclick="f11Paso2_Editar()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px">
        ✏️ Paso 2: Editar y Refundir con IA
      </button>
      <div id="f11EditProgress" style="display:none;margin-top:8px">
        <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="f11EditBar" style="height:100%;background:#818cf8;width:0%;transition:width .5s"></div></div>
        <div id="f11EditStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Editando...</div>
      </div>
    </div>

    <!-- PASO 2 Resultado -->
    <div id="f11EditedResultSection" style="display:none;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text-dim)">✏️ Paso 2: Texto Refundido (editado con IA)</div>
      <textarea id="f11EditedResult" style="width:100%;min-height:150px;padding:10px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-sans);resize:vertical;background:var(--bg);color:var(--text);box-sizing:border-box"></textarea>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button class="btn-sm" onclick="f11CopyText(_f11EditedText)">📋 Copiar editado</button>
        <button class="btn-sm" onclick="f11DownloadText(_f11EditedText, 'texto_refundido')">⬇ Descargar .txt</button>
      </div>
    </div>

    <!-- PASO 3: Botón Generar Acta -->
    <div id="f11Step3Section" style="display:none;margin-bottom:14px">
      <div style="background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.25);border-radius:var(--radius);padding:10px;margin-bottom:8px">
        <div style="font-size:11px;color:var(--green);font-weight:600">📝 Paso 3: Acta Lista para Firmar</div>
        <div style="font-size:10.5px;color:var(--text-dim);margin-top:4px">Se generará el acta formal con encabezado UMAG, advertencias legales y espacios para firmas.</div>
      </div>
      <button class="btn-save" id="f11GenerateBtn" onclick="f11Paso3_GenerarActa()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--green);border-color:var(--green)">
        📝 Paso 3: Generar Acta para Firmar
      </button>
      <div id="f11GenerateProgress" style="display:none;margin-top:8px">
        <div style="background:var(--surface2);border-radius:8px;height:8px;overflow:hidden"><div id="f11GenerateBar" style="height:100%;background:var(--green);width:0%;transition:width .5s"></div></div>
        <div id="f11GenerateStatus" style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Generando acta...</div>
      </div>
    </div>

    <!-- PASO 3 Resultado: Acta final -->
    <div id="f11FinalSection" style="display:none;margin-bottom:14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--green)">📝 Acta Lista para Firmar</div>
      <div id="f11FinalPreview" style="background:#fff;color:#111;border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;font-size:13px;line-height:1.8;max-height:400px;overflow-y:auto;font-family:'EB Garamond',Georgia,serif"></div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button class="btn-save" onclick="f11SaveToCase()" style="flex:1">💾 Guardar en el caso</button>
        <button class="btn-sm" onclick="f11DownloadWord()" style="background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:600">📄 Descargar Word</button>
        <button class="btn-sm" onclick="f11CopyText(_f11FinalActa)">📋 Copiar</button>
        <button class="btn-sm" onclick="f11Reset()">↺ Nueva</button>
      </div>
    </div>

  </div>
  `;
}

/* ══════════════════ INIT AFTER RENDER ══════════════════ */
function _initF11Panel(){
  /* Fecha de hoy */
  const today = new Date().toISOString().split('T')[0];
  const fechaEl = document.getElementById('f11Fecha');
  if(fechaEl) fechaEl.value = today;

  /* Restaurar estado si hay datos previos */
  if(_f11AudioBlob){
    const player = document.getElementById('f11AudioPlayer');
    if(player && _f11AudioUrl) player.src = _f11AudioUrl;
    const prev = document.getElementById('f11AudioPreview');
    if(prev) prev.style.display = 'block';
    const clearBtn = document.getElementById('f11AudioClearBtn');
    if(clearBtn) clearBtn.style.display = 'inline-block';
    const info = document.getElementById('f11AudioInfo');
    if(info) info.textContent = `${_f11AudioBlob.name || 'Grabación'} · ${_f11Sz(_f11AudioBlob.size)}`;
    const btn = document.getElementById('f11TranscribeBtn');
    if(btn) btn.disabled = false;
  }
  if(_f11DocText){
    const nameEl = document.getElementById('f11DocName');
    if(nameEl) nameEl.textContent = _f11DocFile?.name || 'Documento cargado';
    const clearBtn = document.getElementById('f11DocClearBtn');
    if(clearBtn) clearBtn.style.display = 'inline-block';
  }
  if(_f11RawText){
    const raw = document.getElementById('f11RawResult');
    if(raw) raw.value = _f11RawText;
    const sec = document.getElementById('f11RawResultSection');
    if(sec) sec.style.display = 'block';
    const s2 = document.getElementById('f11Step2Section');
    if(s2) s2.style.display = 'block';
  }
  if(_f11EditedText){
    const edited = document.getElementById('f11EditedResult');
    if(edited) edited.value = _f11EditedText;
    const sec = document.getElementById('f11EditedResultSection');
    if(sec) sec.style.display = 'block';
    const s3 = document.getElementById('f11Step3Section');
    if(s3) s3.style.display = 'block';
  }
  if(_f11FinalActa){
    const preview = document.getElementById('f11FinalPreview');
    if(preview){
      preview.innerHTML = _f11FinalActa
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/_{30,}/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
        .replace(/\n/g, '<br>');
    }
    const sec = document.getElementById('f11FinalSection');
    if(sec) sec.style.display = 'block';
  }
  _f11UpdateSteps();
}

/* ══════════════════ STEP INDICATORS ══════════════════ */
function _f11UpdateSteps(){
  for(let i=0;i<3;i++){
    const el = document.getElementById('f11StepInd'+i);
    if(!el)continue;
    el.classList.remove('f11-step-active','f11-step-done');
    if(i < _f11CurrentStep)      el.classList.add('f11-step-done');
    else if(i === _f11CurrentStep) el.classList.add('f11-step-active');
  }
}

/* ══════════════════ DOCUMENT UPLOAD ══════════════════ */
async function f11HandleDocUpload(file){
  if(!file) return;
  if(file.size > 50*1024*1024){ showToast('⚠ El archivo excede 50 MB'); return; }
  const ok = /\.(txt|pdf|doc|docx)$/i.test(file.name);
  if(!ok){ showToast('⚠ Solo se aceptan TXT, PDF o Word'); return; }

  _f11DocFile = file;
  document.getElementById('f11DocName').textContent = file.name;
  document.getElementById('f11DocClearBtn').style.display = 'inline-block';
  const preview = document.getElementById('f11DocPreview');

  try {
    if(file.name.endsWith('.txt')){
      _f11DocText = await file.text();
    } else {
      const reader = new FileReader();
      const base64 = await new Promise((res,rej)=>{
        reader.onload=()=>res(reader.result.split(',')[1]);
        reader.onerror=rej;
        reader.readAsDataURL(file);
      });
      const r = await authFetch(CHAT_ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:4000,
          messages:[{
            role:'user',
            content:[
              {type:'document', source:{type:'base64', media_type:file.type||'application/octet-stream', data:base64}},
              {type:'text', text:'Extrae el texto completo de este documento. Incluye todas las preguntas. Responde SOLO con el texto extraído, sin comentarios.'}
            ]
          }]
        })
      });
      if(r.ok){
        const data = await r.json();
        _f11DocText = (data.content||[]).map(b=>b.text||'').join('');
      }
    }
    if(_f11DocText){
      preview.textContent = _f11DocText.substring(0,2000) + (_f11DocText.length>2000?'\n...(continúa)':'');
      preview.style.display = 'block';
    }
  } catch(e){
    console.error('Error reading doc:',e);
    preview.textContent = '⚠ No se pudo leer el archivo.';
    preview.style.display = 'block';
  }
}

function f11ClearDoc(){
  _f11DocFile = null;
  _f11DocText = '';
  document.getElementById('f11DocName').textContent = 'Seleccionar archivo de preguntas…';
  document.getElementById('f11DocClearBtn').style.display = 'none';
  document.getElementById('f11DocPreview').style.display = 'none';
}

/* ══════════════════ AUDIO UPLOAD ══════════════════ */
function f11HandleAudioUpload(file){
  if(!file)return;
  if(file.size > T_MAX_INPUT){ showToast('⚠ El audio excede '+T_MAX_INPUT_MB+' MB'); return; }

  _f11AudioBlob = file;
  if(_f11AudioUrl) URL.revokeObjectURL(_f11AudioUrl);
  _f11AudioUrl = URL.createObjectURL(file);

  /* Sync legacy state */
  transcripcion.audioFile = file;
  transcripcion.audioUrl = _f11AudioUrl;

  const player = document.getElementById('f11AudioPlayer');
  if(player) player.src = _f11AudioUrl;
  const prev = document.getElementById('f11AudioPreview');
  if(prev) prev.style.display = 'block';
  const clearBtn = document.getElementById('f11AudioClearBtn');
  if(clearBtn) clearBtn.style.display = 'inline-block';
  const info = document.getElementById('f11AudioInfo');
  if(info) info.textContent = `${file.name} · ${_f11Sz(file.size)}`;
  const btn = document.getElementById('f11TranscribeBtn');
  if(btn) btn.disabled = false;
}

function f11ClearAudio(){
  _f11AudioBlob = null;
  if(_f11AudioUrl) URL.revokeObjectURL(_f11AudioUrl);
  _f11AudioUrl = null;
  transcripcion.audioFile = null;
  transcripcion.audioUrl = null;

  const prev = document.getElementById('f11AudioPreview');
  if(prev) prev.style.display = 'none';
  const clearBtn = document.getElementById('f11AudioClearBtn');
  if(clearBtn) clearBtn.style.display = 'none';
  const btn = document.getElementById('f11TranscribeBtn');
  if(btn) btn.disabled = true;
  if(_f11Recording) f11StopRecording();
}

/* ══════════════════ AUDIO RECORDING ══════════════════ */
function f11ToggleRecording(){
  if(_f11Recording) f11StopRecording();
  else f11StartRecording();
}

async function f11StartRecording(){
  /* ── Pre-checks ── */
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showToast('⚠ Tu navegador no soporta grabación de audio. Usa Chrome o Edge en HTTPS.');
    return;
  }
  if(typeof MediaRecorder==='undefined'){
    showToast('⚠ MediaRecorder no disponible. Actualiza tu navegador.');
    return;
  }

  /* Mostrar estado "solicitando micrófono" inmediatamente */
  const icon = document.getElementById('f11RecordIcon');
  const label = document.getElementById('f11RecordLabel');
  const recBtn = document.getElementById('f11RecordBtn');
  if(icon) icon.textContent = '🎤';
  if(label) label.textContent = 'Permiso…';
  if(recBtn){ recBtn.disabled = true; }

  try {
    /* getUserMedia con timeout de 15 s por si el diálogo de permisos queda colgado */
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio:{ echoCancellation:true, noiseSuppression:true }
      }),
      new Promise((_,rej) => setTimeout(()=>rej(new Error('Tiempo agotado esperando permiso de micrófono')),15000))
    ]);

    const chunks = [];
    const mimeOptions = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    let selectedMime = '';
    for(const m of mimeOptions){
      if(MediaRecorder.isTypeSupported(m)){ selectedMime = m; break; }
    }

    _f11Recorder = new MediaRecorder(stream, selectedMime ? {mimeType:selectedMime} : {});
    _f11Recorder.ondataavailable = e => { if(e.data.size>0) chunks.push(e.data); };
    _f11Recorder.onerror = e => {
      console.error('[F11] MediaRecorder error:', e);
      showToast('❌ Error en grabación: '+(e.error?.message||'desconocido'));
      f11StopRecording();
    };
    _f11Recorder.onstop = () => {
      stream.getTracks().forEach(t=>t.stop());
      const mimeType = _f11Recorder.mimeType || selectedMime || 'audio/webm';
      const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      _f11AudioBlob = new Blob(chunks, {type:mimeType});

      if(_f11AudioUrl) URL.revokeObjectURL(_f11AudioUrl);
      _f11AudioUrl = URL.createObjectURL(_f11AudioBlob);

      const fileName = 'grabacion_' + new Date().toISOString().slice(0,16).replace(/[T:]/g,'-') + '.' + ext;
      _f11AudioBlob = new File([_f11AudioBlob], fileName, {type:mimeType});

      transcripcion.audioFile = _f11AudioBlob;
      transcripcion.audioUrl = _f11AudioUrl;

      const player = document.getElementById('f11AudioPlayer');
      if(player) player.src = _f11AudioUrl;
      const prev = document.getElementById('f11AudioPreview');
      if(prev) prev.style.display = 'block';
      const clearBtn = document.getElementById('f11AudioClearBtn');
      if(clearBtn) clearBtn.style.display = 'inline-block';
      const info = document.getElementById('f11AudioInfo');
      if(info) info.textContent = `Grabación · ${_f11Sz(_f11AudioBlob.size)}`;
      const btn = document.getElementById('f11TranscribeBtn');
      if(btn) btn.disabled = false;
    };
    _f11Recorder.start(1000);
    _f11Recording = true;
    transcripcion.isRecording = true;

    if(icon) icon.textContent = '⏹';
    if(label) label.textContent = 'Detener';
    if(recBtn){ recBtn.disabled = false; recBtn.style.background='var(--red)'; recBtn.style.color='#fff'; }
    showToast('🎙️ Grabando…');
  } catch(e){
    console.error('[F11] Error al iniciar grabación:', e);
    _f11Recording = false;
    transcripcion.isRecording = false;
    if(icon) icon.textContent = '⏺';
    if(label) label.textContent = 'Grabar';
    if(recBtn){ recBtn.disabled = false; recBtn.style.background=''; recBtn.style.color=''; }

    let msg = e.message || String(e);
    if(e.name==='NotAllowedError' || msg.includes('Permission'))
      msg = 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.';
    else if(e.name==='NotFoundError' || msg.includes('not found'))
      msg = 'No se detectó micrófono conectado.';
    else if(e.name==='OverconstrainedError')
      msg = 'El micrófono no soporta la configuración solicitada.';
    showToast('❌ Micrófono: ' + msg);
  }
}

function f11StopRecording(){
  if(_f11Recorder && _f11Recorder.state !== 'inactive') _f11Recorder.stop();
  _f11Recording = false;
  transcripcion.isRecording = false;

  const icon = document.getElementById('f11RecordIcon');
  const label = document.getElementById('f11RecordLabel');
  const recBtn = document.getElementById('f11RecordBtn');
  if(icon) icon.textContent = '⏺';
  if(label) label.textContent = 'Grabar';
  if(recBtn){ recBtn.style.background=''; recBtn.style.color=''; }
}

/* ════════════════════════════════════════════════════════
   PASO 1: TRANSCRIBIR AUDIO — ElevenLabs/Whisper
   sb.functions.invoke('transcribe-audio')
   ════════════════════════════════════════════════════════ */
async function f11Paso1_Transcribir(){
  if(!_f11AudioBlob || _f11Processing) return;

  const btn = document.getElementById('f11TranscribeBtn');
  const progress = document.getElementById('f11TransProgress');
  const bar = document.getElementById('f11TransBar');
  const status = document.getElementById('f11TransStatus');

  _f11Processing = true;
  transcripcion.isProcessing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Transcribiendo con ElevenLabs/Whisper…';
  progress.style.display = 'block';
  bar.style.width = '5%';
  bar.style.background = 'var(--gold)';
  status.textContent = 'Preparando audio…';

  let storagePath = null;

  try {
    const file = _f11AudioBlob;
    const useStorage = file.size > T_BASE64_LIMIT;
    let invokeBody;

    if(useStorage){
      bar.style.width = '10%';
      status.textContent = 'Subiendo audio a almacenamiento (' + _f11Sz(file.size) + ')…';

      const userId = (typeof session!=='undefined' && session?.user?.id) || 'anon';
      const ts = Date.now();
      const ext = _f11Ext(file.name) || 'bin';
      const path = `${userId}/${ts}.${ext}`;

      const { data, error } = await sb.storage.from(T_STORAGE_BUCKET).upload(path, file, {
        contentType: _f11Mime(file), upsert: true
      });

      if(error){
        if(error.message?.includes('not found') || error.statusCode === 404){
          await sb.storage.createBucket(T_STORAGE_BUCKET, {public:false});
          const retry = await sb.storage.from(T_STORAGE_BUCKET).upload(path, file, {contentType:_f11Mime(file), upsert:true});
          if(retry.error) throw new Error(retry.error.message);
        } else {
          throw new Error('Error subiendo audio: ' + error.message);
        }
      }
      storagePath = path;
      invokeBody = { storagePath: storagePath, mimeType: _f11Mime(file) };
      bar.style.width = '25%';
      status.textContent = 'Audio subido. Enviando a transcripción…';
    } else {
      bar.style.width = '10%';
      status.textContent = 'Codificando audio (' + _f11Sz(file.size) + ')…';
      const arrayBuffer = await file.arrayBuffer();
      const base64Audio = _f11ToBase64(arrayBuffer);
      invokeBody = { audio: base64Audio, mimeType: _f11Mime(file) };
      bar.style.width = '25%';
      status.textContent = 'Enviando a transcripción…';
    }

    bar.style.width = '35%';
    status.textContent = 'Transcribiendo con ElevenLabs/Whisper…';

    const { data, error } = await sb.functions.invoke('transcribe-audio', { body: invokeBody });

    bar.style.width = '85%';
    status.textContent = 'Procesando resultado…';

    if(error){
      let errMsg = error.message || String(error);
      try {
        if(error.context){
          const body = await error.context.json();
          errMsg = body.error || errMsg;
        }
      } catch(e){}
      throw new Error(errMsg);
    }

    const transcriptText = data?.text || data?.transcript || '';
    if(!transcriptText){
      throw new Error(data?.error || 'Sin texto de transcripción en la respuesta');
    }

    /* Éxito */
    _f11RawText = transcriptText;
    transcripcion.rawText = transcriptText;
    _f11CurrentStep = 1;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Transcripción completada — texto crudo guardado';

    document.getElementById('f11RawResult').value = _f11RawText;
    document.getElementById('f11RawResultSection').style.display = 'block';
    document.getElementById('f11Step2Section').style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 1 completado: transcripción cruda guardada');

  } catch(e){
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[F11] Paso 1 error:', e);
    showToast('❌ Error en transcripción: ' + e.message);
  } finally {
    _f11Processing = false;
    transcripcion.isProcessing = false;
    btn.textContent = '🎙️ Paso 1: Transcribir Audio (ElevenLabs/Whisper)';
    btn.disabled = !_f11AudioBlob;
    if(storagePath){
      try { await sb.storage.from(T_STORAGE_BUCKET).remove([storagePath]); } catch(e){}
    }
  }
}

/* ════════════════════════════════════════════════════════
   PASO 2: EDITAR con IA — Texto Refundido
   /api/chat-stream (Edge Function — streaming, sin timeout)
   ════════════════════════════════════════════════════════ */
async function f11Paso2_Editar(){
  if(!_f11RawText) return showToast('⚠ Primero completa el Paso 1');
  if(_f11Processing) return;

  const btn = document.getElementById('f11EditBtn');
  const progress = document.getElementById('f11EditProgress');
  const bar = document.getElementById('f11EditBar');
  const status = document.getElementById('f11EditStatus');

  _f11Processing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Editando con IA…';
  progress.style.display = 'block';
  bar.style.width = '5%';
  bar.style.background = '#818cf8';
  status.textContent = 'Preparando contexto…';

  try {
    const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
    const nombre = document.getElementById('f11NombreDeclarante')?.value || '';
    const fecha  = document.getElementById('f11Fecha')?.value || '';
    const lugar  = document.getElementById('f11Lugar')?.value || 'Punta Arenas';
    const tipoLabel = {testigo:'testigo',denunciante:'denunciante',denunciado:'persona denunciada',otro:'compareciente'}[tipo]||'declarante';
    const tipoActaLabel = {testigo:'DECLARACIÓN DE TESTIGO',denunciante:'RATIFICACIÓN DE DENUNCIA',denunciado:'DECLARACIÓN DE PERSONA DENUNCIADA',otro:'DILIGENCIA'}[tipo]||'DECLARACIÓN';

    const fechaStr = fecha
      ? new Date(fecha+'T12:00:00').toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      : new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

    const lnk = (typeof currentCase !== 'undefined' ? currentCase : null);
    let caseCtx = `\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${nombre||'[COMPLETAR NOMBRE]'}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${lugar||'[COMPLETAR]'}`;

    if(lnk){
      const fmtArr = v => { if(!v)return''; if(Array.isArray(v))return v.join(', '); try{const a=JSON.parse(v);return Array.isArray(a)?a.join(', '):String(v);}catch{return String(v);} };
      caseCtx += `\n\nDATOS DEL EXPEDIENTE:\n- Expediente: ${lnk.name||'[EXPEDIENTE]'}\n- ROL: ${lnk.rol||'[ROL]'}\n- Tipo: ${lnk.tipo_procedimiento||'[TIPO]'}\n- Materia: ${lnk.materia||'[MATERIA]'}\n- Denunciante(s): ${fmtArr(lnk.denunciantes)||'[DENUNCIANTE]'}\n- Denunciado/a(s): ${fmtArr(lnk.denunciados)||'[DENUNCIADO/A]'}`;
    }

    const hasBaseDoc = !!_f11DocText?.trim();
    const mode = hasBaseDoc ? 'fill_acta' : 'pregunta_respuesta';

    /* ── Construir prompt para streaming ── */
    let sysPrompt = _F11_PROMPTS[mode] || _F11_PROMPTS.pregunta_respuesta;
    if(caseCtx) sysPrompt += '\n' + caseCtx;
    if(hasBaseDoc) sysPrompt += '\n\nDOCUMENTO BASE (preservar estructura y llenar con audio):\n' + _f11DocText.substring(0,5000);

    const rawText = _f11RawText.substring(0,14000);
    const userMsg = mode === 'fill_acta'
      ? 'Llena el acta adjunta (DOCUMENTO BASE) con las respuestas de esta transcripción:\n\n' + rawText
      : 'Elabora el Texto Refundido de esta declaración transcrita:\n\n' + rawText;

    const maxTok = mode === 'fill_acta' ? 8000 : 5000;

    bar.style.width = '15%';
    status.textContent = hasBaseDoc ? 'Aplicando cuestionario como guía (streaming)…' : 'Estructurando pregunta-respuesta (streaming)…';

    /* Mostrar sección de resultado para vista previa en tiempo real */
    const editedSec = document.getElementById('f11EditedResultSection');
    if(editedSec) editedSec.style.display = 'block';

    /* ── Llamar con streaming — sin timeout ── */
    const resultText = await _f11StreamStructure({
      systemPrompt: sysPrompt,
      userMsg: userMsg,
      maxTokens: maxTok,
      onProgress: (partial) => {
        const pct = Math.min(15 + (partial.length / (maxTok * 3)) * 80, 95);
        bar.style.width = pct + '%';
        status.textContent = `Recibiendo texto… (${partial.length} caracteres)`;
        /* Vista previa en tiempo real */
        const editedEl = document.getElementById('f11EditedResult');
        if(editedEl) editedEl.value = partial;
      }
    });

    _f11EditedText = resultText;
    transcripcion.structuredText = resultText;
    _f11CurrentStep = 2;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = `✅ Texto refundido generado (${resultText.length} caracteres)`;

    document.getElementById('f11EditedResult').value = _f11EditedText;
    document.getElementById('f11EditedResultSection').style.display = 'block';
    document.getElementById('f11Step3Section').style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 2 completado: texto refundido listo');

  } catch(e){
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[F11] Paso 2 error:', e);
    showToast('❌ Error en edición: ' + e.message);
  } finally {
    _f11Processing = false;
    btn.textContent = '✏️ Paso 2: Editar y Refundir con IA';
    btn.disabled = false;
  }
}

/* ════════════════════════════════════════════════════════
   PASO 3: GENERAR ACTA LISTA PARA FIRMAR
   /api/chat-stream (Edge Function — streaming, sin timeout)
   ════════════════════════════════════════════════════════ */
async function f11Paso3_GenerarActa(){
  const editedTextArea = document.getElementById('f11EditedResult');
  const textoBase = editedTextArea ? editedTextArea.value.trim() : _f11EditedText;
  if(!textoBase) return showToast('⚠ Primero completa el Paso 2');
  if(_f11Processing) return;

  const btn = document.getElementById('f11GenerateBtn');
  const progress = document.getElementById('f11GenerateProgress');
  const bar = document.getElementById('f11GenerateBar');
  const status = document.getElementById('f11GenerateStatus');

  _f11Processing = true;
  btn.disabled = true;
  btn.textContent = '⏳ Generando acta formal…';
  progress.style.display = 'block';
  bar.style.width = '5%';
  status.textContent = 'Preparando acta formal…';

  try {
    const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
    const nombre = document.getElementById('f11NombreDeclarante')?.value || '[COMPLETAR NOMBRE]';
    const fecha  = document.getElementById('f11Fecha')?.value || '';
    const lugar  = document.getElementById('f11Lugar')?.value || 'Punta Arenas';
    const tipoLabel = {testigo:'testigo',denunciante:'denunciante',denunciado:'persona denunciada',otro:'compareciente'}[tipo]||'declarante';
    const tipoActaLabel = {testigo:'DECLARACIÓN DE TESTIGO',denunciante:'RATIFICACIÓN DE DENUNCIA',denunciado:'DECLARACIÓN DE PERSONA DENUNCIADA',otro:'DILIGENCIA'}[tipo]||'DECLARACIÓN';

    const fechaStr = fecha
      ? new Date(fecha+'T12:00:00').toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
      : new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

    const lnk = (typeof currentCase!=='undefined' ? currentCase : null);
    const rolStr = lnk?.rol || '[ROL]';
    const tipoProcStr = lnk?.tipo_procedimiento || '[TIPO DE PROCEDIMIENTO]';

    let caseCtx = `\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${nombre}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${lugar}\n- Rol: ${rolStr}\n- Procedimiento: ${tipoProcStr}`;

    if(lnk){
      const fmtArr = v => { if(!v)return''; if(Array.isArray(v))return v.join(', '); try{const a=JSON.parse(v);return Array.isArray(a)?a.join(', '):String(v);}catch{return String(v);} };
      caseCtx += `\n- Denunciante(s): ${fmtArr(lnk.denunciantes)||'[DENUNCIANTE]'}\n- Denunciado/a(s): ${fmtArr(lnk.denunciados)||'[DENUNCIADO/A]'}`;
    }

    /* ── Construir prompt para streaming ── */
    let sysPrompt = _F11_PROMPTS.con_expediente + '\n' + caseCtx;

    const userMsg = 'Genera el acta formal a partir de este texto refundido de la declaración:\n\n' + textoBase.substring(0,14000);

    bar.style.width = '15%';
    status.textContent = 'Generando acta formal con IA (streaming)…';

    /* Mostrar sección final para vista previa en tiempo real */
    const finalSec = document.getElementById('f11FinalSection');
    if(finalSec) finalSec.style.display = 'block';

    /* ── Llamar con streaming — sin timeout ── */
    const resultText = await _f11StreamStructure({
      systemPrompt: sysPrompt,
      userMsg: userMsg,
      maxTokens: 8000,
      onProgress: (partial) => {
        const pct = Math.min(15 + (partial.length / 24000) * 80, 95);
        bar.style.width = pct + '%';
        status.textContent = `Generando acta… (${partial.length} caracteres)`;
        /* Vista previa en tiempo real */
        const preview = document.getElementById('f11FinalPreview');
        if(preview){
          preview.innerHTML = partial
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/_{30,}/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
            .replace(/\n/g, '<br>');
        }
      }
    });

    _f11FinalActa = resultText;
    transcripcion.actaFinal = resultText;
    _f11CurrentStep = 3;

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Acta lista para firmar';

    const preview = document.getElementById('f11FinalPreview');
    if(preview){
      preview.innerHTML = _f11FinalActa
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/_{30,}/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
        .replace(/\n/g, '<br>');
    }
    document.getElementById('f11FinalSection').style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 3 completado: acta lista para firmar');

  } catch(e){
    bar.style.background = 'var(--red)';
    status.textContent = '❌ Error: ' + e.message;
    console.error('[F11] Paso 3 error:', e);
    showToast('❌ Error generando acta: ' + e.message);
  } finally {
    _f11Processing = false;
    btn.textContent = '📝 Paso 3: Generar Acta para Firmar';
    btn.disabled = false;
  }
}

/* ══════════════════ GUARDAR EN CASO ══════════════════ */
/* ══════════════════ GUARDAR TRANSCRIPCIÓN CRUDA (Paso 1) ══════════════════ */
async function f11SaveRawToCase(){
  if(!currentCase || !session) return showToast('⚠ Vincula un caso primero');
  if(!_f11RawText) return showToast('⚠ Sin transcripción para guardar');

  const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
  const nombre = (document.getElementById('f11NombreDeclarante')?.value||'').trim();
  const fecha  = document.getElementById('f11Fecha')?.value || '';
  const lugar  = (document.getElementById('f11Lugar')?.value||'').trim();
  const tipoLabel = {testigo:'Declaración testigo',denunciante:'Ratificación denuncia',denunciado:'Declaración denunciado/a',otro:'Diligencia'}[tipo];
  const label = `${tipoLabel}${nombre ? ': '+nombre : ''} (transcripción cruda)`;

  try {
    const { error: errDil } = await sb.from('diligencias').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      diligencia_type: tipo==='testigo'?'declaracion_testigo':tipo==='denunciante'?'ratificacion':tipo==='denunciado'?'declaracion_denunciado':'otro',
      diligencia_label: label,
      fecha_diligencia: fecha || null,
      extracted_text: _f11RawText,
      ai_summary: `Transcripción cruda de ${tipoLabel.toLowerCase()}${nombre?' de '+nombre:''} realizada en ${lugar||'—'} el ${fecha||'—'}`,
      is_processed: true,
      processing_status: 'transcripcion_cruda',
    });
    if(errDil) throw errDil;

    const noteContent = `🎙️ ${label}\n📅 ${fecha||'—'} · 📍 ${lugar||'—'}\n\n` +
      `═══ TRANSCRIPCIÓN CRUDA ═══\n${_f11RawText}`;

    await sb.from('case_notes').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      content: noteContent,
    });

    showToast('✅ Transcripción cruda guardada en diligencias y notas del caso');
  } catch(e){
    showToast('❌ Error: ' + e.message);
    console.error('SaveRaw error:', e);
  }
}

/* ══════════════════ GUARDAR ACTA FINAL ══════════════════ */
async function f11SaveToCase(){
  if(!currentCase || !session) return showToast('⚠ Vincula un caso primero');

  const actaText = _f11FinalActa || _f11EditedText || _f11RawText;
  if(!actaText) return showToast('⚠ Sin texto para guardar');

  const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
  const nombre = (document.getElementById('f11NombreDeclarante')?.value||'').trim();
  const fecha  = document.getElementById('f11Fecha')?.value || '';
  const lugar  = (document.getElementById('f11Lugar')?.value||'').trim();
  const tipoLabel = {testigo:'Declaración testigo',denunciante:'Ratificación denuncia',denunciado:'Declaración denunciado/a',otro:'Diligencia'}[tipo];
  const label = `${tipoLabel}${nombre ? ': '+nombre : ''}`;

  try {
    const { error: errDil } = await sb.from('diligencias').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      diligencia_type: tipo==='testigo'?'declaracion_testigo':tipo==='denunciante'?'ratificacion':tipo==='denunciado'?'declaracion_denunciado':'otro',
      diligencia_label: label,
      fecha_diligencia: fecha || null,
      extracted_text: actaText,
      ai_summary: `Acta de ${tipoLabel.toLowerCase()}${nombre?' de '+nombre:''} realizada en ${lugar||'—'} el ${fecha||'—'}`,
      is_processed: true,
      processing_status: 'acta_firmable',
    });
    if(errDil) throw errDil;

    const noteContent = `📝 ${label}\n📅 ${fecha||'—'} · 📍 ${lugar||'—'}\n\n` +
      `═══ ACTA FINAL ═══\n${actaText}` +
      (_f11RawText ? `\n\n═══ TRANSCRIPCIÓN CRUDA (referencia) ═══\n${_f11RawText}` : '');

    await sb.from('case_notes').insert({
      case_id: currentCase.id,
      user_id: session.user.id,
      content: noteContent,
    });

    showToast('✅ Acta guardada en diligencias y notas del caso');
  } catch(e){
    showToast('❌ Error: ' + e.message);
    console.error('Save error:', e);
  }
}

/* ══════════════════ DESCARGAR WORD ══════════════════ */
function f11DownloadWord(){
  const actaText = _f11FinalActa || _f11EditedText;
  if(!actaText) return showToast('⚠ Sin acta para descargar');

  const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
  const nombre = (document.getElementById('f11NombreDeclarante')?.value||'').trim();
  const fecha  = document.getElementById('f11Fecha')?.value || '';
  const tipoLabel = {testigo:'Declaración de testigo',denunciante:'Ratificación de denuncia',denunciado:'Declaración persona denunciada',otro:'Diligencia'}[tipo];

  if(typeof exportTextToWord==='function'){
    try {
      exportTextToWord(actaText, `Acta_${tipoLabel.replace(/\s+/g,'_')}_${nombre||'declarante'}_${fecha||'sin_fecha'}`);
      showToast('📥 Acta descargada como Word');
      return;
    } catch(e){ console.warn('Export Word fallback:',e); }
  }

  const blob = new Blob([actaText], {type:'application/msword'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Acta_${tipoLabel.replace(/\s+/g,'_')}_${nombre||'declarante'}_${fecha||'sin_fecha'}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📥 Acta descargada');
}

/* ══════════════════ UTILIDADES UI ══════════════════ */
function f11CopyText(text){
  if(text){ navigator.clipboard.writeText(text); showToast('📋 Texto copiado'); }
}

function f11DownloadText(text, prefix){
  if(!text)return;
  const nombre = (document.getElementById('f11NombreDeclarante')?.value||'').trim().replace(/\s+/g,'_') || 'declarante';
  const fecha = document.getElementById('f11Fecha')?.value || new Date().toISOString().split('T')[0];
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${prefix}_${nombre}_${fecha}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('⬇ Archivo descargado');
}

function f11Reset(){
  _f11AudioBlob = null;
  if(_f11AudioUrl) URL.revokeObjectURL(_f11AudioUrl);
  _f11AudioUrl = null;
  _f11DocFile = null;
  _f11DocText = '';
  _f11RawText = '';
  _f11EditedText = '';
  _f11FinalActa = '';
  _f11CurrentStep = 0;
  _f11Processing = false;

  transcripcion.audioFile = null;
  transcripcion.audioUrl = null;
  transcripcion.rawText = '';
  transcripcion.structuredText = '';
  transcripcion.actaFinal = '';
  transcripcion.step = 'upload';

  renderF11Panel();
}

/* ══════════════════ CHIPS ══════════════════ */
function buildF11Chips(){
  const row = document.getElementById('fnChipsRow');
  if(!row) return;
  row.innerHTML = '';
}

/* ══════════════════ INPUT BAR ══════════════════ */
function updateTransInputBar(){
  const input = document.getElementById('inputBox');
  if(input && activeFn === 'F11'){
    input.placeholder = 'Sube audio/video para transcribir';
  }
}

/* ── Compatibilidad: funciones que index.html puede llamar ── */
function handleTransAudioUpload(input){
  if(input && input.files && input.files[0]) f11HandleAudioUpload(input.files[0]);
}
function startTransRecording(){ f11StartRecording(); }
function stopTransRecording(){ f11StopRecording(); }
function resetTranscripcion(){ f11Reset(); }

/* ══════════════════ LOG ══════════════════ */
console.log('%c🎙️ Módulo F11 Transcripción v9.1 — Fix grabadora + error handling', 'color:#7c3aed;font-weight:bold');
console.log('%c   ✓ ElevenLabs/Whisper  ✓ Edición IA  ✓ Acta firmable  ✓ Diagnósticos mejorados', 'color:#666');
