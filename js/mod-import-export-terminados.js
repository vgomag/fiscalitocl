/* ═══════════════════════════════════════════════════════════════════
   MOD-IMPORT-EXPORT-TERMINADOS.JS  ·  Fiscalito
   v1.0 · 2026-04-28
   - Botón "📋 Procedimientos Terminados (compacto)": exporta el formato
     de la planilla Procedimientos_Terminados (14 columnas: Nombre,
     Caratulado, Fiscal, Expediente, Resolución, Fechas, Tipo, Etapa,
     Norma, Fecha de termino, Días de tramitación, Decisión, Meses).
   - Botón "📥 Importar Fechas Término": permite cargar un .xlsx con
     ese mismo formato (u otro similar) y, por matching de Resolución
     vs cases.nueva_resolucion / cases.numero_exp_interno, actualiza
     en BD los campos VACÍOS:
        · fecha_resolucion_termino (Fecha de termino)
        · caratula                 (Caratulado)
        · propuesta                (Decisión: Sanción / Sobreseimiento)
        · duracion_dias            (Días de tramitación)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[import-export-terminados] cargando…');

  /* ── Globals helpers ──────────────────────────────────────────── */
  const _readGlobal = (name) => {
    try {
      return (new Function(
        'try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined; } catch(e){ return undefined; }'
      ))();
    } catch { return undefined; }
  };
  const X = () => (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : null;
  const SB = () => window.sb || _readGlobal('sb');

  /* ── Util ─────────────────────────────────────────────────────── */
  function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function _toExcelDate(v){
    if(!v)return'';
    if(v instanceof Date)return v;
    const iso=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso)return new Date(parseInt(iso[1]),parseInt(iso[2])-1,parseInt(iso[3]));
    const d=new Date(v); return isNaN(d)?String(v):d;
  }
  function _isoDate(v){
    if(!v)return null;
    if(v instanceof Date) return v.toISOString().slice(0,10);
    const s=String(v);
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return m[0];
    m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    const d=new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
    return null;
  }
  function _profesionalNombre(){
    try {
      const sess = window.session || _readGlobal('session');
      const u = (sess && sess.user) || {};
      const meta = u.user_metadata || {};
      return meta.full_name || meta.name || meta.nombre || (u.email||'Fiscal').split('@')[0].replace(/[._-]/g,' ');
    } catch { return 'Fiscal'; }
  }
  function _normaLabel(v){
    if(!v) return '';
    const k=String(v).toLowerCase().trim();
    const map={
      '2020':'Protocolo 2020','protocolo 2020':'Protocolo 2020',
      '2022':'Protocolo 2022','protocolo 2022':'Protocolo 2022',
      '18834':'Estatuto Administrativo','estatuto administrativo':'Estatuto Administrativo',
      'laboral':'Protocolo laboral','protocolo laboral':'Protocolo laboral',
      'ley karin':'Laboral Ley Karin','laboral ley karin':'Laboral Ley Karin',
      'reglamento estudiantes':'Reglamento Estudiantes',
      '34-su':'Reglamento Estudiantes','21-su-2025':'Reglamento Estudiantes'
    };
    return map[k] || v;
  }
  function _propuestaLabel(c){
    if(c.propuesta){
      const p=String(c.propuesta).toLowerCase();
      if(/sancion|destituci|multa|censura|suspensi/.test(p))return'Sanción';
      if(/sobresei/.test(p))return'Sobreseimiento';
      if(/absuel/.test(p))return'Absuelto';
      return c.propuesta;
    }
    const r=String(c.resultado||'').toLowerCase();
    if(r.startsWith('sancion_')||r.startsWith('propuesta_sancion_'))return'Sanción';
    if(r==='sobreseimiento')return'Sobreseimiento';
    if(r==='absuelto')return'Absuelto';
    return '';
  }
  function _caratula(c){
    if (c.caratula) return c.caratula;
    /* Construir desde apellidos: Denunciante / Denunciado */
    function lastName(s){
      const parts = String(s||'').trim().split(/\s+/);
      if (parts.length<=1) return parts[0]||'';
      /* tomar último no preposición */
      for (let i=parts.length-1; i>=0; i--){
        const w=parts[i].toLowerCase();
        if (!['de','del','la','las','los','y','von','van','da'].includes(w)) return parts[i].toUpperCase();
      }
      return parts[parts.length-1].toUpperCase();
    }
    const dteArr = Array.isArray(c.denunciantes) ? c.denunciantes : (c.denunciantes ? [c.denunciantes] : []);
    const ddoArr = Array.isArray(c.denunciados)  ? c.denunciados  : (c.denunciados  ? [c.denunciados]  : []);
    const dte = lastName(dteArr[0]||'');
    const ddo = lastName(ddoArr[0]||'');
    if (!dte && !ddo) return '';
    return (dte||'—') + ' / ' + (ddo||'—');
  }
  function _diasTramitacion(c){
    if (typeof c.duracion_dias === 'number' && c.duracion_dias>0) return c.duracion_dias;
    /* Fallback con días naturales (no hábiles) entre recepción y término — la
       planilla original usa días corridos. */
    const a=c.fecha_recepcion_fiscalia||c.created_at;
    const b=c.fecha_resolucion_termino||c.fecha_vista;
    if(!a||!b) return '';
    const da=new Date(a), db=new Date(b);
    if(isNaN(da)||isNaN(db)||db<=da) return '';
    return Math.round((db-da)/86400000);
  }

  /* ── Picking de casos ─────────────────────────────────────────── */
  function pickAllCases() {
    try {
      if (typeof allCases !== 'undefined' && Array.isArray(allCases)) return allCases.slice();
    } catch {}
    if (Array.isArray(window.allCases)) return window.allCases.slice();
    const v = _readGlobal('allCases');
    if (Array.isArray(v)) return v.slice();
    /* Fallback: mod-estadisticas guarda terminados en _statsData */
    return [];
  }
  function getTerminados() {
    /* Preferimos _statsData.terminados (ya clasificado y ordenado por mod-estadisticas) */
    const sd = _readGlobal('_statsData');
    if (sd && Array.isArray(sd.terminados) && sd.terminados.length) return sd.terminados.slice();
    /* Si no, intentamos clasificar a partir de allCases */
    const all = pickAllCases();
    if (!all.length) return [];
    return all.filter(c => {
      const cat = (typeof window.getCaseCat === 'function') ? window.getCaseCat(c) : c.categoria;
      return cat === 'terminado' || c.status === 'terminado';
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORT — formato planilla "Procedimientos Terminados" (compacto)
     ═══════════════════════════════════════════════════════════════ */
  function exportTerminadosCompactoXLSX() {
    const xx = X();
    if (!xx) {
      const m='La librería XLSX no está disponible. Recarga la página.';
      if (typeof showToast==='function') showToast('⚠ '+m); else alert(m); return;
    }
    let terminados = getTerminados();
    if (!terminados.length) {
      if (typeof showToast==='function') showToast('⚠ No hay procedimientos terminados');
      return;
    }
    /* Orden cronológico ascendente por FECHA DE ENTREGA (fecha_vista),
       con fallback a fecha_resolucion_termino, fecha_resolucion y created_at.
       Del más antiguo al más nuevo — criterio canónico en toda la app. */
    terminados = terminados.slice().sort((a,b)=>{
      const da=a.fecha_resolucion_termino||a.fecha_vista||a.fecha_resolucion||a.created_at||'';
      const db=b.fecha_resolucion_termino||b.fecha_vista||b.fecha_resolucion||b.created_at||'';
      return String(da).localeCompare(String(db));
    });
    if (typeof showToast==='function') showToast('📋 Generando Procedimientos Terminados…');

    try {
      const fiscal = _profesionalNombre();
      const headers = ['Nombre','Caratulado','Fiscal','Expediente','Resolución','Fecha de Resolución','Fecha de Recepción','Tipo de Procedimiento','Etapa','Norma','Fecha de termino','Días de tramitación','Decisión','Meses'];
      const titleRow1 = ['Procedimientos Terminados'];
      const titleRow2 = ['Listado consolidado de procedimientos disciplinarios cerrados.'];
      const subtitleRow = ['Procedimientos terminados'];

      const aoa = [titleRow1, titleRow2, [], subtitleRow, headers];
      for (const c of terminados) {
        const dias = _diasTramitacion(c);
        const meses = (typeof dias==='number' && dias>0) ? Math.round(dias/30) : '';
        aoa.push([
          c.numero_exp_interno || c.name || '',
          _caratula(c),
          fiscal,
          c.drive_folder_url || '',
          c.nueva_resolucion || '',
          _toExcelDate(c.fecha_resolucion),
          _toExcelDate(c.fecha_recepcion_fiscalia),
          c.tipo_procedimiento || '',
          'Terminada',
          _normaLabel(c.protocolo),
          _toExcelDate(c.fecha_resolucion_termino),
          (typeof dias==='number'?dias:''),
          _propuestaLabel(c),
          meses
        ]);
      }

      const ws = xx.utils.aoa_to_sheet(aoa, { cellDates:true });
      ws['!cols']=[
        {wch:14},{wch:24},{wch:24},{wch:60},{wch:22},{wch:14},{wch:14},
        {wch:22},{wch:12},{wch:22},{wch:14},{wch:12},{wch:16},{wch:8}
      ];
      /* Autofiltro sobre encabezados (fila 5) */
      const dataRows = terminados.length;
      if (dataRows) {
        ws['!autofilter'] = {ref: xx.utils.encode_range({s:{r:4,c:0},e:{r:4+dataRows,c:headers.length-1}})};
      }
      /* Formato fechas en columnas F,G,K (índices 5,6,10) */
      const dateCols=[5,6,10];
      for (let r=5; r<5+dataRows; r++){
        for (const c of dateCols){
          const ref=xx.utils.encode_cell({r,c});
          if (ws[ref] && ws[ref].v instanceof Date){ ws[ref].t='d'; ws[ref].z='dd-mm-yyyy'; }
        }
      }

      const wb = xx.utils.book_new();
      xx.utils.book_append_sheet(wb, ws, 'procedimientos terminados');
      const sess = window.session || _readGlobal('session');
      const usuario = ((sess && sess.user && sess.user.email) || 'usuario').split('@')[0];
      const fecha = new Date().toISOString().slice(0,10);
      const filename = `Procedimientos-Terminados_${usuario}_${fecha}.xlsx`;
      xx.writeFile(wb, filename);
      if (typeof showToast==='function') showToast('✓ '+filename+' descargado');
    } catch (e) {
      console.error('[exportTerminadosCompactoXLSX] error:', e);
      if (typeof showToast==='function') showToast('⚠ Error: '+e.message); else alert('Error: '+e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     IMPORT — leer Excel y volcar Fecha de término (y otros) a BD
     ═══════════════════════════════════════════════════════════════ */

  /* Mapeo de nombres de columnas tolerante a tildes/mayúsculas */
  function _normCol(s){
    return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim();
  }
  const COL_ALIASES = {
    nombre: ['nombre','exp','exp.','expediente interno','numero','numero expediente'],
    caratulado: ['caratulado','caratula','carátula','caratulada'],
    fiscal: ['fiscal','profesional'],
    expediente: ['expediente','drive','enlace','link','url','carpeta','carpeta drive'],
    resolucion: ['resolucion','resolucion inicio','resolucion de inicio','res. inicio'],
    fecha_resolucion: ['fecha de resolucion','fecha resolucion','fecha res. inicio','fecha res inicio'],
    fecha_recepcion: ['fecha de recepcion','fecha recepcion','fecha de recepcion fiscalia','fecha recepcion fiscalia'],
    tipo_procedimiento: ['tipo de procedimiento','tipo procedimiento','procedimiento'],
    etapa: ['etapa','estado'],
    norma: ['norma','protocolo','protocolo aplicable'],
    fecha_termino: ['fecha de termino','fecha termino','fecha de término','fecha término','fecha res. termino','fecha res termino','fecha de res. termino'],
    dias_tramitacion: ['dias de tramitacion','días de tramitación','dias tramitacion','duracion dias','duracion','dias'],
    decision: ['decision','decisión','propuesta','resultado'],
    meses: ['meses','duracion meses']
  };
  function _findHeaderRow(ws){
    const xx=X();
    const ref = ws['!ref']; if (!ref) return null;
    const range = xx.utils.decode_range(ref);
    /* buscar en las primeras 10 filas la que contenga al menos "Resolución" o "resolucion" */
    for (let r=range.s.r; r<=Math.min(range.s.r+10, range.e.r); r++){
      let resCol=null, fechaTermCol=null;
      const colNames={};
      for (let c=range.s.c; c<=range.e.c; c++){
        const cell = ws[xx.utils.encode_cell({r,c})];
        if (!cell) continue;
        const v = _normCol(cell.v);
        for (const [key, aliases] of Object.entries(COL_ALIASES)){
          if (aliases.includes(v)){ colNames[key]=c; break; }
        }
      }
      if ('resolucion' in colNames && 'fecha_termino' in colNames){
        return { headerRow: r, cols: colNames };
      }
    }
    return null;
  }
  function _normResol(s){
    return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[\/–—-]/g,'-');
  }
  function _readSheet(ws, hdr){
    const xx=X();
    const range = xx.utils.decode_range(ws['!ref']);
    const out = [];
    for (let r=hdr.headerRow+1; r<=range.e.r; r++){
      const row = {};
      for (const [key, c] of Object.entries(hdr.cols)){
        const cell = ws[xx.utils.encode_cell({r,c})];
        row[key] = cell ? cell.v : null;
      }
      /* Descartar filas totalmente vacías y filas de totales/cierre.
         Necesitamos al menos Resolución o Nombre para poder hacer match. */
      if (!row.resolucion && !row.nombre) continue;
      out.push(row);
    }
    return out;
  }

  function importTerminadosFechasXLSX(){
    const xx = X();
    if (!xx){
      const m='La librería XLSX no está disponible. Recarga la página.';
      if (typeof showToast==='function') showToast('⚠ '+m); else alert(m); return;
    }
    /* Disparar input file */
    let input = document.getElementById('imp-term-file');
    if (input) input.remove();
    input = document.createElement('input');
    input.type='file';
    input.id='imp-term-file';
    input.accept='.xlsx,.xls';
    input.style.display='none';
    document.body.appendChild(input);
    input.addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const wb = xx.read(buf, { type:'array', cellDates:true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const hdr = _findHeaderRow(sheet);
        if (!hdr) {
          alert('No se reconoció el formato. Asegúrate de que la primera hoja tenga columnas "Resolución" y "Fecha de termino".');
          return;
        }
        const rows = _readSheet(sheet, hdr);
        if (!rows.length) { alert('La hoja no contiene filas con datos.'); return; }

        /* Match contra casos del usuario */
        const all = pickAllCases();
        const byResol = new Map();
        const byNombre = new Map();
        for (const c of all) {
          if (c.nueva_resolucion) byResol.set(_normResol(c.nueva_resolucion), c);
          if (c.numero_exp_interno) byNombre.set(_normResol(c.numero_exp_interno), c);
          if (c.name) byNombre.set(_normResol(c.name), c);
        }

        const matches = [];
        const nomatch = [];
        for (const r of rows){
          const k1 = _normResol(r.resolucion);
          let caso = byResol.get(k1);
          if (!caso) {
            const k2 = _normResol(r.nombre);
            caso = byNombre.get(k2);
          }
          if (caso) matches.push({ caso, row:r });
          else nomatch.push(r);
        }

        /* Calcular cuántos campos vamos a actualizar (solo vacíos) */
        let willWrite = 0, fieldStats = {fecha_resolucion_termino:0, caratula:0, propuesta:0, duracion_dias:0};
        for (const {caso,row} of matches){
          if (!caso.fecha_resolucion_termino && row.fecha_termino) { willWrite++; fieldStats.fecha_resolucion_termino++; }
          if (!caso.caratula && row.caratulado) { willWrite++; fieldStats.caratula++; }
          if (!caso.propuesta && row.decision) { willWrite++; fieldStats.propuesta++; }
          if ((caso.duracion_dias==null||caso.duracion_dias===0||caso.duracion_dias==='') && (typeof row.dias_tramitacion==='number'&&row.dias_tramitacion>0)) {
            willWrite++; fieldStats.duracion_dias++;
          }
        }

        const msg = `Resumen de la importación
─────────────────────────
Filas en archivo: ${rows.length}
Coincidentes con tus casos: ${matches.length}
Sin coincidencia: ${nomatch.length}

Campos a escribir (solo campos vacíos):
  · fecha_resolucion_termino: ${fieldStats.fecha_resolucion_termino}
  · caratula:                 ${fieldStats.caratula}
  · propuesta:                ${fieldStats.propuesta}
  · duracion_dias:            ${fieldStats.duracion_dias}

Total actualizaciones: ${willWrite}

¿Aplicar a la base de datos?
(No sobreescribirá datos que ya tengas)`;
        if (!confirm(msg)) return;

        const sb = SB();
        if (!sb || typeof sb.from !== 'function') { alert('Supabase no disponible.'); return; }

        let okCnt = 0, errCnt = 0, applied = 0;
        if (typeof showToast==='function') showToast('📥 Aplicando '+matches.length+' actualizaciones…');
        for (const {caso,row} of matches){
          const update = { updated_at: new Date().toISOString() };
          if (!caso.fecha_resolucion_termino && row.fecha_termino){
            const iso = _isoDate(row.fecha_termino); if (iso) update.fecha_resolucion_termino = iso;
          }
          if (!caso.caratula && row.caratulado){
            update.caratula = String(row.caratulado).trim();
          }
          if (!caso.propuesta && row.decision){
            const d = String(row.decision).trim();
            if (d) update.propuesta = (/sanci/i.test(d)?'Sanción':(/sobresei/i.test(d)?'Sobreseimiento':d));
          }
          if ((caso.duracion_dias==null||caso.duracion_dias===0||caso.duracion_dias==='') && typeof row.dias_tramitacion==='number' && row.dias_tramitacion>0){
            update.duracion_dias = Math.round(row.dias_tramitacion);
          }
          /* solo updated_at: nada cambió → saltar */
          if (Object.keys(update).length<=1) continue;
          applied++;
          try {
            const r = await sb.from('cases').update(update).eq('id', caso.id);
            if (r.error){ errCnt++; console.warn('[import-term] err '+caso.nueva_resolucion+':', r.error.message); }
            else {
              okCnt++;
              /* Reflejar in-memory para que un re-export inmediato muestre los nuevos datos */
              Object.assign(caso, update);
            }
          } catch(e){ errCnt++; console.warn('[import-term] excp:', e.message); }
        }

        const finalMsg = `✓ Importación completada
─────────────────────────
Actualizados: ${okCnt}
Errores: ${errCnt}
Sin cambios: ${matches.length-applied}
Sin match: ${nomatch.length}`;
        alert(finalMsg);
        if (typeof showToast==='function') showToast('✓ '+okCnt+' casos actualizados');

        /* Refrescar estadísticas y vista activa */
        try { if (typeof window.loadStats==='function') await window.loadStats(); } catch {}
      } catch (e) {
        console.error('[importTerminadosFechasXLSX] error:', e);
        alert('Error al procesar el archivo: '+e.message);
      } finally {
        input.value=''; /* permitir re-importar el mismo archivo */
      }
    }, { once:true });
    input.click();
  }

  /* ═══════════════════════════════════════════════════════════════
     INYECCIÓN DE BOTONES en la cabecera de Estadísticas
     Se hace tras cada renderDashboard (idéntico al patrón Gantt).
     ═══════════════════════════════════════════════════════════════ */
  function injectButtons() {
    if (typeof window.renderDashboard !== 'function') return false;
    if (window._impExpTermPatched) return true;
    const orig = window.renderDashboard;
    window.renderDashboard = function(){
      orig.apply(this, arguments);
      try {
        const header = document.querySelector('#viewDashboard div[style*="display:flex;gap:6px"]');
        if (header && !header.querySelector('[data-imp-term]')){
          /* Botón export compacto */
          const btnExp = document.createElement('button');
          btnExp.className='btn-sm';
          btnExp.dataset.impTerm='exp';
          btnExp.title='Procedimientos Terminados (formato compacto, igual a la planilla del usuario)';
          btnExp.style.cssText='background:#0f766e;color:#fff;font-weight:600';
          btnExp.innerHTML='📋 Proc. Terminados';
          btnExp.onclick=()=>exportTerminadosCompactoXLSX();
          /* Botón import */
          const btnImp = document.createElement('button');
          btnImp.className='btn-sm';
          btnImp.dataset.impTerm='imp';
          btnImp.title='Importar Excel con fechas de término (Procedimientos_Terminados.xlsx). Llena solo campos vacíos.';
          btnImp.style.cssText='background:#9333ea;color:#fff;font-weight:600';
          btnImp.innerHTML='📥 Importar Fechas Término';
          btnImp.onclick=()=>importTerminadosFechasXLSX();
          /* Insertar después del botón "📋 Plantilla Terminados" si existe */
          const refBtn = header.querySelector('button[onclick*="exportTerminadosTemplateXLSX"]');
          if (refBtn && refBtn.nextSibling) {
            header.insertBefore(btnExp, refBtn.nextSibling);
            header.insertBefore(btnImp, btnExp.nextSibling);
          } else {
            header.appendChild(btnExp);
            header.appendChild(btnImp);
          }
        }
      } catch(e){ console.warn('[imp-exp-term] inject err:', e.message); }
    };
    window._impExpTermPatched = true;
    console.log('[import-export-terminados] botones inyectados en Estadísticas');
    return true;
  }
  function tryInject(retries){
    retries = retries||0;
    if (injectButtons()) return;
    if (retries>50) return console.warn('[import-export-terminados] no se pudo inyectar tras 50 intentos');
    setTimeout(()=>tryInject(retries+1), 200);
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>tryInject());
  else tryInject();

  /* ── API global ─────────────────────────────────────────────── */
  window.exportTerminadosCompactoXLSX = exportTerminadosCompactoXLSX;
  window.importTerminadosFechasXLSX  = importTerminadosFechasXLSX;

  console.log('%c📋 Módulo Import/Export Terminados cargado','color:#0f766e;font-weight:bold');
})();
