// ============================================================================
// MÓDULO HERRAMIENTAS PDF — FISCALITO (mod-pdf-tools.js)
// Comprimir, Dividir, Fusionar, OCR
// Dependencia: pdf-lib (carga automática desde CDN)
// ============================================================================
(function(){
"use strict";

let PDFLib=null, pdfToolTab="compress";

// ── Load pdf-lib from CDN ───────────────────────────────────────────────────
function loadPdfLib(){
  if(window.PDFLib){PDFLib=window.PDFLib;return Promise.resolve(PDFLib)}
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.onload=()=>{PDFLib=window.PDFLib;resolve(PDFLib)};
    s.onerror=()=>{
      const s2=document.createElement("script");
      s2.src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
      s2.onload=()=>{PDFLib=window.PDFLib;resolve(PDFLib)};
      s2.onerror=()=>reject(new Error("No se pudo cargar pdf-lib"));
      document.head.appendChild(s2);
    };
    document.head.appendChild(s);
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const h=t=>(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const pdfFmtSize=b=>{
  if(b<1024)return b+" B";
  if(b<1048576)return(b/1024).toFixed(1)+" KB";
  return(b/1048576).toFixed(2)+" MB";
};

// ── CSS ─────────────────────────────────────────────────────────────────────
(function(){
const s=document.createElement("style");
s.textContent=`
#viewPdfTools{display:none;flex-direction:column;overflow:hidden;height:100%}
#viewPdfTools.active{display:flex!important}
.pdft-header{padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface)}
.pdft-header h2{font-family:'EB Garamond',serif;font-size:22px;font-weight:400;margin:0}
.pdft-header p{font-size:11px;color:var(--text-muted);margin:2px 0 0}
.pdft-body{flex:1;overflow-y:auto;padding:16px 20px;max-width:800px;margin:0 auto;width:100%}
.pdft-tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);padding:0 20px;background:var(--surface)}
.pdft-tab{padding:8px 14px;font-size:12px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);transition:.15s}
.pdft-tab:hover{color:var(--text)}
.pdft-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.pdft-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
.pdft-drop{border:2px dashed var(--border);border-radius:10px;padding:40px 20px;text-align:center;cursor:pointer;transition:.2s}
.pdft-drop:hover{border-color:var(--accent);background:var(--hover)}
.pdft-drop.dragover{border-color:var(--accent);background:var(--hover)}
.pdft-file-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:12px}
.pdft-btn{padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px;cursor:pointer;transition:.15s}
.pdft-btn:hover{background:var(--hover)}
.pdft-btn:disabled{opacity:.5;cursor:not-allowed}
.pdft-btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.pdft-btn-primary:hover{opacity:.85}
.pdft-result{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px}
.pdft-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center}
.pdft-stats .stat{padding:8px;background:var(--surface);border-radius:6px}
.pdft-stats .stat .val{font-size:14px;font-weight:700}
.pdft-stats .stat .lbl{font-size:10px;color:var(--text-muted)}
.pdft-radio{display:flex;gap:16px;margin:10px 0}
.pdft-radio label{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}
.pdft-range-inputs{display:flex;gap:10px;margin:8px 0}
.pdft-range-inputs label{font-size:11px;font-weight:600}
.pdft-range-inputs input{width:80px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px}
.pdft-file-list{max-height:200px;overflow-y:auto;margin:8px 0}
.pdft-file-item{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;font-size:12px}
.pdft-textarea{width:100%;min-height:250px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-family:monospace;resize:vertical;background:var(--surface)}
`;
document.head.appendChild(s);
})();

// ── State per tool ──────────────────────────────────────────────────────────
const state={
  compress:{file:null,processing:false,result:null},
  split:{file:null,pageCount:0,mode:"range",rangeFrom:1,rangeTo:1,processing:false,results:[]},
  merge:{files:[],processing:false,result:null},
  ocr:{file:null,processing:false,text:""}
};

// ── View Injection ──────────────────────────────────────────────────────────
function pdfEnsureView(){
  if(document.getElementById("viewPdfTools"))return;
  const v=document.createElement("div");
  v.className="view";v.id="viewPdfTools";
  v.style.cssText="flex-direction:column;overflow:hidden;";
  v.innerHTML=`
    <div class="pdft-header"><h2>📄 Herramientas PDF</h2><p>Comprime, divide, fusiona y extrae texto de documentos PDF</p></div>
    <div class="pdft-tabs" id="pdfToolsTabs"></div>
    <div class="pdft-body" id="pdfToolsBody"></div>`;
  const w=document.getElementById("viewWelcome");
  if(w)w.parentNode.insertBefore(v,w);
  else document.querySelector(".main-content,.content-area,main")?.appendChild(v);
}

// ── Tabs ────────────────────────────────────────────────────────────────────
const PDF_TABS=[
  {id:"compress",label:"📦 Comprimir"},
  {id:"split",label:"✂️ Dividir"},
  {id:"merge",label:"🔗 Fusionar"},
  {id:"ocr",label:"🔍 OCR"}
];

function pdfRenderTabs(){
  const el=document.getElementById("pdfToolsTabs");if(!el)return;
  el.innerHTML=PDF_TABS.map(t=>`<div class="pdft-tab${pdfToolTab===t.id?" active":""}" data-tab="${t.id}">${t.label}</div>`).join("");
  el.querySelectorAll(".pdft-tab").forEach(tab=>{
    tab.onclick=()=>{pdfToolTab=tab.dataset.tab;pdfRenderTabs();pdfRenderBody()};
  });
}

function pdfRenderBody(){
  const el=document.getElementById("pdfToolsBody");if(!el)return;
  const r={compress:renderCompress,split:renderSplit,merge:renderMerge,ocr:renderOcr};
  el.innerHTML=`<div class="pdft-card">${(r[pdfToolTab]||r.compress)()}</div>`;
  bindEvents();
}

// ── Compress ────────────────────────────────────────────────────────────────
function renderCompress(){
  const s=state.compress;
  if(!s.file) return dropZone("compress","Arrastra un PDF aquí o haz clic para seleccionar","Solo archivos PDF · Máximo 300 MB · Compresión máxima");
  let html=fileBar(s.file.name,pdfFmtSize(s.file.size),"compress");
  if(!s.result&&!s.processing) html+=`<button class="pdft-btn pdft-btn-primary" style="width:100%" id="btnCompress">📦 Comprimir PDF</button>`;
  if(s.processing) html+=`<button class="pdft-btn" style="width:100%" disabled>⏳ Comprimiendo…</button>`;
  if(s.result){
    const red=Math.max(0,((s.result.originalSize-s.result.newSize)/s.result.originalSize)*100);
    html+=`<div class="pdft-result"><div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><span style="color:#16a34a;font-weight:600">✓ Compresión completada</span></div>
      <div class="pdft-stats">
        <div class="stat"><div class="val">${pdfFmtSize(s.result.originalSize)}</div><div class="lbl">Original</div></div>
        <div class="stat"><div class="val">${pdfFmtSize(s.result.newSize)}</div><div class="lbl">Comprimido</div></div>
        <div class="stat"><div class="val">${red.toFixed(1)}%</div><div class="lbl">Reducción</div></div>
      </div>
      <button class="pdft-btn pdft-btn-primary" style="width:100%;margin-top:10px" id="btnDownloadCompress">⬇ Descargar PDF comprimido</button>
    </div>`;
  }
  return html;
}

async function doCompress(){
  const s=state.compress;
  if(s.processing){showToast('⚠ Operación en curso');return}
  if(!s.file)return;
  if(s.file.size>314572800){showToast("El archivo supera los 300 MB","error");return}
  s.processing=true;s.result=null;pdfRenderBody();
  try{
    await loadPdfLib();
    const ab=await s.file.arrayBuffer();
    const doc=await PDFLib.PDFDocument.load(ab,{ignoreEncryption:true,updateMetadata:false});

    // ── COMPRESIÓN MÁXIMA ──

    // 1. Strip ALL metadata
    doc.setTitle("");doc.setAuthor("");doc.setSubject("");doc.setKeywords([]);
    doc.setProducer("");doc.setCreator("");doc.setCreationDate(new Date(0));doc.setModificationDate(new Date(0));

    // 2. Remove XMP metadata stream if present
    try{
      const catalog=doc.catalog;
      if(catalog.get(PDFLib.PDFName.of("Metadata")))catalog.delete(PDFLib.PDFName.of("Metadata"));
    }catch(e){}

    // 3. Remove document-level JavaScript
    try{
      const catalog=doc.catalog;
      if(catalog.get(PDFLib.PDFName.of("Names"))){
        const names=catalog.lookup(PDFLib.PDFName.of("Names"));
        if(names&&names.delete){
          names.delete(PDFLib.PDFName.of("JavaScript"));
          names.delete(PDFLib.PDFName.of("EmbeddedFiles"));
        }
      }
      catalog.delete(PDFLib.PDFName.of("OpenAction"));
      catalog.delete(PDFLib.PDFName.of("AA"));
    }catch(e){}

    // 4. Remove OutputIntents, PieceInfo, etc.
    try{
      const catalog=doc.catalog;
      ["OutputIntents","PieceInfo","MarkInfo","StructTreeRoot","SpiderInfo","Threads","AcroForm"].forEach(k=>{
        try{catalog.delete(PDFLib.PDFName.of(k))}catch(e){}
      });
    }catch(e){}

    // 5. Strip per-page annotations, thumbnails, and metadata
    const pages=doc.getPages();
    for(const page of pages){
      try{
        const dict=page.node;
        // Remove annotations (comments, links, form fields on page)
        dict.delete(PDFLib.PDFName.of("Annots"));
        // Remove thumbnail images
        dict.delete(PDFLib.PDFName.of("Thumb"));
        // Remove page-level metadata
        dict.delete(PDFLib.PDFName.of("Metadata"));
        // Remove page-level PieceInfo
        dict.delete(PDFLib.PDFName.of("PieceInfo"));
        // Remove page transitions and presentations
        dict.delete(PDFLib.PDFName.of("Trans"));
        dict.delete(PDFLib.PDFName.of("Dur"));
        // Remove additional actions
        dict.delete(PDFLib.PDFName.of("AA"));
      }catch(e){}
    }

    // 6. Remove Info dictionary (legacy metadata)
    try{
      const trailer=doc.context.trailerInfo;
      if(trailer.Info)delete trailer.Info;
    }catch(e){}

    // 7. Save with maximum compression flags
    const bytes=await doc.save({
      useObjectStreams:true,    // Compress object streams (biggest savings)
      addDefaultPage:false,
      objectsPerTick:100        // Process faster
    });

    s.result={blob:new Blob([bytes],{type:"application/pdf"}),originalSize:s.file.size,newSize:bytes.byteLength};
    const red=Math.max(0,((s.result.originalSize-s.result.newSize)/s.result.originalSize)*100);
    showToast(`PDF comprimido: ${pdfFmtSize(s.result.originalSize)} → ${pdfFmtSize(s.result.newSize)} (−${red.toFixed(1)}%)`,"success");
  }catch(e){console.error(e);showToast("Error al comprimir: "+e.message,"error")}
  s.processing=false;pdfRenderBody();
}

// ── Split ───────────────────────────────────────────────────────────────────
function renderSplit(){
  const s=state.split;
  if(!s.file) return dropZone("split","Arrastra un PDF aquí o haz clic para seleccionar","Máximo 300 MB · Se mostrarán opciones de división");
  let html=fileBar(s.file.name,s.pageCount+" páginas","split");
  html+=`<div class="pdft-radio">
    <label><input type="radio" name="splitMode" value="range" ${s.mode==="range"?"checked":""}> Extraer rango</label>
    <label><input type="radio" name="splitMode" value="each" ${s.mode==="each"?"checked":""}> Cada página individual</label>
  </div>`;
  if(s.mode==="range"){
    html+=`<div class="pdft-range-inputs">
      <div><label>Desde</label><br><input type="number" min="1" max="${s.pageCount}" value="${s.rangeFrom}" id="splitFrom"></div>
      <div><label>Hasta</label><br><input type="number" min="1" max="${s.pageCount}" value="${s.rangeTo}" id="splitTo"></div>
    </div>`;
  }
  if(!s.processing) html+=`<button class="pdft-btn pdft-btn-primary" style="width:100%" id="btnSplit">✂️ Dividir PDF</button>`;
  else html+=`<button class="pdft-btn" style="width:100%" disabled>⏳ Dividiendo…</button>`;
  if(s.results.length){
    html+=`<div style="margin-top:12px"><p style="font-size:13px;font-weight:600;margin-bottom:6px">${s.results.length} archivo(s) generado(s)</p><div class="pdft-file-list">`;
    s.results.forEach((r,i)=>{
      html+=`<div class="pdft-file-item"><span>${h(r.name)}</span><button class="pdft-btn" onclick="window._pdfTools.downloadBlob(${i},'split')">⬇</button></div>`;
    });
    html+=`</div></div>`;
  }
  return html;
}

async function doSplit(){
  const s=state.split;
  if(s.processing){showToast('⚠ Operación en curso');return}
  if(!s.file)return;
  s.processing=true;s.results=[];pdfRenderBody();
  try{
    await loadPdfLib();
    const ab=await s.file.arrayBuffer();
    const src=await PDFLib.PDFDocument.load(ab,{ignoreEncryption:true});
    const base=s.file.name.replace(/\.pdf$/i,"");
    if(s.mode==="range"){
      const from=Math.max(1,s.rangeFrom),to=Math.min(s.pageCount,s.rangeTo);
      if(from>to){showToast("Rango inválido","error");s.processing=false;pdfRenderBody();return}
      const nd=await PDFLib.PDFDocument.create();
      const pages=await nd.copyPages(src,Array.from({length:to-from+1},(_,i)=>from-1+i));
      pages.forEach(p=>nd.addPage(p));
      const u8=await nd.save({useObjectStreams:true});
      s.results=[{blob:new Blob([u8],{type:"application/pdf"}),name:`${base}_pag${from}-${to}.pdf`}];
    }else{
      for(let i=0;i<s.pageCount;i++){
        const nd=await PDFLib.PDFDocument.create();
        const[p]=await nd.copyPages(src,[i]);nd.addPage(p);
        const u8=await nd.save({useObjectStreams:true});
        s.results.push({blob:new Blob([u8],{type:"application/pdf"}),name:`${base}_pag${i+1}.pdf`});
      }
    }
    showToast("PDF dividido","success");
  }catch(e){console.error(e);showToast("Error al dividir","error")}
  s.processing=false;pdfRenderBody();
}

// ── Merge ───────────────────────────────────────────────────────────────────
function renderMerge(){
  const s=state.merge;
  let html=`<div class="pdft-drop" id="dropMerge" ondragover="event.preventDefault()" ondrop="event.preventDefault();window._pdfTools.addMergeFiles(event.dataTransfer.files)">
    📄 Arrastra PDFs aquí o <span style="text-decoration:underline;cursor:pointer" onclick="document.getElementById('mergeInput').click()">selecciona archivos</span>
    <input id="mergeInput" type="file" accept=".pdf" multiple style="display:none" onchange="window._pdfTools.addMergeFiles(this.files);this.value=''">
  </div>`;
  if(s.files.length){
    const totalPgs=s.files.reduce((a,f)=>a+f.pageCount,0);
    html+=`<p style="font-size:13px;font-weight:600;margin:10px 0 6px">${s.files.length} archivos · ${totalPgs} páginas</p><div class="pdft-file-list">`;
    s.files.forEach((f,i)=>{
      html+=`<div class="pdft-file-item"><span>${h(f.file.name)}</span><span style="color:var(--text-muted)">${f.pageCount} pág.</span><button class="pdft-btn" onclick="window._pdfTools.removeMergeFile(${i})">✕</button></div>`;
    });
    html+=`</div>`;
    if(!s.processing) html+=`<button class="pdft-btn pdft-btn-primary" style="width:100%" id="btnMerge" ${s.files.length<2?"disabled":""}>${s.files.length<2?"Necesitas al menos 2 archivos":"🔗 Fusionar "+s.files.length+" archivos"}</button>`;
    else html+=`<button class="pdft-btn" style="width:100%" disabled>⏳ Fusionando…</button>`;
  }
  if(s.result) html+=`<button class="pdft-btn pdft-btn-primary" style="width:100%;margin-top:10px" id="btnDownloadMerge">⬇ Descargar PDF fusionado</button>`;
  return html;
}

async function addMergeFiles(fileList){
  await loadPdfLib();
  for(const f of Array.from(fileList)){
    if(f.type!=="application/pdf"){showToast(f.name+" no es PDF","warning");continue}
    if(f.size>314572800){showToast(f.name+" supera 300 MB","error");continue}
    try{
      const ab=await f.arrayBuffer();
      const doc=await PDFLib.PDFDocument.load(ab,{ignoreEncryption:true});
      state.merge.files.push({file:f,pageCount:doc.getPageCount()});
    }catch(e){showToast("No se pudo leer: "+f.name,"error")}
  }
  state.merge.result=null;pdfRenderBody();
}

async function doMerge(){
  const s=state.merge;
  if(s.processing){showToast('⚠ Operación en curso');return}
  if(s.files.length<2)return;
  s.processing=true;s.result=null;pdfRenderBody();
  try{
    await loadPdfLib();
    const merged=await PDFLib.PDFDocument.create();
    for(const pf of s.files){
      const ab=await pf.file.arrayBuffer();
      const src=await PDFLib.PDFDocument.load(ab,{ignoreEncryption:true});
      const pages=await merged.copyPages(src,src.getPageIndices());
      pages.forEach(p=>merged.addPage(p));
    }
    const u8=await merged.save({useObjectStreams:true,addDefaultPage:false,objectsPerTick:100});
    s.result=new Blob([u8],{type:"application/pdf"});
    showToast("PDFs fusionados","success");
  }catch(e){console.error(e);showToast("Error al fusionar","error")}
  s.processing=false;pdfRenderBody();
}

// ── OCR ─────────────────────────────────────────────────────────────────────
function renderOcr(){
  const s=state.ocr;
  if(!s.file) return dropZone("ocr","Arrastra un PDF escaneado aquí","Máximo 300 MB · El texto será extraído en el servidor mediante IA");
  let html=fileBar(s.file.name,pdfFmtSize(s.file.size),"ocr");
  if(!s.text&&!s.processing) html+=`<button class="pdft-btn pdft-btn-primary" style="width:100%" id="btnOcr">🔍 Extraer texto con OCR</button>`;
  if(s.processing) html+=`<button class="pdft-btn" style="width:100%" disabled>⏳ Extrayendo texto (puede tardar)…</button>`;
  if(s.text){
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 6px">
      <span style="font-size:13px;font-weight:600">Texto extraído (${s.text.length.toLocaleString()} caracteres)</span>
      <div style="display:flex;gap:4px">
        <button class="pdft-btn" id="btnCopyOcr">📋 Copiar</button>
        <button class="pdft-btn" id="btnDownloadOcr">⬇ .txt</button>
      </div>
    </div>
    <textarea class="pdft-textarea" readonly>${h(s.text)}</textarea>`;
  }
  return html;
}

async function doOcr(){
  const s=state.ocr;
  if(s.processing){showToast('⚠ Operación en curso');return}
  if(!s.file)return;
  s.processing=true;s.text="";pdfRenderBody();
  try{
    /* Leer archivo como base64 */
    const ab=await s.file.arrayBuffer();
    const bytes=new Uint8Array(ab);
    let binary="";
    const chunkSize=8192;
    for(let i=0;i<bytes.length;i+=chunkSize){
      binary+=String.fromCharCode.apply(null,bytes.slice(i,i+chunkSize));
    }
    const base64=btoa(binary);

    /* Determinar media type */
    const isPdf=s.file.name.endsWith(".pdf")||s.file.type.includes("pdf");
    const mediaType=isPdf?"application/pdf":s.file.type||"application/octet-stream";

    /* Enviar a Claude para extraer texto */
    const ENDPOINT=typeof CHAT_ENDPOINT!=="undefined"?CHAT_ENDPOINT:"/.netlify/functions/chat";
    const fetchFn=typeof authFetch==="function"?authFetch:fetch;
    const ctrl=new AbortController();
    const tout=setTimeout(()=>ctrl.abort(),30000);
    const r=await fetchFn(ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        model:typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : "claude-sonnet-4-20250514",
        max_tokens:16000,
        system:"Eres un extractor de texto. Extrae TODO el texto del documento. Mantén estructura, encabezados y párrafos. Responde SOLO con el texto extraído, sin comentarios.",
        messages:[{role:"user",content:[
          {type:"document",source:{type:"base64",media_type:mediaType,data:base64}},
          {type:"text",text:"Extrae el texto completo de este documento. Incluye títulos, párrafos, tablas y notas. Responde SOLO con el texto."}
        ]}]
      }),
      signal:ctrl.signal
    });
    clearTimeout(tout);

    if(!r.ok){const errText=await r.text();throw new Error("Error API: "+r.status)}
    const data=await r.json();
    const text=(data.content||[]).map(function(b){return b.text||""}).join("");
    if(!text||text.length<10)showToast("No se pudo extraer texto","warning");
    else{s.text=text;showToast("Texto extraído ("+text.length.toLocaleString()+" chars)","success")}
  }catch(e){console.error(e);showToast(e.message||"Error OCR","error")}
  s.processing=false;pdfRenderBody();
}

// ── Shared UI Components ────────────────────────────────────────────────────
function dropZone(tool,title,subtitle){
  return`<div class="pdft-drop" id="drop_${tool}" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')">
    <div style="font-size:32px;margin-bottom:8px">📄</div>
    <p style="font-size:13px;font-weight:600">${title}</p>
    <p style="font-size:11px;color:var(--text-muted);margin-top:4px">${subtitle}</p>
    <input id="input_${tool}" type="file" accept=".pdf" ${tool==="merge"?"multiple":""} style="display:none">
  </div>`;
}

function fileBar(name,info,tool){
  return`<div class="pdft-file-bar">
    <div><p style="font-size:13px;font-weight:600;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(name)}</p>
    <p style="font-size:11px;color:var(--text-muted)">${info}</p></div>
    <button class="pdft-btn" onclick="window._pdfTools.clearTool('${tool}')">Cambiar</button>
  </div>`;
}

// ── Event Binding ───────────────────────────────────────────────────────────
function bindEvents(){
  // Drop zones & file inputs
  ["compress","split","ocr"].forEach(tool=>{
    const drop=document.getElementById("drop_"+tool);
    const inp=document.getElementById("input_"+tool);
    if(drop){
      drop.onclick=()=>inp?.click();
      drop.ondrop=e=>{e.preventDefault();drop.classList.remove("dragover");
        const f=e.dataTransfer.files[0];
        if(f?.type==="application/pdf")handleFileSelect(tool,f);
        else showToast("Solo archivos PDF","warning");
      };
    }
    if(inp)inp.onchange=e=>{if(e.target.files?.[0])handleFileSelect(tool,e.target.files[0])};
  });

  // Buttons
  const btn=id=>document.getElementById(id);
  btn("btnCompress")?.addEventListener("click",doCompress);
  btn("btnSplit")?.addEventListener("click",doSplit);
  btn("btnMerge")?.addEventListener("click",doMerge);
  btn("btnOcr")?.addEventListener("click",doOcr);
  btn("btnDownloadCompress")?.addEventListener("click",()=>{
    const r=state.compress.result;if(r)downloadBlob(r.blob,"comprimido_"+state.compress.file.name);
  });
  btn("btnDownloadMerge")?.addEventListener("click",()=>{
    if(state.merge.result)downloadBlob(state.merge.result,"fusionado.pdf");
  });
  btn("btnCopyOcr")?.addEventListener("click",()=>{
    navigator.clipboard.writeText(state.ocr.text)
      .then(()=>showToast("Copiado","success"))
      .catch(()=>showToast("No se pudo copiar (permiso denegado)","error"));
  });
  btn("btnDownloadOcr")?.addEventListener("click",()=>{
    const blob=new Blob([state.ocr.text],{type:"text/plain;charset=utf-8"});
    downloadBlob(blob,(state.ocr.file?.name?.replace(/\.pdf$/i,"")||"ocr")+"_texto.txt");
  });

  // Split mode radio
  document.querySelectorAll('input[name="splitMode"]').forEach(r=>{
    r.onchange=()=>{state.split.mode=r.value;pdfRenderBody()};
  });
  const sf=document.getElementById("splitFrom"),st=document.getElementById("splitTo");
  if(sf)sf.onchange=()=>{state.split.rangeFrom=parseInt(sf.value)||1};
  if(st)st.onchange=()=>{state.split.rangeTo=parseInt(st.value)||1};
}

async function handleFileSelect(tool,file){
  if(file.size>314572800){showToast("El archivo supera los 300 MB","error");return}
  if(tool==="compress"){state.compress={file,processing:false,result:null}}
  else if(tool==="split"){
    try{
      await loadPdfLib();
      const ab=await file.arrayBuffer();
      const doc=await PDFLib.PDFDocument.load(ab,{ignoreEncryption:true});
      const pc=doc.getPageCount();
      state.split={file,pageCount:pc,mode:"range",rangeFrom:1,rangeTo:pc,processing:false,results:[]};
    }catch(e){showToast("No se pudo leer el PDF","error");return}
  }
  else if(tool==="ocr"){state.ocr={file,processing:false,text:""}}
  pdfRenderBody();
}

function downloadBlob(blobOrIdx,nameOrTool){
  let blob,name;
  if(typeof blobOrIdx==="number"){
    const r=state[nameOrTool]?.results?.[blobOrIdx];if(!r)return;
    blob=r.blob;name=r.name;
  }else{blob=blobOrIdx;name=nameOrTool}
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();
  URL.revokeObjectURL(url);
}

// ── Public API ──────────────────────────────────────────────────────────────
window._pdfTools={
  addMergeFiles:fl=>addMergeFiles(fl),
  removeMergeFile:i=>{state.merge.files.splice(i,1);state.merge.result=null;pdfRenderBody()},
  clearTool:t=>{
    if(t==="compress")state.compress={file:null,processing:false,result:null};
    else if(t==="split")state.split={file:null,pageCount:0,mode:"range",rangeFrom:1,rangeTo:1,processing:false,results:[]};
    else if(t==="ocr")state.ocr={file:null,processing:false,text:""};
    pdfRenderBody();
  },
  downloadBlob
};

window.openPdfTools=function(){
  pdfEnsureView();
  if(typeof showView==="function")showView("viewPdfTools");
  loadPdfLib().catch(()=>{});
  pdfRenderTabs();pdfRenderBody();
};

window.loadPdfLib=loadPdfLib;
window.doOcr=doOcr;

// ── Init ────────────────────────────────────────────────────────────────────
console.log("%c📄 Módulo Herramientas PDF cargado — Fiscalito","color:#0ea5e9;font-weight:bold");
})();
