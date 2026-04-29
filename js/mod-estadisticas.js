(function(){
/**
 * MOD-ESTADISTICAS.JS — Dashboard Completo con Tabs y Chat IA
 * ═══════════════════════════════════════════════════════════
 * Estructura:
 *   Tab 1: Casos Activos (género, no género, cargos, finalización)
 *   Tab 2: Procedimientos Terminados (duración, participantes, diligencias)
 *   Chat IA: Consulta datos específicos de los casos
 * Dependencia: Chart.js (cargado en index.html)
 */

const STAT_COLORS={
  primary:'#4f46e5',primaryLight:'#818cf8',gold:'#f59e0b',
  green:'#059669',red:'#ef4444',blue:'#3b82f6',purple:'#7c3aed',
  cyan:'#06b6d4',orange:'#f97316',pink:'#ec4899',teal:'#14b8a6',
  slate:'#64748b',
  chartPalette:['#4f46e5','#06b6d4','#f59e0b','#059669','#ef4444','#7c3aed','#f97316','#ec4899','#14b8a6','#3b82f6','#64748b','#818cf8'],
};

const RESULTADO_LABELS={
  sancion_destitucion:'Destitución',propuesta_sancion_destitucion:'Prop. Destitución',
  sancion_multa:'Multa',propuesta_sancion_multa:'Prop. Multa',
  sancion_censura:'Censura',propuesta_sancion_censura:'Prop. Censura',
  sancion_suspension:'Suspensión',propuesta_sancion_suspension:'Prop. Suspensión',
  sobreseimiento:'Sobreseimiento',absuelto:'Absuelto',
  pendiente_resolucion:'Pendiente',pendiente:'Pendiente',
  informe_inhabilidad:'Inhabilidad',
};

const ESTAMENTO_LABELS={
  estudiante:'Estudiante',funcionario:'Funcionario',academico:'Académico',académico:'Académico',
  directivo:'Directivo',profesional:'Profesional',honorarios:'Honorarios',
  docente_honorario:'Doc. Honorario',otro:'Otro',
};

const CAT_LABELS_STAT={indagatoria_inicial:'Indagatoria inicial',termino_indagatoria:'Término Indagatoria',decision:'Decisión',discusion_prueba:'Discusión y Prueba',preparacion_vista:'Preparación de Vista',finalizacion:'Finalización',terminado:'Terminado'};
const ACTIVE_CAT_KEYS=['indagatoria_inicial','termino_indagatoria','decision','discusion_prueba','preparacion_vista','finalizacion'];

/* ═══ DÍAS HÁBILES UMAG ═══ */
function countBusinessDays(startDate,endDate){
  if(!startDate||!endDate)return null;
  const start=new Date(startDate),end=new Date(endDate);
  if(isNaN(start)||isNaN(end)||start>end)return null;
  let count=0;const d=new Date(start);
  while(d<=end){
    const dow=d.getDay(),month=d.getMonth(),date=d.getDate();
    if(dow!==0&&dow!==6){
      if(!(month===1||(month===6&&date>=15&&date<=21)||(month===8&&date>=15&&date<=21)||(month===11&&date>=25&&date<=31)))count++;
    }
    d.setDate(d.getDate()+1);
  }
  return count;
}

/* Usar función global unificada de mod-auto-subdivision.js */
function _statIsGenderCase(name,rol){
  if(typeof window.isGenderCase==='function') return window.isGenderCase({name:name,rol:rol});
  const p=/\d+\s*[-]?\s*G(?:\s|$|[^a-záéíóúñ])/;
  return p.test(name||'')||(name||'').toUpperCase().includes('-G')||p.test(rol||'');
}

function calcPrescripcion(fechaDenuncia,tipoProcedimiento){
  if(!fechaDenuncia)return null;
  const start=new Date(fechaDenuncia);if(isNaN(start))return null;
  const years=(tipoProcedimiento||'').toLowerCase().includes('estudiant')?2:4;
  const limit=new Date(start);limit.setFullYear(limit.getFullYear()+years);
  const diffDays=Math.ceil((limit-new Date())/(86400000));
  if(diffDays<0)return{status:'prescrito',days:diffDays,label:'PRESCRITO',color:STAT_COLORS.red};
  if(diffDays<=180)return{status:'urgente',days:diffDays,label:diffDays+' días',color:STAT_COLORS.red};
  if(diffDays<=365)return{status:'proximo',days:diffDays,label:Math.round(diffDays/30)+' meses',color:STAT_COLORS.gold};
  return{status:'ok',days:diffDays,label:Math.round(diffDays/365)+' años',color:STAT_COLORS.green};
}
/* Exponer como función global para evitar duplicación en otros módulos */
window.calcPrescripcion=calcPrescripcion;

/* ═══ CHART HELPERS ═══ */
const _statCharts={};
function destroyChart(id){if(_statCharts[id]){_statCharts[id].destroy();delete _statCharts[id];}}
function createChart(canvasId,config){
  destroyChart(canvasId);
  const el=document.getElementById(canvasId);if(!el)return null;
  _statCharts[canvasId]=new Chart(el.getContext('2d'),config);
  return _statCharts[canvasId];
}

function makePie(id,labels,data){
  return createChart(id,{type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:STAT_COLORS.chartPalette.slice(0,labels.length),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,padding:6,font:{size:10}}}}}
  });
}
function makeBar(id,labels,data,color,horiz){
  return createChart(id,{type:'bar',
    data:{labels,datasets:[{data,backgroundColor:color||STAT_COLORS.primary+'cc',borderRadius:4,maxBarThickness:40}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:horiz?'y':'x',plugins:{legend:{display:false}},
      scales:{x:{grid:{display:false}},y:{grid:{display:false},beginAtZero:true}}}
  });
}
function makeLine(id,labels,data,color){
  return createChart(id,{type:'line',
    data:{labels,datasets:[{label:'Casos',data,borderColor:color||STAT_COLORS.primary,backgroundColor:(color||STAT_COLORS.primary)+'20',fill:true,tension:.3,pointRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e2e8f015'}}}}
  });
}

/* ═══ UI HELPERS ═══ */
function kpiCard(label,value,icon,color){
  return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
    <div style="font-size:10.5px;color:var(--text-muted);display:flex;align-items:center;gap:4px">${icon} ${label}</div>
    <div style="font-size:20px;font-weight:700;color:${color||'var(--text)'}">${value}</div>
  </div>`;
}
function chartBox(id,title,desc,h){
  return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
    <div style="font-size:13px;font-weight:600;margin-bottom:2px">${title}</div>
    ${desc?`<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px">${desc}</div>`:''}
    <div style="height:${h||220}px"><canvas id="${id}"></canvas></div>
  </div>`;
}

/* ═══ STATE ═══ */
let _statsData=null;
let _statsActiveTab='activos';

/* ═══ MAIN LOAD ═══ */
async function loadStats(){
  if(!session)return;
  const el=document.getElementById('viewDashboard');if(!el)return;
  el.innerHTML='<div class="loading" style="padding:40px;text-align:center">Cargando estadísticas…</div>';

  try{
    /* Asegurar que los datos de etapas procesales estén cargados ANTES de clasificar.
       Esto es necesario para que getCaseCat() detecte correctamente probatorio, cargos, etc.
       basándose en la etapa procesal de cada caso (tabla etapas). */
    if(typeof loadSubdivisionData==='function'){
      try { await loadSubdivisionData(); } catch(e){ console.warn('[Stats] loadSubdivisionData warn:', e); }
    }

    const uid=session.user.id;

    /* Obtener IDs de casos compartidos conmigo para incluirlos en estadísticas */
    let sharedCaseIds=[];
    try{
      const{data:shares}=await sb.from('case_shares').select('case_id').eq('user_id',uid);
      if(shares?.length) sharedCaseIds=shares.map(s=>s.case_id);
    }catch(e){ console.warn('[Stats] case_shares query warn:', e); }

    /* Cargar solo MIS casos + los compartidos conmigo */
    const allMyIds=[]; // se llenará después del query
    const[rCases,rDils,rParts]=await Promise.all([
      sb.from('cases').select('id,name,nueva_resolucion,status,categoria,created_at,tipo_procedimiento,materia,protocolo,resultado,fecha_denuncia,fecha_recepcion_fiscalia,fecha_vista,fecha_resolucion,resolucion_termino,fecha_resolucion_termino,propuesta,observaciones,caratula,denunciantes,denunciados,estamentos_denunciante,estamentos_denunciado,carrera_denunciante,carrera_denunciado,duracion_dias,informe_final,drive_folder_url,numero_exp_interno,estado_procedimiento').is('deleted_at',null).or(`user_id.eq.${uid}${sharedCaseIds.length?',id.in.('+sharedCaseIds.join(',')+')':''}`),
      sb.from('diligencias').select('case_id,diligencia_type,is_processed'),
      sb.from('case_participants').select('case_id,role,estamento'),
    ]);

    const cases=rCases.data||[];
    if(!cases.length){el.innerHTML=renderEmptyStats();return;}
    /* Filtrar diligencias y participantes solo a MIS casos */
    const myCaseIds=new Set(cases.map(c=>c.id));
    const dils=(rDils.data||[]).filter(d=>myCaseIds.has(d.case_id));
    const parts=(rParts.data||[]).filter(p=>myCaseIds.has(p.case_id));

    /* Classify — getCaseCat() usa etapasMap (cargado arriba) + c.estado_procedimiento como fallback */
    const catGroups={indagatoria_inicial:[],termino_indagatoria:[],decision:[],discusion_prueba:[],preparacion_vista:[],finalizacion:[],terminado:[]};
    cases.forEach(c=>{
      const cat=(typeof getCaseCat==='function')?getCaseCat(c):'indagatoria_inicial';
      if(catGroups[cat])catGroups[cat].push(c);
      else catGroups.indagatoria_inicial.push(c);
    });

    const activos=ACTIVE_CAT_KEYS.flatMap(k=>catGroups[k]||[]);
    const terminados=catGroups.terminado;

    /* Orden cronológico ascendente: priorizar FECHA DE TÉRMINO/ENTREGA
       (fecha_resolucion_termino), luego fecha de vista fiscal y, por
       último, fecha de resolución / creación. Del más antiguo al más
       nuevo — como en la planilla del usuario, donde la última fila es
       la entregada el día de hoy. */
    terminados.sort((a,b)=>{
      const da=a.fecha_resolucion_termino||a.fecha_vista||a.fecha_resolucion||a.created_at||'';
      const db=b.fecha_resolucion_termino||b.fecha_vista||b.fecha_resolucion||b.created_at||'';
      return String(da).localeCompare(String(db));
    });

    /* Maps */
    const dilMap={};dils.forEach(d=>{(dilMap[d.case_id]=dilMap[d.case_id]||[]).push(d);});
    const partMap={};parts.forEach(p=>{(partMap[p.case_id]=partMap[p.case_id]||[]).push(p);});

    /* Duration for terminados */
    let totalDays=0,durCount=0;
    terminados.forEach(c=>{
      const days=c.duracion_dias||countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_vista);
      if(days&&days>0){totalDays+=days;durCount++;}
    });

    /* Prescripción for activos */
    const prescAlerts=[];
    activos.forEach(c=>{
      const p=calcPrescripcion(c.fecha_denuncia,c.tipo_procedimiento);
      if(p&&(p.status==='prescrito'||p.status==='urgente'))prescAlerts.push({case:c,presc:p});
    });

    /* Distributions */
    const dist={tipoProc:{},resultados:{},materias:{},protocolos:{},estDte:{},estDdo:{},monthly:{}};
    cases.forEach(c=>{
      const tp=c.tipo_procedimiento||'Sin definir'; dist.tipoProc[tp]=(dist.tipoProc[tp]||0)+1;
      if(c.resultado){const rl=RESULTADO_LABELS[c.resultado]||c.resultado;dist.resultados[rl]=(dist.resultados[rl]||0)+1;}
      if(c.materia){dist.materias[c.materia]=(dist.materias[c.materia]||0)+1;}
      if(c.protocolo){dist.protocolos[c.protocolo]=(dist.protocolos[c.protocolo]||0)+1;}
      const month=c.created_at?.substring(0,7);if(month)dist.monthly[month]=(dist.monthly[month]||0)+1;
    });

    const dilTypes={};dils.forEach(d=>{const t=d.diligencia_type||'otro';dilTypes[t]=(dilTypes[t]||0)+1;});

    _statsData={cases,activos,terminados,catGroups,dilMap,partMap,dils,parts,
      avgDuration:durCount?Math.round(totalDays/durCount):0,prescAlerts,dist,dilTypes};

    renderDashboard();
  }catch(err){
    el.innerHTML=`<div class="empty-state" style="padding:40px">⚠️ Error: ${esc(err.message)}</div>`;
  }
}

function renderEmptyStats(){
  return`<div class="empty-state" style="padding:40px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">📊</div>
    <div style="font-size:16px;font-weight:600">Sin casos registrados</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:8px">Crea tu primer expediente para ver estadísticas.</div>
  </div>`;
}

/* ═══ MAIN RENDER ═══ */
function renderDashboard(){
  const d=_statsData;if(!d)return;
  const el=document.getElementById('viewDashboard');if(!el)return;

  const isAct=_statsActiveTab==='activos';
  const isTerm=_statsActiveTab==='terminados';
  const isChat=_statsActiveTab==='chat';

  el.innerHTML=`<div style="padding:20px;display:flex;flex-direction:column;gap:16px;width:100%;box-sizing:border-box">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px">📊 Estadísticas de Casos</div>
        <div style="font-size:12px;color:var(--text-muted)">Resumen de tu gestión disciplinaria · ${d.cases.length} casos totales</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-sm" onclick="exportStatsXLSX()" title="Descargar Excel completo (activos + terminados, KPIs y distribuciones)" style="background:#107C41;color:#fff;font-weight:600">📊 Excel</button>
        <button class="btn-sm" onclick="exportTerminadosTemplateXLSX()" title="Repositorio de procedimientos finalizados (formato plantilla)" style="background:#1F4E78;color:#fff;font-weight:600">📋 Plantilla Terminados</button>
        <button class="btn-sm" onclick="enrichTerminadosFromDrive()" title="Completar datos faltantes (resolución término, fecha término, observaciones) desde el Drive de cada caso usando IA" style="background:#7c3aed;color:#fff;font-weight:600">🔍 Completar desde Drive</button>
        <button class="btn-sm" onclick="exportStatsCSV()" title="Exportar CSV plano">📥 CSV</button>
        <button class="btn-sm" onclick="loadStats()" title="Actualizar">↻</button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${kpiCard('Total',d.cases.length,'📁',STAT_COLORS.primary)}
      ${kpiCard('Activos',d.activos.length,'🔵',STAT_COLORS.blue)}
      ${kpiCard('Terminados',d.terminados.length,'✅',STAT_COLORS.green)}
      ${kpiCard('Duración Prom.',d.avgDuration?d.avgDuration+' días hábiles':'—','⏱️',STAT_COLORS.gold)}
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:4px;border-bottom:2px solid var(--border);padding-bottom:0">
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isAct?700:400};background:${isAct?'var(--gold)':'var(--surface)'};color:${isAct?'#fff':'var(--text-dim)'}" onclick="setStatsTab('activos')">
        📋 Casos Activos (${d.activos.length})
      </button>
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isTerm?700:400};background:${isTerm?'var(--gold)':'var(--surface)'};color:${isTerm?'#fff':'var(--text-dim)'}" onclick="setStatsTab('terminados')">
        ✅ Proc. Terminados (${d.terminados.length})
      </button>
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isChat?700:400};background:${isChat?'var(--gold)':'var(--surface)'};color:${isChat?'#fff':'var(--text-dim)'}" onclick="setStatsTab('chat')">
        💬 Chat IA
      </button>
    </div>

    <!-- Tab Content -->
    <div id="statsTabContent"></div>
  </div>`;

  setTimeout(()=>{
    if(isAct)renderActivosTab();
    else if(isTerm)renderTerminadosTab();
    else if(isChat)renderStatsChat();
  },50);
}

/* ═══ TAB: CASOS ACTIVOS ═══ */
function renderActivosTab(){
  const d=_statsData;if(!d)return;
  const el=document.getElementById('statsTabContent');if(!el)return;

  const cg=d.catGroups;
  const prescHtml=d.prescAlerts.length>0?d.prescAlerts.slice(0,8).map(a=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${a.presc.color}15;border-left:3px solid ${a.presc.color};border-radius:4px;margin-bottom:4px">
      <span style="font-size:11px;font-weight:600;color:${a.presc.color}">${a.presc.status==='prescrito'?'⛔':'⚠️'} ${a.presc.label}</span>
      <span style="font-size:11px;color:var(--text-dim)">${esc(a.case.nueva_resolucion||a.case.name)}</span>
    </div>`).join(''):'<div style="font-size:11px;color:var(--text-muted);padding:8px">✅ Sin alertas de prescripción</div>';

  el.innerHTML=`
    <!-- Subcategorías activos -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
      ${kpiCard('♀ Género',cg.genero.length,'',STAT_COLORS.pink)}
      ${kpiCard('📄 No Género',cg.no_genero.length,'',STAT_COLORS.blue)}
      ${kpiCard('⚖️ Cargos',cg.cargos.length,'',STAT_COLORS.orange)}
      ${kpiCard('🔍 Probatorio',cg.probatorio.length,'',STAT_COLORS.purple)}
      ${kpiCard('📋 Finalización',cg.finalizacion.length,'',STAT_COLORS.cyan)}
    </div>

    <!-- KPIs adicionales -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${kpiCard('Diligencias',d.dils.filter(dl=>d.activos.some(c=>c.id===dl.case_id)).length,'📋',STAT_COLORS.cyan)}
      ${kpiCard('Participantes',d.parts.filter(p=>d.activos.some(c=>c.id===p.case_id)).length,'👥',STAT_COLORS.purple)}
      ${kpiCard('Con Drive',d.activos.filter(c=>c.drive_folder_url).length+'/'+d.activos.length,'📁',STAT_COLORS.teal)}
      ${kpiCard('Prescripción ⚠️',d.prescAlerts.length,'⏰',d.prescAlerts.length>0?STAT_COLORS.red:STAT_COLORS.green)}
    </div>

    <!-- Prescripción -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">⏰ Alertas de Prescripción ${d.prescAlerts.length>0?'<span style="background:'+STAT_COLORS.red+';color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:6px">'+d.prescAlerts.length+'</span>':''}</div>
      ${prescHtml}
    </div>

    <!-- Charts activos -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:16px">
      ${chartBox('chartActTipoProc','Tipo de Procedimiento (Activos)','')}
      ${chartBox('chartActMateria','Materia','')}
      ${chartBox('chartActCategoria','Distribución por Categoría','')}
      ${chartBox('chartActProtocolo','Protocolo / Normativa','')}
    </div>

    <!-- Trend -->
    ${chartBox('chartActTrend','📈 Tendencia Mensual (Casos Creados)','Últimos 12 meses',200)}

    <!-- Lista por categoría -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-top:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">📋 Detalle por Categoría</div>
      ${ACTIVE_CAT_KEYS.map(cat=>{
        const list=cg[cat]||[];
        if(!list.length)return'';
        return`<details style="margin-bottom:8px">
          <summary style="cursor:pointer;font-size:12px;font-weight:600;padding:6px 0;color:var(--text-dim)">${CAT_LABELS_STAT[cat]||cat} (${list.length} casos)</summary>
          <div style="padding:4px 0 8px 12px;font-size:11px;color:var(--text-dim)">
            ${list.map(c=>`<div style="padding:2px 0">• ${esc(c.nueva_resolucion||c.name)} — ${c.tipo_procedimiento||'—'} — ${c.materia||'—'}</div>`).join('')}
          </div>
        </details>`;
      }).join('')}
    </div>
  `;

  /* Draw charts */
  setTimeout(()=>{
    /* Tipo procedimiento activos */
    const tpAct={};d.activos.forEach(c=>{const t=c.tipo_procedimiento||'Sin definir';tpAct[t]=(tpAct[t]||0)+1;});
    if(Object.keys(tpAct).length)makePie('chartActTipoProc',Object.keys(tpAct),Object.values(tpAct));

    /* Materia activos */
    const matAct={};d.activos.forEach(c=>{const m=c.materia||'Sin definir';matAct[m]=(matAct[m]||0)+1;});
    if(Object.keys(matAct).length)makePie('chartActMateria',Object.keys(matAct),Object.values(matAct));

    /* Etapa procesal — antes era "Género/No Género/Cargos…", ahora refleja la nueva taxonomía por etapa */
    const catData=ACTIVE_CAT_KEYS.map(k=>d.catGroups[k]?.length||0);
    const catLabels=ACTIVE_CAT_KEYS.map(k=>CAT_LABELS_STAT[k]||k);
    makePie('chartActCategoria',catLabels,catData);

    /* Protocolo */
    const protAct={};d.activos.forEach(c=>{if(c.protocolo)protAct[c.protocolo]=(protAct[c.protocolo]||0)+1;});
    if(Object.keys(protAct).length)makePie('chartActProtocolo',Object.keys(protAct),Object.values(protAct));

    /* Trend */
    const months=Object.keys(d.dist.monthly).sort().slice(-12);
    /* HIGH#7 FIX: parseInt puede dar NaN si mon es corrupto → proteger con fallback */
    const mLabels=months.map(m=>{const[y,mon]=m.split('-');const mi=parseInt(mon,10);return(isNaN(mi)?'???':['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mi-1]||'???')+' '+(y||'??').slice(-2);});
    if(months.length)makeLine('chartActTrend',mLabels,months.map(m=>d.dist.monthly[m]||0));
  },100);
}

/* ═══ TAB: TERMINADOS ═══ */
function renderTerminadosTab(){
  const d=_statsData;if(!d)return;
  const el=document.getElementById('statsTabContent');if(!el)return;
  const t=d.terminados;

  /* ── Duration stats ── */
  const durations=[];
  t.forEach(c=>{
    const days=c.duracion_dias||countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_vista);
    if(days&&days>0)durations.push({case:c,days,months:+(days/21).toFixed(1)});
  });
  durations.sort((a,b)=>a.days-b.days);
  const avgDays=durations.length?Math.round(durations.reduce((s,x)=>s+x.days,0)/durations.length):0;
  const avgMonths=(avgDays/21).toFixed(1);

  /* Duration ranges (months) */
  const durRanges={'<2 meses':0,'2-4 meses':0,'4-6 meses':0,'6-12 meses':0,'>12 meses':0};
  durations.forEach(({days})=>{
    if(days<42)durRanges['<2 meses']++;
    else if(days<84)durRanges['2-4 meses']++;
    else if(days<126)durRanges['4-6 meses']++;
    else if(days<252)durRanges['6-12 meses']++;
    else durRanges['>12 meses']++;
  });

  /* ── Terminados por mes y año ── */
  const termByMonth={};
  t.forEach(c=>{
    const fv=c.fecha_vista||c.created_at;
    if(fv){const m=fv.substring(0,7);termByMonth[m]=(termByMonth[m]||0)+1;}
  });

  /* ── Protocolo aplicable ── */
  const protocolos={};
  t.forEach(c=>{const p=c.protocolo||'Sin protocolo';protocolos[p]=(protocolos[p]||0)+1;});

  /* ── Materia ── */
  const materias={};
  t.forEach(c=>{const m=c.materia||'Sin definir';materias[m]=(materias[m]||0)+1;});

  /* ── Estamento denunciante ── */
  const estDte={};
  t.forEach(c=>{
    const e=c.estamentos_denunciante;
    if(e){
      const arr=Array.isArray(e)?e:typeof e==='string'?e.split(','):[];
      arr.forEach(v=>{const k=v.trim().toLowerCase();if(k)estDte[ESTAMENTO_LABELS[k]||k]=(estDte[ESTAMENTO_LABELS[k]||k]||0)+1;});
    } else { estDte['Sin dato']=(estDte['Sin dato']||0)+1; }
  });

  /* ── Estamento denunciado ── */
  const estDdo={};
  t.forEach(c=>{
    const e=c.estamentos_denunciado;
    if(e){
      const arr=Array.isArray(e)?e:typeof e==='string'?e.split(','):[];
      arr.forEach(v=>{const k=v.trim().toLowerCase();if(k)estDdo[ESTAMENTO_LABELS[k]||k]=(estDdo[ESTAMENTO_LABELS[k]||k]||0)+1;});
    } else { estDdo['Sin dato']=(estDdo['Sin dato']||0)+1; }
  });

  /* ── Carrera denunciantes y denunciados ── */
  const carreraDte={};
  t.forEach(c=>{const k=c.carrera_denunciante||'Sin carrera';carreraDte[k]=(carreraDte[k]||0)+1;});
  const carreraDdo={};
  t.forEach(c=>{const k=c.carrera_denunciado||'Sin carrera';carreraDdo[k]=(carreraDdo[k]||0)+1;});

  /* ── Tipo de procedimiento ── */
  const tpTerm={};
  t.forEach(c=>{const tp=c.tipo_procedimiento||'Sin definir';tpTerm[tp]=(tpTerm[tp]||0)+1;});

  /* ── Resultado final ── */
  const resTerminados={};
  t.forEach(c=>{if(c.resultado){const r=RESULTADO_LABELS[c.resultado]||c.resultado;resTerminados[r]=(resTerminados[r]||0)+1;}});

  /* ── Con/sin informe ── */
  const conInforme=t.filter(c=>c.informe_final&&c.informe_final.length>100).length;

  el.innerHTML=`
    <!-- KPIs terminados -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
      ${kpiCard('Total Terminados',t.length,'✅',STAT_COLORS.green)}
      ${kpiCard('Duración Prom.',avgMonths+' meses','📅',STAT_COLORS.gold)}
      ${kpiCard('Días Hábiles Prom.',avgDays,'⏱️',STAT_COLORS.blue)}
      ${kpiCard('Con Informe/Vista',conInforme+'/'+t.length,'📄',STAT_COLORS.teal)}
      ${kpiCard('Con Resultado',Object.values(resTerminados).reduce((s,v)=>s+v,0)+'/'+t.length,'⚖️',STAT_COLORS.purple)}
    </div>

    <!-- 1. Meses de duración -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">⏱️ Duración de Tramitación (Meses)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${chartBox('chartTermDurRango','Distribución por Rango','',200)}
        ${chartBox('chartTermDurMeses','Meses por Caso (Top 20 más largos)','',200)}
      </div>
    </div>

    <!-- 2. Terminados por mes y año -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">📅 Terminados por Mes y Año</div>
      <div style="height:220px"><canvas id="chartTermByMonth"></canvas></div>
    </div>

    <!-- Grid 2x2: Protocolo + Materia + Tipo Procedimiento + Resultado -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:14px">
      ${chartBox('chartTermProtocolo','📜 Protocolo Aplicable','')}
      ${chartBox('chartTermMateria','📂 Materia','')}
      ${chartBox('chartTermTipoProc','⚙️ Tipo de Procedimiento','')}
      ${chartBox('chartTermResultado','⚖️ Resultado Final','')}
    </div>

    <!-- Grid 2x2: Estamentos + Carreras -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:14px">
      ${chartBox('chartTermEstDte','👤 Estamento Denunciante','')}
      ${chartBox('chartTermEstDdo','👤 Estamento Denunciado/a','')}
      ${chartBox('chartTermCarreraDte','🎓 Carrera Denunciante','')}
      ${chartBox('chartTermCarreraDdo','🎓 Carrera Denunciado/a','')}
    </div>

    <!-- Top casos más largos -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">🏆 Top 15 Casos por Duración</div>
      <div style="max-height:300px;overflow-y:auto;font-size:11px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:2px solid var(--border);text-align:left">
            <th style="padding:4px 6px;font-size:10px">#</th>
            <th style="padding:4px 6px;font-size:10px">Resolución</th>
            <th style="padding:4px 6px;font-size:10px">Tipo</th>
            <th style="padding:4px 6px;font-size:10px">Materia</th>
            <th style="padding:4px 6px;font-size:10px">Resultado</th>
            <th style="padding:4px 6px;font-size:10px;text-align:right">Días</th>
            <th style="padding:4px 6px;font-size:10px;text-align:right">Meses</th>
          </tr></thead>
          <tbody>
            ${durations.slice(-15).reverse().map((x,i)=>`
              <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:3px 6px;font-weight:600;color:var(--text-muted)">${i+1}</td>
                <td style="padding:3px 6px">${esc(x.case.nueva_resolucion||x.case.name)}</td>
                <td style="padding:3px 6px;color:var(--text-dim);font-size:10px">${esc(x.case.tipo_procedimiento||'—')}</td>
                <td style="padding:3px 6px;color:var(--text-dim);font-size:10px">${esc(x.case.materia||'—')}</td>
                <td style="padding:3px 6px;color:var(--text-dim);font-size:10px">${esc(RESULTADO_LABELS[x.case.resultado]||x.case.resultado||'—')}</td>
                <td style="padding:3px 6px;text-align:right;font-weight:600;color:${x.days>252?STAT_COLORS.red:x.days>126?STAT_COLORS.gold:STAT_COLORS.green}">${x.days}</td>
                <td style="padding:3px 6px;text-align:right;color:var(--text-dim)">${x.months}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  /* ── Draw all charts ── */
  setTimeout(()=>{
    /* 1. Duración por rango */
    makeBar('chartTermDurRango',Object.keys(durRanges),Object.values(durRanges),STAT_COLORS.blue+'cc');

    /* 2. Meses por caso (top 20 más largos) */
    const top20=durations.slice(-20).reverse();
    makeBar('chartTermDurMeses',
      top20.map(x=>(x.case.nueva_resolucion||'').substring(0,15)),
      top20.map(x=>x.months),
      STAT_COLORS.gold+'cc',true);

    /* 3. Terminados por mes y año */
    const tbmKeys=Object.keys(termByMonth).sort();
    const tbmLabels=tbmKeys.map(m=>{const[y,mon]=m.split('-');return['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mon)-1]+' '+y.slice(2);});
    if(tbmKeys.length)makeBar('chartTermByMonth',tbmLabels,tbmKeys.map(k=>termByMonth[k]),STAT_COLORS.green+'cc');

    /* 4. Protocolo */
    if(Object.keys(protocolos).length)makePie('chartTermProtocolo',Object.keys(protocolos),Object.values(protocolos));

    /* 5. Materia */
    if(Object.keys(materias).length)makePie('chartTermMateria',Object.keys(materias),Object.values(materias));

    /* 6. Tipo procedimiento */
    if(Object.keys(tpTerm).length)makePie('chartTermTipoProc',Object.keys(tpTerm),Object.values(tpTerm));

    /* 7. Resultado final */
    if(Object.keys(resTerminados).length)makeBar('chartTermResultado',Object.keys(resTerminados),Object.values(resTerminados),STAT_COLORS.green+'cc',true);

    /* 8. Estamento denunciante */
    if(Object.keys(estDte).length)makePie('chartTermEstDte',Object.keys(estDte),Object.values(estDte));

    /* 9. Estamento denunciado */
    if(Object.keys(estDdo).length)makePie('chartTermEstDdo',Object.keys(estDdo),Object.values(estDdo));

    /* 10. Carrera denunciante */
    const cdLabels=Object.keys(carreraDte).filter(k=>k!=='Sin carrera');
    const sinCarreraDte=carreraDte['Sin carrera']||0;
    if(cdLabels.length)makeBar('chartTermCarreraDte',cdLabels,cdLabels.map(k=>carreraDte[k]),STAT_COLORS.pink+'cc',true);
    else{const cv=document.getElementById('chartTermCarreraDte');if(cv)cv.parentElement.innerHTML=`<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:40px">Sin carreras extraídas aún (${sinCarreraDte} casos)<br><br>Usa "🎓 Extraer carreras de informes" en la pestaña Terminados</div>`;}

    /* 11. Carrera denunciado */
    const cddLabels=Object.keys(carreraDdo).filter(k=>k!=='Sin carrera');
    const sinCarreraDdo=carreraDdo['Sin carrera']||0;
    if(cddLabels.length)makeBar('chartTermCarreraDdo',cddLabels,cddLabels.map(k=>carreraDdo[k]),STAT_COLORS.purple+'cc',true);
    else{const cv=document.getElementById('chartTermCarreraDdo');if(cv)cv.parentElement.innerHTML=`<div style="text-align:center;color:var(--text-muted);font-size:11px;padding:40px">Sin carreras extraídas aún (${sinCarreraDdo} casos)<br><br>Usa "🎓 Extraer carreras de informes" en la pestaña Terminados</div>`;}

  },100);
}

/* ═══ TAB: CHAT IA ═══ */
let _statsChatHistory=[];
/* Metadatos por respuesta del asistente (para exportar a Excel solo los casos referenciados) */
let _statsChatRefs={};        /* msgId → { resoluciones:[...], scope:'activos|terminados|ambos', query, reply, ts } */
let _statsChatNextMsgId=1;

function renderStatsChat(){
  const el=document.getElementById('statsTabContent');if(!el)return;
  el.innerHTML=`
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;display:flex;flex-direction:column;height:500px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        💬 Chat IA — Consulta datos de tus casos
        <span style="font-size:10px;color:var(--text-muted);font-weight:400">Pregunta sobre estadísticas, plazos, participantes, diligencias, etc.</span>
      </div>

      <!-- Chips rápidos -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px">
        ${['¿Cuántos casos de acoso sexual hay?','¿Cuál es el caso más largo?','Dame un resumen de los casos con perspectiva de género','¿Qué casos tienen prescripción próxima?','¿Cuántos casos por tipo de procedimiento?','¿Qué carreras tienen más denuncias?'].map(q=>
          `<button class="btn-sm" style="font-size:10px;padding:3px 8px" onclick="statsChatSend('${q.replace(/'/g,"\\'")}')">💡 ${q.length>35?q.substring(0,35)+'…':q}</button>`
        ).join('')}
      </div>

      <!-- Messages -->
      <div id="statsChatMsgs" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg);margin-bottom:10px">
        <div style="font-size:11px;color:var(--text-muted);text-align:center;padding:20px">
          Pregúntame cualquier cosa sobre tus ${_statsData?.cases?.length||0} casos.<br>
          Tengo acceso a todos los datos: categorías, materias, procedimientos, participantes, diligencias, plazos y resultados.
        </div>
      </div>

      <!-- Input -->
      <div style="display:flex;gap:6px">
        <input type="text" id="statsChatInput" placeholder="Pregunta sobre tus casos…"
          style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);font-size:12px;font-family:var(--font-body);background:var(--surface);color:var(--text)"
          onkeydown="if(event.key==='Enter')statsChatSend()">
        <button class="btn-sm" style="background:var(--gold);color:#fff;padding:8px 14px;font-weight:600" onclick="statsChatSend()">Enviar</button>
      </div>
    </div>
  `;
}

async function statsChatSend(quickQ){
  const input=document.getElementById('statsChatInput');
  const msgs=document.getElementById('statsChatMsgs');
  const text=quickQ||input?.value?.trim();
  if(!text||!_statsData||!msgs)return;
  if(input)input.value='';

  /* Add user message */
  msgs.innerHTML+=`<div style="align-self:flex-end;background:var(--gold);color:#fff;padding:6px 12px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:12px">${esc(text)}</div>`;
  msgs.innerHTML+=`<div id="statsChatTyping" style="align-self:flex-start;color:var(--text-muted);font-size:11px;padding:6px">⏳ Analizando datos…</div>`;
  msgs.scrollTop=msgs.scrollHeight;

  /* Build data summary for context (truncated to avoid token overflow) */
  const d=_statsData;
  const _maxCases=80;
  const _activosList=d.activos.slice(0,_maxCases).map(c=>`- ${c.nueva_resolucion||c.name} | Cat: ${c.categoria} | Tipo: ${c.tipo_procedimiento||'—'} | Materia: ${c.materia||'—'} | Protocolo: ${c.protocolo||'—'} | Carrera Dte: ${c.carrera_denunciante||'—'} | Carrera Ddo: ${c.carrera_denunciado||'—'}`).join('\n');
  const _termList=d.terminados.slice(0,_maxCases).map(c=>`- ${c.nueva_resolucion||c.name} | Tipo: ${c.tipo_procedimiento||'—'} | Resultado: ${RESULTADO_LABELS[c.resultado]||c.resultado||'—'} | Duración: ${c.duracion_dias||'—'} días | Materia: ${c.materia||'—'} | Carrera Dte: ${c.carrera_denunciante||'—'} | Carrera Ddo: ${c.carrera_denunciado||'—'}`).join('\n');
  const dataSummary=`DATOS DE CASOS FISCALITO (${d.cases.length} casos totales):

DISTRIBUCIÓN POR ETAPA PROCESAL:
- Indagatoria inicial: ${d.catGroups.indagatoria_inicial.length} casos
- Término Indagatoria: ${d.catGroups.termino_indagatoria.length} casos
- Decisión: ${d.catGroups.decision.length} casos
- Discusión y Prueba: ${d.catGroups.discusion_prueba.length} casos
- Preparación de Vista: ${d.catGroups.preparacion_vista.length} casos
- Finalización: ${d.catGroups.finalizacion.length} casos
- Terminados: ${d.terminados.length} casos

DURACIÓN PROMEDIO: ${d.avgDuration} días hábiles

ALERTAS PRESCRIPCIÓN: ${d.prescAlerts.length} (${d.prescAlerts.map(a=>a.case.nueva_resolucion+': '+a.presc.label).join(', ')||'ninguna'})

DISTRIBUCIÓN POR TIPO PROCEDIMIENTO: ${Object.entries(d.dist.tipoProc).map(([k,v])=>k+': '+v).join(', ')}

DISTRIBUCIÓN POR MATERIA: ${Object.entries(d.dist.materias).map(([k,v])=>k+': '+v).join(', ')||'sin datos'}

RESULTADOS: ${Object.entries(d.dist.resultados).map(([k,v])=>k+': '+v).join(', ')||'sin datos'}

DILIGENCIAS: ${d.dils.length} total
PARTICIPANTES: ${d.parts.length} total

LISTA DE CASOS ACTIVOS (${d.activos.length}):
${_activosList}${d.activos.length>_maxCases?`\n... y ${d.activos.length-_maxCases} casos más`:''}

LISTA DE CASOS TERMINADOS (${d.terminados.length}):
${_termList}${d.terminados.length>_maxCases?`\n... y ${d.terminados.length-_maxCases} casos más`:''}`.substring(0,12000);

  try{
    _statsChatHistory.push({role:'user',content:text});
    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),55000);
    try{
      const r=await authFetch(CHAT_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:typeof CLAUDE_SONNET !== 'undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
          max_tokens:2000,
          system:`Eres Fiscalito, asistente de estadísticas de procedimientos disciplinarios de la Universidad de Magallanes.
Tienes acceso a TODOS los datos de los casos del usuario. Responde con datos precisos, cifras exactas y análisis útil.
Usa tablas cuando sea apropiado. Sé conciso pero completo.
Si te piden datos que no están en el contexto, indícalo.

REGLA OBLIGATORIA DE EXPORTACIÓN A EXCEL:
Al final de CADA respuesta, SIEMPRE incluye un bloque oculto exactamente con este formato (incluidos los corchetes literales) para permitir descargar la respuesta como Excel:

[CASOS_REFERENCIADOS]
{"resoluciones": ["FU-001/2024", "FU-002/2024"], "scope": "activos", "titulo": "Casos de acoso sexual activos"}
[/CASOS_REFERENCIADOS]

Reglas del bloque:
- "resoluciones": array con los identificadores EXACTOS de los casos que tu respuesta menciona o usa (campo "nueva_resolucion" o "name" tal como aparece en el contexto). Si la pregunta es sobre TODOS los casos de una categoría, incluye los identificadores de todos los que apliquen (lista completa, no truncar). Si no se refiere a casos específicos (p. ej. una pregunta general sobre cifras agregadas), usa [].
- "scope": "activos" | "terminados" | "ambos" según corresponda.
- "titulo": etiqueta corta (≤80 chars) que describa el resultado, será el nombre de la hoja Excel.
- El bloque va al final, separado por una línea en blanco. NO lo expliques al usuario, debe verse como cierre técnico.

${dataSummary}`,
          messages:_statsChatHistory.slice(-10)
        }),
        signal:_ctrl.signal
      });

      const typing=document.getElementById('statsChatTyping');
      if(typing)typing.remove();

      if(!r.ok){
        let errDetail=`HTTP ${r.status}`;
        try{const eb=await r.json();errDetail=eb.error||eb.message||JSON.stringify(eb).substring(0,200);}catch(_){}
        _statsChatHistory.pop(); /* remove failed user message from history */
        msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ Error ${r.status}: ${typeof esc==='function'?esc(errDetail):errDetail}</div>`;
        return;
      }
      const data=await r.json();
      /* Handle Anthropic error wrapped in 200 (shouldn't happen anymore but defensive) */
      if(data.type==='error'||data.error){
        const errMsg=data.error?.message||data.error||'Error desconocido del modelo';
        _statsChatHistory.pop();
        msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ ${typeof esc==='function'?esc(String(errMsg)):errMsg}</div>`;
        return;
      }
      const reply=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'Sin respuesta.';

      /* Parsear bloque [CASOS_REFERENCIADOS] para habilitar exportación a Excel */
      let visibleReply=reply;
      let refMeta=null;
      const refMatch=reply.match(/\[CASOS_REFERENCIADOS\]\s*([\s\S]*?)\s*\[\/CASOS_REFERENCIADOS\]/i);
      if(refMatch){
        visibleReply=reply.replace(refMatch[0],'').trim();
        try{
          const parsed=JSON.parse(refMatch[1]);
          const arr=Array.isArray(parsed.resoluciones)?parsed.resoluciones.filter(x=>typeof x==='string'&&x.trim()):[];
          if(arr.length){
            refMeta={
              resoluciones:arr,
              scope:(['activos','terminados','ambos'].includes(parsed.scope))?parsed.scope:'ambos',
              titulo:(typeof parsed.titulo==='string'&&parsed.titulo.trim())?parsed.titulo.trim().substring(0,80):'Consulta IA',
              query:text,
              reply:visibleReply,
              ts:new Date().toISOString()
            };
          }
        }catch(e){console.warn('[stats-chat] no se pudo parsear CASOS_REFERENCIADOS:',e.message);}
      }
      /* Guardar en el historial el texto visible (sin el bloque oculto), para no contaminar turnos siguientes */
      _statsChatHistory.push({role:'assistant',content:visibleReply});

      const msgId=_statsChatNextMsgId++;
      let exportBtnHtml='';
      if(refMeta){
        _statsChatRefs[msgId]=refMeta;
        exportBtnHtml=`<div style="margin-top:6px;display:flex;justify-content:flex-start">
          <button class="btn-sm" onclick="exportChatXLSX(${msgId})" title="Descargar estos ${refMeta.resoluciones.length} caso(s) en Excel"
            style="background:#107C41;color:#fff;font-size:10.5px;padding:4px 10px;border-radius:6px;font-weight:600;border:none;cursor:pointer">
            📊 Descargar Excel · ${refMeta.resoluciones.length} caso${refMeta.resoluciones.length===1?'':'s'} (${esc(refMeta.scope)})
          </button>
        </div>`;
      }

      msgs.innerHTML+=`<div data-stats-msg-id="${msgId}" style="align-self:flex-start;max-width:90%;display:flex;flex-direction:column">
        <div style="background:var(--surface2);border:1px solid var(--border);padding:10px 14px;border-radius:2px 12px 12px 12px;font-size:12px;line-height:1.6">${md(visibleReply)}</div>
        ${exportBtnHtml}
      </div>`;
      msgs.scrollTop=msgs.scrollHeight;

    }finally{
      clearTimeout(_tout);
    }
  }catch(err){
    const typing=document.getElementById('statsChatTyping');if(typing)typing.remove();
    msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ ${typeof esc==='function'?esc(err.message):err.message}</div>`;
  }
}

