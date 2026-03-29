// ============================================================================
// MÓDULO LEY 21.369 — FISCALITO
// Implementación completa: cumplimiento, semáforo, KPI, alertas, chat IA
// ============================================================================
(function(){
"use strict";

// ── Constants ───────────────────────────────────────────────────────────────
const AREAS=[
  {id:"protocolo",label:"Protocolo de actuación",icon:"📋"},
  {id:"modelo_prevencion",label:"Modelo de prevención",icon:"🛡️"},
  {id:"capacitacion",label:"Capacitación y formación",icon:"🎓"},
  {id:"difusion",label:"Difusión y sensibilización",icon:"📢"},
  {id:"canales_denuncia",label:"Canales de denuncia",icon:"📞"},
  {id:"investigacion",label:"Procedimientos de investigación",icon:"🔍"},
  {id:"medidas_reparacion",label:"Medidas de reparación",icon:"🤝"},
  {id:"registro_estadistico",label:"Registro estadístico",icon:"📊"},
  {id:"organo_encargado",label:"Órgano encargado",icon:"🏛️"},
  {id:"general",label:"General / Otros",icon:"📁"}
];

const STATUS_CFG={
  pendiente:{label:"Pendiente",cls:"ley-st-pend",color:"#f59e0b"},
  en_proceso:{label:"En proceso",cls:"ley-st-proc",color:"#3b82f6"},
  cumplido:{label:"Cumplido",cls:"ley-st-ok",color:"#16a34a"},
  no_aplica:{label:"No aplica",cls:"ley-st-na",color:"#9ca3af"}
};

// ── State ───────────────────────────────────────────────────────────────────
let items=[], docs=[], loading=false, activeTab="dashboard";
let chatMessages=[], chatLoading=false;
let aiReport=null, generatingReport=false;

// ── Helpers ─────────────────────────────────────────────────────────────────
const h=t=>(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtDate=d=>d?new Date(d).toLocaleDateString("es-CL"):"";
const fmtSize=b=>b?(b/1024).toFixed(0)+" KB":"";
const uid=()=>crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
async function getUser(){
  const{data:{user}}=await sb.auth.getUser();
  return user;
}

// ── CSS Injection ───────────────────────────────────────────────────────────
(function injectCSS(){
const s=document.createElement("style");
s.textContent=`
#viewLey21369{display:none;flex-direction:column;overflow:hidden;height:100%}
#viewLey21369.active{display:flex!important}
.ley-header{padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface)}
.ley-header h2{font-family:'EB Garamond',serif;font-size:22px;font-weight:400;margin:0}
.ley-header p{font-size:11px;color:var(--text-muted);margin:2px 0 0}
.ley-body{flex:1;overflow-y:auto;padding:16px 20px}
.ley-tabs{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding:0 20px;background:var(--surface)}
.ley-tab{padding:8px 12px;font-size:12px;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-muted);transition:.15s;white-space:nowrap}
.ley-tab:hover{color:var(--text)}
.ley-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.ley-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.ley-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}
.ley-card .num{font-size:28px;font-weight:700;line-height:1.1}
.ley-card .lbl{font-size:11px;color:var(--text-muted);margin-top:4px}
.ley-progress{height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin:6px 0}
.ley-progress-fill{height:100%;border-radius:3px;transition:width .4s}
.ley-area-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px}
.ley-area-card.risk-ok{border-left:4px solid #16a34a}
.ley-area-card.risk-warning{border-left:4px solid #f59e0b}
.ley-area-card.risk-critical{border-left:4px solid #ef4444}
.ley-area-header{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.ley-area-header .title{font-weight:600;font-size:14px}
.ley-area-header .stats{display:flex;gap:8px;font-size:11px}
.ley-area-items{margin-top:10px}
.ley-item{background:var(--bg,#fff);border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px}
.ley-item-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.ley-item .req{font-size:13px;flex:1}
.ley-item .meta{font-size:11px;color:var(--text-muted);margin-top:3px;display:flex;gap:10px}
.ley-st{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.ley-st-pend{background:#fef3c7;color:#92400e}
.ley-st-proc{background:#dbeafe;color:#1e40af}
.ley-st-ok{background:#dcfce7;color:#166534}
.ley-st-na{background:#f1f5f9;color:#64748b}
.ley-docs-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.ley-doc-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;font-size:11px;background:var(--surface);border:1px solid var(--border);cursor:pointer}
.ley-doc-badge:hover{background:var(--hover)}
.ley-btn{padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px;cursor:pointer;transition:.15s}
.ley-btn:hover{background:var(--hover)}
.ley-btn-sm{padding:3px 8px;font-size:11px}
.ley-btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.ley-btn-primary:hover{opacity:.85}
.ley-btn-danger{color:#dc2626;border-color:#fca5a5}
.ley-btn-danger:hover{background:#fef2f2}
.ley-select{padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px}
.ley-input{padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px;width:100%}
.ley-textarea{padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);font-size:12px;width:100%;resize:vertical;font-family:inherit}
.ley-table{width:100%;border-collapse:collapse;font-size:12px}
.ley-table th{text-align:left;padding:8px 10px;background:var(--surface);border-bottom:1px solid var(--border);font-weight:600;font-size:11px;color:var(--text-muted)}
.ley-table td{padding:7px 10px;border-bottom:1px solid var(--border)}
.ley-table tr:hover td{background:var(--hover)}
.ley-chat-container{display:flex;flex-direction:column;height:400px;border:1px solid var(--border);border-radius:10px;overflow:hidden}
.ley-chat-msgs{flex:1;overflow-y:auto;padding:12px}
.ley-chat-msg{margin-bottom:10px;max-width:85%}
.ley-chat-msg.user{margin-left:auto;text-align:right}
.ley-chat-msg .bubble{display:inline-block;padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;text-align:left}
.ley-chat-msg.user .bubble{background:var(--accent);color:#fff;border-bottom-right-radius:2px}
.ley-chat-msg.assistant .bubble{background:var(--surface);border:1px solid var(--border);border-bottom-left-radius:2px}
.ley-chat-input{display:flex;gap:6px;padding:8px;border-top:1px solid var(--border);background:var(--surface)}
.ley-chat-input input{flex:1}
.ley-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;display:flex;align-items:center;justify-content:center}
.ley-modal{background:var(--surface,#fff);border-radius:12px;padding:20px;width:90%;max-width:500px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.ley-modal h3{margin:0 0 12px;font-size:16px}
.ley-form-group{margin-bottom:10px}
.ley-form-group label{display:block;font-size:12px;font-weight:600;margin-bottom:3px}
.ley-actions-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ley-alert-card{padding:10px 14px;border-radius:8px;margin-bottom:8px;font-size:12px}
.ley-alert-overdue{background:#fef2f2;border:1px solid #fca5a5;color:#991b1b}
.ley-alert-soon{background:#fffbeb;border:1px solid #fcd34d;color:#92400e}
.ley-report-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;max-height:60vh;overflow-y:auto}
.ley-checklist-item{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}
.ley-checklist-item input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent)}
`;
document.head.appendChild(s);
})();

// ── View Injection ──────────────────────────────────────────────────────────
function ensureView(){
  if(document.getElementById("viewLey21369"))return;
  const v=document.createElement("div");
  v.className="view";
  v.id="viewLey21369";
  v.style.cssText="flex-direction:column;overflow:hidden;";
  v.innerHTML=`
    <div class="ley-header">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><h2>🛡️ Implementación Ley 21.369</h2>
        <p>Seguimiento de cumplimiento normativo — Acoso sexual, violencia y discriminación de género</p></div>
        <div class="ley-actions-bar" id="leyHeaderActions"></div>
      </div>
    </div>
    <div class="ley-tabs" id="leyTabs"></div>
    <div class="ley-body" id="leyBody"><p style="text-align:center;padding:40px;color:var(--text-muted)">Cargando…</p></div>`;
  const welcome=document.getElementById("viewWelcome");
  if(welcome)welcome.parentNode.insertBefore(v,welcome);
  else document.querySelector(".main-content,.content-area,main")?.appendChild(v);
}

// ── Data Loading ────────────────────────────────────────────────────────────
async function loadData(){
  loading=true;
  try{
    const[iRes,dRes]=await Promise.all([
      sb.from("ley21369_items").select("*").order("sort_order",{ascending:true}),
      sb.from("ley21369_documentos").select("*").order("created_at",{ascending:false})
    ]);
    if(iRes.data)items=iRes.data;
    if(dRes.data)docs=dRes.data;
  }catch(e){console.error("[Ley21369] Error cargando datos:",e)}
  loading=false;
  render();
}

// ── CRUD Operations ─────────────────────────────────────────────────────────
async function addItem(area,requirement,description,responsible,dueDate){
  try{
    const user=await getUser(); if(!user)return;
    const{error}=await sb.from("ley21369_items").insert({
      user_id:user.id, area, requirement:requirement.trim(),
      description:description?.trim()||null, responsible:responsible?.trim()||null,
      due_date:dueDate||null, status:"pendiente",
      sort_order:items.filter(i=>i.area===area).length
    });
    if(error){showToast("Error al agregar requisito","error");return}
    showToast("Requisito agregado","success");
    loadData();
  }catch(e){console.warn("[Ley21369] Error al agregar requisito:",e);showToast("Error al agregar requisito","error");}
}

async function updateStatus(id,status){
  try{
    const update={status,updated_at:new Date().toISOString()};
    if(status==="cumplido")update.completed_at=new Date().toISOString();
    else update.completed_at=null;
    await sb.from("ley21369_items").update(update).eq("id",id);
    items=items.map(i=>i.id===id?{...i,...update}:i);
    render();
  }catch(e){console.warn("[Ley21369] Error al actualizar estado:",e);}
}

async function updateField(id,field,value){
  try{
    await sb.from("ley21369_items").update({[field]:value||null,updated_at:new Date().toISOString()}).eq("id",id);
    items=items.map(i=>i.id===id?{...i,[field]:value||null}:i);
  }catch(e){console.warn("[Ley21369] Error al actualizar campo:",e);}
}

async function deleteItem(id){
  if(!confirm("¿Eliminar este requisito y sus documentos?"))return;
  try{
    await sb.from("ley21369_documentos").delete().eq("item_id",id);
    await sb.from("ley21369_items").delete().eq("id",id);
    showToast("Requisito eliminado","success");
    loadData();
  }catch(e){console.warn("[Ley21369] Error al eliminar requisito:",e);showToast("Error al eliminar requisito","error");}
}

async function uploadDoc(itemId,file){
  try{
    const user=await getUser(); if(!user)return;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${user.id}/ley21369/${Date.now()}_${safe}`;
    const{error}=await sb.storage.from("case-documents").upload(path,file);
    if(error){showToast("Error al subir archivo","error");return}
    await sb.from("ley21369_documentos").insert({
      user_id:user.id,item_id:itemId,file_name:file.name,file_path:path,
      file_size:file.size,file_type:file.type,
      category:itemId?"verificador":"documento_general"
    });
    showToast("Documento subido","success");
    loadData();
  }catch(e){console.warn("[Ley21369] Error al subir documento:",e);showToast("Error al subir documento","error");}
}

async function downloadDoc(idOrObj){
  try{
    const doc=typeof idOrObj==="string"?docs.find(d=>d.id===idOrObj):idOrObj;
    if(!doc||!doc.file_path)return;
    const{data}=await sb.storage.from("case-documents").createSignedUrl(doc.file_path,300);
    if(data?.signedUrl)window.open(data.signedUrl,"_blank");
  }catch(e){console.warn("[Ley21369] Error al descargar documento:",e);}
}

async function deleteDoc(id,path){
  if(!confirm("¿Eliminar este documento?"))return;
  try{
    await sb.storage.from("case-documents").remove([path]);
    await sb.from("ley21369_documentos").delete().eq("id",id);
    showToast("Documento eliminado","success");
    loadData();
  }catch(e){console.warn("[Ley21369] Error al eliminar documento:",e);showToast("Error al eliminar documento","error");}
}

// ── Area Analysis ───────────────────────────────────────────────────────────
function analyzeAreas(){
  return AREAS.map(a=>{
    const ai=items.filter(i=>i.area===a.id);
    if(!ai.length)return null;
    const c=ai.filter(i=>i.status==="cumplido").length;
    const ep=ai.filter(i=>i.status==="en_proceso").length;
    const p=ai.filter(i=>i.status==="pendiente").length;
    const pct=Math.round(c/ai.length*100);
    const sinVerif=ai.filter(i=>i.status==="cumplido"&&!docs.some(d=>d.item_id===i.id)).length;
    let risk="ok";
    if(pct<30)risk="critical"; else if(pct<70)risk="warning";
    if(sinVerif>0&&risk==="ok")risk="warning";
    return{...a,items:ai,total:ai.length,cumplidos:c,enProceso:ep,pendientes:p,pct,sinVerif,risk};
  }).filter(Boolean);
}

function globalStats(){
  const total=items.length;
  const c=items.filter(i=>i.status==="cumplido").length;
  const ep=items.filter(i=>i.status==="en_proceso").length;
  const p=items.filter(i=>i.status==="pendiente").length;
  return{total,cumplidos:c,enProceso:ep,pendientes:p,pct:total?Math.round(c/total*100):0};
}

// ── Render Tabs ─────────────────────────────────────────────────────────────
const TABS=[
  {id:"dashboard",label:"📊 Semáforo"},
  {id:"kpi",label:"📈 KPI"},
  {id:"alerts",label:"🔔 Alertas"},
  {id:"checklist",label:"✅ Checklist"},
  {id:"items",label:"📋 Requisitos"},
  {id:"table",label:"📑 Tabla"},
  {id:"docs",label:"📁 Documentos"},
  {id:"chat",label:"💬 Chat IA"}
];

function renderTabs(){
  const el=document.getElementById("leyTabs");
  if(!el)return;
  el.innerHTML=TABS.map(t=>`<div class="ley-tab${activeTab===t.id?" active":""}" data-tab="${t.id}">${t.label}</div>`).join("");
  el.querySelectorAll(".ley-tab").forEach(tab=>{
    tab.onclick=()=>{activeTab=tab.dataset.tab;renderTabs();renderBody()};
  });
  /* Re-inject SES tab after render (mod-ses-directrices.js adds it dynamically) */
  if(typeof injectSesTab==="function")try{injectSesTab();}catch(e){}
}

function renderHeaderActions(){
  const el=document.getElementById("leyHeaderActions");
  if(!el)return;
  el.innerHTML=`
    <button class="ley-btn" onclick="window._ley21369.showAddModal()">➕ Agregar</button>
    <button class="ley-btn" onclick="window._ley21369.generateReport()" ${items.length===0||generatingReport?"disabled":""}>${generatingReport?"⏳ Generando…":"📝 Informe IA"}</button>
    <button class="ley-btn" onclick="window._ley21369.exportExcel()" ${items.length===0?"disabled":""}>📊 Excel SES</button>`;
}

// ── Render Body ─────────────────────────────────────────────────────────────
function renderBody(){
  const el=document.getElementById("leyBody");
  if(!el)return;
  if(loading){el.innerHTML='<p style="text-align:center;padding:40px;color:var(--text-muted)">Cargando datos…</p>';return}

  // AI Report banner
  let reportHTML="";
  if(aiReport){
    reportHTML=`<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="font-size:14px">✨ Informe IA de cumplimiento</strong>
        <div><button class="ley-btn ley-btn-sm" onclick="window._ley21369.copyReport()">📋 Copiar</button>
        <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.closeReport()">✕</button></div>
      </div>
      <div class="ley-report-box">${typeof md==="function"?md(aiReport):aiReport.replace(/\n/g,"<br>")}</div>
    </div>`;
  }

  const renderers={dashboard:renderDashboard,kpi:renderKPI,alerts:renderAlerts,checklist:renderChecklist,items:renderItems,table:renderTable,docs:renderDocs,chat:renderChat};
  el.innerHTML=reportHTML+(renderers[activeTab]||renderers.dashboard)();
}

// ── Tab: Dashboard (Semáforo) ───────────────────────────────────────────────
function renderDashboard(){
  const s=globalStats();
  const areas=analyzeAreas();
  let html=`<div class="ley-cards">
    <div class="ley-card" style="border-left:4px solid var(--accent)">
      <div class="num" style="color:var(--accent)">${s.pct}%</div>
      <div class="ley-progress"><div class="ley-progress-fill" style="width:${s.pct}%;background:var(--accent)"></div></div>
      <div class="lbl">Cumplimiento global</div></div>
    <div class="ley-card"><div class="num" style="color:#16a34a">${s.cumplidos}</div><div class="lbl">Cumplidos</div></div>
    <div class="ley-card"><div class="num" style="color:#3b82f6">${s.enProceso}</div><div class="lbl">En proceso</div></div>
    <div class="ley-card"><div class="num" style="color:#f59e0b">${s.pendientes}</div><div class="lbl">Pendientes</div></div>
  </div>
  <h3 style="font-size:15px;margin:16px 0 10px">Semáforo por área</h3>`;

  areas.forEach(a=>{
    html+=`<div class="ley-area-card risk-${a.risk}">
      <div class="ley-area-header" onclick="this.parentElement.querySelector('.ley-area-items')?.classList.toggle('collapsed')">
        <span class="title">${a.icon} ${h(a.label)} — <span style="color:${a.pct>=70?"#16a34a":a.pct>=30?"#f59e0b":"#ef4444"}">${a.pct}%</span></span>
        <span class="stats">
          <span style="color:#16a34a">✓${a.cumplidos}</span>
          <span style="color:#3b82f6">◉${a.enProceso}</span>
          <span style="color:#f59e0b">○${a.pendientes}</span>
          ${a.sinVerif?`<span style="color:#ef4444">⚠${a.sinVerif} sin verif.</span>`:""}
        </span>
      </div>
      <div class="ley-progress"><div class="ley-progress-fill" style="width:${a.pct}%;background:${a.pct>=70?"#16a34a":a.pct>=30?"#f59e0b":"#ef4444"}"></div></div>
      <div class="ley-area-items" style="margin-top:6px">
        ${a.items.map(i=>{
          const sc=STATUS_CFG[i.status]||STATUS_CFG.pendiente;
          const hasDocs=docs.some(d=>d.item_id===i.id);
          return`<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:12px;border-bottom:1px solid var(--border)">
            <span>${h(i.requirement)}${!hasDocs&&i.status==="cumplido"?' <span style="color:#ef4444;font-size:10px">⚠ sin verificador</span>':""}</span>
            <span class="ley-st ${sc.cls}">${sc.label}</span>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  });
  if(!areas.length)html+='<p style="color:var(--text-muted);text-align:center;padding:20px">Sin requisitos registrados.</p>';
  return html;
}

// ── Tab: KPI ────────────────────────────────────────────────────────────────
function renderKPI(){
  const s=globalStats();
  const areas=analyzeAreas();
  const withDocs=items.filter(i=>docs.some(d=>d.item_id===i.id)).length;
  const docCoverage=s.total?Math.round(withDocs/s.total*100):0;
  const criticalAreas=areas.filter(a=>a.risk==="critical").length;
  const avgPct=areas.length?Math.round(areas.reduce((a,b)=>a+b.pct,0)/areas.length):0;

  let html=`<div class="ley-cards">
    <div class="ley-card"><div class="num" style="color:var(--accent)">${s.pct}%</div><div class="lbl">Cumplimiento global</div></div>
    <div class="ley-card"><div class="num">${docCoverage}%</div><div class="lbl">Cobertura documental</div></div>
    <div class="ley-card"><div class="num" style="color:#ef4444">${criticalAreas}</div><div class="lbl">Áreas críticas</div></div>
    <div class="ley-card"><div class="num">${avgPct}%</div><div class="lbl">Promedio por área</div></div>
    <div class="ley-card"><div class="num">${docs.length}</div><div class="lbl">Total documentos</div></div>
    <div class="ley-card"><div class="num">${s.total}</div><div class="lbl">Total requisitos</div></div>
  </div>
  <h3 style="font-size:15px;margin:16px 0 10px">Cumplimiento por área</h3>`;

  areas.forEach(a=>{
    const barW=Math.max(a.pct,2);
    html+=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:12px">
      <span style="width:200px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${a.icon} ${h(a.label)}</span>
      <div style="flex:1;height:18px;background:var(--border);border-radius:4px;position:relative;overflow:hidden">
        <div style="height:100%;width:${barW}%;background:${a.pct>=70?"#16a34a":a.pct>=30?"#f59e0b":"#ef4444"};border-radius:4px;transition:.3s"></div>
        <span style="position:absolute;right:6px;top:1px;font-size:10px;font-weight:600">${a.pct}%</span>
      </div>
      <span style="width:50px;text-align:right;font-weight:600">${a.cumplidos}/${a.total}</span>
    </div>`;
  });

  // Status distribution
  html+=`<h3 style="font-size:15px;margin:20px 0 10px">Distribución de estados</h3>
  <div style="display:flex;gap:4px;height:24px;border-radius:6px;overflow:hidden">
    ${s.cumplidos?`<div style="flex:${s.cumplidos};background:#16a34a" title="Cumplidos: ${s.cumplidos}"></div>`:""}
    ${s.enProceso?`<div style="flex:${s.enProceso};background:#3b82f6" title="En proceso: ${s.enProceso}"></div>`:""}
    ${s.pendientes?`<div style="flex:${s.pendientes};background:#f59e0b" title="Pendientes: ${s.pendientes}"></div>`:""}
  </div>
  <div style="display:flex;gap:16px;margin-top:6px;font-size:11px;color:var(--text-muted)">
    <span>🟢 Cumplidos: ${s.cumplidos}</span><span>🔵 En proceso: ${s.enProceso}</span><span>🟡 Pendientes: ${s.pendientes}</span>
  </div>`;
  return html;
}

// ── Tab: Alerts ─────────────────────────────────────────────────────────────
function renderAlerts(){
  const now=new Date();
  const overdue=[], soon=[], noDate=[];
  items.filter(i=>i.status!=="cumplido"&&i.status!=="no_aplica").forEach(i=>{
    if(!i.due_date){noDate.push(i);return}
    const d=new Date(i.due_date);
    const diff=Math.ceil((d-now)/(1000*60*60*24));
    if(diff<0)overdue.push({...i,diff});
    else if(diff<=30)soon.push({...i,diff});
  });
  overdue.sort((a,b)=>a.diff-b.diff);
  soon.sort((a,b)=>a.diff-b.diff);

  let html="";
  if(overdue.length){
    html+=`<h3 style="font-size:14px;color:#dc2626;margin-bottom:8px">🚨 Vencidos (${overdue.length})</h3>`;
    overdue.forEach(i=>{
      html+=`<div class="ley-alert-card ley-alert-overdue">
        <strong>${h(i.requirement)}</strong><br>
        <span>Área: ${AREAS.find(a=>a.id===i.area)?.label||i.area} · Vencido hace ${Math.abs(i.diff)} días · ${h(i.responsible||"Sin responsable")}</span>
      </div>`;
    });
  }
  if(soon.length){
    html+=`<h3 style="font-size:14px;color:#f59e0b;margin:16px 0 8px">⚠️ Próximos a vencer (${soon.length})</h3>`;
    soon.forEach(i=>{
      html+=`<div class="ley-alert-card ley-alert-soon">
        <strong>${h(i.requirement)}</strong><br>
        <span>Área: ${AREAS.find(a=>a.id===i.area)?.label||i.area} · Vence en ${i.diff} días · ${h(i.responsible||"Sin responsable")}</span>
      </div>`;
    });
  }
  if(noDate.length){
    html+=`<h3 style="font-size:14px;color:var(--text-muted);margin:16px 0 8px">📅 Sin fecha límite (${noDate.length})</h3>`;
    noDate.forEach(i=>{
      html+=`<div class="ley-alert-card" style="border:1px solid var(--border)">
        ${h(i.requirement)} <span style="color:var(--text-muted)">· ${AREAS.find(a=>a.id===i.area)?.label||i.area}</span>
      </div>`;
    });
  }
  if(!overdue.length&&!soon.length&&!noDate.length)
    html='<p style="text-align:center;padding:30px;color:var(--text-muted)">✅ No hay alertas activas</p>';
  return html;
}

// ── Tab: Checklist ──────────────────────────────────────────────────────────
function renderChecklist(){
  let html=`<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Marque los requisitos cumplidos. Los cambios se guardan automáticamente.</p>`;
  AREAS.forEach(a=>{
    const ai=items.filter(i=>i.area===a.id);
    if(!ai.length)return;
    const c=ai.filter(i=>i.status==="cumplido").length;
    html+=`<div style="margin-bottom:16px">
      <h4 style="font-size:13px;margin-bottom:6px">${a.icon} ${h(a.label)} <span style="color:var(--text-muted);font-weight:400">(${c}/${ai.length})</span></h4>`;
    ai.forEach(i=>{
      html+=`<div class="ley-checklist-item">
        <input type="checkbox" ${i.status==="cumplido"?"checked":""}
          onchange="window._ley21369.updateStatus('${i.id}',this.checked?'cumplido':'pendiente')">
        <span style="font-size:12px;flex:1;${i.status==="cumplido"?"text-decoration:line-through;color:var(--text-muted)":""}">${h(i.requirement)}</span>
        ${i.responsible?`<span style="font-size:10px;color:var(--text-muted)">👤 ${h(i.responsible)}</span>`:""}
      </div>`;
    });
    html+=`</div>`;
  });
  return html;
}

// ── Tab: Items (by area, expandable) ────────────────────────────────────────
function renderItems(){
  let html="";
  AREAS.forEach(a=>{
    const ai=items.filter(i=>i.area===a.id);
    const c=ai.filter(i=>i.status==="cumplido").length;
    html+=`<div class="ley-area-card" style="border-left:3px solid ${c===ai.length&&ai.length?"#16a34a":"var(--border)"}">
      <div class="ley-area-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
        <span class="title">${a.icon} ${h(a.label)} (${ai.length})</span>
        <span style="font-size:12px;color:var(--text-muted)">${c}/${ai.length} cumplidos</span>
      </div>
      <div>`;
    ai.forEach(i=>{
      const sc=STATUS_CFG[i.status]||STATUS_CFG.pendiente;
      const iDocs=docs.filter(d=>d.item_id===i.id);
      html+=`<div class="ley-item">
        <div class="ley-item-row">
          <div class="req"><strong>${h(i.requirement)}</strong>
            ${i.description?`<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${h(i.description)}</div>`:""}
            <div class="meta">
              ${i.responsible?`<span>👤 ${h(i.responsible)}</span>`:""}
              ${i.due_date?`<span>📅 ${i.due_date}</span>`:""}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            <select class="ley-select" onchange="window._ley21369.updateStatus('${i.id}',this.value)">
              ${Object.entries(STATUS_CFG).map(([k,v])=>`<option value="${k}"${i.status===k?" selected":""}>${v.label}</option>`).join("")}
            </select>
            <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteItem('${i.id}')" title="Eliminar">🗑</button>
          </div>
        </div>
        <textarea class="ley-textarea" rows="2" placeholder="Notas de verificación…"
          style="margin-top:6px" onfocusout="window._ley21369.updateField('${i.id}','verification_notes',this.value)">${h(i.verification_notes||"")}</textarea>
        <div class="ley-docs-row">
          ${iDocs.map(d=>`<span class="ley-doc-badge" onclick="window._ley21369.downloadDoc('${d.id}')">📄 ${h(d.file_name)} <button onclick="event.stopPropagation();window._ley21369.deleteDoc('${d.id}','${h(d.file_path)}')" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:10px">✕</button></span>`).join("")}
          <label class="ley-doc-badge" style="cursor:pointer">📎 Verificador <input type="file" style="display:none" onchange="if(this.files[0])window._ley21369.uploadDoc('${i.id}',this.files[0]);this.value=''"></label>
        </div>
      </div>`;
    });
    if(!ai.length)html+=`<p style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px">Sin requisitos en esta área</p>`;
    html+=`<button class="ley-btn ley-btn-sm" style="width:100%;margin-top:4px" onclick="window._ley21369.showAddModal('${a.id}')">➕ Agregar requisito</button>`;
    html+=`</div></div>`;
  });
  return html;
}

// ── Tab: Table ──────────────────────────────────────────────────────────────
function renderTable(){
  let html=`<div style="overflow-x:auto"><table class="ley-table"><thead><tr>
    <th>Área</th><th>Requisito</th><th>Estado</th><th>Responsable</th><th>Fecha</th><th>Verif.</th><th>Acc.</th>
  </tr></thead><tbody>`;
  items.forEach(i=>{
    const a=AREAS.find(x=>x.id===i.area);
    const dc=docs.filter(d=>d.item_id===i.id).length;
    const sc=STATUS_CFG[i.status]||STATUS_CFG.pendiente;
    html+=`<tr>
      <td>${a?.icon||""} ${h(a?.label||i.area)}</td>
      <td style="max-width:250px">${h(i.requirement)}</td>
      <td><select class="ley-select" onchange="window._ley21369.updateStatus('${i.id}',this.value)">
        ${Object.entries(STATUS_CFG).map(([k,v])=>`<option value="${k}"${i.status===k?" selected":""}>${v.label}</option>`).join("")}
      </select></td>
      <td><input class="ley-input" style="width:100px" value="${h(i.responsible||"")}" onfocusout="window._ley21369.updateField('${i.id}','responsible',this.value)"></td>
      <td><input class="ley-input" type="date" style="width:120px" value="${i.due_date||""}" onfocusout="window._ley21369.updateField('${i.id}','due_date',this.value)"></td>
      <td style="text-align:center">${dc} <label style="cursor:pointer">📎<input type="file" style="display:none" onchange="if(this.files[0])window._ley21369.uploadDoc('${i.id}',this.files[0]);this.value=''"></label></td>
      <td><button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteItem('${i.id}')">🗑</button></td>
    </tr>`;
  });
  if(!items.length)html+=`<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted)">Sin requisitos registrados</td></tr>`;
  html+=`</tbody></table></div>`;
  return html;
}

// ── Tab: Documents ──────────────────────────────────────────────────────────
function renderDocs(){
  const general=docs.filter(d=>!d.item_id);
  const byItem=docs.filter(d=>d.item_id);
  let html=`<div style="margin-bottom:16px">
    <h3 style="font-size:14px;margin-bottom:8px">Documentos generales</h3>
    <label class="ley-btn" style="display:inline-block;margin-bottom:10px;cursor:pointer">📤 Subir documento
      <input type="file" style="display:none" onchange="if(this.files[0])window._ley21369.uploadDoc(null,this.files[0]);this.value=''">
    </label>`;
  general.forEach(d=>{
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
      <div><span style="font-size:13px;font-weight:500">📄 ${h(d.file_name)}</span><br>
      <span style="font-size:11px;color:var(--text-muted)">${fmtSize(d.file_size)} · ${fmtDate(d.created_at)}</span></div>
      <div style="display:flex;gap:4px">
        <button class="ley-btn ley-btn-sm" onclick="window._ley21369.downloadDoc('${d.id}')">⬇</button>
        <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteDoc('${d.id}','${h(d.file_path)}')">🗑</button>
      </div>
    </div>`;
  });
  if(!general.length)html+=`<p style="font-size:12px;color:var(--text-muted)">Sin documentos generales</p>`;
  html+=`</div>`;

  html+=`<h3 style="font-size:14px;margin-bottom:8px">Verificadores por requisito (${byItem.length})</h3>`;
  byItem.forEach(d=>{
    const item=items.find(i=>i.id===d.item_id);
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px">
      <div>📄 <strong>${h(d.file_name)}</strong> <span style="color:var(--text-muted)">→ ${h(item?.requirement||"(requisito eliminado)")}</span></div>
      <button class="ley-btn ley-btn-sm" onclick="window._ley21369.downloadDoc('${d.id}')">⬇</button>
    </div>`;
  });
  return html;
}

// ── Tab: Chat IA ────────────────────────────────────────────────────────────
function renderChat(){
  const msgs=chatMessages.map(m=>`<div class="ley-chat-msg ${m.role}"><div class="bubble">${m.role==="assistant"&&typeof md==="function"?md(m.content):h(m.content)}</div></div>`).join("");
  return`<div class="ley-chat-container">
    <div class="ley-chat-msgs" id="leyChatMsgs">${msgs||'<p style="text-align:center;padding:20px;color:var(--text-muted)">Consulta sobre la Ley 21.369 y tu estado de cumplimiento</p>'}</div>
    <div class="ley-chat-input">
      <input class="ley-input" id="leyChatInput" placeholder="Pregunta sobre Ley 21.369…" onkeydown="if(event.key==='Enter')window._ley21369.sendChat()">
      <button class="ley-btn ley-btn-primary" onclick="window._ley21369.sendChat()" ${chatLoading?"disabled":""}>
        ${chatLoading?"⏳":"📤"} Enviar</button>
    </div>
  </div>`;
}

async function sendChat(){
  const input=document.getElementById("leyChatInput");
  if(!input||!input.value.trim()||chatLoading)return;
  const msg=input.value.trim();
  chatMessages.push({role:"user",content:msg});
  input.value="";
  chatLoading=true;
  renderBody();

  try{
    const s=globalStats();
    const context=`Estado cumplimiento Ley 21.369:\n- Total requisitos: ${s.total}\n- Cumplidos: ${s.cumplidos} (${s.pct}%)\n- En proceso: ${s.enProceso}\n- Pendientes: ${s.pendientes}\n\nÁreas:\n${analyzeAreas().map(a=>`${a.label}: ${a.pct}% (${a.cumplidos}/${a.total})`).join("\n")}`;

    const body={
      messages:[
        {role:"system",content:`Eres un experto en la Ley 21.369 de Chile (acoso sexual, violencia y discriminación de género en educación superior). Responde en español, de forma clara y profesional. Contexto actual:\n${context}`},
        ...chatMessages.map(m=>({role:m.role,content:m.content}))
      ]
    };

    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const res=await fetch(CHAT_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
        signal:_ctrl.signal
      });
      const data=await res.json();
      const reply=data.reply||data.choices?.[0]?.message?.content||"Sin respuesta";
      chatMessages.push({role:"assistant",content:reply});
    }finally{
      clearTimeout(_tout);
    }
  }catch(e){
    chatMessages.push({role:"assistant",content:"Error: "+e.message});
  }
  chatLoading=false;
  renderBody();
  setTimeout(()=>{
    const el=document.getElementById("leyChatMsgs");
    if(el)el.scrollTop=el.scrollHeight;
  },50);
}

// ── AI Report ───────────────────────────────────────────────────────────────
async function generateReport(){
  if(!items.length){showToast("No hay requisitos","warning");return}
  generatingReport=true;
  renderHeaderActions();

  try{
    const s=globalStats();
    const areasDetail=analyzeAreas().map(a=>{
      const details=a.items.map(i=>{
        const dc=docs.filter(d=>d.item_id===i.id).length;
        return`- ${i.requirement} [${i.status}]${i.responsible?` (Resp: ${i.responsible})`:""}${dc?` [${dc} verif.]`:" [SIN VERIF.]"}`;
      }).join("\n");
      return`## ${a.label} — ${a.pct}% (${a.cumplidos}/${a.total})\n${details}`;
    }).join("\n\n");

    const body={
      messages:[
        {role:"system",content:`Genera un INFORME DE CUMPLIMIENTO formal de la Ley 21.369 para la Superintendencia de Educación Superior. Incluye: resumen ejecutivo, análisis por área, brechas, recomendaciones priorizadas, cronograma sugerido. Lenguaje formal institucional.`},
        {role:"user",content:`Datos:\n- Total requisitos: ${s.total}, Cumplidos: ${s.cumplidos} (${s.pct}%), En proceso: ${s.enProceso}, Pendientes: ${s.pendientes}\n- Documentos verificadores: ${docs.length}\n\nDETALLE:\n${areasDetail}\n\nFecha: ${new Date().toLocaleDateString("es-CL",{year:"numeric",month:"long",day:"numeric"})}`}
      ]
    };

    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const res=await fetch(CHAT_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body),
        signal:_ctrl.signal
      });
      const data=await res.json();
      aiReport=data.reply||data.choices?.[0]?.message?.content||"Error al generar";
      showToast("Informe generado con IA","success");
    }finally{
      clearTimeout(_tout);
    }
  }catch(e){
    showToast("Error: "+e.message,"error");
  }
  generatingReport=false;
  renderHeaderActions();
  renderBody();
}

// ── Excel Export ─────────────────────────────────────────────────────────────
function exportExcel(){
  const s=globalStats();
  let csv="Área,Requisito,Estado,Responsable,Fecha Límite,Notas Verificación,N° Verificadores\n";
  items.forEach(i=>{
    const a=AREAS.find(x=>x.id===i.area);
    const dc=docs.filter(d=>d.item_id===i.id).length;
    const row=[a?.label||i.area,i.requirement,STATUS_CFG[i.status]?.label||i.status,i.responsible||"",i.due_date||"",i.verification_notes||"",dc];
    csv+=row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")+"\n";
  });

  // Add summary
  csv+="\n\nRESUMEN\n";
  csv+=`Total,${s.total}\nCumplidos,${s.cumplidos}\nEn proceso,${s.enProceso}\nPendientes,${s.pendientes}\nCumplimiento,${s.pct}%\n`;

  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`Cumplimiento_Ley21369_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Archivo exportado","success");
}

// ── Add Modal ───────────────────────────────────────────────────────────────
function showAddModal(preArea){
  const overlay=document.createElement("div");
  overlay.className="ley-modal-overlay";
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  overlay.innerHTML=`<div class="ley-modal">
    <h3>Nuevo requisito de cumplimiento</h3>
    <div class="ley-form-group"><label>Área</label>
      <select class="ley-select" id="leyAddArea" style="width:100%">
        ${AREAS.map(a=>`<option value="${a.id}"${preArea===a.id?" selected":""}>${a.icon} ${a.label}</option>`).join("")}
      </select></div>
    <div class="ley-form-group"><label>Requisito *</label>
      <input class="ley-input" id="leyAddReq" placeholder="Ej: Protocolo de actuación aprobado"></div>
    <div class="ley-form-group"><label>Descripción</label>
      <textarea class="ley-textarea" id="leyAddDesc" rows="2"></textarea></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="ley-form-group"><label>Responsable</label><input class="ley-input" id="leyAddResp"></div>
      <div class="ley-form-group"><label>Fecha límite</label><input class="ley-input" type="date" id="leyAddDate"></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="ley-btn" style="flex:1" onclick="this.closest('.ley-modal-overlay').remove()">Cancelar</button>
      <button class="ley-btn ley-btn-primary" style="flex:1" id="leyAddSave">Guardar</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#leyAddSave").onclick=async()=>{
    const req=overlay.querySelector("#leyAddReq").value;
    if(!req.trim()){showToast("El requisito es obligatorio","warning");return}
    await addItem(
      overlay.querySelector("#leyAddArea").value,
      req,
      overlay.querySelector("#leyAddDesc").value,
      overlay.querySelector("#leyAddResp").value,
      overlay.querySelector("#leyAddDate").value
    );
    overlay.remove();
  };
  overlay.querySelector("#leyAddReq").focus();
}

// ── Main Render ─────────────────────────────────────────────────────────────
function render(){
  renderTabs();
  renderHeaderActions();
  renderBody();
}

// ── Public API ──────────────────────────────────────────────────────────────
window._ley21369={
  updateStatus,updateField,deleteItem,uploadDoc,downloadDoc,
  deleteDoc,sendChat,generateReport,exportExcel,showAddModal,
  copyReport:()=>{if(aiReport){navigator.clipboard.writeText(aiReport);showToast("Copiado al portapapeles","success")}},
  closeReport:()=>{aiReport=null;renderBody()}
};

window.openLey21369=function(){
  ensureView();
  if(typeof showView==="function")showView("viewLey21369");
  if(!items.length)loadData(); else render();
};

// ── Auto-init ───────────────────────────────────────────────────────────────
console.log("%c🛡️ Módulo Ley 21.369 cargado — Fiscalito","color:#7c3aed;font-weight:bold");
})();
