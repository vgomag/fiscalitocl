/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v10.0 · 2026-04-08 · Fiscalito / UMAG
   =========================================================
   v10.0: A PRUEBA DE FALLOS — Sistema de resiliencia completo
   · IndexedDB: auto-guardado de audio blob + chunks parciales cada 30 s
   · sessionStorage: checkpoint de textos tras cada paso completado
   · Guardado progresivo cada 5 s durante streaming SSE (Paso 2/3)
   · Detección offline/online con aviso inmediato + guardado de emergencia
   · beforeunload: previene cierre accidental con datos sin guardar
   · Recuperación automática al abrir F11 (detecta sesión previa)
   · Reintentos automáticos (2 intentos con backoff) en Paso 2/3
   · Timeout explícito 120 s en fetch de streaming
   · Si el stream falla, el texto parcial acumulado se preserva
   v9.1: Fix grabadora + error handling Paso 2/3
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

/* ── Safe fallback para CHAT_ENDPOINT (global o local) ── */
const _CHAT_EP = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';

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

/* ══════════════════ RESILIENCIA — A PRUEBA DE FALLOS ══════════════════ */
/*
 * Sistema de protección multi-capa para la función F11:
 * 1. IndexedDB: guarda audio blob (grande para sessionStorage)
 * 2. sessionStorage: guarda textos de cada paso completado
 * 3. Auto-save progresivo durante streaming SSE
 * 4. Detección offline/online con aviso inmediato
 * 5. beforeunload: previene cierre accidental con datos sin guardar
 * 6. Recuperación automática al abrir F11
 */

const _F11_DB_NAME = 'fiscalito_f11_recovery';
const _F11_DB_VERSION = 1;
const _F11_STORE = 'audio_backup';
const _F11_SS_PREFIX = 'f11_'; // sessionStorage prefix

/* ── IndexedDB helpers para audio blob ── */
function _f11OpenDB(){
  return new Promise(function(resolve, reject){
    try {
      const req = indexedDB.open(_F11_DB_NAME, _F11_DB_VERSION);
      req.onupgradeneeded = function(e){
        const db = e.target.result;
        if(!db.objectStoreNames.contains(_F11_STORE)){
          db.createObjectStore(_F11_STORE, {keyPath:'id'});
        }
      };
      req.onsuccess = function(e){ resolve(e.target.result); };
      req.onerror = function(e){
        console.warn('[F11-Recovery] IndexedDB open error:', e.target.error);
        resolve(null);
      };
    } catch(e){
      console.warn('[F11-Recovery] IndexedDB not available:', e);
      resolve(null);
    }
  });
}

function _f11SaveAudioToDB(blob){
  _f11OpenDB().then(function(db){
    if(!db) return;
    try {
      const tx = db.transaction(_F11_STORE, 'readwrite');
      tx.objectStore(_F11_STORE).put({
        id: 'current_audio',
        blob: blob,
        timestamp: Date.now(),
        size: blob.size,
        type: blob.type
      });
      tx.oncomplete = function(){ console.log('[F11-Recovery] Audio blob guardado en IndexedDB (' + (blob.size/1024).toFixed(0) + 'KB)'); };
      tx.onerror = function(e){ console.warn('[F11-Recovery] Error guardando audio:', e.target.error); };
    } catch(e){ console.warn('[F11-Recovery] IndexedDB write error:', e); }
  });
}

/* Guarda chunks parciales durante la grabación (cada 30 s) */
function _f11SavePartialAudioToDB(chunksArray, mimeType){
  if(!chunksArray || !chunksArray.length) return;
  try {
    const partialBlob = new Blob(chunksArray, {type: mimeType || 'audio/webm'});
    _f11OpenDB().then(function(db){
      if(!db) return;
      try {
        const tx = db.transaction(_F11_STORE, 'readwrite');
        tx.objectStore(_F11_STORE).put({
          id: 'partial_audio',
          blob: partialBlob,
          timestamp: Date.now(),
          size: partialBlob.size,
          type: mimeType || 'audio/webm',
          chunksCount: chunksArray.length,
          isPartial: true
        });
      } catch(e){}
    });
  } catch(e){ console.warn('[F11-Recovery] Error guardando audio parcial:', e); }
}

function _f11LoadAudioFromDB(){
  return new Promise(function(resolve){
    _f11OpenDB().then(function(db){
      if(!db) return resolve(null);
      try {
        const tx = db.transaction(_F11_STORE, 'readonly');
        const req = tx.objectStore(_F11_STORE).get('current_audio');
        req.onsuccess = function(e){
          const result = e.target.result;
          if(result && result.blob && (Date.now() - result.timestamp < 12 * 60 * 60 * 1000)){
            resolve(result);
          } else { resolve(null); }
        };
        req.onerror = function(){ resolve(null); };
      } catch(e){ resolve(null); }
    });
  });
}

function _f11LoadPartialAudioFromDB(){
  return new Promise(function(resolve){
    _f11OpenDB().then(function(db){
      if(!db) return resolve(null);
      try {
        const tx = db.transaction(_F11_STORE, 'readonly');
        const req = tx.objectStore(_F11_STORE).get('partial_audio');
        req.onsuccess = function(e){
          const result = e.target.result;
          if(result && result.blob && result.isPartial && (Date.now() - result.timestamp < 2 * 60 * 60 * 1000)){
            resolve(result);
          } else { resolve(null); }
        };
        req.onerror = function(){ resolve(null); };
      } catch(e){ resolve(null); }
    });
  });
}

function _f11ClearDB(){
  _f11OpenDB().then(function(db){
    if(!db) return;
    try {
      const tx = db.transaction(_F11_STORE, 'readwrite');
      tx.objectStore(_F11_STORE).clear();
    } catch(e){}
  });
}

/* ── sessionStorage helpers para textos ── */
function _f11SaveText(key, value){
  try { if(value) sessionStorage.setItem(_F11_SS_PREFIX + key, value); }
  catch(e){ console.warn('[F11-Recovery] sessionStorage write error:', e); }
}
function _f11LoadText(key){
  try { return sessionStorage.getItem(_F11_SS_PREFIX + key) || ''; }
  catch(e){ return ''; }
}
function _f11ClearTexts(){
  try {
    ['rawText','editedText','finalActa','step','streaming_draft','meta'].forEach(function(k){
      sessionStorage.removeItem(_F11_SS_PREFIX + k);
    });
  } catch(e){}
}

/* Guarda estado completo de texto después de cada paso */
function _f11CheckpointState(){
  _f11SaveText('rawText', _f11RawText);
  _f11SaveText('editedText', _f11EditedText);
  _f11SaveText('finalActa', _f11FinalActa);
  _f11SaveText('step', String(_f11CurrentStep));
  /* Guardar metadatos del declarante */
  try {
    const meta = {
      tipo: document.getElementById('f11Tipo')?.value || '',
      nombre: document.getElementById('f11NombreDeclarante')?.value || '',
      fecha: document.getElementById('f11Fecha')?.value || '',
      lugar: document.getElementById('f11Lugar')?.value || ''
    };
    _f11SaveText('meta', JSON.stringify(meta));
  } catch(e){}
}

/* ── Detección offline/online ── */
let _f11WasOffline = false;

function _f11OnOffline(){
  _f11WasOffline = true;
  /* Guardar todo lo que tengamos inmediatamente */
  _f11CheckpointState();
  showToast('⚠ SIN CONEXIÓN A INTERNET — Tu trabajo está guardado localmente. Cuando vuelva la conexión podrás continuar.', 8000);
  console.warn('[F11-Recovery] Offline detectado. Estado guardado.');
}

function _f11OnOnline(){
  if(_f11WasOffline){
    _f11WasOffline = false;
    showToast('✅ Conexión restaurada — Puedes continuar con normalidad.', 5000);
    console.log('[F11-Recovery] Online restaurado.');
  }
}

window.addEventListener('offline', _f11OnOffline);
window.addEventListener('online', _f11OnOnline);

