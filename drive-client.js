/* Fiscalito — Drive Client v6 + Tab Auto-Loader + Contexto IA + CRUD completo */

/* Helper global: extraer folder ID de una URL de Drive */
function extractFolderIdFromUrl(url) {
  if (!url) return null;
  var m = String(url).match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

(function() {

  const TAB_LOADERS = {
    tabDiligencias:   'loadDiligencias',
    tabCronologia:    'loadCronologia',
    tabEtapas:        'loadEtapas',
    tabAcciones:      'loadAcciones',
    tabResoluciones:  'loadResoluciones',
    tabChecklist:     'loadChecklist',
    tabParticipantes: 'loadParticipantes',
    tabNotas:         'loadNotas',
    tabModelos:       'loadModelos',
    tabDrive:         'loadDriveTab'
  };

  window._caseContextCache = {};

  function installPatches() {
    if (typeof pickCaseById === 'function') {
      var _orig = pickCaseById;
      window.pickCaseById = async function(id) {
        /* Buscar caso en _casesMap O en allCases (fallback principal) */
        if (id) {
          if (window._casesMap && window._casesMap[id]) {
            window._currentDriveCase = window._casesMap[id];
          } else if (typeof allCases !== 'undefined' && Array.isArray(allCases)) {
            var found = allCases.find(function(c) { return c.id === id; });
            if (found) window._currentDriveCase = found;
          }
          /* Asegurar que drive_folder_id esté presente si tenemos drive_folder_url */
          if (window._currentDriveCase && !window._currentDriveCase.drive_folder_id && window._currentDriveCase.drive_folder_url) {
            window._currentDriveCase.drive_folder_id = extractFolderIdFromUrl(window._currentDriveCase.drive_folder_url);
          }
        }
        return _orig.apply(this, arguments);
      };
    }
    if (typeof showTab === 'function') {
      var _origShow = showTab;
      window.showTab = function(tab) {
        _origShow.apply(this, arguments);
        var loaderName = TAB_LOADERS[tab];
        if (loaderName && typeof window[loaderName] === 'function') {
          setTimeout(function() { window[loaderName]().catch(function(e){console.warn(e);}); }, 50);
        }
      };
    }
    if (typeof pickFn === 'function') {
      var _origPickFn = pickFn;
      window.pickFn = async function(fnCode) {
        _origPickFn.apply(this, arguments);
        var caso = window._currentDriveCase || (typeof currentCase!=='undefined'?currentCase:null);
        var caseId = caso?.id;
        if (caseId && !window._caseContextCache[caseId]) loadCaseContext(caseId).catch(function(){});
      };
    }
    if (typeof buildContext === 'function') {
      var _origBuildContext = buildContext;
      window.buildContext = function(fnCode) {
        var base = _origBuildContext.apply(this, arguments);
        var caso = window._currentDriveCase || (typeof currentCase!=='undefined'?currentCase:null);
        var caseId = caso?.id;
        if (!caseId) return base;
        var ctx = window._caseContextCache[caseId];
        if (!ctx) return base;
        return base + buildFnContextBlock(fnCode, ctx);
      };
    }

    // Inyectar botones CRUD en pestañas cuando se rendericen
    injectCrudObserver();
    console.log('[Fiscalito] v6 instalado — CRUD + contexto IA activos.');
  }

  // ── Observer para inyectar botones CRUD ──
  function injectCrudObserver() {
    var loadFns = ['loadDiligencias','loadCronologia','loadParticipantes','loadAcciones','loadResoluciones'];
    loadFns.forEach(function(fnName) {
      if (typeof window[fnName] !== 'function') return;
      if (window[fnName]._crudPatched) return;
      var _orig = window[fnName];
      window[fnName] = async function() {
        var result = await _orig.apply(this, arguments);
        setTimeout(function() { window.injectAllCrudButtons && window.injectAllCrudButtons(); }, 150);
        return result;
      };
      window[fnName]._crudPatched = true;
    });
  }

  // ── CRUD helpers Supabase ──
  function sbH() { return {apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json'}; }

  async function sbDelete(table, id) {
    var r = await fetch(SB_URL+'/rest/v1/'+encodeURIComponent(table)+'?id=eq.'+encodeURIComponent(id), {method:'DELETE',headers:sbH()});
    return r.ok;
  }
  async function sbPatchRow(table, id, body) {
    var r = await fetch(SB_URL+'/rest/v1/'+encodeURIComponent(table)+'?id=eq.'+encodeURIComponent(id), {method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify(body)});
    return r.ok;
  }
  async function sbInsert(table, body) {
    var r = await fetch(SB_URL+'/rest/v1/'+encodeURIComponent(table), {method:'POST',headers:{...sbH(),Prefer:'return=representation'},body:JSON.stringify(body)});
    var d = await r.json();
    if(d&&d.error) throw new Error(d.error||d.message||'Error al insertar');
    return Array.isArray(d) ? d[0] : d;
  }

  // ── Modal genérico de edición ──
  function showEditModal(title, fields, onSave) {
    document.getElementById('fiscCrudModal')?.remove();
    var modal = document.createElement('div');
    modal.id = 'fiscCrudModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
    var inner = '<div style="background:#fff;border-radius:10px;padding:24px;min-width:420px;max-width:600px;max-height:85vh;overflow-y:auto;position:relative">';
    inner += '<h3 style="margin:0 0 16px;font-size:16px;color:#1a1a2e">'+title+'</h3>';
    fields.forEach(function(f) {
      inner += '<div style="margin-bottom:12px">';
      inner += '<label style="display:block;font-size:12px;color:#555;margin-bottom:4px">'+f.label+'</label>';
      if (f.type === 'textarea') {
        inner += '<textarea id="fc_'+f.key+'" rows="3" style="width:100%;border:1px solid #ddd;border-radius:6px;padding:8px;font-size:13px;box-sizing:border-box">'+escHtml(f.value||'')+'</textarea>';
      } else if (f.type === 'select') {
        inner += '<select id="fc_'+f.key+'" style="width:100%;border:1px solid #ddd;border-radius:6px;padding:8px;font-size:13px">';
        f.options.forEach(function(o) {
          var sel = o.value === f.value ? ' selected' : '';
          inner += '<option value="'+o.value+'"'+sel+'>'+o.label+'</option>';
        });
        inner += '</select>';
      } else {
        inner += '<input id="fc_'+f.key+'" type="'+(f.type||'text')+'" value="'+escHtml(f.value||'')+'" style="width:100%;border:1px solid #ddd;border-radius:6px;padding:8px;font-size:13px;box-sizing:border-box">';
      }
      inner += '</div>';
    });
    inner += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
    inner += '<button onclick="document.getElementById(\'fiscCrudModal\').remove()" style="padding:8px 16px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;font-size:13px">Cancelar</button>';
    inner += '<button id="fcSaveBtn" style="padding:8px 16px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Guardar</button>';
    inner += '</div></div>';
    modal.innerHTML = inner;
    document.body.appendChild(modal);
    document.getElementById('fcSaveBtn').onclick = function() {
      var data = {};
      fields.forEach(function(f) { data[f.key] = document.getElementById('fc_'+f.key)?.value; });
      onSave(data);
      modal.remove();
    };
    modal.onclick = function(e) { if(e.target===modal) modal.remove(); };
  }

  function showConfirm(msg, onOk) {
    if (confirm(msg)) onOk();
  }

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function escAttr(s) { return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function crudBtn(label, color, onclick) {
    return '<button onclick="'+escAttr(onclick)+'" style="padding:2px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:'+escAttr(color)+';color:#fff;margin-left:4px">'+label+'</button>';
  }

  // ── CRUD Diligencias ──
  function injectCrudDiligencias(container) {
    if (!container) return;
    // Agregar botón "+ Agregar" si no existe
    if (!container.querySelector('.crud-add-dil')) {
      var addBar = document.createElement('div');
      addBar.className = 'crud-add-dil';
      addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
      addBar.innerHTML = '<button onclick="window.crudAddDiligencia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar diligencia</button>';
      container.insertBefore(addBar, container.firstChild);
    }
    // Agregar botones a cada .dil-item extrayendo ID del onclick
    container.querySelectorAll('.dil-item').forEach(function(item) {
      if (item.querySelector('.crud-btns')) return;
      var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
      if (!m) return;
      var id = escAttr(m[1]);
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;white-space:nowrap;margin-left:6px;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','event.stopPropagation();crudEditDiligencia(&quot;'+id+'&quot;)')+' '+crudBtn('🗑','#e53935','event.stopPropagation();crudDelDiligencia(&quot;'+id+'&quot;)');
      item.appendChild(btns);
    });
  }

  window.crudAddDiligencia = function() {
    var caseId = (window._currentDriveCase||currentCase)?.id; if(!caseId) return;
    showEditModal('+ Nueva Diligencia', [
      {key:'diligencia_label',label:'Título / Descripción',type:'textarea',value:''},
      {key:'diligencia_type',label:'Tipo',type:'select',value:'diligencia',options:[
        {value:'diligencia',label:'Diligencia'},
        {value:'declaracion',label:'Declaración'},
        {value:'resolucion',label:'Resolución'},
        {value:'oficio',label:'Oficio'},
        {value:'informe',label:'Informe'},
        {value:'otro',label:'Otro'}
      ]},
      {key:'fecha_diligencia',label:'Fecha',type:'date',value:''},
      {key:'fojas_inicio',label:'Fojas inicio',type:'number',value:''},
      {key:'fojas_fin',label:'Fojas fin',type:'number',value:''}
    ], async function(data) {
      data.case_id = caseId;
      data.is_processed = false;
      await sbInsert('diligencias', data);
      if(typeof loadDiligencias==='function') loadDiligencias();
    });
  };

  window.crudEditDiligencia = function(id) {
    fetch(SB_URL+'/rest/v1/diligencias?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
      var d = rows[0]; if(!d) return;
      showEditModal('Editar Diligencia', [
        {key:'diligencia_label',label:'Título / Descripción',type:'textarea',value:d.diligencia_label},
        {key:'diligencia_type',label:'Tipo',type:'select',value:d.diligencia_type,options:[
          {value:'diligencia',label:'Diligencia'},{value:'declaracion',label:'Declaración'},
          {value:'resolucion',label:'Resolución'},{value:'oficio',label:'Oficio'},
          {value:'informe',label:'Informe'},{value:'otro',label:'Otro'}
        ]},
        {key:'fecha_diligencia',label:'Fecha',type:'date',value:d.fecha_diligencia||''},
        {key:'fojas_inicio',label:'Fojas inicio',type:'number',value:d.fojas_inicio||''},
        {key:'fojas_fin',label:'Fojas fin',type:'number',value:d.fojas_fin||''},
        {key:'ai_summary',label:'Resumen IA',type:'textarea',value:d.ai_summary||''}
      ], async function(data) {
        await sbPatchRow('diligencias', id, data);
        if(typeof loadDiligencias==='function') loadDiligencias();
      });
    }).catch(function(e){console.error('[CRUD]',e);alert('Error al cargar diligencia: '+e.message);});
  };

  window.crudDelDiligencia = function(id) {
    showConfirm('¿Eliminar esta diligencia? Esta acción no se puede deshacer.', async function() {
      await sbDelete('diligencias', id);
      if(typeof loadDiligencias==='function') loadDiligencias();
    });
  };

  // ── CRUD Cronología ──
  function injectCrudCronologia(container) {
    if (!container) return;
    if (!container.querySelector('.crud-add-cron')) {
      var addBar = document.createElement('div');
      addBar.className = 'crud-add-cron';
      addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
      addBar.innerHTML = '<button onclick="window.crudAddCronologia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar evento</button>';
      container.insertBefore(addBar, container.firstChild);
    }
    // Los items de cronología tienen clase y onclick con UUID
    var allEls = container.querySelectorAll('div[onclick], [class*=cron-item], [class*=event-item]');
    allEls.forEach(function(item) {
      if (item.querySelector('.crud-btns')) return;
      var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
      if (!m) return;
      var id = m[1];
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;white-space:nowrap;';
      id = escAttr(id);
      btns.innerHTML = crudBtn('✏','#5c6bc0','event.stopPropagation();crudEditCronologia(&quot;'+id+'&quot;)')+' '+crudBtn('🗑','#e53935','event.stopPropagation();crudDelCronologia(&quot;'+id+'&quot;)');
      item.appendChild(btns);
    });
  }

  window.crudAddCronologia = function() {
    var caseId = (window._currentDriveCase||currentCase)?.id; if(!caseId) return;
    showEditModal('+ Nuevo Evento de Cronología', [
      {key:'title',label:'Título del evento',type:'text',value:''},
      {key:'event_type',label:'Tipo',type:'select',value:'resolucion',options:[
        {value:'resolucion',label:'Resolución'},{value:'declaracion',label:'Declaración'},
        {value:'notificacion',label:'Notificación'},{value:'informe',label:'Informe'},
        {value:'plazo',label:'Plazo'},{value:'otro',label:'Otro'}
      ]},
      {key:'event_date',label:'Fecha',type:'date',value:''},
      {key:'description',label:'Descripción',type:'textarea',value:''},
      {key:'source_document',label:'Documento fuente',type:'text',value:''}
    ], async function(data) {
      data.case_id = caseId;
      await sbInsert('cronologia', data);
      if(typeof loadCronologia==='function') loadCronologia();
    });
  };

  window.crudEditCronologia = function(id) {
    fetch(SB_URL+'/rest/v1/cronologia?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
      var d = rows[0]; if(!d) return;
      showEditModal('Editar Evento', [
        {key:'title',label:'Título',type:'text',value:d.title||''},
        {key:'event_type',label:'Tipo',type:'select',value:d.event_type||'otro',options:[
          {value:'resolucion',label:'Resolución'},{value:'declaracion',label:'Declaración'},
          {value:'notificacion',label:'Notificación'},{value:'informe',label:'Informe'},
          {value:'plazo',label:'Plazo'},{value:'otro',label:'Otro'}
        ]},
        {key:'event_date',label:'Fecha',type:'date',value:d.event_date||''},
        {key:'description',label:'Descripción',type:'textarea',value:d.description||''},
        {key:'source_document',label:'Documento fuente',type:'text',value:d.source_document||''}
      ], async function(data) {
        await sbPatchRow('cronologia', id, data);
        if(typeof loadCronologia==='function') loadCronologia();
      });
    }).catch(function(e){console.error('[CRUD]',e);alert('Error al cargar evento: '+e.message);});
  };

  window.crudDelCronologia = function(id) {
    showConfirm('¿Eliminar este evento?', async function() {
      await sbDelete('cronologia', id);
      if(typeof loadCronologia==='function') loadCronologia();
    });
  };

  // ── CRUD Participantes ──
  function injectCrudParticipantes(container) {
    if (!container) return;
    if (!container.querySelector('.crud-add-part')) {
      var addBar = document.createElement('div');
      addBar.className = 'crud-add-part';
      addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
      addBar.innerHTML = '<button onclick="window.crudAddParticipante()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar participante</button>';
      container.insertBefore(addBar, container.firstChild);
    }
    // Buscar cualquier div con onclick que tenga un UUID (participantes usan onclick con ID)
    var allEls = container.querySelectorAll('div[onclick], [class*=part], [class*=participant]');
    allEls.forEach(function(item) {
      if (item.querySelector('.crud-btns')) return;
      var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
      if (!m) return;
      var id = m[1];
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;white-space:nowrap;';
      id = escAttr(id);
      btns.innerHTML = crudBtn('✏','#5c6bc0','event.stopPropagation();crudEditParticipante(&quot;'+id+'&quot;)')+' '+crudBtn('🗑','#e53935','event.stopPropagation();crudDelParticipante(&quot;'+id+'&quot;)');
      item.appendChild(btns);
    });
  }

  var ROLES_PART = [
    {value:'denunciante',label:'Denunciante'},{value:'denunciado',label:'Denunciado/Inculpado'},
    {value:'testigo',label:'Testigo'},{value:'fiscal',label:'Fiscal instructor'},
    {value:'actuario',label:'Actuario'},{value:'otro',label:'Otro'}
  ];
  var ESTAMENTOS = [
    {value:'funcionario',label:'Funcionario'},{value:'academico',label:'Académico'},
    {value:'estudiante',label:'Estudiante'},{value:'honorarios',label:'Honorarios'},
    {value:'externo',label:'Externo'},{value:'otro',label:'Otro'}
  ];

  window.crudAddParticipante = function() {
    var caseId = (window._currentDriveCase||currentCase)?.id; if(!caseId) return;
    showEditModal('+ Nuevo Participante', [
      {key:'name',label:'Nombre completo',type:'text',value:''},
      {key:'role',label:'Rol',type:'select',value:'denunciante',options:ROLES_PART},
      {key:'rut',label:'RUT',type:'text',value:''},
      {key:'estamento',label:'Estamento',type:'select',value:'funcionario',options:ESTAMENTOS},
      {key:'carrera',label:'Carrera / Cargo',type:'text',value:''},
      {key:'dependencia',label:'Unidad / Dependencia',type:'text',value:''},
      {key:'email',label:'Email',type:'email',value:''},
      {key:'telefono',label:'Teléfono',type:'text',value:''}
    ], async function(data) {
      data.case_id = caseId;
      await sbInsert('case_participants', data);
      if(typeof loadParticipantes==='function') loadParticipantes();
      delete window._caseContextCache[caseId];
    });
  };

  window.crudEditParticipante = function(id) {
    fetch(SB_URL+'/rest/v1/case_participants?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
      var d = rows[0]; if(!d) return;
      showEditModal('Editar Participante', [
        {key:'name',label:'Nombre completo',type:'text',value:d.name||''},
        {key:'role',label:'Rol',type:'select',value:d.role||'otro',options:ROLES_PART},
        {key:'rut',label:'RUT',type:'text',value:d.rut||''},
        {key:'estamento',label:'Estamento',type:'select',value:d.estamento||'otro',options:ESTAMENTOS},
        {key:'carrera',label:'Carrera / Cargo',type:'text',value:d.carrera||''},
        {key:'dependencia',label:'Unidad',type:'text',value:d.dependencia||''},
        {key:'email',label:'Email',type:'email',value:d.email||''},
        {key:'telefono',label:'Teléfono',type:'text',value:d.telefono||''}
      ], async function(data) {
        await sbPatchRow('case_participants', id, data);
        if(typeof loadParticipantes==='function') loadParticipantes();
        delete window._caseContextCache[(window._currentDriveCase||currentCase)?.id];
      });
    }).catch(function(e){console.error('[CRUD]',e);alert('Error al cargar participante: '+e.message);});
  };

  window.crudDelParticipante = function(id) {
    showConfirm('¿Eliminar este participante?', async function() {
      await sbDelete('case_participants', id);
      if(typeof loadParticipantes==='function') loadParticipantes();
    });
  };

  // ── CRUD Acciones Pendientes ──
  function injectCrudAcciones(container) {
    if (!container) return;
    if (!container.querySelector('.crud-add-acc')) {
      var addBar = document.createElement('div');
      addBar.className = 'crud-add-acc';
      addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
      addBar.innerHTML = '<button onclick="window.crudAddAccion()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar acción</button>';
      container.insertBefore(addBar, container.firstChild);
    }
    var allEls = container.querySelectorAll('div[onclick], [class*=accion], [class*=action], [class*=pending]');
    allEls.forEach(function(item) {
      if (item.querySelector('.crud-btns')) return;
      var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
      if (!m) return;
      var id = m[1];
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;white-space:nowrap;';
      id = escAttr(id);
      btns.innerHTML = crudBtn('✏','#5c6bc0','event.stopPropagation();crudEditAccion(&quot;'+id+'&quot;)')+' '+crudBtn('🗑','#e53935','event.stopPropagation();crudDelAccion(&quot;'+id+'&quot;)');
      item.appendChild(btns);
    });
  }

  window.crudAddAccion = function() {
    var caseId = (window._currentDriveCase||currentCase)?.id; if(!caseId) return;
    showEditModal('+ Nueva Acción Pendiente', [
      {key:'title',label:'Título',type:'text',value:''},
      {key:'description',label:'Descripción',type:'textarea',value:''},
      {key:'priority',label:'Prioridad',type:'select',value:'medium',options:[
        {value:'high',label:'Alta'},{value:'medium',label:'Media'},{value:'low',label:'Baja'}
      ]},
      {key:'due_date',label:'Fecha límite',type:'date',value:''},
      {key:'status',label:'Estado',type:'select',value:'pendiente',options:[
        {value:'pendiente',label:'Pendiente'},{value:'en_proceso',label:'En proceso'},{value:'completada',label:'Completada'}
      ]}
    ], async function(data) {
      data.case_id = caseId;
      await sbInsert('acciones_pendientes', data);
      if(typeof loadAcciones==='function') loadAcciones();
    });
  };

  window.crudEditAccion = function(id) {
    fetch(SB_URL+'/rest/v1/acciones_pendientes?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
      var d = rows[0]; if(!d) return;
      showEditModal('Editar Acción', [
        {key:'title',label:'Título',type:'text',value:d.title||''},
        {key:'description',label:'Descripción',type:'textarea',value:d.description||''},
        {key:'priority',label:'Prioridad',type:'select',value:d.priority||'medium',options:[
          {value:'high',label:'Alta'},{value:'medium',label:'Media'},{value:'low',label:'Baja'}
        ]},
        {key:'due_date',label:'Fecha límite',type:'date',value:d.due_date||''},
        {key:'status',label:'Estado',type:'select',value:d.status||'pendiente',options:[
          {value:'pendiente',label:'Pendiente'},{value:'en_proceso',label:'En proceso'},{value:'completada',label:'Completada'}
        ]}
      ], async function(data) {
        await sbPatchRow('acciones_pendientes', id, data);
        if(typeof loadAcciones==='function') loadAcciones();
      });
    }).catch(function(e){console.error('[CRUD]',e);alert('Error al cargar acción: '+e.message);});
  };

  window.crudDelAccion = function(id) {
    showConfirm('¿Eliminar esta acción?', async function() {
      await sbDelete('acciones_pendientes', id);
      if(typeof loadAcciones==='function') loadAcciones();
    });
  };

  // ── CRUD Resoluciones ──
  function injectCrudResoluciones(container) {
    if (!container) return;
    var allEls = container.querySelectorAll('div[onclick], [class*=resol], [class*=resolution]');
    allEls.forEach(function(item) {
      if (item.querySelector('.crud-btns')) return;
      var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
      if (!m) return;
      var id = m[1];
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;margin-top:4px;white-space:nowrap;';
      id = escAttr(id);
      btns.innerHTML = crudBtn('✏','#5c6bc0','event.stopPropagation();crudEditResolucion(&quot;'+id+'&quot;)')+' '+crudBtn('🗑','#e53935','event.stopPropagation();crudDelResolucion(&quot;'+id+'&quot;)');
      item.appendChild(btns);
    });
  }

  window.crudEditResolucion = function(id) {
    fetch(SB_URL+'/rest/v1/resoluciones?id=eq.'+encodeURIComponent(id)+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
      var d = rows[0]; if(!d) return;
      showEditModal('Editar Resolución', [
        {key:'resolution_type',label:'Tipo',type:'select',value:d.resolution_type||'inicio',options:[
          {value:'inicio',label:'Resolución de inicio'},{value:'designacion',label:'Designación fiscal'},
          {value:'cargos',label:'Formulación de cargos'},{value:'sobreseimiento',label:'Sobreseimiento'},
          {value:'sancion',label:'Sanción'},{value:'otro',label:'Otro'}
        ]},
        {key:'resolution_number',label:'N° resolución',type:'text',value:d.resolution_number||''},
        {key:'resolution_date',label:'Fecha',type:'date',value:d.resolution_date||''},
        {key:'authority',label:'Autoridad',type:'text',value:d.authority||''},
        {key:'fiscal_designado',label:'Fiscal designado',type:'text',value:d.fiscal_designado||''},
        {key:'facts_description',label:'Descripción de hechos',type:'textarea',value:d.facts_description||''}
      ], async function(data) {
        await sbPatchRow('resoluciones', id, data);
        if(typeof loadResoluciones==='function') loadResoluciones();
      });
    }).catch(function(e){console.error('[CRUD]',e);alert('Error al cargar resolución: '+e.message);});
  };

  window.crudDelResolucion = function(id) {
    showConfirm('¿Eliminar esta resolución?', async function() {
      await sbDelete('resoluciones', id);
      if(typeof loadResoluciones==='function') loadResoluciones();
    });
  };

  // ── Contexto IA ──
  async function loadCaseContext(caseId) {
    if (!caseId || typeof SB_KEY === 'undefined') return null;
    var h = {apikey:SB_KEY,Authorization:'Bearer '+SB_KEY};
    var url = SB_URL+'/rest/v1/';
    var [parts,dils,etapas,cron,resoluciones] = await Promise.all([
      fetch(url+'case_participants?select=role,name,rut,estamento,carrera,dependencia,email&case_id=eq.'+caseId+'&order=role.asc',{headers:h}).then(r=>r.json()),
      fetch(url+'diligencias?select=diligencia_label,diligencia_type,fecha_diligencia,fojas_inicio,fojas_fin,ai_summary&case_id=eq.'+caseId+'&order=fojas_inicio.asc&limit=50',{headers:h}).then(r=>r.json()),
      fetch(url+'etapas?select=current_stage,indagatoria_completed_at,cargos_completed_at,descargos_completed_at,prueba_completed_at,notes&case_id=eq.'+caseId+'&limit=1',{headers:h}).then(r=>r.json()),
      fetch(url+'cronologia?select=event_date,title,event_type,description&case_id=eq.'+caseId+'&order=event_date.asc&limit=20',{headers:h}).then(r=>r.json()),
      fetch(url+'resoluciones?select=resolution_type,resolution_number,resolution_date,authority,fiscal_designado,facts_description&case_id=eq.'+caseId+'&order=created_at.asc',{headers:h}).then(r=>r.json())
    ]);
    var caso = window._casesMap?.[caseId]||window._currentDriveCase||(typeof currentCase!=='undefined'&&currentCase?.id===caseId?currentCase:null)||(typeof allCases!=='undefined'?allCases.find(function(c){return c.id===caseId;}):null);
    var ctx = {caso,parts:Array.isArray(parts)?parts:[],dils:Array.isArray(dils)?dils:[],etapas:Array.isArray(etapas)?etapas:[],cron:Array.isArray(cron)?cron:[],resoluciones:Array.isArray(resoluciones)?resoluciones:[]};
    window._caseContextCache[caseId] = ctx;
    return ctx;
  }
  window.loadCaseContext = loadCaseContext;

  function buildFnContextBlock(fnCode, ctx) {
    var caso=ctx.caso||{}, parts=ctx.parts||[], dils=ctx.dils||[], etapa=ctx.etapas?.[0]||{}, cron=ctx.cron||[], reso=ctx.resoluciones||[];
    var byRole=function(r){return parts.filter(function(p){return p.role===r;});};
    var fmtP=function(p){var s='- '+p.name;if(p.rut)s+=' (RUT: '+p.rut+')';if(p.carrera)s+=' | '+p.carrera;if(p.dependencia)s+=' | '+p.dependencia;if(p.estamento)s+=' | '+p.estamento;return s;};
    var inculpados=byRole('inculpado').concat(byRole('inculpada'),byRole('denunciado'),byRole('imputado'));
    var denunciantes=byRole('denunciante').concat(byRole('victima'),byRole('afectado'));
    var testigos=byRole('testigo'),fiscales=byRole('fiscal').concat(byRole('instructor'));
    var base='\n\n━━━ CONTEXTO DEL EXPEDIENTE ━━━\n';
    base+='• Expediente: '+(caso.name||'')+'\n• ROL: '+(caso.rol||'')+'\n• Procedimiento: '+(caso.tipo_procedimiento||'')+'\n• Materia: '+(caso.materia||'')+'\n• Protocolo: '+(caso.protocolo||'')+'\n';
    if(caso.description)base+='• Hechos: '+caso.description.substring(0,200)+'\n';
    if(etapa.current_stage)base+='• Etapa actual: '+etapa.current_stage+'\n';
    var resoInicio=reso.find(function(r){return r.resolution_type&&r.resolution_type.includes('inicio');});
    if(resoInicio){base+='• Resolución inicio: N°'+(resoInicio.resolution_number||'')+' del '+(resoInicio.resolution_date||'')+'\n';if(resoInicio.fiscal_designado)base+='• Fiscal: '+resoInicio.fiscal_designado+'\n';}
    var extra='';
    if(fnCode==='F3'){
      extra+='\n━━━ INCULPADO/S ━━━\n';
      (inculpados.length?inculpados:byRole('denunciado')).forEach(function(p){extra+=fmtP(p)+'\n';});
      if(!inculpados.length&&!byRole('denunciado').length)extra+='(Sin inculpados registrados)\n';
      extra+='\n━━━ DENUNCIANTES ('+denunciantes.length+') ━━━\n';
      denunciantes.slice(0,5).forEach(function(p){extra+=fmtP(p)+'\n';});
      if(denunciantes.length>5)extra+='... y '+(denunciantes.length-5)+' más\n';
      var decls=dils.filter(function(d){return d.diligencia_label&&(d.diligencia_label.toLowerCase().includes('inculpad')||d.diligencia_label.toLowerCase().includes('declaraci'));});
      if(decls.length){extra+='\n━━━ DECLARACIONES PREVIAS ━━━\n';decls.slice(0,5).forEach(function(d){extra+='• '+d.diligencia_label+(d.fecha_diligencia?' ('+d.fecha_diligencia+')':'')+'\n';if(d.ai_summary)extra+='  '+d.ai_summary.substring(0,150)+'\n';});}
      extra+='\n━━━ INSTRUCCIÓN ━━━\nGenera un cuestionario detallado para la declaración en calidad de inculpado, basado en los hechos denunciados y las diligencias ya realizadas.\n';
    } else if(fnCode==='F4'){
      extra+='\n━━━ TESTIGOS ━━━\n';
      if(testigos.length)testigos.slice(0,10).forEach(function(p){extra+=fmtP(p)+'\n';});
      else extra+='(Sin testigos registrados)\n';
      extra+='\n━━━ INSTRUCCIÓN ━━━\nGenera preguntas para los testigos orientadas a corroborar o contrastar los hechos denunciados.\n';
    } else if(fnCode==='F5'){
      extra+='\n━━━ HECHOS CRONOLÓGICOS ━━━\n';
      cron.slice(0,10).forEach(function(e){extra+='• '+e.event_date+' — '+e.title+'\n';if(e.description)extra+='  '+e.description.substring(0,100)+'\n';});
      extra+='\n━━━ DILIGENCIAS CLAVE ━━━\n';
      dils.slice(0,10).forEach(function(d){extra+='• f.'+d.fojas_inicio+' '+d.diligencia_label+'\n';if(d.ai_summary)extra+='  '+d.ai_summary.substring(0,100)+'\n';});
      extra+='\n━━━ INSTRUCCIÓN ━━━\nAplica el método IRAC a los hechos del expediente.\n';
    } else if(fnCode==='F6'){
      extra+='\n━━━ INCULPADO/S ━━━\n';
      (inculpados.length?inculpados:byRole('denunciado')).forEach(function(p){extra+=fmtP(p)+'\n';});
      extra+='\n━━━ HECHOS INVESTIGADOS ━━━\n';
      dils.filter(function(d){return d.ai_summary;}).slice(0,8).forEach(function(d){extra+='• '+d.diligencia_label+'\n  '+d.ai_summary.substring(0,150)+'\n';});
      extra+='\n━━━ INSTRUCCIÓN ━━━\nRedacta la formulación de cargos conforme al art. 133 del Estatuto Administrativo.\n';
    } else if(fnCode==='F7'){
      extra+='\n━━━ ESTADO DEL PROCEDIMIENTO ━━━\n';
      extra+='Diligencias: '+dils.length+' | Etapa: '+(etapa.current_stage||'N/A')+'\n';
      if(etapa.indagatoria_completed_at)extra+='Indagatoria completada: '+etapa.indagatoria_completed_at+'\n';
      if(etapa.cargos_completed_at)extra+='Cargos: '+etapa.cargos_completed_at+'\n';
      if(etapa.descargos_completed_at)extra+='Descargos: '+etapa.descargos_completed_at+'\n';
      extra+='\n━━━ INCULPADO/S ━━━\n';
      (inculpados.length?inculpados:byRole('denunciado')).forEach(function(p){extra+=fmtP(p)+'\n';});
      extra+='\n━━━ DILIGENCIAS ━━━\n';
      dils.slice(0,15).forEach(function(d){extra+='• f.'+d.fojas_inicio+(d.fojas_fin&&d.fojas_fin!==d.fojas_inicio?'-'+d.fojas_fin:'')+' '+d.diligencia_label+'\n';});
      extra+='\n━━━ INSTRUCCIÓN ━━━\nRedacta la Vista Fiscal o Informe Final. Incluye: relación de hechos, análisis de la prueba, mérito de los cargos y propuesta fundada.\n';
    } else if(fnCode==='F8'){
      extra+='\n━━━ INSTRUCCIÓN ━━━\nElabora un informe en derecho citando normativa vigente, doctrina y jurisprudencia de la CGR.\n';
    } else {
      if(fiscales.length){extra+='\n━━━ PARTICIPANTES CLAVE ━━━\nFiscal: ';fiscales.forEach(function(p){extra+=p.name+' ';});extra+='\n';}
      extra+='\n━━━ ÚLTIMAS DILIGENCIAS ━━━\n';
      dils.slice(-5).forEach(function(d){extra+='• f.'+d.fojas_inicio+' '+d.diligencia_label+'\n';});
    }
    return base+extra;
  }

  // ── Función central de inyección CRUD ──
  function injectAllCrudBtns() {
    // Diligencias
    var dil = document.getElementById('dilContent') || document.getElementById('diligenciasList');
    if (dil) {
      if (!dil.querySelector('.crud-add-dil')) {
        var ab = document.createElement('div');
        ab.className = 'crud-add-dil';
        ab.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
        ab.innerHTML = '<button onclick="window.crudAddDiligencia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar diligencia</button>';
        dil.insertBefore(ab, dil.firstChild);
      }
      dil.querySelectorAll('.dil-item').forEach(function(item) {
        if (item.querySelector('.crud-btns')) return;
        var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
        if (!m) return;
        var id = escAttr(m[1]);
        var btns = document.createElement('span');
        btns.className = 'crud-btns';
        btns.style.cssText = 'float:right;white-space:nowrap;margin-left:6px;';
        btns.innerHTML = '<button onclick="event.stopPropagation();crudEditDiligencia(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#5c6bc0;color:#fff">✏</button> <button onclick="event.stopPropagation();crudDelDiligencia(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#e53935;color:#fff">🗑</button>';
        item.appendChild(btns);
      });
    }
    // Cronología
    var cron = document.getElementById('cronologiaList');
    if (cron) {
      if (!cron.querySelector('.crud-add-cron')) {
        var ab2 = document.createElement('div');
        ab2.className = 'crud-add-cron';
        ab2.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
        ab2.innerHTML = '<button onclick="window.crudAddCronologia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar evento</button>';
        cron.insertBefore(ab2, cron.firstChild);
      }
      cron.querySelectorAll('div[onclick]').forEach(function(item) {
        if (item.querySelector('.crud-btns')) return;
        var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
        if (!m) return;
        var id = escAttr(m[1]);
        var btns = document.createElement('span');
        btns.className = 'crud-btns';
        btns.style.cssText = 'float:right;white-space:nowrap;';
        btns.innerHTML = '<button onclick="event.stopPropagation();crudEditCronologia(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#5c6bc0;color:#fff">✏</button> <button onclick="event.stopPropagation();crudDelCronologia(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#e53935;color:#fff">🗑</button>';
        item.appendChild(btns);
      });
    }
    // Participantes
    var part = document.getElementById('participantesList');
    if (part) {
      if (!part.querySelector('.crud-add-part')) {
        var ab3 = document.createElement('div');
        ab3.className = 'crud-add-part';
        ab3.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
        ab3.innerHTML = '<button onclick="window.crudAddParticipante()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar participante</button>';
        part.insertBefore(ab3, part.firstChild);
      }
      part.querySelectorAll('div[onclick]').forEach(function(item) {
        if (item.querySelector('.crud-btns')) return;
        var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
        if (!m) return;
        var id = escAttr(m[1]);
        var btns = document.createElement('span');
        btns.className = 'crud-btns';
        btns.style.cssText = 'float:right;white-space:nowrap;';
        btns.innerHTML = '<button onclick="event.stopPropagation();crudEditParticipante(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#5c6bc0;color:#fff">✏</button> <button onclick="event.stopPropagation();crudDelParticipante(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#e53935;color:#fff">🗑</button>';
        item.appendChild(btns);
      });
    }
    // Acciones pendientes
    var acc = document.getElementById('accionesList') || document.querySelector('[id*=Acciones]');
    if (acc) {
      if (!acc.querySelector('.crud-add-acc')) {
        var ab4 = document.createElement('div');
        ab4.className = 'crud-add-acc';
        ab4.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
        ab4.innerHTML = '<button onclick="window.crudAddAccion()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar acción</button>';
        acc.insertBefore(ab4, acc.firstChild);
      }
      acc.querySelectorAll('div[onclick]').forEach(function(item) {
        if (item.querySelector('.crud-btns')) return;
        var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
        if (!m) return;
        var id = escAttr(m[1]);
        var btns = document.createElement('span');
        btns.className = 'crud-btns';
        btns.style.cssText = 'float:right;white-space:nowrap;';
        btns.innerHTML = '<button onclick="event.stopPropagation();crudEditAccion(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#5c6bc0;color:#fff">✏</button> <button onclick="event.stopPropagation();crudDelAccion(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#e53935;color:#fff">🗑</button>';
        item.appendChild(btns);
      });
    }
    // Resoluciones
    var res = document.getElementById('resolucionesList') || document.querySelector('[id*=Resoluciones]');
    if (res) {
      res.querySelectorAll('div[onclick]').forEach(function(item) {
        if (item.querySelector('.crud-btns')) return;
        var m = (item.getAttribute('onclick')||'').match(/\('([^']+)'\)/);
        if (!m) return;
        var id = m[1];
        var btns = document.createElement('span');
        btns.className = 'crud-btns';
        btns.style.cssText = 'float:right;white-space:nowrap;margin-top:4px;';
        btns.innerHTML = '<button onclick="event.stopPropagation();crudEditResolucion(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#5c6bc0;color:#fff">✏</button> <button onclick="event.stopPropagation();crudDelResolucion(\''+id+'\')" style="padding:2px 7px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:#e53935;color:#fff">🗑</button>';
        item.appendChild(btns);
      });
    }
  }
  window.injectAllCrudButtons = injectAllCrudBtns;

  // Esperar a que el script principal defina sus funciones antes de parchear
  function tryInstall(attempts) {
    if (typeof loadDiligencias === 'function' && typeof loadCronologia === 'function') {
      installPatches();
    } else if (attempts > 0) {
      setTimeout(function() { tryInstall(attempts - 1); }, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(function(){ tryInstall(10); }, 300); });
  } else {
    setTimeout(function(){ tryInstall(10); }, 300);
  }

})();