/* ═══ EXPORT CSV ═══ */
async function exportStatsCSV(){
  if(!session||!allCases?.length){showToast('⚠ Sin datos');return;}
  showToast('📥 Generando CSV…');
  const headers=['Nombre','Resolución que instruye','Estado','Categoría','Tipo Procedimiento','Materia','Protocolo','Resultado','Fecha Denuncia','Fecha Recepción','Fecha Vista','Denunciante(s)','Denunciado/a(s)','Est. Denunciante','Est. Denunciado','Carrera Dte.','Carrera Ddo.','Duración (días)'];
  const rows=(allCases||[]).map(c=>[
    c.name,c.nueva_resolucion||'',c.status||'',c.categoria||'',c.tipo_procedimiento||'',c.materia||'',c.protocolo||'',
    c.resultado||'',c.fecha_denuncia||'',c.fecha_recepcion_fiscalia||'',c.fecha_vista||'',
    Array.isArray(c.denunciantes)?c.denunciantes.join('; '):c.denunciantes||'',
    Array.isArray(c.denunciados)?c.denunciados.join('; '):c.denunciados||'',
    Array.isArray(c.estamentos_denunciante)?c.estamentos_denunciante.join('; '):c.estamentos_denunciante||'',
    Array.isArray(c.estamentos_denunciado)?c.estamentos_denunciado.join('; '):c.estamentos_denunciado||'',
    c.carrera_denunciante||'',c.carrera_denunciado||'',c.duracion_dias||'',
  ]);
  const csv='\uFEFF'+[headers,...rows].map(r=>r.map(v=>'"'+(v||'').toString().replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='estadisticas_fiscalito_'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();URL.revokeObjectURL(a.href);
  showToast('✅ CSV descargado');
}

/* ═══════════════════════════════════════════════════════════
   EXPORTACIÓN A EXCEL (XLSX)
   - exportStatsXLSX()       → workbook completo (snapshot)
   - exportChatXLSX(msgId)   → solo casos referenciados por una respuesta del chat IA
   Usa la librería SheetJS (XLSX) ya cargada en index.html.
   ═══════════════════════════════════════════════════════════ */

function _xlsxLib(){return (typeof window!=='undefined'&&window.XLSX)?window.XLSX:null;}

function _xlsxFmtArr(v){
  if(v===null||v===undefined||v==='')return'';
  if(Array.isArray(v))return v.filter(Boolean).join(', ');
  try{const a=JSON.parse(v);return Array.isArray(a)?a.filter(Boolean).join(', '):String(v);}
  catch{return String(v);}
}
function _xlsxFmtFecha(v){
  if(!v)return'';
  const iso=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso)return`${iso[3]}-${iso[2]}-${iso[1]}`;
  return String(v);
}
function _xlsxUserSlug(){
  try{
    const u=session?.user?.email||'';
    const slug=u.split('@')[0]||'usuario';
    return slug.replace(/[^a-z0-9_-]/gi,'_');
  }catch{return'usuario';}
}
function _xlsxSheetName(name){
  /* Excel: máx 31 chars, sin []:*?/\ */
  return String(name||'Hoja').replace(/[\[\]:*?\/\\]/g,'').substring(0,31)||'Hoja';
}

/* Columnas estándar para hojas detalladas de casos */
const _XLSX_CASE_HEADERS_ACTIVOS=[
  'Resolución','Nombre','Categoría','Tipo Procedimiento','Materia','Protocolo',
  'Estado Procedimiento','Fecha Denuncia','Fecha Recepción Fiscalía',
  'Denunciante(s)','Estamento Dte.','Carrera Dte.',
  'Denunciado/a(s)','Estamento Ddo.','Carrera Ddo.',
  'Días para Prescripción','Estado Prescripción','Drive'
];
const _XLSX_CASE_HEADERS_TERMINADOS=[
  'Resolución','Nombre','Tipo Procedimiento','Materia','Protocolo','Resultado',
  'Fecha Denuncia','Fecha Recepción Fiscalía','Fecha Vista',
  'Duración (días hábiles)','Duración (meses)',
  'Denunciante(s)','Estamento Dte.','Carrera Dte.',
  'Denunciado/a(s)','Estamento Ddo.','Carrera Ddo.',
  'Con Informe Final','Drive'
];

function _xlsxRowActivo(c){
  const presc=calcPrescripcion(c.fecha_denuncia,c.tipo_procedimiento);
  return [
    c.nueva_resolucion||'',
    c.name||'',
    (typeof getCaseCat==='function')?getCaseCat(c):(c.categoria||''),
    c.tipo_procedimiento||'',
    c.materia||'',
    c.protocolo||'',
    c.estado_procedimiento||'',
    _xlsxFmtFecha(c.fecha_denuncia),
    _xlsxFmtFecha(c.fecha_recepcion_fiscalia),
    _xlsxFmtArr(c.denunciantes),
    _xlsxFmtArr(c.estamentos_denunciante),
    c.carrera_denunciante||'',
    _xlsxFmtArr(c.denunciados),
    _xlsxFmtArr(c.estamentos_denunciado),
    c.carrera_denunciado||'',
    presc?presc.days:'',
    presc?presc.label:'',
    c.drive_folder_url?'Sí':'No'
  ];
}
function _xlsxRowTerminado(c){
  const days=c.duracion_dias||countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_vista)||'';
  const months=(typeof days==='number'&&days>0)?+(days/21).toFixed(1):'';
  return [
    c.nueva_resolucion||'',
    c.name||'',
    c.tipo_procedimiento||'',
    c.materia||'',
    c.protocolo||'',
    RESULTADO_LABELS[c.resultado]||c.resultado||'',
    _xlsxFmtFecha(c.fecha_denuncia),
    _xlsxFmtFecha(c.fecha_recepcion_fiscalia),
    _xlsxFmtFecha(c.fecha_vista),
    days,
    months,
    _xlsxFmtArr(c.denunciantes),
    _xlsxFmtArr(c.estamentos_denunciante),
    c.carrera_denunciante||'',
    _xlsxFmtArr(c.denunciados),
    _xlsxFmtArr(c.estamentos_denunciado),
    c.carrera_denunciado||'',
    (c.informe_final&&c.informe_final.length>100)?'Sí':'No',
    c.drive_folder_url?'Sí':'No'
  ];
}

