/**
 * MOD-DILIGENCIAS-EXTRACTOS.JS
 * ─────────────────────────────
 * Pestaña "Diligencias y Extractos" dentro de Mis Casos.
 * Importa archivos desde la carpeta Drive vinculada,
 * auto-clasifica, extrae texto con IA y genera resúmenes.
 * Persiste todo en tabla `diligencias` de Supabase.
 */

/* ── Tipos de diligencia ── */
const DILIGENCIA_TYPES=[
  {value:'denuncia',label:'Denuncia',icon:'📋',color:'#ef4444'},
  {value:'resolucion_inicio',label:'Resolución de Inicio',icon:'📄',color:'#3b82f6'},
  {value:'declaracion_denunciante',label:'Declaración Denunciante',icon:'🗣️',color:'#f59e0b'},
  {value:'declaracion_denunciado',label:'Declaración Denunciado',icon:'🗣️',color:'#f97316'},
  {value:'declaracion_testigo',label:'Declaración Testigo',icon:'👤',color:'#8b5cf6'},
  {value:'oficio',label:'Oficio',icon:'📨',color:'#6b7280'},
  {value:'informe',label:'Informe',icon:'📊',color:'#10b981'},
  {value:'acta',label:'Acta',icon:'📝',color:'#06b6d4'},
  {value:'notificacion',label:'Notificación',icon:'🔔',color:'#6366f1'},
  {value:'prueba_documental',label:'Prueba Documental',icon:'📁',color:'#14b8a6'},
  {value:'cargos',label:'Formulación de Cargos',icon:'⚖️',color:'#e11d48'},
  {value:'descargos',label:'Descargos',icon:'🛡️',color:'#059669'},
  {value:'vista_fiscal',label:'Vista Fiscal',icon:'📋',color:'#7c3aed'},
  {value:'otro',label:'Otro documento',icon:'📎',color:'#64748b'},
];

function getDilTypeInfo(type){return DILIGENCIA_TYPES.find(t=>t.value===type)||DILIGENCIA_TYPES[DILIGENCIA_TYPES.length-1];}

/* ── Auto-clasificar por nombre de archivo ── */
function autoClassifyByFilename(filename){
  const name=filename.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const rules=[
    [/denuncia/i,'denuncia'],
    [/resoluci[oó]n.*inicio|res.*inicio|resol.*inicio/i,'resolucion_inicio'],
    [/resoluci[oó]n.*cargo|res.*cargo|pliego/i,'cargos'],
    [/declaraci[oó]n.*denunciante|decl.*denunciante/i,'declaracion_denunciante'],
    [/declaraci[oó]n.*denunciad[oa]|decl.*denunciad/i,'declaracion_denunciado'],
    [/declaraci[oó]n.*testig|decl.*testig/i,'declaracion_testigo'],
    [/declaraci[oó]n|declaracion/i,'declaracion_testigo'],
    [/oficio/i,'oficio'],
    [/informe.*final|vista.*fiscal/i,'vista_fiscal'],
    [/informe/i,'informe'],
    [/acta/i,'acta'],
    [/notificaci[oó]n/i,'notificacion'],
    [/descargo/i,'descargos'],
    [/prueba/i,'prueba_documental'],
  ];
  for(const[pattern,type]of rules){if(pattern.test(name))return type;}
  return 'otro';
}

