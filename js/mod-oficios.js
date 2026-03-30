/**
 * MOD-OFICIOS.JS
 * ──────────────
 * Sistema de generación de Oficios, Memorándums y Resoluciones
 * con numeración correlativa, formato personalizable y export a Word.
 * Sincroniza con Google Sheet compartido del equipo.
 * Dependencias: supabaseClient (sb), mod-export-word.js (WORD_FORMAT helpers)
 */
(function(){
"use strict";

/* ══════════════════════════════════════════
   ESTADO DEL MÓDULO
   ══════════════════════════════════════════ */
const oficios = {
  counters: {},        // { oficio: {last_number, prefix, format_template}, memo: {...}, resolucion: {...} }
  history: [],         // Últimos docs generados
  currentType: 'oficio',
  loaded: false,
  sheetId: null,       // Google Sheet ID (se guarda en Supabase user settings)
  sheetConnected: false,
  sheetData: {},       // { oficio: [...rows], memo: [...rows], resolucion: [...rows] }
};
window._oficiosState = oficios;

/* ══════════════════════════════════════════
   CONFIGURACIÓN DE HOJAS DEL GOOGLE SHEET
   ══════════════════════════════════════════ */
/* Cada hoja del Sheet tiene estas columnas (basado en los docs del equipo):
   Oficios:       Fecha | Nº | Destino      | Referencia | Fiscal
   Memos:         Fecha | Nº | Destino      | Referencia | Fiscal
   Resoluciones:  Fecha | N° | Destinatario | Tema       | Expediente | Fiscal
*/
const SHEET_CONFIG = {
  oficio:     { sheetName: 'Oficios',       cols: ['Fecha','Nº','Destino','Referencia','Fiscal'] },
  memo:       { sheetName: 'Memos',         cols: ['Fecha','Nº','Destino','Referencia','Fiscal'] },
  resolucion: { sheetName: 'Resoluciones',  cols: ['Fecha','N°','Destinatario','Tema','Expediente','Fiscal'] },
};

/* ══════════════════════════════════════════
   GOOGLE SHEETS API CALLS (vía Netlify function)
   ══════════════════════════════════════════ */
async function callSheets(body) {
  const res = await fetch('/.netlify/functions/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok && res.status >= 400) throw new Error(data.error || 'Error en Sheets API');
  return data;
}

/* Cargar el Sheet ID desde Supabase settings */
async function loadSheetConfig() {
  if (!window.session) return;
  try {
    const { data } = await sb.from('user_settings')
      .select('value')
      .eq('user_id', session.user.id)
      .eq('key', 'oficios_sheet_id')
      .maybeSingle();
    if (data?.value) {
      oficios.sheetId = data.value;
      oficios.sheetConnected = true;
    }
  } catch (e) {
    // Tabla user_settings puede no existir aún — intentar case_metadata como fallback
    try {
      const { data } = await sb.from('case_metadata')
        .select('value')
        .eq('key', 'oficios_sheet_id')
        .maybeSingle();
      if (data?.value) {
        oficios.sheetId = data.value;
        oficios.sheetConnected = true;
      }
    } catch (e2) { /* ignorar */ }
  }
}

/* Guardar el Sheet ID en Supabase */
async function saveSheetConfig(sheetId) {
  if (!window.session) return;
  oficios.sheetId = sheetId;
  oficios.sheetConnected = !!sheetId;
  // Intentar guardar en user_settings, fallback a case_metadata
  try {
    await sb.from('user_settings').upsert({
      user_id: session.user.id,
      key: 'oficios_sheet_id',
      value: sheetId,
    }, { onConflict: 'user_id,key' });
  } catch (e) {
    try {
      await sb.from('case_metadata').upsert({
        key: 'oficios_sheet_id',
        value: sheetId,
        case_id: '00000000-0000-0000-0000-000000000000',
      }, { onConflict: 'case_id,key' });
    } catch (e2) { console.warn('No se pudo guardar sheetId:', e2); }
  }
}

/* Leer datos de una hoja y encontrar el último número usado */
async function readSheetTab(docType) {
  if (!oficios.sheetId) return null;
  const cfg = SHEET_CONFIG[docType];
  if (!cfg) return null;
  try {
    const res = await callSheets({
      action: 'read',
      spreadsheetId: oficios.sheetId,
      sheetName: cfg.sheetName,
    });
    if (!res.ok) return null;
    oficios.sheetData[docType] = res.values || [];
    return res.values;
  } catch (e) {
    console.warn('readSheetTab error:', e);
    return null;
  }
}

/* Obtener el último número correlativo de la hoja */
function getLastNumberFromSheet(docType) {
  const rows = oficios.sheetData[docType];
  if (!rows || rows.length < 2) return 0; // solo header o vacía
  let maxNum = 0;
  // Columna del número es siempre la 2da (índice 1)
  for (let i = 1; i < rows.length; i++) {
    const val = parseInt(rows[i]?.[1]);
    if (!isNaN(val) && val > maxNum) {
      // Solo contar como "usado" si tiene al menos fecha o destino rellenado
      const hasData = (rows[i][0] && String(rows[i][0]).trim()) || (rows[i][2] && String(rows[i][2]).trim());
      if (hasData) maxNum = val;
    }
  }
  return maxNum;
}

/* Encontrar la fila correcta para escribir (busca la fila pre-rellenada con el número, o append) */
function findRowForNumber(docType, num) {
  const rows = oficios.sheetData[docType];
  if (!rows) return null;
  for (let i = 1; i < rows.length; i++) {
    const rowNum = parseInt(rows[i]?.[1]);
    if (rowNum === num) {
      // Verificar que la fila esté vacía (solo tiene el número)
      const hasData = (rows[i][0] && String(rows[i][0]).trim()) || (rows[i][2] && String(rows[i][2]).trim());
      if (!hasData) return i + 1; // +1 porque Sheets es 1-indexed
    }
  }
  return null; // No encontró fila pre-rellenada → append
}

/* Escribir una nueva fila en el Sheet */
async function writeToSheet(docType, rowData) {
  if (!oficios.sheetId) return false;
  const cfg = SHEET_CONFIG[docType];
  if (!cfg) return false;

  try {
    const num = parseInt(rowData[1]);
    const existingRow = findRowForNumber(docType, num);

    if (existingRow) {
      // Actualizar fila existente (pre-rellenada con el número)
      const range = `'${cfg.sheetName}'!A${existingRow}:${String.fromCharCode(65 + cfg.cols.length - 1)}${existingRow}`;
      await callSheets({
        action: 'update',
        spreadsheetId: oficios.sheetId,
        range: range,
        values: rowData,
      });
    } else {
      // Append al final
      await callSheets({
        action: 'append',
        spreadsheetId: oficios.sheetId,
        sheetName: cfg.sheetName,
        row: rowData,
      });
    }
    return true;
  } catch (e) {
    console.warn('writeToSheet error:', e);
    showToast('⚠️ No se pudo escribir en Google Sheet: ' + e.message);
    return false;
  }
}

/* Sincronizar contadores desde el Sheet */
async function syncCountersFromSheet() {
  if (!oficios.sheetId) return;
  for (const docType of ['oficio', 'memo', 'resolucion']) {
    await readSheetTab(docType);
    const lastNum = getLastNumberFromSheet(docType);
    if (oficios.counters[docType]) {
      oficios.counters[docType].last_number = Math.max(oficios.counters[docType].last_number, lastNum);
    }
  }
}

/* ══════════════════════════════════════════
   CARGAR CONTADORES (Supabase + Google Sheet)
   ══════════════════════════════════════════ */
async function loadDocCounters() {
  if (!window.session) return;
  const year = new Date().getFullYear();

  // Defaults
  oficios.counters = {
    oficio:     { last_number: 0, prefix: 'OF',   format_template: '{PREFIX}-{NUM}/{YEAR}' },
    memo:       { last_number: 0, prefix: 'MEMO', format_template: '{PREFIX}-{NUM}/{YEAR}' },
    resolucion: { last_number: 0, prefix: 'RES',  format_template: '{PREFIX}-{NUM}/{YEAR}' },
  };

  // 1. Cargar desde Supabase
  try {
    const { data, error } = await sb.from('document_counters')
      .select('doc_type,last_number,prefix,format_template')
      .eq('user_id', session.user.id)
      .eq('year', year);
    if (!error && data) {
      data.forEach(d => {
        oficios.counters[d.doc_type] = {
          last_number: d.last_number,
          prefix: d.prefix,
          format_template: d.format_template,
        };
      });
    }
  } catch (e) { console.warn('loadDocCounters supabase error:', e); }

  // 2. Cargar Sheet ID y sincronizar con Google Sheet (fuente de verdad del equipo)
  await loadSheetConfig();
  if (oficios.sheetConnected) {
    try {
      await syncCountersFromSheet();
    } catch (e) { console.warn('Sheet sync error:', e); }
  }

  oficios.loaded = true;
}

/* ══════════════════════════════════════════
   OBTENER SIGUIENTE NÚMERO (VÍA RPC ATÓMICA)
   ══════════════════════════════════════════ */
async function getNextDocNumber(docType) {
  if (!window.session) throw new Error('Sin sesión');
  const year = new Date().getFullYear();
  const { data, error } = await sb.rpc('next_doc_number', {
    p_user_id: session.user.id,
    p_doc_type: docType,
    p_year: year,
  });
  if (error) throw error;
  if (!data || !data.length) throw new Error('Sin respuesta de next_doc_number');
  // Actualizar estado local
  if (oficios.counters[docType]) {
    oficios.counters[docType].last_number = data[0].next_number;
  }
  return { number: data[0].next_number, formatted: data[0].formatted };
}

/* ══════════════════════════════════════════
   PREVISUALIZAR NÚMERO (SIN CONSUMIR)
   ══════════════════════════════════════════ */
function previewNextNumber(docType) {
  const c = oficios.counters[docType];
  if (!c) return '—';
  const next = c.last_number + 1;
  const year = new Date().getFullYear();
  let fmt = c.format_template || '{PREFIX}-{NUM}/{YEAR}';
  fmt = fmt.replace('{PREFIX}', c.prefix);
  fmt = fmt.replace('{NUM}', String(next).padStart(3, '0'));
  fmt = fmt.replace('{YEAR}', year);
  return fmt;
}

/* ══════════════════════════════════════════
   GUARDAR DOCUMENTO GENERADO
   ══════════════════════════════════════════ */
async function saveGeneratedDoc(docType, docNumber, sequential, title, destinatario, content, metadata = {}) {
  if (!window.session) return;
  const year = new Date().getFullYear();
  const caseId = window.currentCase?.id || null;
  const { error } = await sb.from('generated_documents').insert({
    user_id: session.user.id,
    case_id: caseId,
    doc_type: docType,
    doc_number: docNumber,
    sequential: sequential,
    year: year,
    title: title,
    destinatario: destinatario,
    content: content,
    metadata: metadata,
  });
  if (error) console.warn('saveGeneratedDoc:', error);
}

/* ══════════════════════════════════════════
   CARGAR HISTORIAL DE DOCUMENTOS
   ══════════════════════════════════════════ */
async function loadDocHistory() {
  if (!window.session) return [];
  const year = new Date().getFullYear();
  const { data, error } = await sb.from('generated_documents')
    .select('id,doc_type,doc_number,sequential,title,destinatario,created_at,case_id')
    .eq('user_id', session.user.id)
    .eq('year', year)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('loadDocHistory:', error); return []; }
  oficios.history = data || [];
  return oficios.history;
}

/* ══════════════════════════════════════════
   RENDER PANEL F12
   ══════════════════════════════════════════ */
async function renderF12Panel() {
  const panel = document.getElementById('fnPanel');
  if (!panel) return;

  if (!oficios.loaded) await loadDocCounters();

  const nextOf  = previewNextNumber('oficio');
  const nextMem = previewNextNumber('memo');
  const nextRes = previewNextNumber('resolucion');

  panel.style.display = 'block';
  panel.innerHTML = `
    <div style="padding:16px;max-width:700px">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--gold),#d97706);display:flex;align-items:center;justify-content:center;font-size:18px">📨</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">Oficios, Memos y Resoluciones</div>
          <div style="font-size:12px;color:var(--text-dim)">Generación con numeración correlativa automática</div>
        </div>
      </div>

      <!-- Contadores actuales -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('oficio')" id="oficioCard_oficio">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Oficio</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_oficio">${nextOf}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('memo')" id="oficioCard_memo">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Memorándum</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_memo">${nextMem}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .2s" onclick="oficioSelectType('resolucion')" id="oficioCard_resolucion">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Resolución</div>
          <div style="font-size:20px;font-weight:700;color:var(--gold);margin:4px 0" id="oficioNext_resolucion">${nextRes}</div>
          <div style="font-size:10px;color:var(--text-dim)">Siguiente número</div>
        </div>
      </div>

      <!-- Formulario rápido -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px" id="oficioFormArea">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">📝 Datos del documento <span style="font-size:11px;color:var(--text-muted);font-weight:400">(opcional — también puedes escribir directamente en el chat)</span></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Tipo</label>
            <select id="oficioType" onchange="oficioSelectType(this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px">
              <option value="oficio">Oficio</option>
              <option value="memo">Memorándum</option>
              <option value="resolucion">Resolución</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Destinatario / A:</label>
            <input id="oficioDestinatario" type="text" placeholder="Nombre, cargo o unidad" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;box-sizing:border-box"/>
          </div>
        </div>

        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Asunto / Materia</label>
          <input id="oficioAsunto" type="text" placeholder="Ej: Notificación resultado investigación sumaria" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;box-sizing:border-box"/>
        </div>

        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:3px">Instrucciones adicionales <span style="color:var(--text-muted)">(opcional)</span></label>
          <textarea id="oficioInstrucciones" rows="2" placeholder="Ej: Tono formal, mencionar resolución exenta N°123, incluir plazo de 5 días hábiles..." style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box"></textarea>
        </div>

        <button onclick="generarOficioConFormulario()" style="width:100%;padding:8px 16px;background:var(--gold);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
          📨 Generar con número correlativo
        </button>
      </div>

      <!-- Google Sheet vinculado -->
      <div style="background:${oficios.sheetConnected?'rgba(34,197,94,.06)':'var(--surface2)'};border:1px solid ${oficios.sheetConnected?'rgba(34,197,94,.3)':'var(--border)'};border-radius:8px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:18px">${oficios.sheetConnected?'🟢':'🔗'}</span>
        <div style="flex:1;min-width:150px">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${oficios.sheetConnected?'Google Sheet conectado':'Vincular Google Sheet del equipo'}</div>
          <div style="font-size:10px;color:var(--text-dim)">${oficios.sheetConnected?'Los correlativos se sincronizan con el Sheet compartido':'Conecta el Sheet donde el equipo lleva los correlativos'}</div>
        </div>
        ${oficios.sheetConnected
          ?'<button onclick="oficioDisconnectSheet()" style="padding:4px 10px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;font-size:10px;cursor:pointer">Desvincular</button>'
          :'<button onclick="oficioConnectSheet()" style="padding:5px 12px;background:#4285f4;color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">Conectar Sheet</button>'
        }
      </div>

      <!-- Configuración de formato -->
      <details style="margin-bottom:12px">
        <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none">⚙️ Configurar formato de numeración</summary>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
            ${['oficio','memo','resolucion'].map(t => {
              const c = oficios.counters[t] || {};
              return `<div>
                <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">${t.charAt(0).toUpperCase()+t.slice(1)} — Prefijo</label>
                <input id="oficioPrefix_${t}" value="${c.prefix||''}" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:11px;box-sizing:border-box"/>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-bottom:8px">
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px">Plantilla de formato</label>
            <select id="oficioFormatTemplate" style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:3px;background:var(--surface);color:var(--text);font-size:11px" onchange="oficioPreviewFormats()">
              <option value="{PREFIX}-{NUM}/{YEAR}">{PREFIX}-001/2026</option>
              <option value="{NUM}-{YEAR}-{PREFIX}">001-2026-{PREFIX}</option>
              <option value="{PREFIX} N° {NUM}/{YEAR}">{PREFIX} N° 001/2026</option>
              <option value="{PREFIX} {NUM}/{YEAR}">{PREFIX} 001/2026</option>
            </select>
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px" id="oficioFormatPreview">Vista previa: ${nextOf}</div>
          <button onclick="saveDocFormats()" style="padding:5px 14px;background:var(--gold);color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">Guardar formato</button>
        </div>
      </details>

      <!-- Historial de documentos -->
      <details>
        <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none" onclick="oficioLoadHistory()">📋 Historial de documentos generados</summary>
        <div id="oficioHistoryList" style="margin-top:8px;max-height:250px;overflow-y:auto">
          <div style="font-size:11px;color:var(--text-muted);padding:8px">Cargando...</div>
        </div>
      </details>
    </div>
  `;

  // Marcar tipo activo
  oficioSelectType(oficios.currentType || 'oficio');
}

/* ══════════════════════════════════════════
   CONECTAR / DESVINCULAR GOOGLE SHEET
   ══════════════════════════════════════════ */
window.oficioConnectSheet = async function() {
  const url = prompt(
    '📊 Pega la URL del Google Sheet donde el equipo lleva los correlativos.\n\n' +
    'El Sheet debe tener 3 hojas llamadas: "Oficios", "Memos", "Resoluciones"\n' +
    'con las mismas columnas que usan actualmente.\n\n' +
    'IMPORTANTE: El Sheet debe estar compartido con la Service Account de Google.'
  );
  if (!url) return;

  // Extraer el spreadsheet ID de la URL
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    showToast('⚠️ URL no válida. Debe ser una URL de Google Sheets.');
    return;
  }
  const sheetId = match[1];

  // Verificar acceso
  showToast('🔍 Verificando acceso al Sheet...');
  try {
    const info = await callSheets({ action: 'info', spreadsheetId: sheetId });
    if (!info.ok) {
      showToast('⚠️ No se puede acceder al Sheet. ¿Está compartido con la Service Account?');
      return;
    }

    // Verificar que tenga las hojas correctas
    const sheetNames = (info.sheets || []).map(s => s.name.toLowerCase());
    const required = ['oficios', 'memos', 'resoluciones'];
    const missing = required.filter(r => !sheetNames.some(s => s.includes(r)));

    if (missing.length > 0) {
      const proceed = confirm(
        `El Sheet "${info.title}" no tiene las hojas: ${missing.join(', ')}.\n\n` +
        `Hojas encontradas: ${(info.sheets || []).map(s => s.name).join(', ')}\n\n` +
        `¿Quieres vincularlo de todos modos? (puedes crear las hojas después)`
      );
      if (!proceed) return;

      // Mapear nombres reales a la configuración
      if (info.sheets) {
        info.sheets.forEach(s => {
          const name = s.name.toLowerCase();
          if (name.includes('oficio'))      SHEET_CONFIG.oficio.sheetName = s.name;
          if (name.includes('memo'))        SHEET_CONFIG.memo.sheetName = s.name;
          if (name.includes('resol'))       SHEET_CONFIG.resolucion.sheetName = s.name;
        });
      }
    } else {
      // Mapear nombres exactos
      (info.sheets || []).forEach(s => {
        const name = s.name.toLowerCase();
        if (name.includes('oficio'))      SHEET_CONFIG.oficio.sheetName = s.name;
        if (name.includes('memo'))        SHEET_CONFIG.memo.sheetName = s.name;
        if (name.includes('resol'))       SHEET_CONFIG.resolucion.sheetName = s.name;
      });
    }

    // Guardar
    await saveSheetConfig(sheetId);
    showToast(`✓ Sheet "${info.title}" vinculado correctamente`);

    // Sincronizar contadores
    await syncCountersFromSheet();

    // Re-renderizar panel
    renderF12Panel();

  } catch (e) {
    console.error('oficioConnectSheet:', e);
    showToast('⚠️ Error conectando: ' + e.message);
  }
};

window.oficioDisconnectSheet = async function() {
  if (!confirm('¿Desvincular el Google Sheet? Los correlativos seguirán funcionando desde Supabase.')) return;
  await saveSheetConfig('');
  oficios.sheetConnected = false;
  oficios.sheetId = null;
  showToast('✓ Sheet desvinculado');
  renderF12Panel();
};

/* ══════════════════════════════════════════
   SELECCIONAR TIPO DE DOCUMENTO
   ══════════════════════════════════════════ */
window.oficioSelectType = function(type) {
  oficios.currentType = type;
  ['oficio','memo','resolucion'].forEach(t => {
    const card = document.getElementById('oficioCard_' + t);
    if (card) {
      card.style.borderColor = t === type ? 'var(--gold)' : 'var(--border)';
      card.style.background = t === type ? 'var(--gold-glow, rgba(217,119,6,.08))' : 'var(--surface2)';
    }
  });
  const sel = document.getElementById('oficioType');
  if (sel) sel.value = type;
};

/* ══════════════════════════════════════════
   GENERAR DOCUMENTO DESDE FORMULARIO
   ══════════════════════════════════════════ */
window.generarOficioConFormulario = function() {
  const type = document.getElementById('oficioType')?.value || 'oficio';
  const dest = document.getElementById('oficioDestinatario')?.value.trim() || '';
  const asunto = document.getElementById('oficioAsunto')?.value.trim() || '';
  const instrucciones = document.getElementById('oficioInstrucciones')?.value.trim() || '';

  if (!asunto) {
    showToast('⚠️ Ingresa al menos el asunto del documento');
    return;
  }

  const tipoLabel = { oficio: 'oficio', memo: 'memorándum', resolucion: 'resolución' }[type] || type;
  const nextNum = previewNextNumber(type);

  let prompt = `Genera un ${tipoLabel} con número correlativo ${nextNum}.`;
  if (dest) prompt += `\nDestinatario: ${dest}`;
  prompt += `\nAsunto/Materia: ${asunto}`;
  if (instrucciones) prompt += `\nInstrucciones adicionales: ${instrucciones}`;
  if (window.currentCase) prompt += `\nExpediente vinculado: ${currentCase.name} (${currentCase.materia || '—'})`;

  const inputBox = document.getElementById('inputBox');
  if (inputBox) {
    inputBox.value = prompt;
    sendMessage();
  }
};

/* ══════════════════════════════════════════
   PREVISUALIZAR FORMATOS
   ══════════════════════════════════════════ */
window.oficioPreviewFormats = function() {
  const tpl = document.getElementById('oficioFormatTemplate')?.value || '{PREFIX}-{NUM}/{YEAR}';
  const year = new Date().getFullYear();
  const preview = document.getElementById('oficioFormatPreview');
  if (!preview) return;

  const examples = ['oficio','memo','resolucion'].map(t => {
    const c = oficios.counters[t] || {};
    const pfx = document.getElementById('oficioPrefix_' + t)?.value || c.prefix || t.toUpperCase().slice(0,3);
    let f = tpl.replace('{PREFIX}', pfx).replace('{NUM}', '001').replace('{YEAR}', year);
    return f;
  });
  preview.textContent = 'Vista previa: ' + examples.join(' · ');
};

/* ══════════════════════════════════════════
   GUARDAR CONFIGURACIÓN DE FORMATOS
   ══════════════════════════════════════════ */
window.saveDocFormats = async function() {
  if (!window.session) return;
  const tpl = document.getElementById('oficioFormatTemplate')?.value || '{PREFIX}-{NUM}/{YEAR}';
  const year = new Date().getFullYear();

  for (const t of ['oficio','memo','resolucion']) {
    const pfx = document.getElementById('oficioPrefix_' + t)?.value.trim() || oficios.counters[t]?.prefix || '';
    const { error } = await sb.from('document_counters').upsert({
      user_id: session.user.id,
      doc_type: t,
      year: year,
      last_number: oficios.counters[t]?.last_number || 0,
      prefix: pfx,
      format_template: tpl,
    }, { onConflict: 'user_id,doc_type,year' });
    if (error) { console.warn('saveDocFormats:', error); showToast('⚠️ Error guardando formato'); return; }
    oficios.counters[t] = { ...oficios.counters[t], prefix: pfx, format_template: tpl };
  }
  showToast('✓ Formato de numeración guardado');

  // Actualizar previews
  ['oficio','memo','resolucion'].forEach(t => {
    const el = document.getElementById('oficioNext_' + t);
    if (el) el.textContent = previewNextNumber(t);
  });
};

/* ══════════════════════════════════════════
   CARGAR Y RENDERIZAR HISTORIAL
   ══════════════════════════════════════════ */
window.oficioLoadHistory = async function() {
  const container = document.getElementById('oficioHistoryList');
  if (!container) return;
  container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px">Cargando...</div>';

  const history = await loadDocHistory();
  if (!history.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px">No hay documentos generados este año.</div>';
    return;
  }

  const typeIcons = { oficio: '📨', memo: '📋', resolucion: '📜' };
  container.innerHTML = history.map(d => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px">
      <span>${typeIcons[d.doc_type] || '📄'}</span>
      <span style="font-weight:600;color:var(--gold);min-width:90px">${d.doc_number}</span>
      <span style="color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.title || '(sin título)'}</span>
      <span style="color:var(--text-muted);font-size:10px;white-space:nowrap">${new Date(d.created_at).toLocaleDateString('es-CL')}</span>
    </div>
  `).join('');
};

/* ══════════════════════════════════════════
   ASIGNAR NÚMERO AL DOCUMENTO (POST-GENERACIÓN)
   — Llamada desde sendMessage cuando el IA genera un oficio/memo/res
   ══════════════════════════════════════════ */
window.assignDocNumber = async function(docType, title, destinatario, content) {
  try {
    const { number, formatted } = await getNextDocNumber(docType);
    await saveGeneratedDoc(docType, formatted, number, title, destinatario, content);

    // Escribir en Google Sheet del equipo
    if (oficios.sheetConnected) {
      const fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const fiscal = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || '—';
      const cfg = SHEET_CONFIG[docType];

      let rowData;
      if (docType === 'resolucion') {
        // Resoluciones tienen 6 columnas: Fecha, N°, Destinatario, Tema, Expediente, Fiscal
        const expediente = window.currentCase?.nueva_resolucion || window.currentCase?.name || '';
        rowData = [fecha, number, destinatario, title, expediente, fiscal];
      } else {
        // Oficios y Memos: Fecha, Nº, Destino, Referencia, Fiscal
        rowData = [fecha, number, destinatario, title, fiscal];
      }

      // Re-leer el sheet antes de escribir (por si alguien más agregó filas)
      await readSheetTab(docType);
      const written = await writeToSheet(docType, rowData);
      if (written) {
        showToast(`✓ ${formatted} registrado en Supabase y Google Sheet`);
      } else {
        showToast(`✓ ${formatted} registrado en Supabase (Sheet no disponible)`);
      }
    } else {
      showToast(`✓ Documento ${formatted} registrado`);
    }

    // Actualizar UI
    const el = document.getElementById('oficioNext_' + docType);
    if (el) el.textContent = previewNextNumber(docType);

    return { number, formatted };
  } catch (e) {
    console.warn('assignDocNumber error:', e);
    showToast('⚠️ Error asignando número correlativo');
    return null;
  }
};

/* ══════════════════════════════════════════
   EXPORT A WORD — OFICIO / MEMO / RESOLUCIÓN
   ══════════════════════════════════════════ */
window.exportOficioToWord = async function(buttonEl) {
  const msgBub = buttonEl?.closest('.msg')?.querySelector('.msg-bub');
  if (!msgBub) { showToast('⚠ No se encontró el texto'); return; }
  const text = msgBub.innerText;
  if (!text || text.length < 30) { showToast('⚠ Texto muy corto para exportar'); return; }

  showToast('📄 Generando Word…');

  try {
    // Lazy load docx
    const DOCX_CDN = "https://unpkg.com/docx@9.0.2/build/index.umd.js";
    if (!window.docx) {
      await new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${DOCX_CDN}"]`)) {
          const check = () => window.docx ? resolve() : setTimeout(check, 100);
          check(); return;
        }
        const s = document.createElement('script');
        s.src = DOCX_CDN;
        s.onload = () => { const c = () => window.docx ? resolve() : setTimeout(c, 100); c(); };
        s.onerror = () => reject(new Error('No se pudo cargar docx'));
        document.head.appendChild(s);
      });
    }

    const D = window.docx;
    const { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber, ImageRun } = D;

    // Detect doc type from content
    const isOficio = /oficio|OF-\d/i.test(text.substring(0, 200));
    const isMemo = /memor[aá]nd|MEMO-\d/i.test(text.substring(0, 200));
    const isResolucion = /resoluci[oó]n|RES-\d|RESUELVO|CONSIDERANDO/i.test(text.substring(0, 500));

    const docTitle = isOficio ? 'Oficio' : isMemo ? 'Memorándum' : isResolucion ? 'Resolución' : 'Documento';

    // Parse text into paragraphs
    const lines = text.split('\n').filter(l => l.trim());
    const children = [];

    // Add institutional header
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60, line: 276 },
      children: [new TextRun({ text: 'UNIVERSIDAD DE MAGALLANES', bold: true, font: 'Arial', size: 24, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, line: 276 },
      children: [new TextRun({ text: 'Fiscalía de Procesos Disciplinarios', font: 'Arial', size: 20, color: '444444', italics: true })],
    }));

    // Separator line
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', font: 'Arial', size: 16, color: 'B8860B' })],
    }));

    // Process body lines
    lines.forEach(line => {
      const trimmed = line.trim();
      // Headers (all caps or bold markers)
      const isHeader = /^(OFICIO|MEMORÁNDUM|MEMORANDUM|RESOLUCIÓN|RESOLUCION|DE:|PARA:|A:|MAT\.?:|MATERIA:|REF\.?:|REFERENCIA:|FECHA:|ANT\.?:|ANTECEDENTES:|DISTRIBUCIÓN:|VISTOS?:|CONSIDERANDO|POR TANTO|RESUELVO|ANÓTESE|COMUNÍQUESE)/i.test(trimmed);

      if (isHeader) {
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 180, after: 80, line: 360 },
          children: [new TextRun({ text: trimmed, bold: true, font: 'Arial', size: 22, color: '000000' })],
        }));
      } else {
        // Check for field patterns like "DE: xxx" or "PARA: xxx"
        const fieldMatch = trimmed.match(/^(DE|PARA|A|MAT|MATERIA|REF|REFERENCIA|FECHA|ANT|ANTECEDENTES)\s*[:.]\s*(.*)/i);
        if (fieldMatch) {
          children.push(new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 60, after: 60, line: 360 },
            children: [
              new TextRun({ text: fieldMatch[1].toUpperCase() + ': ', bold: true, font: 'Arial', size: 22, color: '000000' }),
              new TextRun({ text: fieldMatch[2], font: 'Arial', size: 22, color: '000000' }),
            ],
          }));
        } else {
          // Normal paragraph
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 0, after: 120, line: 360 },
            indent: { firstLine: 720 },
            children: [new TextRun({ text: trimmed, font: 'Arial', size: 22, color: '000000' })],
          }));
        }
      }
    });

    // Signature block
    children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 0 },
      children: [new TextRun({ text: '________________________________________', font: 'Arial', size: 22, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'Fiscal/a Investigador/a', bold: true, font: 'Arial', size: 22, color: '000000' })],
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: 'Universidad de Magallanes', font: 'Arial', size: 20, color: '444444' })],
    }));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 18720 },
            margin: { top: 1440, bottom: 1440, left: 1701, right: 1701 },
          },
        },
        children: children,
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'Página ', font: 'Arial', size: 16, color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: '999999' }),
              ],
            })],
          }),
        },
      }],
    });

    const blob = await Packer.toBlob(doc);
    const filename = `${docTitle}_${new Date().toISOString().slice(0,10)}.docx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast('✓ ' + filename + ' descargado');

  } catch (e) {
    console.error('exportOficioToWord:', e);
    showToast('⚠️ Error generando Word: ' + e.message);
  }
};

/* ══════════════════════════════════════════
   CHIPS F12
   ══════════════════════════════════════════ */
window.buildF12Chips = function() {
  const row = document.getElementById('fnChipsRow');
  if (!row) return;
  const chips = [
    'Oficio de notificación',
    'Memo interno',
    'Oficio remisorio de antecedentes',
    'Resolución exenta',
    'Oficio a Contraloría',
    'Comunicación de resultado',
    'Memo citación a declarar',
  ];
  row.innerHTML = chips.map(c => `<button class="fn-chip" onclick="setFnQuery('${c}')">${c}</button>`).join('');
};

/* ══════════════════════════════════════════
   ASIGNAR NÚMERO + EXPORTAR A WORD (COMBINADO)
   ══════════════════════════════════════════ */
window.oficioAssignAndExport = async function(buttonEl) {
  const msgBub = buttonEl?.closest('.msg')?.querySelector('.msg-bub');
  if (!msgBub) { showToast('⚠ No se encontró el texto'); return; }
  const text = msgBub.innerText;
  if (!text || text.length < 30) { showToast('⚠ Texto muy corto'); return; }

  // Detectar tipo de documento
  let detectedType = 'oficio';
  if (/memor[aá]nd|MEMO/i.test(text.substring(0, 300))) detectedType = 'memo';
  else if (/resoluci[oó]n|RESUELVO|CONSIDERANDO/i.test(text.substring(0, 500))) detectedType = 'resolucion';

  // Si el usuario tiene un tipo seleccionado en el formulario, usarlo
  const formType = document.getElementById('oficioType')?.value;
  if (formType) detectedType = formType;

  buttonEl.disabled = true;
  buttonEl.textContent = '⏳ Asignando…';

  try {
    // 1. Asignar número correlativo
    const result = await assignDocNumber(
      detectedType,
      document.getElementById('oficioAsunto')?.value || text.substring(0, 100).replace(/\n/g, ' '),
      document.getElementById('oficioDestinatario')?.value || '',
      text
    );

    if (result) {
      // 2. Actualizar el texto del mensaje con el número real (reemplazar placeholder)
      const numPattern = /(?:OF|MEMO|RES)-\d{3}\/\d{4}/;
      if (numPattern.test(msgBub.innerText)) {
        // Ya tiene un número placeholder — no reemplazar para no perder formato
      }
      // Mostrar badge con el número asignado
      const badge = document.createElement('div');
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--gold);color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px';
      badge.textContent = '✓ ' + result.formatted;
      msgBub.appendChild(badge);
    }

    // 3. Exportar a Word
    await exportOficioToWord(buttonEl);

    buttonEl.textContent = '✓ Listo';
    buttonEl.style.background = 'var(--green, #22c55e)';
  } catch (e) {
    console.error('oficioAssignAndExport:', e);
    showToast('⚠️ Error: ' + e.message);
    buttonEl.textContent = '📨 Asignar N° y Word';
    buttonEl.disabled = false;
  }
};

/* ══════════════════════════════════════════
   EXPONER FUNCIONES
   ══════════════════════════════════════════ */
window.renderF12Panel = renderF12Panel;
window.loadDocCounters = loadDocCounters;
window.previewNextNumber = previewNextNumber;

})();