/* Hoja "Resumen": KPIs + tablas de distribución */
function _xlsxBuildResumenSheet(d){
  const xx=_xlsxLib();
  const aoa=[];
  aoa.push(['ESTADÍSTICAS FISCALITO — RESUMEN']);
  aoa.push(['Generado',new Date().toLocaleString('es-CL')]);
  aoa.push(['Usuario',session?.user?.email||'']);
  aoa.push([]);
  aoa.push(['INDICADORES GENERALES']);
  aoa.push(['Métrica','Valor']);
  aoa.push(['Total casos',d.cases.length]);
  aoa.push(['Casos activos',d.activos.length]);
  aoa.push(['Casos terminados',d.terminados.length]);
  aoa.push(['Duración promedio (días hábiles, terminados)',d.avgDuration||0]);
  aoa.push(['Alertas de prescripción (urgente/prescrito)',d.prescAlerts.length]);
  aoa.push(['Total diligencias',d.dils.length]);
  aoa.push(['Total participantes',d.parts.length]);
  aoa.push([]);
  aoa.push(['DISTRIBUCIÓN POR CATEGORÍA (ACTIVOS)']);
  aoa.push(['Categoría','N° casos']);
  aoa.push(['Género',d.catGroups.genero.length]);
  aoa.push(['No Género',d.catGroups.no_genero.length]);
  aoa.push(['Cargos',d.catGroups.cargos.length]);
  aoa.push(['Probatorio',d.catGroups.probatorio.length]);
  aoa.push(['Finalización',d.catGroups.finalizacion.length]);
  aoa.push([]);
  aoa.push(['DISTRIBUCIÓN POR TIPO DE PROCEDIMIENTO (TODOS)']);
  aoa.push(['Tipo','N° casos']);
  Object.entries(d.dist.tipoProc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>aoa.push([k,v]));
  aoa.push([]);
  aoa.push(['DISTRIBUCIÓN POR MATERIA (TODOS)']);
  aoa.push(['Materia','N° casos']);
  Object.entries(d.dist.materias).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>aoa.push([k,v]));
  aoa.push([]);
  aoa.push(['DISTRIBUCIÓN POR PROTOCOLO (TODOS)']);
  aoa.push(['Protocolo','N° casos']);
  Object.entries(d.dist.protocolos).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>aoa.push([k,v]));
  aoa.push([]);
  aoa.push(['DISTRIBUCIÓN POR RESULTADO (TERMINADOS)']);
  aoa.push(['Resultado','N° casos']);
  Object.entries(d.dist.resultados).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>aoa.push([k,v]));
  aoa.push([]);
  aoa.push(['DILIGENCIAS POR TIPO']);
  aoa.push(['Tipo','N° diligencias']);
  Object.entries(d.dilTypes).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>aoa.push([k,v]));
  aoa.push([]);
  aoa.push(['CASOS CREADOS POR MES (ÚLTIMOS 12)']);
  aoa.push(['Mes','N° casos']);
  Object.keys(d.dist.monthly).sort().slice(-12).forEach(m=>aoa.push([m,d.dist.monthly[m]||0]));

  const ws=xx.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:48},{wch:18}];
  return ws;
}