/* ── beforeunload: prevenir cierre accidental ── */
function _f11BeforeUnload(e){
  const hayDatosSinGuardar = _f11Recording || _f11Processing ||
    (_f11RawText && _f11CurrentStep >= 1) ||
    (_f11EditedText && _f11CurrentStep >= 2) ||
    (_f11FinalActa && _f11CurrentStep >= 3);

  if(hayDatosSinGuardar){
    /* Guardado de emergencia antes de cerrar */
    _f11CheckpointState();
    e.preventDefault();
    e.returnValue = 'Tienes una transcripción en progreso. ¿Segura que quieres salir?';
    return e.returnValue;
  }
}
window.addEventListener('beforeunload', _f11BeforeUnload);

/* ── Recuperación al abrir F11 ── */
async function _f11CheckRecovery(){
  const savedStep = parseInt(_f11LoadText('step') || '0');
  if(savedStep < 1) return false;

  const savedRaw = _f11LoadText('rawText');
  const savedEdited = _f11LoadText('editedText');
  const savedActa = _f11LoadText('finalActa');

  if(!savedRaw) return false;

  /* Hay datos recuperables */
  const steps = [];
  if(savedRaw) steps.push('transcripción cruda');
  if(savedEdited) steps.push('texto refundido');
  if(savedActa) steps.push('acta final');

  const msg = '🔄 Se encontró trabajo previo sin guardar:\n' +
    '• ' + steps.join(', ') + '\n\n' +
    '¿Deseas recuperar esta sesión?';

  if(confirm(msg)){
    _f11RawText = savedRaw;
    _f11EditedText = savedEdited || '';
    _f11FinalActa = savedActa || '';
    _f11CurrentStep = savedStep;
    transcripcion.rawText = savedRaw;
    transcripcion.structuredText = savedEdited || '';
    transcripcion.actaFinal = savedActa || '';

    /* Intentar recuperar audio de IndexedDB */
    const audioData = await _f11LoadAudioFromDB();
    if(audioData && audioData.blob){
      _f11AudioBlob = audioData.blob;
      if(_f11AudioUrl) URL.revokeObjectURL(_f11AudioUrl);
      _f11AudioUrl = URL.createObjectURL(audioData.blob);
      transcripcion.audioFile = audioData.blob;
      transcripcion.audioUrl = _f11AudioUrl;
    }

    /* Recuperar metadatos */
    try {
      const metaStr = _f11LoadText('meta');
      if(metaStr){
        const meta = JSON.parse(metaStr);
        setTimeout(function(){
          const el1 = document.getElementById('f11Tipo'); if(el1 && meta.tipo) el1.value = meta.tipo;
          const el2 = document.getElementById('f11NombreDeclarante'); if(el2 && meta.nombre) el2.value = meta.nombre;
          const el3 = document.getElementById('f11Fecha'); if(el3 && meta.fecha) el3.value = meta.fecha;
          const el4 = document.getElementById('f11Lugar'); if(el4 && meta.lugar) el4.value = meta.lugar;
        }, 200);
      }
    } catch(e){}

    showToast('✅ Sesión recuperada — Paso ' + savedStep + ' restaurado');
    return true;
  } else {
    /* Usuario rechazó recuperación — limpiar */
    _f11ClearTexts();
    _f11ClearDB();
    return false;
  }
}

/* ── Guardado periódico del streaming draft ── */
let _f11StreamDraftInterval = null;
let _f11StreamDraftText = '';

function _f11StartStreamDraftSave(stepLabel){
  _f11StreamDraftText = '';
  _f11StreamDraftInterval = setInterval(function(){
    if(_f11StreamDraftText){
      _f11SaveText('streaming_draft', _f11StreamDraftText);
      _f11SaveText('streaming_step', stepLabel);
    }
  }, 5000); /* Guarda cada 5 segundos */
}

function _f11StopStreamDraftSave(){
  if(_f11StreamDraftInterval){
    clearInterval(_f11StreamDraftInterval);
    _f11StreamDraftInterval = null;
  }
  _f11StreamDraftText = '';
  try {
    sessionStorage.removeItem(_F11_SS_PREFIX + 'streaming_draft');
    sessionStorage.removeItem(_F11_SS_PREFIX + 'streaming_step');
  } catch(e){}
}

console.log('%c🛡️ F11 Sistema de resiliencia activo — IndexedDB + sessionStorage + offline detection', 'color:#059669;font-weight:bold');

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

Instrucción de trabajo para incorporación de declaración transcrita al acta:

Elabora un Texto Refundido, Coordinado y Sistematizado que incorpore el contenido de la declaración en audio, integrándolo al acta que se adjuntan. El documento final debe presentarse en formato pregunta-respuesta, respetando la estructura del acta.

La transcripción corresponde a una declaración rendida en el marco de un procedimiento disciplinario instruido por la Universidad de Magallanes, en el cual actúo como Fiscal Investigadora.

La transcripción contiene expresiones propias del lenguaje oral, incluyendo frases coloquiales, repeticiones y muletillas. Es importante que se conserve, en lo posible, la redacción en primera persona y el estilo expresivo del declarante, realizando únicamente correcciones gramaticales menores, tales como concordancia, puntuación y eliminación de repeticiones innecesarias que no alteren el sentido ni el tono del testimonio.

Una vez integradas todas las partes, el documento debe presentar una redacción fluida, coherente y ordenada, que facilite su comprensión sin desvirtuar el contenido ni el contexto de lo declarado.

OBJETIVO:
- Mejorar la gramática, claridad y coherencia del texto.
- Eliminar muletillas ("eh", "mmm") y repeticiones innecesarias.
- Conservar la estructura lógica de los párrafos y la secuencia cronológica de los hechos.
- Respetar la terminología jurídica y los nombres propios tal como aparecen en la transcripción.

INSTRUCCIONES ESPECÍFICAS:
- No agregar información nueva ni interpretar intenciones; solo reescribir lo existente.
- Mantener las palabras originales del declarante siempre que no afecten la corrección gramatical.
- Unir frases fragmentadas cuando sea necesario para fluidez, sin cambiar el sentido.
- Conservar comillas, fechas y cifras exactamente como están.
- Usar un tono formal, claro y preciso, coherente con un documento legal.

REGLAS CRÍTICAS DE FORMATO:
- NUNCA usar asteriscos (***), guiones bajos (___) ni marcadores de edición.
- NUNCA dejar campos como [COMPLETAR], [NOMBRE], etc. si el dato está disponible en los metadatos.
- Todos los datos disponibles deben ser incorporados directamente en el texto.
- Texto corregido en formato pregunta-respuesta con párrafos separados.
- Solo la versión final, sin comentarios.

