/**
 * MOD-ESTADISTICAS.JS — Módulo de Estadísticas Mejorado
 * ─────────────────────────────────────────────────────
 * Dashboard completo: KPIs, gráficos, prescripción, exportación.
 * Inspirado en módulo de referencia Fiscalito v2.
 * Dependencia: Chart.js (ya cargado en index.html)
 */

/* ═══ CONSTANTES ═══ */
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
};

const ESTAMENTO_LABELS={
  estudiante:'Estudiante',funcionario:'Funcionario',academico:'Académico',
  directivo:'Directivo',profesional:'Profesional',honorarios:'Honorarios',otro:'Otro',
};

const STAGE_LABELS={
  indagatoria:'Indagatoria',cargos:'Cargos',descargos:'Descargos',
  prueba:'Prueba',vista:'Vista Fiscal',resolucion:'Resolución',
  'finalización':'Finalización',finalizacion:'Finalización',
};

/* ═══ DÍAS HÁBILES UMAG ═══ */
function countBusinessDays(startDate,endDate){
  if(!startDate||!endDate)return null;
  const start=new Date(startDate),end=new Date(endDate);
  if(isNaN(start)||isNaN(end)||start>end)return null;
  let count=0;
  const d=new Date(start);
  while(d<=end){
    const dow=d.getDay(),month=d.getMonth(),date=d.getDate();
    if(dow!==0&&dow!==6){
      const isReceso=(month===1)||(month===6&&date>=15&&date<=21)||(month===8&&date>=15&&date<=21)||(month===11&&date>=25&&date<=31);
      if(!isReceso)count++;
    }
    d.setDate(d.getDate()+1);
  }
  return count;
}

/* ═══ CLASIFICACIÓN ═══ */
function isGenderCase(name,rol){
  const p=/\d+\s*[-]?\s*G(?:\s|$|[^a-záéíóúñ])/;
  return p.test(name||'')||(name||'').toUpperCase().includes('-G')||p.test(rol||'');
}

/* ═══ PRESCRIPCIÓN ═══ */
function calcPrescripcion(fechaDenuncia,tipoProcedimiento){
  if(!fechaDenuncia)return null;
  const start=new Date(fechaDenuncia);
  if(isNaN(start))return null;
  const years=(tipoProcedimiento||'').toLowerCase().includes('estudiant')?2:4;
  const limit=new Date(start);limit.setFullYear(limit.getFullYear()+years);
  const now=new Date();
  const diffDays=Math.ceil((limit-now)/(1000*60*60*24));
  if(diffDays<0)return{status:'prescrito',days:diffDays,label:'PRESCRITO',color:STAT_COLORS.red};
  if(diffDays<=180)return{status:'urgente',days:diffDays,label:diffDays+' días',color:STAT_COLORS.red};
  if(diffDays<=365)return{status:'proximo',days:diffDays,label:Math.round(diffDays/30)+' meses',color:STAT_COLORS.gold};
  return{status:'ok',days:diffDays,label:Math.round(diffDays/365)+' años',color:STAT_COLORS.green};
}

/* ═══ CHARTS REGISTRY ═══ */
const _statCharts={};
function destroyChart(id){if(_statCharts[id]){_statCharts[id].destroy();delete _statCharts[id];}}
function createChart(canvasId,config){
  destroyChart(canvasId);
  const el=document.getElementById(canvasId);
  if(!el)return null;
  _statCharts[canvasId]=new Chart(el.getContext('2d'),config);
  return _statCharts[canvasId];
}

