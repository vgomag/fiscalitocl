/* =========================================================
   MOD-BIBLIOTECA.JS — Biblioteca de Referencia
   Documentos, Normas, Párrafos, Modelos + Chat IA
   ========================================================= */

const biblioteca = {
  books: [],
  loading: false,
  activeTab: 'documentos',
  expandedCats: new Set(['all']),
  uploadForm: { name:'', desc:'', category:'procedimientos_disciplinarios', content:'' },
  chatMessages: [],
  chatLoading: false,
  searchQuery: '',
};

const BIBLIO_CATEGORIES = [
  { value:'procedimientos_disciplinarios', label:'Procedimientos Disciplinarios' },
  { value:'licencias_medicas',             label:'Licencias Médicas' },
  { value:'acoso_laboral',                 label:'Acoso Laboral / Ley Karin' },
  { value:'acoso_sexual',                  label:'Acoso Sexual / Ley 21.369' },
  { value:'probidad',                      label:'Probidad Administrativa' },
  { value:'responsabilidad_administrativa',label:'Responsabilidad Administrativa' },
  { value:'dictamenes_cgr',                label:'Dictámenes CGR' },
  { value:'normativa_interna',             label:'Normativa Interna' },
  { value:'jurisprudencia',                label:'Jurisprudencia Relevante' },
  { value:'modelos_informes',              label:'Modelos de Informes' },
];

/* ── ABRIR VISTA ── */
function openBibliotecaRef() {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  currentCase = null;
  showView('viewBiblioteca');
  loadBibliotecaBooks();
}

/* ── CARGAR LIBROS ── */
async function loadBibliotecaBooks() {
  if (!supabaseClient) return;
  biblioteca.loading = true;
  renderBibliotecaView();

  try {
    // Load normas custom and normativa interna from Supabase (in parallel)
    if (!window._normasCustomLoaded) loadNormasCustom();
    if (!window._normativaInternaLoaded) loadNormativaInterna();

    const { data, error } = await supabaseClient
      .from('reference_books')
      .select('*')
      .order('category', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message?.includes('does not exist')) {
        biblioteca.books = [];
        showToast('ℹ Tabla reference_books no encontrada — modo demo activado');
      } else {
        console.error('Biblioteca error:', error);
      }
    } else {
      biblioteca.books = data || [];
    }
  } catch (err) {
    console.error('Biblioteca load error:', err);
  } finally {
    biblioteca.loading = false;
    renderBibliotecaView();
  }
}

/* ── RENDER PRINCIPAL ── */
function renderBibliotecaView() {
  const container = document.getElementById('bibliotecaContainer');
  if (!container) return;

  const tabs = [
    { id:'documentos', label:'📚 Libros' },
    { id:'normas',     label:'📋 Normas' },
    { id:'normativa',  label:'🏛 Normativa Interna' },
    { id:'parrafos',   label:'✏️ Párrafos' },
    { id:'modelos',    label:'📄 Modelos RAG' },
    { id:'chat',       label:'💬 Chat IA' },
  ];

  container.innerHTML = `
    <div class="bib-layout">
      <div class="bib-tabs">
        ${tabs.map(t => `<button class="bib-tab ${biblioteca.activeTab===t.id?'active':''}" onclick="switchBibTab('${t.id}')">${t.label}</button>`).join('')}
      </div>
      <div class="bib-body" id="bibBody">
        ${renderBibTabBody()}
      </div>
    </div>`;
}

function switchBibTab(tab) {
  biblioteca.activeTab = tab;
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  document.querySelectorAll('.bib-tab').forEach(t => {
    const onclick = t.getAttribute('onclick') || '';
    const m = onclick.match(/switchBibTab\('([^']+)'\)/);
    if (m) t.classList.toggle('active', m[1] === tab);
  });
  // Cargar docs RAG al cambiar a esa pestaña
  if (tab === 'modelos' && typeof loadRAGDocs === 'function' && typeof rag !== 'undefined' && !rag.docs.length && !rag.loading) {
    loadRAGDocs();
  }
}

function renderBibTabBody() {
  switch (biblioteca.activeTab) {
    case 'documentos': return renderBibDocumentos();
    case 'normas':     return renderBibNormas();
    case 'normativa':  return renderBibNormativaInterna();
    case 'parrafos':   return renderBibParrafos();
    case 'modelos':    return renderBibModelosRAG();
    case 'chat':       return renderBibChat();
    default:           return '';
  }
}

/* ── TAB MODELOS RAG (embebido en Biblioteca) ── */
function renderBibModelosRAG() {
  // Delegamos al renderizado del módulo RAG si existe
  if (typeof renderRAGEmbedded === 'function') return renderRAGEmbedded();
  // Fallback si el módulo aún no cargó
  return '<div class="loading" style="padding:30px">Cargando módulo Modelos RAG…</div>';
}

