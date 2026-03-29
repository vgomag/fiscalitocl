/**
 * MOD-SES-DIRECTRICES.JS — Panel de Directrices SES para Ley 21.369
 * ═══════════════════════════════════════════════════════════════════
 * Agrega pestaña "SES" al módulo Ley 21.369 con:
 *   - Subir directrices SES (PDF, Word, Excel, TXT) con extracción de texto
 *   - Listar, filtrar y buscar directrices por categoría
 *   - Chat IA para consultar el contenido de las directrices
 * Tabla: ley21369_ses_documents (Supabase)
 */

const SES_CATEGORIES=[
  {value:'directriz',label:'Directriz'},
  {value:'circular',label:'Circular'},
  {value:'oficio',label:'Oficio'},
  {value:'resolucion',label:'Resolución'},
  {value:'instructivo',label:'Instructivo'},
  {value:'otro',label:'Otro'},
];

let _sesState={
  docs:[],
  chatHistory:[],
  activeSubTab:'directivas', // directivas | chat
  filter:'all',
  search:'',
};

/* ═══ DATA ═══ */
async function loadSesDocs(){
  const{data}=await sb.from('ley21369_ses_documents').select('*').eq('user_id',session.user.id).order('created_at',{ascending:false});
  _sesState.docs=data||[];
  return _sesState.docs;
}

async function uploadSesDoc(file,category,description,docDate){
  if(!session)return showToast('⚠ Sin sesión');

  /* Extraer texto según tipo de archivo */
  let extractedText=null;
  try{
    if(file.name.endsWith('.txt')){
      extractedText=await file.text();
    } else {
      /* Para PDF, Word — enviar a Claude para extracción */
      const reader=new FileReader();
      const base64=await new Promise((res,rej)=>{
        const timeout=setTimeout(()=>{rej(new Error('FileReader timeout after 30s'));},30000);
        reader.onload=()=>{clearTimeout(timeout);res(reader.result.split(',')[1]);};
        reader.onerror=()=>{clearTimeout(timeout);rej(reader.error);};
        reader.readAsDataURL(file);
      });

      const mimeType=file.type||'application/octet-stream';
      const mediaType=file.name.endsWith('.pdf')?'application/pdf':
                      file.name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                      mimeType;

      const r=await authFetch(CHAT_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:16000,
          messages:[{role:'user',content:[
            {type:'document',source:{type:'base64',media_type:mediaType,data:base64}},
            {type:'text',text:'Extrae TODO el texto de este documento. Responde SOLO con el texto extraído, sin comentarios. Mantén estructura, títulos y artículos.'}
          ]}]
        })
      });
      if(r.ok){
        const data=await r.json();
        extractedText=(data.content||[]).map(b=>b.text||'').join('');
      }
    }
  }catch(e){console.warn('Extracción texto SES:',e);}

  /* Guardar en Supabase */
  const{error}=await sb.from('ley21369_ses_documents').insert({
    user_id:session.user.id,
    file_name:file.name,
    file_size:file.size,
    file_type:file.type,
    description:description||null,
    document_date:docDate||null,
    category:category||'directriz',
    extracted_text:extractedText?extractedText.substring(0,80000):null,
  });

  if(error){showToast('⚠ Error: '+error.message);return;}
  showToast('✅ Directriz SES subida'+(extractedText?' (texto extraído)':''));
  await loadSesDocs();
  renderSesPanel();
}

async function deleteSesDoc(id,name){
  if(!confirm('¿Eliminar "'+name+'"?'))return;
  await sb.from('ley21369_ses_documents').delete().eq('id',id);
  showToast('🗑️ Eliminada');
  await loadSesDocs();
  renderSesPanel();
}

