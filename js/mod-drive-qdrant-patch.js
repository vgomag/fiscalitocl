/**
 * MOD-DRIVE-QDRANT-PATCH.JS
 * ─────────────────────────
 * Parche que reemplaza las funciones rotas de mod-drive-qdrant.js
 * que llaman a Supabase Edge Functions inexistentes.
 * Se carga DESPUÉS de mod-drive-qdrant.js y sobreescribe:
 *   - dqScanFolder()   → usa callDrive() (Netlify function: drive)
 *   - dqProcessFile()  → usa authFetch a /.netlify/functions/ocr + /.netlify/functions/qdrant-ingest
 *   - dqSyncNew()      → usa funciones corregidas
 *   - dqSyncAll()      → usa funciones corregidas
 *   - dqForceSync()    → usa funciones corregidas
 *   - dqCleanResync()  → usa funciones corregidas
 */

const QDRANT_ENDPOINT = '/.netlify/functions/qdrant-ingest';
const OCR_ENDPOINT = '/.netlify/functions/ocr';
const DRIVE_ENDPOINT = '/.netlify/functions/drive';

/* ═══ dqScanFolder — Lista archivos de una carpeta Drive ═══ */
window.dqScanFolder = async function dqScanFolder() {
  if (!dq.selectedFolderId) return showToast('⚠ Selecciona una carpeta primero');
  dq.scanning = true;
  renderDQView();

  try {
    /* Usar callDrive (Netlify) en vez de sb.functions.invoke('google-drive') */
    const res = await callDrive({ action: 'list', folderId: dq.selectedFolderId, recursive: true });
    const files = res?.files || res?.data || [];

    /* Marcar archivos como nuevos o ya procesados */
    const processedIds = new Set((dq.processedFiles || []).map(f => f.drive_file_id));
    dq.scannedFiles = files.map(f => ({
      ...f,
      isNew: !processedIds.has(f.id)
    }));

    showToast(`✅ ${files.length} archivos encontrados (${files.filter(f => !processedIds.has(f.id)).length} nuevos)`);
  } catch (err) {
    console.error('dqScanFolder error:', err);
    showToast('❌ Error escaneando carpeta: ' + err.message);
    dq.scannedFiles = [];
  }

  dq.scanning = false;
  renderDQView();
};

/* ═══ dqProcessFile — Procesa un archivo: Lee texto + Embeddings + Qdrant ═══ */
window.dqProcessFile = async function dqProcessFile(sb, file, folder) {
  const folderId = folder?.id || dq.selectedFolderId;
  const collection = folder?.qdrant_collection || 'administrative_discipline';

  try {
    /* Paso 1: Obtener texto del archivo via Drive (Netlify) */
    let text = '';

    try {
      const readRes = await callDrive({ action: 'read', fileId: file.id });
      text = readRes?.text || readRes?.content || '';
    } catch (e) {
      console.warn('callDrive read failed for', file.name, e.message);
    }

    /* Fallback: intentar download directo */
    if (!text || text.length < 20) {
      try {
        const dlRes = await callDrive({ action: 'download', fileId: file.id });
        text = dlRes?.text || dlRes?.content || '';
      } catch (e) { /* ignorar */ }
    }

    if (!text || text.length < 20) {
      console.warn('Archivo sin contenido extraíble:', file.name);
      await dqRecordFile(sb, file, folderId, collection, 'empty', 0);
      return { success: false, reason: 'empty' };
    }

    /* Paso 2: Enviar a Qdrant (embed + upsert via Netlify) */
    const ingestRes = await authFetch(QDRANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'ingest',
        collection,
        sanitize: true,
        chunkSize: 1000,
        chunkOverlap: 200,
        documents: [{
          id: file.id,
          text,
          metadata: {
            name: file.name,
            mimeType: file.mimeType || 'unknown',
            folderId,
            source: 'drive',
            indexed_at: new Date().toISOString()
          }
        }]
      })
    });

    if (!ingestRes.ok) {
      const errData = await ingestRes.json().catch(() => ({}));
      throw new Error(errData.error || `Ingest failed: ${ingestRes.status}`);
    }

    const ingestData = await ingestRes.json();
    const chunks = ingestData.totalPoints || 0;

    /* Paso 3: Registrar archivo procesado en Supabase */
    await dqRecordFile(sb, file, folderId, collection, 'indexed', chunks);

    return { success: true, chunks };

  } catch (err) {
    console.error('dqProcessFile error:', file.name, err);
    await dqRecordFile(sb, file, folderId, collection, 'error', 0);
    return { success: false, error: err.message };
  }
};

