/* =========================================================
   MOD-TRANSCRIPCION.JS — F11 Transcripción de Actas
   v5.0 · 2026-03-27 · Fiscalito / UMAG
   =========================================================
   Mejoras v5:
   · Barra de progreso visual con %, etapas y tiempo
   · Reintento automático 2x ante errores
   · Fix modo "con expediente" — carga datos completos del caso
   ========================================================= */

/* ── CONSTANTES ── */
const T_MAX_INPUT_MB  = 200;
const T_MAX_INPUT     = T_MAX_INPUT_MB * 1024 * 1024;
const T_CHUNK_SECS    = 60;
const T_SAMPLE_RATE   = 16000;
const T_CHANNELS      = 1;
const T_MAX_RETRIES   = 2;

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
  progress:{ current:0, total:0, pct:0, stepLabel:'', startTime:0, retryCount:0 },
  /* Metadata del acta */
  meta:{ tipoDeclarante:'testigo', nombreDeclarante:'', fecha:'', lugar:'Punta Arenas' },
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

/* ── UTILIDADES ── */
function _ext(n){if(!n)return'';const p=n.toLowerCase().split('.');return p.length>1?p.pop():'';}
function _mime(f){const e=_ext(f.name);return(!f.type||f.type==='application/octet-stream')?T_MIME[e]||'audio/mpeg':f.type;}
function _isAV(f){if(!f)return false;const e=_ext(f.name);return T_EXTS.some(x=>x.replace('.','')=== e)||(f.type&&(f.type.startsWith('audio/')||f.type.startsWith('video/')));}
function _sz(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function _dur(s){const m=Math.floor(s/60),ss=Math.floor(s%60);return m+':'+(ss<10?'0':'')+ss;}
function _elapsed(startMs){if(!startMs)return'';const s=Math.floor((Date.now()-startMs)/1000);if(s<60)return s+'s';return Math.floor(s/60)+'m '+s%60+'s';}
function _fmtArr(v){if(!v)return'';if(Array.isArray(v))return v.join(', ');try{const a=JSON.parse(v);return Array.isArray(a)?a.join(', '):String(v);}catch{return String(v);}}

/* ── SLEEP ── */
function _sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ────────────────────────────────────────────────────────
   PROGRESS HELPERS
   ──────────────────────────────────────────────────────── */
function setProgress(pct,label){
  transcripcion.progress.pct=Math.min(100,Math.max(0,Math.round(pct)));
  transcripcion.progress.stepLabel=label||'';
  updateProgressUI();
}

function updateProgressUI(){
  const bar=document.getElementById('f11ProgressBar');
  const lbl=document.getElementById('f11ProgressLabel');
  const pctEl=document.getElementById('f11ProgressPct');
  const timeEl=document.getElementById('f11ProgressTime');
  const retryEl=document.getElementById('f11RetryBadge');
  const p=transcripcion.progress;
  if(bar)bar.style.width=p.pct+'%';
  if(lbl)lbl.textContent=p.stepLabel;
  if(pctEl)pctEl.textContent=p.pct+'%';
  if(timeEl)timeEl.textContent=_elapsed(p.startTime);
  if(retryEl){
    if(p.retryCount>0){retryEl.style.display='inline';retryEl.textContent='Reintento '+p.retryCount+'/'+T_MAX_RETRIES;}
    else retryEl.style.display='none';
  }
}

// Timer that updates elapsed time every second
let _progressTimer=null;
function startProgressTimer(){
  stopProgressTimer();
  transcripcion.progress.startTime=Date.now();
  _progressTimer=setInterval(updateProgressUI,1000);
}
function stopProgressTimer(){
  if(_progressTimer){clearInterval(_progressTimer);_progressTimer=null;}
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
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      <span class="f11-section-title">Archivos de Transcripción</span>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <label class="f11-upload-audio-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Subir audio / video (MP3, M4A, WAV, OGG, MP4…)
        <input type="file" accept="${T_ACCEPT}" style="display:none" onchange="handleTransAudioUpload(this)"/>
      </label>
      <label class="f11-upload-btn" style="font-size:11px;padding:4px 10px" title="Suba el acta/cuestionario con las preguntas para que se llene con las respuestas del audio">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Acta / Cuestionario base (opcional)
        <input type="file" accept=".pdf,.docx,.doc,.txt" style="display:none" onchange="handleTransDocUpload(this)"/>
      </label>
    </div>
    ${transcripcion.audioFile
      ?`<div class="f11-file-chip">🔊 ${esc(transcripcion.audioFile.name)} <span style="font-size:10px;opacity:.7;margin-left:4px">(${_sz(transcripcion.audioFile.size)})</span>
          <button onclick="transcripcion.audioFile=null;transcripcion.audioUrl=null;renderF11Panel()" class="f11-chip-del">✕</button></div>`:''}
    ${transcripcion.baseDocName
      ?`<div class="f11-file-chip">📄 ${esc(transcripcion.baseDocName)} <span style="font-size:10px;opacity:.7;margin-left:4px">(se llenará con audio)</span> <button onclick="clearTransDoc()" class="f11-chip-del">✕</button></div>`
      :`<div class="f11-empty-docs">${transcripcion.audioFile?'Opcionalmente suba un acta/cuestionario base para llenar con el audio':'Use el botón de arriba para cargar su archivo de audio'}</div>`}
    ${transcripcion.audioUrl?`<audio controls src="${transcripcion.audioUrl}" style="width:100%;margin-top:8px;height:32px"></audio>`:''}
  </div>`;

  /* ── Metadata del acta ── */
  const m=transcripcion.meta;
  const todayISO=new Date().toISOString().split('T')[0];
  const metaSection=`<div class="f11-section">
    <div class="f11-row" style="margin-bottom:8px">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      <span class="f11-section-title">Datos del Acta</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="f11-form-field">
        <label>Tipo de acta</label>
        <select id="f11TipoDeclarante" onchange="transcripcion.meta.tipoDeclarante=this.value" class="f11-input">
          <option value="testigo" ${m.tipoDeclarante==='testigo'?'selected':''}>Declaración de testigo</option>
          <option value="denunciante" ${m.tipoDeclarante==='denunciante'?'selected':''}>Ratificación de denuncia</option>
          <option value="denunciado" ${m.tipoDeclarante==='denunciado'?'selected':''}>Declaración persona denunciada</option>
          <option value="otro" ${m.tipoDeclarante==='otro'?'selected':''}>Otra diligencia</option>
        </select>
      </div>
      <div class="f11-form-field">
        <label>Nombre del declarante</label>
        <input id="f11NombreDeclarante" value="${esc(m.nombreDeclarante)}" placeholder="Nombre completo" onchange="transcripcion.meta.nombreDeclarante=this.value" class="f11-input"/>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <div class="f11-form-field">
        <label>Fecha de la diligencia</label>
        <input id="f11Fecha" type="date" value="${m.fecha||todayISO}" onchange="transcripcion.meta.fecha=this.value" class="f11-input"/>
      </div>
      <div class="f11-form-field">
        <label>Lugar</label>
        <input id="f11Lugar" value="${esc(m.lugar)}" placeholder="Ej: Punta Arenas" onchange="transcripcion.meta.lugar=this.value" class="f11-input"/>
      </div>
    </div>
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
      ${docsSection}${metaSection}${caseSection}
      <div class="f11-result-actions">
        <button class="btn-save" onclick="saveTranscripcionToCase()" style="font-size:11.5px">💾 Guardar al expediente</button>
        <button class="btn-sm" onclick="copyTranscripcion()">📋 Copiar</button>
        <button class="btn-sm" onclick="downloadTransWord()">⬇ TXT</button>
        <button class="btn-sm" onclick="exportActaToWord()" style="background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:600">📄 Word</button>
        ${!transcripcion.summary?'<button class="btn-sm" onclick="generateTransSummary()">📊 Resumen IA</button>':''}
        <button class="btn-cancel" style="margin-left:auto" onclick="resetTranscripcion()">↺ Nueva</button>
      </div>
      ${transcripcion.transcribeProvider?`<div style="font-size:10px;color:var(--text-muted);text-align:right">Transcrito con: ${esc(transcripcion.transcribeProvider)}</div>`:''}
      ${transcripcion.summary?`<div class="trans-summary-box"><strong style="font-size:11px;color:var(--gold)">📊 Resumen</strong><div style="font-size:12px;margin-top:5px;line-height:1.6">${md(transcripcion.summary)}</div></div>`:''}
      <div class="trans-result-box">${md(text)}</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════
     PROCESSING — Enhanced progress bar
     ══════════════════════════════════════════════════ */
  if(transcripcion.isProcessing){
    const pct=p.pct||0;
    const retryBadge=p.retryCount>0?`<span id="f11RetryBadge" style="display:inline;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);color:#d97706;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600">Reintento ${p.retryCount}/${T_MAX_RETRIES}</span>`:`<span id="f11RetryBadge" style="display:none"></span>`;

    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${metaSection}${caseSection}
      <div class="f11-progress-card">
        <div class="f11-progress-header">
          <div class="typing" style="justify-content:flex-start;gap:3px"><div class="da"></div><div class="da"></div><div class="da"></div></div>
          <span id="f11ProgressTime" style="font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${_elapsed(p.startTime)}</span>
        </div>
        <div class="f11-progress-bar-wrap">
          <div class="f11-progress-bar-bg">
            <div class="f11-progress-bar-fill" id="f11ProgressBar" style="width:${pct}%"></div>
          </div>
          <span class="f11-progress-pct" id="f11ProgressPct">${pct}%</span>
        </div>
        <div class="f11-progress-label" id="f11ProgressLabel">${esc(p.stepLabel||'Preparando…')}</div>
        <div style="margin-top:6px;text-align:center">${retryBadge}</div>
        <div class="f11-progress-steps">
          <div class="f11-pstep ${pct>=5?'done':''}${pct>0&&pct<30?' active':''}">📥 Preparar</div>
          <div class="f11-pstep ${pct>=30?'done':''}${pct>=20&&pct<80?' active':''}">🎙 Transcribir</div>
          <div class="f11-pstep ${pct>=80?'done':''}${pct>=80&&pct<100?' active':''}">📋 Estructurar</div>
          <div class="f11-pstep ${pct>=100?'done':''}">✅ Listo</div>
        </div>
      </div>
    </div>`;
  }

  /* ── After transcription ── */
  if(transcripcion.step==='structure'&&transcripcion.rawText){
    return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
      ${docsSection}${metaSection}${caseSection}
      <div class="f11-section">
        <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Transcripción obtenida</div>
        <div class="trans-raw-box">${esc(transcripcion.rawText.substring(0,600))}${transcripcion.rawText.length>600?'…':''}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${transcripcion.rawText.length} caracteres</div>
      </div>
      <div class="f11-section" style="padding:10px 14px">
        <div style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Estructurar como acta</div>
        <div class="f11-action-row">
          <button class="btn-save" style="flex:1" onclick="transcripcion.selectedMode='pregunta_respuesta';structureTranscripcion()">📋 Pregunta-Respuesta</button>
          <button class="btn-sm" style="flex:1" onclick="transcripcion.selectedMode='solo';structureTranscripcion()">📄 Acta directa</button>
          <button class="btn-sm" style="flex:1" onclick="transcripcion.selectedMode='con_expediente';structureTranscripcion()">📁 Con expediente</button>
        </div>
      </div>
      <div class="f11-action-row">
        <button class="btn-sm" onclick="generateTransSummary()">📊 Resumen</button>
        <button class="btn-sm" onclick="copyTranscripcion()">📋 Copiar texto crudo</button>
        <button class="btn-cancel" onclick="resetTranscripcion()">↺ Reiniciar</button>
      </div>
    </div>`;
  }

  /* ── Default: upload ── */
  const hasAudio = !!transcripcion.audioFile;
  return`<div style="flex:1;display:flex;flex-direction:column;overflow-y:auto;padding:12px;gap:8px">
    ${docsSection}${metaSection}${caseSection}
    ${hasAudio ? `<button class="f11-transcribe-btn" onclick="transcribeAudio()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
      Transcribir audio
    </button>` : ''}
    <div class="f11-fn-card">
      <div class="f11-fn-card-header">
        <span class="f11-fn-badge">F11</span>
        <span class="f11-fn-title">Función F11 – Transcripción de Actas</span>
      </div>
      <div class="f11-fn-desc">
        ${hasAudio ? 'Audio cargado. Presione <strong>Transcribir audio</strong> para iniciar.' : 'Suba un archivo de audio o video para transcribirlo.'}
      </div>
    </div>
    ${!hasAudio ? `<div class="f11-format-card">
      <div class="f11-format-label">FORMATOS SOPORTADOS</div>
      <div class="f11-format-body">
        <strong>Audio:</strong> MP3, WAV, M4A, AAC, OGG, OPUS, FLAC, WMA, AMR, AIFF, CAF, WebM, 3GP<br>
        <strong>Video:</strong> MP4, MOV, AVI, MKV, WMV, FLV, WebM<br>
        <strong>Grabaciones:</strong> iPhone (CAF/M4A), Android (AMR/3GP/OGG), WhatsApp (OPUS/OGG)
      </div>
    </div>` : ''}
    <div class="f11-note">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" stroke-width="1.5" style="flex-shrink:0;margin-top:1px"><circle cx="8" cy="8" r="6"/><line x1="8" y1="5" x2="8" y2="8.5"/><circle cx="8" cy="11" r=".5" fill="#f59e0b" stroke="none"/></svg>
      La transcripción se realiza mediante IA. Revise siempre el texto resultante.
    </div>
  </div>`;
}

/* ── Chips ── */
function buildF11Chips(){
  const row=document.getElementById('fnChipsRow');if(!row)return;
  const hasDoc=!!transcripcion.baseDocText;
  const modes=hasDoc?[
    {id:'fill_acta',label:'📄 Llenar acta con audio'},
    {id:'pregunta_respuesta',label:'+ Solo Q&A'},
    {id:'con_expediente',label:'+ Acta formal nueva'},
  ]:[
    {id:'directa',label:'+ Acta formal'},
    {id:'pregunta_respuesta',label:'+ Formato Q&A'},
    {id:'con_expediente',label:'+ Con expediente'},
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
  const apply=()=>{
    const hint=document.getElementById('fnHint');
    const ah=document.querySelector('.input-attach-hint');
    const attachBtn=document.querySelector('.input-attach');
    if(hint)hint.textContent='Suba audio/video para transcribir.';
    if(ah)ah.textContent='Audio/Video';
    if(attachBtn)attachBtn.title='Adjuntar audio o video';
    const fi=document.getElementById('fnDocInput');
    if(fi){
      fi.setAttribute('accept',T_ACCEPT);fi.accept=T_ACCEPT;
      fi.onchange=function(e){
        const f=e.target.files?.[0];if(!f)return;
        const e2=_ext(f.name);
        if(['pdf','docx','doc','txt'].includes(e2)){
          const r=new FileReader();
          r.onload=ev=>{transcripcion.baseDocText=ev.target.result||'';transcripcion.baseDocName=f.name;renderF11Panel();showToast('✓ Doc: '+f.name);};
          r.readAsText(f);fi.value='';return;
        }
        if(!_isAV(f)){showToast('⚠ Formato no reconocido: .'+_ext(f.name));fi.value='';return;}
        if(f.size>T_MAX_INPUT){showToast('⚠ Archivo muy grande ('+_sz(f.size)+')');fi.value='';return;}
        transcripcion.audioFile=f;
        transcripcion.audioUrl=URL.createObjectURL(f);
        transcripcion.step='upload';
        renderF11Panel();showToast('✓ '+f.name+' ('+_sz(f.size)+')');fi.value='';
      };
    }
  };
  apply();setTimeout(apply,100);setTimeout(apply,300);
}

/* ── Case ── */
function toggleF11CaseDropdown(){const dd=document.getElementById('f11CaseDropdown');if(dd)dd.style.display=dd.style.display==='none'?'block':'none';}
function linkF11Case(id){const c=(typeof allCases!=='undefined'?allCases:[]).find(x=>x.id===id);if(c){transcripcion.linkedCase=c;showToast('✓ Vinculado: '+c.name);}renderF11Panel();}
function unlinkF11Case(){transcripcion.linkedCase=null;renderF11Panel();}

/* ── File uploads ── */
function handleTransAudioUpload(input){
  const f=input.files?.[0];if(!f)return;
  if(!_isAV(f)){showToast('⚠ Formato no reconocido. Use MP3, WAV, M4A, OGG, MP4, etc.');input.value='';return;}
  if(f.size>T_MAX_INPUT){showToast('⚠ Archivo muy grande ('+_sz(f.size)+')');input.value='';return;}
  transcripcion.audioFile=f;
  transcripcion.audioUrl=URL.createObjectURL(f);
  renderF11Panel();showToast('✓ '+f.name+' ('+_sz(f.size)+')');input.value='';
}
function handleTransDocUpload(input){
  const f=input.files?.[0];if(!f)return;
  const r=new FileReader();
  r.onload=e=>{transcripcion.baseDocText=e.target.result||'';transcripcion.baseDocName=f.name;renderF11Panel();showToast('✓ '+f.name);};
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
      transcripcion.audioFile=new File([blob],'grabacion.'+e,{type:mt});
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
   TRANSCRIBIR — con reintentos automáticos (2x)
   ════════════════════════════════════════════════════════ */
async function transcribeAudio(){
  if(!transcripcion.audioFile){showToast('⚠ Carga un archivo de audio primero');return;}
  const inputBox=document.getElementById('inputBox');
  if(inputBox)inputBox.value='';

  transcripcion.isProcessing=true;
  transcripcion.transcribeProvider=null;
  transcripcion.step='transcribing';
  transcripcion.progress={current:0,total:0,pct:0,stepLabel:'',startTime:0,retryCount:0};
  startProgressTimer();
  renderF11Panel();

  let lastError=null;

  for(let attempt=0;attempt<=T_MAX_RETRIES;attempt++){
    try{
      transcripcion.progress.retryCount=attempt;

      // ── Step 1: Prepare audio ──
      setProgress(5,'Preparando audio…');
      const arrayBuffer=await transcripcion.audioFile.arrayBuffer();

      setProgress(15,'Codificando audio…');
      /* Fast base64 encoding using chunks to avoid call stack overflow */
      const bytes=new Uint8Array(arrayBuffer);
      let base64Audio='';
      const CHUNK=32768;
      for(let i=0;i<bytes.length;i+=CHUNK){
        base64Audio+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+CHUNK,bytes.length)));
      }
      base64Audio=btoa(base64Audio);

      // ── Step 2: Send to transcription ──
      setProgress(25,'Enviando a transcripción ('+_sz(transcripcion.audioFile.size)+')…');

      const{data,error}=await sb.functions.invoke('transcribe-audio',{
        body:{audio:base64Audio,mimeType:transcripcion.audioFile.type}
      });

      if(error)throw new Error(error.message||'Error en transcripción');

      // ── Step 3: Process response ──
      setProgress(70,'Procesando respuesta…');

      if(data?.text){
        transcripcion.rawText=data.text;
        transcripcion.segments=data.segments||[];
        transcripcion.transcribeProvider=data.provider||'elevenlabs';

        setProgress(85,'Transcripción obtenida');

        setProgress(100,'✅ Transcripción completa');

        stopProgressTimer();
        transcripcion.step='structure';
        transcripcion.isProcessing=false;
        renderF11Panel();

        const sc=data.segments?new Set(data.segments.map(s=>s.speaker)).size:0;
        showToast('✓ Transcripción completa'+(sc>1?' · '+sc+' hablantes':'')+' — estructurando…');

        /* Auto-structure immediately for speed */
        setTimeout(()=>structureTranscripcion(),300);
        return; // ← Éxito, salir del loop
      } else if(data?.error){
        throw new Error(data.error);
      } else {
        throw new Error('Sin respuesta de transcripción');
      }

    }catch(err){
      lastError=err;
      console.error('Transcripción intento '+(attempt+1)+':'+ err.message);

      if(attempt<T_MAX_RETRIES){
        const waitSecs=(attempt+1)*3; // 3s, 6s
        setProgress(20,'⚠ Error — reintentando en '+waitSecs+'s… ('+(attempt+1)+'/'+T_MAX_RETRIES+')');
        transcripcion.progress.retryCount=attempt+1;
        updateProgressUI();
        showToast('⚠ Error: '+err.message+'. Reintentando…','warning');
        await _sleep(waitSecs*1000);
      }
    }
  }

  // Todos los reintentos fallaron
  stopProgressTimer();
  transcripcion.isProcessing=false;
  transcripcion.step='upload';
  renderF11Panel();
  showToast('⚠ Falló tras '+(T_MAX_RETRIES+1)+' intentos: '+lastError?.message,'error');
}

