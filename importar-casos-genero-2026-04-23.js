/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAR 4 CASOS DE GÉNERO (92-G a 95-G) CON AUTO-EXTRACCIÓN DESDE DRIVE
   ───────────────────────────────────────────────────────────────────────────
   INSTRUCCIONES:
   1. Abre Fiscalito en el navegador con sesión iniciada (VERÓNICA).
   2. Abre la consola (F12 → Console).
   3. Pega TODO este archivo, presiona Enter, y espera.
      (Toma ~30-60 seg por caso porque lista los archivos de Drive y llama a la IA)
   4. Al terminar, refresca la página (F5) para ver los 4 casos en la pestaña Género.
   ═══════════════════════════════════════════════════════════════════════════ */

(async function importarCasosGenero() {
  const CASOS = [
    { name: '92-G', nueva_resolucion: 'Res. Exenta N°157-2026', drive_folder_url: 'https://drive.google.com/drive/folders/1H12YqEBNAaIFv9tsSyQOBDitkoTp5a7h' },
    { name: '93-G', nueva_resolucion: 'Res. Exenta N°311-2026', drive_folder_url: 'https://drive.google.com/drive/folders/1YPqpBSeJiCCRoi2MGwuqGTc0JOVQE91M' },
    { name: '94-G', nueva_resolucion: 'Res. Exenta N°317-2026', drive_folder_url: 'https://drive.google.com/drive/folders/1L2e5HOOLDlBojJKf_pd2FaHipd1Ej081' },
    { name: '95-G', nueva_resolucion: 'Res. Exenta N°366-2026', drive_folder_url: 'https://drive.google.com/drive/folders/10xXJ2LVXWzp6tI_71TgYzz4czYL6PWsG' },
  ];

  /* ── 1) Verificaciones ── */
  if (typeof sb === 'undefined' || !session?.user?.id) {
    console.error('❌ No hay sesión activa. Inicia sesión primero.');
    return;
  }
  if (typeof authFetch !== 'function') {
    console.error('❌ authFetch no disponible. Recarga la página.');
    return;
  }
  console.log('%c🚀 Inicio de importación de 4 casos de género', 'color:#059669;font-weight:bold;font-size:14px');
  console.log('   Usuario:', session.user.email);
  console.log('   Casos a crear:', CASOS.length);

  const uid = session.user.id;
  const creados = [];
  const errores = [];

  /* ── 2) Crear los 4 casos en Supabase ── */
  for (const c of CASOS) {
    const payload = {
      id: crypto.randomUUID(),
      user_id: uid,
      name: c.name,
      nueva_resolucion: c.nueva_resolucion,
      drive_folder_url: c.drive_folder_url,
      categoria: 'genero',
      status: 'active',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from('cases').insert(payload).select().single();
    if (error || !data) {
      console.error('❌ Error creando', c.name, ':', error?.message || 'sin datos');
      errores.push({ caso: c.name, error: error?.message });
      continue;
    }
    creados.push(data);
    if (typeof allCases !== 'undefined') allCases.unshift(data);
    console.log(`✅ Caso creado: ${c.name}  id=${data.id}`);
  }

  if (typeof renderCaseList === 'function') renderCaseList();
  if (typeof updateCatCounts === 'function') updateCatCounts();

  /* ── 3) Para cada caso creado, extraer info desde Drive (secuencial) ── */
  console.log('%c📥 Iniciando extracción de información desde Drive…', 'color:#2563eb;font-weight:bold');

  for (const caso of creados) {
    console.log(`\n── Procesando ${caso.name} (${caso.nueva_resolucion}) ──`);
    try {
      /* 3.a Extraer folderId */
      const m = caso.drive_folder_url.match(/folders\/([^?&/]+)/);
      if (!m) { console.warn('   ⚠ No pude extraer folderId'); continue; }
      const folderId = m[1];

      /* 3.b Listar archivos (recursivo hasta 3 niveles) */
      console.log('   📂 Listando archivos en Drive…');
      const listRes = await authFetch('/.netlify/functions/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', folderId, recursive: true, maxDepth: 3 })
      });
      if (!listRes.ok) { console.warn('   ⚠ Drive list HTTP', listRes.status); continue; }
      const listData = await listRes.json();
      const files = listData?.files || [];
      console.log(`   📄 ${files.length} archivo(s) encontrado(s)`);

      /* 3.c Leer documentos legibles (Google Docs, Sheets, texto) */
      const readable = files.filter(f => {
        const mt = f.mimeType || '';
        return mt.includes('document') || mt.includes('spreadsheet') || mt.includes('presentation') || mt.includes('text/');
      }).slice(0, 10);

      const docs = [];
      for (const f of readable) {
        try {
          const r = await authFetch('/.netlify/functions/drive', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'read', fileId: f.id })
          });
          if (r.ok) {
            const d = await r.json();
            if (d?.ok && d.content && !d.content.startsWith('[Archivo binario')) {
              docs.push({ name: f._path || f.name, content: d.content.substring(0, 4000) });
            }
          }
        } catch (e) { /* continuar con el siguiente */ }
      }

      /* 3.d Extraer contenido de PDFs con OCR (máx 5 para no saturar) */
      const pdfs = files.filter(f => (f.mimeType || '').includes('pdf')).slice(0, 5);
      for (const f of pdfs) {
        try {
          console.log(`   🔍 OCR de ${f.name}…`);
          const r = await authFetch('/.netlify/functions/ocr', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'extract', fileId: f.id, fileName: f.name })
          });
          if (r.ok) {
            const d = await r.json();
            if (d?.extractedText || d?.text) {
              docs.push({ name: f._path || f.name, content: (d.extractedText || d.text).substring(0, 4000) });
            }
          }
        } catch (e) { /* continuar */ }
      }

      console.log(`   📝 ${docs.length} documento(s) leído(s) (inc. ${pdfs.length} PDF con OCR)`);

      /* 3.e Pedir a Claude que extraiga datos estructurados */
      const fileList = files.map(f => `- ${f._path || f.name} (${f.mimeType || '?'})`).join('\n');
      const docsText = docs.length ? docs.map(d => `### ${d.name}\n${d.content}`).join('\n\n---\n\n') : '[Sin contenido legible]';

      const extractPrompt = `Analiza los documentos de este expediente disciplinario de GÉNERO y extrae datos estructurados.

DATOS ACTUALES DEL CASO:
- Nombre: ${caso.name}
- Resolución: ${caso.nueva_resolucion}
- Categoría: género (Ley 21.369 / Ley Karin)

ARCHIVOS EN LA CARPETA (${files.length}, ${docs.length} leídos):
${fileList || '[Carpeta vacía o sin acceso]'}

${docs.length ? 'CONTENIDO EXTRAÍDO DE DOCUMENTOS:\n' + docsText : 'NOTA: No se pudo leer el contenido. Analiza los NOMBRES de los archivos para inferir datos.'}

EXTRAE EN JSON PURO (sin markdown, sin backticks, solo el objeto JSON):
{
  "fecha_resolucion": "DD-MM-YYYY o null",
  "fecha_denuncia": "DD-MM-YYYY o null",
  "fecha_recepcion_fiscalia": "DD-MM-YYYY o null",
  "tipo_procedimiento": "Investigación Sumaria | Sumario Administrativo | Procedimiento Disciplinario | null",
  "protocolo": "2020 | 2022 | 18834 | Laboral | Ley Karin | 34-SU | 21-SU-2025 | null",
  "materia": "materia investigada o null",
  "caratula": "carátula del expediente o null",
  "denunciantes": ["nombres"] o null,
  "estamentos_denunciante": ["Funcionario|Académico|Estudiante|Honorario"] o null,
  "denunciados": ["nombres"] o null,
  "estamentos_denunciado": ["Funcionario|Académico|Estudiante|Honorario"] o null,
  "carrera_denunciante": "carrera o null",
  "carrera_denunciado": "carrera o null",
  "medida_cautelar": true/false/null,
  "medida_cautelar_detalle": "descripción o null",
  "observaciones": "notas relevantes o null"
}
Solo datos que encuentres en los documentos. Si no hay dato, usa null.`;

      const aiRes = await authFetch('/.netlify/functions/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 2000,
          system: 'Eres un extractor de datos de documentos jurídicos. Responde SOLO con JSON válido sin markdown.',
          messages: [{ role: 'user', content: extractPrompt }]
        })
      });
      if (!aiRes.ok) { console.warn('   ⚠ IA error HTTP', aiRes.status); continue; }
      const aiData = await aiRes.json();
      let text = aiData?.content?.[0]?.text || aiData?.text || aiData?.message || '';
      /* limpiar posibles backticks */
      text = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();

      let extracted = null;
      try { extracted = JSON.parse(text); }
      catch (e) { console.warn('   ⚠ JSON inválido:', text.substring(0, 200)); continue; }

      /* 3.f Aplicar datos extraídos al caso (no sobreescribir si ya hay valor) */
      const update = { updated_at: new Date().toISOString() };
      const setIfNew = (k, v) => { if (v !== null && v !== undefined && !caso[k]) update[k] = v; };
      setIfNew('fecha_resolucion', extracted.fecha_resolucion);
      setIfNew('fecha_denuncia', extracted.fecha_denuncia);
      setIfNew('fecha_recepcion_fiscalia', extracted.fecha_recepcion_fiscalia);
      setIfNew('tipo_procedimiento', extracted.tipo_procedimiento);
      setIfNew('protocolo', extracted.protocolo);
      setIfNew('materia', extracted.materia);
      setIfNew('caratula', extracted.caratula);
      setIfNew('carrera_denunciante', extracted.carrera_denunciante);
      setIfNew('carrera_denunciado', extracted.carrera_denunciado);
      setIfNew('observaciones', extracted.observaciones);
      setIfNew('medida_cautelar_detalle', extracted.medida_cautelar_detalle);
      if (extracted.denunciantes?.length) update.denunciantes = extracted.denunciantes;
      if (extracted.estamentos_denunciante?.length) update.estamentos_denunciante = extracted.estamentos_denunciante;
      if (extracted.denunciados?.length) update.denunciados = extracted.denunciados;
      if (extracted.estamentos_denunciado?.length) update.estamentos_denunciado = extracted.estamentos_denunciado;
      if (extracted.medida_cautelar !== null && extracted.medida_cautelar !== undefined) update.medida_cautelar = extracted.medida_cautelar;

      const { error: upErr } = await sb.from('cases').update(update).eq('id', caso.id);
      if (upErr) { console.warn('   ⚠ No se pudo actualizar:', upErr.message); continue; }

      Object.assign(caso, update);
      const idx = allCases?.findIndex?.(x => x.id === caso.id);
      if (idx >= 0) Object.assign(allCases[idx], update);
      console.log(`   ✅ Datos aplicados: ${Object.keys(update).length - 1} campo(s) actualizado(s)`);
    } catch (err) {
      console.error(`   ❌ Error procesando ${caso.name}:`, err.message);
      errores.push({ caso: caso.name, error: err.message });
    }

    /* Rate-limit: esperar 2 seg entre casos para no saturar drive-extract */
    await new Promise(r => setTimeout(r, 2000));
  }

  /* ── 4) Resumen ── */
  if (typeof renderCaseList === 'function') renderCaseList();
  if (typeof updateCatCounts === 'function') updateCatCounts();

  console.log('\n%c══════════════════════════════════════════', 'color:#059669;font-weight:bold');
  console.log('%c✅ PROCESO COMPLETADO', 'color:#059669;font-weight:bold;font-size:14px');
  console.log(`   Creados: ${creados.length}/${CASOS.length}`);
  if (errores.length) {
    console.log('   Errores:');
    errores.forEach(e => console.log(`   - ${e.caso}: ${e.error}`));
  }
  console.log('   👉 Refresca la página (F5) y revisa la pestaña "👥 Género"');
  console.log('%c══════════════════════════════════════════', 'color:#059669;font-weight:bold');
})();
