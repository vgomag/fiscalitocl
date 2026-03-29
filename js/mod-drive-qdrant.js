/* ================================================================
   MOD-DRIVE-QDRANT.JS — Monitor de Sincronización Drive → Qdrant
   Indexación vectorial: Google Drive → Qdrant (embeddings 768d)
   ================================================================
   v1.0 · 2026-03-25 · Fiscalito / UMAG
   ================================================================

   EDGE FUNCTIONS REQUERIDAS (ya desplegadas en Supabase):
   - google-drive     → listar / descargar archivos Drive
   - ingest-to-qdrant → chunking + embeddings + upsert Qdrant
   - ocr-pdf-drive    → OCR de PDFs con Gemini 2.5 Flash

   TABLAS SUPABASE:
   - drive_processed_files   → tracking de archivos procesados
   - custom_qdrant_collections → colecciones personalizadas
   ================================================================ */

/* ────────────────────────────────────────────────────────────────
   1 · DATOS BASE
   ──────────────────────────────────────────────────────────────── */

// Carpetas Drive base (IDs fijos del proyecto UMAG)
const DQ_BASE_FOLDERS = [
  { id:'1TvLs0J94gKAZKEe8ZF9o77oLJmVNAx2C', name:'Dictámenes CGR',          collection:'rulings'                   },
  { id:'11Vz73Te97ZHPc9f2E-_6cHLSi7LLLZ0g', name:'Doctrina Administrativo',  collection:'administrative_discipline'  },
  { id:'1Gng03HxH7G_JyGfBiYDkEkcgBpTcrTpX', name:'Jurisprudencia Relevante', collection:'relevant_jurisprudence'    },
  { id:'1cqDHOAZX-jul7vpyzpJLW4BEYrkzvS9u', name:'Libros Administrativo',    collection:'reference_books'           },
  { id:'1iBT8QA8-OZ7QWP4XctbQykoiEg4rYiSU', name:'Normativa Vigente',        collection:'current_regulations'       },
  { id:'1SDBYlUQoEah7sBVBnGmqymW1S-hR-k1B', name:'Temáticas Específicas',    collection:'specific_topics'           },
];

const DQ_BASE_LABELS = {
  rulings:                  'Dictámenes CGR',
  administrative_discipline:'Normativa / Doctrina',
  relevant_jurisprudence:   'Jurisprudencia Relevante',
  reference_books:      'Libros Administrativo',
  current_regulations:      'Normativa Vigente',
  specific_topics:          'Temáticas Específicas',
};

// Estado global del módulo
const dq = {
  // Datos de Supabase
  processedFiles:    [],   // drive_processed_files
  customCollections: [],   // custom_qdrant_collections
  stats:             [],   // [{collection, count, chunks, lastProcessed}]
  totalChunks:       0,
  // Estado de carga
  loading:           false,
  // Carpeta seleccionada para sync individual
  selectedFolderId:  DQ_BASE_FOLDERS[0].id,
  scannedFiles:      [],   // archivos en Drive de la carpeta seleccionada
  scanning:          false,
  syncing:           false,
  syncProgress:      null, // {current, total}
  // Bulk sync
  bulkSyncing:       false,
  bulkProgress:      null, // {folder, current, total}
  // Force sync (archivos fallidos)
  forceSyncing:      false,
  forceProgress:     null, // {folder, file, folderIdx, folderTotal, fileIdx, fileTotal}
  // Clean + resync
  cleaning:          false,
  // Tab del panel
  tab:               'sync', // sync | colecciones | archivos
};

// Computed: todas las carpetas (base + custom)
function dqAllFolders() {
  const custom = dq.customCollections.map(c => ({
    id:         c.drive_folder_id,
    name:       c.folder_name,
    collection: c.collection_name,
    isCustom:   true,
    dbId:       c.id,
    sanitizePii:c.sanitize_pii || false,
  }));
  return [...DQ_BASE_FOLDERS, ...custom];
}

function dqCollectionLabel(col) {
  if (DQ_BASE_LABELS[col]) return DQ_BASE_LABELS[col];
  const custom = dq.customCollections.find(c => c.collection_name === col);
  return custom ? custom.folder_name : col.replace(/_/g, ' ');
}

/* ────────────────────────────────────────────────────────────────
   2 · APERTURA
   ──────────────────────────────────────────────────────────────── */
function openMonitorDrive() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (event?.currentTarget) event.currentTarget.classList.add('active');
  if (typeof currentCase !== 'undefined') currentCase = null;
  showView('viewDriveQdrant');
  dqLoadAll();
}

/* ────────────────────────────────────────────────────────────────
   3 · CARGA INICIAL
   ──────────────────────────────────────────────────────────────── */