/* ── Cargar pestaña Diligencias ── */
async function loadDiligenciasTab(){
  if(!currentCase)return;
  const el=document.getElementById('diligenciasTabContent');
  if(!el)return;
  el.innerHTML='<div class="loading">Cargando diligencias…</div>';

  const{data,error}=await sb.from('diligencias').select('*')
    .eq('case_id',currentCase.id)
    .order('order_index',{ascending:true})
    .order('fecha_diligencia',{ascending:false});

  if(error){el.innerHTML=`<div class="empty-state">⚠️ Error: ${esc(error.message)}</div>`;return;}

  /* Header with actions */
  let html=`<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">
    <div>
      <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:6px">📋 Diligencias y Extractos
        <span style="font-size:11px;font-weight:400;color:var(--text-muted)">${data?.length||0} registros</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Documentos del expediente con texto extraído y resumen IA</div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      ${currentCase.drive_folder_url?`<button class="btn-save" onclick="importDriveAsDiligencias()" id="btnImportDil" style="font-size:11px;padding:5px 12px">
        📥 Importar desde Drive
      </button>`:'<span style="font-size:10.5px;color:var(--text-muted)">Vincula una carpeta Drive para importar</span>'}
      <button class="btn-sm" onclick="analyzeAllPending()" title="Procesar y analizar todas las pendientes" style="font-size:11px;padding:5px 10px;background:var(--gold-glow);border-color:var(--gold-dim);color:var(--gold)">⚡ Procesar todas</button>
      <button class="btn-sm" onclick="loadDiligenciasTab()" title="Refrescar">↻</button>
    </div>
  </div>`;

  /* Search */
  html+=`<div class="dil-search-wrap" style="margin-bottom:12px">
    <div class="dil-search-row">
      <input type="text" id="dilTabSearch" class="dil-search-input" style="min-height:34px;max-height:34px"
        placeholder="🔍 Filtrar por nombre, tipo o resumen…"
        oninput="filterDiligenciasTable(this.value)"/>
    </div>
  </div>`;

  if(!data?.length){
    html+=`<div class="empty-state" style="padding:32px 16px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      <div style="font-size:13px;font-weight:500;margin-bottom:4px">Sin diligencias registradas</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:14px">Importa los documentos desde la carpeta Drive vinculada al caso.</div>
      ${currentCase.drive_folder_url?`<button class="btn-save" onclick="importDriveAsDiligencias()">📥 Importar desde Drive</button>`:''}
    </div>`;
    el.innerHTML=html;return;
  }

  /* Table */
  html+=`<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)">
  <table style="width:100%;border-collapse:collapse;font-size:12px" id="dilTable">
    <thead>
      <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
        <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);white-space:nowrap">Tipo</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted)">Documento</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);white-space:nowrap">Fecha</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted)">Resumen IA</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);white-space:nowrap">Estado</th>
        <th style="padding:8px 10px;text-align:center;font-weight:600;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);white-space:nowrap">Acciones</th>
      </tr>
    </thead>
    <tbody>`;

  data.forEach(d=>{
    const t=getDilTypeInfo(d.diligencia_type);
    const statusIcon=d.is_processed?'✅':d.processing_status==='processing'?'⏳':d.processing_status==='error'?'❌':'⬜';
    const statusLabel=d.is_processed?'Procesado':d.processing_status==='processing'?'Procesando…':d.processing_status==='error'?'Error':'Pendiente';
    const summaryPreview=d.ai_summary?d.ai_summary.substring(0,120)+(d.ai_summary.length>120?'…':''):'—';
    const driveLink=d.drive_web_link?`<a href="${esc(d.drive_web_link)}" target="_blank" title="Abrir en Drive" style="color:var(--gold);text-decoration:none;font-size:10px">↗</a>`:'';

    html+=`<tr class="dil-row" style="border-bottom:1px solid var(--border);transition:background .1s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <td style="padding:8px 10px;white-space:nowrap">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:500;background:${t.color}15;color:${t.color}">
          ${t.icon} ${t.label}
        </span>
      </td>
      <td style="padding:8px 10px;max-width:220px">
        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(d.file_name||d.diligencia_label||'')}">${esc(d.diligencia_label||d.file_name||'Sin nombre')}</div>
        <div style="font-size:10px;color:var(--text-muted);display:flex;align-items:center;gap:4px">
          ${d.file_name?esc(d.file_name):''} ${driveLink}
        </div>
      </td>
      <td style="padding:8px 10px;white-space:nowrap;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${d.fecha_diligencia||'—'}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--text-dim);max-width:300px">
        <div style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4">${esc(summaryPreview)}</div>
      </td>
      <td style="padding:8px 10px;white-space:nowrap">
        <span style="font-size:11px;display:flex;align-items:center;gap:4px">${statusIcon} <span style="color:var(--text-muted);font-size:10.5px">${statusLabel}</span></span>
      </td>
      <td style="padding:8px 10px;text-align:center;white-space:nowrap">
        <div style="display:flex;gap:3px;justify-content:center">
          <button class="btn-action" title="Ver extracto completo" onclick="viewDiligenciaDetail('${d.id}')">👁️</button>
          ${!d.is_processed?`<button class="btn-action" title="Procesar con IA" onclick="processDiligenciaOCR('${d.id}')">🔄</button>`:''}
          ${/expediente|completo|foliado/i.test(d.file_name)?`<button class="btn-action" title="Analizar expediente — identificar diligencias" onclick="analyzeExpediente('${d.id}')" style="color:var(--gold);font-weight:bold">🔍</button>`:''}
          ${d.is_processed&&!d.ai_summary?`<button class="btn-action" title="Generar resumen" onclick="generateDiligenciaSummary('${d.id}')">✨</button>`:''}
          <button class="btn-action" title="Editar tipo/fecha" onclick="editDiligenciaModal('${d.id}')">✎</button>
          <button class="btn-action" title="Eliminar" onclick="deleteDiligencia('${d.id}')" style="color:var(--red)">🗑</button>
        </div>
      </td>
    </tr>`;
  });

  html+=`</tbody></table></div>`;

  /* Bulk actions */
  const unprocessed=data.filter(d=>!d.is_processed);
  const noSummary=data.filter(d=>d.is_processed&&!d.ai_summary);
  if(unprocessed.length||noSummary.length){
    html+=`<div style="display:flex;gap:8px;margin-top:12px;padding:10px 12px;background:var(--gold-glow);border:1px solid rgba(79,70,229,.12);border-radius:var(--radius);align-items:center;flex-wrap:wrap">
      <span style="font-size:11px;font-weight:500;color:var(--gold)">Acciones masivas:</span>
      ${unprocessed.length?`<button class="btn-sm" onclick="processAllDiligencias()" style="font-size:10.5px">🔄 Procesar ${unprocessed.length} pendiente(s)</button>`:''}
      ${noSummary.length?`<button class="btn-sm" onclick="summarizeAllDiligencias()" style="font-size:10.5px">✨ Resumir ${noSummary.length} sin resumen</button>`:''}
    </div>`;
  }

  /* ── Párrafos Modelo Vista Fiscal ── */
  const withSummary=data.filter(d=>d.ai_summary);
  if(withSummary.length>0){
    html+=`<div id="parrafosModeloPanel" style="margin-top:18px;border:1px solid rgba(79,70,229,.15);border-radius:var(--radius-lg);overflow:hidden">
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(79,70,229,.04),rgba(79,70,229,.08));border-bottom:1px solid rgba(79,70,229,.12);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;color:var(--text)">
            📑 Párrafos Modelo — Vista Fiscal
            <span style="font-size:9.5px;padding:2px 7px;border-radius:10px;background:rgba(79,70,229,.1);color:var(--gold);font-weight:500">Con indicación de fojas</span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Párrafos formales numerados generados desde ${withSummary.length} diligencia(s) con extracto</div>
        </div>
        <div style="display:flex;gap:6px" id="parrafosBtns">
          <button class="btn-save" onclick="generateParrafosModelo()" id="btnGenParrafos" style="font-size:11px;padding:5px 12px">📑 Generar párrafos</button>
        </div>
      </div>
      <div id="parrafosModeloContent" style="padding:16px">
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">
          <div style="font-size:24px;margin-bottom:6px">📑</div>
          Presiona "Generar párrafos" para crear los párrafos modelo<br>a partir de las diligencias procesadas.
        </div>
      </div>
    </div>`;
  }

  el.innerHTML=html;

  /* Load existing paragraphs if any */
  if(withSummary.length>0) loadParrafosModeloExisting();
}

/* ── Filtrar tabla ── */
function filterDiligenciasTable(query){
  const q=query.toLowerCase();
  document.querySelectorAll('#dilTable tbody .dil-row').forEach(row=>{
    const text=row.innerText.toLowerCase();
    row.style.display=text.includes(q)?'':'none';
  });
}