/* Hoja de prescripciones (alertas urgentes/prescrito) */
function _xlsxBuildPrescSheet(d){
  const xx=_xlsxLib();
  const headers=['Resolución','Nombre','Tipo Procedimiento','Fecha Denuncia','Días para Prescripción','Estado'];
  const rows=d.prescAlerts.map(a=>[
    a.case.nueva_resolucion||'',
    a.case.name||'',
    a.case.tipo_procedimiento||'',
    _xlsxFmtFecha(a.case.fecha_denuncia),
    a.presc.days,
    a.presc.label
  ]);
  const ws=xx.utils.aoa_to_sheet([headers,...rows]);
  ws['!cols']=[{wch:18},{wch:32},{wch:24},{wch:14},{wch:18},{wch:14}];
  if(rows.length)ws['!autofilter']={ref:xx.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};
  return ws;
}

/* Hoja de detalle de casos (activos o terminados) */
function _xlsxBuildCasosSheet(casos,headers,rowFn){
  const xx=_xlsxLib();
  const rows=(casos||[]).map(rowFn);
  const ws=xx.utils.aoa_to_sheet([headers,...rows]);
  ws['!cols']=headers.map(h=>({wch:Math.max(12,Math.min(40,h.length+4))}));
  if(rows.length)ws['!autofilter']={ref:xx.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};
  return ws;
}

