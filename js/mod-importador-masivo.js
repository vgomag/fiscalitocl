/**
 * MOD-IMPORTADOR-MASIVO.JS — Importación masiva de casos desde CSV/Excel
 * ─────────────────────────────────────────────────────────────────────
 * Permite cargar múltiples casos a Supabase desde un archivo CSV o Excel.
 * Incluye:
 *   - Parseo de CSV con detección de delimitador
 *   - Mapeo de columnas a campos de la BD
 *   - Preview antes de importar
 *   - Validación de datos
 *   - Importación en lotes con progreso
 *   - Log de errores
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-importador';
  const VIEW_ID = 'viewImportador';
  const BATCH_SIZE = 10;

  /* ── Campos de la tabla cases ── */
  const CASE_FIELDS = [
    { key:'name', label:'Nombre / ROL', required:true },
    { key:'nueva_resolucion', label:'Resolución instructora' },
    { key:'caratula', label:'Carátula' },
    { key:'status', label:'Estado (active/terminado)' },
    { key:'tipo_procedimiento', label:'Tipo procedimiento' },
    { key:'materia', label:'Materia' },
    { key:'protocolo', label:'Protocolo' },
    { key:'fecha_denuncia', label:'Fecha denuncia' },
    { key:'fecha_resolucion', label:'Fecha resolución' },
    { key:'fecha_recepcion_fiscalia', label:'Fecha recepción fiscalía' },
    { key:'fecha_vista', label:'Fecha vista' },
    { key:'denunciantes', label:'Denunciante(s)' },
    { key:'denunciados', label:'Denunciado/a(s)' },
    { key:'estamentos_denunciante', label:'Estamento denunciante' },
    { key:'estamentos_denunciado', label:'Estamento denunciado' },
    { key:'carrera_denunciante', label:'Carrera denunciante' },
    { key:'carrera_denunciado', label:'Carrera denunciado' },
    { key:'resultado', label:'Resultado' },
    { key:'observaciones', label:'Observaciones' },
    { key:'resolucion_termino', label:'Resolución de término' },
    { key:'fecha_resolucion_termino', label:'Fecha res. término' }
  ];

  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let parsedRows = [];
  let columnMapping = {};
  let csvHeaders = [];
  let importLog = [];

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .imp-container { padding:20px; max-width:1000px; margin:0 auto; }
      .imp-drop { border:2px dashed var(--border2); border-radius:var(--radius); padding:40px; text-align:center; cursor:pointer; transition:all .2s; background:var(--surface2); margin-bottom:16px; }
      .imp-drop:hover, .imp-drop.dragover { border-color:var(--gold); background:rgba(79,70,229,.04); }
      .imp-drop .icon { font-size:32px; margin-bottom:8px; }
      .imp-drop .hint { font-size:12px; color:var(--text-muted); }
      .imp-mapping { display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:center; margin-bottom:16px; }
      .imp-mapping .arrow { color:var(--text-muted); font-size:14px; }
      .imp-select { background:var(--surface2); border:1px solid var(--border2); color:var(--text); padding:6px 10px; border-radius:var(--radius); font-size:12px; width:100%; font-family:var(--font-body); }
      .imp-preview { overflow-x:auto; margin-bottom:16px; border:1px solid var(--border); border-radius:var(--radius); }
      .imp-preview table { width:100%; border-collapse:collapse; font-size:11px; }
      .imp-preview th { background:var(--surface2); padding:6px 10px; text-align:left; font-weight:600; border-bottom:1px solid var(--border); white-space:nowrap; }
      .imp-preview td { padding:5px 10px; border-bottom:1px solid var(--border); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .imp-progress { margin:16px 0; }
      .imp-progress-bar { height:10px; border-radius:5px; background:var(--border); overflow:hidden; }
      .imp-progress-fill { height:100%; border-radius:5px; background:var(--gold); transition:width .3s; }
      .imp-log { max-height:200px; overflow-y:auto; font-size:11px; font-family:var(--font-mono); background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:10px; margin-top:10px; }
      .imp-log .ok { color:var(--green); }
      .imp-log .err { color:var(--red); }
      .imp-btn { background:var(--gold); color:#fff; border:none; padding:10px 24px; border-radius:var(--radius); font-size:13px; cursor:pointer; font-family:var(--font-body); transition:opacity .15s; }
      .imp-btn:hover { opacity:.85; }
      .imp-btn:disabled { opacity:.5; cursor:not-allowed; }
      .imp-btn-secondary { background:transparent; color:var(--gold); border:1px solid var(--gold); }
      .imp-step { display:none; }
      .imp-step.active { display:block; }
    `;
    document.head.appendChild(s);
  }

  /* ── Parsear CSV ── */
  function parseCSV(text){
    // Detectar delimitador
    const firstLine = text.split('\n')[0];
    const delim = (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ',';

    const lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length>0; });
    if(lines.length < 2) return { headers:[], rows:[] };

    function splitLine(line){
      const result = [];
      let current = '';
      let inQuote = false;
      for(let i=0; i<line.length; i++){
        const ch = line[i];
        if(ch==='"'){ inQuote = !inQuote; }
        else if(ch===delim && !inQuote){ result.push(current.trim()); current=''; }
        else { current += ch; }
      }
      result.push(current.trim());
      return result;
    }

    const headers = splitLine(lines[0]);
    const rows = [];
    for(let i=1; i<lines.length; i++){
      const vals = splitLine(lines[i]);
      const row = {};
      headers.forEach(function(h,j){ row[h] = vals[j]||''; });
      rows.push(row);
    }
    return { headers:headers, rows:rows };
  }

  /* ── Crear vista ── */
  function createView(){
    if(document.getElementById(VIEW_ID)) return;
    const main = document.querySelector('.main-content') || document.querySelector('main');
    if(!main) return;
    const div = document.createElement('div');
    div.className = 'view';
    div.id = VIEW_ID;
    div.style.display = 'none';
    main.appendChild(div);
  }

  /* ── Step 1: Carga de archivo ── */
  function renderStep1(){
    const el = document.getElementById(VIEW_ID);
    if(!el) return;

    el.innerHTML = `<div class="imp-container">
      <h2 style="font-family:var(--font-serif);font-size:20px;margin:0 0 4px">📥 Importador Masivo de Casos</h2>
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px">Cargue un archivo CSV para importar múltiples casos a la base de datos</p>

      <div class="imp-drop" id="impDrop" onclick="document.getElementById('impFileInput').click()">
        <div class="icon">📄</div>
        <div style="font-size:14px;font-weight:500;margin-bottom:4px">Arrastre un CSV aquí o haga clic</div>
        <div class="hint">Formatos aceptados: .csv (UTF-8, separado por coma o punto y coma)</div>
        <input type="file" id="impFileInput" accept=".csv,.txt" style="display:none" onchange="window._importador.handleFile(this.files[0])">
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;font-size:12px;line-height:1.7">
        <strong>Formato esperado:</strong><br>
        La primera fila debe contener los encabezados. Campos recomendados:<br>
        <code style="font-family:var(--font-mono);font-size:11px;color:var(--gold)">Nombre,Resolución,Tipo,Materia,Fecha Denuncia,Denunciante,Denunciado,Estamento Dte,Estamento Ddo</code><br>
        <br>
        <strong>Tip:</strong> Puede exportar desde Excel a CSV con "Guardar como > CSV UTF-8"
      </div>
    </div>`;

    // Drag & drop
    const drop = document.getElementById('impDrop');
    if(drop){
      drop.ondragover = function(e){ e.preventDefault(); drop.classList.add('dragover'); };
      drop.ondragleave = function(){ drop.classList.remove('dragover'); };
      drop.ondrop = function(e){ e.preventDefault(); drop.classList.remove('dragover'); if(e.dataTransfer.files.length) window._importador.handleFile(e.dataTransfer.files[0]); };
    }
  }

  /* ── Leer archivo ── */
  function handleFile(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      const text = e.target.result;
      const parsed = parseCSV(text);
      if(!parsed.headers.length || !parsed.rows.length){
        if(typeof showToast==='function') showToast('Archivo vacío o formato inválido','error');
        return;
      }
      csvHeaders = parsed.headers;
      parsedRows = parsed.rows;
      autoMapColumns();
      renderStep2();
    };
    reader.readAsText(file, 'UTF-8');
  }

  /* ── Auto-mapear columnas por similitud ── */
  function autoMapColumns(){
    columnMapping = {};
    const normalize = function(s){ return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); };
    const synonyms = {
      name:['nombre','rol','caso','expediente','nro','numero'],
      nueva_resolucion:['resolucion','res','resinstructora'],
      tipo_procedimiento:['tipo','procedimiento','tipoprocedimiento'],
      materia:['materia'],
      fecha_denuncia:['fechadenuncia','denuncia','fechainicio'],
      fecha_resolucion:['fecharesolucion','fecharesol'],
      denunciantes:['denunciante','denunciantes','dte'],
      denunciados:['denunciado','denunciados','ddo'],
      estamentos_denunciante:['estamentodte','estamentodenunciante','estdte'],
      estamentos_denunciado:['estamentoddo','estamentodenunciado','estddo'],
      protocolo:['protocolo','proto'],
      resultado:['resultado','resolucionfinal'],
      status:['estado','status'],
      observaciones:['observaciones','obs','notas'],
      caratula:['caratula'],
      fecha_recepcion_fiscalia:['fecharecepcion','recepcionfiscalia'],
      fecha_vista:['fechavista','vista'],
      carrera_denunciante:['carreradte','carreradenunciante'],
      carrera_denunciado:['carreraddo','carreradenunciado']
    };

    csvHeaders.forEach(function(h){
      const nh = normalize(h);
      Object.entries(synonyms).forEach(function(kv){
        if(columnMapping[kv[0]]) return; // ya mapeado
        if(kv[1].some(function(syn){ return nh.includes(syn) || syn.includes(nh); })){
          columnMapping[kv[0]] = h;
        }
      });
    });
  }

  /* ── Step 2: Mapeo y preview ── */
  function renderStep2(){
    const el = document.getElementById(VIEW_ID);
    if(!el) return;

    let html = `<div class="imp-container">
      <h2 style="font-family:var(--font-serif);font-size:20px;margin:0 0 4px">📥 Mapeo de columnas</h2>
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px">${parsedRows.length} filas detectadas. Asigne cada columna del CSV al campo correspondiente.</p>

      <div style="margin-bottom:16px">`;

    CASE_FIELDS.forEach(function(cf){
      const mapped = columnMapping[cf.key] || '';
      html += `<div style="display:grid;grid-template-columns:180px 24px 1fr;gap:8px;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;${cf.required?'font-weight:600':'color:var(--text-dim)'}">${escH(cf.label)}${cf.required?' *':''}</span>
        <span style="color:var(--text-muted);text-align:center">→</span>
        <select class="imp-select" data-field="${cf.key}" onchange="window._importador.updateMapping('${cf.key}',this.value)">
          <option value="">— No mapear —</option>`;
      csvHeaders.forEach(function(h){
        html += '<option value="'+escH(h)+'"'+(mapped===h?' selected':'')+'>'+escH(h)+'</option>';
      });
      html += '</select></div>';
    });

    html += `</div>

      <h3 style="font-family:var(--font-serif);font-size:14px;margin:0 0 8px">Vista previa (primeras 5 filas)</h3>
      <div class="imp-preview"><table><thead><tr>`;

    // Headers del preview = campos mapeados
    const mappedFields = CASE_FIELDS.filter(function(cf){ return !!columnMapping[cf.key]; });
    mappedFields.forEach(function(cf){
      html += '<th>'+escH(cf.label)+'</th>';
    });
    html += '</tr></thead><tbody>';

    parsedRows.slice(0,5).forEach(function(row){
      html += '<tr>';
      mappedFields.forEach(function(cf){
        const csvCol = columnMapping[cf.key];
        html += '<td>'+escH(row[csvCol]||'')+'</td>';
      });
      html += '</tr>';
    });

    html += `</tbody></table></div>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="imp-btn imp-btn-secondary" onclick="window._importador.goStep1()">← Volver</button>
        <button class="imp-btn" onclick="window._importador.startImport()" id="impStartBtn">Importar ${parsedRows.length} caso(s)</button>
      </div>
    </div>`;

    el.innerHTML = html;
  }

  /* ── Actualizar mapeo ── */
  function updateMapping(field, csvCol){
    if(csvCol) columnMapping[field] = csvCol;
    else delete columnMapping[field];
  }

  /* ── Step 3: Importación ── */
  async function startImport(){
    if(!columnMapping.name){
      if(typeof showToast==='function') showToast('Debe mapear al menos el campo "Nombre / ROL"','error');
      return;
    }

    const el = document.getElementById(VIEW_ID);
    if(!el) return;
    const userId = typeof session!=='undefined' && session?.user?.id ? session.user.id : null;
    if(!userId){
      if(typeof showToast==='function') showToast('Sesión no válida','error');
      return;
    }

    importLog = [];
    let imported = 0;
    let errors = 0;
    const total = parsedRows.length;

    el.innerHTML = `<div class="imp-container">
      <h2 style="font-family:var(--font-serif);font-size:20px;margin:0 0 4px">📥 Importando…</h2>
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px" id="impStatus">0 de ${total} casos procesados</p>
      <div class="imp-progress"><div class="imp-progress-bar"><div class="imp-progress-fill" id="impProgressFill" style="width:0%"></div></div></div>
      <div class="imp-log" id="impLog"></div>
    </div>`;

    for(let i=0; i<parsedRows.length; i++){
      const row = parsedRows[i];
      const caseData = { user_id: userId, status: 'active' };

      CASE_FIELDS.forEach(function(cf){
        const csvCol = columnMapping[cf.key];
        if(!csvCol) return;
        let val = row[csvCol];
        if(val === undefined || val === null || val === '') return;

        // Transformaciones
        if(cf.key.includes('denunciantes') || cf.key.includes('denunciados') || cf.key.includes('estamentos')){
          // Intentar parsear como array
          val = String(val); /* Asegurar que es string antes de .includes() */
          if(val.includes(';')) val = val.split(';').map(function(s){return s.trim();});
          else if(val.includes(',') && !val.match(/^\d/)) val = val.split(',').map(function(s){return s.trim();});
          else val = [val];
        }
        caseData[cf.key] = val;
      });

      if(!caseData.name){
        importLog.push({ ok:false, msg:'Fila '+(i+1)+': Sin nombre, omitida' });
        errors++;
        continue;
      }

      try {
        /* BUG-FIX 2026-04-23: cases.id es NOT NULL sin DEFAULT, generamos UUID en cliente */
        if(!caseData.id){
          caseData.id = (typeof crypto!=='undefined' && crypto.randomUUID) ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
        }
        const { error } = await sb.from('cases').insert(caseData);
        if(error) throw error;
        imported++;
        importLog.push({ ok:true, msg:'Fila '+(i+1)+': "'+caseData.name+'" importado ✓' });
      } catch(err){
        errors++;
        importLog.push({ ok:false, msg:'Fila '+(i+1)+': "'+caseData.name+'" — '+err.message });
      }

      // Actualizar progreso
      const pct = Math.round(((i+1)/total)*100);
      const fill = document.getElementById('impProgressFill');
      const status = document.getElementById('impStatus');
      const log = document.getElementById('impLog');
      if(fill) fill.style.width = pct+'%';
      if(status) status.textContent = (i+1)+' de '+total+' casos procesados';
      if(log){
        log.innerHTML = importLog.map(function(l){
          return '<div class="'+(l.ok?'ok':'err')+'">'+escH(l.msg)+'</div>';
        }).join('');
        log.scrollTop = log.scrollHeight;
      }
    }

    // Resultado final
    const finalStatus = document.getElementById('impStatus');
    if(finalStatus){
      finalStatus.innerHTML = '<span style="color:var(--green);font-weight:600">✅ '+imported+' importados</span>' +
        (errors ? ' · <span style="color:var(--red)">❌ '+errors+' errores</span>' : '');
    }

    // Recargar lista de casos
    if(imported > 0 && typeof loadCases === 'function'){
      setTimeout(loadCases, 500);
    }
    if(imported > 0 && typeof showToast === 'function'){
      showToast(imported+' caso(s) importado(s) exitosamente','success');
    }
  }

  /* ── Sidebar nav ── */
  function addSidebarItem(){
    const nav = document.querySelector('.sidebar-nav');
    if(!nav || document.getElementById('navImportador')) return;
    const item = document.createElement('div');
    item.id = 'navImportador';
    item.className = 'sidebar-nav-item';
    item.innerHTML = '<span style="margin-right:6px">📥</span>Importar Casos';
    item.onclick = function(){
      if(typeof showView === 'function') showView(VIEW_ID);
      renderStep1();
      document.querySelectorAll('.sidebar-nav-item').forEach(function(n){ n.classList.remove('active'); });
      item.classList.add('active');
    };
    nav.appendChild(item);
  }

  /* ── API pública ── */
  window._importador = {
    handleFile: handleFile,
    updateMapping: updateMapping,
    startImport: startImport,
    goStep1: renderStep1,
    open: function(){ if(typeof showView==='function') showView(VIEW_ID); renderStep1(); }
  };

  /* ── Init ── */
  function init(){
    createView();
    addSidebarItem();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