/* ── Importar archivos de Drive como diligencias ── */
async function importDriveAsDiligencias(){
  if(!currentCase||!currentCase.drive_folder_url||!session)return;
  const btn=document.getElementById('btnImportDil');
  if(btn){btn.disabled=true;btn.textContent='⏳ Importando…';}

  try{
    /* 1. List files from Drive */
    const m=currentCase.drive_folder_url.match(/folders\/([^?&/]+)/);
    if(!m)throw new Error('No se pudo obtener el ID de la carpeta.');
    const folderId=m[1];

    const res=await fetch('/.netlify/functions/drive',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'list',folderId,recursive:true,maxDepth:3})
    });
    if(!res.ok)throw new Error('Error al listar archivos: HTTP '+res.status);
    const driveData=await res.json();
    if(!driveData?.ok)throw new Error(driveData?.error||'Error de Drive');

    const files=driveData.files||[];
    if(!files.length){showToast('📂 Carpeta sin archivos.');return;}

    /* 2. Get existing diligencias to avoid duplicates */
    const{data:existing}=await sb.from('diligencias').select('drive_file_id,file_name').eq('case_id',currentCase.id);
    const existingIds=new Set((existing||[]).map(e=>e.drive_file_id).filter(Boolean));
    const existingNames=new Set((existing||[]).map(e=>e.file_name).filter(Boolean));

    /* 3. Filter new files only */
    const newFiles=files.filter(f=>{
      if(f.id&&existingIds.has(f.id))return false;
      if(existingNames.has(f.name))return false;
      return true;
    });

    if(!newFiles.length){showToast('✓ Todos los archivos ya están registrados.');return;}

    /* 4. Insert new diligencias */
    const inserts=newFiles.map((f,i)=>{
      const type=autoClassifyByFilename(f.name);
      const tInfo=getDilTypeInfo(type);
      return {
        id:crypto.randomUUID(),
        case_id:currentCase.id,
        user_id:session.user.id,
        diligencia_type:type,
        diligencia_label:tInfo.label+': '+f.name.replace(/\.[^.]+$/,''),
        file_name:f.name,
        file_path:f._path||f.name,
        file_size:f.size?parseInt(f.size):null,
        drive_file_id:f.id||null,
        drive_web_link:f.webViewLink||null,
        mime_type:f.mimeType||null,
        is_processed:false,
        processing_status:'pending',
        order_index:(existing?.length||0)+i,
        fecha_diligencia:f.modifiedTime?f.modifiedTime.split('T')[0]:null,
      };
    });

    const{error}=await sb.from('diligencias').insert(inserts);
    if(error)throw new Error(error.message);

    showToast(`✓ ${newFiles.length} diligencia(s) importada(s)`);
    await loadDiligenciasTab();

  }catch(err){
    showToast('⚠️ '+err.message);
    console.error('importDriveAsDiligencias:',err);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='📥 Importar desde Drive';}
  }
}

/* ── Procesar OCR: extrae texto CLIENT-SIDE con pdf.js (sin timeout) ── */
async function processDiligenciaOCR(dilId){
  if(!currentCase||!session)return;

  const{data:dil,error}=await sb.from('diligencias').select('*').eq('id',dilId).single();
  if(error||!dil){showToast('⚠️ Diligencia no encontrada');return;}
  if(!dil.drive_file_id){showToast('⚠️ Sin archivo Drive vinculado');return;}

  await sb.from('diligencias').update({processing_status:'processing'}).eq('id',dilId);
  showToast('📥 Descargando y extrayendo texto…');

  try{
    /* Step 1: Download PDF as binary from Drive (via server) */
    const dlRes=await fetch('/.netlify/functions/drive',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'download',fileId:dil.drive_file_id})
    });

    let extractedText='';

    const ct=dlRes.headers.get('content-type')||'';
    if(!ct.includes('json')){
      /* Fallback: try server-side OCR for non-PDF files */
      throw new Error('No se pudo descargar. Intente con archivo más pequeño.');
    }

    const dlData=await dlRes.json();

    if(dlData.ok&&dlData.base64){
      /* Step 2: Extract text CLIENT-SIDE with pdf.js */
      showToast('📄 Extrayendo texto con pdf.js…');
      extractedText=await extractPdfTextClientSide(dlData.base64);
    } else if(dlData.error&&dlData.error.includes('grande')){
      /* File too large for download endpoint — use server OCR */
      showToast('📥 Archivo grande — usando OCR servidor…');
      const ocrRes=await fetch('/.netlify/functions/ocr',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'extract',fileId:dil.drive_file_id,fileName:dil.file_name})
      });
      const ocrCt=ocrRes.headers.get('content-type')||'';
      if(!ocrCt.includes('json'))throw new Error('Timeout del servidor. Divida el PDF en partes más pequeñas.');
      const ocrData=await ocrRes.json();
      if(!ocrRes.ok||!ocrData.ok)throw new Error(ocrData.error||'Error OCR');
      extractedText=ocrData.extractedText||'';
    } else {
      throw new Error(dlData.error||'Error descargando archivo');
    }

    if(!extractedText||extractedText.length<50){
      throw new Error('No se pudo extraer texto del documento');
    }

    /* Step 3: Generate quick summary with server (Haiku) */
    let aiSummary=null;
    try{
      const sumRes=await fetch('/.netlify/functions/ocr',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'summarize',text:extractedText.substring(0,4000)})
      });
      if(sumRes.ok){const sd=await sumRes.json();aiSummary=sd.summary||null;}
    }catch(e){}

    /* Step 4: Save to Supabase */
    await sb.from('diligencias').update({
      extracted_text:extractedText,
      ai_summary:aiSummary,
      is_processed:true,
      processing_status:'completed'
    }).eq('id',dilId);

    showToast(`✅ Procesado: ${dil.file_name} (${extractedText.length} caracteres)`);
    await loadDiligenciasTab();

  }catch(err){
    await sb.from('diligencias').update({processing_status:'error'}).eq('id',dilId);
    showToast('❌ Error: '+err.message);
    console.error('processDiligenciaOCR:',err);
  }
}

