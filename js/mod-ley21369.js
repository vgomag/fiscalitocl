// ============================================================================
// MÓDULO LEY 21.369 — FISCALITO (Reforma SES 2026) — Versión simplificada
// Respuesta a Fiscalización SES: cumplimiento, semáforo, evidencias, plan mejora
// 4 pestañas: Semáforo · Respuesta SES · Documentos · Chat IA
// ============================================================================
(function(){
"use strict";

// ── Fallback para CHAT_ENDPOINT ────────────────────────────────────────────
const _CHAT_EP = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';

// ── Secciones SES ──────────────────────────────────────────────────────────
const SECCIONES=[
  {id:"politica_integral",num:1,label:"Política Integral (Art. 4 Ley 21.369)",icon:"📋",
   objetivo:"Verificar existencia, contenido mínimo, participación, difusión y unidades responsables.",
   campos_extra:["responsable_seguimiento"]},
  {id:"modelo_prevencion",num:2,label:"Modelo de Prevención",icon:"🛡️",
   objetivo:"Verificar diagnóstico, medidas evaluables, campañas, capacitación, currículo e inducción.",
   campos_extra:["brechas_identificadas","plan_mejora_breve"]},
  {id:"investigacion_sancion",num:3,label:"Modelo de Investigación y Sanción",icon:"🔍",
   objetivo:"Verificar debido proceso, órganos especializados, tipificación, medidas de protección, reserva, eficacia y acceso al expediente.",
   campos_extra:["riesgos_criticos","acciones_correctivas"]},
  {id:"adecuacion_contratos",num:4,label:"Adecuación de Contratos y Convenios",icon:"📄",
   objetivo:"Verificar incorporación obligatoria de la normativa interna en instrumentos celebrados.",
   campos_extra:["plan_regularizacion"]}
];

// ── Estados SES ────────────────────────────────────────────────────────────
const STATUS_CFG={
  cumple:      {label:"Cumple",     cls:"ley-st-ok",   color:"#16a34a", icon:"✅"},
  parcial:     {label:"Parcial",    cls:"ley-st-parc", color:"#f59e0b", icon:"⚠️"},
  no_cumple:   {label:"No cumple",  cls:"ley-st-nc",   color:"#ef4444", icon:"❌"},
  sin_evaluar: {label:"Sin evaluar",cls:"ley-st-se",   color:"#9ca3af", icon:"⬜"}
};

// ── Ítems pre-poblados del documento SES ───────────────────────────────────
const ITEMS_SES=[
  // Sección 1: Política Integral (8 ítems)
  {seccion:"politica_integral",orden:1,estado:"cumple",item_exigido:"Acciones de prevención, información, sensibilización, sanción, capacitación y formación",evidencia_ref:"Política Integral (Dec. 029/SU/2022); Protocolo (Dec. 030/SU/2022)",observacion_default:"Mantener plan anual de actividades"},
  {seccion:"politica_integral",orden:2,estado:"cumple",item_exigido:"Mecanismos de monitoreo y evaluación de impacto",evidencia_ref:"Política de Igualdad (Dec. 005/SU/2023); informes de seguimiento",observacion_default:"Formalizar indicadores y periodicidad"},
  {seccion:"politica_integral",orden:3,estado:"cumple",item_exigido:"Estrategia de comunicación interna",evidencia_ref:"Publicación web; inducciones; campañas",observacion_default:"Reforzar difusión a contratistas"},
  {seccion:"politica_integral",orden:4,estado:"cumple",item_exigido:"Procedimiento participativo (paridad/representación)",evidencia_ref:"Actas de claustro; procesos participativos",observacion_default:"Sistematizar actas 2024–2025"},
  {seccion:"politica_integral",orden:5,estado:"cumple",item_exigido:"Unidades con personal capacitado (implementación)",evidencia_ref:"UPA (Dec. T/R N°19/2018)",observacion_default:"Mantener formación continua"},
  {seccion:"politica_integral",orden:6,estado:"cumple",item_exigido:"Órgano de investigación y sanción",evidencia_ref:"Fiscalía de Género (Dec. T/R N°78/2022)",observacion_default:"Actualizar dotación si aumenta demanda"},
  {seccion:"politica_integral",orden:7,estado:"cumple",item_exigido:"Apoyo psicológico, médico, social y jurídico",evidencia_ref:"UPA; derivaciones a redes externas",observacion_default:"Formalizar convenios de derivación"},
  {seccion:"politica_integral",orden:8,estado:"cumple",item_exigido:"Entrevistas videograbadas (priorización)",evidencia_ref:"Protocolo interno; actas de diligencias",observacion_default:"Asegurar resguardo de datos"},

  // Sección 2: Modelo de Prevención (6 ítems)
  {seccion:"modelo_prevencion",orden:1,estado:"cumple",item_exigido:"Diagnóstico actualizado de riesgos",evidencia_ref:"Diagnóstico con perspectiva de género (junio 2025)",observacion_default:"Programar actualización 2027"},
  {seccion:"modelo_prevencion",orden:2,estado:"cumple",item_exigido:"Medidas evaluables según diagnóstico",evidencia_ref:"Plan de acción; metas/indicadores",observacion_default:"Formalizar tablero de control"},
  {seccion:"modelo_prevencion",orden:3,estado:"cumple",item_exigido:"Campañas permanentes de sensibilización",evidencia_ref:"Charlas; claustros 2021–2022",observacion_default:"Actualizar reporte 2025–2026 (UPA)"},
  {seccion:"modelo_prevencion",orden:4,estado:"cumple",item_exigido:"Programas permanentes de capacitación",evidencia_ref:"Programas virtuales Dirección de Género",observacion_default:"Consolidar malla y registros"},
  {seccion:"modelo_prevencion",orden:5,estado:"cumple",item_exigido:"Contenidos en planes curriculares",evidencia_ref:"Crédito Cultural; mallas TS y Derecho",observacion_default:"Extender a otras carreras"},
  {seccion:"modelo_prevencion",orden:6,estado:"cumple",item_exigido:"Inducciones con enfoque de género",evidencia_ref:"Programas de inducción institucional",observacion_default:"Incorporar a contratistas"},

  // Sección 3: Investigación y Sanción (8 ítems)
  {seccion:"investigacion_sancion",orden:1,estado:"cumple",item_exigido:"Procedimientos especiales con debido proceso",evidencia_ref:"Protocolo (Dec. 030/SU/2022)",observacion_default:"Revisar plazos máximos"},
  {seccion:"investigacion_sancion",orden:2,estado:"cumple",item_exigido:"Órganos especializados",evidencia_ref:"Fiscalía de Género",observacion_default:"Fortalecer dotación"},
  {seccion:"investigacion_sancion",orden:3,estado:"cumple",item_exigido:"Tipificación + sanciones + agravantes/atenuantes",evidencia_ref:"Protocolo interno",observacion_default:"Difundir extracto pedagógico"},
  {seccion:"investigacion_sancion",orden:4,estado:"cumple",item_exigido:"Medidas de protección durante investigación",evidencia_ref:"Protocolo; resoluciones",observacion_default:"Estandarizar check de riesgo"},
  {seccion:"investigacion_sancion",orden:5,estado:"cumple",item_exigido:"Reserva compatible con transparencia",evidencia_ref:"Cláusulas de reserva; prácticas",observacion_default:"Capacitar en acceso a info"},
  {seccion:"investigacion_sancion",orden:6,estado:"cumple",item_exigido:"Medidas de eficacia procesal",evidencia_ref:"Instructivos internos",observacion_default:"Implementar control de plazos"},
  {seccion:"investigacion_sancion",orden:7,estado:"cumple",item_exigido:"Difusión del modelo a la comunidad",evidencia_ref:"Web; inducciones",observacion_default:"Campaña anual"},
  {seccion:"investigacion_sancion",orden:8,estado:"cumple",item_exigido:"Acceso al expediente y derecho a descargos",evidencia_ref:"Protocolos; actas de notificación",observacion_default:"Checklist de notificaciones"},

  // Sección 4: Adecuación de Contratos (4 ítems)
  {seccion:"adecuacion_contratos",orden:1,estado:"cumple",item_exigido:"Cláusula de incorporación de Política y Protocolo en contratos",evidencia_ref:"Modelos contractuales; Dec. 029/2022 y 030/2022",observacion_default:"Auditar contratos 2024–2026"},
  {seccion:"adecuacion_contratos",orden:2,estado:"cumple",item_exigido:"Aplicación a convenios académicos/investigación",evidencia_ref:"Modelos de convenio",observacion_default:"Checklist en Secretaría General"},
  {seccion:"adecuacion_contratos",orden:3,estado:"cumple",item_exigido:"Aplicación a actividades de esparcimiento/recreación",evidencia_ref:"Bases/contratos",observacion_default:"Incluir cláusula tipo"},
  {seccion:"adecuacion_contratos",orden:4,estado:"cumple",item_exigido:"Canal de denuncia habilitado para terceros",evidencia_ref:"UPA; derivación a Rectoría",observacion_default:"Difusión"}
];

// ── Evidencias SES (Sección 5) ─────────────────────────────────────────────
const EVIDENCIAS_SES=[
  {id:"ev1",label:"Decreto N° 029/SU/2022 (Política Integral)",seccion_rel:"politica_integral"},
  {id:"ev2",label:"Decreto N° 030/SU/2022 (Protocolo)",seccion_rel:"politica_integral"},
  {id:"ev3",label:"Decreto N° 005/SU/2023 (Política de Igualdad)",seccion_rel:"politica_integral"},
  {id:"ev4",label:"Decreto T/R N° 19/2018 (UPA)",seccion_rel:"politica_integral"},
  {id:"ev5",label:"Decreto T/R N° 78/2022 (Fiscalía de Género)",seccion_rel:"investigacion_sancion"},
  {id:"ev6",label:"Diagnóstico con perspectiva de género (junio 2025)",seccion_rel:"modelo_prevencion"},
  {id:"ev7",label:"Registros de capacitaciones/campañas",seccion_rel:"modelo_prevencion"},
  {id:"ev8",label:"Modelos de contratos con cláusula Ley 21.369",seccion_rel:"adecuacion_contratos"},
  {id:"ev9",label:"Instructivos internos (plazos, reserva, acceso expediente)",seccion_rel:"investigacion_sancion"}
];

// ── Plan de Mejora por defecto (Sección 7) ─────────────────────────────────
const PLAN_MEJORA_DEFAULT=[
  {brecha:"Sistematizar monitoreo",accion:"Tablero KPI trimestral",responsable:"Dirección de Género",plazo:"Q3 2026",indicador:"KPI publicado"},
  {brecha:"Control de plazos",accion:"Instructivo + semáforo",responsable:"Fiscalía de Género",plazo:"Q2 2026",indicador:"% causas en plazo"},
  {brecha:"Difusión a funcionarios/as",accion:"Módulo de inducción",responsable:"RR.HH.",plazo:"Q3 2026",indicador:"% funcionarios capacitados"}
];

// ── State ───────────────────────────────────────────────────────────────────
let items=[], docs=[], evidencias={}, planMejora=[], conclusion={};
let seccionMeta={};
let loading=false, activeTab="dashboard";
let seccionesAbiertas={};
let chatMessages=[], chatLoading=false;
let aiReport=null, generatingReport=false;
let classifyingDoc=null; // {file, fileName, filePath, fileSize, fileType, extractedText, suggestedItems:[], uploading:false}

// ── Helpers ─────────────────────────────────────────────────────────────────
const h=t=>(t||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtDate=d=>d?new Date(d).toLocaleDateString("es-CL"):"";
const fmtSize=b=>b?(b/1024).toFixed(0)+" KB":"";
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
.ley-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px}
.ley-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}
.ley-card .num{font-size:28px;font-weight:700;line-height:1.1}
.ley-card .lbl{font-size:11px;color:var(--text-muted);margin-top:4px}
.ley-progress{height:6px;border-radius:3px;background:var(--border);overflow:hidden;margin:6px 0}
.ley-progress-fill{height:100%;border-radius:3px;transition:width .4s}
.ley-section-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px}
.ley-section-card.risk-ok{border-left:4px solid #16a34a}
.ley-section-card.risk-warning{border-left:4px solid #f59e0b}
.ley-section-card.risk-critical{border-left:4px solid #ef4444}
.ley-section-header{display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none}
.ley-section-header .title{font-weight:600;font-size:14px}
.ley-section-header .stats{display:flex;gap:8px;font-size:11px}
.ley-section-header .chevron{transition:transform .25s ease;font-size:12px;margin-left:8px;color:var(--text-muted)}
.ley-section-header .chevron.open{transform:rotate(90deg)}
.ley-section-items{max-height:0;overflow:hidden;transition:max-height .3s ease;margin-top:0}
.ley-section-items.open{max-height:2000px;margin-top:10px}
.ley-section-item-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px}
.ley-section-item-row:last-child{border-bottom:none}
.ley-section-item-row .item-status{flex-shrink:0;width:20px;text-align:center}
.ley-section-item-row .item-text{flex:1;line-height:1.4}
.ley-st{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600}
.ley-st-ok{background:#dcfce7;color:#166534}
.ley-st-parc{background:#fef3c7;color:#92400e}
.ley-st-nc{background:#fee2e2;color:#991b1b}
.ley-st-se{background:#f1f5f9;color:#64748b}
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
.ley-modal{background:var(--surface,#fff);border-radius:12px;padding:20px;width:90%;max-width:560px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.ley-modal h3{margin:0 0 12px;font-size:16px}
.ley-form-group{margin-bottom:10px}
.ley-form-group label{display:block;font-size:12px;font-weight:600;margin-bottom:3px}
.ley-actions-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ley-report-box{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;max-height:60vh;overflow-y:auto}
.ley-classify-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1001;display:flex;align-items:center;justify-content:center}
.ley-classify-modal{background:var(--surface,#fff);border-radius:14px;padding:24px;width:95%;max-width:640px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.ley-classify-modal h3{margin:0 0 6px;font-size:17px}
.ley-classify-modal .subtitle{font-size:12px;color:var(--text-muted);margin-bottom:16px}
.ley-classify-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:.15s}
.ley-classify-item:hover{background:var(--hover)}
.ley-classify-item.suggested{border-color:var(--accent);background:rgba(79,70,229,.04)}
.ley-classify-item input[type=checkbox]{margin-top:2px;flex-shrink:0}
.ley-classify-item .item-info{flex:1;font-size:12px;line-height:1.4}
.ley-classify-item .item-info .sec-label{font-size:10px;color:var(--text-muted);font-weight:600}
.ley-classify-item .ai-badge{font-size:9px;padding:1px 6px;border-radius:8px;background:#ede9fe;color:#6d28d9;font-weight:600;white-space:nowrap}
.ley-upload-zone{border:2px dashed var(--border);border-radius:12px;padding:24px;text-align:center;cursor:pointer;transition:.2s}
.ley-upload-zone:hover,.ley-upload-zone.dragover{border-color:var(--accent);background:rgba(79,70,229,.03)}
.ley-upload-zone.processing{border-color:#f59e0b;background:#fffbeb}
.ley-ev-check{display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px}
.ley-ev-check.ev-ok{border-left:3px solid #16a34a;background:#f0fdf4}
.ley-ev-check.ev-pending{border-left:3px solid #f59e0b;background:#fffbeb}
.ley-plan-row{display:grid;grid-template-columns:1fr 1fr 120px 80px 120px 40px;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px}
.ley-obj-box{background:var(--bg,#f8fafc);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:var(--text-muted)}
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
        <div><h2>🛡️ Respuesta a Fiscalización SES — Ley 21.369</h2>
        <p>Universidad de Magallanes · Implementación Ley N° 21.369 — Acoso sexual, violencia y discriminación de género</p></div>
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
    const[iRes,dRes,mRes]=await Promise.all([
      sb.from("ley21369_items").select("*").order("sort_order",{ascending:true}),
      sb.from("ley21369_documentos").select("*").order("created_at",{ascending:false}),
      sb.from("ley21369_meta").select("*")
    ]);
    if(iRes.data) items=iRes.data;
    if(dRes.data) docs=dRes.data;
    if(mRes.data){
      mRes.data.forEach(m=>{
        if(m.key==="evidencias") evidencias=JSON.parse(m.value||"{}");
        else if(m.key==="plan_mejora") planMejora=JSON.parse(m.value||"[]");
        else if(m.key==="conclusion") conclusion=JSON.parse(m.value||"{}");
        else if(m.key?.startsWith("seccion_")) seccionMeta[m.key.replace("seccion_","")]=JSON.parse(m.value||"{}");
      });
    }
    if(!planMejora.length) planMejora=[...PLAN_MEJORA_DEFAULT];
    if(!items.length) await seedFromTemplate();
  }catch(e){
    console.error("[Ley21369] Error cargando datos:",e);
    if(!items.length) await seedFromTemplate().catch(()=>{});
  }
  loading=false;
  render();
}

// ── Seed: pre-poblar ítems desde template SES ──────────────────────────────
async function seedFromTemplate(){
  try{
    const user=await getUser();
    if(!user) return;
    const rows=ITEMS_SES.map(it=>({
      user_id:user.id, area:it.seccion, requirement:it.item_exigido,
      description:it.evidencia_ref, verification_notes:it.observacion_default,
      status:it.estado||"sin_evaluar", sort_order:it.orden,
      responsible:null, due_date:null
    }));
    const{data,error}=await sb.from("ley21369_items").insert(rows).select();
    if(data) items=data;
    if(error) console.warn("[Ley21369] Error seeding:",error);
  }catch(e){console.warn("[Ley21369] Seed error:",e)}
}

// ── CRUD Operations ─────────────────────────────────────────────────────────
async function updateStatus(id,status){
  try{
    const update={status,updated_at:new Date().toISOString()};
    update.completed_at=status==="cumple"?new Date().toISOString():null;
    await sb.from("ley21369_items").update(update).eq("id",id);
    items=items.map(i=>i.id===id?{...i,...update}:i);
    render();
  }catch(e){console.warn("[Ley21369] updateStatus error:",e)}
}

async function updateField(id,field,value){
  try{
    await sb.from("ley21369_items").update({[field]:value||null,updated_at:new Date().toISOString()}).eq("id",id);
    items=items.map(i=>i.id===id?{...i,[field]:value||null}:i);
  }catch(e){console.warn("[Ley21369] updateField error:",e)}
}

async function deleteItem(id){
  if(!confirm("¿Eliminar este ítem y sus documentos?"))return;
  try{
    await sb.from("ley21369_documentos").delete().eq("item_id",id);
    await sb.from("ley21369_items").delete().eq("id",id);
    showToast("Ítem eliminado","success");
    loadData();
  }catch(e){console.warn("[Ley21369] deleteItem error:",e);showToast("Error al eliminar","error")}
}

async function uploadDoc(itemId,file){
  try{
    const user=await getUser(); if(!user)return;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`${user.id}/ley21369/${Date.now()}_${safe}`;
    const{error}=await sb.storage.from("case-documents").upload(path,file);
    if(error){showToast("Error al subir archivo","error");return}
    await sb.from("ley21369_documentos").insert({
      user_id:user.id,item_id:itemId||null,file_name:file.name,file_path:path,
      file_size:file.size,file_type:file.type,
      category:itemId?"verificador":"evidencia_ses"
    });
    showToast("Documento subido","success");
    loadData();
  }catch(e){console.warn("[Ley21369] uploadDoc error:",e);showToast("Error al subir","error")}
}

async function downloadDoc(idOrObj){
  try{
    const doc=typeof idOrObj==="string"?docs.find(d=>d.id===idOrObj):idOrObj;
    if(!doc||!doc.file_path)return;
    const{data}=await sb.storage.from("case-documents").createSignedUrl(doc.file_path,300);
    if(data?.signedUrl)window.open(data.signedUrl,"_blank");
  }catch(e){console.warn("[Ley21369] downloadDoc error:",e)}
}

async function deleteDoc(id,path){
  if(!confirm("¿Eliminar este documento?"))return;
  try{
    await sb.storage.from("case-documents").remove([path]);
    await sb.from("ley21369_documentos").delete().eq("id",id);
    showToast("Documento eliminado","success");
    loadData();
  }catch(e){console.warn("[Ley21369] deleteDoc error:",e);showToast("Error al eliminar","error")}
}

// ── Meta persistence ────────────────────────────────────────────────────────
async function saveMeta(key,value){
  try{
    const user=await getUser(); if(!user)return;
    const val=JSON.stringify(value);
    const{error}=await sb.from("ley21369_meta").upsert(
      {user_id:user.id,key,value:val,updated_at:new Date().toISOString()},
      {onConflict:"user_id,key"}
    );
    if(error) console.warn("[Ley21369] saveMeta error:",error);
  }catch(e){console.warn("[Ley21369] saveMeta error:",e)}
}

async function toggleEvidencia(evId,checked){
  evidencias[evId]=checked;
  await saveMeta("evidencias",evidencias);
  render();
}

async function updateConclusion(field,value){
  conclusion[field]=value;
  await saveMeta("conclusion",conclusion);
}

async function updateSeccionMeta(secId,field,value){
  if(!seccionMeta[secId])seccionMeta[secId]={};
  seccionMeta[secId][field]=value;
  await saveMeta("seccion_"+secId,seccionMeta[secId]);
}

async function updatePlan(idx,field,value){
  if(planMejora[idx]){
    planMejora[idx][field]=value;
    await saveMeta("plan_mejora",planMejora);
  }
}

async function addPlanRow(){
  planMejora.push({brecha:"",accion:"",responsable:"",plazo:"",indicador:""});
  await saveMeta("plan_mejora",planMejora);
  render();
}

async function removePlanRow(idx){
  planMejora.splice(idx,1);
  await saveMeta("plan_mejora",planMejora);
  render();
}

// ── Section Analysis ────────────────────────────────────────────────────────
function analyzeSecciones(){
  return SECCIONES.map(sec=>{
    const si=items.filter(i=>i.area===sec.id);
    if(!si.length)return{...sec,items:si,total:0,cumple:0,parcial:0,no_cumple:0,sin_evaluar:0,pct:0,risk:"ok"};
    const cumple=si.filter(i=>i.status==="cumple").length;
    const parcial=si.filter(i=>i.status==="parcial").length;
    const no_cumple=si.filter(i=>i.status==="no_cumple").length;
    const sin_evaluar=si.filter(i=>i.status==="sin_evaluar").length;
    const evaluated=si.length-sin_evaluar;
    const pct=evaluated?Math.round(cumple/evaluated*100):0;
    const sinVerif=si.filter(i=>i.status==="cumple"&&!docs.some(d=>d.item_id===i.id)).length;
    let risk="ok";
    if(no_cumple>0)risk="critical";
    else if(parcial>0||sin_evaluar>si.length/2)risk="warning";
    if(sinVerif>0&&risk==="ok")risk="warning";
    return{...sec,items:si,total:si.length,cumple,parcial,no_cumple,sin_evaluar,pct,sinVerif,risk,evaluated};
  });
}

function globalStats(){
  const total=items.length;
  const cumple=items.filter(i=>i.status==="cumple").length;
  const parcial=items.filter(i=>i.status==="parcial").length;
  const no_cumple=items.filter(i=>i.status==="no_cumple").length;
  const sin_evaluar=items.filter(i=>i.status==="sin_evaluar").length;
  const evaluated=total-sin_evaluar;
  const pct=evaluated?Math.round(cumple/evaluated*100):0;
  let estadoGlobal="cumple";
  if(no_cumple>0)estadoGlobal="no_cumple";
  else if(parcial>0||sin_evaluar>0)estadoGlobal="parcial";
  return{total,cumple,parcial,no_cumple,sin_evaluar,evaluated,pct,estadoGlobal};
}

// ══════════════════════════════════════════════════════════════════════════════
// TABS — Solo 4 pestañas (sin duplicación)
// ══════════════════════════════════════════════════════════════════════════════
const TABS=[
  {id:"dashboard",label:"📊 Semáforo SES"},
  {id:"respuesta",label:"📑 Respuesta Fiscalización SES"},
  {id:"documentos",label:"📁 Documentos y Evidencias"},
  {id:"chat",label:"💬 Chat IA"}
];

function renderTabs(){
  const el=document.getElementById("leyTabs");
  if(!el)return;
  el.innerHTML=TABS.map(t=>`<div class="ley-tab${activeTab===t.id?" active":""}" data-tab="${t.id}">${t.label}</div>`).join("");
  el.querySelectorAll(".ley-tab").forEach(tab=>{
    tab.onclick=()=>{activeTab=tab.dataset.tab;renderTabs();renderBody()};
  });
}

function renderHeaderActions(){
  const el=document.getElementById("leyHeaderActions");
  if(!el)return;
  el.innerHTML=`
    <button class="ley-btn" onclick="window._ley21369.showAddModal()">➕ Agregar</button>
    <button class="ley-btn" onclick="window._ley21369.generateReport()" ${items.length===0||generatingReport?"disabled":""}>${generatingReport?"⏳ Generando…":"📝 Informe SES"}</button>
    <button class="ley-btn" onclick="window._ley21369.exportExcel()" ${items.length===0?"disabled":""}>📊 Excel SES</button>
    <button class="ley-btn" onclick="window._ley21369.resetToTemplate()" style="color:#7c3aed" title="Re-inicializar ítems del template SES">🔄 Reset SES</button>`;
}

// ── Render Body ─────────────────────────────────────────────────────────────
function renderBody(){
  const el=document.getElementById("leyBody");
  if(!el)return;
  if(loading){el.innerHTML='<p style="text-align:center;padding:40px;color:var(--text-muted)">Cargando datos…</p>';return}

  let reportHTML="";
  if(aiReport){
    reportHTML=`<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong style="font-size:14px">✨ Informe SES generado por IA</strong>
        <div><button class="ley-btn ley-btn-sm" onclick="window._ley21369.copyReport()">📋 Copiar</button>
        <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.closeReport()">✕</button></div>
      </div>
      <div class="ley-report-box">${typeof md==="function"?md(aiReport):aiReport.replace(/\n/g,"<br>")}</div>
    </div>`;
  }

  const renderers={dashboard:renderDashboard,respuesta:renderRespuesta,documentos:renderDocumentos,chat:renderChat};
  el.innerHTML=reportHTML+(renderers[activeTab]||renderers.dashboard)();

  // Bind toggle for collapsible section cards in semáforo
  if(activeTab==="dashboard"){
    el.querySelectorAll(".ley-section-header[data-secid]").forEach(hdr=>{
      hdr.onclick=()=>{
        const sid=hdr.dataset.secid;
        seccionesAbiertas[sid]=!seccionesAbiertas[sid];
        const card=hdr.closest(".ley-section-card");
        const itemsDiv=card.querySelector(".ley-section-items");
        const chevron=hdr.querySelector(".chevron");
        if(seccionesAbiertas[sid]){
          itemsDiv.classList.add("open");
          if(chevron)chevron.classList.add("open");
        }else{
          itemsDiv.classList.remove("open");
          if(chevron)chevron.classList.remove("open");
        }
      };
    });
  }
  // Bind drag-and-drop upload zone for documentos tab
  if(activeTab==="documentos") bindUploadZone();
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: SEMÁFORO SES (resumen visual de solo lectura)
// ══════════════════════════════════════════════════════════════════════════════
function renderDashboard(){
  const s=globalStats();
  const secs=analyzeSecciones();
  const scGlobal=STATUS_CFG[s.estadoGlobal]||STATUS_CFG.sin_evaluar;
  const evCount=EVIDENCIAS_SES.filter(ev=>evidencias[ev.id]).length;

  let html=`
  <div style="text-align:center;margin-bottom:16px;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px">
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Estado de cumplimiento global</div>
    <div style="font-size:36px;margin:6px 0">${scGlobal.icon}</div>
    <span class="ley-st ${scGlobal.cls}" style="font-size:14px;padding:4px 16px">${scGlobal.label}</span>
    <div style="font-size:24px;font-weight:700;color:${scGlobal.color};margin-top:8px">${s.pct}%</div>
    <div class="ley-progress" style="max-width:300px;margin:8px auto"><div class="ley-progress-fill" style="width:${s.pct}%;background:${scGlobal.color}"></div></div>
    <div style="font-size:11px;color:var(--text-muted)">${s.evaluated} de ${s.total} ítems evaluados · ${evCount}/${EVIDENCIAS_SES.length} evidencias adjuntas</div>
  </div>

  <div class="ley-cards">
    <div class="ley-card" style="border-top:3px solid #16a34a"><div class="num" style="color:#16a34a">${s.cumple}</div><div class="lbl">Cumple</div></div>
    <div class="ley-card" style="border-top:3px solid #f59e0b"><div class="num" style="color:#f59e0b">${s.parcial}</div><div class="lbl">Parcial</div></div>
    <div class="ley-card" style="border-top:3px solid #ef4444"><div class="num" style="color:#ef4444">${s.no_cumple}</div><div class="lbl">No cumple</div></div>
    <div class="ley-card" style="border-top:3px solid #9ca3af"><div class="num" style="color:#9ca3af">${s.sin_evaluar}</div><div class="lbl">Sin evaluar</div></div>
  </div>

  <h3 style="font-size:15px;margin:16px 0 10px">Semáforo por sección</h3>`;

  secs.forEach(sec=>{
    const secSt=sec.no_cumple>0?"no_cumple":sec.parcial>0||sec.sin_evaluar>sec.total/2?"parcial":"cumple";
    const stCfg=STATUS_CFG[secSt];
    const isOpen=!!seccionesAbiertas[sec.id];
    let itemsHtml="";
    if(sec.items&&sec.items.length){
      sec.items.forEach(it=>{
        const itSt=STATUS_CFG[it.status]||STATUS_CFG.sin_evaluar;
        itemsHtml+=`<div class="ley-section-item-row">
          <span class="item-status">${itSt.icon}</span>
          <span class="item-text">${h(it.requirement||it.item_exigido||"")}</span>
          <span class="ley-st ${itSt.cls}">${itSt.label}</span>
        </div>`;
      });
    }
    html+=`<div class="ley-section-card risk-${sec.risk}">
      <div class="ley-section-header" data-secid="${sec.id}">
        <span class="title">${sec.icon} ${sec.num}) ${h(sec.label)} — <span style="color:${stCfg.color}">${stCfg.icon} ${stCfg.label}</span></span>
        <span class="stats">
          <span style="color:#16a34a">✅${sec.cumple}</span>
          <span style="color:#f59e0b">⚠️${sec.parcial}</span>
          <span style="color:#ef4444">❌${sec.no_cumple}</span>
          <span style="color:#9ca3af">⬜${sec.sin_evaluar}</span>
          ${sec.sinVerif?`<span style="color:#ef4444">📎${sec.sinVerif} sin verif.</span>`:""}
          <span class="chevron${isOpen?" open":""}">▶</span>
        </span>
      </div>
      <div class="ley-progress" style="margin-top:8px"><div class="ley-progress-fill" style="width:${sec.pct}%;background:${stCfg.color}"></div></div>
      <div class="ley-section-items${isOpen?" open":""}">${itemsHtml}</div>
    </div>`;
  });

  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: RESPUESTA FISCALIZACIÓN SES (documento completo — vista única de edición)
// Secciones 1-4 (ítems), 5 (evidencias), 6 (conclusión), 7 (plan mejora)
// ══════════════════════════════════════════════════════════════════════════════
function renderRespuesta(){
  const s=globalStats();
  const scGlobal=STATUS_CFG[s.estadoGlobal]||STATUS_CFG.sin_evaluar;

  let html=`<div style="overflow-x:auto;font-family:Arial,sans-serif">

  <!-- ENCABEZADO DOCUMENTO -->
  <div style="text-align:center;margin-bottom:20px;padding:20px 16px;background:var(--surface);border:1px solid var(--border);border-radius:10px">
    <div style="font-size:18px;font-weight:700;letter-spacing:.5px;margin-bottom:4px">RESPUESTA A FISCALIZACIÓN SES 2026</div>
    <div style="font-size:13px;color:var(--text-muted);line-height:1.6">
      Implementación de la Ley N° 21.369 – Universidad de Magallanes<br>
      Fecha: ${new Date().toLocaleDateString("es-CL",{year:"numeric",month:"long"})}<br>
      Unidad responsable: Dirección de Género / Fiscalía de Género / UPA
    </div>
  </div>`;

  // ═══ SECCIONES 1-4: Checklist de ítems ═══
  SECCIONES.forEach(sec=>{
    const si=items.filter(i=>i.area===sec.id);
    const cumple=si.filter(i=>i.status==="cumple").length;
    const parcial=si.filter(i=>i.status==="parcial").length;
    const noCumple=si.filter(i=>i.status==="no_cumple").length;
    let secEstado="cumple";
    if(noCumple>0)secEstado="no_cumple";
    else if(parcial>0||si.some(i=>i.status==="sin_evaluar"))secEstado="parcial";
    const secSt=STATUS_CFG[secEstado];
    const meta=seccionMeta[sec.id]||{};

    html+=`
    <div style="margin-bottom:24px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="background:var(--surface);padding:12px 16px;border-bottom:1px solid var(--border)">
        <div style="font-size:14px;font-weight:700">${sec.num}) ${h(sec.label)} — Checklist de Cumplimiento</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px"><strong>Objetivo SES:</strong> ${h(sec.objetivo)}</div>
      </div>

      <table class="ley-table" style="margin:0"><thead><tr>
        <th style="width:30%">Ítem exigido por la ley</th>
        <th style="width:55px;text-align:center">Cumple</th>
        <th style="width:55px;text-align:center">Parcial</th>
        <th style="width:65px;text-align:center">No cumple</th>
        <th style="width:25%">Evidencia verificable</th>
        <th style="width:25%">Observaciones / Acciones de mejora</th>
        <th style="width:30px"></th>
      </tr></thead><tbody>`;

    si.forEach(i=>{
      html+=`<tr>
        <td style="font-size:12px">${h(i.requirement)}</td>
        <td style="text-align:center"><input type="radio" name="ses_${i.id}" value="cumple" ${i.status==="cumple"?"checked":""} onchange="window._ley21369.updateStatus('${i.id}','cumple')"></td>
        <td style="text-align:center"><input type="radio" name="ses_${i.id}" value="parcial" ${i.status==="parcial"?"checked":""} onchange="window._ley21369.updateStatus('${i.id}','parcial')"></td>
        <td style="text-align:center"><input type="radio" name="ses_${i.id}" value="no_cumple" ${i.status==="no_cumple"?"checked":""} onchange="window._ley21369.updateStatus('${i.id}','no_cumple')"></td>
        <td><input class="ley-input" value="${h(i.description||"")}" onfocusout="window._ley21369.updateField('${i.id}','description',this.value)" placeholder="Evidencia…" style="font-size:11px"></td>
        <td><input class="ley-input" value="${h(i.verification_notes||"")}" onfocusout="window._ley21369.updateField('${i.id}','verification_notes',this.value)" placeholder="Observaciones…" style="font-size:11px"></td>
        <td><button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteItem('${i.id}')" title="Eliminar">🗑</button></td>
      </tr>`;
    });
    if(!si.length) html+=`<tr><td colspan="7" style="text-align:center;padding:10px;color:var(--text-muted)">Sin ítems</td></tr>`;

    html+=`</tbody></table>

      <!-- Agregar ítem -->
      <div style="padding:4px 16px;border-top:1px solid var(--border)">
        <button class="ley-btn ley-btn-sm" style="width:100%" onclick="window._ley21369.showAddModal('${sec.id}')">➕ Agregar ítem</button>
      </div>

      <!-- Estado global sección + campos extra -->
      <div style="padding:10px 16px;background:var(--surface);border-top:1px solid var(--border);font-size:12px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-weight:600">Estado global ${h(sec.label.split("(")[0].trim())}:</span>
          ${["cumple","parcial","no_cumple"].map(st=>{
            const cfg=STATUS_CFG[st];
            return`<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer">
              <input type="radio" name="secGlobal_${sec.id}" value="${st}" ${secEstado===st?"checked":""}
                onchange="window._ley21369.updateSeccionMeta('${sec.id}','estado_global','${st}')">
              ${cfg.icon} ${cfg.label}
            </label>`;
          }).join("")}
        </div>`;

    // Campos extra por sección
    if(sec.id==="politica_integral"){
      html+=`<div style="margin-top:6px"><span style="color:var(--text-muted)">Responsable de seguimiento:</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.responsable_seguimiento||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','responsable_seguimiento',this.value)"></div>`;
    } else if(sec.id==="modelo_prevencion"){
      html+=`<div style="margin-top:6px"><span style="color:var(--text-muted)">Brechas identificadas:</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.brechas_identificadas||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','brechas_identificadas',this.value)"></div>
        <div style="margin-top:4px"><span style="color:var(--text-muted)">Plan de mejora (plazo/responsable):</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.plan_mejora_breve||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','plan_mejora_breve',this.value)"></div>`;
    } else if(sec.id==="investigacion_sancion"){
      html+=`<div style="margin-top:6px"><span style="color:var(--text-muted)">Riesgos críticos detectados:</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.riesgos_criticos||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','riesgos_criticos',this.value)"></div>
        <div style="margin-top:4px"><span style="color:var(--text-muted)">Acciones correctivas priorizadas:</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.acciones_correctivas||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','acciones_correctivas',this.value)"></div>`;
    } else if(sec.id==="adecuacion_contratos"){
      html+=`<div style="margin-top:6px"><span style="color:var(--text-muted)">Plan de regularización documental:</span>
        <input class="ley-input" style="display:inline;width:300px;margin-left:4px" value="${h(meta.plan_regularizacion||"")}"
          onfocusout="window._ley21369.updateSeccionMeta('${sec.id}','plan_regularizacion',this.value)"></div>`;
    }

    html+=`</div></div>`;
  });

  // ═══ SECCIÓN 5: EVIDENCIAS ═══
  html+=`
  <div style="margin-bottom:24px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
    <div style="background:var(--surface);padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700">5) Evidencias Adjuntas (checklist documental para SES)</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${EVIDENCIAS_SES.filter(ev=>evidencias[ev.id]).length}/${EVIDENCIAS_SES.length} evidencias marcadas</div>
    </div>
    <div style="padding:10px 16px">`;
  EVIDENCIAS_SES.forEach(ev=>{
    const ok=evidencias[ev.id];
    html+=`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border)">
      <input type="checkbox" style="width:14px;height:14px;accent-color:#16a34a" ${ok?"checked":""}
        onchange="window._ley21369.toggleEvidencia('${ev.id}',this.checked)">
      <span>${ok?"☑️":"⬜"} ${h(ev.label)}</span>
    </div>`;
  });
  html+=`</div></div>`;

  // ═══ SECCIÓN 6: CONCLUSIÓN EJECUTIVA ═══
  html+=`
  <div style="margin-bottom:24px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
    <div style="background:var(--surface);padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700">6) Conclusión Ejecutiva para SES (resumen en 5 líneas)</div>
    </div>
    <div style="padding:12px 16px;font-size:12px;line-height:1.8">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-weight:600">Estado de cumplimiento global:</span>
        ${["cumple","parcial","no_cumple"].map(st=>{
          const cfg=STATUS_CFG[st];
          return`<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer">
            <input type="radio" name="conclusionGlobal" value="${st}" ${(conclusion.estado_global||s.estadoGlobal)===st?"checked":""}
              onchange="window._ley21369.updateConclusion('estado_global','${st}')">
            ${cfg.icon} ${cfg.label}
          </label>`;
        }).join("")}
      </div>
      <div style="margin-bottom:6px">Brechas relevantes:
        <input class="ley-input" style="display:inline;width:calc(100% - 140px)" value="${h(conclusion.brechas||"")}"
          onfocusout="window._ley21369.updateConclusion('brechas',this.value)"></div>
      <div style="margin-bottom:6px">Medidas correctivas comprometidas (plazo):
        <input class="ley-input" style="display:inline;width:calc(100% - 260px)" value="${h(conclusion.medidas_correctivas||"")}"
          onfocusout="window._ley21369.updateConclusion('medidas_correctivas',this.value)"></div>
      <div style="margin-bottom:6px">Responsable institucional:
        <input class="ley-input" style="display:inline;width:calc(100% - 170px)" value="${h(conclusion.responsable||"")}"
          onfocusout="window._ley21369.updateConclusion('responsable',this.value)"></div>
      <div style="margin-top:8px;padding:8px;background:var(--bg,#f8fafc);border-radius:6px;color:var(--text-muted)">
        <strong>Resumen automático:</strong> De ${s.total} ítems exigidos, ${s.cumple} cumplen, ${s.parcial} parcialmente y ${s.no_cumple} no cumplen. ${s.sin_evaluar} pendientes de evaluación. Cobertura documental: ${EVIDENCIAS_SES.filter(ev=>evidencias[ev.id]).length}/${EVIDENCIAS_SES.length} evidencias adjuntas.
      </div>
    </div>
  </div>`;

  // ═══ SECCIÓN 7: PLAN DE MEJORA ═══
  html+=`
  <div style="margin-bottom:24px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
    <div style="background:var(--surface);padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700">7) Plan de Mejora 2026–2027 (opcional para fiscalización proactiva)</div>
    </div>
    <table class="ley-table" style="margin:0"><thead><tr>
      <th>Brecha</th><th>Acción</th><th>Responsable</th><th>Plazo</th><th>Indicador</th><th style="width:30px"></th>
    </tr></thead><tbody>`;
  planMejora.forEach((pm,idx)=>{
    html+=`<tr>
      <td><input class="ley-input" value="${h(pm.brecha)}" onfocusout="window._ley21369.updatePlan(${idx},'brecha',this.value)" style="font-size:11px"></td>
      <td><input class="ley-input" value="${h(pm.accion)}" onfocusout="window._ley21369.updatePlan(${idx},'accion',this.value)" style="font-size:11px"></td>
      <td><input class="ley-input" value="${h(pm.responsable)}" onfocusout="window._ley21369.updatePlan(${idx},'responsable',this.value)" style="font-size:11px"></td>
      <td><input class="ley-input" value="${h(pm.plazo)}" onfocusout="window._ley21369.updatePlan(${idx},'plazo',this.value)" style="font-size:11px"></td>
      <td><input class="ley-input" value="${h(pm.indicador)}" onfocusout="window._ley21369.updatePlan(${idx},'indicador',this.value)" style="font-size:11px"></td>
      <td><button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.removePlanRow(${idx})">🗑</button></td>
    </tr>`;
  });
  html+=`</tbody></table>
    <div style="padding:8px 16px"><button class="ley-btn ley-btn-sm" onclick="window._ley21369.addPlanRow()">➕ Agregar fila</button></div>
  </div>

  </div>`;
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: DOCUMENTOS Y EVIDENCIAS (subida con clasificación IA)
// ══════════════════════════════════════════════════════════════════════════════
function renderDocumentos(){
  const totalItems=items.length;
  const itemsConDoc=items.filter(i=>docs.some(d=>d.item_id===i.id)).length;
  const generalDocs=docs.filter(d=>!d.item_id);
  const isProcessing=classifyingDoc&&classifyingDoc.uploading;

  let html=`<h3 style="font-size:15px;margin-bottom:4px">📁 Documentos y Evidencias</h3>
  <p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Suba archivos y la IA los clasificará automáticamente según los ítems que correspondan</p>`;

  // ── Upload zone ──
  html+=`<div class="ley-upload-zone${isProcessing?" processing":""}" id="leyUploadZone">
    <input type="file" id="leyDocFileInput" style="display:none" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg" multiple>
    ${isProcessing
      ?`<div style="font-size:14px;margin-bottom:6px">⏳ Procesando documento…</div>
        <div style="font-size:12px;color:var(--text-muted)">${h(classifyingDoc.fileName||"")} — Extrayendo texto y clasificando con IA</div>`
      :`<div style="font-size:24px;margin-bottom:6px">📤</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Arrastra archivos aquí o haz clic para seleccionar</div>
        <div style="font-size:11px;color:var(--text-muted)">PDF, Word, Excel, TXT, imágenes — la IA clasificará a qué ítems tributan</div>`}
  </div>`;

  // ── Cobertura resumen ──
  html+=`<div style="margin:14px 0;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:10px;display:flex;flex-wrap:wrap;gap:16px;font-size:12px">
    <div><strong style="font-size:20px;color:var(--accent)">${itemsConDoc}</strong><span style="color:var(--text-muted)">/${totalItems} ítems con evidencia</span></div>
    <div><strong style="font-size:20px;color:#16a34a">${docs.length}</strong><span style="color:var(--text-muted)"> archivos totales</span></div>
    <div><strong style="font-size:20px;color:#f59e0b">${totalItems-itemsConDoc}</strong><span style="color:var(--text-muted)"> ítems sin evidencia</span></div>
    <div><strong style="font-size:20px;color:#9ca3af">${generalDocs.length}</strong><span style="color:var(--text-muted)"> sin clasificar</span></div>
  </div>`;

  // ── Documentos por sección ──
  SECCIONES.forEach(sec=>{
    const si=items.filter(i=>i.area===sec.id);
    if(!si.length)return;
    const secDocCount=si.reduce((n,i)=>n+docs.filter(d=>d.item_id===i.id).length,0);
    const siConDoc=si.filter(i=>docs.some(d=>d.item_id===i.id)).length;

    html+=`<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="font-size:13px;margin:0">${sec.icon} ${sec.num}) ${h(sec.label)}</h4>
        <span style="font-size:11px;color:var(--text-muted)">${siConDoc}/${si.length} ítems cubiertos · ${secDocCount} docs</span>
      </div>`;

    si.forEach(i=>{
      const iDocs=docs.filter(d=>d.item_id===i.id);
      const sc=STATUS_CFG[i.status]||STATUS_CFG.sin_evaluar;
      const hasDocs=iDocs.length>0;
      const borderColor=hasDocs?"#16a34a":(i.status==="cumple"?"#ef4444":"var(--border)");
      html+=`<div style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:8px;margin-bottom:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px">
          <span>${sc.icon} ${h(i.requirement)}</span>
          <span style="font-size:11px;color:var(--text-muted)">${hasDocs?`📎 ${iDocs.length} doc${iDocs.length>1?"s":""}`:i.status==="cumple"?'<span style="color:#ef4444">⚠ Sin verificador</span>':"sin docs"}</span>
        </div>`;
      if(iDocs.length){
        iDocs.forEach(d=>{
          html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;margin-top:4px;background:var(--bg,#f8fafc);border-radius:6px;font-size:11px">
            <span>📄 ${h(d.file_name)} <span style="color:var(--text-muted)">(${fmtSize(d.file_size)} · ${fmtDate(d.created_at)})</span></span>
            <div style="display:flex;gap:4px">
              <button class="ley-btn ley-btn-sm" onclick="window._ley21369.downloadDoc('${d.id}')">⬇</button>
              <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteDoc('${d.id}','${h(d.file_path)}')">🗑</button>
            </div>
          </div>`;
        });
      }
      html+=`</div>`;
    });
    html+=`</div>`;
  });

  // ── Documentos sin clasificar ──
  if(generalDocs.length){
    html+=`<div style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="font-size:13px;margin:0">📦 Documentos sin clasificar</h4>
        <span style="font-size:11px;color:var(--text-muted)">${generalDocs.length} archivo${generalDocs.length>1?"s":""}</span>
      </div>`;
    generalDocs.forEach(d=>{
      html+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:4px;font-size:12px">
        <span>📄 ${h(d.file_name)} <span style="color:var(--text-muted)">(${fmtSize(d.file_size)} · ${fmtDate(d.created_at)})</span></span>
        <div style="display:flex;gap:4px">
          <button class="ley-btn ley-btn-sm" onclick="window._ley21369.reclassifyDoc('${d.id}')" title="Clasificar con IA">🤖</button>
          <button class="ley-btn ley-btn-sm" onclick="window._ley21369.downloadDoc('${d.id}')">⬇</button>
          <button class="ley-btn ley-btn-sm ley-btn-danger" onclick="window._ley21369.deleteDoc('${d.id}','${h(d.file_path)}')">🗑</button>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  return html;
}

// ── Upload zone event binding (called after renderBody) ──
function bindUploadZone(){
  const zone=document.getElementById("leyUploadZone");
  const input=document.getElementById("leyDocFileInput");
  if(!zone||!input)return;
  zone.onclick=()=>input.click();
  input.onchange=()=>{
    if(input.files&&input.files.length){
      Array.from(input.files).forEach(f=>uploadDocWithAI(f));
      input.value="";
    }
  };
  zone.ondragover=e=>{e.preventDefault();zone.classList.add("dragover")};
  zone.ondragleave=()=>zone.classList.remove("dragover");
  zone.ondrop=e=>{
    e.preventDefault();zone.classList.remove("dragover");
    if(e.dataTransfer.files.length)Array.from(e.dataTransfer.files).forEach(f=>uploadDocWithAI(f));
  };
}

// ── AI-powered upload: extract text → classify → show modal ──
async function uploadDocWithAI(file){
  classifyingDoc={file,fileName:file.name,fileSize:file.size,fileType:file.type,uploading:true,suggestedItems:[],extractedText:""};
  renderBody();

  try{
    // 1) Extract text from file
    let text="";
    if(file.name.endsWith(".txt")){
      text=await file.text();
    } else {
      const reader=new FileReader();
      const base64=await new Promise((res,rej)=>{
        reader.onload=()=>res(reader.result.split(",")[1]);
        reader.onerror=()=>rej(reader.error);
        reader.readAsDataURL(file);
      });
      const mediaType=file.type||"application/octet-stream";
      try{
        const token=typeof session!=="undefined"?session?.access_token||"":"";
        const r=await fetch(_CHAT_EP,{
          method:"POST",
          headers:{"Content-Type":"application/json","x-auth-token":token},
          body:JSON.stringify({
            model:"claude-sonnet-4-20250514",max_tokens:8000,
            messages:[{role:"user",content:[
              {type:"document",source:{type:"base64",media_type:mediaType,data:base64}},
              {type:"text",text:"Extrae el texto principal de este documento. Responde SOLO con el texto extraído, sin comentarios."}
            ]}]
          })
        });
        if(r.ok){
          const data=await r.json();
          text=(data.content&&data.content[0]?.text)||data.reply||"";
        }
      }catch(e){console.warn("[Ley21369] Text extraction error:",e)}
    }
    classifyingDoc.extractedText=text;

    // 2) Ask AI to classify which items this document relates to
    const itemList=items.map(i=>{
      const sec=SECCIONES.find(s=>s.id===i.area);
      return`- ID: ${i.id} | Sección: ${sec?sec.label:"?"} | Ítem: ${i.requirement}`;
    }).join("\n");

    const classifyPrompt=`Eres un clasificador de evidencias para la Ley 21.369 (acoso sexual, violencia y discriminación de género en educación superior).

Dado el siguiente documento y la lista de ítems de cumplimiento, indica a qué ítems tributa este documento como evidencia.

DOCUMENTO: "${file.name}"
CONTENIDO (extracto):
${text.substring(0,4000)}

ÍTEMS DISPONIBLES:
${itemList}

Responde SOLO en formato JSON, un array de objetos con los campos "id" (UUID del ítem) y "reason" (explicación breve en español de por qué tributa). Ejemplo:
[{"id":"uuid-1","reason":"Contiene el protocolo de actuación"},{"id":"uuid-2","reason":"Define las unidades responsables"}]

Si el documento no tributa a ningún ítem, responde: []`;

    try{
      const token=typeof session!=="undefined"?session?.access_token||"":"";
      const r2=await fetch(_CHAT_EP,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-auth-token":token},
        body:JSON.stringify({messages:[{role:"user",content:classifyPrompt}],max_tokens:4000})
      });
      if(r2.ok){
        const data2=await r2.json();
        const replyText=(data2.content&&data2.content[0]?.text)||data2.reply||"[]";
        const jsonMatch=replyText.match(/\[[\s\S]*\]/);
        if(jsonMatch){
          classifyingDoc.suggestedItems=JSON.parse(jsonMatch[0]);
        }
      }
    }catch(e){console.warn("[Ley21369] Classification error:",e)}

    // 3) Upload file to storage
    const user=await getUser();
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=user?`${user.id}/ley21369/${Date.now()}_${safe}`:`anon/ley21369/${Date.now()}_${safe}`;
    const{error}=await sb.storage.from("case-documents").upload(path,file);
    if(error){showToast("Error al subir archivo","error");classifyingDoc=null;renderBody();return}
    classifyingDoc.filePath=path;
    classifyingDoc.uploading=false;

    // 4) Show classification modal
    renderBody();
    showClassifyModal();

  }catch(e){
    console.warn("[Ley21369] uploadDocWithAI error:",e);
    showToast("Error al procesar documento","error");
    classifyingDoc=null;
    renderBody();
  }
}

// ── Classification confirmation modal ──
function showClassifyModal(){
  if(!classifyingDoc)return;
  const overlay=document.createElement("div");
  overlay.className="ley-classify-overlay";
  overlay.id="leyClassifyOverlay";

  const suggestedIds=new Set(classifyingDoc.suggestedItems.map(s=>s.id));
  const reasonMap={};
  classifyingDoc.suggestedItems.forEach(s=>{reasonMap[s.id]=s.reason});

  let itemsHTML="";
  SECCIONES.forEach(sec=>{
    const si=items.filter(i=>i.area===sec.id);
    if(!si.length)return;
    itemsHTML+=`<div style="font-size:11px;font-weight:700;color:var(--text-muted);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.05em">${sec.icon} ${sec.label}</div>`;
    si.forEach(i=>{
      const isSuggested=suggestedIds.has(i.id);
      const reason=reasonMap[i.id]||"";
      itemsHTML+=`<label class="ley-classify-item${isSuggested?" suggested":""}">
        <input type="checkbox" value="${i.id}" ${isSuggested?"checked":""}>
        <div class="item-info">
          <div>${h(i.requirement)}</div>
          ${reason?`<div style="color:#6d28d9;font-size:11px;margin-top:2px">🤖 ${h(reason)}</div>`:""}
        </div>
        ${isSuggested?'<span class="ai-badge">✨ IA</span>':""}
      </label>`;
    });
  });

  overlay.innerHTML=`<div class="ley-classify-modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <h3>🤖 Clasificación de Evidencia</h3>
      <button class="ley-btn ley-btn-sm" onclick="window._ley21369.cancelClassify()">✕</button>
    </div>
    <div class="subtitle">📄 <strong>${h(classifyingDoc.fileName)}</strong> (${fmtSize(classifyingDoc.fileSize)}) — La IA sugirió ${classifyingDoc.suggestedItems.length} ítem${classifyingDoc.suggestedItems.length!==1?"s":""}. Revisa y confirma.</div>
    <div style="max-height:50vh;overflow-y:auto;margin-bottom:14px">${itemsHTML}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="ley-btn" onclick="window._ley21369.confirmClassify(false)">📦 Sin clasificar</button>
      <button class="ley-btn ley-btn-primary" onclick="window._ley21369.confirmClassify(true)">✅ Confirmar selección</button>
    </div>
  </div>`;

  document.body.appendChild(overlay);
  overlay.onclick=e=>{if(e.target===overlay)window._ley21369.cancelClassify()};
}

async function confirmClassify(withItems){
  if(!classifyingDoc)return;
  const overlay=document.getElementById("leyClassifyOverlay");
  const user=await getUser();
  const userId=user?user.id:null;

  if(withItems){
    const checked=overlay?Array.from(overlay.querySelectorAll("input[type=checkbox]:checked")).map(cb=>cb.value):[];
    if(checked.length){
      // Insert one doc row per selected item
      const rows=checked.map(itemId=>({
        user_id:userId,item_id:itemId,file_name:classifyingDoc.fileName,
        file_path:classifyingDoc.filePath,file_size:classifyingDoc.fileSize,
        file_type:classifyingDoc.fileType,category:"verificador"
      }));
      await sb.from("ley21369_documentos").insert(rows);
      showToast(`Documento vinculado a ${checked.length} ítem${checked.length>1?"s":""}`,"success");
    } else {
      // No items checked — save as general
      await sb.from("ley21369_documentos").insert({
        user_id:userId,item_id:null,file_name:classifyingDoc.fileName,
        file_path:classifyingDoc.filePath,file_size:classifyingDoc.fileSize,
        file_type:classifyingDoc.fileType,category:"evidencia_ses"
      });
      showToast("Documento guardado sin clasificar","info");
    }
  } else {
    // Save without classification
    await sb.from("ley21369_documentos").insert({
      user_id:userId,item_id:null,file_name:classifyingDoc.fileName,
      file_path:classifyingDoc.filePath,file_size:classifyingDoc.fileSize,
      file_type:classifyingDoc.fileType,category:"evidencia_ses"
    });
    showToast("Documento guardado sin clasificar","info");
  }

  if(overlay)overlay.remove();
  classifyingDoc=null;
  loadData();
}

function cancelClassify(){
  // File already uploaded to storage — save as unclassified
  if(classifyingDoc&&classifyingDoc.filePath){
    getUser().then(user=>{
      sb.from("ley21369_documentos").insert({
        user_id:user?user.id:null,item_id:null,file_name:classifyingDoc.fileName,
        file_path:classifyingDoc.filePath,file_size:classifyingDoc.fileSize,
        file_type:classifyingDoc.fileType,category:"evidencia_ses"
      }).then(()=>loadData());
    });
  }
  const overlay=document.getElementById("leyClassifyOverlay");
  if(overlay)overlay.remove();
  classifyingDoc=null;
  renderBody();
}

async function reclassifyDoc(docId){
  const doc=docs.find(d=>d.id===docId);
  if(!doc)return;
  // Download the file, then re-run classification
  try{
    const{data}=await sb.storage.from("case-documents").createSignedUrl(doc.file_path,120);
    if(!data?.signedUrl)return;
    const r=await fetch(data.signedUrl);
    const blob=await r.blob();
    const file=new File([blob],doc.file_name,{type:doc.file_type||"application/octet-stream"});
    // Delete the unclassified record first
    await sb.from("ley21369_documentos").delete().eq("id",docId);
    docs=docs.filter(d=>d.id!==docId);
    // Re-run with AI
    uploadDocWithAI(file);
  }catch(e){
    console.warn("[Ley21369] reclassifyDoc error:",e);
    showToast("Error al reclasificar","error");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: CHAT IA
// ══════════════════════════════════════════════════════════════════════════════
function renderChat(){
  const msgs=chatMessages.map(m=>`<div class="ley-chat-msg ${m.role}"><div class="bubble">${m.role==="assistant"&&typeof md==="function"?md(m.content):h(m.content)}</div></div>`).join("");
  return`<div class="ley-chat-container">
    <div class="ley-chat-msgs" id="leyChatMsgs">${msgs||'<p style="text-align:center;padding:20px;color:var(--text-muted)">Consulta sobre la Ley 21.369, fiscalización SES y tu estado de cumplimiento</p>'}</div>
    <div class="ley-chat-input">
      <input class="ley-input" id="leyChatInput" placeholder="Pregunta sobre Ley 21.369 / SES…" onkeydown="if(event.key==='Enter')window._ley21369.sendChat()">
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
    const secs=analyzeSecciones();
    const evCount=EVIDENCIAS_SES.filter(ev=>evidencias[ev.id]).length;
    const context=`Estado cumplimiento Ley 21.369 (Fiscalización SES 2026 — UMAG):
- Total ítems: ${s.total} | Cumple: ${s.cumple} | Parcial: ${s.parcial} | No cumple: ${s.no_cumple} | Sin evaluar: ${s.sin_evaluar}
- Estado global: ${STATUS_CFG[s.estadoGlobal]?.label}
- Evidencias adjuntas: ${evCount}/${EVIDENCIAS_SES.length}
- Plan de mejora: ${planMejora.length} acciones

Secciones:
${secs.map(sec=>`${sec.num}) ${sec.label}: ${sec.cumple}/${sec.total} cumple, ${sec.parcial} parcial, ${sec.no_cumple} no cumple`).join("\n")}`;

    const apiMessages=chatMessages.filter(m=>m.role==="user"||m.role==="assistant").map(m=>({role:m.role,content:m.content}));

    const body={
      system:`Eres un experto en la Ley 21.369 de Chile y en procesos de fiscalización de la Superintendencia de Educación Superior (SES). Responde en español, de forma profesional. El contexto es la Universidad de Magallanes (UMAG). La estructura de la respuesta a fiscalización tiene 7 secciones: 1) Política Integral, 2) Modelo de Prevención, 3) Investigación y Sanción, 4) Adecuación de Contratos, 5) Evidencias, 6) Conclusión Ejecutiva, 7) Plan de Mejora.\n\nContexto actual:\n${context}`,
      messages:apiMessages
    };

    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const token=typeof session!=="undefined"?session?.access_token||"":"";
      const res=await fetch(_CHAT_EP,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-auth-token":token},
        body:JSON.stringify(body),
        signal:_ctrl.signal
      });
      if(!res.ok){const errTxt=await res.text().catch(()=>"");throw new Error("HTTP "+res.status+(errTxt?" — "+errTxt.substring(0,200):""));}
      const data=await res.json();
      const reply=(data.content&&data.content[0]?.text)||data.reply||"Sin respuesta";
      chatMessages.push({role:"assistant",content:reply});
    }finally{clearTimeout(_tout)}
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

// ── AI Report (formato SES) ────────────────────────────────────────────────
async function generateReport(){
  if(!items.length){showToast("No hay ítems","warning");return}
  generatingReport=true;
  renderHeaderActions();

  try{
    const s=globalStats();
    const secs=analyzeSecciones();
    const evCount=EVIDENCIAS_SES.filter(ev=>evidencias[ev.id]).length;

    const seccionesDetail=secs.map(sec=>{
      const details=sec.items.map(i=>{
        const dc=docs.filter(d=>d.item_id===i.id).length;
        const stLabel=STATUS_CFG[i.status]?.label||i.status;
        return`- ${i.requirement} [${stLabel}] Evidencia: ${i.description||"—"} ${dc?`[${dc} verif.]`:"[SIN VERIF.]"} Obs: ${i.verification_notes||"—"}`;
      }).join("\n");
      return`## ${sec.num}) ${sec.label} — ${sec.cumple}/${sec.total} Cumple\n${details}`;
    }).join("\n\n");

    const planDetail=planMejora.map(pm=>`- Brecha: ${pm.brecha} → Acción: ${pm.accion} (${pm.responsable}, ${pm.plazo}) Indicador: ${pm.indicador}`).join("\n");

    const body={
      system:`Genera una RESPUESTA A FISCALIZACIÓN SES formal para la Superintendencia de Educación Superior de Chile. Estructura: 1) Política Integral, 2) Modelo de Prevención, 3) Investigación y Sanción, 4) Adecuación de Contratos, 5) Evidencias Adjuntas, 6) Conclusión Ejecutiva, 7) Plan de Mejora. Lenguaje formal institucional. Institución: Universidad de Magallanes (UMAG).`,
      max_tokens:4000,
      messages:[
        {role:"user",content:`Datos para informe SES:
- Total ítems: ${s.total}, Cumple: ${s.cumple}, Parcial: ${s.parcial}, No cumple: ${s.no_cumple}, Sin evaluar: ${s.sin_evaluar}
- Estado global: ${STATUS_CFG[s.estadoGlobal]?.label}
- Evidencias adjuntas: ${evCount}/${EVIDENCIAS_SES.length}
- Conclusión: ${conclusion.brechas||"No especificada"} / Medidas: ${conclusion.medidas_correctivas||"No especificadas"} / Responsable: ${conclusion.responsable||"No asignado"}

DETALLE POR SECCIÓN:
${seccionesDetail}

PLAN DE MEJORA:
${planDetail||"Sin plan de mejora definido"}

Fecha: ${new Date().toLocaleDateString("es-CL",{year:"numeric",month:"long",day:"numeric"})}`}
      ]
    };

    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),60000);
    try{
      const token=typeof session!=="undefined"?session?.access_token||"":"";
      const res=await fetch(_CHAT_EP,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-auth-token":token},
        body:JSON.stringify(body),
        signal:_ctrl.signal
      });
      if(!res.ok){
        const errData=await res.json().catch(()=>({}));
        throw new Error(errData.error||"HTTP "+res.status);
      }
      const data=await res.json();
      aiReport=(data.content&&data.content.filter(b=>b.type==="text").map(b=>b.text).join(""))||data.reply||"Error al generar";
      showToast("Informe SES generado con IA","success");
    }finally{clearTimeout(_tout)}
  }catch(e){
    showToast("Error: "+e.message,"error");
  }
  generatingReport=false;
  renderHeaderActions();
  renderBody();
}

// ── Excel Export (formato SES) ──────────────────────────────────────────────
function exportExcel(){
  const s=globalStats();
  let csv="\uFEFF";
  csv+="RESPUESTA A FISCALIZACIÓN SES 2026\n";
  csv+="Implementación Ley N° 21.369 — Universidad de Magallanes\n";
  csv+=`Fecha: ${new Date().toLocaleDateString("es-CL",{year:"numeric",month:"long",day:"numeric"})}\n\n`;

  SECCIONES.forEach(sec=>{
    const si=items.filter(i=>i.area===sec.id);
    csv+=`\n${sec.num}) ${sec.label}\n`;
    csv+="Ítem exigido,Cumple,Parcial,No cumple,Evidencia verificable,Observaciones / Acciones de mejora\n";
    si.forEach(i=>{
      const row=[
        i.requirement,
        i.status==="cumple"?"✅":"",
        i.status==="parcial"?"⚠️":"",
        i.status==="no_cumple"?"❌":"",
        i.description||"",
        i.verification_notes||""
      ];
      csv+=row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")+"\n";
    });
  });

  csv+="\n5) Evidencias Adjuntas\n";
  EVIDENCIAS_SES.forEach(ev=>{
    csv+=`"${evidencias[ev.id]?"✅":"⬜"}","${ev.label}"\n`;
  });

  csv+="\n6) Conclusión Ejecutiva\n";
  csv+=`"Estado global","${STATUS_CFG[conclusion.estado_global||s.estadoGlobal]?.label||""}"\n`;
  csv+=`"Brechas","${(conclusion.brechas||"").replace(/"/g,'""')}"\n`;
  csv+=`"Medidas correctivas","${(conclusion.medidas_correctivas||"").replace(/"/g,'""')}"\n`;
  csv+=`"Responsable","${(conclusion.responsable||"").replace(/"/g,'""')}"\n`;

  csv+="\n7) Plan de Mejora 2026–2027\n";
  csv+="Brecha,Acción,Responsable,Plazo,Indicador\n";
  planMejora.forEach(pm=>{
    csv+=[pm.brecha,pm.accion,pm.responsable,pm.plazo,pm.indicador].map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(",")+"\n";
  });

  csv+=`\nRESUMEN\nTotal ítems,${s.total}\nCumple,${s.cumple}\nParcial,${s.parcial}\nNo cumple,${s.no_cumple}\nSin evaluar,${s.sin_evaluar}\nCumplimiento,${s.pct}%\n`;

  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`Respuesta_SES_Ley21369_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Archivo SES exportado","success");
}

// ── Add Modal ───────────────────────────────────────────────────────────────
function showAddModal(preSeccion){
  const overlay=document.createElement("div");
  overlay.className="ley-modal-overlay";
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  overlay.innerHTML=`<div class="ley-modal">
    <h3>Nuevo ítem de cumplimiento SES</h3>
    <div class="ley-form-group"><label>Sección</label>
      <select class="ley-select" id="leyAddArea" style="width:100%">
        ${SECCIONES.map(s=>`<option value="${s.id}"${preSeccion===s.id?" selected":""}>${s.icon} ${s.num}) ${s.label}</option>`).join("")}
      </select></div>
    <div class="ley-form-group"><label>Ítem exigido *</label>
      <input class="ley-input" id="leyAddReq" placeholder="Ej: Protocolo de actuación aprobado"></div>
    <div class="ley-form-group"><label>Evidencia verificable</label>
      <textarea class="ley-textarea" id="leyAddDesc" rows="2" placeholder="Decretos, documentos, registros…"></textarea></div>
    <div class="ley-form-group"><label>Observaciones / Acciones de mejora</label>
      <textarea class="ley-textarea" id="leyAddNotes" rows="2"></textarea></div>
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
    if(!req.trim()){showToast("El ítem es obligatorio","warning");return}
    const seccion=overlay.querySelector("#leyAddArea").value;
    const user=await getUser(); if(!user){overlay.remove();return}
    try{
      const notes=overlay.querySelector("#leyAddNotes").value;
      const{error}=await sb.from("ley21369_items").insert({
        user_id:user.id, area:seccion, requirement:req.trim(),
        description:overlay.querySelector("#leyAddDesc").value?.trim()||null,
        verification_notes:notes?.trim()||null,
        responsible:overlay.querySelector("#leyAddResp").value?.trim()||null,
        due_date:overlay.querySelector("#leyAddDate").value||null,
        status:"sin_evaluar",
        sort_order:items.filter(i=>i.area===seccion).length+1
      });
      if(error){showToast("Error: "+error.message,"error");return}
      showToast("Ítem agregado","success");
      loadData();
    }catch(e){showToast("Error al agregar","error")}
    overlay.remove();
  };
  overlay.querySelector("#leyAddReq").focus();
}

// ── Reset to SES Template ──────────────────────────────────────────────────
async function resetToTemplate(){
  if(!confirm("¿Re-inicializar todos los ítems desde el template SES?\nEsto eliminará los ítems actuales y creará los 26 ítems del documento SES."))return;
  try{
    const user=await getUser(); if(!user)return;
    await sb.from("ley21369_documentos").delete().eq("user_id",user.id);
    await sb.from("ley21369_items").delete().eq("user_id",user.id);
    items=[];
    await seedFromTemplate();
    showToast("Ítems SES re-inicializados","success");
    loadData();
  }catch(e){showToast("Error al resetear: "+e.message,"error")}
}

// ── Main Render ─────────────────────────────────────────────────────────────
function render(){
  renderTabs();
  renderHeaderActions();
  renderBody();
}

// ── Public API ──────────────────────────────────────────────────────────────
window._ley21369={
  updateStatus,updateField,deleteItem,uploadDoc,downloadDoc,deleteDoc,
  uploadDocWithAI,confirmClassify,cancelClassify,reclassifyDoc,
  sendChat,generateReport,exportExcel,showAddModal,
  toggleEvidencia,updateConclusion,updateSeccionMeta,
  updatePlan,addPlanRow,removePlanRow,
  resetToTemplate,
  copyReport:()=>{if(aiReport){navigator.clipboard.writeText(aiReport);showToast("Copiado al portapapeles","success")}},
  closeReport:()=>{aiReport=null;renderBody()}
};

window.openLey21369=function(){
  ensureView();
  if(typeof showView==="function")showView("viewLey21369");
  if(!items.length)loadData(); else render();
};

// ── Auto-init ───────────────────────────────────────────────────────────────
console.log("%c🛡️ Módulo Ley 21.369 (SES 2026) cargado — Fiscalito","color:#7c3aed;font-weight:bold");
})();