/* ═══ LOAD STATISTICS ═══ */
async function loadStats(){
  if(!session)return;
  const uid=session.user.id;
  const el=document.getElementById('viewDashboard');
  if(!el)return;
  el.innerHTML='<div class="loading">Cargando estadísticas…</div>';

  try{
    /* Fetch all data in parallel */
    const[rCases,rDils,rParts]=await Promise.all([
      sb.from('cases').select('id,name,rol,status,created_at,tipo_procedimiento,materia,protocolo,resultado,fecha_denuncia,fecha_recepcion_fiscalia,fecha_vista,denunciantes,denunciados,estamentos_denunciante,estamentos_denunciado').eq('user_id',uid),
      sb.from('diligencias').select('case_id,diligencia_type,is_processed').eq('user_id',uid),
      sb.from('case_participants').select('case_id,role,estamento').eq('user_id',uid),
    ]);
    const cases=rCases.data||[];
    const dils=rDils.data||[];
    const parts=rParts.data||[];

    if(!cases.length){el.innerHTML=renderEmptyStats();return;}

    /* Classify cases */
    const active=[],terminated=[],archived=[];
    cases.forEach(c=>{
      const s=(c.status||'').toLowerCase();
      if(s==='archived'||s==='cerrado')archived.push(c);
      else if(s==='terminado'||s==='completado'||c.resultado)terminated.push(c);
      else active.push(c);
    });

    /* Build maps */
    const dilMap={};dils.forEach(d=>{if(!dilMap[d.case_id])dilMap[d.case_id]=[];dilMap[d.case_id].push(d);});
    const partMap={};parts.forEach(p=>{if(!partMap[p.case_id])partMap[p.case_id]=[];partMap[p.case_id].push(p);});

    /* Calculate KPIs */
    const totalDils=dils.length;
    const processedDils=dils.filter(d=>d.is_processed).length;
    const totalParts=parts.length;

    /* Duration calculation */
    let totalDays=0,durationCount=0;
    terminated.concat(archived).forEach(c=>{
      const days=countBusinessDays(c.fecha_recepcion_fiscalia||c.created_at,c.fecha_vista);
      if(days!==null&&days>0){totalDays+=days;durationCount++;}
    });
    const avgDuration=durationCount>0?Math.round(totalDays/durationCount):0;

    /* Prescripción alerts */
    const prescAlerts=[];
    active.forEach(c=>{
      const p=calcPrescripcion(c.fecha_denuncia,c.tipo_procedimiento);
      if(p&&(p.status==='prescrito'||p.status==='urgente'))prescAlerts.push({case:c,presc:p});
    });

    /* Distributions */
    const tipoProc={},resultados={},etapas={},generoCount={genero:0,'no-genero':0};
    const estamentosDte={},estamentosDdo={};
    const dilTypes={};
    const monthly={};
    cases.forEach(c=>{
      /* Tipo procedimiento */
      const tp=c.tipo_procedimiento||'Sin definir';
      tipoProc[tp]=(tipoProc[tp]||0)+1;
      /* Resultado */
      if(c.resultado){
        const rl=RESULTADO_LABELS[c.resultado]||c.resultado;
        resultados[rl]=(resultados[rl]||0)+1;
      }
      /* Género */
      if(isGenderCase(c.name,c.nueva_resolucion))generoCount.genero++;
      else generoCount['no-genero']++;
      /* Estamentos */
      const eDte=c.estamentos_denunciante;
      if(eDte){
        const arr=Array.isArray(eDte)?eDte:typeof eDte==='string'?eDte.split(','):[];
        arr.forEach(e=>{const k=e.trim().toLowerCase();if(k)estamentosDte[ESTAMENTO_LABELS[k]||k]=(estamentosDte[ESTAMENTO_LABELS[k]||k]||0)+1;});
      }
      const eDdo=c.estamentos_denunciado;
      if(eDdo){
        const arr=Array.isArray(eDdo)?eDdo:typeof eDdo==='string'?eDdo.split(','):[];
        arr.forEach(e=>{const k=e.trim().toLowerCase();if(k)estamentosDdo[ESTAMENTO_LABELS[k]||k]=(estamentosDdo[ESTAMENTO_LABELS[k]||k]||0)+1;});
      }
      /* Monthly trend */
      const month=c.created_at?.substring(0,7);
      if(month)monthly[month]=(monthly[month]||0)+1;
    });

    /* Diligencias by type */
    dils.forEach(d=>{const t=d.diligencia_type||'otro';dilTypes[t]=(dilTypes[t]||0)+1;});

    /* Render */
    el.innerHTML=renderStats({
      total:cases.length,active:active.length,terminated:terminated.length,archived:archived.length,
      avgDuration,totalDils,processedDils,totalParts,
      prescAlerts,tipoProc,resultados,generoCount,estamentosDte,estamentosDdo,
      dilTypes,monthly,
    });

    /* Create charts after DOM is ready */
    setTimeout(()=>renderCharts({tipoProc,resultados,generoCount,estamentosDte,estamentosDdo,dilTypes,monthly}),100);
  }catch(err){
    el.innerHTML=`<div class="empty-state">⚠️ Error: ${esc(err.message)}</div>`;
    console.error('loadStats:',err);
  }
}