/* ═══ CHAT SES ═══ */
async function sendSesChat(quickQ){
  const input=document.getElementById('sesChatInput');
  const msgs=document.getElementById('sesChatMsgs');
  const text=quickQ||input?.value?.trim();
  if(!text||!msgs)return;
  if(input)input.value='';

  /* User message */
  msgs.innerHTML+=`<div style="align-self:flex-end;background:var(--gold);color:#fff;padding:6px 12px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:12px">${esc(text)}</div>`;
  msgs.innerHTML+=`<div id="sesTyping" style="align-self:flex-start;color:var(--text-muted);font-size:11px;padding:6px">⏳ Analizando directrices…</div>`;
  msgs.scrollTop=msgs.scrollHeight;

  /* Build context from all SES docs */
  const docsContext=_sesState.docs.map(d=>{
    const catLabel=SES_CATEGORIES.find(c=>c.value===d.category)?.label||d.category;
    let entry=`### ${d.file_name}\n- Categoría: ${catLabel}\n- Fecha: ${d.document_date||'No especificada'}`;
    if(d.description)entry+='\n- Descripción: '+d.description;
    if(d.extracted_text)entry+='\n- Contenido:\n'+d.extracted_text.substring(0,8000);
    return entry;
  }).join('\n\n---\n\n');

  try{
    _sesState.chatHistory.push({role:'user',content:text});

    const r=await authFetch(CHAT_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:4000,
        system:`Eres Fiscalito, asistente experto en la Ley 21.369 y las directrices de la Superintendencia de Educación Superior (SES) de Chile.

Tienes acceso al contenido de las directrices SES cargadas por el usuario. Responde basándote en el contenido real de estos documentos.

Si te preguntan sobre requisitos, plazos, procedimientos o cualquier aspecto normativo, cita textualmente cuando sea relevante e indica de qué documento proviene la información.

Si no encuentras la respuesta en las directrices cargadas, indícalo claramente.

DIRECTRICES SES DISPONIBLES (${_sesState.docs.length} documentos):

${docsContext||'No hay directrices cargadas aún.'}`,
        messages:_sesState.chatHistory.slice(-10)
      })
    });

    const typing=document.getElementById('sesTyping');if(typing)typing.remove();

    if(!r.ok){
      msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ Error: ${r.status}</div>`;
      return;
    }

    const data=await r.json();
    const reply=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'Sin respuesta.';
    _sesState.chatHistory.push({role:'assistant',content:reply});

    msgs.innerHTML+=`<div style="align-self:flex-start;background:var(--surface2);border:1px solid var(--border);padding:10px 14px;border-radius:2px 12px 12px 12px;max-width:90%;font-size:12px;line-height:1.6">${md(reply)}</div>`;
    msgs.scrollTop=msgs.scrollHeight;

  }catch(err){
    const typing=document.getElementById('sesTyping');if(typing)typing.remove();
    msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px">⚠️ ${err.message}</div>`;
  }
}

/* ═══ RENDER ═══ */
function renderSesPanel(){
  const el=document.getElementById('sesPanelContent');
  if(!el)return;

  const isDir=_sesState.activeSubTab==='directivas';
  const isChat=_sesState.activeSubTab==='chat';

  el.innerHTML=`
    <!-- Sub-tabs -->
    <div style="display:flex;gap:4px;margin-bottom:14px">
      <button class="btn-sm" style="font-weight:${isDir?700:400};background:${isDir?'var(--gold)':'var(--surface)'};color:${isDir?'#fff':'var(--text-dim)'};padding:6px 14px" onclick="_sesState.activeSubTab='directivas';renderSesPanel()">
        🏛️ Directrices (${_sesState.docs.length})
      </button>
      <button class="btn-sm" style="font-weight:${isChat?700:400};background:${isChat?'var(--gold)':'var(--surface)'};color:${isChat?'#fff':'var(--text-dim)'};padding:6px 14px" onclick="_sesState.activeSubTab='chat';renderSesPanel()">
        💬 Consultar IA
      </button>
    </div>

    <div id="sesSubContent"></div>
  `;

  setTimeout(()=>{
    if(isDir)renderSesDirectivas();
    else renderSesChatUI();
  },50);
}