/* ── Extraer texto de PDF en el navegador con pdf.js ── */
async function extractPdfTextClientSide(base64Data){
  /* Load pdf.js dynamically if not loaded */
  if(!window.pdfjsLib){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=()=>{
        window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  const binary=atob(base64Data);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);

  const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;
  const numPages=pdf.numPages;
  const texts=[];

  for(let i=1;i<=numPages;i++){
    if(i%10===0)showToast(`📄 Extrayendo página ${i}/${numPages}…`);
    const page=await pdf.getPage(i);
    const tc=await page.getTextContent();
    const pageText=tc.items.map(item=>item.str).join(' ');
    texts.push(`=== PÁGINA ${i} ===\n${pageText}`);
  }

  return texts.join('\n\n');
}

/* ══════════════════════════════════════════════════════════════
   ANALIZAR EXPEDIENTE — Extrae texto client-side + IA por lotes
   Inspirado en ExpedienteSplitter: pdf.js local + batches de 80pp
   ══════════════════════════════════════════════════════════════ */
const PAGES_PER_BATCH=80;
const CHARS_PER_BATCH=30000;

function buildBatchText(pageTexts,startPage,endPage){
  let result='';
  for(let i=startPage-1;i<endPage&&i<pageTexts.length;i++){
    const t=pageTexts[i]||'';
    const head=t.substring(0,1200);
    const tail=t.length>1400?'\n[...]\n'+t.substring(t.length-200):'';
    const entry=`=== PÁGINA ${i+1} ===\n${head}${tail}\n\n`;
    if(result.length+entry.length>CHARS_PER_BATCH)break;
    result+=entry;
  }
  return result;
}

async function analyzeExpediente(dilId){
  if(!currentCase||!session)return;

  const{data:dil,error}=await sb.from('diligencias').select('*').eq('id',dilId).single();
  if(error||!dil){showToast('⚠️ Diligencia no encontrada');return;}

  await sb.from('diligencias').update({processing_status:'processing'}).eq('id',dilId);

  try{
    let pageTexts=[];
    let fullText=dil.extracted_text||'';

    /* ── ETAPA 1: Extraer texto página por página (client-side) ── */
    if(!fullText||fullText.length<200){
      if(!dil.drive_file_id){showToast('⚠️ Sin archivo Drive');return;}

      showToast('📥 Etapa 1/2: Descargando PDF…');
      const dlRes=await fetch('/.netlify/functions/drive',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'download',fileId:dil.drive_file_id})
      });
      const ct=dlRes.headers.get('content-type')||'';
      if(!ct.includes('json'))throw new Error('Archivo muy grande para descarga directa. Divida el PDF.');
      const dlData=await dlRes.json();
      if(!dlData.ok||!dlData.base64)throw new Error(dlData.error||'Error descargando');

      showToast('📄 Extrayendo texto página por página…');

      /* Load pdf.js */
      if(!window.pdfjsLib){
        await new Promise((resolve,reject)=>{
          const s=document.createElement('script');
          s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          s.onload=()=>{
            window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve();
          };
          s.onerror=reject;
          document.head.appendChild(s);
        });
      }

      const binary=atob(dlData.base64);
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);

      const pdf=await window.pdfjsLib.getDocument({data:bytes}).promise;
      const numPages=pdf.numPages;

      for(let i=1;i<=numPages;i++){
        if(i%10===0)showToast(`📄 Página ${i}/${numPages}…`);
        const page=await pdf.getPage(i);
        const tc=await page.getTextContent();
        pageTexts.push(tc.items.map(item=>item.str).join(' '));
      }

      fullText=pageTexts.map((t,i)=>`=== PÁGINA ${i+1} ===\n${t}`).join('\n\n');

      /* Save extracted text */
      await sb.from('diligencias').update({
        extracted_text:fullText.substring(0,200000),
        is_processed:true,
        processing_status:'completed'
      }).eq('id',dilId);

      showToast(`✅ Texto extraído: ${numPages} páginas, ${fullText.length} caracteres`);
    } else {
      /* Parse existing text to get page texts */
      const pageSections=fullText.split(/=== PÁGINA \d+ ===/);
      pageTexts=pageSections.filter(t=>t.trim().length>20);
    }

    /* ── ETAPA 2: Identificar diligencias por LOTES ── */
    showToast('🔍 Etapa 2/2: Identificando diligencias por lotes…');

    const totalPages=pageTexts.length;
    const batches=[];
    for(let p=1;p<=totalPages;p+=PAGES_PER_BATCH){
      batches.push({start:p,end:Math.min(p+PAGES_PER_BATCH-1,totalPages)});
    }

    const allDiligencias=[];

    for(let i=0;i<batches.length;i++){
      const batch=batches[i];
      showToast(`🔍 Lote ${i+1}/${batches.length} (pp. ${batch.start}-${batch.end})…`);

      const batchText=buildBatchText(pageTexts,batch.start,batch.end);

      try{
        const res=await fetch('/.netlify/functions/ocr',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            action:'analyze',
            extractedText:batchText,
            fileName:dil.file_name+` (lote ${i+1}/${batches.length}, pp.${batch.start}-${batch.end})`
          })
        });
        const ct=res.headers.get('content-type')||'';
        if(ct.includes('json')){
          const data=await res.json();
          if(data.ok&&data.diligencias)allDiligencias.push(...data.diligencias);
        }
      }catch(e){
        console.warn(`Lote ${i+1} error:`,e.message);
      }
    }

    /* Insert identified diligencias */
    if(allDiligencias.length>0){
      const{data:existing}=await sb.from('diligencias').select('diligencia_label').eq('case_id',currentCase.id);
      const existingLabels=new Set((existing||[]).map(d=>d.diligencia_label));

      const inserts=[];
      allDiligencias.forEach((d,i)=>{
        const label=d.titulo||d.label||d.tipo||'Diligencia '+(i+1);
        if(existingLabels.has(label))return;

        inserts.push({
          id:crypto.randomUUID(),
          case_id:currentCase.id,
          user_id:session.user.id,
          diligencia_type:d.tipo||d.type||'otro',
          diligencia_label:label,
          file_name:dil.file_name+(d.fojas?' [pp.'+d.fojas+']':(d.pageStart?' [pp.'+d.pageStart+'-'+d.pageEnd+']':'')),
          file_path:dil.file_path||dil.file_name,
          drive_file_id:dil.drive_file_id,
          drive_web_link:dil.drive_web_link,
          mime_type:dil.mime_type,
          fecha_diligencia:d.fecha||null,
          fojas_inicio:d.fojas?parseInt(d.fojas.split('-')[0]):d.pageStart||null,
          fojas_fin:d.fojas?parseInt(d.fojas.split('-')[1]):d.pageEnd||null,
          ai_summary:d.resumen||null,
          is_processed:true,
          processing_status:'completed',
          order_index:i+1,
        });
      });

      if(inserts.length>0){
        const{error:ie}=await sb.from('diligencias').insert(inserts);
        if(ie)console.warn('Insert:',ie.message);
      }

      showToast(`✅ ${allDiligencias.length} diligencia(s) identificada(s) en ${batches.length} lote(s)`);
    } else {
      showToast('✅ Procesado (no se detectaron diligencias individuales)');
    }

    await loadDiligenciasTab();

  }catch(err){
    await sb.from('diligencias').update({processing_status:'error'}).eq('id',dilId);
    showToast('❌ Error: '+err.message);
    console.error('analyzeExpediente:',err);
  }
}