/* ── TAB DOCUMENTOS ── */
function renderBibDocumentos() {
  if (biblioteca.loading) return '<div class="loading">Cargando biblioteca…</div>';

  // Group by category
  const grouped = {};
  biblioteca.books.forEach(b => {
    if (!grouped[b.category]) grouped[b.category] = [];
    grouped[b.category].push(b);
  });

  const catLabel = v => BIBLIO_CATEGORIES.find(c => c.value === v)?.label || v.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());

  const booksHtml = Object.keys(grouped).length === 0
    ? `<div class="ley-empty">Sin documentos. Usa <strong>+ Agregar</strong> para subir el primero.</div>`
    : Object.entries(grouped).map(([cat, books]) => `
        <div class="bib-cat-block">
          <div class="bib-cat-header" onclick="toggleBibCat('${cat}')">
            <span class="bib-cat-title">📁 ${catLabel(cat)} <span style="font-size:9.5px;color:var(--text-muted)">(${books.length})</span></span>
            <span id="bibCatChev-${cat}" class="ley-area-chevron ${biblioteca.expandedCats.has(cat)?'open':''}">▼</span>
          </div>
          <div class="bib-cat-body" id="bibCatBody-${cat}" style="${biblioteca.expandedCats.has(cat)?'':'display:none'}">
            ${books.map(b => `
              <div class="bib-book-item">
                <div class="bib-book-icon">${b.file_type?.includes('pdf')?'📕':b.file_type?.includes('word')||b.file_type?.includes('doc')?'📘':'📄'}</div>
                <div class="bib-book-info">
                  <div class="bib-book-name">${esc(b.name)}</div>
                  ${b.description?`<div class="bib-book-desc">${esc(b.description)}</div>`:''}
                  <div class="bib-book-meta">${b.file_size?(b.file_size/1024).toFixed(0)+' KB · ':''} ${new Date(b.created_at).toLocaleDateString('es-CL')}</div>
                </div>
                <div class="bib-book-actions">
                  ${b.content_text?`<button class="btn-sm" onclick="bibPreviewBook('${b.id}')">👁 Ver</button>`:''}
                  <button class="btn-del" onclick="deleteBibBook('${b.id}')">✕</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('');

  return `
    <div class="bib-toolbar">
      <input class="search-box" style="flex:1;max-width:280px" placeholder="Buscar documento…" oninput="filterBibBooks(this.value)" value="${esc(biblioteca.searchQuery)}"/>
      <button class="btn-save" style="padding:6px 14px" onclick="showBibAddModal()">+ Agregar</button>
    </div>
    ${booksHtml}
    <!-- Add modal inline -->
    <div id="bibAddModal" style="display:none">
      <div class="mini-modal-overlay" onclick="if(event.target===this)closeBibAddModal()">
        <div class="mini-modal">
          <div class="mini-modal-title">Agregar libro o documento</div>

          <!-- Zona de carga de archivo (principal) -->
          <div id="bibDropZone" class="bib-drop-zone" onclick="document.getElementById('bibAddFile').click()"
               ondragover="event.preventDefault();this.classList.add('bib-drop-active')"
               ondragleave="this.classList.remove('bib-drop-active')"
               ondrop="event.preventDefault();this.classList.remove('bib-drop-active');handleBibFileSelect({files:event.dataTransfer.files})">
            <input type="file" id="bibAddFile" accept=".pdf,.docx,.doc,.word"
              style="display:none" onchange="handleBibFileSelect(this)"/>
            <div id="bibDropLabel">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div style="font-size:13px;font-weight:500;color:var(--text-dim)">Arrastra o haz clic para subir</div>
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
                📕 PDF &nbsp;·&nbsp; 📘 Word (.docx / .doc)
              </div>
            </div>
          </div>

          <!-- Info del archivo cargado -->
          <div id="bibFileInfo" style="display:none;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:8px 12px;font-size:11.5px;display:none;align-items:center;gap:8px">
            <span id="bibFileIcon" style="font-size:18px">📄</span>
            <div style="flex:1;min-width:0">
              <div id="bibFileNameLabel" style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
              <div id="bibFileSizeLabel" style="font-size:10px;color:var(--text-muted)"></div>
            </div>
            <button onclick="bibClearFile()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:2px 5px">✕</button>
          </div>

          <!-- Estado extracción de texto -->
          <div id="bibExtractStatus" style="display:none;font-size:11px;padding:4px 0"></div>

          <!-- Campos del libro -->
          <div class="mini-row" style="margin-top:6px">
            <div class="mini-field"><label>Nombre *</label><input id="bibAddName" placeholder="Nombre del libro o documento"/></div>
            <div class="mini-field"><label>Categoría</label>
              <select id="bibAddCat">
                ${BIBLIO_CATEGORIES.map(c=>`<option value="${c.value}">${c.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="mini-field"><label>Descripción</label>
            <input id="bibAddDesc" placeholder="Ej: Manual de derecho administrativo, Capítulo 3…"/>
          </div>

          <!-- Contenido extraído / pegado -->
          <div class="mini-field">
            <label style="display:flex;align-items:center;justify-content:space-between">
              <span>Contenido para consulta IA <span style="font-weight:400;color:var(--text-muted)">(se extrae automáticamente)</span></span>
              <span id="bibContentChars" style="font-size:10px;color:var(--text-muted)"></span>
            </label>
            <textarea id="bibAddContent" rows="4"
              placeholder="El texto se extrae automáticamente del PDF/Word. También puedes pegar texto adicional aquí…"
              oninput="document.getElementById('bibContentChars').textContent=this.value.length.toLocaleString()+' chars'"
              style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;resize:vertical;width:100%;transition:border-color .15s;"></textarea>
          </div>

          <div class="mini-modal-actions">
            <button class="btn-cancel" onclick="closeBibAddModal()">Cancelar</button>
            <button class="btn-save" id="bibSaveBtn" onclick="saveBibBook()">Guardar libro</button>
          </div>
        </div>
      </div>
    </div>`;
}

function toggleBibCat(cat) {
  if (biblioteca.expandedCats.has(cat)) biblioteca.expandedCats.delete(cat);
  else biblioteca.expandedCats.add(cat);
  const body = document.getElementById('bibCatBody-' + cat);
  const chev = document.getElementById('bibCatChev-' + cat);
  if (body) body.style.display = biblioteca.expandedCats.has(cat) ? 'block' : 'none';
  if (chev) chev.classList.toggle('open', biblioteca.expandedCats.has(cat));
}

function showBibAddModal() {
  const m = document.getElementById('bibAddModal');
  if (m) m.style.display = 'block';
}
function closeBibAddModal() {
  const m = document.getElementById('bibAddModal');
  if (m) m.style.display = 'none';
}

/* ── Limpieza de texto para PostgreSQL ── */
function bibSanitizeText(t) {
  if (!t) return '';
  return t.replace(/\u0000/g, '')
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .trim();
}

/* ── Limpiar archivo seleccionado ── */
function bibClearFile() {
  const fi = document.getElementById('bibAddFile');
  if (fi) fi.value = '';
  const info = document.getElementById('bibFileInfo');
  const drop = document.getElementById('bibDropZone');
  const ext  = document.getElementById('bibExtractStatus');
  const cnt  = document.getElementById('bibAddContent');
  if (info) info.style.display = 'none';
  if (drop) drop.style.display = 'flex';
  if (ext)  ext.style.display  = 'none';
  if (cnt)  cnt.value = '';
  document.getElementById('bibContentChars').textContent = '';
}

/* ── Manejo de archivo seleccionado ── */
async function handleBibFileSelect(input) {
  const file = (input.files || input)?.[0];
  if (!file) return;

  const isPDF  = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const isDOCX = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc') ||
                 file.type?.includes('word') || file.type?.includes('officedocument');

  if (!isPDF && !isDOCX) {
    showToast('⚠ Solo se aceptan archivos PDF o Word (.docx / .doc)');
    return;
  }

  // Auto-fill nombre
  const nameInput = document.getElementById('bibAddName');
  if (nameInput && !nameInput.value) {
    nameInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
  }

  // Mostrar info del archivo
  const info = document.getElementById('bibFileInfo');
  const drop = document.getElementById('bibDropZone');
  const ext  = document.getElementById('bibExtractStatus');
  if (info) {
    const icon = document.getElementById('bibFileIcon');
    const lbl  = document.getElementById('bibFileNameLabel');
    const sz   = document.getElementById('bibFileSizeLabel');
    if (icon) icon.textContent = isPDF ? '📕' : '📘';
    if (lbl)  lbl.textContent  = file.name;
    if (sz)   sz.textContent   = (file.size / 1024).toFixed(0) + ' KB · ' + (isPDF ? 'PDF' : 'Word');
    info.style.display = 'flex';
  }
  if (drop) drop.style.display = 'none';

  // Extraer texto
  if (ext) { ext.style.display = 'block'; ext.innerHTML = '<span style="color:var(--text-muted)">⏳ Extrayendo texto del documento…</span>'; }

  try {
    let text = '';

    if (isDOCX) {
      // DOCX → usar mammoth.js (cargado bajo demanda)
      text = await bibExtractDocx(file);
    } else if (isPDF) {
      // PDF → usar PDF.js (cargado bajo demanda)
      text = await bibExtractPdf(file);
    }

    text = bibSanitizeText(text);

    const contentTA = document.getElementById('bibAddContent');
    if (contentTA) {
      contentTA.value = text.substring(0, 80000);
      document.getElementById('bibContentChars').textContent = text.length.toLocaleString() + ' chars extraídos';
    }

    if (ext) {
      if (text.length > 100) {
        ext.innerHTML = '<span style="color:var(--green)">✓ Texto extraído correctamente (' + text.length.toLocaleString() + ' caracteres)</span>';
      } else {
        ext.innerHTML = '<span style="color:var(--text-muted)">ℹ El documento parece estar escaneado o protegido. Pega el texto manualmente.</span>';
      }
    }

  } catch (err) {
    console.error('[BIB] extract error:', err);
    if (ext) ext.innerHTML = '<span style="color:var(--text-muted)">ℹ No se pudo extraer el texto automáticamente. Pégalo manualmente abajo.</span>';
  }
}

/* ── Extractor DOCX con mammoth.js ── */
async function bibExtractDocx(file) {
  // Cargar mammoth si no está disponible
  if (typeof mammoth === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

/* ── Extractor PDF con PDF.js ── */
async function bibExtractPdf(file) {
  // Cargar PDF.js si no está disponible
  if (typeof pdfjsLib === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const textParts = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 200); i++) {
    const page = await pdf.getPage(i);
    const tc   = await page.getTextContent();
    textParts.push(tc.items.map(item => item.str).join(' '));
  }
  return textParts.join('\n\n');
}

async function saveBibBook() {
  const name = document.getElementById('bibAddName')?.value.trim();
  const desc = document.getElementById('bibAddDesc')?.value.trim();
  const category = document.getElementById('bibAddCat')?.value || 'procedimientos_disciplinarios';
  const content = document.getElementById('bibAddContent')?.value.trim();
  const fileInput = document.getElementById('bibAddFile');
  const file = fileInput?.files?.[0];

  if (!name) { showToast('⚠ El nombre es obligatorio'); return; }
  if (!content && !file) { showToast('⚠ Sube un PDF o Word, o pega el contenido'); return; }
  const isSupportedFile = file && (file.name.toLowerCase().match(/\.(pdf|docx|doc)$/) || file.type?.includes('pdf') || file.type?.includes('word'));
  if (file && !isSupportedFile) { showToast('⚠ Solo se aceptan PDF o Word (.docx / .doc)'); return; }

  if (!supabaseClient) { showToast('⚠ Sin conexión Supabase'); return; }
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  try {
    let filePath = 'manual_input', fileType = 'text/plain', fileSize = content?.length || 0;

    if (file) {
      const path = `${user.id}/biblioteca/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabaseClient.storage.from('reference-books').upload(path, file);
      if (!upErr) { filePath = path; fileType = file.type; fileSize = file.size; }
    }

    // Sanitizar contenido: eliminar null bytes y caracteres inválidos que PostgreSQL rechaza
    const sanitizeText = (t) => t ? t.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').substring(0, 900000) : '';
    
    const { error } = await supabaseClient.from('reference_books').insert({
      user_id: user.id, name, description: desc || null,
      file_path: filePath, file_type: fileType, file_size: fileSize,
      content_text: sanitizeText(content),
      category, is_active: true
    });

    if (error) throw error;
    showToast('✓ Documento agregado');
    closeBibAddModal();
    loadBibliotecaBooks();
  } catch (err) {
    showToast('⚠ Error: ' + err.message);
  }
}