function renderSesDirectivas(){
  const el=document.getElementById('sesSubContent');if(!el)return;

  /* Filter docs */
  const docs=_sesState.docs.filter(d=>{
    const matchSearch=!_sesState.search||d.file_name.toLowerCase().includes(_sesState.search.toLowerCase())||(d.description||'').toLowerCase().includes(_sesState.search.toLowerCase());
    const matchCat=_sesState.filter==='all'||d.category===_sesState.filter;
    return matchSearch&&matchCat;
  });

  /* Group by category */
  const grouped={};
  docs.forEach(d=>{const cat=d.category||'otro';(grouped[cat]=grouped[cat]||[]).push(d);});

  el.innerHTML=`
    <!-- Upload form -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">📤 Subir nueva directriz SES</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Categoría</label>
          <select id="sesUploadCat" style="width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:11px;background:var(--surface);color:var(--text)">
            ${SES_CATEGORIES.map(c=>`<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Fecha documento</label>
          <input type="date" id="sesUploadDate" style="width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:11px;background:var(--surface);color:var(--text);box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Descripción breve</label>
          <input type="text" id="sesUploadDesc" placeholder="Ej: Circular sobre plazos…" style="width:100%;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:11px;background:var(--surface);color:var(--text);box-sizing:border-box">
        </div>
      </div>
      <button class="btn-sm" style="background:var(--gold);color:#fff" onclick="document.getElementById('sesFileInput').click()">📤 Seleccionar y subir archivo</button>
      <input type="file" id="sesFileInput" accept=".pdf,.docx,.doc,.txt,.xlsx,.xls" style="display:none" onchange="if(this.files[0]){const f=this.files[0];uploadSesDoc(f,document.getElementById('sesUploadCat').value,document.getElementById('sesUploadDesc').value,document.getElementById('sesUploadDate').value);this.value='';}">
      <span style="font-size:10px;color:var(--text-muted);margin-left:8px">PDF, Word, Excel o TXT — se extraerá el texto automáticamente</span>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
      <input type="text" placeholder="🔍 Buscar en directrices…" value="${esc(_sesState.search)}" oninput="_sesState.search=this.value;renderSesDirectivas()" style="flex:1;min-width:200px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius);font-size:11px;background:var(--surface);color:var(--text)">
      <select onchange="_sesState.filter=this.value;renderSesDirectivas()" style="padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:11px;background:var(--surface);color:var(--text)">
        <option value="all" ${_sesState.filter==='all'?'selected':''}>Todas</option>
        ${SES_CATEGORIES.map(c=>`<option value="${c.value}" ${_sesState.filter===c.value?'selected':''}>${c.label}</option>`).join('')}
      </select>
      <span style="font-size:10px;color:var(--text-muted)">${docs.length} de ${_sesState.docs.length} documentos</span>
    </div>

    <!-- Documents list -->
    ${Object.keys(grouped).length===0?`
      <div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:36px;margin-bottom:8px">🏛️</div>
        <div style="font-size:13px">No hay directrices SES${_sesState.search?' que coincidan con la búsqueda':' cargadas'}.</div>
        <div style="font-size:11px;margin-top:4px">Sube documentos de la Superintendencia de Educación Superior para consultarlos con IA.</div>
      </div>
    `:Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([cat,catDocs])=>{
      const catLabel=SES_CATEGORIES.find(c=>c.value===cat)?.label||cat;
      return`
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span style="background:var(--gold-glow);color:var(--gold);padding:2px 8px;border-radius:10px;font-size:10px">${catLabel}</span>
            <span style="font-size:10px;color:var(--text-muted)">${catDocs.length} documento${catDocs.length!==1?'s':''}</span>
          </div>
          ${catDocs.map(d=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:4px;background:var(--bg)">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(d.file_name)}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap">
                  ${d.document_date?`<span style="font-size:10px;color:var(--text-muted)">📅 ${new Date(d.document_date+'T12:00:00').toLocaleDateString('es-CL')}</span>`:''}
                  ${d.extracted_text?`<span style="font-size:9px;background:var(--green);color:#fff;padding:1px 5px;border-radius:8px">✓ Texto extraído (${(d.extracted_text.length/1000).toFixed(0)}K)</span>`:'<span style="font-size:9px;color:var(--text-muted)">Sin texto</span>'}
                  ${d.description?`<span style="font-size:10px;color:var(--text-dim)">${esc(d.description.substring(0,50))}</span>`:''}
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                ${d.extracted_text?`<button class="btn-sm" style="font-size:10px;padding:2px 6px" onclick="document.getElementById('sesView_${d.id}').style.display=document.getElementById('sesView_${d.id}').style.display==='none'?'block':'none'" title="Ver texto">👁️</button>`:''}
                <button class="btn-sm" style="font-size:10px;padding:2px 6px;color:var(--red)" onclick="deleteSesDoc('${d.id}','${esc(d.file_name)}')" title="Eliminar">🗑️</button>
              </div>
            </div>
            ${d.extracted_text?`<div id="sesView_${d.id}" style="display:none;margin:4px 0 8px;padding:10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);max-height:300px;overflow-y:auto;font-size:11px;font-family:var(--font-mono);white-space:pre-wrap;color:var(--text-dim)">${esc(d.extracted_text.substring(0,5000))}${d.extracted_text.length>5000?'\n\n[...truncado, '+d.extracted_text.length+' chars total]':''}</div>`:''}
          `).join('')}
        </div>`;
    }).join('')}
  `;
}