/* ── Analizar todas las diligencias pendientes ── */
async function analyzeAllPending(){
  if(!currentCase)return;
  const{data}=await sb.from('diligencias').select('id,file_name,is_processed,drive_file_id')
    .eq('case_id',currentCase.id).eq('is_processed',false);
  if(!data?.length){showToast('✅ Todas procesadas');return;}

  const withDrive=data.filter(d=>d.drive_file_id);
  if(!withDrive.length){showToast('⚠️ Sin archivos Drive para procesar');return;}

  showToast(`⏳ Procesando ${withDrive.length} documento(s)…`);
  for(const d of withDrive){
    const isExpediente=/expediente|completo|foliado/i.test(d.file_name);
    if(isExpediente){
      await analyzeExpediente(d.id);
    } else {
      await processDiligenciaOCR(d.id);
    }
  }
}

/* ── Generar resumen IA para diligencia ya procesada ── */
async function generateDiligenciaSummary(dilId){
  const{data:dil}=await sb.from('diligencias').select('*').eq('id',dilId).single();
  if(!dil||!dil.extracted_text){showToast('⚠️ Sin texto extraído');return;}

  showToast('✨ Generando resumen…');
  try{
    const r=await authFetch(CHAT_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',max_tokens:300,
        system:'Resume documentos jurídicos en máximo 3 oraciones concisas. Solo el resumen, sin preámbulos.',
        messages:[{role:'user',content:`Resume este documento tipo "${dil.diligencia_type}":\n\n${dil.extracted_text.substring(0,4000)}`}]
      })
    });
    const data=await r.json();
    const summary=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'';
    if(summary){
      await sb.from('diligencias').update({ai_summary:summary}).eq('id',dilId);
      showToast('✅ Resumen generado');
      await loadDiligenciasTab();
    }
  }catch(err){showToast('❌ '+err.message);}
}

/* ── Procesar TODAS las pendientes ── */
async function processAllDiligencias(){
  if(!currentCase)return;
  const{data}=await sb.from('diligencias').select('id,file_name')
    .eq('case_id',currentCase.id).eq('is_processed',false);
  if(!data?.length){showToast('Sin diligencias pendientes');return;}
  showToast(`⏳ Procesando ${data.length} diligencias…`);
  for(const d of data){
    await processDiligenciaOCR(d.id);
    await new Promise(r=>setTimeout(r,1500)); // rate limit
  }
  showToast('✅ Proceso masivo completado');
}

/* ── Resumir TODAS sin resumen ── */
async function summarizeAllDiligencias(){
  if(!currentCase)return;
  const{data}=await sb.from('diligencias').select('id')
    .eq('case_id',currentCase.id).eq('is_processed',true).is('ai_summary',null);
  if(!data?.length){showToast('Todas tienen resumen');return;}
  showToast(`✨ Generando ${data.length} resúmenes…`);
  for(const d of data){
    await generateDiligenciaSummary(d.id);
    await new Promise(r=>setTimeout(r,1500));
  }
  showToast('✅ Resúmenes completados');
}

