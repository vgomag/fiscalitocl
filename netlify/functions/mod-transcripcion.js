/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v4.0 · 2026-03-26 · Fiscalito / UMAG
   =========================================================
   · Soporte completo: MP3, WAV, M4A, AAC, OGG, OPUS, FLAC,
     WMA, AMR, 3GP, CAF, WebM, AIFF, MP4, MOV, AVI, MKV…
   · Chunking automático: audio largo → segmentos de 2 min
   · Cada chunk se comprime a 16kHz mono WAV (~3.7 MB)
   · Cabe en el límite de 6 MB de Netlify Functions
   · Endpoint /transcribe (Whisper→ElevenLabs→Claude) + fallback
   ========================================================= */

/* ── CONSTANTES ── */
const T_MAX_INPUT_MB  = 200;
const T_MAX_INPUT     = T_MAX_INPUT_MB * 1024 * 1024;
const T_CHUNK_SECS    = 120;          // 2 minutos por chunk
const T_SAMPLE_RATE   = 16000;        // 16kHz — estándar para speech
const T_CHANNELS      = 1;            // mono
const T_EP            = '/.netlify/functions/transcribe';

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
  spx:'audio/ogg',ac3:'audio/ac3',mka:'audio/x-matroska',
  mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',
  avi:'video/x-msvideo',mkv:'video/x-matroska',
  wmv:'video/x-ms-wmv',flv:'video/x-flv',ts:'video/mp2t',mts:'video/mp2t',
};

/* ── ESTADO ── */
const transcripcion = {
  isRecording:false, mediaRecorder:null, audioChunks:[],
  audioFile:null, audioUrl:null,
  baseDocText:'', baseDocName:'',
  rawText:'', structuredText:'', summary:'',
  segments:[], step:'upload',
  isProcessing:false, isGeneratingSummary:false,
  selectedMode:null, linkedCase:null,
  transcribeProvider:null,
  progress:{ current:0, total:0 },
};

/* ── MONKEY-PATCH ── */
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

/* ────────────────────────────────────────────────────────
   UTILIDADES
   ──────────────────────────────────────────────────────── */
const esc=typeof escHtml==='function'?escHtml:s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
function _ext(n){if(!n)return'';const p=n.toLowerCase().split('.');return p.length>1?p.pop():'';}
function _mime(f){const e=_ext(f.name);return(!f.type||f.type==='application/octet-stream')?T_MIME[e]||'audio/mpeg':f.type;}
function _isAV(f){if(!f)return false;const e=_ext(f.name);return T_EXTS.some(x=>x.replace('.','')=== e)||(f.type&&(f.type.startsWith('audio/')||f.type.startsWith('video/')));}
function _sz(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function _dur(s){const m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}

/* ────────────────────────────────────────────────────────
   AUDIO PROCESSING — Decode, chunk, encode WAV
   ──────────────────────────────────────────────────────── */

/** Decodifica cualquier formato de audio que el browser soporte */
async function decodeAudioFile(file){
  const buf = await file.arrayBuffer();
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  try { return await ctx.decodeAudioData(buf); }
  finally { ctx.close(); }
}

/** Extrae un segmento del AudioBuffer y lo resamplea a 16kHz mono */
async function extractChunk(audioBuf, startSec, endSec){
  const sr      = T_SAMPLE_RATE;
  const durSec  = Math.min(endSec, audioBuf.duration) - startSec;
  if(durSec <= 0) return null;

  const frames  = Math.ceil(durSec * sr);
  const offline  = new OfflineAudioContext(T_CHANNELS, frames, sr);
  const src      = offline.createBufferSource();
  src.buffer     = audioBuf;
  src.connect(offline.destination);
  src.start(0, startSec, durSec);
  return await offline.startRendering();
}

/** Codifica AudioBuffer → WAV Blob */
function toWav(buf){
  const ch=buf.numberOfChannels, sr=buf.sampleRate, bps=16;
  const bPer=bps/8, blk=ch*bPer, dLen=buf.length*blk;
  const ab=new ArrayBuffer(44+dLen), v=new DataView(ab);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF');v.setUint32(4,36+dLen,true);w(8,'WAVE');w(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*blk,true);
  v.setUint16(32,blk,true);v.setUint16(34,bps,true);
  w(36,'data');v.setUint32(40,dLen,true);
  const chs=[];for(let c=0;c<ch;c++)chs.push(buf.getChannelData(c));
  let off=44;
  for(let i=0;i<buf.length;i++){
    for(let c=0;c<ch;c++){
      let s=chs[c][i]; s=Math.max(-1,Math.min(1,s));
      v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true); off+=2;
    }
  }
  return new Blob([ab],{type:'audio/wav'});
}

