/* Fiscalito — Drive Client v6 + Tab Auto-Loader + Contexto IA + CRUD completo */
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
        if (id && window._casesMap && window._casesMap[id]) window._currentDriveCase = window._casesMap[id];
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
        var caseId = window._currentDriveCase?.id;
        if (caseId && !window._caseContextCache[caseId]) loadCaseContext(caseId).catch(function(){});
      };
    }
    if (typeof buildContext === 'function') {
      var _origBuildContext = buildContext;
      window.buildContext = function(fnCode) {
        var base = _origBuildContext.apply(this, arguments);
        var caseId = window._currentDriveCase?.id;
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

  // ── Observer para inyectar botones CRUD al cargar cada pestaña ──
  function injectCrudObserver() {
    var targets = {
      diligenciasList:   injectCrudDiligencias,
      cronologiaList:    injectCrudCronologia,
      participantesList: injectCrudParticipantes,
      accionesList:      injectCrudAcciones,
      resolucionesList:  injectCrudResoluciones,
    };
    var obs = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (!node.id) return;
          if (targets[node.id]) targets[node.id](node);
          // Buscar dentro del nodo
          Object.keys(targets).forEach(function(id) {
            var el = node.querySelector ? node.querySelector('#'+id) : null;
            if (el) targets[id](el);
          });
        });
        // Cuando cambia innerHTML de un contenedor conocido
        if (m.target && m.target.id && targets[m.target.id]) {
          targets[m.target.id](m.target);
        }
      });
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── CRUD helpers Supabase ──
  function sbH() { return {apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json'}; }

  async function sbDelete(table, id) {
    var r = await fetch(SB_URL+'/rest/v1/'+table+'?id=eq.'+id, {method:'DELETE',headers:sbH()});
    return r.ok;
  }
  async function sbPatchRow(table, id, body) {
    var r = await fetch(SB_URL+'/rest/v1/'+table+'?id=eq.'+id, {method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify(body)});
    return r.ok;
  }
  async function sbInsert(table, body) {
    var r = await fetch(SB_URL+'/rest/v1/'+table, {method:'POST',headers:{...sbH(),Prefer:'return=representation'},body:JSON.stringify(body)});
    var d = await r.json();
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

  function crudBtn(label, color, onclick) {
    return '<button onclick="'+onclick+'" style="padding:2px 8px;font-size:11px;border:none;border-radius:4px;cursor:pointer;background:'+color+';color:#fff;margin-left:4px">'+label+'</button>';
  }

  // ── CRUD Diligencias ──
  function injectCrudDiligencias(container) {
    if (container._crudInjected) return;
    container._crudInjected = true;
    // Agregar botón "+ Agregar diligencia" al inicio
    var addBar = document.createElement('div');
    addBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0 10px;';
    addBar.innerHTML = '<button onclick="window.crudAddDiligencia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar diligencia</button>';
    container.insertBefore(addBar, container.firstChild);

    // Agregar botones a cada item
    var items = container.querySelectorAll('.dil-item, .diligencia-item, tr[data-id], [data-id]');
    items.forEach(function(item) {
      var id = item.dataset.id || item.getAttribute('data-id');
      if (!id || item.querySelector('.crud-btns')) return;
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;white-space:nowrap;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','window.crudEditDiligencia("'+id+'")')+crudBtn('🗑','#e53935','window.crudDelDiligencia("'+id+'")');
      item.appendChild(btns);
    });
  }

  window.crudAddDiligencia = function() {
    var caseId = window._currentDriveCase?.id; if(!caseId) return;
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
    fetch(SB_URL+'/rest/v1/diligencias?id=eq.'+id+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
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
    });
  };

  window.crudDelDiligencia = function(id) {
    showConfirm('¿Eliminar esta diligencia? Esta acción no se puede deshacer.', async function() {
      await sbDelete('diligencias', id);
      if(typeof loadDiligencias==='function') loadDiligencias();
    });
  };

  // ── CRUD Cronología ──
  function injectCrudCronologia(container) {
    if (container._crudInjected) return;
    container._crudInjected = true;
    var addBar = document.createElement('div');
    addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
    addBar.innerHTML = '<button onclick="window.crudAddCronologia()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar evento</button>';
    container.insertBefore(addBar, container.firstChild);

    var items = container.querySelectorAll('[data-id], .cron-item, .event-item');
    items.forEach(function(item) {
      var id = item.dataset.id;
      if (!id || item.querySelector('.crud-btns')) return;
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','window.crudEditCronologia("'+id+'")')+crudBtn('🗑','#e53935','window.crudDelCronologia("'+id+'")');
      item.appendChild(btns);
    });
  }

  window.crudAddCronologia = function() {
    var caseId = window._currentDriveCase?.id; if(!caseId) return;
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
    fetch(SB_URL+'/rest/v1/cronologia?id=eq.'+id+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
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
    });
  };

  window.crudDelCronologia = function(id) {
    showConfirm('¿Eliminar este evento?', async function() {
      await sbDelete('cronologia', id);
      if(typeof loadCronologia==='function') loadCronologia();
    });
  };

  // ── CRUD Participantes ──
  function injectCrudParticipantes(container) {
    if (container._crudInjected) return;
    container._crudInjected = true;
    var addBar = document.createElement('div');
    addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
    addBar.innerHTML = '<button onclick="window.crudAddParticipante()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar participante</button>';
    container.insertBefore(addBar, container.firstChild);

    var items = container.querySelectorAll('[data-id]');
    items.forEach(function(item) {
      var id = item.dataset.id;
      if (!id || item.querySelector('.crud-btns')) return;
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','window.crudEditParticipante("'+id+'")')+crudBtn('🗑','#e53935','window.crudDelParticipante("'+id+'")');
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
    var caseId = window._currentDriveCase?.id; if(!caseId) return;
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
    fetch(SB_URL+'/rest/v1/case_participants?id=eq.'+id+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
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
        delete window._caseContextCache[window._currentDriveCase?.id];
      });
    });
  };

  window.crudDelParticipante = function(id) {
    showConfirm('¿Eliminar este participante?', async function() {
      await sbDelete('case_participants', id);
      if(typeof loadParticipantes==='function') loadParticipantes();
    });
  };

  // ── CRUD Acciones Pendientes ──
  function injectCrudAcciones(container) {
    if (container._crudInjected) return;
    container._crudInjected = true;
    var addBar = document.createElement('div');
    addBar.style.cssText = 'display:flex;justify-content:flex-end;padding:0 0 8px;';
    addBar.innerHTML = '<button onclick="window.crudAddAccion()" style="padding:5px 12px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px">+ Agregar acción</button>';
    container.insertBefore(addBar, container.firstChild);

    var items = container.querySelectorAll('[data-id]');
    items.forEach(function(item) {
      var id = item.dataset.id;
      if (!id || item.querySelector('.crud-btns')) return;
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','window.crudEditAccion("'+id+'")')+crudBtn('🗑','#e53935','window.crudDelAccion("'+id+'")');
      item.appendChild(btns);
    });
  }

  window.crudAddAccion = function() {
    var caseId = window._currentDriveCase?.id; if(!caseId) return;
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
    fetch(SB_URL+'/rest/v1/acciones_pendientes?id=eq.'+id+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
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
    });
  };

  window.crudDelAccion = function(id) {
    showConfirm('¿Eliminar esta acción?', async function() {
      await sbDelete('acciones_pendientes', id);
      if(typeof loadAcciones==='function') loadAcciones();
    });
  };

  // ── CRUD Resoluciones ──
  function injectCrudResoluciones(container) {
    if (container._crudInjected) return;
    container._crudInjected = true;

    var items = container.querySelectorAll('[data-id]');
    items.forEach(function(item) {
      var id = item.dataset.id;
      if (!id || item.querySelector('.crud-btns')) return;
      var btns = document.createElement('span');
      btns.className = 'crud-btns';
      btns.style.cssText = 'float:right;margin-top:4px;';
      btns.innerHTML = crudBtn('✏','#5c6bc0','window.crudEditResolucion("'+id+'")')+crudBtn('🗑','#e53935','window.crudDelResolucion("'+id+'")');
      item.appendChild(btns);
    });
  }

  window.crudEditResolucion = function(id) {
    fetch(SB_URL+'/rest/v1/resoluciones?id=eq.'+id+'&select=*',{headers:sbH()}).then(r=>r.json()).then(function(rows) {
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
    });
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
    var caso = window._casesMap?.[caseId]||window._currentDriveCase;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(installPatches, 200); });
  } else {
    setTimeout(installPatches, 200);
  }

})();