/* ── Ver detalle completo de una diligencia ── */
async function viewDiligenciaDetail(dilId){
  const{data:dil}=await sb.from('diligencias').select('*').eq('id',dilId).single();
  if(!dil)return;
  const t=getDilTypeInfo(dil.diligencia_type);
  const modal=document.createElement('div');
  modal.id='dilDetailModal';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:20px';
  modal.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius-lg);max-width:800px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:var(--shadow-md)">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:16px">${t.icon}</span>
          <span style="font-size:14px;font-weight:600">${esc(dil.diligencia_label||dil.file_name||'Diligencia')}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;display:flex;gap:12px">
          <span>${t.label}</span>
          ${dil.fecha_diligencia?`<span>📅 ${dil.fecha_diligencia}</span>`:''}
          ${dil.file_name?`<span>📄 ${esc(dil.file_name)}</span>`:''}
          ${dil.drive_web_link?`<a href="${esc(dil.drive_web_link)}" target="_blank" style="color:var(--gold);text-decoration:none">Abrir en Drive ↗</a>`:''}
        </div>
      </div>
      <button onclick="document.getElementById('dilDetailModal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);padding:4px 8px">✕</button>
    </div>
    ${dil.ai_summary?`<div style="padding:12px 20px;background:var(--gold-glow);border-bottom:1px solid var(--border);flex-shrink:0">
      <div style="font-size:10px;font-weight:600;color:var(--gold);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Resumen IA</div>
      <div style="font-size:12.5px;line-height:1.6;color:var(--text-dim)">${esc(dil.ai_summary)}</div>
    </div>`:''}
    <div style="padding:20px;overflow-y:auto;flex:1">
      <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Texto extraído</div>
      <div style="font-size:12.5px;line-height:1.7;white-space:pre-wrap;font-family:var(--font-body);color:var(--text)">${dil.extracted_text?esc(dil.extracted_text):'<span style="color:var(--text-muted);font-style:italic">Sin texto extraído. Procesa esta diligencia para obtener el contenido.</span>'}</div>
    </div>
    <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">
      ${dil.extracted_text?`<button class="btn-sm" onclick="navigator.clipboard.writeText(document.querySelector('#dilDetailModal .dil-text')?.innerText||'');showToast('✓ Copiado')">📋 Copiar texto</button>`:''}
      ${!dil.is_processed?`<button class="btn-save" onclick="document.getElementById('dilDetailModal').remove();processDiligenciaOCR('${dil.id}')" style="font-size:11px">🔄 Procesar con IA</button>`:''}
      <button class="btn-cancel" onclick="document.getElementById('dilDetailModal').remove()">Cerrar</button>
    </div>
  </div>`;
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}

/* ── Editar diligencia (tipo, etiqueta, fecha) ── */
async function editDiligenciaModal(dilId){
  const{data:dil}=await sb.from('diligencias').select('*').eq('id',dilId).single();
  if(!dil)return;
  const modal=document.createElement('div');
  modal.id='dilEditModal';
  modal.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:20px';
  const typeOptions=DILIGENCIA_TYPES.map(t=>`<option value="${t.value}"${t.value===dil.diligencia_type?' selected':''}>${t.icon} ${t.label}</option>`).join('');
  modal.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius-lg);max-width:480px;width:100%;box-shadow:var(--shadow-md);padding:20px">
    <div style="font-size:14px;font-weight:600;margin-bottom:16px">Editar diligencia</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Tipo de documento</label>
        <select id="dilEditType" class="input" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;color:var(--text)">${typeOptions}</select>
      </div>
      <div>
        <label style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Etiqueta / nombre</label>
        <input id="dilEditLabel" class="input" value="${esc(dil.diligencia_label||'')}" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;color:var(--text)"/>
      </div>
      <div>
        <label style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Fecha diligencia</label>
        <input id="dilEditFecha" type="date" value="${dil.fecha_diligencia||''}" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;color:var(--text)"/>
      </div>
      <div>
        <label style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:4px">Notas</label>
        <textarea id="dilEditNotes" rows="2" style="width:100%;padding:8px 10px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);font-size:12px;color:var(--text);resize:vertical">${esc(dil.notes||'')}</textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="btn-cancel" onclick="document.getElementById('dilEditModal').remove()">Cancelar</button>
      <button class="btn-save" onclick="saveDiligenciaEdit('${dil.id}')">Guardar</button>
    </div>
  </div>`;
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
  document.body.appendChild(modal);
}

async function saveDiligenciaEdit(dilId){
  const type=document.getElementById('dilEditType')?.value;
  const label=document.getElementById('dilEditLabel')?.value.trim();
  const fecha=document.getElementById('dilEditFecha')?.value||null;
  const notes=document.getElementById('dilEditNotes')?.value.trim()||null;
  const{error}=await sb.from('diligencias').update({
    diligencia_type:type,
    diligencia_label:label,
    fecha_diligencia:fecha,
    notes:notes
  }).eq('id',dilId);
  if(error){showToast('⚠️ '+error.message);return;}
  document.getElementById('dilEditModal')?.remove();
  showToast('✓ Diligencia actualizada');
  await loadDiligenciasTab();
}

/* ── Eliminar diligencia ── */
async function deleteDiligencia(dilId){
  if(!confirm('¿Eliminar esta diligencia? Esta acción no se puede deshacer.'))return;
  const{error}=await sb.from('diligencias').delete().eq('id',dilId);
  if(error){showToast('⚠️ '+error.message);return;}
  showToast('✓ Diligencia eliminada');
  await loadDiligenciasTab();
}

/* ═══════════════════════════════════════════════════════════
   PÁRRAFOS MODELO — VISTA FISCAL / INFORME DE INVESTIGADORA
   Genera párrafos formales numerados desde extractos de diligencias.
   Persiste en case_metadata (key: parrafos_modelo_extractos).
   ═══════════════════════════════════════════════════════════ */

/* ── Niveles de detalle por tipo de diligencia ── */
const NIVEL_DETALLE={
  /* NIVEL 3 — Máximo detalle (10-20 oraciones) */
  denuncia:3,
  declaracion_denunciante:3,
  declaracion_denunciado:3,
  declaracion_testigo:3,
  descargos:3,
  /* NIVEL 2 — Detalle medio (5-8 oraciones) */
  informe:2,
  cargos:2,
  vista_fiscal:2,
  prueba_documental:2,
  /* NIVEL 1 — Breve (3-5 oraciones) */
  resolucion_inicio:1,
  oficio:1,
  acta:1,
  notificacion:1,
  otro:1,
};

/* ── Cargar párrafos existentes desde case_metadata ── */
async function loadParrafosModeloExisting(){
  if(!currentCase)return;
  const content=document.getElementById('parrafosModeloContent');
  const btns=document.getElementById('parrafosBtns');
  if(!content)return;

  const{data}=await sb.from('case_metadata')
    .select('id,value')
    .eq('case_id',currentCase.id)
    .eq('key','parrafos_modelo_extractos')
    .maybeSingle();

  if(data?.value){
    renderParrafosModelo(data.value);
    if(btns){
      btns.innerHTML=`
        <button class="btn-sm" onclick="copyParrafosModelo()" title="Copiar al portapapeles" style="font-size:10.5px">📋 Copiar</button>
        <button class="btn-sm" onclick="editParrafosModelo()" title="Editar manualmente" style="font-size:10.5px">✎ Editar</button>
        <button class="btn-save" onclick="generateParrafosModelo()" id="btnGenParrafos" style="font-size:11px;padding:5px 12px">↻ Regenerar</button>
      `;
    }
  }
}

/* ── Renderizar párrafos en el panel ── */
function renderParrafosModelo(text){
  const content=document.getElementById('parrafosModeloContent');
  if(!content)return;
  content.innerHTML=`<div style="max-height:500px;overflow-y:auto;font-family:var(--font-serif);font-size:13.5px;line-height:1.8;color:var(--text);white-space:pre-wrap;padding:4px 0">${esc(text)}</div>`;
}