/* ═══ RENDER EMPTY ═══ */
function renderEmptyStats(){
  return`<div class="empty-state" style="padding:40px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">📊</div>
    <div style="font-size:16px;font-weight:600">Sin casos registrados</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:8px">Crea tu primer expediente para ver estadísticas.</div>
  </div>`;
}

/* ═══ RENDER STATS ═══ */
function renderStats(d){
  const prescHtml=d.prescAlerts.length>0?d.prescAlerts.map(a=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${a.presc.color}15;border-left:3px solid ${a.presc.color};border-radius:4px;margin-bottom:4px">
      <span style="font-size:11px;font-weight:600;color:${a.presc.color}">${a.presc.status==='prescrito'?'⛔':'⚠️'} ${a.presc.label}</span>
      <span style="font-size:11px;color:var(--text-dim)">${esc(a.case.name)}</span>
    </div>`).join(''):'<div style="font-size:11px;color:var(--text-muted);padding:8px">✅ Sin alertas de prescripción</div>';

  return`<div style="padding:20px;display:flex;flex-direction:column;gap:16px;width:100%;box-sizing:border-box">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px">📊 Estadísticas de Casos</div>
        <div style="font-size:12px;color:var(--text-muted)">Resumen de tu gestión disciplinaria</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-sm" onclick="exportStatsCSV()" title="Exportar CSV">📥 CSV</button>
        <button class="btn-sm" onclick="loadStats()" title="Actualizar">↻</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${kpiCard('Total Casos',d.total,'📁',STAT_COLORS.primary)}
      ${kpiCard('Activos',d.active,'🔵',STAT_COLORS.blue)}
      ${kpiCard('Terminados',d.terminated,'✅',STAT_COLORS.green)}
      ${kpiCard('Archivados',d.archived,'📦',STAT_COLORS.slate)}
      ${kpiCard('Duración Prom.',d.avgDuration?d.avgDuration+' días':'—','⏱️',STAT_COLORS.gold)}
      ${kpiCard('Diligencias',d.totalDils+' ('+d.processedDils+' ✅)','📋',STAT_COLORS.cyan)}
      ${kpiCard('Participantes',d.totalParts,'👥',STAT_COLORS.purple)}
      ${kpiCard('Género',d.generoCount.genero+' de '+d.total,'♀️',STAT_COLORS.pink)}
    </div>

    <!-- Prescripción Alerts -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:6px">
        ⏰ Alertas de Prescripción
        ${d.prescAlerts.length>0?`<span style="background:${STAT_COLORS.red};color:#fff;font-size:10px;padding:1px 6px;border-radius:10px">${d.prescAlerts.length}</span>`:''}
      </div>
      ${prescHtml}
    </div>

    <!-- Charts Grid -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      ${chartCard('chartTipoProc','Tipo de Procedimiento','Distribución por tipo de procedimiento')}
      ${chartCard('chartResultados','Resultado Final','Distribución de resultados')}
      ${chartCard('chartGenero','Género / No Género','Clasificación de casos')}
      ${chartCard('chartDilTypes','Tipos de Diligencias','Distribución por tipo')}
      ${chartCard('chartEstDte','Estamento Denunciante','Por estamento')}
      ${chartCard('chartEstDdo','Estamento Denunciado/a','Por estamento')}
    </div>

    <!-- Trend Chart -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px">📈 Tendencia Mensual (Casos Creados)</div>
      <div style="height:220px"><canvas id="chartTrend"></canvas></div>
    </div>
  </div>`;
}

function kpiCard(label,value,icon,color){
  return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;display:flex;flex-direction:column;gap:4px">
    <div style="font-size:10.5px;color:var(--text-muted);display:flex;align-items:center;gap:4px">${icon} ${label}</div>
    <div style="font-size:20px;font-weight:700;color:${color}">${value}</div>
  </div>`;
}

function chartCard(id,title,desc){
  return`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px">
    <div style="font-size:13px;font-weight:600;margin-bottom:2px">${title}</div>
    <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:10px">${desc}</div>
    <div style="height:220px"><canvas id="${id}"></canvas></div>
  </div>`;
}

/* ═══ RENDER CHARTS ═══ */
function renderCharts(d){
  const defaults=Chart.defaults;
  defaults.color='#94a3b8';
  defaults.font.family="'Plus Jakarta Sans',sans-serif";
  defaults.font.size=11;

  const pie=(id,labels,data)=>createChart(id,{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:STAT_COLORS.chartPalette.slice(0,labels.length),borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,padding:6,font:{size:10}}}}}
  });

  const bar=(id,labels,data,color)=>createChart(id,{
    type:'bar',
    data:{labels,datasets:[{data,backgroundColor:color||STAT_COLORS.primary+'cc',borderRadius:4,maxBarThickness:40}]},
    options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{grid:{display:false}}}}
  });

  /* Tipo Procedimiento */
  const tpLabels=Object.keys(d.tipoProc);
  const tpData=Object.values(d.tipoProc);
  if(tpLabels.length)pie('chartTipoProc',tpLabels,tpData);

  /* Resultados */
  const rLabels=Object.keys(d.resultados);
  const rData=Object.values(d.resultados);
  if(rLabels.length)bar('chartResultados',rLabels,rData,STAT_COLORS.green+'cc');

  /* Género */
  pie('chartGenero',['Género (G)','No Género (A)'],[d.generoCount.genero,d.generoCount['no-genero']]);

  /* Diligencias by type */
  const dtLabels=Object.keys(d.dilTypes).map(k=>{const t=DILIGENCIA_TYPES?.find(t=>t.value===k);return t?t.label:k;});
  const dtData=Object.values(d.dilTypes);
  if(dtLabels.length)pie('chartDilTypes',dtLabels,dtData);

  /* Estamentos */
  const edLabels=Object.keys(d.estamentosDte);
  if(edLabels.length)pie('chartEstDte',edLabels,Object.values(d.estamentosDte));

  const eddLabels=Object.keys(d.estamentosDdo);
  if(eddLabels.length)pie('chartEstDdo',eddLabels,Object.values(d.estamentosDdo));

  /* Monthly Trend */
  const months=Object.keys(d.monthly).sort().slice(-12);
  const mData=months.map(m=>d.monthly[m]||0);
  const mLabels=months.map(m=>{const[y,mon]=m.split('-');return['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(mon)-1]+' '+y.slice(2);});
  if(months.length)createChart('chartTrend',{
    type:'line',
    data:{labels:mLabels,datasets:[{label:'Casos creados',data:mData,borderColor:STAT_COLORS.primary,backgroundColor:STAT_COLORS.primary+'20',fill:true,tension:.3,pointRadius:4,pointHoverRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e2e8f020'}}}}
  });
}

/* ═══ EXPORT CSV ═══ */
async function exportStatsCSV(){
  if(!session||!allCases?.length){showToast('⚠ Sin datos');return;}
  showToast('📥 Generando CSV…');
  const headers=['Nombre','Resolución que instruye','Estado','Tipo Procedimiento','Materia','Protocolo','Resultado','Fecha Denuncia','Fecha Recepción','Fecha Vista','Denunciante(s)','Denunciado/a(s)','Est. Denunciante','Est. Denunciado','Género'];
  const rows=allCases.map(c=>[
    c.name,c.nueva_resolucion||'',c.status||'',c.tipo_procedimiento||'',c.materia||'',c.protocolo||'',
    c.resultado||'',c.fecha_denuncia||'',c.fecha_recepcion_fiscalia||'',c.fecha_vista||'',
    Array.isArray(c.denunciantes)?c.denunciantes.join('; '):c.denunciantes||'',
    Array.isArray(c.denunciados)?c.denunciados.join('; '):c.denunciados||'',
    Array.isArray(c.estamentos_denunciante)?c.estamentos_denunciante.join('; '):c.estamentos_denunciante||'',
    Array.isArray(c.estamentos_denunciado)?c.estamentos_denunciado.join('; '):c.estamentos_denunciado||'',
    isGenderCase(c.name,c.nueva_resolucion)?'Género':'No Género',
  ]);
  const csv='\uFEFF'+[headers,...rows].map(r=>r.map(v=>'"'+(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='estadisticas_fiscalito_'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();URL.revokeObjectURL(a.href);
  showToast('✅ CSV descargado');
}

console.log('%c📊 Módulo Estadísticas Mejorado cargado','color:#4f46e5;font-weight:bold');