/* ── EXPORT 1: Excel completo (snapshot del dashboard) ── */
async function exportStatsXLSX(){
  const xx=_xlsxLib();
  if(!xx||!xx.utils||typeof xx.writeFile!=='function'){
    const m='La librería XLSX no está disponible. Recarga la página.';
    if(typeof showToast==='function')showToast('⚠ '+m);else alert(m);return;
  }
  if(!_statsData){
    if(typeof showToast==='function')showToast('⚠ Carga primero las estadísticas');else alert('Sin datos');
    try{await loadStats();}catch{}
    if(!_statsData)return;
  }
  if(typeof showToast==='function')showToast('📊 Generando Excel completo…');

  try{
    const d=_statsData;
    const wb=xx.utils.book_new();
    xx.utils.book_append_sheet(wb,_xlsxBuildResumenSheet(d),_xlsxSheetName('Resumen'));
    xx.utils.book_append_sheet(wb,_xlsxBuildCasosSheet(d.activos,_XLSX_CASE_HEADERS_ACTIVOS,_xlsxRowActivo),_xlsxSheetName('Casos Activos'));
    xx.utils.book_append_sheet(wb,_xlsxBuildCasosSheet(d.terminados,_XLSX_CASE_HEADERS_TERMINADOS,_xlsxRowTerminado),_xlsxSheetName('Casos Terminados'));
    if(d.prescAlerts.length)
      xx.utils.book_append_sheet(wb,_xlsxBuildPrescSheet(d),_xlsxSheetName('Prescripciones'));

    const fecha=new Date().toISOString().slice(0,10);
    const filename=`Estadisticas-Fiscalito_${_xlsxUserSlug()}_${fecha}.xlsx`;
    xx.writeFile(wb,filename);
    if(typeof showToast==='function')showToast('✓ '+filename+' descargado');
  }catch(e){
    console.error('[exportStatsXLSX] error:',e);
    if(typeof showToast==='function')showToast('⚠ Error: '+e.message);else alert('Error: '+e.message);
  }
}

