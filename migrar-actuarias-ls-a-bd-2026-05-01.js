/* ═══════════════════════════════════════════════════════════════════
   MIGRAR ACTUARIAS: localStorage → BD (cases.actuaria)
   v1.0 · 2026-05-01
   ───────────────────────────────────────────────────────────────────
   Después de aplicar la migración SQL `add_actuaria_to_cases_2026-05-01.sql`
   en Supabase, este script:
     1) Lee el mapping local fiscalito_actuarias_assign de localStorage
     2) Lo persiste en cases.actuaria para todos los casos donde aplique
     3) Reporta cuántos se migraron, cuántos ya estaban en BD, errores

   USO: pega TODO en consola (F12 → Console), Enter.
   PRE-REQUISITO: haber ejecutado primero el SQL de migración en Supabase.
   ═══════════════════════════════════════════════════════════════════ */
(async function migrarActuariasLSaBD () {
  if (typeof sb === 'undefined' || !sb) { console.error('❌ Sin sesión'); return; }

  /* Cargar mapping local */
  let map = {};
  try { map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign')||'{}') || {}; }
  catch { map = {}; }
  const ids = Object.keys(map);
  if (!ids.length) { console.log('%c⚠ No hay actuarias en localStorage para migrar.', 'color:#b45309'); return; }

  console.log('%c═══════════════════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  console.log('%c🚚 MIGRAR ACTUARIAS · localStorage → BD', 'color:#0f766e;font-weight:bold;font-size:13px');
  console.log('   Asignaciones en LS:', ids.length);
  console.log('═══════════════════════════════════════════════════════');

  /* Verificar primero que la columna existe (intento dummy) */
  const probe = await sb.from('cases').select('id,actuaria').limit(1);
  if (probe.error && /actuaria/i.test(probe.error.message)) {
    console.error('%c❌ La columna cases.actuaria NO existe en BD.', 'color:#dc2626;font-weight:bold');
    console.error('   Ejecuta primero el SQL: sql/add_actuaria_to_cases_2026-05-01.sql en Supabase.');
    return;
  }

  /* Cargar estado actual */
  const cur = await sb.from('cases').select('id,name,actuaria').in('id', ids);
  if (cur.error) { console.error('❌', cur.error.message); return; }
  const byId = new Map((cur.data||[]).map(c => [c.id, c]));

  let migrated=0, skipExist=0, skipNotFound=0, errors=0;
  for (const cid of ids) {
    const wanted = String(map[cid]||'').trim();
    if (!wanted) { delete map[cid]; continue; }
    const c = byId.get(cid);
    if (!c) { skipNotFound++; continue; }
    if (c.actuaria === wanted) { skipExist++; continue; }
    /* Update */
    const r = await sb.from('cases').update({ actuaria: wanted, updated_at: new Date().toISOString() }).eq('id', cid);
    if (r.error) { errors++; console.warn('  ⚠ '+(c.name||cid)+': '+r.error.message); }
    else { migrated++; console.log('  ✓ '+(c.name||cid)+' → '+wanted); }
  }

  console.log('');
  console.log('%c━━━ RESUMEN ━━━', 'color:#0f766e;font-weight:bold');
  console.log('  Migrados a BD:        '+migrated);
  console.log('  Ya estaban en BD:     '+skipExist);
  console.log('  Caso no encontrado:   '+skipNotFound);
  console.log('  Errores:              '+errors);

  /* Si todo OK, opcionalmente limpiar localStorage */
  if (migrated>0 && !errors) {
    if (confirm('¿Limpiar el mapping local fiscalito_actuarias_assign? (recomendado, los datos ya están en BD)')) {
      localStorage.setItem('fiscalito_actuarias_assign', '{}');
      console.log('%c✓ localStorage limpiado.', 'color:#059669;font-weight:bold');
    }
  }
  /* Refrescar UI */
  try {
    if (typeof allCases!=='undefined' && Array.isArray(allCases)) {
      const r = await sb.from('cases').select('*').is('deleted_at', null);
      if (r.data) { allCases.length = 0; allCases.push(...r.data); }
    }
    if (typeof window.renderTabla === 'function') window.renderTabla();
    if (typeof window.pendRender === 'function') window.pendRender();
  } catch {}
  console.log('%c💡 Recarga la página (F5) para ver todo sincronizado desde BD.', 'color:#7c3aed;font-style:italic');
})().catch(e => console.error('💥', e));