/* ── Prompts de estructuración ── */
const T_PROMPT_BASE = `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG).

CONTEXTO: La transcripción corresponde a una declaración rendida en el marco de un procedimiento disciplinario instruido por la Universidad de Magallanes. Actúo como Fiscal Investigadora.

REGLAS DE EDICIÓN:
- Conservar la redacción en primera persona y el estilo expresivo del declarante
- Solo correcciones gramaticales menores: concordancia, puntuación, eliminación de muletillas ("eh", "mmm", "o sea") y repeticiones innecesarias
- NO agregar información nueva ni interpretar intenciones
- Mantener palabras originales del declarante salvo errores gramaticales
- Unir frases fragmentadas para fluidez sin cambiar sentido
- Conservar comillas, fechas, cifras y nombres propios exactamente como están
- Tono formal, claro y preciso, coherente con documento legal
- Respetar terminología jurídica y secuencia cronológica

ENTREGA: Solo la versión final, sin comentarios ni marcas de edición.`;

const T_PROMPT_QA = T_PROMPT_BASE + `

FORMATO: Pregunta-Respuesta
- Estructura el texto como diálogo formal entre Fiscal y declarante
- Cada pregunta precedida de "PREGUNTA:" o "FISCAL:"
- Cada respuesta precedida de "RESPUESTA:" o "DECLARANTE:"
- Párrafos separados, numerados si es posible`;