/* ── EXPORT 2: Excel de la consulta del chat IA ── */
async function exportChatXLSX(msgId){
  const xx=_xlsxLib();
  if(!xx||!xx.utils||typeof xx.writeFile!=='function'){
    const m='La librería XLSX no está disponible. Recarga la página.';
    if(typeof showToast==='function')showToast('⚠ '+m);else alert(m);return;
  }
  const meta=_statsChatRefs[msgId];
  if(!meta||!_statsData){
    if(typeof showToast==='function')showToast('⚠ Sin datos para esta consulta');return;
  }

  /* Resolver: emparejar resoluciones devueltas por la IA con los casos reales en _statsData */
  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  const wanted=new Set(meta.resoluciones.map(norm));
  const matched=_statsData.cases.filter(c=>{
    const r=norm(c.nueva_resolucion);
    const n=norm(c.name);
    return (r&&wanted.has(r))||(n&&wanted.has(n));
  });

  if(!matched.length){
    if(typeof showToast==='function')showToast('⚠ No encontré los casos referenciados por la IA en tus datos');
    console.warn('[exportChatXLSX] resoluciones IA:',meta.resoluciones,'· no matched');
    return;
  }

  /* Separar activos/terminados según scope y según el clasificador real */
  const isTerm=c=>{
    const cat=(typeof getCaseCat==='function')?getCaseCat(c):(c.categoria||'');
    return cat==='terminado';
  };
  const activos=matched.filter(c=>!isTerm(c));
  const terminados=matched.filter(isTerm);

  if(typeof showToast==='function')showToast('📊 Generando Excel de la consulta…');

  try{
    const wb=xx.utils.book_new();

    /* Hoja "Consulta": pregunta + respuesta + metadata */
    const consultaAoa=[
      ['CONSULTA AL CHAT IA — FISCALITO'],
      ['Generado',new Date().toLocaleString('es-CL')],
      ['Usuario',session?.user?.email||''],
      ['Título',meta.titulo||''],
      ['Alcance (scope)',meta.scope||''],
      ['Casos referenciados',matched.length+' de '+meta.resoluciones.length+' solicitados'],
      [],
      ['PREGUNTA'],
      [meta.query||''],
      [],
      ['RESPUESTA (texto plano)'],
      [(meta.reply||'').replace(/\r/g,'').split('\n').slice(0,200).join('\n')]
    ];
    const wsC=xx.utils.aoa_to_sheet(consultaAoa);
    wsC['!cols']=[{wch:120}];
    xx.utils.book_append_sheet(wb,wsC,_xlsxSheetName('Consulta'));

    /* Hojas de detalle según scope */
    if(meta.scope!=='terminados'&&activos.length)
      xx.utils.book_append_sheet(wb,_xlsxBuildCasosSheet(activos,_XLSX_CASE_HEADERS_ACTIVOS,_xlsxRowActivo),_xlsxSheetName('Activos'));
    if(meta.scope!=='activos'&&terminados.length)
      xx.utils.book_append_sheet(wb,_xlsxBuildCasosSheet(terminados,_XLSX_CASE_HEADERS_TERMINADOS,_xlsxRowTerminado),_xlsxSheetName('Terminados'));

    /* Si scope no calzó con la realidad, asegurar al menos una hoja con todos los casos */
    if(wb.SheetNames.length===1){
      xx.utils.book_append_sheet(wb,_xlsxBuildCasosSheet(matched,_XLSX_CASE_HEADERS_ACTIVOS,_xlsxRowActivo),_xlsxSheetName('Casos'));
    }

    const stamp=new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
    const titleSlug=(meta.titulo||'consulta').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,40)||'consulta';
    const filename=`Consulta-IA_${titleSlug}_${stamp}.xlsx`;
    xx.writeFile(wb,filename);
    if(typeof showToast==='function')showToast('✓ '+filename+' descargado');
  }catch(e){
    console.error('[exportChatXLSX] error:',e);
    if(typeof showToast==='function')showToast('⚠ Error: '+e.message);else alert('Error: '+e.message);
  }
}


