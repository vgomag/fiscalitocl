/* Fiscalito — Drive Client v5 + Tab Auto-Loader + Contexto IA por caso */
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

  // Caché de contexto por caso para no repetir queries
  window._caseContextCache = {};

  function installPatches() {

    // ── Patch pickCaseById ──
    if (typeof pickCaseById === 'function') {
      var _orig = pickCaseById;
      window.pickCaseById = async function(id) {
        if (id && window._casesMap && window._casesMap[id]) {
          window._currentDriveCase = window._casesMap[id];
        }
        return _orig.apply(this, arguments);
      };
    }

    // ── Patch showTab ──
    if (typeof showTab === 'function') {
      var _origShow = showTab;
      window.showTab = function(tab) {
        _origShow.apply(this, arguments);
        var loaderName = TAB_LOADERS[tab];
        if (loaderName && typeof window[loaderName] === 'function') {
          setTimeout(function() {
            window[loaderName]().catch(function(e) {
              console.warn('Error cargando ' + tab + ':', e.message);
            });
          }, 50);
        }
      };
    }

    // ── Patch pickFn: pre-cargar contexto del caso al elegir función ──
    if (typeof pickFn === 'function') {
      var _origPickFn = pickFn;
      window.pickFn = async function(fnCode) {
        _origPickFn.apply(this, arguments);
        // Pre-cargar contexto del caso en background
        var caseId = window._currentDriveCase?.id;
        if (caseId && !window._caseContextCache[caseId]) {
          loadCaseContext(caseId).catch(function(e) {
            console.warn('Error pre-cargando contexto:', e.message);
          });
        }
      };
    }

    // ── Patch buildContext: enriquecer con datos reales del caso ──
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

    console.log('[Fiscalito] Drive client v5 instalado — contexto IA activo.');
  }

  // ── Carga los datos del caso desde Supabase ──
  async function loadCaseContext(caseId) {
    if (!caseId || !SB_URL || !SB_KEY) return null;
    var h = {apikey: SB_KEY, Authorization: 'Bearer '+SB_KEY};
    var url = SB_URL + '/rest/v1/';

    var [parts, dils, etapas, cron, resoluciones] = await Promise.all([
      fetch(url+'case_participants?select=role,name,rut,estamento,carrera,dependencia,email&case_id=eq.'+caseId+'&order=role.asc', {headers:h}).then(r=>r.json()),
      fetch(url+'diligencias?select=diligencia_label,diligencia_type,fecha_diligencia,fojas_inicio,fojas_fin,ai_summary&case_id=eq.'+caseId+'&order=fojas_inicio.asc&limit=50', {headers:h}).then(r=>r.json()),
      fetch(url+'etapas?select=current_stage,indagatoria_completed_at,cargos_completed_at,descargos_completed_at,prueba_completed_at,notes&case_id=eq.'+caseId+'&limit=1', {headers:h}).then(r=>r.json()),
      fetch(url+'cronologia?select=event_date,title,event_type,description&case_id=eq.'+caseId+'&order=event_date.asc&limit=20', {headers:h}).then(r=>r.json()),
      fetch(url+'resoluciones?select=resolution_type,resolution_number,resolution_date,authority,fiscal_designado,facts_description&case_id=eq.'+caseId+'&order=created_at.asc', {headers:h}).then(r=>r.json())
    ]);

    var caso = window._casesMap?.[caseId] || window._currentDriveCase;
    var ctx = { caso, parts: Array.isArray(parts)?parts:[], dils: Array.isArray(dils)?dils:[], etapas: Array.isArray(etapas)?etapas:[], cron: Array.isArray(cron)?cron:[], resoluciones: Array.isArray(resoluciones)?resoluciones:[] };
    window._caseContextCache[caseId] = ctx;
    return ctx;
  }

  // ── Construye el bloque de contexto según la función activa ──
  function buildFnContextBlock(fnCode, ctx) {
    var caso = ctx.caso || {};
    var parts = ctx.parts || [];
    var dils  = ctx.dils  || [];
    var etapa = ctx.etapas?.[0] || {};
    var cron  = ctx.cron  || [];
    var reso  = ctx.resoluciones || [];

    // Helpers
    var byRole = function(r) { return parts.filter(function(p){ return p.role===r; }); };
    var fmtPerson = function(p) {
      var s = '- '+p.name;
      if(p.rut) s += ' (RUT: '+p.rut+')';
      if(p.carrera) s += ' | Carrera: '+p.carrera;
      if(p.dependencia) s += ' | Unidad: '+p.dependencia;
      if(p.estamento) s += ' | '+p.estamento;
      return s;
    };

    var inculpados  = byRole('inculpado').concat(byRole('inculpada')).concat(byRole('denunciado')).concat(byRole('imputado'));
    var denunciantes= byRole('denunciante').concat(byRole('victima').concat(byRole('afectado')));
    var testigos    = byRole('testigo');
    var fiscales    = byRole('fiscal').concat(byRole('instructor'));

    // Bloque base del caso (común a todas las funciones)
    var base = '\n\n━━━ CONTEXTO DEL EXPEDIENTE ━━━\n';
    base += '• Expediente: ' + (caso.name||'') + '\n';
    base += '• ROL: ' + (caso.rol||'') + '\n';
    base += '• Procedimiento: ' + (caso.tipo_procedimiento||'') + '\n';
    base += '• Materia: ' + (caso.materia||'') + '\n';
    base += '• Protocolo aplicable: ' + (caso.protocolo||'') + '\n';
    if(caso.descripcion||caso.description) base += '• Hechos: ' + (caso.descripcion||caso.description||'').substring(0,200) + '\n';
    if(etapa.current_stage) base += '• Etapa actual: ' + etapa.current_stage + '\n';

    // Resolución de inicio
    var resoInicio = reso.find(function(r){ return r.resolution_type && r.resolution_type.toLowerCase().includes('inicio'); });
    if(resoInicio) {
      base += '• Resolución de inicio: N°'+(resoInicio.resolution_number||'')+ ' del '+(resoInicio.resolution_date||'') + '\n';
      if(resoInicio.fiscal_designado) base += '• Fiscal instructor: '+resoInicio.fiscal_designado+'\n';
    }

    // ── Contexto específico por función ──
    var extra = '';

    // F3 — Cuestionario Inculpado
    if(fnCode==='F3') {
      extra += '\n━━━ DATOS DEL/LOS INCULPADO/S ━━━\n';
      if(inculpados.length) {
        inculpados.forEach(function(p){ extra += fmtPerson(p)+'\n'; });
      } else {
        // Si no hay rol inculpado, mostrar denunciado
        var denunciados = byRole('denunciado');
        if(denunciados.length) denunciados.forEach(function(p){ extra += fmtPerson(p)+'\n'; });
        else extra += '(No hay inculpados registrados aún)\n';
      }
      extra += '\n━━━ HECHOS DENUNCIADOS ━━━\n';
      if(denunciantes.length) {
        extra += 'Denunciantes (' + denunciantes.length + '):\n';
        denunciantes.slice(0,5).forEach(function(p){ extra += fmtPerson(p)+'\n'; });
        if(denunciantes.length>5) extra += '... y '+(denunciantes.length-5)+' más\n';
      }
      // Diligencias clave para el cuestionario
      var declInc = dils.filter(function(d){ return d.diligencia_label && (d.diligencia_label.toLowerCase().includes('inculpad')||d.diligencia_label.toLowerCase().includes('declaraci')); });
      if(declInc.length) {
        extra += '\n━━━ DECLARACIONES PREVIAS ━━━\n';
        declInc.slice(0,5).forEach(function(d){
          extra += '• ' + d.diligencia_label + (d.fecha_diligencia?' ('+d.fecha_diligencia+')':'') + '\n';
          if(d.ai_summary) extra += '  Resumen: '+d.ai_summary.substring(0,150)+'\n';
        });
      }
      extra += '\n━━━ INSTRUCCIÓN ━━━\nGenera preguntas para el cuestionario al inculpado basadas en los hechos denunciados y las diligencias ya realizadas. Las preguntas deben ser claras, concretas y orientadas a esclarecer los hechos.\n';
    }

    // F4 — Cuestionario Testigos
    else if(fnCode==='F4') {
      extra += '\n━━━ TESTIGOS REGISTRADOS ━━━\n';
      if(testigos.length) {
        testigos.slice(0,10).forEach(function(p){ extra += fmtPerson(p)+'\n'; });
        if(testigos.length>10) extra += '... y '+(testigos.length-10)+' más\n';
      } else extra += '(No hay testigos registrados aún)\n';
      extra += '\n━━━ INSTRUCCIÓN ━━━\nGenera preguntas para los testigos orientadas a corroborar o contrastar los hechos denunciados.\n';
    }

    // F5 — Análisis IRAC
    else if(fnCode==='F5') {
      extra += '\n━━━ HECHOS RELEVANTES ━━━\n';
      cron.slice(0,10).forEach(function(e){ extra += '• '+e.event_date+' — '+e.title+'\n'; if(e.description) extra += '  '+e.description.substring(0,100)+'\n'; });
      extra += '\n━━━ DILIGENCIAS CLAVE ━━━\n';
      dils.slice(0,10).forEach(function(d){ extra += '• f.'+d.fojas_inicio+' '+d.diligencia_label+'\n'; if(d.ai_summary) extra += '  '+d.ai_summary.substring(0,100)+'\n'; });
      extra += '\n━━━ INSTRUCCIÓN ━━━\nAplica el método IRAC (Issue, Rule, Analysis, Conclusion) a los hechos del expediente. Identifica los hechos jurídicamente relevantes, la normativa aplicable, el análisis y una conclusión fundada.\n';
    }

    // F6 — Formulación de Cargos
    else if(fnCode==='F6') {
      extra += '\n━━━ INCULPADO/S ━━━\n';
      (inculpados.length ? inculpados : byRole('denunciado')).forEach(function(p){ extra += fmtPerson(p)+'\n'; });
      extra += '\n━━━ HECHOS INVESTIGADOS ━━━\n';
      var hechosDils = dils.filter(function(d){ return d.ai_summary; }).slice(0,8);
      hechosDils.forEach(function(d){ extra += '• '+d.diligencia_label+'\n  '+d.ai_summary.substring(0,150)+'\n'; });
      extra += '\n━━━ INSTRUCCIÓN ━━━\nRedacta la formulación de cargos conforme al artículo 133 del Estatuto Administrativo. Incluye: identificación del inculpado, cargos específicos con fundamento normativo y fáctico, y plazo para descargos.\n';
    }

    // F7 — Vista / Informe Final
    else if(fnCode==='F7') {
      extra += '\n━━━ RESUMEN DEL PROCEDIMIENTO ━━━\n';
      extra += 'Total diligencias: '+dils.length+'\n';
      extra += 'Etapa: '+(etapa.current_stage||'N/A')+'\n';
      if(etapa.indagatoria_completed_at) extra += 'Indagatoria completada: '+etapa.indagatoria_completed_at+'\n';
      if(etapa.cargos_completed_at) extra += 'Cargos formulados: '+etapa.cargos_completed_at+'\n';
      if(etapa.descargos_completed_at) extra += 'Descargos recibidos: '+etapa.descargos_completed_at+'\n';
      extra += '\n━━━ INCULPADO/S ━━━\n';
      (inculpados.length ? inculpados : byRole('denunciado')).forEach(function(p){ extra += fmtPerson(p)+'\n'; });
      extra += '\n━━━ DILIGENCIAS REALIZADAS ━━━\n';
      dils.slice(0,15).forEach(function(d){ extra += '• f.'+d.fojas_inicio+(d.fojas_fin&&d.fojas_fin!==d.fojas_inicio?'-'+d.fojas_fin:'')+' '+d.diligencia_label+'\n'; });
      extra += '\n━━━ INSTRUCCIÓN ━━━\nRedacta la Vista Fiscal o Informe Final del procedimiento. Incluye: relación de hechos, análisis de la prueba, mérito de los cargos y propuesta de sanción o sobreseimiento fundada en derecho.\n';
    }

    // F8 — Informe en Derecho
    else if(fnCode==='F8') {
      extra += '\n━━━ MATERIA JURÍDICA ━━━\n';
      extra += 'Procedimiento: '+(caso.tipo_procedimiento||'')+'\n';
      extra += 'Materia: '+(caso.materia||'')+'\n';
      extra += 'Protocolo: '+(caso.protocolo||'')+'\n';
      extra += '\n━━━ INSTRUCCIÓN ━━━\nElabora un informe en derecho sobre la materia consultada, citando la normativa vigente, doctrina administrativa y jurisprudencia de la Contraloría General de la República.\n';
    }

    // F0, F2 y resto — contexto general
    else {
      extra += '\n━━━ PARTICIPANTES CLAVE ━━━\n';
      if(fiscales.length) { extra += 'Fiscal instructor: '; fiscales.forEach(function(p){ extra += p.name+' '; }); extra += '\n'; }
      if(inculpados.length||byRole('denunciado').length) {
        extra += 'Inculpado/s: ';
        (inculpados.length?inculpados:byRole('denunciado')).slice(0,3).forEach(function(p){ extra += p.name+' '; });
        extra += '\n';
      }
      extra += '\n━━━ ÚLTIMAS DILIGENCIAS ━━━\n';
      dils.slice(-5).forEach(function(d){ extra += '• f.'+d.fojas_inicio+' '+d.diligencia_label+'\n'; });
    }

    return base + extra;
  }

  // Exponer loadCaseContext para uso manual
  window.loadCaseContext = loadCaseContext;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(installPatches, 200); });
  } else {
    setTimeout(installPatches, 200);
  }

})();