const T_PROMPT_DIRECTA = T_PROMPT_BASE + `

FORMATO: ACTA FORMAL UMAG — Declaración en procedimiento disciplinario.

Genera el documento completo con esta estructura EXACTA:

═══ ENCABEZADO ═══
UNIVERSIDAD DE MAGALLANES
DIRECCIÓN DE PERSONAL / [UNIDAD QUE CORRESPONDA]

**ACTA DE DECLARACIÓN DE [TESTIGO/DENUNCIANTE/PERSONA DENUNCIADA]**

En [LUGAR], a [FECHA EN PALABRAS], siendo las [HORA] horas, ante la Fiscal Investigadora [NOMBRE FISCAL], en el marco del procedimiento [TIPO] Rol N° [ROL], por presuntas infracciones a [MATERIA], comparece:

**[NOMBRE COMPLETO DEL DECLARANTE]**, quien previamente advertido/a de:
- Su obligación de decir verdad conforme al artículo 17 de la Ley N° 19.880
- Las penas del falso testimonio según los artículos 206 y siguientes del Código Penal
- Su derecho a no declarar contra sí mismo/a (si es persona denunciada)
- Las causales de inhabilidad

Declara no tener inhabilidad para declarar en este procedimiento y expone lo siguiente:

═══ CUERPO ═══
Declaración en formato pregunta-respuesta, con correcciones gramaticales aplicadas.

═══ CIERRE ═══
No habiendo más que agregar, y leída que le fue su declaración, se ratifica en ella y firma para constancia.

[Espacio firma]
_________________________________
[NOMBRE DECLARANTE]
[CALIDAD: Testigo / Denunciante / Persona denunciada]

[Espacio firma]
_________________________________
[NOMBRE FISCAL]
Fiscal Investigadora

Si falta algún dato, usar [COMPLETAR].`;