/* ═══════════════════════════════════════════════════════════
   EXPORT 3: Plantilla "Repositorio de Procedimientos Finalizados"
   Réplica del formato Excel proporcionado por la fiscal.
   15 columnas + título + fila de totales.
   ═══════════════════════════════════════════════════════════ */

const _NORMA_LABELS={
  '2020':'Protocolo 2020','2022':'Protocolo 2022',
  '18834':'Estatuto Administrativo','laboral':'Protocolo laboral antiguo',
  'ley karin':'Protocolo Ley Karin','ley_karin':'Protocolo Ley Karin',
  '34-su':'Reglamento estudiantes','21-su-2025':'Reglamento estudiantes',
  'reglamento estudiantes':'Reglamento estudiantes',
  'estatuto administrativo':'Estatuto Administrativo'
};
function _normaLabel(v){
  if(!v)return'';
  const k=String(v).toLowerCase().trim();
  return _NORMA_LABELS[k]||(/protocolo/i.test(v)?v:('Protocolo '+v));
}
function _propuestaLabel(c){
  if(c.propuesta){
    const p=String(c.propuesta).toLowerCase().trim();
    if(/sancion|destituci|multa|censura|suspensi/.test(p))return'Sanción';
    if(/sobresei/.test(p))return'Sobreseimiento';
    if(/absuel/.test(p))return'Absuelto';
    if(/inhabil/.test(p))return'Inhabilidad';
    return c.propuesta;
  }
  const r=String(c.resultado||'').toLowerCase();
  if(r.startsWith('sancion_')||r.startsWith('propuesta_sancion_'))return'Sanción';
  if(r==='sobreseimiento')return'Sobreseimiento';
  if(r==='absuelto')return'Absuelto';
  if(r==='informe_inhabilidad')return'Inhabilidad';
  if(r.startsWith('pendiente'))return'Pendiente';
  return'';
}
function _cumplimientoLabel(diasHabiles){
  if(typeof diasHabiles!=='number'||!isFinite(diasHabiles)||diasHabiles<=0)return'';
  return diasHabiles<=126?'Cumplido':'Cumplido fuera de plazo';
}
function _yearOf(){
  for(const v of arguments){
    if(!v)continue;
    const m=String(v).match(/^(\d{4})/);
    if(m)return parseInt(m[1],10);
    const d=new Date(v);
    if(!isNaN(d))return d.getFullYear();
  }
  return'';
}
function _toExcelDate(v){
  if(!v)return'';
  if(v instanceof Date)return v;
  const iso=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso)return new Date(parseInt(iso[1]),parseInt(iso[2])-1,parseInt(iso[3]));
  const d=new Date(v);
  return isNaN(d)?String(v):d;
}
function _profesionalNombre(){
  try{
    const u=session?.user||{};
    const meta=u.user_metadata||{};
    return meta.full_name||meta.name||meta.nombre||(u.email||'Fiscal').split('@')[0].replace(/[._-]/g,' ');
  }catch{return'Fiscal';}
}

function _xlsxBuildPlantillaTerminadosSheet(terminados){
  const xx=_xlsxLib();
  const headers=['Name','Profesional','Resolución Inicio','Fecha Res. Inicio','Fecha Recepción Fiscalia','Resolución término','Fecha Res. Término','Fecha de entrega expediente','Norma','Materia','Propuesta','Días de tramitación','Cumplimiento','Año','Observaciones'];
  const profesional=_profesionalNombre();

  /* Orden cronológico ascendente por FECHA DE TÉRMINO/ENTREGA
     (fecha_resolucion_termino), con fallback a fecha de vista fiscal. */
  const sorted=(terminados||[]).slice().sort((a,b)=>{
    const da=a.fecha_resolucion_termino||a.fecha_vista||a.fecha_resolucion||a.created_at||'';
    const db=b.fecha_resolucion_termino||b.fecha_vista||b.fecha_resolucion||b.created_at||'';
    return String(da).localeCompare(String(db));
  });

  const rows=sorted.map((c,i)=>{
    const dias=c.duracion_dias||countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_resolucion_termino||c.fecha_vista)||'';
    return [
      'N°'+(i+1),
      profesional,
      c.nueva_resolucion||'',
      _toExcelDate(c.fecha_resolucion),
      _toExcelDate(c.fecha_recepcion_fiscalia),
      c.resolucion_termino||'',
      _toExcelDate(c.fecha_resolucion_termino),
      _toExcelDate(c.fecha_vista),
      _normaLabel(c.protocolo),
      c.materia||'',
      _propuestaLabel(c),
      typeof dias==='number'?dias:'',
      _cumplimientoLabel(typeof dias==='number'?dias:NaN),
      _yearOf(c.fecha_denuncia,c.fecha_resolucion,c.created_at),
      c.observaciones||''
    ];
  });

  const totalDias=rows.reduce((s,r)=>s+(typeof r[11]==='number'?r[11]:0),0);
  const totalRow=['','','','','','','','','','','',totalDias,'','',''];

  const aoa=[
    ['Repositorio Procedimientos finalizados'],
    ['Título del Grupo'],
    headers,
    ...rows,
    totalRow
  ];

  const ws=xx.utils.aoa_to_sheet(aoa,{cellDates:true});
  ws['!cols']=[
    {wch:8},{wch:22},{wch:24},{wch:14},{wch:18},{wch:24},{wch:14},{wch:18},
    {wch:22},{wch:34},{wch:14},{wch:14},{wch:22},{wch:8},{wch:32}
  ];
  if(rows.length){
    ws['!autofilter']={ref:xx.utils.encode_range({s:{r:2,c:0},e:{r:2+rows.length,c:headers.length-1}})};
  }
  const dateCols=[3,4,6,7];
  for(let r=3;r<3+rows.length;r++){
    for(const c of dateCols){
      const ref=xx.utils.encode_cell({r,c});
      if(ws[ref]&&ws[ref].v instanceof Date){
        ws[ref].t='d';
        ws[ref].z='dd-mm-yyyy';
      }
    }
  }
  return ws;
}

async function exportTerminadosTemplateXLSX(){
  const xx=_xlsxLib();
  if(!xx||!xx.utils||typeof xx.writeFile!=='function'){
    const m='La librería XLSX no está disponible. Recarga la página.';
    if(typeof showToast==='function')showToast('⚠ '+m);else alert(m);return;
  }
  if(!_statsData){
    if(typeof showToast==='function')showToast('⚠ Carga primero las estadísticas');
    try{await loadStats();}catch{}
    if(!_statsData)return;
  }
  const t=_statsData.terminados||[];
  if(!t.length){
    if(typeof showToast==='function')showToast('⚠ No hay procedimientos terminados');return;
  }
  if(typeof showToast==='function')showToast('📋 Generando plantilla…');
  try{
    const wb=xx.utils.book_new();
    xx.utils.book_append_sheet(wb,_xlsxBuildPlantillaTerminadosSheet(t),_xlsxSheetName('Repositorio Terminados'));
    const fecha=new Date().toISOString().slice(0,10);
    const filename='Repositorio-Procedimientos-Finalizados_'+_xlsxUserSlug()+'_'+fecha+'.xlsx';
    xx.writeFile(wb,filename);
    if(typeof showToast==='function')showToast('✓ '+filename+' descargado');
    const incompletos=t.filter(c=>!c.resolucion_termino||!c.fecha_resolucion_termino).length;
    if(incompletos>0&&typeof showToast==='function'){
      setTimeout(()=>showToast('💡 '+incompletos+' terminados con campos vacíos. Usa "🔍 Completar desde Drive" para llenarlos.'),1200);
    }
  }catch(e){
    console.error('[exportTerminadosTemplateXLSX] error:',e);
    if(typeof showToast==='function')showToast('⚠ Error: '+e.message);else alert('Error: '+e.message);
  }
}

/* ═══════════════════════════════════════════════════════════
   ENRIQUECIMIENTO DESDE DRIVE
   ═══════════════════════════════════════════════════════════ */