/* ═══ dqSyncNew — Sincroniza solo archivos nuevos ═══ */
window.dqSyncNew = async function dqSyncNew() {
  if (!dq.selectedFolderId) return showToast('⚠ Selecciona una carpeta primero');
  dq.syncing = true;
  dq.syncProgress = { current: 0, total: 0, errors: 0, file: '' };
  renderDQView();

  try {
    /* Escanear si no hay archivos escaneados */
    if (!dq.scannedFiles?.length) {
      await dqScanFolder();
    }

    const newFiles = (dq.scannedFiles || []).filter(f => f.isNew && !f.mimeType?.includes('folder'));
    dq.syncProgress.total = newFiles.length;

    if (!newFiles.length) {
      showToast('✅ No hay archivos nuevos para sincronizar');
      dq.syncing = false;
      renderDQView();
      return;
    }

    /* Obtener folder info para saber la colección */
    const folder = dqAllFolders().find(f => f.id === dq.selectedFolderId) || { qdrant_collection: 'administrative_discipline' };

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i];
      dq.syncProgress.current = i + 1;
      dq.syncProgress.file = file.name;
      renderDQProgress();

      const result = await dqProcessFile(sb, file, folder);
      if (!result.success) dq.syncProgress.errors++;

      await dqDelay(500); /* Rate limiting */
    }

    showToast(`✅ Sincronización completada: ${dq.syncProgress.total - dq.syncProgress.errors} OK, ${dq.syncProgress.errors} errores`);
  } catch (err) {
    console.error('dqSyncNew error:', err);
    showToast('❌ Error: ' + err.message);
  }

  dq.syncing = false;
  await dqLoadAll();
  renderDQView();
};

/* ═══ dqSyncAll — Sincroniza TODOS los archivos (nuevos y existentes) ═══ */
window.dqSyncAll = async function dqSyncAll() {
  if (!dq.selectedFolderId) return showToast('⚠ Selecciona una carpeta');
  if (!confirm('¿Resincronizar TODOS los archivos de esta carpeta? Esto puede tomar varios minutos.')) return;

  dq.bulkSyncing = true;
  dq.bulkProgress = { current: 0, total: 0, errors: 0, file: '' };
  renderDQView();

  try {
    /* Escanear carpeta */
    await dqScanFolder();
    const allFiles = (dq.scannedFiles || []).filter(f => !f.mimeType?.includes('folder'));
    dq.bulkProgress.total = allFiles.length;

    const folder = dqAllFolders().find(f => f.id === dq.selectedFolderId) || { qdrant_collection: 'administrative_discipline' };

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      dq.bulkProgress.current = i + 1;
      dq.bulkProgress.file = file.name;
      renderDQProgress();

      const result = await dqProcessFile(sb, file, folder);
      if (!result.success) dq.bulkProgress.errors++;

      await dqDelay(500);
    }

    showToast(`✅ Sincronización masiva: ${dq.bulkProgress.total - dq.bulkProgress.errors} OK, ${dq.bulkProgress.errors} errores`);
  } catch (err) {
    console.error('dqSyncAll error:', err);
    showToast('❌ Error: ' + err.message);
  }

  dq.bulkSyncing = false;
  await dqLoadAll();
  renderDQView();
};