const T_PROMPT_EXPEDIENTE = T_PROMPT_DIRECTA + `

INSTRUCCIÓN ADICIONAL — MODO CON EXPEDIENTE:
Los datos del expediente se proporcionan abajo. Úsalos para completar TODOS los campos del encabezado (ROL, nombre fiscal, tipo procedimiento, materia, participantes).
NO dejes campos como [COMPLETAR] si el dato está disponible en el contexto del expediente.`;

const T_PROMPT_FILL_ACTA = T_PROMPT_BASE + `

INSTRUCCIÓN ESPECIAL — MODO LLENAR ACTA EXISTENTE:
Se adjunta un DOCUMENTO BASE que es la plantilla/acta original con las preguntas del cuestionario.
Tu tarea es LLENAR esa plantilla con las respuestas extraídas del audio transcrito.

REGLAS:
1. PRESERVA la estructura exacta del documento base (encabezado, numeración, preguntas)
2. Después de cada pregunta del documento base, inserta la respuesta correspondiente del audio
3. Si una pregunta del documento base NO tiene respuesta en el audio, escribe: "[Sin respuesta en el audio]"
4. Si el audio contiene información adicional no cubierta por las preguntas, agrégala al final como "DECLARACIÓN COMPLEMENTARIA"
5. Mantén el formato formal del documento base
6. Completa los campos del encabezado con los datos del expediente si están disponibles
7. Agrega el cierre formal: "Leída que le fue su declaración, se ratifica y firma" con espacios para firmas`;