/** Lee un Blob como base64 (solo la parte data) */
function blobToB64(blob){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result.split(',')[1]);
    r.onerror=rej; r.readAsDataURL(blob);
  });
}

/* ────────────────────────────────────────────────────────
   RENDER PRINCIPAL
   ──────────────────────────────────────────────────────── */
function renderF11Panel(){
  const panel=document.getElementById('fnPanel');
  const msgs=document.getElementById('msgs');
  const ragBar=document.getElementById('ragBar');
  if(!panel)return;
  if(msgs)msgs.style.display='none';
  if(ragBar)ragBar.style.display='none';
  panel.style.cssText='display:flex;flex-direction:column;padding:0;overflow:hidden;';
  panel.innerHTML=buildF11HTML();
  buildF11Chips();
  updateTransInputBar();
}
function updateTransPanel(){renderF11Panel();}

function buildF11HTML(){
  const linked=transcripcion.linkedCase;
  const p=transcripcion.progress;

  /* ── Docs section ── */
  const docsSection=`<div class="f11-section">
    <div class="f11-row" style="margin-bottom:8px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12v10H2z"/><path d="M5 3V1.5M11 3V1.5"/></svg>
      <span class="f11-section-title">Documentos de la Función</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <label class="f11-upload-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Subir documentos
        <input type="file" accept=".pdf,.docx,.doc,.txt" style="display:none" onchange="handleTransDocUpload(this)"/>
      </label>
      <label class="f11-upload-btn" style="border-color:var(--gold-dim);color:var(--gold)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        Subir audio / video
        <input type="file" accept="${T_ACCEPT}" style="display:none" onchange="handleTransAudioUpload(this)"/>
      </label>
    </div>
    ${transcripcion.audioFile
      ?`<div class="f11-file-chip">🔊 ${esc(transcripcion.audioFile.name)} <span style="font-size:10px;opacity:.7;margin-left:4px">(${_sz(transcripcion.audioFile.size)})</span>
          <button onclick="transcripcion.audioFile=null;transcripcion.audioUrl=null;renderF11Panel()" class="f11-chip-del">✕</button></div>`:''}
    ${transcripcion.baseDocName
      ?`<div class="f11-file-chip">📄 ${esc(transcripcion.baseDocName)} <button onclick="clearTransDoc()" class="f11-chip-del">✕</button></div>`
      :`<div class="f11-empty-docs">Sin documentos cargados para esta función</div>`}
    ${transcripcion.audioUrl?`<audio controls src="${transcripcion.audioUrl}" style="width:100%;margin-top:8px;height:32px"></audio>`:''}
  </div>`;

  /* ── Case section ── */
  const caseSection=`<div class="f11-section f11-case-section" onclick="toggleF11CaseDropdown()">
    <div class="f11-row" style="justify-content:space-between">
      <div class="f11-row" style="gap:7px">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2h12v12H2z"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="9" y2="8"/></svg>
        ${linked
          ?`<span style="color:var(--gold);font-weight:500;font-size:11.5px">📋 ${esc(linked.name)}${linked.rol?' · '+esc(linked.rol):''}</span>`
          :`<span style="font-size:11.5px;color:var(--text-dim)">Vincular con un Caso</span>`}
      </div>
      <span style="font-size:10px;color:var(--text-muted)">${linked?'✓ vinculado':'opcional'}</span>
    </div>
    ${linked?`<button class="btn-sm" style="font-size:9.5px;padding:2px 8px;margin-top:6px" onclick="event.stopPropagation();unlinkF11Case()">Desvincular</button>`:''}
  </div>
  <div id="f11CaseDropdown" style="display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-height:150px;overflow-y:auto;">
    ${(typeof allCases!=='undefined'?allCases:[]).slice(0,20).map(c=>
      `<div class="f11-case-option" onclick="linkF11Case('${c.id}')">
        <span style="font-weight:500;font-size:12px">${esc(c.name)}</span>
        ${c.rol?`<span style="font-size:10px;color:var(--text-muted)"> · ${esc(c.rol)}</span>`:''}
      </div>`).join('')}
  </div>`;

  /* ── Result ── */
  if(transcripcion.step==='result'&&(transcripcion.structuredText||transcripcion.rawText)){
    const text=transcripcion.structuredText||transcripcion.rawText;
    return`<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-result-actions">
        <button class="btn-sm" onclick="copyTranscripcion()">📋 Copiar</button>
        <button class="btn-sm" onclick="downloadTransWord()">⬇ Descargar</button>
        ${!transcripcion.summary?'<button class="btn-sm" onclick="generateTransSummary()">📊 Resumen IA</button>':''}
        <button class="btn-cancel" style="margin-left:auto" onclick="resetTranscripcion()">↺ Nueva</button>
      </div>
      ${transcripcion.transcribeProvider?`<div style="font-size:10px;color:var(--text-muted);text-align:right">Transcrito con: ${esc(transcripcion.transcribeProvider)}</div>`:''}
      ${transcripcion.summary?`<div class="trans-summary-box"><strong style="font-size:11px;color:var(--gold)">📊 Resumen</strong><div style="font-size:12px;margin-top:5px;line-height:1.6">${md(transcripcion.summary)}</div></div>`:''}
      <div class="trans-result-box">${md(text)}</div>
    </div>`;
  }

  /* ── Processing with progress ── */
  if(transcripcion.isProcessing){
    const stepMsg={
      decoding:'Decodificando audio…',
      transcribing: p.total>1
        ? `Transcribiendo segmento ${p.current} de ${p.total}…`
        : 'Transcribiendo audio…',
      structuring:'Estructurando como acta formal…',
    };
    const pct = p.total>1 ? Math.round((p.current/p.total)*100) : 0;
    const progressBar = p.total>1
      ? `<div style="width:80%;max-width:260px;height:4px;background:var(--border);border-radius:2px;margin:10px auto 0">
           <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:2px;transition:width .3s"></div>
         </div>
         <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${pct}%</div>`
      : '';
    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-processing">
        <div class="typing" style="justify-content:center"><div class="da"></div><div class="da"></div><div class="da"></div></div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">${stepMsg[transcripcion.step]||stepMsg.transcribing}</div>
        ${progressBar}
      </div>
    </div>`;
  }

  /* ── After transcription ── */
  if(transcripcion.step==='structure'&&transcripcion.rawText){
    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${caseSection}
      <div class="f11-section">
        <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Transcripción obtenida</div>
        <div class="trans-raw-box">${esc(transcripcion.rawText.substring(0,600))}${transcripcion.rawText.length>600?'…':''}</div>
      </div>
      <div class="f11-action-row">
        <button class="btn-save" style="flex:1" onclick="structureTranscripcion()">📋 Estructurar como Acta</button>
        <button class="btn-sm" onclick="generateTransSummary()">📊 Resumen</button>
        <button class="btn-cancel" onclick="resetTranscripcion()">↺ Reiniciar</button>
      </div>
    </div>`;
  }

  /* ── Default: upload ── */
  return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
    ${docsSection}${caseSection}
    <div class="f11-fn-card">
      <div class="f11-fn-card-header">
        <span class="f11-fn-badge">F11</span>
        <span class="f11-fn-title">Función F11 – Transcripción de Actas</span>
      </div>
      <div class="f11-fn-desc">
        Transcribe archivos de audio o video de declaraciones a texto estructurado.
        Suba el archivo y opcionalmente un documento base para generar un acta formal.
      </div>
    </div>
    <div class="f11-format-card">
      <div class="f11-format-label">FORMATOS SOPORTADOS</div>
      <div class="f11-format-body">
        <strong>Audio:</strong> MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WMA, AMR, AIFF, CAF, WebM, 3GP<br>
        <strong>Video:</strong> MP4, MOV, AVI, MKV, WMV, FLV, WebM<br>
        <strong>Grabaciones:</strong> iPhone (CAF/M4A), Android (AMR/3GP/OGG), WhatsApp (OPUS/OGG)<br><br>
        <em>Sin límite de duración. El audio se procesa en segmentos automáticamente.</em>
      </div>
    </div>
    <div class="f11-note">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r=".5" fill="#f59e0b" stroke="none"/></svg>
      La transcripción se realiza mediante IA. Revise siempre el texto resultante para verificar precisión de nombres, fechas y términos técnicos.
    </div>
  </div>`;
}

/* ── Chips ── */
function buildF11Chips(){
  const row=document.getElementById('fnChipsRow');if(!row)return;
  const modes=[
    {id:'solo',label:'+ Solo transcribir'},
    {id:'pregunta_respuesta',label:'+ Formato pregunta-respuesta'},
    {id:'con_expediente',label:'+ Con datos del expediente'},
  ];
  row.innerHTML=modes.map(m=>
    `<button class="fn-chip ${transcripcion.selectedMode===m.id?'fn-chip-active':''}"
       onclick="selectF11Mode('${m.id}')">${esc(m.label)}</button>`
  ).join('');
}
function selectF11Mode(mode){
  transcripcion.selectedMode=transcripcion.selectedMode===mode?null:mode;
  buildF11Chips();
  const hint=document.getElementById('fnHint');
  if(hint)hint.textContent=({solo:'Solo transcribir',pregunta_respuesta:'Formato pregunta-respuesta',con_expediente:'Con datos del expediente'})[mode]||'Suba audio/video para transcribir';
}

/* ── Input bar ── */
function updateTransInputBar(){
  const hint=document.getElementById('fnHint');
  const ah=document.querySelector('.input-attach-hint');
  if(hint)hint.textContent='Suba audio/video para transcribir.';
  if(ah)ah.textContent='Audio/Video';
  const fi=document.getElementById('fnDocInput');
  if(fi){
    fi.accept=T_ACCEPT;
    fi.onchange=function(e){
      const f=e.target.files?.[0];if(!f)return;
      if(!_isAV(f)){showToast('⚠ Formato no reconocido: .'+_ext(f.name));return;}
      if(f.size>T_MAX_INPUT){showToast(`⚠ Archivo muy grande (${_sz(f.size)})`);return;}
      transcripcion.audioFile=f;
      transcripcion.audioUrl=URL.createObjectURL(f);
      transcripcion.step='upload';
      renderF11Panel();
      showToast(`✓ ${f.name} (${_sz(f.size)})`);
    };
  }
}

/* ── Case ── */
function toggleF11CaseDropdown(){const dd=document.getElementById('f11CaseDropdown');if(dd)dd.style.display=dd.style.display==='none'?'block':'none';}
function linkF11Case(id){const c=(typeof allCases!=='undefined'?allCases:[]).find(x=>x.id===id);if(c){transcripcion.linkedCase=c;showToast(`✓ Vinculado: ${c.name}`);}renderF11Panel();}
function unlinkF11Case(){transcripcion.linkedCase=null;renderF11Panel();}

/* ── File uploads ── */
function handleTransAudioUpload(input){
  const f=input.files?.[0];if(!f)return;
  if(!_isAV(f)){showToast('⚠ Formato no reconocido. Use MP3, WAV, M4A, OGG, MP4, etc.');input.value='';return;}
  if(f.size>T_MAX_INPUT){showToast(`⚠ Archivo muy grande (${_sz(f.size)})`);input.value='';return;}
  transcripcion.audioFile=f;
  transcripcion.audioUrl=URL.createObjectURL(f);
  renderF11Panel();
  showToast(`✓ ${f.name} (${_sz(f.size)})`);
  input.value='';
}
function handleTransDocUpload(input){
  const f=input.files?.[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{transcripcion.baseDocText=e.target.result||'';transcripcion.baseDocName=f.name;renderF11Panel();showToast(`✓ ${f.name}`);};
  r.readAsText(f);input.value='';
}
function clearTransDoc(){transcripcion.baseDocText='';transcripcion.baseDocName='';renderF11Panel();}

/* ── Grabación ── */
function startTransRecording(){
  navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
    transcripcion.audioChunks=[];
    const opts=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
    let mimeOpt='';for(const m of opts){if(MediaRecorder.isTypeSupported(m)){mimeOpt=m;break;}}
    transcripcion.mediaRecorder=new MediaRecorder(stream,mimeOpt?{mimeType:mimeOpt}:{});
    transcripcion.mediaRecorder.ondataavailable=e=>transcripcion.audioChunks.push(e.data);
    transcripcion.mediaRecorder.onstop=()=>{
      const mt=transcripcion.mediaRecorder.mimeType||'audio/webm';
      const e=mt.includes('mp4')?'m4a':mt.includes('ogg')?'ogg':'webm';
      const blob=new Blob(transcripcion.audioChunks,{type:mt});
      transcripcion.audioFile=new File([blob],`grabacion.${e}`,{type:mt});
      transcripcion.audioUrl=URL.createObjectURL(blob);
      transcripcion.isRecording=false;
      stream.getTracks().forEach(t=>t.stop());
      renderF11Panel();showToast('✓ Grabado');
    };
    transcripcion.mediaRecorder.start();transcripcion.isRecording=true;renderF11Panel();
  }).catch(err=>showToast('⚠ Micrófono: '+err.message));
}
function stopTransRecording(){if(transcripcion.mediaRecorder&&transcripcion.isRecording)transcripcion.mediaRecorder.stop();}

/* ════════════════════════════════════════════════════════
   TRANSCRIBIR — con chunking automático
   1. Decodificar audio (cualquier formato → AudioBuffer)
   2. Dividir en chunks de 2 min
   3. Cada chunk → 16kHz mono WAV → base64 → API
   4. Unir todas las transcripciones
   ════════════════════════════════════════════════════════ */
async function transcribeAudio(){
  if(!transcripcion.audioFile){showToast('⚠ Carga un archivo de audio primero');return;}

  const inputBox=document.getElementById('inputBox');
  const extraInstr=inputBox?.value.trim()||'';
  if(inputBox)inputBox.value='';

  transcripcion.isProcessing=true;
  transcripcion.transcribeProvider=null;
  transcripcion.progress={current:0,total:0};

  try {
    /* ── 1. Decodificar ── */
    transcripcion.step='decoding';renderF11Panel();
    showToast('Decodificando audio…');
    let audioBuf;
    try {
      audioBuf = await decodeAudioFile(transcripcion.audioFile);
    } catch(decErr) {
      throw new Error(`No se pudo decodificar el audio (${_ext(transcripcion.audioFile.name).toUpperCase()}). El formato podría no ser compatible con su navegador. Intente convertir a MP3.`);
    }

    const totalDur = audioBuf.duration;
    const numChunks = Math.ceil(totalDur / T_CHUNK_SECS);
    console.log(`Audio: ${_dur(totalDur)} | ${numChunks} chunks de ${T_CHUNK_SECS}s`);

    /* ── 2. Contexto ── */
    const lnk=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const modeCtx=transcripcion.selectedMode==='pregunta_respuesta'
      ?'Formato PREGUNTA-RESPUESTA con roles [FISCAL] y [DECLARANTE]'
      :transcripcion.selectedMode==='con_expediente'
      ?'Incluye datos del expediente en el encabezado':'Transcripción directa';
    const instructions=[modeCtx,lnk?'Expediente: '+lnk.name:'',extraInstr].filter(Boolean).join('. ');

    /* ── 3. Procesar chunks ── */
    transcripcion.step='transcribing';
    transcripcion.progress={current:0,total:numChunks};
    renderF11Panel();

    const allTranscripts = [];
    let provider = null;

    for(let i=0; i<numChunks; i++){
      const startSec = i * T_CHUNK_SECS;
      const endSec   = Math.min((i+1) * T_CHUNK_SECS, totalDur);

      transcripcion.progress.current = i+1;
      renderF11Panel();

      // Extraer chunk como 16kHz mono WAV
      const chunkBuf = await extractChunk(audioBuf, startSec, endSec);
      if(!chunkBuf) continue;

      const wavBlob = toWav(chunkBuf);
      const b64     = await blobToB64(wavBlob);

      console.log(`Chunk ${i+1}/${numChunks}: ${_dur(startSec)}-${_dur(endSec)} | WAV: ${_sz(wavBlob.size)} | b64: ${_sz(b64.length)}`);

      // Contexto de continuidad para chunks
      const chunkInstr = numChunks > 1
        ? `${instructions}. Este es el segmento ${i+1} de ${numChunks} (${_dur(startSec)} a ${_dur(endSec)}).${i>0?' Continúa desde el segmento anterior.':''}`
        : instructions;

      // Intentar /transcribe primero, fallback a /chat
      const result = await sendChunkForTranscription(b64, `chunk_${i+1}.wav`, chunkInstr);
      allTranscripts.push(result.text);
      if(result.provider) provider = result.provider;
    }

    /* ── 4. Unir ── */
    const fullText = allTranscripts.filter(Boolean).join('\n\n');
    if(!fullText.trim()) throw new Error('No se obtuvo transcripción de ningún segmento');

    // Si hubo múltiples chunks, agregar marcas de tiempo
    let finalText = fullText;
    if(numChunks > 1){
      finalText = allTranscripts.map((t,i) => {
        const start = _dur(i * T_CHUNK_SECS);
        const end   = _dur(Math.min((i+1) * T_CHUNK_SECS, totalDur));
        return `[${start} – ${end}]\n${t}`;
      }).filter((_,i) => allTranscripts[i]?.trim()).join('\n\n---\n\n');
    }

    transcripcion.rawText = finalText;
    transcripcion.transcribeProvider = provider;
    transcripcion.step = 'structure';
    transcripcion.isProcessing = false;
    renderF11Panel();
    showToast(`✓ Transcripción completa (${_dur(totalDur)})`);

  } catch(err){
    transcripcion.isProcessing=false;transcripcion.step='upload';
    renderF11Panel();showToast('⚠ '+err.message);
    console.error('Transcripción error:',err);
  }
}

/** Envía un chunk base64 al backend. Intenta /transcribe, fallback /chat */
async function sendChunkForTranscription(b64, fileName, instructions){
  // Intentar endpoint dedicado
  try {
    const resp=await fetch(T_EP,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({audioBase64:b64, fileName, mimeType:'audio/wav', instructions})
    });
    if(resp.ok){
      const data=await resp.json();
      if(data.transcript) return {text:data.transcript, provider:data.provider};
    }
  } catch(e){ console.warn('/transcribe falló:',e); }

  // Fallback: Claude via /chat
  const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
  const body={
    model:'claude-sonnet-4-20250514', max_tokens:4000,
    system:`Eres Fiscalito. Transcribe el audio fielmente. Identifica hablantes con [FISCAL],[DECLARANTE],[TESTIGO],[ACTUARIO]. Partes inaudibles: [INAUDIBLE]. ${instructions}`,
    messages:[{role:'user',content:[
      {type:'text',text:'Transcribe este audio fielmente.'},
      {type:'document',source:{type:'base64',media_type:'audio/wav',data:b64}}
    ]}]
  };
  const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data=await resp.json();
  const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
  return {text, provider:'claude-direct'};
}

/* ── Estructurar ── */
async function structureTranscripcion(){
  if(!transcripcion.rawText)return;
  transcripcion.step='structuring';transcripcion.isProcessing=true;renderF11Panel();
  try {
    const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
    const lnk=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
    const body={model:'claude-sonnet-4-20250514',max_tokens:4000,
      system:`Eres Fiscalito. Estructura la transcripción como ACTA FORMAL institucional UMAG. Expediente: ${lnk?.name||'[EXPEDIENTE]'} | ROL: ${lnk?.rol||'[ROL]'} | Fecha: ${new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}. ${transcripcion.baseDocText?'Documento base disponible.':''}`,
      messages:[{role:'user',content:`Estructura como acta formal:\n\n${transcripcion.rawText}`}]};
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.structuredText=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.step='result';transcripcion.isProcessing=false;renderF11Panel();showToast('✓ Acta estructurada');
  } catch(err){transcripcion.isProcessing=false;transcripcion.step='structure';renderF11Panel();showToast('⚠ '+err.message);}
}

/* ── Resumen ── */
async function generateTransSummary(){
  if(!transcripcion.rawText)return;
  transcripcion.isGeneratingSummary=true;renderF11Panel();
  try {
    const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
    const body={model:'claude-sonnet-4-20250514',max_tokens:600,
      system:'Eres Fiscalito. Resumen ejecutivo en 3-5 puntos clave.',
      messages:[{role:'user',content:`Resumen:\n\n${transcripcion.rawText.substring(0,2500)}`}]};
    const resp=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.summary=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.isGeneratingSummary=false;renderF11Panel();
  } catch(err){transcripcion.isGeneratingSummary=false;renderF11Panel();showToast('⚠ '+err.message);}
}

/* ── Acciones ── */
function copyTranscripcion(){navigator.clipboard.writeText(transcripcion.structuredText||transcripcion.rawText);showToast('✓ Copiado');}
function downloadTransWord(){
  const b=new Blob([transcripcion.structuredText||transcripcion.rawText],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`acta_${Date.now()}.txt`;a.click();URL.revokeObjectURL(a.href);
}
function resetTranscripcion(){
  if(transcripcion.audioUrl)URL.revokeObjectURL(transcripcion.audioUrl);
  Object.assign(transcripcion,{isRecording:false,audioChunks:[],audioFile:null,audioUrl:null,baseDocText:'',baseDocName:'',rawText:'',structuredText:'',summary:'',segments:[],step:'upload',isProcessing:false,isGeneratingSummary:false,selectedMode:null,transcribeProvider:null,progress:{current:0,total:0}});
  renderF11Panel();buildF11Chips();
}
function switchTransView(){renderF11Panel();}

/* ── CSS ── */
(function(){
  if(document.getElementById('f11-css'))return;
  const s=document.createElement('style');s.id='f11-css';
  s.textContent=`
.f11-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:11px 14px;}
.f11-case-section{cursor:pointer;transition:border-color .14s}.f11-case-section:hover{border-color:var(--border2)}
.f11-row{display:flex;align-items:center;gap:6px}
.f11-section-title{font-size:12px;font-weight:500;color:var(--text-dim)}
.f11-upload-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-dim);padding:6px 14px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:'Inter',sans-serif;transition:all .14s}
.f11-upload-btn:hover{border-color:var(--gold-dim);color:var(--gold)}
.f11-empty-docs{font-size:11.5px;color:var(--text-muted);margin-top:7px}
.f11-file-chip{display:inline-flex;align-items:center;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:3px 10px;border-radius:12px;font-size:11px;margin-top:6px}
.f11-chip-del{background:none;border:none;cursor:pointer;color:var(--text-muted);margin-left:4px;padding:0;font-size:11px}
.f11-case-option{padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--border)}.f11-case-option:hover{background:var(--surface2)}
.f11-fn-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px}
.f11-fn-card-header{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.f11-fn-badge{background:var(--gold);color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:'DM Mono',monospace}
.f11-fn-title{font-size:12.5px;font-weight:600;color:var(--text)}
.f11-fn-desc{font-size:12px;color:var(--text-dim);line-height:1.6}
.f11-format-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px}
.f11-format-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px}
.f11-format-body{font-size:12px;color:var(--text-dim);line-height:1.6}
.f11-note{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text-muted);padding:8px 12px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:var(--radius);line-height:1.5}
.f11-processing{text-align:center;padding:30px;color:var(--text-muted)}
.f11-result-actions{display:flex;gap:6px;flex-wrap:wrap}
.f11-action-row{display:flex;gap:7px;flex-wrap:wrap}
.fn-chip-active{background:var(--gold-glow)!important;border-color:var(--gold-dim)!important;color:var(--gold)!important}
.trans-raw-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:11.5px;line-height:1.65;max-height:130px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim)}
.trans-summary-box{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:12px 14px}
.trans-result-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:12.5px;line-height:1.75;max-height:calc(100vh - 300px);overflow-y:auto}
.trans-result-box h1,.trans-result-box h2,.trans-result-box h3{font-family:'EB Garamond',serif;color:var(--gold)}
`;
  document.head.appendChild(s);
})();