/* ═══ dqForceSync — Fuerza re-sincronización limpiando archivos procesados ═══ */
window.dqForceSync = async function dqForceSync() {
  if (!dq.selectedFolderId) return showToast('⚠ Selecciona una carpeta');
  if (!confirm('¿Forzar re-sincronización? Se eliminarán los registros de archivos procesados y se volverán a indexar.')) return;

  dq.forceSyncing = true;
  dq.forceProgress = { current: 0, total: 0, errors: 0, file: '' };
  renderDQView();

  try {
    /* Limpiar archivos procesados de esta carpeta */
    await sb.from('drive_processed_files')
      .delete()
      .eq('folder_id', dq.selectedFolderId);

    /* Escanear */
    await dqScanFolder();

    /* Ahora todos los archivos serán "nuevos" */
    const allFiles = (dq.scannedFiles || []).filter(f => !f.mimeType?.includes('folder'));
    dq.forceProgress.total = allFiles.length;

    const folder = dqAllFolders().find(f => f.id === dq.selectedFolderId) || { qdrant_collection: 'administrative_discipline' };

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      dq.forceProgress.current = i + 1;
      dq.forceProgress.file = file.name;
      renderDQProgress();

      const result = await dqProcessFile(sb, file, folder);
      if (!result.success) dq.forceProgress.errors++;

      await dqDelay(800);
    }

    showToast(`✅ Re-sincronización forzada completada: ${dq.forceProgress.total - dq.forceProgress.errors} OK`);
  } catch (err) {
    console.error('dqForceSync error:', err);
    showToast('❌ Error: ' + err.message);
  }

  dq.forceSyncing = false;
  await dqLoadAll();
  renderDQView();
};

/* ═══ dqCleanResync — Limpia colección y reindexar ═══ */
window.dqCleanResync = async function dqCleanResync() {
  if (!dq.selectedFolderId) return showToast('⚠ Selecciona una carpeta');
  const folder = dqAllFolders().find(f => f.id === dq.selectedFolderId);
  if (!folder) return;

  const collection = folder.qdrant_collection || 'administrative_discipline';
  if (!confirm(`¿Limpiar la colección "${collection}" y re-indexar todos los archivos? Esta acción no se puede deshacer.`)) return;

  dq.cleaning = true;
  renderDQView();

  try {
    /* Eliminar colección en Qdrant */
    await authFetch(QDRANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-collection', collection })
    });

    /* Recrear colección */
    await authFetch(QDRANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-collection', collection, vectorSize: 768 })
    });

    /* Limpiar registros procesados */
    await sb.from('drive_processed_files')
      .delete()
      .eq('folder_id', dq.selectedFolderId);

    showToast('✅ Colección limpiada. Ahora puedes sincronizar los archivos.');
  } catch (err) {
    console.error('dqCleanResync error:', err);
    showToast('❌ Error: ' + err.message);
  }

  dq.cleaning = false;
  await dqLoadAll();
  renderDQView();
};

/* ═══ Override dqCreateCollection para usar Qdrant API ═══ */
const _origCreateCollection = window.dqCreateCollection;
window.dqCreateCollection = async function dqCreateCollection() {
  const name = prompt('Nombre de la nueva colección (snake_case):');
  if (!name || !name.trim()) return;

  const cleanName = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!cleanName) return showToast('⚠ Nombre inválido');

  try {
    /* Crear en Qdrant vía Netlify */
    const res = await authFetch(QDRANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-collection', collection: cleanName, vectorSize: 768 })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error creando colección');
    }

    /* Registrar en Supabase */
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('custom_qdrant_collections').insert({
      name: cleanName,
      user_id: user?.id,
      created_at: new Date().toISOString()
    });

    showToast('✅ Colección "' + cleanName + '" creada');
    await dqLoadAll();
    renderDQView();
  } catch (err) {
    console.error('dqCreateCollection error:', err);
    showToast('❌ Error: ' + err.message);
  }
};

/* ═══ Override dqDeleteCollection para usar Qdrant API ═══ */
const _origDeleteCollection = window.dqDeleteCollection;
window.dqDeleteCollection = async function dqDeleteCollection(dbId, name) {
  if (!confirm('¿Eliminar la colección "' + name + '"? Los datos indexados se perderán.')) return;

  try {
    /* Eliminar de Qdrant vía Netlify */
    await authFetch(QDRANT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-collection', collection: name })
    });

    /* Eliminar registro en Supabase */
    await sb.from('custom_qdrant_collections').delete().eq('id', dbId);

    showToast('✅ Colección eliminada');
    await dqLoadAll();
    renderDQView();
  } catch (err) {
    console.error('dqDeleteCollection error:', err);
    showToast('❌ Error: ' + err.message);
  }
};

console.log('%c🔧 Parche Qdrant cargado — funciones corregidas para usar Netlify', 'color:#10b981;font-weight:bold');