/* ════════════════════════════════════════════════════════
   CARGAR DATOS COMPLETOS DEL EXPEDIENTE PARA ACTA
   ════════════════════════════════════════════════════════ */
async function loadFullCaseContext(caseObj){
  if(!caseObj||!caseObj.id)return'';
  const mt=transcripcion.meta;
  const tipoLabel={testigo:'testigo',denunciante:'denunciante',denunciado:'persona denunciada',otro:'compareciente'}[mt.tipoDeclarante]||'declarante';
  return `\n\nDATOS DEL EXPEDIENTE:
- Expediente: ${caseObj.name||'[EXPEDIENTE]'}
- ROL: ${caseObj.rol||'[ROL]'}
- Tipo: ${caseObj.tipo_procedimiento||'[TIPO]'}
- Materia: ${caseObj.materia||'[MATERIA]'}
- Protocolo: ${caseObj.protocolo||'[PROTOCOLO]'}
- Resolución: ${caseObj.nueva_resolucion||'[RESOLUCIÓN]'}
- Denunciante(s): ${_fmtArr(caseObj.denunciantes)||'[DENUNCIANTE]'}
- Denunciado/a(s): ${_fmtArr(caseObj.denunciados)||'[DENUNCIADO/A]'}
- Declarante: ${mt.nombreDeclarante||'[COMPLETAR]'} (${tipoLabel})
- Lugar diligencia: ${mt.lugar||'[COMPLETAR]'}`;
}

/* ════════════════════════════════════════════════════════
   ESTRUCTURAR — versión rápida con endpoint dedicado
   Usa Claude Haiku (3-5x más rápido que Sonnet) vía /structure
   ════════════════════════════════════════════════════════ */