/* ── Generar párrafos con IA ── */
async function generateParrafosModelo(){
  if(!currentCase||!session)return;
  const btn=document.getElementById('btnGenParrafos');
  const content=document.getElementById('parrafosModeloContent');
  if(btn){btn.disabled=true;btn.textContent='⏳ Generando…';}
  if(content){content.innerHTML='<div class="loading">Generando párrafos modelo desde las diligencias…</div>';}

  try{
    /* 1. Cargar diligencias con extracto */
    const{data:dils}=await sb.from('diligencias')
      .select('diligencia_type,diligencia_label,file_name,fojas_inicio,fojas_fin,fecha_diligencia,ai_summary,extracted_text')
      .eq('case_id',currentCase.id)
      .not('ai_summary','is',null)
      .order('order_index',{ascending:true})
      .order('fecha_diligencia',{ascending:true});

    if(!dils?.length){showToast('⚠️ No hay diligencias con resumen IA');return;}

    /* 2. Cross-case learning: párrafos de otros casos terminados */
    let referenceStyle='';
    try{
      const{data:refs}=await sb.from('case_metadata')
        .select('value')
        .eq('user_id',session.user.id)
        .eq('key','parrafos_modelo_extractos')
        .neq('case_id',currentCase.id)
        .order('updated_at',{ascending:false})
        .limit(5);
      if(refs?.length){
        const samples=refs.map(r=>(r.value||'').substring(0,2000)).filter(v=>v.length>100);
        if(samples.length){
          referenceStyle=`\n\n## PÁRRAFOS DE REFERENCIA (ESTILO, NO CONTENIDO)\nEstos son párrafos de OTROS casos del mismo fiscal. Replica su nivel de detalle, fórmulas jurídicas y formato de citación de fojas. NO copies datos de estos casos.\n\n${samples.join('\n\n---\n\n').substring(0,12000)}`;
        }
      }
    }catch(e){console.warn('Cross-case refs:',e);}

    /* 3. Construir contexto de diligencias con niveles de detalle */
    const dilContext=dils.map((d,i)=>{
      const nivel=NIVEL_DETALLE[d.diligencia_type]||1;
      const nivelLabel=nivel===3?'NIVEL 3 — MÁXIMO DETALLE (10-20 oraciones: relato completo, percepción, impacto, coherencia)':
                       nivel===2?'NIVEL 2 — DETALLE MEDIO (5-8 oraciones: contexto, contenido, fundamentos)':
                       'NIVEL 1 — BREVE (3-5 oraciones: tipo, fecha, emisor, contenido esencial)';
      const fojas=d.fojas_inicio?
        (d.fojas_fin?`fojas ${d.fojas_inicio} a ${d.fojas_fin}`:`fojas ${d.fojas_inicio}`):
        `fojas [COMPLETAR]`;
      const texto=nivel===3?(d.extracted_text||d.ai_summary||'').substring(0,3000):
                  nivel===2?(d.ai_summary||'').substring(0,1500):
                  (d.ai_summary||'').substring(0,600);
      return `### DILIGENCIA ${i+1}: ${d.diligencia_label||d.file_name||'Documento'}\n- Tipo: ${d.diligencia_type}\n- ${nivelLabel}\n- Fojas: ${fojas}\n- Fecha: ${d.fecha_diligencia||'sin fecha'}\n- Contenido/Extracto:\n${texto}`;
    }).join('\n\n');

    /* 4. System prompt con reglas de estilo */
    const systemPrompt=`Eres un fiscal/investigador experto en procedimientos disciplinarios chilenos. Genera párrafos formales numerados para una Vista Fiscal o Informe de Investigadora.

## REGLAS OBLIGATORIAS DE ESTILO

1. Cada párrafo COMIENZA con "Que," (seguido de minúscula)
2. INDICAR FOJAS: "a fojas X del expediente" o "a fojas X a Y"
3. Lenguaje jurídico-administrativo FORMAL chileno
4. Tercera persona impersonal: "consta", "rola", "se acredita", "obra en autos"
5. SIN viñetas, SIN bullets dentro del párrafo
6. SIN markdown (bold, cursiva, headers) — PROSA PURA
7. Mencionar: tipo documento, fecha, emisor/declarante, contenido
8. Conectores: "en efecto", "asimismo", "por su parte", "cabe señalar", "a mayor abundamiento"
9. NUNCA inventar datos, nombres, fechas o normas que no aparezcan en los extractos
10. Si falta información: [COMPLETAR] o [VERIFICAR]

## NIVELES DE DETALLE

- NIVEL 1 (doc administrativo): 3-5 oraciones. Tipo, número, fecha, emisor, contenido esencial.
- NIVEL 2 (doc sustantivo): 5-8 oraciones. Contexto, contenido detallado, fundamentos, conclusiones.
- NIVEL 3 (denuncia/declaración): 10-20 oraciones. MÁXIMO DETALLE:
  a) Identificación: nombre, cargo, estamento, dependencia
  b) Contexto procesal: fecha, ante quién, calidad procesal
  c) Relato cronológico: TODOS los hechos, fechas, lugares, personas, conductas
  d) Percepción y valoración del declarante
  e) Impacto: consecuencias laborales, salud, anímicas
  f) Prueba referenciada: documentos, correos, testigos mencionados
  g) Coherencia: confirma/contradice/complementa otras declaraciones
  h) Peticiones del declarante
  * Distinguir hechos presenciados vs. de oídas
  * Citas textuales entre comillas cuando disponibles

## DIRECTIVA DE ESTILO DE ESCRITURA

- Variación natural en longitud de oraciones
- Vocabulario jurídico-administrativo chileno sin artificialidad
- PROHIBIDAS frases de IA: "Es importante destacar", "Cabe mencionar que", "En resumen"
- Prosa continua, fluida, profesional
- El texto debe leerse como escrito por un fiscal o funcionario público experimentado
- NUNCA emojis, NUNCA frases de chatbot`;

    /* 5. User prompt */
    const userPrompt=`Genera los párrafos modelo para la Vista Fiscal del expediente:

## DATOS DEL CASO
- Nombre: ${currentCase.name}
- ROL: ${currentCase.rol||'—'}
- Carátula: ${currentCase.caratula||'—'}
- Materia: ${currentCase.materia||'—'}
- Procedimiento: ${currentCase.tipo_procedimiento||'—'}

## DILIGENCIAS DEL EXPEDIENTE (${dils.length} documentos)

${dilContext}
${referenceStyle}

GENERA UN PÁRRAFO FORMAL POR CADA DILIGENCIA, numerados. Respeta el NIVEL DE DETALLE indicado para cada una. Solo texto plano, sin markdown.`;

    /* 6. Llamar en LOTES para evitar timeout (max ~10 diligencias por lote) */
    const DILS_PER_BATCH=10;
    const batches=[];
    const dilEntries=dilContext.split('### DILIGENCIA ').filter(s=>s.trim());
    for(let i=0;i<dilEntries.length;i+=DILS_PER_BATCH){
      batches.push(dilEntries.slice(i,i+DILS_PER_BATCH).map(e=>'### DILIGENCIA '+e).join('\n\n'));
    }

    let paragraphs='';
    for(let b=0;b<batches.length;b++){
      if(batches.length>1)showToast(`⏳ Generando lote ${b+1}/${batches.length}…`);

      const batchPrompt=`Genera párrafos modelo para la Vista Fiscal:
- Expediente: ${currentCase.name} — ROL: ${currentCase.rol||'—'} — ${currentCase.tipo_procedimiento||''}

## DILIGENCIAS (lote ${b+1}/${batches.length})

${batches[b].substring(0,6000)}

GENERA UN PÁRRAFO POR CADA DILIGENCIA. Respeta el NIVEL indicado. Texto plano sin markdown.`;

      try{
        const r=await authFetch(CHAT_ENDPOINT,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            model:'claude-sonnet-4-20250514',
            max_tokens:2500,
            system:systemPrompt.substring(0,1500),
            messages:[{role:'user',content:batchPrompt}]
          })
        });
        const ct=r.headers.get('content-type')||'';
        if(!ct.includes('json')){console.warn('Lote '+(b+1)+' timeout');continue;}
        const data=await r.json();
        if(data.error){console.warn('Lote '+(b+1)+':',data.error);continue;}
        const txt=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('')||'';
        if(txt)paragraphs+=(paragraphs?'\n\n':'')+txt;
      }catch(e){console.warn('Lote '+(b+1)+' error:',e.message);}
    }

    if(!paragraphs)throw new Error('No se generaron párrafos (todos los lotes fallaron)');

    /* 7. Persistir en case_metadata (upsert) */
    const{data:existing}=await sb.from('case_metadata')
      .select('id')
      .eq('case_id',currentCase.id)
      .eq('key','parrafos_modelo_extractos')
      .maybeSingle();

    if(existing){
      await sb.from('case_metadata').update({value:paragraphs,updated_at:new Date().toISOString()}).eq('id',existing.id);
    } else {
      await sb.from('case_metadata').insert({
        case_id:currentCase.id,
        user_id:session.user.id,
        key:'parrafos_modelo_extractos',
        label:'Párrafos modelo de extractos',
        value:paragraphs
      });
    }

    /* 8. Renderizar */
    renderParrafosModelo(paragraphs);
    showToast(`✅ ${dils.length} párrafos modelo generados`);

    /* Update buttons */
    const btns=document.getElementById('parrafosBtns');
    if(btns){
      btns.innerHTML=`
        <button class="btn-sm" onclick="copyParrafosModelo()" title="Copiar al portapapeles" style="font-size:10.5px">📋 Copiar</button>
        <button class="btn-sm" onclick="editParrafosModelo()" title="Editar manualmente" style="font-size:10.5px">✎ Editar</button>
        <button class="btn-save" onclick="generateParrafosModelo()" id="btnGenParrafos" style="font-size:11px;padding:5px 12px">↻ Regenerar</button>
      `;
    }

  }catch(err){
    showToast('⚠️ '+err.message);
    if(content)content.innerHTML=`<div style="padding:12px;color:var(--red);font-size:12px">⚠️ Error: ${esc(err.message)}</div>`;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='📑 Generar párrafos';}
  }
}