async function dqLoadAll() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  dq.loading = true;
  renderDQView();

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // Cargar en paralelo con manejo de errores individual
    const [filesRes, collRes] = await Promise.all([
      sb.from('drive_processed_files')
        .select('*')
        .eq('user_id', user.id)
        .order('processed_at', { ascending: false })
        .limit(100)
        .catch(e=>({data:null,error:e})),
      sb.from('custom_qdrant_collections')
        .select('*')
        .order('created_at', { ascending: true })
        .catch(e=>({data:null,error:e})),
    ]);

    dq.processedFiles    = filesRes.data  || [];
    dq.customCollections = collRes.data   || [];
    dqComputeStats();
  } catch (err) {
    console.error('dqLoadAll:', err);
    if (err.message?.includes('does not exist')) {
      dq.processedFiles = [];
      showToast('ℹ Tablas Drive no encontradas — ejecuta las migraciones');
    }
  } finally {
    dq.loading = false;
    renderDQView();
  }
}

function dqComputeStats() {
  const map = {};
  dq.processedFiles.forEach(f => {
    const c  = f.qdrant_collection;
    if (!map[c]) map[c] = { collection: c, count: 0, chunks: 0, lastProcessed: null };
    map[c].count++;
    map[c].chunks += f.chunks_count || 0;
    if (!map[c].lastProcessed || f.processed_at > map[c].lastProcessed) {
      map[c].lastProcessed = f.processed_at;
    }
  });
  dq.stats      = Object.values(map).sort((a, b) => b.chunks - a.chunks);
  dq.totalChunks= dq.processedFiles.reduce((s, f) => s + (f.chunks_count || 0), 0);
}

/* ────────────────────────────────────────────────────────────────
   4 · RENDER PRINCIPAL
   ──────────────────────────────────────────────────────────────── */
function renderDQView() {
  const main = document.getElementById('dqMain');
  if (!main) return;

  const totalFiles   = dq.processedFiles.length;
  const newFiles     = dq.scannedFiles.filter(f => f.isNew && !f.mimeType?.includes('folder')).length;
  const allFolders   = dqAllFolders();
  const selFolder    = allFolders.find(f => f.id === dq.selectedFolderId) || allFolders[0];
  const isBusy       = dq.syncing || dq.bulkSyncing || dq.forceSyncing || dq.scanning || dq.cleaning;

  // KPI row
  const kpiRow = `<div class="dq-kpi-row">
    <div class="dq-kpi-card">
      <div class="dq-kpi-val" style="color:var(--gold)">${totalFiles}</div>
      <div class="dq-kpi-label">Archivos indexados</div>
    </div>
    <div class="dq-kpi-card">
      <div class="dq-kpi-val" style="color:var(--blue)">${dq.totalChunks.toLocaleString()}</div>
      <div class="dq-kpi-label">Chunks vectoriales</div>
    </div>
    <div class="dq-kpi-card">
      <div class="dq-kpi-val" style="color:var(--green)">${dq.stats.length}</div>
      <div class="dq-kpi-label">Colecciones activas</div>
    </div>
    <div class="dq-kpi-card">
      <div class="dq-kpi-val" style="color:#f59e0b">${dq.customCollections.length}</div>
      <div class="dq-kpi-label">Colecciones custom</div>
    </div>
  </div>`;

  // Tab nav
  const tabsHtml = `<div class="dq-tabs">
    <button class="dq-tab ${dq.tab==='sync'?'active':''}"        onclick="dqSwitchTab('sync')">☁️ Sincronización</button>
    <button class="dq-tab ${dq.tab==='colecciones'?'active':''}" onclick="dqSwitchTab('colecciones')">📂 Colecciones</button>
    <button class="dq-tab ${dq.tab==='archivos'?'active':''}"    onclick="dqSwitchTab('archivos')">🗂 Archivos (${totalFiles})</button>
  </div>`;

  // Action buttons (always visible)
  const actBtns = `<div class="dq-top-actions">
    <button class="btn-save" style="display:flex;align-items:center;gap:6px;padding:6px 14px"
      onclick="dqSyncAll()" ${isBusy?'disabled':''}>
      ${dq.bulkSyncing
        ? `<span class="dq-spinner"></span>${dq.bulkProgress ? dq.bulkProgress.folder.substring(0,18)+'…' : 'Procesando…'}`
        : '▶ Sincronizar todo'}
    </button>
    <button class="btn-cancel" style="display:flex;align-items:center;gap:6px;padding:6px 12px"
      onclick="dqForceSync()" ${isBusy?'disabled':''} title="Re-procesa archivos fallidos (0 chunks)">
      ${dq.forceSyncing
        ? `<span class="dq-spinner"></span>Forzando…`
        : '⚡ Reintentar fallidos'}
    </button>
    <button class="btn-sm" onclick="dqLoadAll()" ${isBusy?'disabled':''} title="Actualizar datos">↻ Actualizar</button>
  </div>`;

  // Progress overlay
  const progressBar = (dq.syncing || dq.bulkSyncing || dq.forceSyncing || dq.cleaning)
    ? renderDQProgress()
    : '';

  let tabBody = '';
  if      (dq.tab === 'sync')        tabBody = renderDQSync(selFolder, allFolders, isBusy, newFiles);
  else if (dq.tab === 'colecciones') tabBody = renderDQColecciones();
  else if (dq.tab === 'archivos')    tabBody = renderDQArchivos();

  main.innerHTML = kpiRow + actBtns + progressBar + tabsHtml
    + `<div class="dq-body">${tabBody}</div>`;
}