async function structureTranscripcion(){
  if(!transcripcion.rawText)return;
  transcripcion.step='structuring';
  transcripcion.isProcessing=true;
  transcripcion.progress={current:0,total:0,pct:0,stepLabel:'',startTime:0,retryCount:0};
  startProgressTimer();
  renderF11Panel();

  let lastError=null;

  for(let attempt=0;attempt<=T_MAX_RETRIES;attempt++){
    try{
      transcripcion.progress.retryCount=attempt;
      const lnk=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
      const mt=transcripcion.meta;
      /* Sync metadata fields from DOM if present */
      const _f11tipo=document.getElementById('f11TipoDeclarante');
      const _f11nombre=document.getElementById('f11NombreDeclarante');
      const _f11fecha=document.getElementById('f11Fecha');
      const _f11lugar=document.getElementById('f11Lugar');
      if(_f11tipo)mt.tipoDeclarante=_f11tipo.value;
      if(_f11nombre)mt.nombreDeclarante=_f11nombre.value;
      if(_f11fecha)mt.fecha=_f11fecha.value;
      if(_f11lugar)mt.lugar=_f11lugar.value;

      const fechaStr=mt.fecha?new Date(mt.fecha+'T12:00:00').toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      const tipoLabel={testigo:'testigo',denunciante:'denunciante',denunciado:'persona denunciada',otro:'compareciente'}[mt.tipoDeclarante]||'declarante';
      const tipoActaLabel={testigo:'DECLARACIÓN DE TESTIGO',denunciante:'RATIFICACIÓN DE DENUNCIA',denunciado:'DECLARACIÓN DE PERSONA DENUNCIADA',otro:'DILIGENCIA'}[mt.tipoDeclarante]||'DECLARACIÓN';

      setProgress(15,'Preparando contexto…');

      /* Build case + metadata context */
      let caseCtx=`\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${mt.nombreDeclarante||'[COMPLETAR NOMBRE]'}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${mt.lugar||'[COMPLETAR]'}`;
      if(lnk){
        caseCtx+=`\n\nDATOS DEL EXPEDIENTE:\n- Expediente: ${lnk.name||'[EXPEDIENTE]'}\n- ROL: ${lnk.rol||'[ROL]'}\n- Tipo: ${lnk.tipo_procedimiento||'[TIPO]'}\n- Materia: ${lnk.materia||'[MATERIA]'}\n- Denunciante(s): ${_fmtArr(lnk.denunciantes)||'[DENUNCIANTE]'}\n- Denunciado/a(s): ${_fmtArr(lnk.denunciados)||'[DENUNCIADO/A]'}`;
      }

      const raw=transcripcion.rawText;
      const hasBaseDoc=!!transcripcion.baseDocText?.trim();
      const mode=hasBaseDoc?'fill_acta':(transcripcion.selectedMode||'directa');

      /* SHORT TEXT (≤4000 chars): single fast call */
      if(raw.length<=4000){
        setProgress(40,'Estructurando con IA rápida…');
        const resp=await fetch('/.netlify/functions/structure',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-auth-token':session?.access_token||''},
          body:JSON.stringify({
            rawText:raw,
            mode:mode,
            caseContext:caseCtx,
            baseDocText:transcripcion.baseDocText||''
          })
        });
        if(!resp.ok){
          const errData=await resp.json().catch(()=>({}));
          throw new Error(errData.error||'HTTP '+resp.status);
        }
        const data=await resp.json();
        if(!data.ok)throw new Error(data.error||'Sin respuesta');
        transcripcion.structuredText=data.structuredText;
        setProgress(90,'Procesando resultado…');

      } else {
        /* LONG TEXT: split in halves, structure each, concatenate */
        const mid=Math.floor(raw.length/2);
        /* Find a good split point (paragraph break near middle) */
        let splitAt=raw.indexOf('\n',mid);
        if(splitAt<0||splitAt>mid+500)splitAt=mid;

        const part1=raw.substring(0,splitAt);
        const part2=raw.substring(splitAt);

        setProgress(30,'Estructurando parte 1/2…');
        const r1=await fetch('/.netlify/functions/structure',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-auth-token':session?.access_token||''},
          body:JSON.stringify({rawText:part1,mode:mode,caseContext:caseCtx,baseDocText:transcripcion.baseDocText||''})
        });
        if(!r1.ok)throw new Error('Parte 1: HTTP '+r1.status);
        const d1=await r1.json();

        setProgress(65,'Estructurando parte 2/2…');
        const r2=await fetch('/.netlify/functions/structure',{
          method:'POST',
          headers:{'Content-Type':'application/json','x-auth-token':session?.access_token||''},
          body:JSON.stringify({rawText:part2,mode:'directa',caseContext:'(continuación de la declaración)'})
        });
        if(!r2.ok)throw new Error('Parte 2: HTTP '+r2.status);
        const d2=await r2.json();

        transcripcion.structuredText=(d1.structuredText||'')+'\n\n'+(d2.structuredText||'');
        setProgress(90,'Combinando partes…');
      }

      if(!transcripcion.structuredText)throw new Error('La IA no generó texto estructurado');

      setProgress(100,'✅ Acta lista');
      await _sleep(200);
      stopProgressTimer();
      transcripcion.step='result';
      transcripcion.isProcessing=false;
      renderF11Panel();
      showToast('✓ Acta estructurada');
      return;

    }catch(err){
      lastError=err;
      console.error('Estructuración intento '+(attempt+1)+':',err.message);
      if(attempt<T_MAX_RETRIES){
        const waitSecs=(attempt+1)*2;
        setProgress(20,'⚠ Error — reintentando en '+waitSecs+'s…');
        transcripcion.progress.retryCount=attempt+1;
        updateProgressUI();
        showToast('⚠ '+err.message+'. Reintentando…','warning');
        await _sleep(waitSecs*1000);
      }
    }
  }

  stopProgressTimer();
  transcripcion.isProcessing=false;
  transcripcion.step='structure';
  renderF11Panel();
  showToast('⚠ Falló tras '+(T_MAX_RETRIES+1)+' intentos: '+lastError?.message,'error');
}