/* ── Drive API ── */
async function callDrive(body) {
  var res = await fetch('/.netlify/functions/drive', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  var d = await res.json();
  if(!d.ok) throw new Error(d.error||'Error en Drive');
  return d;
}
function fmtSize(b){if(!b)return'';var n=parseInt(b);if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(0)+'KB';return(n/1048576).toFixed(1)+'MB';}
async function loadDriveTab(){
  var caso=window._currentDriveCase;
  var no=document.getElementById('driveNoFolder');var has=document.getElementById('driveHasFolder');var pic=document.getElementById('drivePicker');
  if(!no||!has||!pic)return;
  if(!caso){no.style.display='block';has.style.display='none';pic.style.display='none';return;}
  if(caso.drive_folder_id){
    no.style.display='none';has.style.display='block';pic.style.display='none';
    var link=document.getElementById('driveFolderLink');var name=document.getElementById('driveFolderName');
    if(link)link.href=caso.drive_folder_url||('https://drive.google.com/drive/folders/'+caso.drive_folder_id);
    if(name)name.textContent=(caso.name||'Caso')+' \u2014 Drive';
    await driveRefreshFiles();
  }else{no.style.display='block';has.style.display='none';pic.style.display='none';}
}
async function driveRefreshFiles(){
  var caso=window._currentDriveCase;if(!caso||!caso.drive_folder_id)return;
  var el=document.getElementById('driveFilesList');if(!el)return;
  el.innerHTML='<div class="drive-empty">Cargando archivos...</div>';
  try{
    var r=await callDrive({action:'files',folderId:caso.drive_folder_id});
    if(!r.files||!r.files.length){el.innerHTML='<div class="drive-empty">La carpeta est\u00e1 vac\u00eda.</div>';return;}
    el.innerHTML=r.files.map(function(f){
      var icon='&#128196;';
      if(f.mimeType&&f.mimeType.includes('pdf'))icon='&#128213;';
      else if(f.mimeType&&f.mimeType.includes('document'))icon='&#128196;';
      else if(f.mimeType&&f.mimeType.includes('sheet'))icon='&#128202;';
      else if(f.mimeType&&f.mimeType.includes('image'))icon='&#128247;';
      return'<div class="drive-file-item"><span style="font-size:14px">'+icon+'</span><a href="'+f.webViewLink+'" target="_blank">'+f.name+'</a><span class="drive-file-size">'+fmtSize(f.size)+'</span></div>';
    }).join('');
  }catch(e){el.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';}
}
async function driveCreateFolder(){
  var caso=window._currentDriveCase;if(!caso){alert('Selecciona un caso primero.');return;}
  var name=prompt('Nombre de la carpeta:',caso.rol?(caso.rol+' - '+caso.name):caso.name);if(!name)return;
  try{
    var r=await callDrive({action:'createFolder',caseId:caso.id,folderName:name});
    window._currentDriveCase.drive_folder_id=r.folder.id;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+r.folder.id;
    if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=r.folder.id;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}
    await loadDriveTab();
  }catch(e){alert('Error al crear carpeta: '+e.message);}
}
async function driveShowPicker(){
  var pic=document.getElementById('drivePicker');var list=document.getElementById('drivePickerList');if(!pic||!list)return;
  pic.style.display='block';list.innerHTML='<div class="drive-empty">Cargando carpetas...</div>';
  try{
    var r=await callDrive({action:'list'});
    if(!r.folders||!r.folders.length){list.innerHTML='<div class="drive-empty">No hay carpetas.</div>';return;}
    list.innerHTML=r.folders.map(function(f){return'<div class="drive-folder-option"><span>&#128193; '+f.name+'</span><button onclick="driveLinkFolder(\''+f.id+'\',\''+f.name.replace(/'/g,"\\'")+'\')">Vincular</button></div>';}).join('');
  }catch(e){list.innerHTML='<div class="drive-empty" style="color:#c00">'+e.message+'</div>';}
}
async function driveLinkFolder(folderId,folderName){
  var caso=window._currentDriveCase;if(!caso)return;
  try{
    await callDrive({action:'link',caseId:caso.id,folderId:folderId,folderName:folderName});
    window._currentDriveCase.drive_folder_id=folderId;window._currentDriveCase.drive_folder_url='https://drive.google.com/drive/folders/'+folderId;
    if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=folderId;window._casesMap[caso.id].drive_folder_url=window._currentDriveCase.drive_folder_url;}
    await loadDriveTab();
  }catch(e){alert('Error al vincular: '+e.message);}
}
async function driveUnlink(){
  if(!confirm('\u00bfDesvincular carpeta? No la elimina en Drive.'))return;
  var caso=window._currentDriveCase;if(!caso)return;
  try{
    await fetch(SB_URL+'/rest/v1/cases?id=eq.'+caso.id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({drive_folder_id:null,drive_folder_url:null})});
    window._currentDriveCase.drive_folder_id=null;window._currentDriveCase.drive_folder_url=null;
    if(window._casesMap&&window._casesMap[caso.id]){window._casesMap[caso.id].drive_folder_id=null;window._casesMap[caso.id].drive_folder_url=null;}
    await loadDriveTab();
  }catch(e){alert('Error al desvincular: '+e.message);}
}