/* ── Drive API ── */
async function callDrive(body){var res=await fetch('/.netlify/functions/drive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var d=await res.json();if(!d.ok)throw new Error(d.error||'Error en Drive');return d;}
function fmtSize(b){if(!b)return'';var n=parseInt(b);if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(0)+'KB';return(n/1048576).toFixed(1)+'MB';}
async function loadDriveTab(){var caso=window._currentDriveCase;var no=document.getElementById('driveNoFolder');var has=document.getElementById('driveHasFolder');var pic=document.getElementById('drivePicker');if(!no||!has||!pic)return;if(!caso){no.style.display='block';has.style.display='none';pic.style.display='none';return;}if(caso.drive_folder_id){no.style.display='none';has.style.display='block';pic.style.display='none';var link=document.getElementById('driveFolderLink');var name=document.getElementById('driveFolderName');if(link)link.href=caso.drive_folder_url||('https://drive.google.com/drive/folders/'+caso.drive_folder_id);if(name)name.textContent=(caso.name||'Caso')+' \u2014 Drive';await driveRefreshFiles();}else{no.style.display='block';has.style.display='none';pic.style.display='none';}}
async function driveRefreshFiles(){var caso=window._currentDriveCase;if(!caso||!caso.drive_folder_id)return;var el=document.getElementById('driveFilesList');if(!el)return;el.innerHTML='<div class="drive-empty">Cargando...</div>';try{var r=await callDrive({action:'files',folderId:caso.drive_folder_id});if(!r.files||!r.files.length){el.innerHTML='<div class="drive-empty">Carpeta vac\u00eda.</div>';return;}el.innerHTML=r.files.map(function(f){var icon='&#128196;';if(f.mimeType&&f.mimeType.includes('pdf'))icon='&#128213;';else if(f.mimeType&&f.mimeType.includes('document'))icon='&#128196;';else if(f.mimeType&&f.mimeType.includes('sheet'))icon='&#128202;';return'<div class="drive-file-item"><span style="font-size:14px">'+icon+'</span><a href="'+f.webViewLink+'" target="_blank">'+f.name+'</a><span class="drive-file-size">'+fmtSize(f.size)+'</span></div>';}).join('');}catch(e){el.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';}}
async function driveCreateFolder(){var caso=window._currentDriveCase;if(!caso){alert('Selecciona un caso primero.');return;}var name=prompt('Nombre de la carpeta:',caso.rol?(caso.rol+' - '+caso.name):caso.name);if(!name)return;try{var r=await callDrive({action:'createFolder',caseId:caso.id,folderName:name});window._currentDriveCase.drive_folder_id=r.folder.id;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+r.folder.id;if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=r.folder.id;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}await loadDriveTab();}catch(e){alert('Error: '+e.message);}}
async function driveShowPicker(){var pic=document.getElementById('drivePicker');var list=document.getElementById('drivePickerList');if(!pic||!list)return;pic.style.display='block';list.innerHTML='<div class="drive-empty">Cargando...</div>';try{var r=await callDrive({action:'list'});if(!r.folders||!r.folders.length){list.innerHTML='<div class="drive-empty">No hay carpetas.</div>';return;}list.innerHTML=r.folders.map(function(f){return'<div class="drive-folder-option"><span>&#128193; '+f.name+'</span><button onclick="driveLinkFolder(\''+f.id+'\',\''+f.name.replace(/'/g,"\\'")+'\')">Vincular</button></div>';}).join('');}catch(e){list.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';}}
async function driveLinkFolder(folderId,folderName){var caso=window._currentDriveCase;if(!caso)return;try{await callDrive({action:'link',caseId:caso.id,folderId:folderId,folderName:folderName});window._currentDriveCase.drive_folder_id=folderId;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+folderId;if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=folderId;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}await loadDriveTab();}catch(e){alert('Error: '+e.message);}}
async function driveUnlink(){if(!confirm('\u00bfDesvincular carpeta?'))return;var caso=window._currentDriveCase;if(!caso)return;try{await fetch(SB_URL+'/rest/v1/cases?id=eq.'+caso.id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({drive_folder_id:null,drive_folder_url:null})});window._currentDriveCase.drive_folder_id=null;window._currentDriveCase.drive_folder_url=null;if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=null;window._casesMap[caso.id].drive_folder_url=null;}await loadDriveTab();}catch(e){alert('Error: '+e.message);}}