function _extractFolderId(driveUrl){
  if(!driveUrl)return null;
  const m=String(driveUrl).match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if(m)return m[1];
  const m2=String(driveUrl).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if(m2)return m2[1];
  if(/^[a-zA-Z0-9_-]{10,80}$/.test(driveUrl))return driveUrl;
  return null;
}

function _isCandidateFile(name){
  const n=String(name||'').toLowerCase();
  return /(resoluci[oó]n.*(t[eé]rmino|final|cierre|sanci[oó]n|sobresei))|vista[\s_-]?fiscal|informe[\s_-]?final|propuesta[\s_-]?(sanci[oó]n|sobresei)|t[eé]rmino[\s_-]?(sumario|investigaci[oó]n)/.test(n);
}

async function _driveListFolder(folderId){
  const r=await authFetch('/.netlify/functions/drive',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'list',folderId,recursive:true,maxDepth:3})
  });
  if(!r.ok)throw new Error('drive list HTTP '+r.status);
  const j=await r.json();
  return (j.files||[]).filter(f=>!f._isFolder&&f.id);
}

async function _driveExtractText(fileId){
  const r=await authFetch('/.netlify/functions/drive-extract',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({fileId})
  });
  if(!r.ok){
    let msg='HTTP '+r.status;
    try{const e=await r.json();msg=e.error||msg;}catch{}
    throw new Error(msg);
  }
  const j=await r.json();
  return j.text||'';
}

async function _aiExtractCierreData(caseInfo,docsText){
  const prompt='Analiza estos documentos del expediente disciplinario terminado y extrae los datos de cierre en JSON puro.\n\n'+
    'CASO ACTUAL:\n'+
    '- Resolución de inicio: '+(caseInfo.nueva_resolucion||'(no registrada)')+'\n'+
    '- Materia: '+(caseInfo.materia||'(no registrada)')+'\n'+
    '- Tipo procedimiento: '+(caseInfo.tipo_procedimiento||'(no registrado)')+'\n'+
    '- Fecha denuncia: '+(caseInfo.fecha_denuncia||'(no registrada)')+'\n\n'+
    'DOCUMENTOS:\n'+(docsText||'').substring(0,20000)+'\n\n'+
    'DEVUELVE SOLO JSON SIN MARKDOWN:\n'+
    '{\n'+
    '  "resolucion_termino": "número/identificador de la resolución de término o null",\n'+
    '  "fecha_resolucion_termino": "YYYY-MM-DD de la resolución de término o null",\n'+
    '  "fecha_vista": "YYYY-MM-DD de la fecha de la vista fiscal / entrega del expediente o null",\n'+
    '  "propuesta": "Sanción | Sobreseimiento | Absuelto | Inhabilidad | null",\n'+
    '  "observaciones": "notas relevantes (designación de nuevo fiscal, reapertura, acumulación, número de tomos), máx 200 chars, o null"\n'+
    '}';
  const r=await authFetch(CHAT_ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:typeof CLAUDE_SONNET!=='undefined'?CLAUDE_SONNET:'claude-sonnet-4-20250514',
      max_tokens:800,
      system:'Eres un extractor de datos de documentos jurídicos chilenos. Responde SOLO con JSON válido sin markdown. Si un dato no está, usa null.',
      messages:[{role:'user',content:prompt}]
    })
  });
  if(!r.ok){
    let msg='HTTP '+r.status;
    try{const e=await r.json();msg=e.error||msg;}catch{}
    throw new Error('chat: '+msg);
  }
  const j=await r.json();
  let txt=(j.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').trim();
  txt=txt.replace(/^```(?:json)?\s*|\s*```$/g,'').trim();
  return JSON.parse(txt);
}

async function enrichTerminadosFromDrive(){
  if(!_statsData){
    if(typeof showToast==='function')showToast('⚠ Carga primero las estadísticas');
    try{await loadStats();}catch{}
    if(!_statsData)return;
  }
  const t=(_statsData.terminados||[]).filter(c=>c.drive_folder_url&&(!c.resolucion_termino||!c.fecha_resolucion_termino||!c.observaciones||!c.propuesta));
  if(!t.length){
    if(typeof showToast==='function')showToast('✅ Todos los terminados con Drive tienen datos completos');return;
  }
  const proceed=confirm('Vas a completar datos de '+t.length+' caso'+(t.length===1?'':'s')+' consultando su Drive y la IA.\n\n· Toma ~20-40 s por caso.\n· Rate limit drive-extract: 30/hora.\n· Los datos se guardarán en la base.\n\n¿Continuar?');
  if(!proceed)return;

  const panelId='enrichDrivePanel';
  let panel=document.getElementById(panelId);
  if(panel)panel.remove();
  panel=document.createElement('div');
  panel.id=panelId;
  panel.style.cssText='position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #ccc;border-radius:8px;padding:14px 16px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:9999;min-width:320px;max-width:420px;font-family:var(--font-body);font-size:12px';
  panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>🔍 Completando desde Drive</strong><button onclick="document.getElementById(\''+panelId+'\').remove()" style="background:none;border:none;font-size:16px;cursor:pointer;color:#666">×</button></div><div id="'+panelId+'-status" style="color:#374151;margin-bottom:6px">Iniciando…</div><div style="background:#e5e7eb;border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px"><div id="'+panelId+'-bar" style="background:#7c3aed;height:100%;width:0%;transition:width .3s"></div></div><div id="'+panelId+'-log" style="max-height:160px;overflow-y:auto;font-size:11px;color:#6b7280;font-family:var(--font-mono)"></div>';
  document.body.appendChild(panel);
  const setStatus=function(s){const el=document.getElementById(panelId+'-status');if(el)el.textContent=s;};
  const setBar=function(p){const el=document.getElementById(panelId+'-bar');if(el)el.style.width=Math.round(p)+'%';};
  const log=function(msg){const el=document.getElementById(panelId+'-log');if(el){el.innerHTML+='<div>'+esc(msg)+'</div>';el.scrollTop=el.scrollHeight;}};

  let done=0,ok=0,fail=0,skipped=0;
  for(const c of t){
    const label=c.nueva_resolucion||c.name||c.id;
    setStatus('('+(done+1)+'/'+t.length+') '+label);
    try{
      const folderId=_extractFolderId(c.drive_folder_url);
      if(!folderId){log('⚠ '+label+': URL Drive inválida');skipped++;done++;setBar(100*done/t.length);continue;}
      const files=await _driveListFolder(folderId);
      let candidates=files.filter(f=>_isCandidateFile(f.name));
      if(!candidates.length){
        candidates=files.filter(f=>/pdf|wordprocessingml|google-apps\.document|msword/.test(f.mimeType||'')).slice(0,2);
      }
      candidates=candidates.slice(0,3);
      if(!candidates.length){log('⚠ '+label+': sin archivos legibles');skipped++;done++;setBar(100*done/t.length);continue;}
      const docs=[];
      for(const f of candidates){
        try{
          const txt=await _driveExtractText(f.id);
          if(txt&&txt.length>50)docs.push('### '+f.name+'\n'+txt.substring(0,8000));
        }catch(e){log('   ⚠ '+f.name+': '+(e.message||'').substring(0,60));}
      }
      if(!docs.length){log('⚠ '+label+': no se pudo extraer texto');skipped++;done++;setBar(100*done/t.length);continue;}
      const data=await _aiExtractCierreData(c,docs.join('\n\n---\n\n'));
      const update={updated_at:new Date().toISOString()};
      const setIfEmpty=function(k,v){if(v!==null&&v!==undefined&&v!==''&&!c[k])update[k]=v;};
      setIfEmpty('resolucion_termino',data.resolucion_termino);
      setIfEmpty('fecha_resolucion_termino',data.fecha_resolucion_termino);
      setIfEmpty('fecha_vista',data.fecha_vista);
      setIfEmpty('propuesta',data.propuesta);
      setIfEmpty('observaciones',data.observaciones);
      const keysWritten=Object.keys(update).filter(k=>k!=='updated_at');
      if(!keysWritten.length){log('· '+label+': nada nuevo');done++;setBar(100*done/t.length);continue;}
      const r=await sb.from('cases').update(update).eq('id',c.id);
      if(r.error){log('⚠ '+label+': update error '+r.error.message);fail++;}
      else{log('✓ '+label+': '+keysWritten.join(', '));ok++;Object.assign(c,update);}
    }catch(e){
      log('⚠ '+label+': '+(e.message||'error'));
      fail++;
    }
    done++;
    setBar(100*done/t.length);
  }
  setStatus('Completado · '+ok+' actualizados · '+fail+' con error · '+skipped+' omitidos');
  if(typeof showToast==='function')showToast('✓ '+ok+' casos enriquecidos');
  setTimeout(function(){try{loadStats();}catch{}},500);
}

console.log('%c📊 Módulo Estadísticas v2 cargado — Tabs + Chat IA','color:#4f46e5;font-weight:bold');


  /* ═══ EXPOSE PUBLIC API ═══ */
  window.loadStats = loadStats;
  window.renderDashboard = renderDashboard;
  window.renderActivosTab = renderActivosTab;
  window.renderTerminadosTab = renderTerminadosTab;
  window.renderStatsChat = renderStatsChat;
  window.statsChatSend = statsChatSend;
  window.exportStatsCSV = exportStatsCSV;
  window.exportStatsXLSX = exportStatsXLSX;
  window.exportChatXLSX = exportChatXLSX;
  window.exportTerminadosTemplateXLSX = exportTerminadosTemplateXLSX;
  window.enrichTerminadosFromDrive = enrichTerminadosFromDrive;
  window.calcPrescripcion = calcPrescripcion;
  /* Setter para cambiar pestaña desde onclick inline (la variable es local al IIFE) */
  window.setStatsTab = function(tab) { _statsActiveTab = tab; renderDashboard(); };

  console.log('%c📊 Módulo Estadísticas v2 cargado — Tabs + Chat IA','color:#4f46e5;font-weight:bold');
})();
