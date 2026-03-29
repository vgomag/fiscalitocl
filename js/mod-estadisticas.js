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

const CAT_LABELS_STAT={genero:'Género',no_genero:'No Género',cargos:'Cargos',finalizacion:'Finalización',terminado:'Terminado'};

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

function isGenderCase(name,rol){
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
    const uid=session.user.id;
    const[rCases,rDils,rParts]=await Promise.all([
      sb.from('cases').select('id,name,nueva_resolucion,status,categoria,created_at,tipo_procedimiento,materia,protocolo,resultado,fecha_denuncia,fecha_recepcion_fiscalia,fecha_vista,denunciantes,denunciados,estamentos_denunciante,estamentos_denunciado,carrera_denunciante,carrera_denunciado,duracion_dias,informe_final,drive_folder_url,numero_exp_interno').is('deleted_at',null),
      sb.from('diligencias').select('case_id,diligencia_type,is_processed'),
      sb.from('case_participants').select('case_id,role,estamento'),
    ]);

    const cases=rCases.data||[]; const dils=rDils.data||[]; const parts=rParts.data||[];
    if(!cases.length){el.innerHTML=renderEmptyStats();return;}

    /* Classify */
    const catGroups={genero:[],no_genero:[],cargos:[],finalizacion:[],terminado:[]};
    cases.forEach(c=>{
      const cat=c.categoria||'no_genero';
      if(catGroups[cat])catGroups[cat].push(c);
      else catGroups.no_genero.push(c);
    });

    const activos=[...catGroups.genero,...catGroups.no_genero,...catGroups.cargos,...catGroups.finalizacion];
    const terminados=catGroups.terminado;

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
      <div style="display:flex;gap:6px">
        <button class="btn-sm" onclick="exportStatsCSV()" title="Exportar CSV">📥 CSV</button>
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
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isAct?700:400};background:${isAct?'var(--gold)':'var(--surface)'};color:${isAct?'#fff':'var(--text-dim)'}" onclick="_statsActiveTab='activos';renderDashboard()">
        📋 Casos Activos (${d.activos.length})
      </button>
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isTerm?700:400};background:${isTerm?'var(--gold)':'var(--surface)'};color:${isTerm?'#fff':'var(--text-dim)'}" onclick="_statsActiveTab='terminados';renderDashboard()">
        ✅ Proc. Terminados (${d.terminados.length})
      </button>
      <button class="btn-sm" style="border-radius:8px 8px 0 0;padding:8px 16px;font-weight:${isChat?700:400};background:${isChat?'var(--gold)':'var(--surface)'};color:${isChat?'#fff':'var(--text-dim)'}" onclick="_statsActiveTab='chat';renderDashboard()">
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
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${kpiCard('♀ Género',cg.genero.length,'',STAT_COLORS.pink)}
      ${kpiCard('📄 No Género',cg.no_genero.length,'',STAT_COLORS.blue)}
      ${kpiCard('⚖️ Cargos',cg.cargos.length,'',STAT_COLORS.orange)}
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
      ${['genero','no_genero','cargos','finalizacion'].map(cat=>{
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

    /* Categoría */
    const catData=['genero','no_genero','cargos','finalizacion'].map(k=>d.catGroups[k]?.length||0);
    makePie('chartActCategoria',['Género','No Género','Cargos','Finalización'],catData);

    /* Protocolo */
    const protAct={};d.activos.forEach(c=>{if(c.protocolo)protAct[c.protocolo]=(protAct[c.protocolo]||0)+1;});
    if(Object.keys(protAct).length)makePie('chartActProtocolo',Object.keys(protAct),Object.values(protAct));

    /* Trend */
    const months=Object.keys(d.dist.monthly).sort().slice(-12);
    const mLabels=months.map(m=>{const[y,mon]=m.split('-');return['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mon)-1]+' '+y.slice(2);});
    if(months.length)makeLine('chartActTrend',mLabels,months.map(m=>d.dist.monthly[m]||0));
  },100);
}

/* ═══ TAB: TERMINADOS ═══ */
function renderTerminadosTab(){
  const d=_statsData;if(!d)return;
  const el=document.getElementById('statsTabContent');if(!el)return;
  const t=d.terminados;

  /* Duration stats */
  const durations=[];
  t.forEach(c=>{
    const days=c.duracion_dias||countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_vista);
    if(days&&days>0)durations.push({case:c,days});
  });
  durations.sort((a,b)=>a.days-b.days);
  const avgDays=durations.length?Math.round(durations.reduce((s,d)=>s+d.days,0)/durations.length):0;
  const avgMonths=(avgDays/21).toFixed(1);

  /* Duration ranges */
  const ranges={'<2 meses':0,'2-4 meses':0,'4-6 meses':0,'6-12 meses':0,'>12 meses':0};
  durations.forEach(({days})=>{
    if(days<42)ranges['<2 meses']++;
    else if(days<84)ranges['2-4 meses']++;
    else if(days<126)ranges['4-6 meses']++;
    else if(days<252)ranges['6-12 meses']++;
    else ranges['>12 meses']++;
  });

  /* Participant stats */
  const partCounts=[];
  t.forEach(c=>{
    const pp=d.partMap[c.id]||[];
    partCounts.push({case:c,total:pp.length,
      dte:pp.filter(p=>(p.role||'').toLowerCase().includes('denunciante')).length,
      ddo:pp.filter(p=>(p.role||'').toLowerCase().includes('denunciado')||p.role==='Sumariado').length,
      testigos:pp.filter(p=>(p.role||'').toLowerCase().includes('testigo')).length,
    });
  });
  const totalParts=partCounts.reduce((s,p)=>s+p.total,0);
  const avgParts=partCounts.length?Math.round(totalParts/partCounts.length):0;

  /* Diligencia stats */
  const dilCounts=[];
  t.forEach(c=>{const dd=d.dilMap[c.id]||[];dilCounts.push({case:c,count:dd.length});});
  const totalTermDils=dilCounts.reduce((s,d)=>s+d.count,0);
  const avgTermDils=dilCounts.length?(totalTermDils/dilCounts.length).toFixed(1):0;

  /* Resultado distribution */
  const resTerminados={};
  t.forEach(c=>{if(c.resultado){const r=RESULTADO_LABELS[c.resultado]||c.resultado;resTerminados[r]=(resTerminados[r]||0)+1;}});

  /* Tipo proc terminados */
  const tpTerm={};
  t.forEach(c=>{const tp=c.tipo_procedimiento||'Sin definir';tpTerm[tp]=(tpTerm[tp]||0)+1;});

  /* Con/sin informe */
  const conInforme=t.filter(c=>c.informe_final&&c.informe_final.length>100).length;

  el.innerHTML=`
    <!-- KPIs terminados -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px">
      ${kpiCard('Total',t.length,'✅',STAT_COLORS.green)}
      ${kpiCard('Duración Prom.',avgMonths+' meses','📅',STAT_COLORS.gold)}
      ${kpiCard('Días Hábiles Prom.',avgDays,'⏱️',STAT_COLORS.blue)}
      ${kpiCard('Intervinientes',totalParts+' ('+avgParts+'/caso)','👥',STAT_COLORS.purple)}
      ${kpiCard('Con Informe',conInforme+'/'+t.length,'📄',STAT_COLORS.teal)}
    </div>

    <!-- Tiempo de tramitación -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:12px">⏱️ Tiempo de Tramitación</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        ${chartBox('chartTermDurRango','Distribución por Rango','',200)}
        ${chartBox('chartTermDurCaso','Días por Caso (Top 20)','',200)}
      </div>
    </div>

    <!-- Charts terminados -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:16px">
      ${chartBox('chartTermResultado','Resultado Final','')}
      ${chartBox('chartTermTipoProc','Tipo de Procedimiento','')}
    </div>

    <!-- Participantes y Diligencias -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">👥 Carga de Intervinientes</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${totalParts} total · ${avgParts} prom/caso</div>
        <div style="height:200px"><canvas id="chartTermParticipantes"></canvas></div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">📋 Volumen de Diligencias</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${totalTermDils} total · ${avgTermDils} prom/caso</div>
        <div style="height:200px"><canvas id="chartTermDiligencias"></canvas></div>
      </div>
    </div>

    <!-- Top casos más largos -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">🏆 Casos por Duración</div>
      <div style="max-height:200px;overflow-y:auto;font-size:11px">
        ${durations.slice(-10).reverse().map((d,i)=>`
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="min-width:20px;font-weight:600;color:var(--text-muted)">${i+1}</span>
            <span style="flex:1">${esc(d.case.nueva_resolucion||d.case.name)}</span>
            <span style="font-weight:600;color:${d.days>252?STAT_COLORS.red:d.days>126?STAT_COLORS.gold:STAT_COLORS.green}">${d.days} días</span>
          </div>`).join('')}
      </div>
    </div>
  `;

  setTimeout(()=>{
    /* Duration ranges bar */
    makeBar('chartTermDurRango',Object.keys(ranges),Object.values(ranges),STAT_COLORS.blue+'cc');
    /* Duration per case (top 20 longest) */
    const top20=durations.slice(-20).reverse();
    makeBar('chartTermDurCaso',top20.map(d=>(d.case.nueva_resolucion||'').substring(0,15)),top20.map(d=>d.days),STAT_COLORS.gold+'cc',true);
    /* Resultado */
    if(Object.keys(resTerminados).length)makeBar('chartTermResultado',Object.keys(resTerminados),Object.values(resTerminados),STAT_COLORS.green+'cc',true);
    /* Tipo proc */
    if(Object.keys(tpTerm).length)makePie('chartTermTipoProc',Object.keys(tpTerm),Object.values(tpTerm));
    /* Participantes por rol */
    const roles={Denunciantes:0,Denunciados:0,Testigos:0,Otros:0};
    d.terminados.forEach(c=>{const pp=d.partMap[c.id]||[];pp.forEach(p=>{
      const r=(p.role||'').toLowerCase();
      if(r.includes('denunciante'))roles.Denunciantes++;
      else if(r.includes('denunciado')||r==='sumariado')roles.Denunciados++;
      else if(r.includes('testigo'))roles.Testigos++;
      else roles.Otros++;
    });});
    makePie('chartTermParticipantes',Object.keys(roles),Object.values(roles));
    /* Diligencias tipo */
    const dtTerm={};d.terminados.forEach(c=>{(d.dilMap[c.id]||[]).forEach(dl=>{const t=dl.diligencia_type||'otro';dtTerm[t]=(dtTerm[t]||0)+1;});});
    if(Object.keys(dtTerm).length)makePie('chartTermDiligencias',Object.keys(dtTerm),Object.values(dtTerm));
  },100);
}

/* ═══ TAB: CHAT IA ═══ */
let _statsChatHistory=[];

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

  /* Build data summary for context */
  const d=_statsData;
  const dataSummary=`DATOS DE CASOS FISCALITO (${d.cases.length} casos totales):

DISTRIBUCIÓN POR CATEGORÍA:
- Género: ${d.catGroups.genero.length} casos
- No Género: ${d.catGroups.no_genero.length} casos
- Cargos: ${d.catGroups.cargos.length} casos
- Finalización: ${d.catGroups.finalizacion.length} casos
- Terminados: ${d.terminados.length} casos

DURACIÓN PROMEDIO: ${d.avgDuration} días hábiles

ALERTAS PRESCRIPCIÓN: ${d.prescAlerts.length} (${d.prescAlerts.map(a=>a.case.nueva_resolucion+': '+a.presc.label).join(', ')||'ninguna'})

DISTRIBUCIÓN POR TIPO PROCEDIMIENTO: ${Object.entries(d.dist.tipoProc).map(([k,v])=>k+': '+v).join(', ')}

DISTRIBUCIÓN POR MATERIA: ${Object.entries(d.dist.materias).map(([k,v])=>k+': '+v).join(', ')||'sin datos'}

RESULTADOS: ${Object.entries(d.dist.resultados).map(([k,v])=>k+': '+v).join(', ')||'sin datos'}

DILIGENCIAS: ${d.dils.length} total
PARTICIPANTES: ${d.parts.length} total

LISTA DE CASOS ACTIVOS:
${d.activos.map(c=>`- ${c.nueva_resolucion||c.name} | Cat: ${c.categoria} | Tipo: ${c.tipo_procedimiento||'—'} | Materia: ${c.materia||'—'} | Protocolo: ${c.protocolo||'—'} | Carrera Dte: ${c.carrera_denunciante||'—'} | Carrera Ddo: ${c.carrera_denunciado||'—'}`).join('\n')}

LISTA DE CASOS TERMINADOS:
${d.terminados.map(c=>`- ${c.nueva_resolucion||c.name} | Tipo: ${c.tipo_procedimiento||'—'} | Resultado: ${RESULTADO_LABELS[c.resultado]||c.resultado||'—'} | Duración: ${c.duracion_dias||'—'} días | Materia: ${c.materia||'—'} | Carrera Dte: ${c.carrera_denunciante||'—'} | Carrera Ddo: ${c.carrera_denunciado||'—'}`).join('\n')}`;

  try{
    _statsChatHistory.push({role:'user',content:text});
    const r=await authFetch(CHAT_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:2000,
        system:`Eres Fiscalito, asistente de estadísticas de procedimientos disciplinarios de la Universidad de Magallanes.
Tienes acceso a TODOS los datos de los casos del usuario. Responde con datos precisos, cifras exactas y análisis útil.
Usa tablas cuando sea apropiado. Sé conciso pero completo.
Si te piden datos que no están en el contexto, indícalo.

${dataSummary}`,
        messages:_statsChatHistory.slice(-10)
      })
    });

    const typing=document.getElementById('statsChatTyping');
    if(typing)typing.remove();

    if(!r.ok){
      msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ Error: ${r.status}</div>`;
      return;
    }
    const data=await r.json();
    const reply=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')||'Sin respuesta.';
    _statsChatHistory.push({role:'assistant',content:reply});

    msgs.innerHTML+=`<div style="align-self:flex-start;background:var(--surface2);border:1px solid var(--border);padding:10px 14px;border-radius:2px 12px 12px 12px;max-width:90%;font-size:12px;line-height:1.6">${md(reply)}</div>`;
    msgs.scrollTop=msgs.scrollHeight;

  }catch(err){
    const typing=document.getElementById('statsChatTyping');if(typing)typing.remove();
    msgs.innerHTML+=`<div style="align-self:flex-start;color:var(--red);font-size:11px;padding:6px">⚠️ ${err.message}</div>`;
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

console.log('%c📊 Módulo Estadísticas v2 cargado — Tabs + Chat IA','color:#4f46e5;font-weight:bold');
