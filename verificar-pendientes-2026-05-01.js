/* ═══════════════════════════════════════════════════════════════════
   VERIFICAR PENDIENTES IMPORTADOS (planilla 2026-04-28)
   ───────────────────────────────────────────────────────────────────
   Compara los 60 EXP de la planilla contra los pendientes existentes
   en tu BD. Te dice cuáles tienen pendiente, cuáles no, y muestra una
   muestra del título del pendiente para que verifiques que coincide
   con la observación del Excel.

   USO: pega TODO en la consola (F12 → Console) y Enter.
   ═══════════════════════════════════════════════════════════════════ */
(async function verificarPendientes () {
  const EXPS = [
    "14-A","18-A","69-A","70-A","73 G","25 G","50 G","54 G","56-A","72-A",
    "73-A","74-A","75-A","78-A","79-A","83-A","76 G","79 G","81 G","83 G",
    "84-A","85-A","86-A","87-A","88-A","89 G","89-A","90 G","90-A","91-G",
    "93-G","94-G","95-G","55 G","59-A","71-A","82 G","92-G","56 G","57-A",
    "58 G","62 G","62-A","64 G","64-A","65 G","65-A","67-A","68 G","72 G",
    "74 G","75 G","77 G","78 G","80 G","84 G","85 G","86 G","87 G","88 G"
  ];
  const _normExp = s => String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[\/–—-]/g,'-');

  if (typeof sb === 'undefined' || !sb) { console.error('❌ Sin sesión activa'); return; }
  const { data:{user} } = await sb.auth.getUser();
  if (!user) { console.error('❌ Sin usuario'); return; }

  /* Cargar casos del usuario */
  const all = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : [];
  let casos = all.length ? all : ((await sb.from('cases').select('id,name,actuaria').is('deleted_at',null)).data||[]);
  const byExp = new Map();
  casos.forEach(c => { if (c.name) byExp.set(_normExp(c.name), c); });

  /* Cargar pendientes del usuario */
  const r = await sb.from('acciones_pendientes').select('id,case_id,title,description,status,priority,created_at').eq('user_id', user.id);
  if (r.error) { console.error('❌', r.error.message); return; }
  const pendByCase = new Map();
  for (const p of (r.data||[])) {
    if (!pendByCase.has(p.case_id)) pendByCase.set(p.case_id, []);
    pendByCase.get(p.case_id).push(p);
  }

  /* Reporte */
  console.log('%c═══════════════════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  console.log('%c📋 VERIFICACIÓN DE PENDIENTES (planilla 2026-04-28)', 'color:#0f766e;font-weight:bold;font-size:13px');
  console.log('═══════════════════════════════════════════════════════');
  let withPend=0, withoutPend=0, withImported=0, noMatch=0;
  const filas = [];
  for (const exp of EXPS) {
    const caso = byExp.get(_normExp(exp));
    if (!caso) { noMatch++; filas.push({exp, estado:'❌ caso no existe en BD', actuaria:'—', pendientes:0, ejemplo:'—'}); continue; }
    const pends = pendByCase.get(caso.id) || [];
    const importados = pends.filter(p => /Importado desde planilla Mis-Casos/i.test(p.description||''));
    if (pends.length) {
      withPend++;
      if (importados.length) withImported++;
      filas.push({
        exp, estado:'✓ '+pends.length+' pend.', actuaria:caso.actuaria||'(sin asignar)',
        pendientes:pends.length, importados:importados.length,
        ejemplo:(pends[0].title||'').slice(0,80)
      });
    } else {
      withoutPend++;
      filas.push({exp, estado:'⚠ sin pendientes', actuaria:caso.actuaria||'(sin asignar)', pendientes:0, ejemplo:'—'});
    }
  }
  console.log('%cResumen:', 'font-weight:bold');
  console.log('  Casos en planilla:        '+EXPS.length);
  console.log('  Casos encontrados en BD:  '+(EXPS.length-noMatch));
  console.log('  Con al menos 1 pendiente: '+withPend);
  console.log('  · de éstos, importados:   '+withImported);
  console.log('  Sin pendientes:           '+withoutPend);
  console.log('  Sin caso en BD:           '+noMatch);
  console.log('');
  console.log('Detalle (primeras 60 filas):');
  console.table(filas);
  if (withoutPend > 0) {
    console.log('%c💡 Hay '+withoutPend+' casos sin pendientes. Si esperabas verlos, corre el script de importación:', 'color:#b45309;font-weight:bold');
    console.log('   importar-mis-casos-2026-05-01.js → pegar en consola');
  } else {
    console.log('%c✅ Todos los casos tienen al menos un pendiente.', 'color:#059669;font-weight:bold');
  }
})().catch(e => console.error('💥', e));