async function deleteBibBook(id) {
  if (!confirm('¿Eliminar este documento de la biblioteca?')) return;
  await supabaseClient.from('reference_books').delete().eq('id', id);
  biblioteca.books = biblioteca.books.filter(b => b.id !== id);
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  showToast('✓ Documento eliminado');
}

function bibPreviewBook(id) {
  const book = biblioteca.books.find(b => b.id === id);
  if (!book?.content_text) return;
  document.getElementById('miniModalTitle').textContent = book.name;
  document.getElementById('miniModalBody').innerHTML = `<div style="font-size:12px;line-height:1.7;max-height:400px;overflow-y:auto;white-space:pre-wrap;background:var(--surface2);padding:10px;border-radius:var(--radius);border:1px solid var(--border)">${esc(book.content_text.substring(0, 5000))}${book.content_text.length > 5000 ? '\n\n[...truncado]' : ''}</div>`;
  window._miniModalSave = null;
  openMiniModal();
}

function filterBibBooks(q) {
  biblioteca.searchQuery = q.toLowerCase();
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
}

/* ── TAB NORMAS ── */

// Normas custom — persisten en Supabase (tabla normas_custom)
if (!window._normasCustom) window._normasCustom = [];
if (!window._normasCustomLoaded) window._normasCustomLoaded = false;

async function loadNormasCustom() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // ── MIGRACIÓN ÚNICA: localStorage → Supabase ──
    const legacyRaw = localStorage.getItem('fiscalito_normas');
    if (legacyRaw) {
      try {
        const legacyItems = JSON.parse(legacyRaw) || [];
        if (legacyItems.length > 0) {
          const { count } = await sb.from('normas_custom')
            .select('id', { count: 'exact', head: true }).eq('user_id', user.id);
          if ((count || 0) === 0) {
            for (const item of legacyItems) {
              await sb.from('normas_custom').insert({
                id:          item.id || ('cust_' + Date.now()),
                user_id:     user.id,
                label:       item.label || 'Sin nombre',
                descripcion: item.desc || '',
                arts:        item.arts || [],
                content:     item.content || '',
                url_bcn:     item.url_bcn || '',
                is_override: item.custom === 'override',
              });
            }
            localStorage.removeItem('fiscalito_normas');
            showToast('✓ ' + legacyItems.length + ' norma(s) migrada(s) a la nube');
          } else {
            localStorage.removeItem('fiscalito_normas');
          }
        }
      } catch(migErr) {
        console.warn('[BIB] migración normas:', migErr);
      }
    }

    const { data } = await sb.from('normas_custom').select('*').eq('user_id', user.id);
    window._normasCustom = (data || []).map(r => ({
      id:      r.id,
      label:   r.label,
      desc:    r.descripcion || '',
      arts:    r.arts || [],
      content: r.content || '',
      url_bcn: r.url_bcn || '',
      custom:  r.is_override ? 'override' : true,
    }));
    window._normasCustomLoaded = true;
  } catch(err) {
    console.warn('[BIB] loadNormasCustom:', err);
  }
}