/* ── Copiar párrafos al portapapeles ── */
async function copyParrafosModelo(){
  const content=document.getElementById('parrafosModeloContent');
  if(!content)return;
  const text=content.innerText;
  await navigator.clipboard.writeText(text);
  showToast('✓ Párrafos copiados al portapapeles');
}

/* ── Editar párrafos manualmente ── */
async function editParrafosModelo(){
  if(!currentCase)return;
  const content=document.getElementById('parrafosModeloContent');
  if(!content)return;

  /* Load current text */
  const{data}=await sb.from('case_metadata')
    .select('value')
    .eq('case_id',currentCase.id)
    .eq('key','parrafos_modelo_extractos')
    .maybeSingle();

  const currentText=data?.value||'';
  content.innerHTML=`<div style="display:flex;flex-direction:column;gap:10px">
    <textarea id="parrafosEditArea" style="width:100%;min-height:400px;resize:vertical;font-family:var(--font-serif);font-size:13px;line-height:1.7;padding:14px;background:var(--surface2);border:1px solid var(--border2);border-radius:var(--radius);color:var(--text);outline:none">${esc(currentText)}</textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-cancel" onclick="loadParrafosModeloExisting()">Cancelar</button>
      <button class="btn-save" onclick="saveParrafosModelo()">💾 Guardar cambios</button>
    </div>
  </div>`;
}

/* ── Guardar edición manual ── */
async function saveParrafosModelo(){
  if(!currentCase||!session)return;
  const area=document.getElementById('parrafosEditArea');
  if(!area)return;
  const text=area.value.trim();
  if(!text){showToast('⚠️ El texto no puede estar vacío');return;}

  try{
    const{data:existing}=await sb.from('case_metadata')
      .select('id')
      .eq('case_id',currentCase.id)
      .eq('key','parrafos_modelo_extractos')
      .maybeSingle();

    if(existing){
      await sb.from('case_metadata').update({value:text,updated_at:new Date().toISOString()}).eq('id',existing.id);
    } else {
      await sb.from('case_metadata').insert({
        case_id:currentCase.id,
        user_id:session.user.id,
        key:'parrafos_modelo_extractos',
        label:'Párrafos modelo de extractos',
        value:text
      });
    }
    showToast('✅ Párrafos guardados');
    renderParrafosModelo(text);
  }catch(e){showToast('⚠️ '+e.message);}
}