ESTILO DE REDACCIÓN:
- El acta debe leerse como escrita por un profesional jurídico humano, no por una IA.
- NUNCA uses marcas de IA: "Es importante destacar", "Cabe mencionar", "En este contexto", "En resumen", emojis.
- NUNCA abras con "¡Claro!", "¡Por supuesto!" ni cierres con "¿Hay algo más?".
- Vocabulario jurídico-administrativo chileno preciso: "en lo pertinente", "obra en autos", "conforme a lo prevenido".
- NUNCA inventes datos, nombres, fechas ni citas que no aparezcan en la transcripción o metadatos.`;

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
1. PRESERVA la estructura del documento base (formato pregunta-respuesta)
2. Después de cada pregunta del acta, inserta la respuesta correspondiente del audio precedida de "R."
3. Si no hay respuesta en el audio para una pregunta, escribe: "R. Sin respuesta en el audio."
4. Información adicional no cubierta por las preguntas va al final como "DECLARACIÓN COMPLEMENTARIA"
5. NUNCA uses asteriscos (***), guiones bajos (___) ni marcadores de edición
6. Completa todos los datos disponibles en los metadatos directamente en el texto`,

  con_expediente: _F11_PROMPT_BASE + `

FORMATO: ACTA DE DECLARACIÓN EN PROCEDIMIENTO DISCIPLINARIO — UMAG.
Usa los METADATOS y DATOS DEL EXPEDIENTE para completar TODOS los campos.
NUNCA dejes campos vacíos, asteriscos (***) ni marcadores [COMPLETAR].

Genera con EXACTAMENTE esta estructura (sin usar asteriscos ni guiones bajos para líneas):

ACTA DE DECLARACIÓN EN PROCEDIMIENTO DISCIPLINARIO

En Punta Arenas, con fecha [FECHA COMPLETA], siendo aproximadamente las [HORA] horas, en dependencias de la Fiscalía Universitaria, ubicada en Avenida Bulnes 01855, Edificio de Humanidades (Facultad de Educación y Ciencias Sociales y Facultad de Ciencias Económicas y Jurídicas), en Procedimiento Disciplinario instruido por Resolución Exenta N°[NUMERO], de fecha [FECHA RESOLUCIÓN], de Rectoría de la Universidad de Magallanes, ante Verónica Garrido Ortega, fiscal del procedimiento y Alejandra Mayorga Trujillo, actuaria, presta declaración en calidad de [CALIDAD PROCESAL] don/doña [NOMBRE COMPLETO DEL DECLARANTE], cédula de identidad N°[RUT], correo electrónico [EMAIL], quien, para efectos de citaciones y comunicaciones posteriores autoriza notificación al correo electrónico antes señalado, y consultada expone:

CONTEXTO

En el marco del procedimiento disciplinario antes señalado, se le solicita responder las siguientes preguntas en relación a [MATERIA/TEMA].

[PREGUNTAS NUMERADAS CON RESPUESTAS]

1. [Pregunta]

R. [Respuesta del declarante en primera persona, conservando su estilo expresivo]

2. [Siguiente pregunta]

R. [Respuesta]

[...continuar con todas las preguntas y respuestas...]

Sin más que agregar, siendo las [HORA TÉRMINO] horas, del mismo día, se da por terminada la presente declaración, la que se lee, ratifica y firma para constancia.


Declarante                                     Verónica Garrido Ortega
C.I. N° [RUT DECLARANTE]                       Fiscal

                    Alejandra Mayorga Trujillo
                    Actuaria

IMPORTANTE: Completa TODOS los datos disponibles. Si un dato no está disponible, déjalo tal cual sin marcadores.
Las preguntas van en NEGRITA (usa **pregunta**), las respuestas van en texto normal precedidas de R.
NUNCA uses *** ni ___ en el documento.`
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

  /* Timeout explícito de 120 s para la conexión inicial */
  const _streamAbort = new AbortController();
  const _streamTimeout = setTimeout(function(){ _streamAbort.abort(); }, 120000);

  const resp = await fetch('/api/chat-stream', {
    method: 'POST',
    signal: _streamAbort.signal,
    headers: { 'Content-Type': 'application/json', 'x-auth-token': authToken },
    body: JSON.stringify({
      model: typeof CLAUDE_HAIKU !== 'undefined' ? CLAUDE_HAIKU : 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 5000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    })
  });
  clearTimeout(_streamTimeout);

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

  try {
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
  } catch(e){
    console.error('Error reading SSE stream:', e);
    /* Guardar texto parcial acumulado antes de lanzar error */
    if(accumulated && accumulated.length > 50){
      _f11SaveText('streaming_draft', accumulated);
      console.log('[F11-Recovery] Texto parcial guardado (' + accumulated.length + ' chars) tras error de stream.');
    }
    const errType = e.name === 'AbortError' ? 'Tiempo agotado (120s)' : (e.message || 'stream interrumpido');
    throw new Error('Conexión interrumpida: ' + errType + (accumulated.length > 50 ? ' — texto parcial guardado' : ''));
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

/* ══════════════════ VINCULAR CASO DESDE F11 ══════════════════ */

/** Vincular caso — usa fnLinkCase global que ya re-renderiza F11 */
window.f11LinkCase = function(caseId) {
  if (typeof fnLinkCase === 'function') { fnLinkCase(caseId); return; }
  /* Fallback si la función global no existe */
  if (!caseId) return;
  const c = (typeof allCases !== 'undefined' ? allCases : []).find(x => x.id === caseId);
  if (!c) { showToast('⚠ Caso no encontrado'); return; }
  currentCase = c;
  showToast('✅ Caso vinculado: ' + (c.name || c.nueva_resolucion || '—'));
  renderF11Panel();
};

/** Desvincular caso — permite trabajar sin expediente */
window.f11UnlinkCase = function() {
  currentCase = null;
  transcripcion.linkedCase = null;
  showToast('📋 Caso desvinculado — Puedes transcribir sin expediente. Para guardar en un caso, vincúlalo después.');
  renderF11Panel();
};

/** Mostrar selector de caso — usa buildCaseSelectorHTML global (solo casos activos) */
window.f11ShowCaseSelector = function() {
  const info = document.getElementById('f11CaseInfo');
  if (!info) return;
  const selectorHTML = typeof buildCaseSelectorHTML === 'function'
    ? buildCaseSelectorHTML('f11LinkCase', currentCase?.id)
    : '<span style="color:var(--text-muted);font-size:11px">Selector no disponible</span>';
  info.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<span>⚖️ Cambiar caso:</span>'
    + selectorHTML
    + '<button class="btn-sm" onclick="renderF11Panel()" style="font-size:10px;padding:3px 8px">Cancelar</button>'
    + '</div>';
};

/* ════════════════════════════════════════════
   RENDER PRINCIPAL — F11
   ════════════════════════════════════════════ */
async function renderF11Panel(){
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

  /* ── Intentar recuperación de sesión previa ── */
  if(_f11CurrentStep === 0){
    const recovered = await _f11CheckRecovery();
    if(recovered){
      /* Re-renderizar con datos recuperados */
      panel.innerHTML = _buildF11PanelHTML();
      _initF11Panel();
      _f11RestoreUI();
    }
  }
}

/* Restaura la UI según el estado recuperado */
function _f11RestoreUI(){
  if(_f11RawText){
    const rr=document.getElementById('f11RawResult');if(rr) rr.value=_f11RawText;
    const rs=document.getElementById('f11RawResultSection');if(rs) rs.style.display='block';
    const s2=document.getElementById('f11Step2Section');if(s2) s2.style.display='block';
  }
  if(_f11EditedText){
    const er=document.getElementById('f11EditedResult');if(er) er.value=_f11EditedText;
    const es=document.getElementById('f11EditedResultSection');if(es) es.style.display='block';
    const s3=document.getElementById('f11Step3Section');if(s3) s3.style.display='block';
  }
  if(_f11FinalActa){
    const fp=document.getElementById('f11FinalPreview');
    if(fp) fp.innerHTML=_f11FinalActa.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    const fs=document.getElementById('f11FinalSection');if(fs) fs.style.display='block';
  }
  if(_f11AudioUrl){
    const player=document.getElementById('f11AudioPlayer');if(player) player.src=_f11AudioUrl;
    const prev=document.getElementById('f11AudioPreview');if(prev) prev.style.display='block';
    const tb=document.getElementById('f11TranscribeBtn');if(tb) tb.disabled=false;
  }
  _f11UpdateSteps();
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
        ? '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">⚖️ Caso: <strong style="color:var(--gold)">' + (lnk.name || lnk.nueva_resolucion || '—') + '</strong>'
          + '<div style="display:flex;gap:4px">'
          + '<button class="btn-sm" onclick="f11ShowCaseSelector()" style="font-size:10px;padding:3px 8px" title="Cambiar caso">Cambiar</button>'
          + '<button class="btn-sm" onclick="f11UnlinkCase()" style="font-size:10px;padding:3px 8px;background:var(--red);color:#fff" title="Desvincular caso">Desvincular</button>'
          + '</div></div>'
        : '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
          + '<span>📋 Sin caso vinculado (puedes transcribir así)</span>'
          + (typeof buildCaseSelectorHTML==='function' ? buildCaseSelectorHTML('f11LinkCase') : '<span style="font-size:11px">Cargando...</span>')
          + '</div>'}
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

      <!-- Selector de dispositivo de audio -->
      <div style="margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:6px">
          <select id="f11AudioDevice" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:11px">
            <option value="">Micrófono predeterminado</option>
          </select>
          <button class="btn-sm" onclick="f11RefreshDevices()" title="Actualizar dispositivos" style="padding:6px 8px;font-size:12px">🔄</button>
        </div>
        <div id="f11DeviceStatus" style="font-size:9.5px;color:var(--text-muted);margin-top:3px"></div>
      </div>

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

    <!-- CARGAR TRANSCRIPCIÓN PREVIA -->
    <div id="f11LoadPrevSection" style="margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn-sm" onclick="f11LoadPrevTranscriptions()" style="display:flex;align-items:center;gap:4px;font-size:11px">
          📂 Cargar transcripción guardada
        </button>
        <label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:11px;color:var(--text)">
          <input type="file" accept=".txt,.md,.text" onchange="f11LoadTranscriptionFile(this.files[0])" style="display:none"/>
          📄 Cargar desde archivo .txt
        </label>
      </div>
      <div id="f11PrevTransList" style="display:none;margin-top:8px;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2)"></div>
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

  /* Cargar dispositivos de audio disponibles */
  f11RefreshDevices();

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
  const _dn=document.getElementById('f11DocName');if(_dn)_dn.textContent = file.name;
  const _dc=document.getElementById('f11DocClearBtn');if(_dc)_dc.style.display = 'inline-block';
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
      const r = await authFetch(_CHAT_EP, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          model:typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514', max_tokens:4000,
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
  const _dn=document.getElementById('f11DocName');if(_dn)_dn.textContent = 'Seleccionar archivo de preguntas…';
  const _dc=document.getElementById('f11DocClearBtn');if(_dc)_dc.style.display = 'none';
  const _dp=document.getElementById('f11DocPreview');if(_dp)_dp.style.display = 'none';
}

/* Formatos que efectivamente acepta Whisper / ElevenLabs (intersección segura).
   Si el usuario sube algo fuera de esta lista, el provider rechaza con error
   poco descriptivo. Mejor avisar arriba antes de subir. */
const _F11_PROVIDER_EXTS = new Set(['mp3','mp4','mpeg','mpga','m4a','m4v','wav','webm','ogg','oga','opus','flac','aac']);

/* ══════════════════ AUDIO UPLOAD ══════════════════ */
function f11HandleAudioUpload(file){
  if(!file)return;
  if(file.size > T_MAX_INPUT){ showToast('⚠ El audio excede '+T_MAX_INPUT_MB+' MB'); return; }

  /* Validar formato contra lo que Whisper/ElevenLabs realmente aceptan. Avisar
     pero NO bloquear: archivos como .wma o .amr a veces funcionan vía MIME genérico. */
  const _ext = _f11Ext(file.name).toLowerCase();
  if(_ext && !_F11_PROVIDER_EXTS.has(_ext)){
    showToast('⚠ Formato .'+_ext+' puede no ser soportado por Whisper/ElevenLabs. Prefiere mp3/wav/m4a/ogg/webm.', 6000);
  }

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

/* ══════════════════ AUDIO DEVICE ENUMERATION ══════════════════ */
let _f11SelectedDeviceId = '';  // '' = default

/**
 * Enumera dispositivos de audio de entrada y puebla el selector.
 * Detecta micrófonos internos, 3.5mm TRS, USB, Bluetooth, etc.
 */
async function f11RefreshDevices(){
  const select = document.getElementById('f11AudioDevice');
  const statusEl = document.getElementById('f11DeviceStatus');
  if(!select) return;

  if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices){
    if(statusEl) statusEl.textContent = '⚠ Tu navegador no soporta enumeración de dispositivos';
    return;
  }

  try {
    /* Pedir permiso de micrófono primero (necesario para ver nombres reales) */
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
    } catch(e){
      if(statusEl) statusEl.textContent = '⚠ Permite acceso al micrófono para ver dispositivos';
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    /* Guardar selección actual */
    const prevId = select.value || _f11SelectedDeviceId;

    select.innerHTML = '<option value="">Micrófono predeterminado del sistema</option>';

    audioInputs.forEach((dev, i) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      /* Nombre amigable: los dispositivos 3.5mm suelen llamarse "Line In", "External", "Headset" */
      let label = dev.label || ('Micrófono ' + (i + 1));
      /* Indicar tipo si se reconoce */
      const lo = label.toLowerCase();
      if(lo.includes('line') || lo.includes('external') || lo.includes('externo'))
        label += ' (Entrada externa / 3.5mm)';
      else if(lo.includes('headset') || lo.includes('auricular'))
        label += ' (Auricular)';
      else if(lo.includes('usb'))
        label += ' (USB)';
      else if(lo.includes('bluetooth') || lo.includes('bt'))
        label += ' (Bluetooth)';
      else if(lo.includes('default') || lo.includes('predeterminado'))
        label += ' (Predeterminado)';
      opt.textContent = label;
      select.appendChild(opt);
    });

    /* Restaurar selección previa si aún existe */
    if(prevId){
      const exists = Array.from(select.options).some(o => o.value === prevId);
      if(exists) select.value = prevId;
    }

    _f11SelectedDeviceId = select.value;
    select.onchange = () => { _f11SelectedDeviceId = select.value; };

    if(statusEl){
      statusEl.textContent = audioInputs.length
        ? `✅ ${audioInputs.length} dispositivo(s) detectado(s). Conecta tu micrófono 3.5mm y pulsa 🔄 si no aparece.`
        : '⚠ No se detectaron dispositivos de audio';
    }
  } catch(e){
    console.error('[F11] Error enumerando dispositivos:', e);
    if(statusEl) statusEl.textContent = '⚠ Error al buscar dispositivos: ' + e.message;
  }
}