const LEY_NORMAS_BASE = [
  { id:'ea',       label:'DFL N°29 / Ley 18.834 — Estatuto Administrativo',          desc:'Texto refundido del Estatuto Administrativo. Base normativa de los procedimientos disciplinarios.',               arts:['Art. 119-145 (Procedimientos disciplinarios)','Art. 121 (Sanciones)','Art. 157 (Prescripción)'],    url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=236392', custom:false },
  { id:'ley19880', label:'Ley 19.880 — Bases de Procedimientos Administrativos',      desc:'Regula los actos y procedimientos de la Administración del Estado.',                                             arts:['Art. 17 (Derechos de los administrados)','Art. 18-22 (Plazos)','Art. 41-44 (Resolución)'],          url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=175203', custom:false },
  { id:'ley21369', label:'Ley 21.369 — Acoso Sexual y Violencia de Género en IES',    desc:'Prevención y sanción del acoso sexual, violencia y discriminación de género en instituciones de educación superior.', arts:['Art. 1-4 (Obligaciones institucionales)','Art. 5-10 (Procedimiento)','Art. 11-15 (Sanciones)'],   url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=1162612', custom:false },
  { id:'ley21643', label:'Ley 21.643 — Ley Karin',                                   desc:'Modifica el Código del Trabajo y el Estatuto Administrativo para prevenir el acoso laboral, sexual y violencia en el trabajo.', arts:['Art. 1 (Definiciones)','Art. 2 (Obligaciones del empleador)','Art. 3 (Procedimiento de investigación)'], url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=1196426', custom:false },
  { id:'ley18575', label:'Ley 18.575 — Ley Orgánica Constitucional de Bases',         desc:'Bases generales de la Administración del Estado. Principios de probidad y transparencia.',                    arts:['Art. 52-62 (Principio de probidad)','Art. 63-65 (Declaración de patrimonio e intereses)'],         url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=29967',  custom:false },
  { id:'ley20285', label:'Ley 20.285 — Transparencia y Acceso a la Información',      desc:'Acceso a la información pública y transparencia activa.',                                                        arts:['Art. 5-7 (Información activa)','Art. 10-15 (Solicitudes de información)'],                         url_bcn:'https://www.bcn.cl/leychile/navegar?idNorma=276363',  custom:false },
];

function getAllNormas() {
  // Aplicar overrides sobre normas base
  const customs = window._normasCustom || [];
  const overrides = {};
  customs.filter(c => c.custom === 'override').forEach(c => overrides[c.id] = c);
  const base = LEY_NORMAS_BASE.map(n => overrides[n.id] ? { ...n, ...overrides[n.id] } : n);
  const added = customs.filter(c => c.custom === true);
  return [...base, ...added];
}

async function saveNormasCustom(item) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('normas_custom').upsert({
      id:          item.id,
      user_id:     user.id,
      label:       item.label,
      descripcion: item.desc || '',
      arts:        item.arts || [],
      content:     item.content || '',
      url_bcn:     item.url_bcn || '',
      is_override: item.custom === 'override',
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch(err) {
    console.warn('[BIB] saveNormasCustom:', err);
  }
}

function renderBibNormas() {
  const all = getAllNormas();
  return `
  <div class="bib-normas-toolbar">
    <span style="font-size:11.5px;color:var(--text-muted)">${all.length} norma(s) disponibles</span>
    <button class="btn-save" style="padding:5px 14px;font-size:11.5px" onclick="showNormaAddForm()">+ Agregar normativa</button>
  </div>

  <!-- Formulario agregar/editar (oculto por defecto) -->
  <div id="normaFormWrap" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
    <input type="hidden" id="normaEditId"/>
    <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px" id="normaFormTitle">Nueva normativa</div>
    <div class="mini-row" style="margin-bottom:8px">
      <div class="mini-field">
        <label>Nombre / Ley *</label>
        <input id="normaFLabel" placeholder="Ej: Ley 19.296 — Asociaciones de Funcionarios"/>
      </div>
    </div>
    <div class="mini-field" style="margin-bottom:8px">
      <label>Descripción</label>
      <input id="normaFDesc" placeholder="Descripción breve de la normativa"/>
    </div>
    <div class="mini-field" style="margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:6px">
        🔗 Enlace BCN — versión vigente
        <span style="font-weight:400;color:var(--text-muted);font-size:10px">(Biblioteca del Congreso Nacional)</span>
      </label>
      <input id="normaFUrlBcn" placeholder="https://www.bcn.cl/leychile/navegar?idNorma=236392"
        style="font-family:var(--font-mono,'DM Mono',monospace);font-size:11.5px"/>
    </div>
    <div class="mini-field" style="margin-bottom:8px">
      <label>Artículos clave (uno por línea)</label>
      <textarea id="normaFArts" rows="3" placeholder="Art. 1 (Objeto)&#10;Art. 5 (Afiliación)&#10;Art. 12 (Derechos)" style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,Inter,sans-serif);font-size:12px;outline:none;resize:vertical;transition:border-color .15s;"></textarea>
    </div>
    <!-- Subir PDF o Word -->
    <div class="mini-field" style="margin-bottom:8px">
      <label>Subir PDF o Word <span style="font-weight:400;color:var(--text-muted)">(extrae el texto automáticamente)</span></label>
      <div id="normaDropZone" class="bib-drop-zone" style="padding:14px 16px;margin-bottom:0"
           onclick="document.getElementById('normaFile').click()"
           ondragover="event.preventDefault();this.classList.add('bib-drop-active')"
           ondragleave="this.classList.remove('bib-drop-active')"
           ondrop="event.preventDefault();this.classList.remove('bib-drop-active');handleNormaFileSelect({files:event.dataTransfer.files})">
        <input type="file" id="normaFile" accept=".pdf,.docx,.doc"
          style="display:none" onchange="handleNormaFileSelect(this)"/>
        <div id="normaDropLabel" style="text-align:center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" style="margin-bottom:5px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style="font-size:12px;font-weight:500;color:var(--text-dim)">Arrastra o haz clic</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">📕 PDF &nbsp;·&nbsp; 📘 Word (.docx / .doc)</div>
        </div>
      </div>
      <div id="normaFileInfo" style="display:none;align-items:center;gap:8px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:var(--radius);padding:7px 10px;margin-top:5px;font-size:11.5px">
        <span id="normaFileIcon" style="font-size:16px">📄</span>
        <div style="flex:1;min-width:0">
          <div id="normaFileNameLabel" style="font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
          <div id="normaFileSizeLabel" style="font-size:10px;color:var(--text-muted)"></div>
        </div>
        <button onclick="normaFileClear()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px 5px">✕</button>
      </div>
      <div id="normaExtractStatus" style="display:none;font-size:11px;margin-top:4px;padding:3px 0"></div>
    </div>

    <div class="mini-field" style="margin-bottom:10px">
      <label style="display:flex;align-items:center;justify-content:space-between">
        <span>Contenido / Texto relevante <span style="font-weight:400;color:var(--text-muted)">(el agente lo usará en análisis)</span></span>
        <span id="normaFContentChars" style="font-size:10px;color:var(--text-muted)"></span>
      </label>
      <textarea id="normaFContent" rows="4"
        placeholder="El texto se extrae automáticamente del PDF/Word. También puedes pegarlo directamente aquí…"
        oninput="document.getElementById('normaFContentChars').textContent=this.value.length.toLocaleString()+' chars'"
        style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,Inter,sans-serif);font-size:12px;outline:none;resize:vertical;transition:border-color .15s;"></textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-save" style="padding:6px 16px" onclick="saveNormaForm()">Guardar normativa</button>
      <button class="btn-cancel" onclick="hideNormaAddForm()">Cancelar</button>
    </div>
  </div>

  <div class="bib-normas-list">
    ${all.map(n => `
      <div class="bib-norma-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div class="bib-norma-title">⚖️ ${esc(n.label)}</div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn-edit" style="padding:2px 9px;font-size:10.5px" onclick="editNormaForm('${n.id}')">✎ Editar</button>
            ${n.custom !== false ? `<button class="btn-del" onclick="deleteNorma('${n.id}')">✕</button>` : ''}
          </div>
        </div>
        <div class="bib-norma-desc">${esc(n.desc)}</div>
        ${n.arts?.length ? `<div class="bib-norma-arts">${n.arts.map(a=>`<span class="bib-norma-art">📌 ${esc(a)}</span>`).join('')}</div>` : ''}
        ${n.content ? `<div style="font-size:10px;color:var(--green);margin-top:5px">✓ Contiene texto para consulta IA (${n.content.length.toLocaleString()} chars)</div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
          <button class="btn-sm" onclick="bibConsultarNorma('${n.id}')">💬 Consultar con IA</button>
          ${n.url_bcn ? `<a href="${esc(n.url_bcn)}" target="_blank" class="bib-bcn-link">🔗 Ver en BCN →</a>` : ''}
        </div>
      </div>`).join('')}
  </div>`;
}

function showNormaAddForm() {
  document.getElementById('normaEditId').value = '';
  document.getElementById('normaFLabel').value = '';
  document.getElementById('normaFDesc').value = '';
  document.getElementById('normaFArts').value = '';
  document.getElementById('normaFContent').value = '';
  const urlField = document.getElementById('normaFUrlBcn');
  if (urlField) urlField.value = '';
  document.getElementById('normaFormTitle').textContent = 'Nueva normativa';
  // Reset file upload
  normaFileClear?.();
  const w = document.getElementById('normaFormWrap');
  if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}

function hideNormaAddForm() {
  const w = document.getElementById('normaFormWrap');
  if (w) w.style.display = 'none';
}

function editNormaForm(id) {
  const all = getAllNormas();
  const n = all.find(x => x.id === id);
  if (!n) return;
  document.getElementById('normaEditId').value = id;
  document.getElementById('normaFLabel').value = n.label || '';
  document.getElementById('normaFDesc').value = n.desc || '';
  document.getElementById('normaFArts').value = (n.arts || []).join('\n');
  document.getElementById('normaFContent').value = n.content || '';
  const urlEditField = document.getElementById('normaFUrlBcn');
  if (urlEditField) urlEditField.value = n.url_bcn || '';
  document.getElementById('normaFormTitle').textContent = 'Editar normativa';
  const w = document.getElementById('normaFormWrap');
  if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}

async function saveNormaForm() {
  const label   = document.getElementById('normaFLabel')?.value.trim();
  const desc    = document.getElementById('normaFDesc')?.value.trim();
  const artsRaw = document.getElementById('normaFArts')?.value.trim();
  const content = document.getElementById('normaFContent')?.value.trim();
  const urlBcn  = document.getElementById('normaFUrlBcn')?.value.trim();
  const editId  = document.getElementById('normaEditId')?.value;

  if (!label) { showToast('⚠ El nombre es obligatorio'); return; }

  const arts = artsRaw ? artsRaw.split('\n').map(a=>a.trim()).filter(Boolean) : [];
  if (!window._normasCustom) window._normasCustom = [];

  const isBaseNorma = LEY_NORMAS_BASE.some(n => n.id === editId);
  const normaId = editId || ('custom_' + Date.now());
  const normaObj = {
    id:      normaId,
    label,
    desc:    desc || '',
    arts,
    content: content || '',
    url_bcn: urlBcn || '',
    custom:  isBaseNorma ? 'override' : true,
  };

  // Update in-memory
  const idx = window._normasCustom.findIndex(n => n.id === normaId);
  if (idx >= 0) window._normasCustom[idx] = normaObj;
  else window._normasCustom.push(normaObj);

  // If editing base norma, patch it in-place for immediate display
  if (isBaseNorma) {
    const bIdx = LEY_NORMAS_BASE.findIndex(n => n.id === editId);
    if (bIdx >= 0) Object.assign(LEY_NORMAS_BASE[bIdx], { label, desc, arts, content: content||'', url_bcn: urlBcn||'' });
  }

  // Persist to Supabase
  await saveNormasCustom(normaObj);

  hideNormaAddForm();
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  showToast('✓ Normativa guardada');
}


/* ── Manejo de archivo PDF/DOCX en formulario de Normas ── */
function normaFileClear() {
  const fi = document.getElementById('normaFile');
  if (fi) fi.value = '';
  document.getElementById('normaFileInfo').style.display = 'none';
  document.getElementById('normaDropZone').style.display = 'flex';
  document.getElementById('normaExtractStatus').style.display = 'none';
  const cnt = document.getElementById('normaFContent');
  if (cnt) { cnt.value = ''; }
  document.getElementById('normaFContentChars').textContent = '';
}

async function handleNormaFileSelect(input) {
  const file = (input.files || input)?.[0];
  if (!file) return;

  const isPDF  = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const isDOCX = file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc') ||
                 file.type?.includes('word') || file.type?.includes('officedocument');

  if (!isPDF && !isDOCX) {
    if (typeof showToast === 'function') showToast('⚠ Solo se aceptan PDF o Word (.docx / .doc)');
    return;
  }

  // Auto-fill nombre si está vacío
  const lbl = document.getElementById('normaFLabel');
  if (lbl && !lbl.value) lbl.value = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

  // Mostrar info del archivo
  const info = document.getElementById('normaFileInfo');
  const drop = document.getElementById('normaDropZone');
  const ext  = document.getElementById('normaExtractStatus');
  if (info) {
    document.getElementById('normaFileIcon').textContent = isPDF ? '📕' : '📘';
    document.getElementById('normaFileNameLabel').textContent = file.name;
    document.getElementById('normaFileSizeLabel').textContent = (file.size/1024).toFixed(0) + ' KB · ' + (isPDF ? 'PDF' : 'Word');
    info.style.display = 'flex';
  }
  if (drop) drop.style.display = 'none';
  if (ext) { ext.style.display = 'block'; ext.innerHTML = '<span style="color:var(--text-muted)">⏳ Extrayendo texto…</span>'; }

  try {
    let text = '';
    if (isDOCX) {
      text = await bibExtractDocx(file);
    } else {
      text = await bibExtractPdf(file);
    }
    text = bibSanitizeText(text);

    const ta = document.getElementById('normaFContent');
    if (ta) {
      ta.value = text.substring(0, 80000);
      document.getElementById('normaFContentChars').textContent = text.length.toLocaleString() + ' chars extraídos';
    }

    if (ext) {
      if (text.length > 100) {
        ext.innerHTML = '<span style="color:var(--green)">✓ Texto extraído (' + text.length.toLocaleString() + ' caracteres)</span>';
      } else {
        ext.innerHTML = '<span style="color:var(--text-muted)">ℹ El documento puede estar escaneado. Pega el texto manualmente.</span>';
      }
    }
  } catch (err) {
    console.error('[NORMA] extract error:', err);
    if (ext) ext.innerHTML = '<span style="color:var(--text-muted)">ℹ No se pudo extraer texto. Pégalo manualmente.</span>';
  }
}

async function deleteNorma(id) {
  if (!confirm('¿Eliminar esta normativa?')) return;
  window._normasCustom = (window._normasCustom || []).filter(n => n.id !== id);
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (user) await sb.from('normas_custom').delete().eq('id', id).eq('user_id', user.id);
  }
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  showToast('✓ Normativa eliminada');
}

function bibConsultarNorma(normaId) {
  const norma = getAllNormas().find(n => n.id === normaId);
  if (!norma) return;
  biblioteca.activeTab = 'chat';
  renderBibliotecaView();
  const input = document.getElementById('bibChatInput');
  if (input) input.value = `Explica los aspectos más importantes de: ${norma.label}`;
  sendBibChat();
}


/* ── TAB NORMATIVA INTERNA ── */
// Normativa Interna — persiste en Supabase (tabla normativa_interna)
if (!window._normativaInterna) window._normativaInterna = [];
if (!window._normativaInternaLoaded) window._normativaInternaLoaded = false;

async function loadNormativaInterna() {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    // ── MIGRACIÓN ÚNICA: localStorage → Supabase ──
    // Si hay datos en localStorage y Supabase está vacío, migrarlos automáticamente
    const legacyRaw = localStorage.getItem('fiscalito_normativa_interna');
    if (legacyRaw) {
      try {
        const legacyItems = JSON.parse(legacyRaw) || [];
        if (legacyItems.length > 0) {
          // Verificar si Supabase ya tiene datos para no duplicar
          const { count } = await sb.from('normativa_interna')
            .select('id', { count: 'exact', head: true }).eq('user_id', user.id);
          if ((count || 0) === 0) {
            // Migrar cada ítem al formato Supabase
            for (const item of legacyItems) {
              const newId = (item.id && !item.id.startsWith('ni_'))
                ? item.id
                : (crypto.randomUUID?.() || ('mig_' + Date.now() + '_' + Math.random().toString(36).slice(2)));
              await sb.from('normativa_interna').insert({
                id:          newId,
                user_id:     user.id,
                name:        item.name || 'Sin nombre',
                tipo:        item.tipo || 'protocolo',
                version:     item.version || null,
                descripcion: item.desc || '',
                arts:        item.arts || [],
                content:     item.content || '',
              });
            }
            // Limpiar localStorage tras migración exitosa
            localStorage.removeItem('fiscalito_normativa_interna');
            showToast('✓ ' + legacyItems.length + ' normativa(s) migrada(s) a la nube');
          } else {
            // Supabase ya tiene datos — limpiar localStorage sin migrar
            localStorage.removeItem('fiscalito_normativa_interna');
          }
        }
      } catch(migErr) {
        console.warn('[BIB] migración normativa:', migErr);
      }
    }

    // Cargar desde Supabase
    const { data } = await sb.from('normativa_interna').select('*').eq('user_id', user.id).order('created_at');
    window._normativaInterna = (data || []).map(r => ({
      id:      r.id,
      name:    r.name,
      tipo:    r.tipo || 'protocolo',
      version: r.version || '',
      desc:    r.descripcion || '',
      arts:    r.arts || [],
      content: r.content || '',
    }));
    window._normativaInternaLoaded = true;

    // Refrescar vista si está activa
    if (biblioteca.activeTab === 'normativa') {
      const body = document.getElementById('bibBody');
      if (body) body.innerHTML = renderBibTabBody();
    }
  } catch(err) {
    console.warn('[BIB] loadNormativaInterna:', err);
  }
}

async function saveNormativaInterna(item) {
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (!sb) return;
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('normativa_interna').upsert({
      id:          item.id,
      user_id:     user.id,
      name:        item.name,
      tipo:        item.tipo || 'protocolo',
      version:     item.version || null,
      descripcion: item.desc || '',
      arts:        item.arts || [],
      content:     item.content || '',
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch(err) {
    console.warn('[BIB] saveNormativaInterna:', err);
    showToast('⚠ Error al guardar: ' + err.message);
  }
}

function renderBibNormativaInterna() {
  const items = window._normativaInterna || [];
  return `
  <div class="bib-normas-toolbar">
    <div>
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">Normativa Interna</div>
      <div style="font-size:11px;color:var(--text-muted)">Protocolos, reglamentos y normas institucionales propias</div>
    </div>
    <button class="btn-save" style="padding:5px 14px;font-size:11.5px" onclick="showNormativaInternaForm()">+ Agregar</button>
  </div>

  <!-- Formulario (oculto por defecto) -->
  <div id="normIntFormWrap" style="display:none;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:12px;">
    <input type="hidden" id="normIntEditId"/>
    <div style="font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px" id="normIntFormTitle">Nueva normativa interna</div>
    <div class="mini-field" style="margin-bottom:8px">
      <label>Nombre / Título *</label>
      <input id="normIntName" placeholder="Ej: Protocolo de Acoso Laboral 2022"/>
    </div>
    <div class="mini-row" style="margin-bottom:8px">
      <div class="mini-field">
        <label>Tipo</label>
        <select id="normIntTipo">
          <option value="protocolo">Protocolo</option>
          <option value="reglamento">Reglamento</option>
          <option value="circular">Circular</option>
          <option value="resolucion">Resolución interna</option>
          <option value="instructivo">Instructivo</option>
          <option value="convenio">Convenio</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <div class="mini-field">
        <label>Año / Versión</label>
        <input id="normIntVersion" placeholder="Ej: 2022, v2.1"/>
      </div>
    </div>
    <div class="mini-field" style="margin-bottom:8px">
      <label>Descripción</label>
      <input id="normIntDesc" placeholder="Descripción breve del alcance y aplicación"/>
    </div>
    <div class="mini-field" style="margin-bottom:10px">
      <label>Artículos o secciones clave <span style="font-weight:400;color:var(--text-muted)">(uno por línea)</span></label>
      <textarea id="normIntArts" rows="3"
        placeholder="Art. 1 — Objeto y ámbito de aplicación&#10;Art. 5 — Definiciones&#10;Art. 12 — Procedimiento"
        style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;resize:vertical;transition:border-color .15s;"></textarea>
    </div>
    <div class="mini-field" style="margin-bottom:10px">
      <label>Contenido / Texto relevante <span style="font-weight:400;color:var(--text-muted)">(el agente lo consultará en análisis)</span></label>
      <textarea id="normIntContent" rows="5"
        placeholder="Pega aquí el texto del protocolo, reglamento o normativa. El agente la usará como fuente preferente al analizar casos relacionados."
        style="width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:6px 9px;border-radius:var(--radius);font-family:var(--font-body,'Inter',sans-serif);font-size:12px;outline:none;resize:vertical;min-height:100px;transition:border-color .15s;"></textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-save" style="padding:6px 16px" onclick="saveNormativaInternaForm()">Guardar</button>
      <button class="btn-cancel" onclick="hideNormativaInternaForm()">Cancelar</button>
    </div>
  </div>

  ${items.length === 0
    ? `<div class="ley-empty">Sin normativa interna. Agrega protocolos, reglamentos o circulares institucionales.</div>`
    : `<div class="bib-normas-list">
        ${items.map(item => {
          const tipoLabels = { protocolo:'Protocolo', reglamento:'Reglamento', circular:'Circular',
            resolucion:'Resolución interna', instructivo:'Instructivo', convenio:'Convenio', otro:'Otro' };
          const tipoIcons = { protocolo:'📋', reglamento:'📜', circular:'📨',
            resolucion:'📄', instructivo:'📌', convenio:'🤝', otro:'🗂' };
          return `
          <div class="bib-norma-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px">
              <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                <span style="font-size:16px;flex-shrink:0">${tipoIcons[item.tipo]||'🗂'}</span>
                <div>
                  <div class="bib-norma-title" style="margin-bottom:1px">${esc(item.name)}</div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:9.5px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:1px 7px;border-radius:5px;font-weight:500">${tipoLabels[item.tipo]||'Otro'}</span>
                    ${item.version ? `<span style="font-size:10px;color:var(--text-muted)">v${esc(item.version)}</span>` : ''}
                  </div>
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn-edit" style="padding:2px 9px;font-size:10.5px" onclick="editNormativaInternaForm('${item.id}')">✎ Editar</button>
                <button class="btn-del" onclick="deleteNormativaInterna('${item.id}')">✕</button>
              </div>
            </div>
            ${item.desc ? `<div class="bib-norma-desc">${esc(item.desc)}</div>` : ''}
            ${item.arts?.length ? `<div class="bib-norma-arts">${item.arts.map(a=>`<span class="bib-norma-art">📌 ${esc(a)}</span>`).join('')}</div>` : ''}
            ${item.content ? `<div style="font-size:10px;color:var(--green);margin-top:5px">✓ Contiene texto para consulta IA (${item.content.length.toLocaleString()} chars)</div>` : ''}
            <div style="margin-top:8px;display:flex;gap:6px">
              <button class="btn-sm" onclick="bibConsultarNormativaInterna('${item.id}')">💬 Consultar con IA</button>
            </div>
          </div>`;
        }).join('')}
      </div>`}`;
}

function showNormativaInternaForm() {
  document.getElementById('normIntEditId').value = '';
  document.getElementById('normIntName').value = '';
  document.getElementById('normIntDesc').value = '';
  document.getElementById('normIntArts').value = '';
  document.getElementById('normIntContent').value = '';
  document.getElementById('normIntVersion').value = '';
  document.getElementById('normIntTipo').value = 'protocolo';
  document.getElementById('normIntFormTitle').textContent = 'Nueva normativa interna';
  const w = document.getElementById('normIntFormWrap');
  if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}

function hideNormativaInternaForm() {
  const w = document.getElementById('normIntFormWrap');
  if (w) w.style.display = 'none';
}

function editNormativaInternaForm(id) {
  const item = (window._normativaInterna||[]).find(x => x.id === id);
  if (!item) return;
  document.getElementById('normIntEditId').value = id;
  document.getElementById('normIntName').value = item.name || '';
  document.getElementById('normIntDesc').value = item.desc || '';
  document.getElementById('normIntArts').value = (item.arts||[]).join('\n');
  document.getElementById('normIntContent').value = item.content || '';
  document.getElementById('normIntVersion').value = item.version || '';
  document.getElementById('normIntTipo').value = item.tipo || 'protocolo';
  document.getElementById('normIntFormTitle').textContent = 'Editar normativa interna';
  const w = document.getElementById('normIntFormWrap');
  if (w) { w.style.display = 'block'; w.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}

async function saveNormativaInternaForm() {
  const name    = document.getElementById('normIntName')?.value.trim();
  const desc    = document.getElementById('normIntDesc')?.value.trim();
  const tipo    = document.getElementById('normIntTipo')?.value || 'protocolo';
  const version = document.getElementById('normIntVersion')?.value.trim();
  const artsRaw = document.getElementById('normIntArts')?.value.trim();
  const content = document.getElementById('normIntContent')?.value.trim();
  const editId  = document.getElementById('normIntEditId')?.value;

  if (!name) { showToast('⚠ El nombre es obligatorio'); return; }

  const arts = artsRaw ? artsRaw.split('\n').map(a=>a.trim()).filter(Boolean) : [];
  if (!window._normativaInterna) window._normativaInterna = [];

  // Para Supabase necesitamos UUID — si es 'ni_xxx' (localStorage legacy) generamos uno nuevo
  const isLegacyId = editId && editId.startsWith('ni_');
  const itemId = (editId && !isLegacyId) ? editId : crypto.randomUUID?.() || ('ni_' + Date.now());
  const item = { id: itemId, name, desc, tipo, version: version||'', arts, content: content||'' };

  const idx = window._normativaInterna.findIndex(x => x.id === editId || x.id === itemId);
  if (idx >= 0) window._normativaInterna[idx] = item;
  else window._normativaInterna.push(item);

  await saveNormativaInterna(item);
  hideNormativaInternaForm();
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  showToast('✓ Normativa guardada');
}

async function deleteNormativaInterna(id) {
  if (!confirm('¿Eliminar esta normativa interna?')) return;
  window._normativaInterna = (window._normativaInterna||[]).filter(x => x.id !== id);
  const sb = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (user) await sb.from('normativa_interna').delete().eq('id', id).eq('user_id', user.id);
  }
  const body = document.getElementById('bibBody');
  if (body) body.innerHTML = renderBibTabBody();
  showToast('✓ Eliminada');
}

function bibConsultarNormativaInterna(id) {
  const item = (window._normativaInterna||[]).find(x => x.id === id);
  if (!item) return;
  biblioteca.activeTab = 'chat';
  renderBibliotecaView();
  const input = document.getElementById('bibChatInput');
  if (input) input.value = `Explica y analiza: ${item.name}${item.content?' — considerando su texto completo':''}`;
  sendBibChat && sendBibChat();
}


/* ── TAB PÁRRAFOS ── */
const PARRAFOS_SISTEMA = [
  { id:'propuesta_sancion', cat:'Sanción', label:'Párrafo propuesta de sanción', preview:'Que, habiéndose acreditado la responsabilidad administrativa del inculpado…' },
  { id:'valoracion_prueba', cat:'Prueba', label:'Valoración de la prueba', preview:'Que, en cuanto a la prueba rendida en autos, esta Fiscalía la valora conforme a la sana crítica…' },
  { id:'atenuantes', cat:'Sanción', label:'Atenuantes y agravantes', preview:'Que, para la determinación de la sanción, se han tenido en especial consideración…' },
  { id:'prescripcion', cat:'Sobreseimiento', label:'Prescripción de la acción disciplinaria', preview:'Que, en lo que respecta a la prescripción de la acción disciplinaria, conforme al artículo 157…' },
  { id:'incompetencia', cat:'Sobreseimiento', label:'Sobreseimiento por incompetencia', preview:'Que, respecto de la competencia para conocer el presente procedimiento…' },
  { id:'genero', cat:'Género', label:'Perspectiva de género', preview:'Que, atendida la naturaleza de los hechos denunciados, esta Fiscalía ha incorporado en su análisis la perspectiva de género…' },
  { id:'por_tanto_sancion', cat:'Resolución', label:'Por tanto — Sanción', preview:'P O R T A N T O, SE RESUELVE O SUGIERE…' },
  { id:'por_tanto_sobreseimiento', cat:'Resolución', label:'Por tanto — Sobreseimiento', preview:'P O R T A N T O, SE RESUELVE O SUGIERE…' },
  { id:'denuncia_anonima', cat:'Especial', label:'Denuncia anónima', preview:'Que, cabe señalar que el presente procedimiento tuvo su origen en una denuncia de carácter anónimo…' },
];

function renderBibParrafos() {
  const cats = [...new Set(PARRAFOS_SISTEMA.map(p => p.cat))];
  return `<div style="margin-bottom:10px;font-size:11px;color:var(--text-muted)">Párrafos modelo institucionales. Haz clic en cualquiera para usarlo en el chat.</div>
    ${cats.map(cat => `
      <div style="margin-bottom:12px">
        <div style="font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-dim);font-family:'DM Mono',monospace;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid var(--border)">${cat}</div>
        ${PARRAFOS_SISTEMA.filter(p => p.cat === cat).map(p => `
          <div class="bib-parr-item" onclick="usarParrafoEnChat('${p.id}')">
            <div class="bib-parr-label">📝 ${esc(p.label)}</div>
            <div class="bib-parr-preview">${esc(p.preview)}</div>
          </div>`).join('')}
      </div>`).join('')}`;
}

function usarParrafoEnChat(id) {
  const parr = PARRAFOS_SISTEMA.find(p => p.id === id);
  if (!parr) return;
  biblioteca.activeTab = 'chat';
  renderBibliotecaView();
  const input = document.getElementById('bibChatInput');
  if (input) input.value = `Adapta el párrafo "${parr.label}" al expediente${currentCase ? ' ' + currentCase.name : ''}: `;
  showToast('✓ Párrafo seleccionado — describe el caso en el chat');
}

/* ── TAB CHAT IA ── */
function renderBibChat() {
  const msgs = biblioteca.chatMessages;
  const msgsHtml = msgs.length
    ? msgs.map(m => `<div class="ley-chat-msg ${m.role}"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${m.role==='user'?esc(m.content):md(m.content)}</div></div></div>`).join('')
    : `<div class="ley-chat-msg assistant"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub"><strong>Asistente Biblioteca</strong><br>Hola 👋 Soy tu asistente de la Biblioteca de Referencia. Puedo buscar en tus documentos, explicar normas, adaptar párrafos modelo y ayudarte con consultas jurídicas. ¿En qué te puedo ayudar?</div></div></div>`;

  return `<div class="bib-chat-wrap">
    <div class="bib-chat-chips">
      <button class="ley-chat-chip" onclick="bibQuickQuery('¿Cuáles son los plazos de la investigación sumaria?')">Plazos inv. sumaria</button>
      <button class="ley-chat-chip" onclick="bibQuickQuery('Explica el art. 121 del Estatuto Administrativo')">Art. 121 EA</button>
      <button class="ley-chat-chip" onclick="bibQuickQuery('¿Cuándo procede el sobreseimiento por prescripción?')">Prescripción</button>
      <button class="ley-chat-chip" onclick="bibQuickQuery('¿Qué dice la Ley Karin sobre el procedimiento?')">Ley Karin</button>
    </div>
    <div class="ley-chat-msgs" id="bibChatMsgs" style="max-height:350px">${msgsHtml}</div>
    <div class="ley-chat-input-row" style="padding:10px 0 0">
      <textarea class="ley-chat-input" id="bibChatInput" placeholder="Consulta a la biblioteca jurídica…" rows="1"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendBibChat()}"
        oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,100)+'px'"></textarea>
      <button class="send-btn" onclick="sendBibChat()" ${biblioteca.chatLoading?'disabled':''}>
        <svg viewBox="0 0 16 16"><path d="M14.5 8L1.5 1.5l2 6.5-2 6.5z"/></svg>
      </button>
    </div>
  </div>`;
}

function bibQuickQuery(text) {
  biblioteca.activeTab = 'chat';
  renderBibliotecaView();
  const input = document.getElementById('bibChatInput');
  if (input) input.value = text;
  sendBibChat();
}

async function sendBibChat() {
  const input = document.getElementById('bibChatInput');
  const text = input?.value.trim();
  if (!text || biblioteca.chatLoading) return;
  input.value = '';

  biblioteca.chatMessages.push({ role: 'user', content: text });
  biblioteca.chatLoading = true;

  // Re-render to show user msg + typing
  const msgs = document.getElementById('bibChatMsgs');
  if (msgs) {
    msgs.innerHTML += `<div class="ley-chat-msg user"><div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${esc(text)}</div></div></div>`;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ley-chat-msg assistant';
    typingDiv.id = 'bibChatTyping';
    typingDiv.innerHTML = '<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub"><div class="typing"><div class="da"></div><div class="da"></div><div class="da"></div></div></div></div>';
    msgs.appendChild(typingDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Build context from books
  // Also include normas with content
  const normasCtx = getAllNormas().filter(n=>n.content).map(n=>`[NORMA: ${n.label}]\n${n.content.substring(0,600)}`).join('\n\n---\n\n');
  const normativaInternaCtx = (window._normativaInterna||[]).filter(n=>n.content).map(n=>`[NORMATIVA INTERNA: ${n.name}]\n${n.content.substring(0,800)}`).join('\n\n---\n\n');
  const booksCtx = biblioteca.books.filter(b => b.content_text).slice(0, 10).map(b =>
    `[${b.name}]\n${b.content_text.substring(0, 800)}`
  ).join('\n\n---\n\n');

  try {
    const _ctrl=new AbortController();
    const _tout=setTimeout(()=>_ctrl.abort(),30000);
    try{
      const resp = await fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: `Eres Fiscalito, asistente jurídico de la Biblioteca de Referencia. Tienes acceso a los documentos de la biblioteca y a normativa de procedimientos disciplinarios. Responde con precisión, cita normas específicas y usa lenguaje institucional formal.

DOCUMENTOS DE LA BIBLIOTECA (primeros ${biblioteca.books.length} docs):
${[normasCtx, normativaInternaCtx, booksCtx].filter(Boolean).join('\n\n---\n\n') || 'Sin documentos cargados aún.'}`,
          messages: biblioteca.chatMessages.slice(-12)
        }),
        signal:_ctrl.signal
      });

        const data = await resp.json();
      const reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || 'Sin respuesta.';
      biblioteca.chatMessages.push({ role: 'assistant', content: reply });

      const typing = document.getElementById('bibChatTyping');
      if (typing) {
        typing.innerHTML = `<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub">${md(reply)}</div></div>`;
      }
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }finally{
      clearTimeout(_tout);
    }
  } catch (err) {
    const typing = document.getElementById('bibChatTyping');
    if (typing) typing.innerHTML = `<div class="ley-chat-msg-body"><div class="ley-chat-msg-bub" style="color:var(--red)">⚠️ Error: ${err.message}</div></div>`;
  } finally {
    biblioteca.chatLoading = false;
  }
}

/* ── ESTILOS ── */
(function injectBibCSS() {
  const style = document.createElement('style');
  style.textContent = `
.bib-layout{display:flex;flex-direction:column;height:100%;overflow:hidden;}
.bib-tabs{display:flex;border-bottom:1px solid var(--border);background:var(--surface);padding:0 16px;flex-shrink:0;}
.bib-tab{padding:9px 13px;font-size:12px;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:'Inter',sans-serif;}
.bib-tab:hover{color:var(--text);}
.bib-tab.active{color:var(--gold);border-bottom-color:var(--gold);}
.bib-body{flex:1;overflow-y:auto;padding:14px 16px;}
.bib-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
.bib-cat-block{margin-bottom:10px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
.bib-cat-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface);cursor:pointer;transition:background .15s;}
.bib-cat-header:hover{background:var(--surface2);}
.bib-cat-title{font-size:12px;font-weight:500;}
.bib-cat-body{background:var(--surface2);}
.bib-book-item{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border);transition:background .15s;}
.bib-book-item:last-child{border-bottom:none;}
.bib-book-item:hover{background:var(--surface);}
.bib-book-icon{font-size:16px;flex-shrink:0;margin-top:1px;}
.bib-book-info{flex:1;min-width:0;}
.bib-book-name{font-size:12px;font-weight:500;margin-bottom:2px;}
.bib-book-desc{font-size:11px;color:var(--text-dim);margin-bottom:2px;}
.bib-book-meta{font-size:10px;color:var(--text-muted);}
.bib-book-actions{display:flex;gap:4px;flex-shrink:0;}
.bib-normas-list{display:flex;flex-direction:column;gap:10px;}
.bib-norma-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;}
.bib-norma-title{font-size:12.5px;font-weight:600;margin-bottom:4px;color:var(--text);}
.bib-norma-desc{font-size:11.5px;color:var(--text-dim);margin-bottom:8px;line-height:1.5;}
.bib-norma-arts{display:flex;flex-wrap:wrap;gap:5px;}
.bib-norma-art{font-size:10px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:2px 8px;border-radius:8px;}
.bib-parr-item{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-bottom:5px;cursor:pointer;transition:all .15s;}
.bib-parr-item:hover{border-color:var(--gold-dim);background:var(--gold-glow);}
.bib-parr-label{font-size:12px;font-weight:500;margin-bottom:3px;}
.bib-parr-preview{font-size:11px;color:var(--text-muted);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.bib-normas-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);}
.bib-chat-wrap{display:flex;flex-direction:column;gap:0;}
.bib-chat-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
/* Drop zone */
.bib-drop-zone{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;border:2px dashed var(--border2);border-radius:var(--radius);cursor:pointer;transition:all .15s;background:var(--surface2);margin-bottom:8px;text-align:center;}
.bib-drop-zone:hover,.bib-drop-active{border-color:var(--gold-dim);background:var(--gold-glow);}
/* BCN link */
.bib-bcn-link{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--gold);text-decoration:none;padding:3px 10px;background:var(--gold-glow);border:1px solid var(--gold-dim);border-radius:10px;transition:all .12s;}
.bib-bcn-link:hover{background:rgba(79,70,229,.12);border-color:var(--gold);}
`;
  document.head.appendChild(style);
})();