/* ── Resumen ── */
async function generateTransSummary(){
  if(!transcripcion.rawText)return;
  transcripcion.isGeneratingSummary=true;renderF11Panel();
  try {
    const ep=typeof CHAT_ENDPOINT!=='undefined'?CHAT_ENDPOINT:'/.netlify/functions/chat';
    const body={model:'claude-sonnet-4-20250514',max_tokens:600,
      system:'Eres Fiscalito. Genera un resumen ejecutivo en 3-5 puntos clave de la declaración.',
      messages:[{role:'user',content:'Resumen de la declaración:\n\n'+transcripcion.rawText.substring(0,2500)}]};
    const resp=await authFetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await resp.json();
    transcripcion.summary=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    transcripcion.isGeneratingSummary=false;renderF11Panel();
  } catch(err){transcripcion.isGeneratingSummary=false;renderF11Panel();showToast('⚠ '+err.message);}
}

/* ── Acciones ── */
async function saveTranscripcionToCase(){
  const caseRef=transcripcion.linkedCase||(typeof currentCase!=='undefined'?currentCase:null);
  if(!caseRef||!caseRef.id){showToast('⚠ Vincula un expediente primero');return;}
  if(!session?.user?.id){showToast('⚠ Inicia sesión');return;}
  const text=transcripcion.structuredText||transcripcion.rawText;
  if(!text?.trim()){showToast('⚠ Sin texto');return;}

  try{
    const audioName=transcripcion.audioFile?.name||'audio';
    const mt=transcripcion.meta;
    const tipoLabel={testigo:'Declaración testigo',denunciante:'Ratificación denuncia',denunciado:'Declaración denunciado/a',otro:'Diligencia'}[mt.tipoDeclarante]||'Transcripción';
    const fecha=mt.fecha?new Date(mt.fecha+'T12:00:00').toLocaleDateString('es-CL',{year:'numeric',month:'long',day:'numeric'}):new Date().toLocaleDateString('es-CL',{year:'numeric',month:'long',day:'numeric'});
    const title=tipoLabel+(mt.nombreDeclarante?' — '+mt.nombreDeclarante:'')+' ('+fecha+')';

    const{error:noteErr}=await sb.from('case_notes').insert({
      case_id:caseRef.id,user_id:session.user.id,
      title,content:text,source:'transcripcion_f11'
    });
    if(noteErr)throw new Error('Nota: '+noteErr.message);

    try{await sb.from('diligencias').insert({
      id:crypto.randomUUID(),
      case_id:caseRef.id,user_id:session.user.id,
      diligencia_label:title,
      diligencia_type:mt.tipoDeclarante==='testigo'?'declaracion_testigo':mt.tipoDeclarante==='denunciante'?'ratificacion':mt.tipoDeclarante==='denunciado'?'declaracion_denunciado':'otro',
      fecha_diligencia:mt.fecha||new Date().toISOString().split('T')[0],
      file_name:audioName,ai_summary:transcripcion.summary||null,
      extracted_text:text.substring(0,5000)
    });}catch(e){console.warn('Diligencia:',e);}

    try{await sb.from('cronologia').insert({
      case_id:caseRef.id,user_id:session.user.id,
      event_date:new Date().toISOString().split('T')[0],
      event_type:'Transcripción',
      description:'Transcripción ('+audioName+') guardada'
    });}catch(e){console.warn('Cronología:',e);}

    showToast('✓ Guardado en "'+caseRef.name+'"');
    if(typeof loadNotas==='function')try{await loadNotas();}catch(e){}
  }catch(err){showToast('⚠ Error: '+err.message);}
}

function copyTranscripcion(){navigator.clipboard.writeText(transcripcion.structuredText||transcripcion.rawText);showToast('✓ Copiado');}
function downloadTransWord(){
  const b=new Blob([transcripcion.structuredText||transcripcion.rawText],{type:'text/plain;charset=utf-8'});
  const mt=transcripcion.meta;
  const declName=(mt.nombreDeclarante||'').replace(/\s+/g,'_')||'declarante';
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Acta_'+declName+'_'+(mt.fecha||new Date().toISOString().split('T')[0])+'.txt';a.click();URL.revokeObjectURL(a.href);
}
function resetTranscripcion(){
  stopProgressTimer();
  if(transcripcion.audioUrl)URL.revokeObjectURL(transcripcion.audioUrl);
  Object.assign(transcripcion,{isRecording:false,audioChunks:[],audioFile:null,audioUrl:null,baseDocText:'',baseDocName:'',rawText:'',structuredText:'',summary:'',segments:[],step:'upload',isProcessing:false,isGeneratingSummary:false,selectedMode:null,transcribeProvider:null,progress:{current:0,total:0,pct:0,stepLabel:'',startTime:0,retryCount:0},meta:{tipoDeclarante:'testigo',nombreDeclarante:'',fecha:'',lugar:'Punta Arenas'}});
  renderF11Panel();buildF11Chips();
}