/* Escuchar conexión/desconexión de dispositivos (con guardia anti-duplicado) */
if(navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function' && !window._f11DeviceChangeRegistered){
  window._f11DeviceChangeRegistered = true;
  navigator.mediaDevices.addEventListener('devicechange', () => {
    const select = document.getElementById('f11AudioDevice');
    if(select) f11RefreshDevices();
  });
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
  /* Guard contra doble-tap: si ya hay un Recorder activo, no iniciar otro
     (evita stream-leak y "device in use"). */
  if(_f11Recording || (_f11Recorder && _f11Recorder.state !== 'inactive')){
    console.warn('[F11] f11StartRecording llamado mientras ya estaba grabando — ignorado');
    return;
  }

  /* Mostrar estado "solicitando micrófono" inmediatamente */
  const icon = document.getElementById('f11RecordIcon');
  const label = document.getElementById('f11RecordLabel');
  const recBtn = document.getElementById('f11RecordBtn');
  if(!icon || !label || !recBtn){
    console.warn('[F11] Faltan elementos UI para grabación: icon='+!!icon+', label='+!!label+', btn='+!!recBtn);
  }
  if(icon) icon.textContent = '🎤';
  if(label) label.textContent = 'Permiso…';
  if(recBtn){ recBtn.disabled = true; }

  /* `stream` declarado FUERA del try para que el catch pueda liberarlo si algo
     falla DESPUÉS de getUserMedia pero ANTES de Recorder.start(). Sin esto,
     el micrófono queda capturado y el usuario debe recargar la página. */
  let stream = null;
  try {
    /* ── Construir constraints con dispositivo seleccionado ── */
    const deviceSelect = document.getElementById('f11AudioDevice');
    const selectedId = _f11SelectedDeviceId || (deviceSelect?.value) || '';
    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if(selectedId){
      audioConstraints.deviceId = { exact: selectedId };
    }

    /* getUserMedia con timeout de 15 s por si el diálogo de permisos queda colgado */
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: audioConstraints }),
      new Promise((_,rej) => setTimeout(()=>rej(new Error('Tiempo agotado esperando permiso de micrófono')),15000))
    ]);

    /* Mostrar qué dispositivo se está usando */
    const activeTrack = stream.getAudioTracks()[0];
    const trackLabel = activeTrack?.label || 'Desconocido';
    console.log('[F11] Grabando desde:', trackLabel);
    const devStatus = document.getElementById('f11DeviceStatus');
    if(devStatus) {
      devStatus.textContent = '🔴 Grabando desde: ' + trackLabel;
    } else {
      console.warn('[F11] Elemento f11DeviceStatus no encontrado');
    }

    const chunks = [];
    const mimeOptions = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    let selectedMime = '';
    for(const m of mimeOptions){
      if(MediaRecorder.isTypeSupported(m)){ selectedMime = m; break; }
    }

    /* Auto-save de audio parcial cada 30 s durante grabación */
    let _f11ChunkSaveInterval = null;

    _f11Recorder = new MediaRecorder(stream, selectedMime ? {mimeType:selectedMime} : {});
    _f11Recorder.ondataavailable = e => { if(e.data.size>0) chunks.push(e.data); };
    _f11Recorder.onerror = e => {
      console.error('[F11] MediaRecorder error:', e);
      /* Limpiar interval de auto-save para que no siga disparando tras el error */
      if(_f11ChunkSaveInterval){ clearInterval(_f11ChunkSaveInterval); _f11ChunkSaveInterval = null; }
      /* Guardar lo que se haya grabado hasta ahora */
      if(chunks.length > 0){
        _f11SavePartialAudioToDB(chunks, selectedMime);
        showToast('❌ Error en grabación — Se guardó audio parcial (' + chunks.length + ' fragmentos). Puedes recuperarlo.', 8000);
      } else {
        showToast('❌ Error en grabación: '+(e.error?.message||'desconocido'));
      }
      /* Liberar stream explícitamente — onstop puede no dispararse en algunos
         estados de error, dejando el micrófono capturado. */
      try { stream.getTracks().forEach(t => { try { t.stop(); } catch(e2){} }); } catch(e3){}
      f11StopRecording();
    };
    _f11Recorder.onstop = () => {
      if(_f11ChunkSaveInterval){ clearInterval(_f11ChunkSaveInterval); _f11ChunkSaveInterval = null; }
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
      if(info) info.textContent = `Grabación (${trackLabel}) · ${_f11Sz(_f11AudioBlob.size)}`;
      const btn = document.getElementById('f11TranscribeBtn');
      if(btn) btn.disabled = false;
      const dSt = document.getElementById('f11DeviceStatus');
      if(dSt) dSt.textContent = `✅ Grabado desde: ${trackLabel}`;
      /* Guardar audio completo en IndexedDB como respaldo */
      _f11SaveAudioToDB(_f11AudioBlob);
    };
    _f11Recorder.start(1000);
    /* Iniciar auto-guardado parcial cada 30 s */
    _f11ChunkSaveInterval = setInterval(function(){
      if(chunks.length > 0) _f11SavePartialAudioToDB(chunks, selectedMime);
    }, 30000);
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

    /* CRÍTICO: si getUserMedia ya retornó pero algo falló después (mime detect,
       Recorder constructor, etc.), el stream sigue capturando el micrófono.
       Liberarlo aquí evita el bug "dispositivo en uso" en re-intentos. */
    if(stream && typeof stream.getTracks === 'function'){
      try { stream.getTracks().forEach(t => { try { t.stop(); } catch(e2){} }); }
      catch(e3){ console.warn('[F11] Error liberando stream:', e3); }
    }
    /* Limpiar el recorder a medio-construir para que el guard contra doble-tap no
       se quede pegado en `state !== 'inactive'`. */
    _f11Recorder = null;

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
   POST /.netlify/functions/chat con mode='transcribe'
   ════════════════════════════════════════════════════════
   FIX 2026-04-29: Antes este código llamaba a sb.functions.invoke('transcribe-audio')
   apuntando a una Edge Function de Supabase que NO existe en el repo. El endpoint real
   de transcripción es la Netlify Function `chat.js` con body.mode='transcribe' (acepta
   audioBase64 directo, signedUrl, o storageBucket+storagePath; devuelve {transcript,provider}).
   También se corrigieron los nombres de campos (audio → audioBase64) y se agregó timeout
   explícito + cleanup garantizado del MediaStream/Storage. */