function dqSwitchTab(tab) {
  dq.tab = tab;
  renderDQView();
}

/* ── Progress Banner ── */
function renderDQProgress() {
  let msg = '';
  if (dq.cleaning)      msg = '🧹 Limpiando registros…';
  else if (dq.scanning) msg = '🔍 Escaneando carpeta Drive…';
  else if (dq.syncing && dq.syncProgress) msg = `⬆️ Sincronizando archivo ${dq.syncProgress.current}/${dq.syncProgress.total}…`;
  else if (dq.bulkSyncing && dq.bulkProgress) msg = `📂 Carpeta ${dq.bulkProgress.current}/${dq.bulkProgress.total}: ${dq.bulkProgress.folder}`;
  else if (dq.forceSyncing && dq.forceProgress) {
    const fp = dq.forceProgress;
    msg = `⚡ ${fp.folder} (${fp.folderIdx}/${fp.folderTotal}) · ${fp.file} (${fp.fileIdx}/${fp.fileTotal})`;
  }
  return `<div class="dq-progress-banner">
    <div class="dq-spinner"></div>
    <span>${msg}</span>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   5 · TAB SYNC (carpeta individual)
   ──────────────────────────────────────────────────────────────── */
function renderDQSync(selFolder, allFolders, isBusy, newFiles) {
  const scannedTotal = dq.scannedFiles.filter(f => !f.mimeType?.includes('folder')).length;

  const folderOptions = allFolders.map(f =>
    `<option value="${f.id}" ${dq.selectedFolderId === f.id ? 'selected' : ''}>${f.isCustom ? '📁' : '📂'} ${f.name}</option>`
  ).join('');

  const filesTable = dq.scannedFiles.length
    ? `<div class="dq-files-table-wrap">
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:7px">
          ${scannedTotal} archivos · <span style="color:var(--gold)">${newFiles} nuevos listos para indexar</span>
        </div>
        <table class="dq-table">
          <thead><tr><th>Archivo</th><th>Tipo</th><th>Tamaño</th><th>Estado</th></tr></thead>
          <tbody>
            ${dq.scannedFiles.filter(f => !f.mimeType?.includes('folder')).slice(0, 50).map(f => {
              const sizeKB  = f.size ? (parseInt(f.size)/1024).toFixed(0) + ' KB' : '—';
              const isPdf   = f.mimeType?.includes('pdf');
              const isDoc   = f.mimeType?.includes('document') || f.mimeType?.includes('word');
              const icon    = isPdf ? '📕' : isDoc ? '📘' : '📄';
              const statusBadge = f.isNew
                ? `<span class="dq-badge-new">🆕 Nuevo</span>`
                : `<span class="dq-badge-ok">✓ Indexado</span>`;
              return `<tr>
                <td style="font-size:11px;max-width:240px">
                  <span style="margin-right:5px">${icon}</span>${dqEsc(f.name)}
                </td>
                <td style="font-size:10px;color:var(--text-muted)">${isPdf?'PDF':isDoc?'Doc':'Texto'}</td>
                <td style="font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace">${sizeKB}</td>
                <td>${statusBadge}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${dq.scannedFiles.length > 50 ? `<div style="font-size:10px;color:var(--text-muted);margin-top:6px">Mostrando primeros 50 de ${dq.scannedFiles.length} archivos.</div>` : ''}
      </div>`
    : `<div style="font-size:11.5px;color:var(--text-muted);padding:14px 0">Haz clic en <strong>Escanear</strong> para listar los archivos de esta carpeta.</div>`;

  return `
  <div class="dq-card">
    <div class="dq-card-label">Sincronización manual por carpeta</div>
    <div class="dq-sync-row">
      <select class="dq-select" onchange="dq.selectedFolderId=this.value;dq.scannedFiles=[];renderDQView()" style="flex:1">
        ${folderOptions}
      </select>
      <button class="btn-sm" style="white-space:nowrap" onclick="dqScanFolder()" ${isBusy ? 'disabled' : ''}>
        ${dq.scanning ? '<span class="dq-spinner" style="margin-right:4px"></span>Escaneando…' : '🔍 Escanear'}
      </button>
      ${dq.scannedFiles.length && newFiles > 0
        ? `<button class="btn-save" style="padding:6px 12px;white-space:nowrap" onclick="dqSyncNew()" ${isBusy ? 'disabled' : ''}>
             ${dq.syncing ? '<span class="dq-spinner" style="margin-right:4px;width:8px;height:8px"></span>Sync…' : `⬆ Indexar ${newFiles} nuevo${newFiles!==1?'s':''}`}
           </button>`
        : ''}
      ${dq.scannedFiles.length
        ? `<button class="btn-cancel" style="padding:6px 10px;white-space:nowrap;font-size:11px" onclick="dqCleanResync()" ${isBusy ? 'disabled' : ''} title="Elimina registros locales y re-indexa todo">
             🧹 Limpiar y resync
           </button>`
        : ''}
    </div>
    ${filesTable}
  </div>

  <!-- Estadísticas por colección -->
  <div class="dq-card" style="margin-top:12px">
    <div class="dq-card-label">Estado de colecciones Qdrant</div>
    ${dq.stats.length
      ? `<div class="dq-stats-list">
          ${dq.stats.map(s => {
            const label = dqCollectionLabel(s.collection);
            const pct   = dq.totalChunks > 0 ? Math.round(s.chunks / dq.totalChunks * 100) : 0;
            const date  = s.lastProcessed ? new Date(s.lastProcessed).toLocaleDateString('es-CL') : '—';
            return `<div class="dq-stat-row">
              <div class="dq-stat-label">${dqEsc(label)}</div>
              <div style="flex:1;margin:0 10px">
                <div class="dq-stat-bar-bg"><div class="dq-stat-bar-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="dq-stat-nums">
                <span style="color:var(--text)">${s.count} arch.</span>
                <span style="color:var(--text-muted)">· ${s.chunks.toLocaleString()} chunks</span>
                <span style="color:var(--text-muted)">· ${date}</span>
              </div>
            </div>`;
          }).join('')}
        </div>`
      : `<div class="ley-empty" style="padding:20px">Sin archivos indexados aún. Escanea una carpeta y sincroniza.</div>`}
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   6 · TAB COLECCIONES PERSONALIZADAS
   ──────────────────────────────────────────────────────────────── */
function renderDQColecciones() {
  const allFolders = dqAllFolders();

  return `
  <!-- Formulario nueva colección -->
  <div class="dq-card">
    <div class="dq-card-label">➕ Nueva colección Drive → Qdrant</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div>
        <label class="dq-field-label">URL o ID de carpeta Drive *</label>
        <input class="dq-input" id="dqFolderUrl"
          placeholder="https://drive.google.com/drive/folders/… o ID directo"
          style="font-size:11.5px"/>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">Pega la URL completa o solo el ID de la carpeta</div>
      </div>
      <div>
        <label class="dq-field-label">Nombre de la carpeta *</label>
        <input class="dq-input" id="dqFolderName" placeholder="Ej: Informes de Fiscalización"/>
      </div>
      <div>
        <label class="dq-field-label">Nombre colección Qdrant *</label>
        <input class="dq-input" id="dqCollName" placeholder="Ej: informes_fiscalizacion"/>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">Sin espacios, minúsculas. Se normalizará automáticamente.</div>
      </div>
      <div style="display:flex;align-items:flex-end;padding-bottom:4px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px">
          <input type="checkbox" id="dqSanitizePii" style="width:14px;height:14px"/>
          <div>
            <div style="font-weight:500">🛡️ Sanitizar PII</div>
            <div style="font-size:10px;color:var(--text-muted)">Oculta RUT, correos, teléfonos</div>
          </div>
        </label>
      </div>
    </div>
    <button class="btn-save" onclick="dqCreateCollection()" style="display:flex;align-items:center;gap:6px;padding:7px 16px">
      📂 Crear colección
    </button>
  </div>

  <!-- Lista de colecciones -->
  <div class="dq-card" style="margin-top:12px">
    <div class="dq-card-label">Todas las colecciones (${allFolders.length})</div>
    <div class="dq-coll-list">
      ${allFolders.map(f => {
        const stat = dq.stats.find(s => s.collection === f.collection);
        return `<div class="dq-coll-row">
          <span style="font-size:16px">${f.isCustom ? '📁' : '☁️'}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:500">${dqEsc(f.name)}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">
              ${dqEsc(f.collection)}
              ${stat ? ` · ${stat.count} archivos · ${stat.chunks.toLocaleString()} chunks` : ' · sin archivos indexados'}
              ${f.sanitizePii ? ' · 🛡️ PII' : ''}
            </div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button class="btn-sm" onclick="dq.selectedFolderId='${f.id}';dq.tab='sync';renderDQView()" title="Sincronizar esta carpeta">↻ Sync</button>
            ${f.isCustom && f.dbId
              ? `<button class="btn-del" onclick="dqDeleteCollection('${f.dbId}','${dqEsc(f.name)}')" title="Eliminar colección">✕</button>`
              : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   7 · TAB ARCHIVOS (log)
   ──────────────────────────────────────────────────────────────── */
function renderDQArchivos() {
  if (dq.loading) return `<div class="ley-empty">Cargando…</div>`;

  if (!dq.processedFiles.length) {
    return `<div class="ley-empty">
      <div style="font-size:28px;margin-bottom:10px">📂</div>
      <p>Sin archivos indexados. Sincroniza una carpeta Drive para comenzar.</p>
    </div>`;
  }

  return `
  <div style="overflow-x:auto">
    <table class="dq-table" style="min-width:560px">
      <thead><tr>
        <th>Archivo</th><th>Colección</th><th>Chunks</th><th>Procesado</th>
      </tr></thead>
      <tbody>
        ${dq.processedFiles.map(f => {
          const label = dqCollectionLabel(f.qdrant_collection);
          const date  = f.processed_at ? new Date(f.processed_at).toLocaleDateString('es-CL') : '—';
          const icon  = f.mime_type?.includes('pdf') ? '📕' : f.mime_type?.includes('document') ? '📘' : '📄';
          return `<tr>
            <td>
              <span style="margin-right:5px">${icon}</span>
              <span style="font-size:11.5px">${dqEsc(f.file_name || '—')}</span>
            </td>
            <td style="font-size:11px;color:var(--text-dim)">${dqEsc(label)}</td>
            <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:right">${(f.chunks_count || 0).toLocaleString()}</td>
            <td style="font-size:10.5px;color:var(--text-muted)">${date}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ────────────────────────────────────────────────────────────────
   8 · OPERACIONES DE SYNC
   ──────────────────────────────────────────────────────────────── */

/* ── Escanear carpeta ── */
async function dqScanFolder() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || dq.scanning) return;
  dq.scanning    = true;
  dq.scannedFiles= [];
  renderDQView();

  try {
    const { data, error } = await sb.functions.invoke('google-drive', {
      body: { action: 'list', folderId: dq.selectedFolderId }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    dq.scannedFiles = data?.files || [];

    if (data?.truncated) showToast('⚠ Carpeta muy grande — mostrando resultado parcial');
    const newCount = dq.scannedFiles.filter(f => f.isNew && !f.mimeType?.includes('folder')).length;
    if (newCount > 0) showToast(`✓ ${newCount} archivo(s) nuevo(s) encontrado(s)`);
    else showToast('ℹ Todos los archivos ya están indexados');
  } catch (err) {
    showToast('⚠ Error al escanear: ' + err.message);
  } finally {
    dq.scanning = false;
    renderDQView();
  }
}

/* ── Sincronizar archivos nuevos (carpeta seleccionada) ── */
async function dqSyncNew() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || dq.syncing) return;

  const allFolders = dqAllFolders();
  const folder     = allFolders.find(f => f.id === dq.selectedFolderId);
  if (!folder) return;

  const MAX_SIZE  = 25 * 1024 * 1024;
  const newFiles  = dq.scannedFiles.filter(f =>
    f.isNew && !f.mimeType?.includes('folder') && (!f.size || parseInt(f.size) <= MAX_SIZE)
  );
  if (!newFiles.length) { showToast('ℹ Sin archivos nuevos para indexar'); return; }

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  dq.syncing     = true;
  dq.syncProgress= { current: 0, total: newFiles.length };
  renderDQView();

  let ok = 0, fail = 0;

  for (let i = 0; i < newFiles.length; i++) {
    const f = newFiles[i];
    dq.syncProgress = { current: i + 1, total: newFiles.length };
    renderDQView();

    try {
      const chunks = await dqProcessFile(sb, f, folder);
      if (chunks > 0) {
        await dqRecordFile(sb, user.id, f, folder, chunks);
        ok++;
      } else {
        fail++;
      }
    } catch (err) {
      console.error('dqSyncNew file error:', err);
      fail++;
    }
    // Delay para PDFs (OCR pesado)
    if (f.mimeType === 'application/pdf' && i < newFiles.length - 1) {
      await dqDelay(1000);
    }
  }

  dq.syncing     = false;
  dq.syncProgress= null;
  if (ok)   showToast(`✓ ${ok} archivo(s) indexado(s) en "${folder.name}"`);
  if (fail) showToast(`⚠ ${fail} archivo(s) con errores`);
  await dqLoadAll();
  await dqScanFolder();
}

/* ── Sincronizar TODAS las carpetas ── */
async function dqSyncAll() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || dq.bulkSyncing) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const allFolders = dqAllFolders();
  dq.bulkSyncing  = true;
  let totalOk = 0, totalFail = 0;

  for (let fi = 0; fi < allFolders.length; fi++) {
    const folder = allFolders[fi];
    dq.bulkProgress = { folder: folder.name, current: fi + 1, total: allFolders.length };
    renderDQView();

    try {
      // Escanear
      const { data, error } = await sb.functions.invoke('google-drive', {
        body: { action: 'list', folderId: folder.id }
      });
      if (error) throw error;
      const files = (data?.files || []).filter(f =>
        f.isNew && !f.mimeType?.includes('folder') && (!f.size || parseInt(f.size) <= 25*1024*1024)
      );
      if (!files.length) continue;

      for (const f of files) {
        try {
          const chunks = await dqProcessFile(sb, f, folder);
          if (chunks > 0) { await dqRecordFile(sb, user.id, f, folder, chunks); totalOk++; }
          else totalFail++;
        } catch (e) { console.error(e); totalFail++; }
      }
    } catch (err) {
      console.error('bulk folder error:', err);
    }
  }

  dq.bulkSyncing  = false;
  dq.bulkProgress = null;
  if (totalOk)                showToast(`✓ ${totalOk} archivos indexados en todas las carpetas`);
  else if (!totalFail)        showToast('ℹ Sin archivos nuevos en ninguna carpeta');
  if (totalFail)              showToast(`⚠ ${totalFail} archivos con errores`);
  await dqLoadAll();
}

/* ── Force sync archivos fallidos (0 chunks) ── */
async function dqForceSync() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb || dq.forceSyncing) return;

  if (!confirm(
    '⚡ REINTENTAR ARCHIVOS FALLIDOS\n\n' +
    'Buscará y re-procesará SOLO los archivos que:\n' +
    '• No tienen registro en la base de datos\n' +
    '• Tienen 0 chunks (fallaron al procesar)\n\n' +
    'Los archivos ya procesados correctamente NO se tocarán.\n\n¿Continuar?'
  )) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  dq.forceSyncing  = true;
  let totalOk = 0, totalFail = 0, totalSkip = 0;

  for (let fi = 0; fi < DQ_BASE_FOLDERS.length; fi++) {
    const folder = DQ_BASE_FOLDERS[fi];
    dq.forceProgress = { folder: folder.name, file: 'Escaneando…', folderIdx: fi+1, folderTotal: DQ_BASE_FOLDERS.length, fileIdx: 0, fileTotal: 0 };
    renderDQView();

    try {
      // Registros existentes
      const { data: existing } = await sb.from('drive_processed_files')
        .select('drive_file_id,chunks_count')
        .eq('user_id', user.id)
        .eq('qdrant_collection', folder.collection);

      const recordMap = {};
      (existing || []).forEach(r => { recordMap[r.drive_file_id] = r.chunks_count || 0; });

      // Listar archivos
      const { data: scanData } = await sb.functions.invoke('google-drive', {
        body: { action: 'list', folderId: folder.id }
      });
      const allFiles = (scanData?.files || []).filter(f => !f.mimeType?.includes('folder'));

      // Filtrar problemáticos
      const problem = allFiles.filter(f => {
        if (f.size && parseInt(f.size) > 25*1024*1024) { totalSkip++; return false; }
        const ex = recordMap[f.id];
        return ex === undefined || ex === 0;
      });

      if (!problem.length) { showToast(`ℹ ${folder.name}: todos OK`); continue; }

      for (let pi = 0; pi < problem.length; pi++) {
        const f = problem[pi];
        dq.forceProgress = {
          folder: folder.name, file: f.name.substring(0, 40),
          folderIdx: fi+1, folderTotal: DQ_BASE_FOLDERS.length,
          fileIdx: pi+1, fileTotal: problem.length
        };
        renderDQView();

        // Eliminar registro fallido si existe
        if (recordMap[f.id] === 0) {
          await sb.from('drive_processed_files').delete().eq('user_id', user.id).eq('drive_file_id', f.id);
        }

        try {
          const chunks = await dqProcessFile(sb, f, folder);
          if (chunks > 0) { await dqRecordFile(sb, user.id, f, folder, chunks); totalOk++; }
          else totalFail++;
        } catch (e) { console.error(e); totalFail++; }
      }
      showToast(`✓ ${folder.name}: ${problem.length} archivos procesados`);
    } catch (err) {
      console.error('forceSync folder error:', err);
    }
  }

  dq.forceSyncing  = false;
  dq.forceProgress = null;
  showToast(`⚡ Completado: ${totalOk} OK · ${totalFail} errores · ${totalSkip} omitidos`);
  await dqLoadAll();
}

/* ── Limpiar y resync ── */
async function dqCleanResync() {
  const sb      = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const allFolders = dqAllFolders();
  const folder  = allFolders.find(f => f.id === dq.selectedFolderId);
  if (!folder) return;

  if (!confirm(`¿Limpiar registros de "${folder.name}" y re-sincronizar?\n\nEsto eliminará los registros locales y re-procesará todos los archivos.`)) return;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  dq.cleaning = true;
  renderDQView();

  try {
    await sb.from('drive_processed_files').delete()
      .eq('user_id', user.id)
      .eq('qdrant_collection', folder.collection);
    showToast(`🧹 Registros de "${folder.name}" eliminados. Escaneando…`);
    dq.scannedFiles = [];
    await dqLoadAll();
    await dqScanFolder();
  } catch (err) {
    showToast('⚠ Error al limpiar: ' + err.message);
  } finally {
    dq.cleaning = false;
    renderDQView();
  }
}

/* ────────────────────────────────────────────────────────────────
   9 · HELPERS DE PROCESAMIENTO
   ──────────────────────────────────────────────────────────────── */

/** Descarga o aplica OCR al archivo, luego llama a ingest-to-qdrant.
    Retorna el número de chunks almacenados. */
async function dqProcessFile(sb, file, folder) {
  const isPdf = file.mimeType === 'application/pdf';
  let content = null;

  if (isPdf) {
    const { data, error } = await sb.functions.invoke('ocr-pdf-drive', {
      body: { fileId: file.id, fileName: file.name }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.code === 'FILE_TOO_LARGE') throw new Error(data.message);
    content = data?.extractedText;
  } else {
    const { data, error } = await sb.functions.invoke('google-drive', {
      body: { action: 'download', fileId: file.id, mimeType: file.mimeType }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    content = data?.content;
  }

  if (!content || content.length < 10) return 0;

  // Dividir en partes de 100KB
  const parts = dqSplitContent(content, 100000);
  let totalChunks = 0;

  for (let pi = 0; pi < parts.length; pi++) {
    const partId = parts.length > 1 ? `${file.id}_part${pi+1}` : file.id;
    try {
      const { data } = await sb.functions.invoke('ingest-to-qdrant', {
        body: {
          collection:   folder.collection,
          sanitize:     folder.sanitizePii || false,
          documents: [{
            id:   partId,
            text: parts[pi],
            metadata: {
              file_name:          file.name,
              mime_type:          file.mimeType,
              drive_file_id:      file.id,
              drive_folder_id:    folder.id,
              drive_folder_name:  folder.name,
              drive_modified_time:file.modifiedTime,
              part_number:        pi + 1,
              total_parts:        parts.length,
              original_length:    content.length,
            }
          }]
        }
      });
      totalChunks += data?.totalPoints || data?.results?.stored || 0;
    } catch (e) {
      console.error(`ingest part ${pi+1} of ${file.name}:`, e);
    }
    if (pi < parts.length - 1) await dqDelay(300);
  }

  return totalChunks;
}

/** Registra el archivo procesado en drive_processed_files (upsert). */
async function dqRecordFile(sb, userId, file, folder, chunks) {
  const { data: existing } = await sb.from('drive_processed_files')
    .select('id')
    .eq('drive_file_id', file.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await sb.from('drive_processed_files').update({
      file_name:   file.name,
      chunks_count:chunks,
      processed_at:new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await sb.from('drive_processed_files').insert({
      user_id:            userId,
      drive_file_id:      file.id,
      file_name:          file.name,
      mime_type:          file.mimeType,
      file_size:          file.size ? parseInt(file.size) : null,
      drive_modified_time:file.modifiedTime || null,
      qdrant_collection:  folder.collection,
      chunks_count:       chunks,
    });
  }
}

/** Divide un texto largo en partes con puntos de corte naturales. */
function dqSplitContent(text, maxSize) {
  if (text.length <= maxSize) return [text];
  const parts = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + maxSize, text.length);
    if (end < text.length) {
      const paraBreak = text.lastIndexOf('\n\n', end);
      if (paraBreak > pos + maxSize * 0.5) end = paraBreak + 2;
      else {
        const sentBreak = text.lastIndexOf('. ', end);
        if (sentBreak > pos + maxSize * 0.5) end = sentBreak + 2;
      }
    }
    parts.push(text.substring(pos, end).trim());
    pos = end;
  }
  return parts.filter(p => p.length > 0);
}

function dqDelay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ────────────────────────────────────────────────────────────────
   10 · COLECCIONES PERSONALIZADAS
   ──────────────────────────────────────────────────────────────── */
async function dqCreateCollection() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;

  const urlInput  = document.getElementById('dqFolderUrl')?.value.trim();
  const nameInput = document.getElementById('dqFolderName')?.value.trim();
  const collInput = document.getElementById('dqCollName')?.value.trim();
  const piiCheck  = document.getElementById('dqSanitizePii')?.checked || false;

  if (!urlInput || !nameInput || !collInput) {
    showToast('⚠ Completa todos los campos obligatorios'); return;
  }

  // Extraer folder ID de URL
  const folderId = (urlInput.match(/folders\/([a-zA-Z0-9_-]+)/) || [,''])[1] || urlInput;
  const slug = collInput.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;

  const { error } = await sb.from('custom_qdrant_collections').upsert({
    user_id:        user.id,
    drive_folder_id:folderId,
    folder_name:    nameInput,
    collection_name:slug,
    sanitize_pii:   piiCheck,
  }, { onConflict: 'user_id,drive_folder_id' });

  if (error) { showToast('⚠ Error: ' + error.message); return; }

  showToast(`✓ Colección "${nameInput}" creada`);
  // Limpiar formulario
  ['dqFolderUrl','dqFolderName','dqCollName'].forEach(id => { const el=document.getElementById(id); if(el)el.value=''; });
  const pii = document.getElementById('dqSanitizePii'); if(pii) pii.checked=false;
  await dqLoadAll();
}

async function dqDeleteCollection(dbId, name) {
  if (!confirm(`¿Eliminar la colección "${name}"?\n\nLos vectores en Qdrant NO se eliminarán automáticamente.`)) return;
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  const { error } = await sb.from('custom_qdrant_collections').delete().eq('id', dbId);
  if (error) { showToast('⚠ Error: ' + error.message); return; }
  showToast(`✓ Colección "${name}" eliminada`);
  await dqLoadAll();
}

/* ────────────────────────────────────────────────────────────────
   11 · UTILIDAD
   ──────────────────────────────────────────────────────────────── */
function dqEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ────────────────────────────────────────────────────────────────
   12 · CSS
   ──────────────────────────────────────────────────────────────── */
(function injectDQCSS() {
  if (document.getElementById('dq-css')) return;
  const s = document.createElement('style');
  s.id = 'dq-css';
  s.textContent = `
/* ── KPIs ── */
.dq-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 16px;flex-shrink:0;}
.dq-kpi-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;text-align:center;}
.dq-kpi-val{font-family:'EB Garamond',serif;font-size:28px;line-height:1;margin-bottom:2px;}
.dq-kpi-label{font-size:10px;color:var(--text-muted);}

/* ── Acciones globales ── */
.dq-top-actions{display:flex;gap:7px;align-items:center;padding:8px 16px;flex-shrink:0;border-bottom:1px solid var(--border);}

/* ── Progress ── */
.dq-progress-banner{display:flex;align-items:center;gap:9px;padding:8px 16px;background:rgba(212,167,90,.07);border-bottom:1px solid var(--gold-dim);font-size:12px;color:var(--gold);flex-shrink:0;}
.dq-spinner{width:10px;height:10px;border:2px solid var(--gold-dim);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;display:inline-block;}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Tabs ── */
.dq-tabs{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 14px;flex-shrink:0;}
.dq-tab{padding:8px 12px;font-size:11.5px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .14s;white-space:nowrap;font-family:'Inter',sans-serif;background:none;border-top:none;border-left:none;border-right:none;}
.dq-tab:hover{color:var(--text);}
.dq-tab.active{color:var(--gold);border-bottom-color:var(--gold);font-weight:500;}
.dq-body{flex:1;overflow-y:auto;padding:14px 16px;}

/* ── Cards ── */
.dq-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:13px 15px;margin-bottom:11px;}
.dq-card-label{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--text-muted);font-weight:600;margin-bottom:10px;}
.dq-field-label{display:block;font-size:10.5px;color:var(--text-dim);margin-bottom:4px;font-weight:500;}
.dq-input{width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12.5px;outline:none;transition:border-color .14s;}
.dq-input:focus{border-color:var(--gold-dim);}
.dq-select{background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:var(--radius);font-family:'Inter',sans-serif;font-size:12.5px;outline:none;cursor:pointer;}
.dq-select:focus{border-color:var(--gold-dim);}

/* ── Sync row ── */
.dq-sync-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}

/* ── Tabla archivos ── */
.dq-files-table-wrap{max-height:320px;overflow-y:auto;}
.dq-table{width:100%;border-collapse:collapse;font-size:11.5px;}
.dq-table th{padding:6px 10px;text-align:left;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);border-bottom:1px solid var(--border);background:var(--surface);font-weight:500;white-space:nowrap;position:sticky;top:0;z-index:1;}
.dq-table td{padding:6px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}
.dq-table tr:hover td{background:var(--surface);}
.dq-badge-new{font-size:9.5px;padding:1px 7px;border-radius:8px;background:rgba(212,167,90,.1);border:1px solid var(--gold-dim);color:var(--gold);white-space:nowrap;}
.dq-badge-ok{font-size:9.5px;padding:1px 7px;border-radius:8px;background:rgba(5,150,105,.07);border:1px solid rgba(5,150,105,.25);color:var(--green);white-space:nowrap;}

/* ── Stats ── */
.dq-stats-list{display:flex;flex-direction:column;gap:7px;}
.dq-stat-row{display:flex;align-items:center;gap:8px;font-size:11.5px;}
.dq-stat-label{min-width:170px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dq-stat-bar-bg{height:5px;border-radius:3px;background:var(--border);overflow:hidden;width:100%;}
.dq-stat-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--gold-dim),var(--gold));}
.dq-stat-nums{display:flex;gap:6px;font-size:10.5px;white-space:nowrap;flex-shrink:0;}

/* ── Colecciones ── */
.dq-coll-list{display:flex;flex-direction:column;gap:5px;}
.dq-coll-row{display:flex;align-items:center;gap:9px;padding:8px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);transition:border-color .14s;}
.dq-coll-row:hover{border-color:var(--border2);}
`;
  document.head.appendChild(s);
})();

/* ────────────────────────────────────────────────────────────────
   13 · INYECCIÓN DE VISTA
   ──────────────────────────────────────────────────────────────── */
(function injectDQView() {
  if (document.getElementById('viewDriveQdrant')) return;

  const view = document.createElement('div');
  view.id        = 'viewDriveQdrant';
  view.className = 'view';
  view.style.cssText = 'flex-direction:column;overflow:hidden;';
  view.innerHTML = `
    <div style="padding:12px 18px 8px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between">
      <div>
        <div style="font-family:'EB Garamond',serif;font-size:22px;font-weight:400;color:var(--text)">☁️ Monitor Drive → Qdrant</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Indexación vectorial · Google Drive → Qdrant · Embeddings 768d</div>
      </div>
    </div>
    <div id="dqMain" style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
      <div class="ley-empty">Cargando…</div>
    </div>`;

  const welcome = document.getElementById('viewWelcome');
  if (welcome) welcome.parentNode.insertBefore(view, welcome);
  else document.querySelector('.main')?.appendChild(view);
})();