/* ── CSS ── */
(function(){
  if(document.getElementById('f11-css'))return;
  const s=document.createElement('style');s.id='f11-css';
  s.textContent=`
.f11-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:11px 14px;}
.f11-case-section{cursor:pointer;transition:border-color .14s}.f11-case-section:hover{border-color:var(--border2)}
.f11-row{display:flex;align-items:center;gap:6px}
.f11-section-title{font-size:12px;font-weight:500;color:var(--text-dim)}
.f11-upload-btn{display:inline-flex;align-items:center;gap:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-dim);padding:6px 14px;border-radius:var(--radius);cursor:pointer;font-size:12px;font-family:var(--font-body);transition:all .14s}
.f11-upload-btn:hover{border-color:var(--gold-dim);color:var(--gold)}
.f11-upload-audio-btn{display:inline-flex;align-items:center;gap:8px;background:var(--gold-glow);border:2px solid var(--gold-dim);color:var(--gold);padding:9px 16px;border-radius:var(--radius);cursor:pointer;font-size:12.5px;font-weight:600;font-family:var(--font-body);transition:all .14s}
.f11-upload-audio-btn:hover{background:var(--gold-glow2);border-color:var(--gold)}
.f11-empty-docs{font-size:11.5px;color:var(--text-muted);margin-top:7px}
.f11-file-chip{display:inline-flex;align-items:center;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:3px 10px;border-radius:12px;font-size:11px;margin-top:6px}
.f11-chip-del{background:none;border:none;cursor:pointer;color:var(--text-muted);margin-left:4px;padding:0;font-size:11px}
.f11-case-option{padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--border)}.f11-case-option:hover{background:var(--surface2)}
.f11-fn-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px}
.f11-fn-card-header{display:flex;align-items:center;gap:9px;margin-bottom:8px}
.f11-fn-badge{background:var(--gold);color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:3px;font-family:var(--font-mono)}
.f11-fn-title{font-size:12.5px;font-weight:600;color:var(--text)}
.f11-fn-desc{font-size:12px;color:var(--text-dim);line-height:1.6}
.f11-format-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px}
.f11-format-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--text-muted);margin-bottom:8px}
.f11-format-body{font-size:12px;color:var(--text-dim);line-height:1.6}
.f11-note{display:flex;align-items:flex-start;gap:7px;font-size:11px;color:var(--text-muted);padding:8px 12px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:var(--radius);line-height:1.5}
.f11-transcribe-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:14px 20px;background:var(--gold);color:#fff;border:none;border-radius:var(--radius);cursor:pointer;font-size:14px;font-weight:600;font-family:var(--font-body);transition:all .15s;box-shadow:0 2px 8px rgba(79,70,229,.3)}
.f11-transcribe-btn:hover{background:var(--gold-dim);box-shadow:0 4px 12px rgba(79,70,229,.4)}
.f11-result-actions{display:flex;gap:6px;flex-wrap:wrap}
.f11-action-row{display:flex;gap:7px;flex-wrap:wrap}
.fn-chip-active{background:var(--gold-glow)!important;border-color:var(--gold-dim)!important;color:var(--gold)!important}
.trans-raw-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:11.5px;line-height:1.65;max-height:130px;overflow-y:auto;white-space:pre-wrap;color:var(--text-dim)}
.trans-summary-box{background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:12px 14px}
.trans-result-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;font-size:12.5px;line-height:1.75;max-height:calc(100vh - 300px);overflow-y:auto}
.trans-result-box h1,.trans-result-box h2,.trans-result-box h3{font-family:var(--font-serif);color:var(--gold)}

/* ═══ PROGRESS BAR STYLES ═══ */
.f11-progress-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;text-align:center}
.f11-progress-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.f11-progress-bar-wrap{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.f11-progress-bar-bg{flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.f11-progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--gold-dim),var(--gold),#818cf8);border-radius:4px;transition:width .4s ease;position:relative}
.f11-progress-bar-fill::after{content:'';position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);animation:f11shimmer 1.5s infinite}
@keyframes f11shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.f11-progress-pct{font-size:14px;font-weight:700;font-family:var(--font-mono);color:var(--gold);min-width:40px}
.f11-progress-label{font-size:12px;color:var(--text-dim);margin-bottom:4px}
.f11-progress-steps{display:flex;justify-content:center;gap:6px;margin-top:14px;flex-wrap:wrap}
.f11-pstep{font-size:10.5px;padding:4px 10px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text-muted);transition:all .2s}
.f11-pstep.active{background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold);font-weight:600;box-shadow:0 0 8px rgba(79,70,229,.15)}
.f11-pstep.done{background:rgba(5,150,105,.08);border-color:rgba(5,150,105,.25);color:var(--green)}
.f11-form-field{display:flex;flex-direction:column;gap:3px}
.f11-form-field label{font-size:10.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em}
.f11-input{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-size:12px;width:100%;box-sizing:border-box;font-family:var(--font-body)}
.f11-input:focus{border-color:var(--gold-dim);outline:none}
`;
  document.head.appendChild(s);
})();

console.log("%c🎙 Módulo Transcripción F11 v5 cargado — Fiscalito","color:#7c3aed;font-weight:bold");
console.log("%c   ✓ Barra progreso visual  ✓ Reintentos 2x  ✓ Fix modo expediente","color:#666");