async function f11Paso1_Transcribir(){
  if(!_f11AudioBlob || _f11Processing) return;

  const btn = document.getElementById('f11TranscribeBtn');
  const progress = document.getElementById('f11TransProgress');
  const bar = document.getElementById('f11TransBar');
  const status = document.getElementById('f11TransStatus');

  /* Doble guard: bloquear el botón ANTES de cualquier await para que un doble-click
     real (entre el click handler y el await) no dispare dos transcripciones. */
  if(btn && btn.disabled) return;
  _f11Processing = true;
  transcripcion.isProcessing = true;
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Transcribiendo con ElevenLabs/Whisper…'; }
  if(progress) progress.style.display = 'block';
  if(bar){ bar.style.width = '5%'; bar.style.background = 'var(--gold)'; }
  if(status) status.textContent = 'Preparando audio…';

  let storagePath = null;
  /* AbortController para timeout explícito (audios de 30+ min pueden exceder el
     timeout default del fetch). 5 minutos = límite de Netlify Pro. */
  const controller = new AbortController();
  const timeoutId = setTimeout(()=>controller.abort(), 290000);

  try {
    const file = _f11AudioBlob;
    /* Validar sesión ANTES de gastar CPU/red. Si la sesión expiró, abortamos limpio. */
    const userId = (typeof session!=='undefined' && session?.user?.id) || null;
    if(!userId) throw new Error('Sesión expirada — vuelve a iniciar sesión.');

    /* Margen de 1.4× porque base64 crece ~33% y queremos evitar quedar pegados al
       límite. Si el archivo binario es > ~17.8MB, mejor subir a Storage. */
    const useStorage = file.size > Math.floor(T_BASE64_LIMIT / 1.4);
    let bodyPayload;

    if(useStorage){
      if(bar) bar.style.width = '10%';
      if(status) status.textContent = 'Subiendo audio a almacenamiento (' + _f11Sz(file.size) + ')…';

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
      bodyPayload = {
        mode: 'transcribe',
        storageBucket: T_STORAGE_BUCKET,
        storagePath: storagePath,
        fileName: file.name,
        mimeType: _f11Mime(file)
      };
      if(bar) bar.style.width = '25%';
      if(status) status.textContent = 'Audio subido. Enviando a transcripción…';
    } else {
      if(bar) bar.style.width = '10%';
      if(status) status.textContent = 'Codificando audio (' + _f11Sz(file.size) + ')…';
      const arrayBuffer = await file.arrayBuffer();
      const base64Audio = _f11ToBase64(arrayBuffer);
      bodyPayload = {
        mode: 'transcribe',
        audioBase64: base64Audio,
        fileName: file.name,
        mimeType: _f11Mime(file)
      };
      if(bar) bar.style.width = '25%';
      if(status) status.textContent = 'Enviando a transcripción…';
    }

    if(bar) bar.style.width = '35%';
    if(status) status.textContent = 'Transcribiendo con ElevenLabs/Whisper…';

    /* authFetch (definido en index.html) inyecta el x-auth-token requerido por
       chat.js para validar JWT y rate-limit del usuario. Si por alguna razón no
       está disponible, fallback a fetch nativo con el token manual. */
    const _doFetch = (typeof authFetch === 'function')
      ? (url, opts) => authFetch(url, opts)
      : (url, opts) => fetch(url, opts);
    const r = await _doFetch(_CHAT_EP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });

    if(bar) bar.style.width = '85%';
    if(status) status.textContent = 'Procesando resultado…';

    if(!r.ok){
      let errMsg = `HTTP ${r.status}`;
      try { const ej = await r.json(); errMsg = ej.error || errMsg; }
      catch(e){ try { errMsg = (await r.text()).substring(0,200) || errMsg; } catch{} }
      throw new Error(errMsg);
    }

    const data = await r.json();
    const transcriptText = data?.transcript || data?.text || '';
    if(!transcriptText){
      throw new Error(data?.error || 'Sin texto de transcripción en la respuesta');
    }

    /* Éxito */
    _f11RawText = transcriptText;
    transcripcion.rawText = transcriptText;
    _f11CurrentStep = 1;

    /* Auto-guardar checkpoint */
    _f11CheckpointState();

    if(bar){ bar.style.width = '100%'; bar.style.background = 'var(--green)'; }
    if(status) status.textContent = '✅ Transcripción completada (' + (data.provider||'?') + ') — texto crudo guardado';

    const _rr=document.getElementById('f11RawResult');if(_rr)_rr.value = _f11RawText;
    const _rs=document.getElementById('f11RawResultSection');if(_rs)_rs.style.display = 'block';
    const _s2=document.getElementById('f11Step2Section');if(_s2)_s2.style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 1 completado · transcrito con ' + (data.provider||'IA'));

  } catch(e){
    if(bar) bar.style.background = 'var(--red)';
    const isAbort = e.name === 'AbortError';
    const friendlyMsg = isAbort
      ? 'Tiempo agotado (>4:50min). Audio muy largo, divídelo en partes.'
      : e.message;
    if(status) status.textContent = '❌ Error: ' + friendlyMsg;
    console.error('[F11] Paso 1 error:', e);
    showToast('❌ Error en transcripción: ' + friendlyMsg);
  } finally {
    clearTimeout(timeoutId);
    _f11Processing = false;
    transcripcion.isProcessing = false;
    if(btn){ btn.textContent = '🎙️ Paso 1: Transcribir Audio (ElevenLabs/Whisper)'; btn.disabled = !_f11AudioBlob; }
    /* Cleanup del archivo en Storage en background — no bloquea el UI. */
    if(storagePath){
      const _path = storagePath;
      Promise.resolve().then(async ()=>{
        try { await sb.storage.from(T_STORAGE_BUCKET).remove([_path]); }
        catch(e){ console.log('[F11] Storage cleanup falló (no crítico):', e.message); }
      });
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

    /* ── Llamar con streaming + guardado progresivo ── */
    _f11StartStreamDraftSave('paso2');

    let resultText = '';
    let lastRetryError = null;
    const MAX_RETRIES = 2;

    for(let attempt = 0; attempt <= MAX_RETRIES; attempt++){
      try {
        if(attempt > 0){
          status.textContent = `Reintentando (${attempt}/${MAX_RETRIES})…`;
          await new Promise(r => setTimeout(r, 2000 * attempt)); /* backoff */
        }
        resultText = await _f11StreamStructure({
          systemPrompt: sysPrompt,
          userMsg: userMsg,
          maxTokens: maxTok,
          onProgress: (partial) => {
            _f11StreamDraftText = partial; /* para guardado periódico */
            const pct = Math.min(15 + (partial.length / (maxTok * 3)) * 80, 95);
            bar.style.width = pct + '%';
            status.textContent = `Recibiendo texto… (${partial.length} caracteres)`;
            const editedEl = document.getElementById('f11EditedResult');
            if(editedEl) editedEl.value = partial;
          }
        });
        lastRetryError = null;
        break; /* éxito */
      } catch(retryErr){
        lastRetryError = retryErr;
        console.warn('[F11] Paso 2 intento ' + (attempt+1) + ' falló:', retryErr.message);
        /* Si hay texto parcial del draft, preservarlo */
        const draft = _f11LoadText('streaming_draft');
        if(draft && draft.length > 100){
          _f11EditedText = draft;
          _f11SaveText('editedText', draft);
          showToast('⚠ Se guardó texto parcial (' + draft.length + ' chars). Puedes reintentar.');
        }
        if(attempt === MAX_RETRIES) throw retryErr;
      }
    }

    _f11StopStreamDraftSave();

    _f11EditedText = resultText;
    transcripcion.structuredText = resultText;
    _f11CurrentStep = 2;

    /* Auto-guardar checkpoint */
    _f11CheckpointState();

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = `✅ Texto refundido generado (${resultText.length} caracteres) — respaldo automático activo`;

    const _er=document.getElementById('f11EditedResult');if(_er)_er.value = _f11EditedText;
    const _es=document.getElementById('f11EditedResultSection');if(_es)_es.style.display = 'block';
    const _s3=document.getElementById('f11Step3Section');if(_s3)_s3.style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 2 completado: texto refundido listo (respaldo automático)');

  } catch(e){
    _f11StopStreamDraftSave();
    bar.style.background = 'var(--red)';
    /* Si hay texto parcial guardado, informar */
    const draft = _f11LoadText('streaming_draft') || _f11LoadText('editedText');
    if(draft && draft.length > 100){
      status.textContent = '❌ Error: ' + e.message + ' — Texto parcial guardado (' + draft.length + ' chars). Puedes reintentar.';
      _f11EditedText = draft;
      const _er2=document.getElementById('f11EditedResult');if(_er2) _er2.value = draft;
      const _es2=document.getElementById('f11EditedResultSection');if(_es2) _es2.style.display = 'block';
    } else {
      status.textContent = '❌ Error: ' + e.message;
    }
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

    /* ── Llamar con streaming + guardado progresivo + reintentos ── */
    _f11StartStreamDraftSave('paso3');

    let resultText = '';
    const MAX_RETRIES = 2;

    for(let attempt = 0; attempt <= MAX_RETRIES; attempt++){
      try {
        if(attempt > 0){
          status.textContent = `Reintentando (${attempt}/${MAX_RETRIES})…`;
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
        resultText = await _f11StreamStructure({
          systemPrompt: sysPrompt,
          userMsg: userMsg,
          maxTokens: 8000,
          onProgress: (partial) => {
            _f11StreamDraftText = partial;
            const pct = Math.min(15 + (partial.length / 24000) * 80, 95);
            bar.style.width = pct + '%';
            status.textContent = `Generando acta… (${partial.length} caracteres)`;
            const preview = document.getElementById('f11FinalPreview');
            if(preview){
              preview.innerHTML = partial
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/_{30,}/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
                .replace(/\n/g, '<br>');
            }
          }
        });
        break; /* éxito */
      } catch(retryErr){
        console.warn('[F11] Paso 3 intento ' + (attempt+1) + ' falló:', retryErr.message);
        const draft = _f11LoadText('streaming_draft');
        if(draft && draft.length > 100){
          _f11FinalActa = draft;
          _f11SaveText('finalActa', draft);
          showToast('⚠ Se guardó acta parcial (' + draft.length + ' chars). Puedes reintentar.');
        }
        if(attempt === MAX_RETRIES) throw retryErr;
      }
    }

    _f11StopStreamDraftSave();

    _f11FinalActa = resultText;
    transcripcion.actaFinal = resultText;
    _f11CurrentStep = 3;

    /* Auto-guardar checkpoint */
    _f11CheckpointState();

    bar.style.width = '100%';
    bar.style.background = 'var(--green)';
    status.textContent = '✅ Acta lista para firmar — respaldo automático activo';

    const preview = document.getElementById('f11FinalPreview');
    if(preview){
      preview.innerHTML = _f11FinalActa
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/_{30,}/g, '<div style="border-bottom:1px solid #333;width:60%;margin:12px auto 4px"></div>')
        .replace(/\n/g, '<br>');
    }
    const _fs=document.getElementById('f11FinalSection');if(_fs)_fs.style.display = 'block';

    _f11UpdateSteps();
    showToast('✅ Paso 3 completado: acta lista para firmar (respaldo automático)');

  } catch(e){
    _f11StopStreamDraftSave();
    bar.style.background = 'var(--red)';
    const draft = _f11LoadText('streaming_draft') || _f11LoadText('finalActa');
    if(draft && draft.length > 100){
      status.textContent = '❌ Error: ' + e.message + ' — Acta parcial guardada (' + draft.length + ' chars). Puedes reintentar.';
      _f11FinalActa = draft;
      const p2=document.getElementById('f11FinalPreview');
      if(p2) p2.innerHTML = draft.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
    } else {
      status.textContent = '❌ Error: ' + e.message;
    }
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
  if(!currentCase || !session) return showToast('⚠ Para guardar en el expediente, primero vincula un caso usando el selector de arriba');
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
  if(!currentCase || !session) return showToast('⚠ Para guardar en el expediente, primero vincula un caso usando el selector de arriba');

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

/* ══════════════════ DESCARGAR WORD (.docx real) ══════════════════ */
/* Carga docx-js desde CDN si no está disponible */
let _f11DocxLib = null;
async function _f11LoadDocxLib(){
  if(_f11DocxLib) return _f11DocxLib;
  if(typeof docx !== 'undefined'){ _f11DocxLib = docx; return docx; }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/docx.min.js';
    s.onload = () => { _f11DocxLib = window.docx; resolve(window.docx); };
    s.onerror = () => reject(new Error('No se pudo cargar la librería docx'));
    document.head.appendChild(s);
  });
}