function renderSesChatUI(){
  const el=document.getElementById('sesSubContent');if(!el)return;

  const docsWithText=_sesState.docs.filter(d=>d.extracted_text&&d.extracted_text.length>50);

  el.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;display:flex;flex-direction:column;height:480px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        💬 Chat IA — Directrices SES
        <span style="font-size:10px;color:var(--text-muted);font-weight:400">${docsWithText.length} documentos con texto · ${_sesState.docs.length} total</span>
      </div>

      <!-- Chips -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        ${['¿Qué plazos establece la SES?','¿Cuáles son las obligaciones de reporte?','Resume las directrices sobre acoso','¿Qué sanciones contempla la SES?','¿Qué dice sobre medidas de resguardo?'].map(q=>
          `<button class="btn-sm" style="font-size:9px;padding:2px 7px" onclick="sendSesChat('${q.replace(/'/g,"\\'")}')">${q.length>30?q.substring(0,30)+'…':q}</button>`
        ).join('')}
      </div>

      <!-- Messages -->
      <div id="sesChatMsgs" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);margin-bottom:8px">
        ${_sesState.chatHistory.length===0?`
          <div style="font-size:11px;color:var(--text-muted);text-align:center;padding:30px">
            Pregúntame sobre las directrices SES cargadas.<br>
            ${docsWithText.length>0?'Tengo acceso al contenido de '+docsWithText.length+' documento(s).':'⚠️ Sube documentos primero para que pueda consultarlos.'}
          </div>
        `:_sesState.chatHistory.map(m=>m.role==='user'?
          `<div style="align-self:flex-end;background:var(--gold);color:#fff;padding:6px 12px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:12px">${esc(m.content)}</div>`:
          `<div style="align-self:flex-start;background:var(--surface2);border:1px solid var(--border);padding:10px 14px;border-radius:2px 12px 12px 12px;max-width:90%;font-size:12px;line-height:1.6">${md(m.content)}</div>`
        ).join('')}
      </div>

      <!-- Input -->
      <div style="display:flex;gap:6px">
        <input type="text" id="sesChatInput" placeholder="Pregunta sobre las directrices SES…"
          style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-body);background:var(--surface);color:var(--text)"
          onkeydown="if(event.key==='Enter')sendSesChat()">
        <button class="btn-sm" style="background:var(--gold);color:#fff;padding:8px 14px;font-weight:600" onclick="sendSesChat()">Enviar</button>
      </div>
    </div>
  `;

  /* Scroll to bottom */
  const msgsEl=document.getElementById('sesChatMsgs');
  if(msgsEl)msgsEl.scrollTop=msgsEl.scrollHeight;
}

/* ═══ INJECT SES TAB INTO LEY 21.369 ═══ */
function injectSesTab(){
  /* Wait for Ley 21.369 view to be active */
  const view=document.getElementById('viewLey21369');
  if(!view)return;

  /* Find existing tabs container */
  const tabsContainer=view.querySelector('#leyTabs');
  if(!tabsContainer)return;

  /* Check if SES tab already exists */
  if(document.getElementById('sesPanelTab'))return;

  /* Add SES tab button */
  const sesTab=document.createElement('div');
  sesTab.id='sesPanelTab';
  sesTab.className='ley-tab';
  sesTab.textContent='🏛️ SES';
  sesTab.onclick=()=>{
    /* Deactivate other tabs */
    tabsContainer.querySelectorAll('.ley-tab').forEach(t=>t.classList.remove('active'));
    sesTab.classList.add('active');
    /* Show SES content */
    const body=view.querySelector('#leyBody');
    if(body){
      body.innerHTML='<div id="sesPanelContent" style="padding:4px"></div>';
      loadSesDocs().then(()=>renderSesPanel());
    }
  };
  tabsContainer.appendChild(sesTab);
}

/* ═══ AUTO-INJECT on Ley 21.369 open ═══ */
if(typeof openLey21369==='function'){
  const _origOpenLey21369=openLey21369;
  window.openLey21369=function(){
    _origOpenLey21369.apply(this,arguments);
    setTimeout(injectSesTab,800);
  };
}

/* Expose globals */
window.uploadSesDoc=uploadSesDoc;
window.deleteSesDoc=deleteSesDoc;
window.sendSesChat=sendSesChat;
window.renderSesPanel=renderSesPanel;
window.renderSesDirectivas=renderSesDirectivas;
window.renderSesChatUI=renderSesChatUI;
window.injectSesTab=injectSesTab;
window._sesState=_sesState;

console.log('%c🏛️ Módulo SES Directrices cargado','color:#4f46e5;font-weight:bold');
