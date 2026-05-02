/* ═══════════════════════════════════════════════════════════════════
   DIAGNÓSTICO FISCALITO — Acceso de la IA a tus expedientes
   v1.0 · 2026-05-01
   ───────────────────────────────────────────────────────────────────
   Audita en 30 segundos el % de completitud de la información que
   Fiscalito (la IA) tiene disponible para responder sobre tus casos.
   Reporta por capa con recomendaciones priorizadas por impacto.

   USO: pega TODO en la consola (F12 → Console), Enter, espera.
   ═══════════════════════════════════════════════════════════════════ */
(async function diagnosticoFiscalito() {
  if (typeof sb === 'undefined' || !sb) { console.error('❌ Sin sesión'); return; }
  const { data:{user} } = await sb.auth.getUser();
  if (!user) { console.error('❌ Sin usuario'); return; }

  const t0 = Date.now();
  const log = (msg, color) => console.log('%c'+msg, 'color:'+(color||'#374151')+';font-weight:500');

  console.log('%c═══════════════════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  console.log('%c🔬 DIAGNÓSTICO FISCALITO — Acceso de la IA a tus casos', 'color:#0f766e;font-weight:bold;font-size:14px');
  console.log('%c═══════════════════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  log('Cargando datos…', '#6b7280');

  /* ── Cargar TODO en paralelo ── */
  const [casesR, pendR, dilR, mondayR, driveR] = await Promise.all([
    sb.from('cases').select('id,name,nueva_resolucion,actuaria,materia,protocolo,tipo_procedimiento,estado_procedimiento,denunciantes,denunciados,estamentos_denunciante,estamentos_denunciado,fecha_denuncia,fecha_recepcion_fiscalia,fecha_resolucion,fecha_vista,drive_folder_url,observaciones,informe_final,resultado,propuesta,judicializada,medida_cautelar,categoria,status,deleted_at').is('deleted_at', null),
    sb.from('acciones_pendientes').select('id,case_id,status,priority').eq('user_id', user.id),
    sb.from('diligencias').select('id,case_id,is_processed,ai_summary,file_name'),
    sb.from('monday_mappings').select('case_id,last_message_at,monday_item_id'),
    sb.from('drive_processed_files').select('case_id,file_id,status').limit(20000)
  ]);
  if (casesR.error) { console.error('❌', casesR.error.message); return; }

  const cases = (casesR.data||[]).filter(c => c.status !== 'terminado'); /* Foco en activos */
  const pend  = (pendR.data||[]);
  const dil   = (dilR.data||[]);
  const monday= (mondayR.data||[]);
  const drive = (driveR.data||[]);

  const total = cases.length;
  const N = n => n+'/'+total+' ('+Math.round(100*n/total)+'%)';

  /* Helper: contar casos donde un campo está vacío */
  const empty = field => cases.filter(c => {
    const v = c[field];
    if (v==null||v==='') return true;
    if (Array.isArray(v)) return v.length===0;
    return false;
  });

  /* ═══ CAPA 1 — DATOS ESTRUCTURADOS ═══ */
  console.log('');
  console.log('%c━━━ CAPA 1 · DATOS ESTRUCTURADOS ('+total+' casos activos) ━━━', 'color:#0f766e;font-weight:bold;font-size:12px');
  const c1 = {
    materia:                empty('materia').length,
    protocolo:              empty('protocolo').length,
    tipo_procedimiento:     empty('tipo_procedimiento').length,
    estado_procedimiento:   empty('estado_procedimiento').length,
    denunciantes:           empty('denunciantes').length,
    denunciados:            empty('denunciados').length,
    estamento_dte:          empty('estamentos_denunciante').length,
    estamento_ddo:          empty('estamentos_denunciado').length,
    fecha_denuncia:         empty('fecha_denuncia').length,
    fecha_recepcion:        empty('fecha_recepcion_fiscalia').length,
    fecha_resolucion:       empty('fecha_resolucion').length,
    actuaria:               empty('actuaria').length,
    nueva_resolucion:       empty('nueva_resolucion').length
  };
  const cap1Score = Object.values(c1).reduce((s,v)=>s+(total-v),0) / (Object.keys(c1).length*total);
  console.table({
    'Materia':              { vacíos: c1.materia,            estado: c1.materia/total<0.1?'✓':'⚠️' },
    'Protocolo':            { vacíos: c1.protocolo,          estado: c1.protocolo/total<0.1?'✓':'⚠️' },
    'Tipo procedimiento':   { vacíos: c1.tipo_procedimiento, estado: c1.tipo_procedimiento/total<0.1?'✓':'⚠️' },
    'Estado/etapa':         { vacíos: c1.estado_procedimiento,estado: c1.estado_procedimiento/total<0.1?'✓':'⚠️' },
    'Denunciante(s)':       { vacíos: c1.denunciantes,       estado: c1.denunciantes/total<0.1?'✓':'⚠️' },
    'Denunciado(s)':        { vacíos: c1.denunciados,        estado: c1.denunciados/total<0.1?'✓':'⚠️' },
    'Estamento dte.':       { vacíos: c1.estamento_dte,      estado: c1.estamento_dte/total<0.1?'✓':'⚠️' },
    'Estamento ddo.':       { vacíos: c1.estamento_ddo,      estado: c1.estamento_ddo/total<0.1?'✓':'⚠️' },
    'Fecha denuncia':       { vacíos: c1.fecha_denuncia,     estado: c1.fecha_denuncia/total<0.1?'✓':'⚠️' },
    'Fecha recepción fis.': { vacíos: c1.fecha_recepcion,    estado: c1.fecha_recepcion/total<0.1?'✓':'⚠️' },
    'Fecha resolución':     { vacíos: c1.fecha_resolucion,   estado: c1.fecha_resolucion/total<0.1?'✓':'⚠️' },
    'Actuaria asignada':    { vacíos: c1.actuaria,           estado: c1.actuaria/total<0.1?'✓':'⚠️' },
    'Resolución':           { vacíos: c1.nueva_resolucion,   estado: c1.nueva_resolucion/total<0.1?'✓':'⚠️' }
  });
  console.log('  Score capa 1: %c'+Math.round(cap1Score*100)+'%', 'font-weight:bold;color:'+(cap1Score>0.85?'#059669':cap1Score>0.6?'#d97706':'#dc2626'));

  /* ═══ CAPA 2 — DRIVE + RAG ═══ */
  console.log('');
  console.log('%c━━━ CAPA 2 · DRIVE + RAG (Qdrant) ━━━', 'color:#0f766e;font-weight:bold;font-size:12px');
  const sinDrive = cases.filter(c => !c.drive_folder_url);
  const conDrive = cases.filter(c =>  c.drive_folder_url);
  /* Contar archivos procesados por caso */
  const driveByCase = new Map();
  drive.forEach(d => {
    if (!driveByCase.has(d.case_id)) driveByCase.set(d.case_id, 0);
    driveByCase.set(d.case_id, driveByCase.get(d.case_id)+1);
  });
  const conIngestaQdrant = conDrive.filter(c => (driveByCase.get(c.id)||0) > 0);
  const sinIngestaQdrant = conDrive.filter(c => (driveByCase.get(c.id)||0) === 0);
  const totalChunks = drive.length;
  console.table({
    'Casos con Drive vinculado':   { valor: N(conDrive.length),           estado: conDrive.length/total>0.85?'✓':'⚠️' },
    'Casos SIN Drive vinculado':   { valor: N(sinDrive.length),           estado: sinDrive.length<5?'✓':'⚠️' },
    'Drive vinculado + en Qdrant': { valor: N(conIngestaQdrant.length),   estado: conIngestaQdrant.length/total>0.7?'✓':'⚠️' },
    'Drive vinculado SIN Qdrant':  { valor: N(sinIngestaQdrant.length),   estado: sinIngestaQdrant.length<3?'✓':'⚠️' },
    'Total archivos procesados':   { valor: totalChunks,                  estado: totalChunks>200?'✓':'⚠️' }
  });
  if (sinDrive.length) {
    log('  ⚠ Casos sin Drive (vincúlalos abriendo el caso → editar → Drive URL):', '#b45309');
    sinDrive.slice(0,8).forEach(c => log('    · '+(c.name||c.id), '#6b7280'));
    if (sinDrive.length>8) log('    · …y '+(sinDrive.length-8)+' más', '#6b7280');
  }
  if (sinIngestaQdrant.length) {
    log('  ⚠ Casos con Drive pero SIN ingesta Qdrant (correr ingesta masiva):', '#b45309');
    sinIngestaQdrant.slice(0,8).forEach(c => log('    · '+(c.name||c.id), '#6b7280'));
  }

  /* ═══ CAPA 3 — DILIGENCIAS + EXTRACTOS ═══ */
  console.log('');
  console.log('%c━━━ CAPA 3 · DILIGENCIAS CON EXTRACTOS ━━━', 'color:#0f766e;font-weight:bold;font-size:12px');
  const dilByCase = new Map();
  dil.forEach(d => {
    if (!dilByCase.has(d.case_id)) dilByCase.set(d.case_id, []);
    dilByCase.get(d.case_id).push(d);
  });
  const sinDil = cases.filter(c => !dilByCase.has(c.id));
  const conDil = cases.filter(c =>  dilByCase.has(c.id));
  const dilTotal = dil.length;
  const dilProcesadas = dil.filter(d => d.is_processed).length;
  const dilConExtracto = dil.filter(d => d.ai_summary && String(d.ai_summary).trim().length>20).length;
  console.table({
    'Casos sin diligencias registradas': { valor: N(sinDil.length),     estado: sinDil.length<5?'✓':'⚠️' },
    'Casos con diligencias':             { valor: N(conDil.length),     estado: conDil.length/total>0.7?'✓':'⚠️' },
    'Total diligencias en BD':           { valor: dilTotal,             estado: dilTotal>50?'✓':'⚠️' },
    'Diligencias procesadas (OCR)':      { valor: dilProcesadas+'/'+dilTotal+' ('+(dilTotal?Math.round(100*dilProcesadas/dilTotal):0)+'%)', estado: dilProcesadas/Math.max(1,dilTotal)>0.7?'✓':'⚠️' },
    'Diligencias con extracto IA':       { valor: dilConExtracto+'/'+dilTotal+' ('+(dilTotal?Math.round(100*dilConExtracto/dilTotal):0)+'%)', estado: dilConExtracto/Math.max(1,dilTotal)>0.6?'✓':'⚠️' }
  });
  if (sinDil.length) {
    log('  ⚠ Casos sin ninguna diligencia (no hay nada en Drive o no se ha escaneado):', '#b45309');
    sinDil.slice(0,5).forEach(c => log('    · '+(c.name||c.id), '#6b7280'));
  }

  /* ═══ CAPA 4 — PENDIENTES + MONDAY ═══ */
  console.log('');
  console.log('%c━━━ CAPA 4 · CONTEXTO OPERATIVO (pendientes + Monday) ━━━', 'color:#0f766e;font-weight:bold;font-size:12px');
  const pendByCase = new Map();
  pend.forEach(p => {
    if (!pendByCase.has(p.case_id)) pendByCase.set(p.case_id, []);
    pendByCase.get(p.case_id).push(p);
  });
  const sinPend = cases.filter(c => !pendByCase.has(c.id));
  const conPend = cases.filter(c =>  pendByCase.has(c.id));
  const pendActivos = pend.filter(p => p.status !== 'completado');
  const mondayByCase = new Set(monday.map(m => m.case_id));
  const conMonday = cases.filter(c => mondayByCase.has(c.id));
  const sinMonday = cases.filter(c => !mondayByCase.has(c.id));
  console.table({
    'Casos con pendientes':         { valor: N(conPend.length), estado: conPend.length/total>0.6?'✓':'⚠️' },
    'Casos sin pendientes':         { valor: N(sinPend.length), estado: sinPend.length<5?'✓':'⚠️' },
    'Pendientes activos (total)':   { valor: pendActivos.length, estado: '–' },
    'Casos vinculados a Monday':    { valor: N(conMonday.length), estado: conMonday.length/total>0.7?'✓':'⚠️' },
    'Casos SIN vincular a Monday':  { valor: N(sinMonday.length), estado: sinMonday.length<5?'✓':'⚠️' }
  });
  if (sinMonday.length) {
    log('  ⚠ Casos sin Monday (abre cada uno → 📤 una vez para vincularlo):', '#b45309');
    sinMonday.slice(0,8).forEach(c => log('    · '+(c.name||c.id), '#6b7280'));
    if (sinMonday.length>8) log('    · …y '+(sinMonday.length-8)+' más', '#6b7280');
  }

  /* ═══ RECOMENDACIÓN PRIORIZADA POR IMPACTO ═══ */
  console.log('');
  console.log('%c━━━ 🎯 PLAN DE OPTIMIZACIÓN PRIORIZADO ━━━', 'color:#7c3aed;font-weight:bold;font-size:13px');
  /* Cada acción recibe un score = (% impacto) × (cantidad afectada) */
  const acciones = [];
  if (sinDrive.length > 0)
    acciones.push({ score: sinDrive.length*5, accion:'Vincular Drive a '+sinDrive.length+' casos', impacto:'CRÍTICO', detalle:'Sin Drive, Fiscalito no tiene acceso al expediente real. Cada vínculo es ~1 min.' });
  if (sinIngestaQdrant.length > 0)
    acciones.push({ score: sinIngestaQdrant.length*4, accion:'Ingestar a Qdrant '+sinIngestaQdrant.length+' casos con Drive', impacto:'ALTO', detalle:'Sin Qdrant, el RAG vectorial no encuentra texto en los documentos. Usa el botón de mod-drive-qdrant.' });
  if (c1.materia > 5)
    acciones.push({ score: c1.materia*3, accion:'Llenar "materia" en '+c1.materia+' casos', impacto:'ALTO', detalle:'Sin materia, Claude no sabe qué marco normativo aplicar.' });
  if (c1.protocolo > 5)
    acciones.push({ score: c1.protocolo*3, accion:'Llenar "protocolo" en '+c1.protocolo+' casos', impacto:'ALTO', detalle:'Sin protocolo, Claude no cita la normativa especial correcta.' });
  if (c1.denunciantes > 5)
    acciones.push({ score: c1.denunciantes*3, accion:'Llenar denunciante(s) en '+c1.denunciantes+' casos', impacto:'ALTO', detalle:'Sin partes identificadas, Claude no puede personalizar respuestas.' });
  if (c1.denunciados > 5)
    acciones.push({ score: c1.denunciados*3, accion:'Llenar denunciado(s) en '+c1.denunciados+' casos', impacto:'ALTO', detalle:'Idem para denunciados.' });
  if (c1.fecha_denuncia > 10 || c1.fecha_recepcion > 10)
    acciones.push({ score: (c1.fecha_denuncia+c1.fecha_recepcion)*2, accion:'Completar fechas críticas (denuncia / recepción) en casos', impacto:'MEDIO', detalle:'Necesario para análisis de plazos y prescripción.' });
  if (dilTotal > 0 && dilConExtracto/dilTotal < 0.5)
    acciones.push({ score: (dilTotal-dilConExtracto)*2, accion:'Generar extractos IA de '+(dilTotal-dilConExtracto)+' diligencias', impacto:'ALTO', detalle:'Permite RAG por keywords sin costo de embeddings. Botón 🔄 en cada diligencia.' });
  if (sinMonday.length > 5)
    acciones.push({ score: sinMonday.length*1, accion:'Vincular '+sinMonday.length+' casos a Monday', impacto:'MEDIO', detalle:'Solo si quieres usar el bridge bidireccional con tus actuarias.' });
  if (sinPend.length > 5)
    acciones.push({ score: sinPend.length*1, accion:'Crear pendientes para '+sinPend.length+' casos', impacto:'MEDIO', detalle:'Le da a Fiscalito el "estado mental" del caso.' });

  acciones.sort((a,b) => b.score - a.score);
  if (!acciones.length) {
    log('🎉 Tus expedientes están en excelente estado. Fiscalito tiene acceso completo.', '#059669');
  } else {
    acciones.slice(0,8).forEach((a,i) => {
      const color = a.impacto==='CRÍTICO'?'#dc2626':a.impacto==='ALTO'?'#d97706':'#6b7280';
      console.log('%c'+(i+1)+'. ['+a.impacto+'] '+a.accion, 'color:'+color+';font-weight:bold');
      console.log('   → '+a.detalle);
    });
  }

  /* ═══ SCORE GLOBAL ═══ */
  const scoreGlobal = Math.round((
    cap1Score*0.30 +
    (conDrive.length/total)*0.20 +
    (conIngestaQdrant.length/total)*0.20 +
    (dilConExtracto/Math.max(1,dilTotal))*0.15 +
    (conPend.length/total)*0.10 +
    (conMonday.length/total)*0.05
  )*100);
  const scoreColor = scoreGlobal>80?'#059669':scoreGlobal>60?'#d97706':'#dc2626';
  console.log('');
  console.log('%c═══════════════════════════════════════════════════════', 'color:'+scoreColor+';font-weight:bold');
  console.log('%c📊 SCORE GLOBAL DE COMPLETITUD: '+scoreGlobal+' / 100', 'color:'+scoreColor+';font-weight:bold;font-size:16px');
  console.log('%c   '+(scoreGlobal>80?'✓ Fiscalito tiene acceso muy bueno':scoreGlobal>60?'⚠ Hay margen de mejora notable':'⚠ Mucho contexto está faltando'), 'color:'+scoreColor+';font-weight:bold');
  console.log('%c═══════════════════════════════════════════════════════', 'color:'+scoreColor+';font-weight:bold');
  console.log('Diagnóstico generado en '+(((Date.now()-t0)/1000).toFixed(1))+'s · ejecuta cuando quieras para medir progreso.');
})().catch(e => console.error('💥', e));