/**
 * Parsea el texto del acta en bloques estructurados para Word.
 * Devuelve array de { type: 'title'|'heading'|'paragraph'|'question'|'answer'|'signature', text, bold }
 */
function _f11ParseActaBlocks(text){
  /* Limpiar asteriscos residuales y guiones bajos */
  text = text.replace(/\*{3,}/g, '').replace(/_{5,}/g, '');

  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  while(i < lines.length){
    let line = lines[i].trim();

    /* Líneas vacías → saltar */
    if(!line){ i++; continue; }

    /* Título principal */
    if(line.match(/^ACTA DE DECLARACI[OÓ]N/i)){
      blocks.push({ type:'title', text: line.replace(/\*\*/g,'') });
      i++; continue;
    }

    /* Encabezados de sección (CONTEXTO, etc.) */
    if(line.match(/^(CONTEXTO|DECLARACI[OÓ]N COMPLEMENTARIA|OBSERVACIONES)$/i)){
      blocks.push({ type:'heading', text: line.replace(/\*\*/g,'') });
      i++; continue;
    }

    /* Preguntas numeradas: "1. Texto..." o "**1. Texto**" */
    const qMatch = line.match(/^\*{0,2}(\d+)\.\s*(.+?)\*{0,2}$/);
    if(qMatch){
      blocks.push({ type:'question', text: `${qMatch[1]}. ${qMatch[2].replace(/\*\*/g,'')}` });
      i++; continue;
    }

    /* Respuestas: "R." o "R:" */
    if(line.match(/^R[\.\:]\s*/i)){
      let answer = line.replace(/^R[\.\:]\s*/i, '').replace(/\*\*/g,'');
      /* Juntar líneas siguientes que son continuación */
      while(i+1 < lines.length && lines[i+1].trim() && !lines[i+1].trim().match(/^\*{0,2}\d+\./) && !lines[i+1].trim().match(/^R[\.\:]/i) && !lines[i+1].trim().match(/^(CONTEXTO|Sin más|Declarante|C\.I\.|Actuaria|Fiscal)/i)){
        i++;
        answer += ' ' + lines[i].trim().replace(/\*\*/g,'');
      }
      blocks.push({ type:'answer', text: answer.trim() });
      i++; continue;
    }

    /* Bloque de firmas — solo líneas cortas (< 100 chars) con nombres de firmantes */
    if(line.length < 100 && (line.match(/^(Declarante\s|C\.I\.\s*N°|Fiscal$|Actuaria$)/i) || line.match(/^(Verónica Garrido|Alejandra Mayorga)/i))){
      blocks.push({ type:'signature', text: line.replace(/\*\*/g,'') });
      i++; continue;
    }

    /* "Sin más que agregar..." → cierre */
    if(line.match(/^Sin más que agregar/i)){
      let closing = line.replace(/\*\*/g,'');
      while(i+1 < lines.length && lines[i+1].trim() && !lines[i+1].trim().match(/^(Declarante|C\.I\.|Fiscal|Actuaria|Verónica|Alejandra)/i)){
        i++;
        closing += ' ' + lines[i].trim().replace(/\*\*/g,'');
      }
      blocks.push({ type:'paragraph', text: closing.trim() });
      i++; continue;
    }

    /* Párrafo normal — juntar líneas consecutivas */
    let para = line.replace(/\*\*/g,'');
    while(i+1 < lines.length && lines[i+1].trim() && !lines[i+1].trim().match(/^\*{0,2}\d+\./) && !lines[i+1].trim().match(/^R[\.\:]/i) && !lines[i+1].trim().match(/^(CONTEXTO|Sin más|Declarante|ACTA DE)/i)){
      i++;
      para += ' ' + lines[i].trim().replace(/\*\*/g,'');
    }
    blocks.push({ type:'paragraph', text: para.trim() });
    i++;
  }

  return blocks;
}