/* ── Drive API ── */
async function callDrive(body){var fetchFn=(typeof authFetch==='function')?authFetch:fetch;var res=await fetchFn('/.netlify/functions/drive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var d=await res.json();if(!d.ok)throw new Error(d.error||'Error en Drive');return d;}
function fmtSize(b){if(!b)return'';var n=parseInt(b);if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(0)+'KB';return(n/1048576).toFixed(1)+'MB';}
async function loadDriveTab(){
  /* Sincronizar _currentDriveCase con currentCase si no está definido */
  if(!window._currentDriveCase && typeof currentCase!=='undefined' && currentCase) {
    window._currentDriveCase = currentCase;
  }
  var caso=window._currentDriveCase;
  /* Asegurar drive_folder_id derivado de drive_folder_url */
  if(caso && !caso.drive_folder_id && caso.drive_folder_url){
    caso.drive_folder_id = extractFolderIdFromUrl(caso.drive_folder_url);
  }
  var no=document.getElementById('driveNoFolder');var has=document.getElementById('driveHasFolder');var pic=document.getElementById('drivePicker');
  if(!no||!has){
    /* Si no existen los elementos del drive-client, delegar a loadDrivePanel de index.html */
    if(typeof loadDrivePanel==='function'){loadDrivePanel();} return;
  }
  if(!pic) pic={style:{}};
  if(!caso){no.style.display='block';has.style.display='none';pic.style.display='none';return;}
  if(caso.drive_folder_id){
    no.style.display='none';has.style.display='block';pic.style.display='none';
    var link=document.getElementById('driveFolderLink');var name=document.getElementById('driveFolderName');
    if(link)link.href=caso.drive_folder_url||('https://drive.google.com/drive/folders/'+caso.drive_folder_id);
    if(name)name.textContent=(caso.name||'Caso')+' \u2014 Drive';
    await driveRefreshFiles();
  }else{no.style.display='block';has.style.display='none';pic.style.display='none';}
}
async function driveRefreshFiles(folderIdParam){
  /* Aceptar folderId como parámetro (compatibilidad con index.html) o derivarlo del caso */
  var caso=window._currentDriveCase || (typeof currentCase!=='undefined'?currentCase:null);
  var folderId = folderIdParam || (caso && caso.drive_folder_id) || (caso && extractFolderIdFromUrl(caso.drive_folder_url));
  if(!folderId){
    /* Sin folder ID disponible — no podemos listar archivos */
    var el2=document.getElementById('driveFilesList');
    if(el2) el2.innerHTML='<div class="drive-empty">Sin carpeta vinculada.</div>';
    return;
  }
  var el=document.getElementById('driveFilesList');if(!el)return;
  el.innerHTML='<div class="drive-empty">Cargando...</div>';
  try{
    var r=await callDrive({action:'list',folderId:folderId,recursive:true,maxDepth:3});
    var files=r.files||[];
    if(!files.length){el.innerHTML='<div class="drive-empty">Carpeta vac\u00eda.</div>';return;}
    el.innerHTML=files.map(function(f){
      var icon='&#128196;';
      if(f.mimeType&&f.mimeType.includes('pdf'))icon='&#128213;';
      else if(f.mimeType&&f.mimeType.includes('document'))icon='&#128196;';
      else if(f.mimeType&&f.mimeType.includes('sheet'))icon='&#128202;';
      var link=f.webViewLink||'#';
      return'<div class="drive-file-item"><span style="font-size:14px">'+icon+'</span><a href="'+link+'" target="_blank">'+f.name+'</a><span class="drive-file-size">'+fmtSize(f.size)+'</span></div>';
    }).join('');
  }catch(e){
    el.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';
  }
}
async function driveCreateFolder(){var caso=window._currentDriveCase||(typeof currentCase!=='undefined'?currentCase:null);if(!caso){alert('Selecciona un caso primero.');return;}var name=prompt('Nombre de la carpeta:',caso.rol?(caso.rol+' - '+caso.name):caso.name);if(!name)return;try{var r=await callDrive({action:'createFolder',caseId:caso.id,folderName:name});window._currentDriveCase.drive_folder_id=r.folder.id;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+r.folder.id;if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=r.folder.id;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}await loadDriveTab();}catch(e){alert('Error: '+e.message);}}
async function driveShowPicker(){var pic=document.getElementById('drivePicker');var list=document.getElementById('drivePickerList');if(!pic||!list)return;pic.style.display='block';list.innerHTML='<div class="drive-empty">Cargando...</div>';try{var r=await callDrive({action:'list'});if(!r.folders||!r.folders.length){list.innerHTML='<div class="drive-empty">No hay carpetas.</div>';return;}list.innerHTML=r.folders.map(function(f){return'<div class="drive-folder-option"><span>&#128193; '+f.name+'</span><button onclick="driveLinkFolder(\''+f.id+'\',\''+f.name.replace(/'/g,"\\'")+'\')">Vincular</button></div>';}).join('');}catch(e){list.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';}}
async function driveLinkFolder(folderId,folderName){var caso=window._currentDriveCase||(typeof currentCase!=='undefined'?currentCase:null);if(!caso)return;try{await callDrive({action:'link',caseId:caso.id,folderId:folderId,folderName:folderName});window._currentDriveCase.drive_folder_id=folderId;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+folderId;if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=folderId;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}await loadDriveTab();}catch(e){alert('Error: '+e.message);}}
async function driveUnlink(){
  if(!confirm('\u00bfDesvincular carpeta?'))return;
  var caso=window._currentDriveCase || (typeof currentCase!=='undefined'?currentCase:null);
  if(!caso)return;
  try{
    await fetch(SB_URL+'/rest/v1/cases?id=eq.'+caso.id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({drive_folder_id:null,drive_folder_url:null})});
    caso.drive_folder_id=null;
    caso.drive_folder_url=null;
    if(window._currentDriveCase) { window._currentDriveCase.drive_folder_id=null; window._currentDriveCase.drive_folder_url=null; }
    if(typeof currentCase!=='undefined'&&currentCase&&currentCase.id===caso.id){ currentCase.drive_folder_id=null; currentCase.drive_folder_url=null; }
    if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=null;window._casesMap[caso.id].drive_folder_url=null;}
    /* Actualizar allCases también */
    if(typeof allCases!=='undefined'&&Array.isArray(allCases)){
      var idx=allCases.findIndex(function(c){return c.id===caso.id;});
      if(idx>=0){allCases[idx].drive_folder_id=null;allCases[idx].drive_folder_url=null;}
    }
    await loadDriveTab();
  }catch(e){alert('Error: '+e.message);}
}