async function f11DownloadWord(){
  const actaText = _f11FinalActa || _f11EditedText;
  if(!actaText) return showToast('⚠ Sin acta para descargar');

  showToast('⏳ Generando documento Word…');

  try {
    const lib = await _f11LoadDocxLib();
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Header, Footer, PageNumber, ImageRun, TabStopType, Tab } = lib;

    /* Logo UMAG: solo si esta transcripción pertenece a un caso;
       si es una transcripción suelta (sin caso vinculado) va sin logo */
    const _caseCtx = transcripcion.linkedCase || (typeof currentCase !== 'undefined' ? currentCase : null);
    let logoBuffer = null;
    if (_caseCtx) {
      try {
        logoBuffer = typeof getWordDocLogo === 'function'
          ? await getWordDocLogo()
          : await fetch('/img/logo-fiscalia-universitaria.png').then(r => r.ok ? r.arrayBuffer() : null);
      } catch(e){ console.warn('[F11] No se pudo cargar logo:', e); }
    }

    const tipo   = document.getElementById('f11Tipo')?.value || 'testigo';
    const nombre = (document.getElementById('f11NombreDeclarante')?.value||'').trim();
    const fecha  = document.getElementById('f11Fecha')?.value || '';
    const tipoLabel = {testigo:'Declaracion_testigo',denunciante:'Ratificacion_denuncia',denunciado:'Declaracion_denunciado',otro:'Diligencia'}[tipo]||'Acta';

    /* Parsear bloques */
    const blocks = _f11ParseActaBlocks(actaText);
    const children = [];

    /* Fuente base: Arial 11pt = size 22 (half-points) */
    const baseRun = { font:'Arial', size: 22 };
    /* Espaciado 1.5 = 360 twips (line rule auto) */
    const baseSpacing = { line: 360, lineRule: 'auto' };

    for(const block of blocks){
      switch(block.type){
        case 'title':
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { ...baseSpacing, after: 200 },
            children: [new TextRun({ ...baseRun, bold: true, text: block.text })]
          }));
          /* Línea vacía después del título */
          children.push(new Paragraph({ spacing: baseSpacing, children: [] }));
          break;

        case 'heading':
          children.push(new Paragraph({ spacing: baseSpacing, children: [] }));
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { ...baseSpacing, after: 0 },
            children: [new TextRun({ ...baseRun, bold: true, text: block.text })]
          }));
          break;

        case 'question':
          children.push(new Paragraph({ spacing: baseSpacing, children: [] }));
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { ...baseSpacing, after: 0 },
            children: [new TextRun({ ...baseRun, bold: true, text: block.text })]
          }));
          break;

        case 'answer':
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { ...baseSpacing, after: 0 },
            children: [
              new TextRun({ ...baseRun, bold: true, text: 'R. ' }),
              new TextRun({ ...baseRun, text: block.text })
            ]
          }));
          break;

        case 'signature':
          children.push(new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { ...baseSpacing, before: 0, after: 0 },
            children: [new TextRun({ ...baseRun, bold: true, text: block.text })]
          }));
          break;

        default: /* paragraph */
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: baseSpacing,
            children: [new TextRun({ ...baseRun, text: block.text })]
          }));
      }
    }

    /* Crear documento: Folio (8.5 x 13 pulgadas), Arial 11, 1.5 espaciado, justificado */
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 22 } /* 11pt */
          }
        }
      },
      sections: [{
        properties: {
          page: {
            size: {
              width: 12240,   /* 8.5 pulgadas en DXA */
              height: 18720   /* 13 pulgadas en DXA (tamaño folio/oficio) */
            },
            margin: {
              top: 1417,      /* ~1 pulgada */
              right: 1701,    /* ~1.18 pulgadas */
              bottom: 1417,
              left: 1701
            }
          }
        },
        headers: _caseCtx ? {
          default: new Header({
            children: logoBuffer ? [
              new Paragraph({
                children: [
                  new ImageRun({
                    /* Logo Fiscalía Universitaria — ratio ~3.1:1 */
                    data: logoBuffer,
                    transformation: { width: 240, height: 77 },
                    type: 'png'
                  })
                ]
              })
            ] : [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ font:'Arial', size: 16, color:'888888', text:'Universidad de Magallanes — Fiscalía Universitaria' })]
              })
            ]
          })
        } : undefined,
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ font:'Arial', size: 16, color:'888888', text:'Página ' }),
                new TextRun({ font:'Arial', size: 16, color:'888888', children: [PageNumber.CURRENT] })
              ]
            })]
          })
        },
        children
      }]
    });

    const buffer = await Packer.toBlob(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buffer);
    const safeName = (nombre || 'declarante').replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9\s_-]/g,'').replace(/\s+/g,'_');
    a.download = `Acta_${tipoLabel}_${safeName}_${fecha||new Date().toISOString().split('T')[0]}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📥 Acta descargada como Word (.docx)');

  } catch(e){
    console.error('[F11] Error generando Word:', e);
    showToast('❌ Error generando Word: ' + e.message);
    /* Fallback: descargar como texto */
    const blob = new Blob([actaText], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Acta_${nombre||'declarante'}_${fecha||'sin_fecha'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

/* ══════════════════ UTILIDADES UI ══════════════════ */
function f11CopyText(text){
  if(text){
    navigator.clipboard.writeText(text)
      .then(()=>showToast('📋 Texto copiado'))
      .catch(()=>showToast('⚠️ No se pudo copiar (permiso denegado)'));
  }
}

/* ══════════════════ CARGAR TRANSCRIPCIÓN PREVIA ══════════════════ */

/**
 * Busca transcripciones crudas guardadas previamente en el caso actual
 * y las muestra como lista seleccionable.
 */
async function f11LoadPrevTranscriptions(){
  const listEl = document.getElementById('f11PrevTransList');
  if(!listEl) return;

  if(!currentCase || !session){
    showToast('⚠ Para ver transcripciones guardadas, vincula un caso primero');
    listEl.style.display = 'none';
    return;
  }

  listEl.style.display = 'block';
  listEl.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--text-muted)">Buscando transcripciones guardadas…</div>';

  try {
    const sbClient = typeof supabaseClient !== 'undefined' ? supabaseClient : sb;

    /* Buscar en diligencias con transcripción cruda */
    const { data: diligencias, error } = await sbClient
      .from('diligencias')
      .select('id, diligencia_label, fecha_diligencia, extracted_text, processing_status, created_at')
      .eq('case_id', currentCase.id)
      .in('processing_status', ['transcripcion_cruda', 'acta_firmable'])
      .order('created_at', { ascending: false })
      .limit(20);

    if(error) throw error;

    if(!diligencias || !diligencias.length){
      listEl.innerHTML = '<div style="padding:10px;font-size:11px;color:var(--text-muted)">No hay transcripciones guardadas en este caso.</div>';
      return;
    }

    listEl.innerHTML = diligencias.map((d, idx) => {
      const fecha = d.fecha_diligencia ? new Date(d.fecha_diligencia+'T12:00:00').toLocaleDateString('es-CL') : '';
      const isCruda = d.processing_status === 'transcripcion_cruda';
      const tag = isCruda ? '🎙️ Cruda' : '📝 Acta';
      const tagColor = isCruda ? 'var(--gold)' : 'var(--green)';
      const charCount = (d.extracted_text||'').length;
      return `<div class="f11-prev-item" onclick="f11SelectPrevTranscription(${idx})" style="padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .15s" onmouseover="this.style.background='var(--gold-glow)'" onmouseout="this.style.background=''">
        <div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
          <div style="font-size:11.5px;font-weight:500;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.diligencia_label||'Sin título'}</div>
          <span style="font-size:9.5px;padding:1px 6px;border-radius:8px;background:${tagColor}22;color:${tagColor};font-weight:600;white-space:nowrap">${tag}</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${fecha ? fecha+' · ' : ''}${charCount.toLocaleString()} caracteres</div>
      </div>`;
    }).join('');

    /* Guardar datos para selección */
    window._f11PrevTranscriptions = diligencias;

  } catch(e){
    listEl.innerHTML = `<div style="padding:10px;font-size:11px;color:var(--red)">Error: ${typeof esc==='function'?esc(e.message):e.message}</div>`;
    console.error('LoadPrev error:', e);
  }
}

/**
 * Selecciona una transcripción previa y la carga en F11 como texto base.
 */
function f11SelectPrevTranscription(idx){
  const d = window._f11PrevTranscriptions?.[idx];
  if(!d || !d.extracted_text) return showToast('⚠ Sin texto en esta transcripción');

  /* Cargar en el flujo */
  _f11RawText = d.extracted_text;
  transcripcion.rawText = d.extracted_text;
  _f11CurrentStep = 1;

  /* Mostrar en la UI */
  const rawSection = document.getElementById('f11RawResultSection');
  const rawResult = document.getElementById('f11RawResult');
  if(rawSection) rawSection.style.display = 'block';
  if(rawResult) rawResult.value = _f11RawText;

  /* Mostrar Paso 2 (con opción de adjuntar cuestionario de preguntas) */
  const step2Section = document.getElementById('f11Step2Section');
  if(step2Section) step2Section.style.display = 'block';

  /* Habilitar botón Paso 2 */
  const editBtn = document.getElementById('f11EditBtn');
  if(editBtn) editBtn.disabled = false;

  /* Mostrar Paso 3 habilitado */
  const step3 = document.getElementById('f11Step3Section');
  if(step3) step3.style.display = 'block';

  /* Ocultar lista */
  const listEl = document.getElementById('f11PrevTransList');
  if(listEl) listEl.style.display = 'none';

  /* Extraer metadatos del label si están disponibles */
  if(d.diligencia_label){
    const nameMatch = d.diligencia_label.match(/:\s*(.+?)(?:\s*\(|$)/);
    if(nameMatch){
      const nameInput = document.getElementById('f11NombreDeclarante');
      if(nameInput && !nameInput.value) nameInput.value = nameMatch[1].trim();
    }
  }
  if(d.fecha_diligencia){
    const fechaInput = document.getElementById('f11Fecha');
    if(fechaInput && !fechaInput.value) fechaInput.value = d.fecha_diligencia;
  }

  _f11UpdateSteps();
  const isCruda = d.processing_status === 'transcripcion_cruda';
  showToast(`✅ Transcripción${isCruda?' cruda':''} cargada (${_f11RawText.length.toLocaleString()} caracteres). Puedes ir al Paso 2.`);
}

/**
 * Carga una transcripción desde un archivo .txt local.
 */
function f11LoadTranscriptionFile(file){
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    const text = e.target.result;
    if(!text || text.trim().length < 10) return showToast('⚠ El archivo está vacío o es muy corto');

    _f11RawText = text.trim();
    transcripcion.rawText = _f11RawText;
    _f11CurrentStep = 1;

    const rawSection = document.getElementById('f11RawResultSection');
    const rawResult = document.getElementById('f11RawResult');
    if(rawSection) rawSection.style.display = 'block';
    if(rawResult) rawResult.value = _f11RawText;

    /* Mostrar Paso 2 (adjuntar cuestionario) y Paso 3 */
    const step2 = document.getElementById('f11Step2Section');
    if(step2) step2.style.display = 'block';
    const editBtn = document.getElementById('f11EditBtn');
    if(editBtn) editBtn.disabled = false;
    const step3 = document.getElementById('f11Step3Section');
    if(step3) step3.style.display = 'block';

    _f11UpdateSteps();
    showToast(`✅ Transcripción cargada desde archivo (${_f11RawText.length.toLocaleString()} caracteres). Puedes ir al Paso 2.`);
  };
  reader.readAsText(file);
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

  /* Limpiar respaldos */
  _f11ClearTexts();
  _f11ClearDB();
  _f11StopStreamDraftSave();

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
console.log('%c🎙️ Módulo F11 Transcripción v10.0 — A prueba de fallos', 'color:#7c3aed;font-weight:bold');
console.log('%c   ✓ ElevenLabs/Whisper  ✓ Edición IA  ✓ Acta firmable  ✓ Auto-guardado IndexedDB+sessionStorage', 'color:#666');
console.log('%c   ✓ Detección offline  ✓ Reintentos automáticos  ✓ Recuperación de sesión  ✓ beforeunload', 'color:#666');