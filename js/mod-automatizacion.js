/**
 * MOD-AUTOMATIZACION.JS — Orquestador de automatizaciones
 * ═══════════════════════════════════════════════════════════
 * Automatiza flujos que antes requerían múltiples clics manuales:
 *
 *  1. AUTO-SCAN DRIVE   → Detecta archivos nuevos periódicamente
 *  2. AUTO-OCR           → Procesa nuevos archivos importados automáticamente
 *  3. AUTO-ADVANCE       → Sugiere/aplica avance de etapa tras OCR
 *  4. PIPELINE DE ACTAS  → Audio → Transcripción → Estructura → Word (un solo clic)
 *
 * Patrón: IIFE auto-inyectable, sin dependencias duras.
 * Se activa al cargar y expone controles en window.automate.*
 */
(function(){
  'use strict';

  /* ═══════════════════════════════════════════
     CONFIGURACIÓN
     ═══════════════════════════════════════════ */
  const CFG = {
    DRIVE_SCAN_INTERVAL: 5 * 60 * 1000,   // 5 minutos
    OCR_BATCH_MAX: 8,                       // archivos por lote
    AUTO_ADVANCE_AFTER_OCR: true,           // avanzar etapa tras OCR
    PIPELINE_AUTO_EXPORT: true,             // exportar Word al final del pipeline
    NOTIFY_ON_NEW_FILES: true,              // toast al detectar archivos nuevos
    NOTIFY_ON_ADVANCE: true,                // toast al sugerir avance
    LOG_PREFIX: '[⚡ Auto]',
  };

  /* ═══════════════════════════════════════════
     ESTADO INTERNO
     ═══════════════════════════════════════════ */
  const state = {
    driveScanTimer: null,
    isScanning: false,
    isProcessingOCR: false,
    isPipelineRunning: false,
    lastScanTime: null,
    scanCount: 0,
    ocrQueue: [],           // {dilId, fileName, driveFileId}
    processedFiles: 0,
    pipelineStep: '',       // upload | transcribing | structuring | exporting | done
    enabled: true,          // master switch
  };

  /* ═══════════════════════════════════════════
     UTILIDADES
     ═══════════════════════════════════════════ */
  function log(...args){ console.log(CFG.LOG_PREFIX, ...args); }
  function warn(...args){ console.warn(CFG.LOG_PREFIX, ...args); }

  function toast(msg, type){
    if(typeof showToast==='function') showToast(msg, type);
    else log(msg);
  }

  function getToken(){
    try{ return typeof session!=='undefined' && session?.access_token ? session.access_token : ''; }
    catch{ return ''; }
  }

  async function apiFetch(fn, body){
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-auth-token': getToken() },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function getCurrentCase(){
    try{ return typeof currentCase!=='undefined' ? currentCase : null; }catch{ return null; }
  }

  function getSb(){
    try{ return typeof supabaseClient!=='undefined' ? supabaseClient : (typeof sb!=='undefined' ? sb : null); }
    catch{ return null; }
  }

  /* ═══════════════════════════════════════════
     1. AUTO-SCAN DRIVE — Detectar archivos nuevos
     ═══════════════════════════════════════════ */
  async function scanDriveForNewFiles(){
    if(state.isScanning) return;
    const caso = getCurrentCase();
    if(!caso?.drive_folder_url && !caso?.drive_folder_id) return;

    state.isScanning = true;
    state.lastScanTime = new Date();
    state.scanCount++;
    log('Escaneando Drive para caso:', caso.name||caso.id);
    updateAutomationUI();

    try{
      /* Extraer folder ID de la URL o campo directo */
      let folderId = caso.drive_folder_id || '';
      if(!folderId && caso.drive_folder_url){
        const m = caso.drive_folder_url.match(/folders\/([a-zA-Z0-9_-]+)/);
        if(m) folderId = m[1];
      }
      if(!folderId){ state.isScanning=false; return; }

      /* Obtener archivos actuales del Drive */
      let driveFiles = [];
      if(typeof window.DriveClient!=='undefined' && window.DriveClient.listFolder){
        const token = await window.DriveClient.getAccessToken();
        driveFiles = await window.DriveClient.listFolder(folderId, token);
      } else if(typeof listDriveFolder==='function'){
        driveFiles = await listDriveFolder(folderId);
      } else {
        warn('DriveClient no disponible');
        state.isScanning=false; return;
      }

      /* Obtener diligencias existentes para detectar nuevos */
      const supabase = getSb();
      if(!supabase){ state.isScanning=false; return; }
      const {data:existing} = await supabase.from('diligencias')
        .select('drive_file_id,file_name')
        .eq('case_id', caso.id);

      const existingIds = new Set((existing||[]).map(d=>d.drive_file_id).filter(Boolean));
      const existingNames = new Set((existing||[]).map(d=>d.file_name).filter(Boolean));

      /* Filtrar archivos nuevos (no carpetas) */
      const newFiles = driveFiles.filter(f =>
        f.mimeType !== 'application/vnd.google-apps.folder' &&
        !existingIds.has(f.id) &&
        !existingNames.has(f.name)
      );

      if(newFiles.length > 0){
        log(`${newFiles.length} archivo(s) nuevo(s) detectado(s)`);
        if(CFG.NOTIFY_ON_NEW_FILES){
          toast(`📂 ${newFiles.length} archivo(s) nuevo(s) en Drive`, 'info');
        }

        /* Auto-importar como diligencias */
        await autoImportFiles(caso, newFiles, supabase);
      } else {
        log('Sin archivos nuevos');
      }

    } catch(err){
      warn('Error escaneando Drive:', err.message);
    } finally {
      state.isScanning = false;
      updateAutomationUI();
    }
  }

  /* Importar archivos nuevos como diligencias y encolar OCR */
  async function autoImportFiles(caso, files, supabase){
    const userId = typeof session!=='undefined' ? session?.user?.id : null;
    const ocrCandidates = [];

    for(const f of files){
      /* Auto-clasificar tipo por nombre */
      const tipo = autoClassifyFile(f.name);

      const record = {
        case_id: caso.id,
        user_id: userId,
        file_name: f.name,
        drive_file_id: f.id,
        drive_web_link: f.webViewLink || '',
        mime_type: f.mimeType || '',
        diligencia_type: tipo,
        diligencia_label: tipo.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
        is_processed: false,
        processing_status: 'pending'
      };

      const {data, error} = await supabase.from('diligencias').insert(record).select().single();
      if(error){
        warn('Error insertando diligencia:', f.name, error.message);
        continue;
      }

      /* Encolar para OCR si es procesable */
      if(isOCRable(f.mimeType, f.name)){
        ocrCandidates.push({
          dilId: data.id,
          fileName: f.name,
          driveFileId: f.id,
          mimeType: f.mimeType
        });
      }
    }

    log(`Importados ${files.length} archivos, ${ocrCandidates.length} para OCR`);

    /* Iniciar auto-OCR si hay candidatos */
    if(ocrCandidates.length > 0){
      state.ocrQueue.push(...ocrCandidates);
      if(!state.isProcessingOCR) processOCRQueue();
    }
  }

  function autoClassifyFile(filename){
    const fn = (filename||'').toLowerCase();
    if(/denuncia/i.test(fn)) return 'denuncia';
    if(/resoluci[oó]n.*inicio|inicio.*resoluci/i.test(fn)) return 'resolucion_inicio';
    if(/resoluci[oó]n/i.test(fn)) return 'resolucion';
    if(/declaraci[oó]n.*test|test.*declaraci/i.test(fn)) return 'declaracion_testigo';
    if(/declaraci[oó]n.*denunciante/i.test(fn)) return 'declaracion_denunciante';
    if(/declaraci[oó]n.*denunciad/i.test(fn)) return 'declaracion_denunciado';
    if(/declaraci[oó]n|acta/i.test(fn)) return 'acta';
    if(/oficio/i.test(fn)) return 'oficio';
    if(/informe/i.test(fn)) return 'informe';
    if(/notificaci[oó]n/i.test(fn)) return 'notificacion';
    if(/cargo/i.test(fn)) return 'cargos';
    if(/descargo/i.test(fn)) return 'descargos';
    if(/vista.*fiscal|informe.*fiscal/i.test(fn)) return 'vista_fiscal';
    if(/prueba/i.test(fn)) return 'prueba_documental';
    return 'otro';
  }

  function isOCRable(mimeType, name){
    const ext = (name||'').split('.').pop().toLowerCase();
    const ocrMimes = ['application/pdf','image/png','image/jpeg','image/jpg','image/tiff','image/webp'];
    const ocrExts = ['pdf','png','jpg','jpeg','tiff','tif','webp'];
    return ocrMimes.includes(mimeType) || ocrExts.includes(ext);
  }

  /* ═══════════════════════════════════════════
     2. AUTO-OCR — Procesar cola de archivos
     ═══════════════════════════════════════════ */
  async function processOCRQueue(){
    if(state.isProcessingOCR || state.ocrQueue.length === 0) return;

    state.isProcessingOCR = true;
    log(`Procesando cola OCR: ${state.ocrQueue.length} archivo(s)`);
    toast(`🔍 Procesando OCR: ${state.ocrQueue.length} archivo(s)…`, 'info');
    updateAutomationUI();

    const supabase = getSb();
    const processedDiligencias = [];

    /* Bug-fix: envolver el while en try/finally para garantizar que
       isProcessingOCR se resetea SIEMPRE (incluso si el .update() del catch
       lanza por error de Supabase). Antes podía quedar en true para siempre,
       bloqueando el procesamiento de la cola permanentemente. */
    try {
      while(state.ocrQueue.length > 0){
        const item = state.ocrQueue.shift();
        try{
          /* Marcar como procesando */
          if(supabase){
            await supabase.from('diligencias')
              .update({processing_status:'processing'})
              .eq('id', item.dilId);
          }

          /* Llamar OCR (stage 1: extract) */
          log(`OCR: ${item.fileName}`);
          const result = await apiFetch('ocr', {
            action: 'extract',
            fileId: item.driveFileId,
            fileName: item.fileName
          });

          if(result.ok && result.extractedText){
            /* Guardar resultado en Supabase */
            if(supabase){
              await supabase.from('diligencias').update({
                extracted_text: result.extractedText,
                ai_summary: result.aiSummary || '',
                is_processed: true,
                processing_status: 'completed'
              }).eq('id', item.dilId);
            }

            processedDiligencias.push({
              ...item,
              extractedText: result.extractedText,
              aiSummary: result.aiSummary
            });
            state.processedFiles++;
            log(`✓ OCR completado: ${item.fileName} (${result.extractedText.length} chars)`);
          } else {
            throw new Error(result.error || 'Sin texto extraído');
          }

        } catch(err){
          warn(`✗ OCR falló: ${item.fileName}:`, err.message);
          /* Bug-fix: el update de error envuelto en try aparte para que un fallo
             secundario no aborte el bucle ni deje isProcessingOCR colgado. */
          if(supabase){
            try {
              await supabase.from('diligencias')
                .update({processing_status:'error'})
                .eq('id', item.dilId);
            } catch (e) {
              warn('No se pudo marcar dil como error:', e.message);
            }
          }
        }
      }
    } finally {
      state.isProcessingOCR = false;
      updateAutomationUI();
    }

    if(processedDiligencias.length > 0){
      toast(`✓ OCR completado: ${processedDiligencias.length} archivo(s)`, 'success');
      /* Trigger auto-advance si está habilitado */
      if(CFG.AUTO_ADVANCE_AFTER_OCR){
        await autoAdvanceAfterOCR(processedDiligencias);
      }
    }
  }

  /* ═══════════════════════════════════════════
     3. AUTO-ADVANCE — Sugerir avance de etapa
     ═══════════════════════════════════════════ */
  async function autoAdvanceAfterOCR(processedDiligencias){
    const caso = getCurrentCase();
    if(!caso) return;

    log('Analizando avance de etapa tras OCR…');

    try{
      /* Obtener todas las diligencias del caso con texto */
      const supabase = getSb();
      const {data:allDils} = await supabase.from('diligencias')
        .select('id,diligencia_type,diligencia_label,extracted_text,ai_summary')
        .eq('case_id', caso.id)
        .eq('is_processed', true);

      if(!allDils || allDils.length === 0) return;

      /* Preparar datos para auto-advance */
      const dilsForAnalysis = allDils.map(d => ({
        type: d.diligencia_type,
        label: d.diligencia_label,
        text: (d.extracted_text||'').substring(0, 2000),
        summary: d.ai_summary || ''
      }));

      const result = await apiFetch('auto-advance', {
        action: 'analyze',
        caseId: caso.id,
        currentStage: caso.estado_procedimiento || '',
        diligencias: dilsForAnalysis
      });

      if(result.suggestedStage && result.suggestedStage !== (caso.estado_procedimiento||'')){
        log(`Sugerencia de avance: ${caso.estado_procedimiento||'(sin etapa)'} → ${result.suggestedStage}`);

        if(CFG.NOTIFY_ON_ADVANCE){
          toast(`📊 Etapa sugerida: ${result.suggestedStage}${result.confidence ? ' ('+Math.round(result.confidence*100)+'%)' : ''}`, 'info');
        }

        /* Mostrar notificación interactiva con botón para aplicar */
        showAdvanceSuggestion(caso, result);
      }

    } catch(err){
      warn('Error en auto-advance:', err.message);
    }
  }

  function showAdvanceSuggestion(caso, result){
    /* Crear notificación no-intrusiva en el panel */
    const existing = document.getElementById('autoAdvanceBanner');
    if(existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'autoAdvanceBanner';
    banner.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--surface2,#1a1a2e);border:1px solid var(--gold,#d4a843);border-radius:10px;padding:14px 18px;z-index:9999;max-width:360px;box-shadow:0 4px 20px rgba(0,0,0,.3);font-family:var(--font-body,sans-serif);';
    banner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong style="color:var(--gold,#d4a843);font-size:13px;">📊 Avance de Etapa Sugerido</strong>
        <span onclick="this.parentElement.parentElement.remove()" style="cursor:pointer;color:var(--text-dim,#888);font-size:16px;">&times;</span>
      </div>
      <p style="margin:0 0 6px;font-size:12px;color:var(--text,#e0e0e0);line-height:1.5;">
        <strong>${esc(caso.estado_procedimiento||'Sin etapa')}</strong> → <strong style="color:var(--gold,#d4a843);">${esc(result.suggestedStage)}</strong>
      </p>
      ${result.reason ? `<p style="margin:0 0 10px;font-size:11px;color:var(--text-dim,#999);line-height:1.4;">${esc(result.reason)}</p>` : ''}
      <div style="display:flex;gap:8px;">
        <button data-case-id="${esc(caso.id)}" data-stage="${esc(result.suggestedStage)}" onclick="window.automate.applyAdvance(this.dataset.caseId,this.dataset.stage);this.parentElement.parentElement.remove();"
          style="background:var(--gold,#d4a843);color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:11px;cursor:pointer;">
          ✓ Aplicar
        </button>
        <button onclick="this.parentElement.parentElement.remove();"
          style="background:transparent;color:var(--text-dim,#888);border:1px solid var(--border,#333);padding:6px 14px;border-radius:6px;font-size:11px;cursor:pointer;">
          Ignorar
        </button>
      </div>
    `;
    document.body.appendChild(banner);

    /* Auto-dismiss después de 30 segundos */
    setTimeout(()=>{ if(banner.parentElement) banner.remove(); }, 30000);
  }

  async function applyAdvance(caseId, newStage){
    const supabase = getSb();
    if(!supabase) return;

    try{
      const {error} = await supabase.from('cases')
        .update({estado_procedimiento: newStage})
        .eq('id', caseId);

      if(error) throw error;

      /* Actualizar caso en memoria */
      const caso = getCurrentCase();
      if(caso && caso.id === caseId){
        caso.estado_procedimiento = newStage;
      }
      /* Actualizar allCases */
      if(typeof allCases!=='undefined'){
        const c = allCases.find(c=>c.id===caseId);
        if(c) c.estado_procedimiento = newStage;
      }

      toast(`✓ Etapa actualizada a: ${newStage}`, 'success');
      log(`Etapa aplicada: ${newStage}`);

      /* Refrescar UI si hay función disponible */
      if(typeof renderTabla==='function') renderTabla();
      if(typeof renderStepperEtapas==='function') renderStepperEtapas();

    } catch(err){
      toast('Error actualizando etapa: '+err.message, 'error');
    }
  }

  /* ═══════════════════════════════════════════
     4. PIPELINE CONTINUO DE ACTAS
     Audio → Transcripción → Estructura → Word
     ═══════════════════════════════════════════ */
  async function runActaPipeline(audioFile, options = {}){
    if(state.isPipelineRunning){
      toast('⚠ Ya hay un pipeline en ejecución', 'warning');
      return;
    }

    const defaults = {
      mode: 'directa',           // directa | pregunta_respuesta | con_expediente | fill_acta
      tipoDeclarante: 'testigo', // testigo | denunciante | denunciado | otro
      nombreDeclarante: '',
      fecha: '',
      lugar: '',
      autoExport: CFG.PIPELINE_AUTO_EXPORT,
      baseDocText: ''            // para fill_acta
    };
    const opts = { ...defaults, ...options };

    state.isPipelineRunning = true;
    state.pipelineStep = 'upload';
    log('Pipeline de actas iniciado:', opts.mode, opts.tipoDeclarante);
    updateAutomationUI();

    try{
      /* PASO 1: Validar audio */
      if(!audioFile || !audioFile.size){
        throw new Error('No se proporcionó archivo de audio');
      }
      const sizeMB = audioFile.size / (1024*1024);
      if(sizeMB > 200){
        throw new Error(`Archivo demasiado grande: ${sizeMB.toFixed(1)}MB (máx 200MB)`);
      }

      toast(`🎙️ Pipeline: procesando ${audioFile.name} (${sizeMB.toFixed(1)}MB)…`, 'info');

      /* PASO 2: Transcribir audio */
      state.pipelineStep = 'transcribing';
      updateAutomationUI();
      log('Paso 1/3: Transcribiendo audio…');

      const rawText = await transcribeAudio(audioFile);
      if(!rawText || rawText.length < 20){
        throw new Error('Transcripción vacía o demasiado corta');
      }
      log(`Transcripción: ${rawText.length} caracteres`);

      /* PASO 3: Estructurar con IA */
      state.pipelineStep = 'structuring';
      updateAutomationUI();
      log('Paso 2/3: Estructurando acta…');

      /* Construir contexto del caso */
      const caso = getCurrentCase();
      const tipoLabel = {testigo:'testigo',denunciante:'denunciante',denunciado:'persona denunciada',otro:'compareciente'}[opts.tipoDeclarante]||'declarante';
      const tipoActaLabel = {testigo:'DECLARACIÓN DE TESTIGO',denunciante:'RATIFICACIÓN DE DENUNCIA',denunciado:'DECLARACIÓN DE PERSONA DENUNCIADA',otro:'DILIGENCIA'}[opts.tipoDeclarante]||'DECLARACIÓN';
      const fechaStr = opts.fecha
        ? new Date(opts.fecha+'T12:00:00').toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
        : new Date().toLocaleDateString('es-CL',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

      let caseCtx = `\nMETADATOS DEL ACTA:\n- Tipo: ${tipoActaLabel}\n- Declarante: ${opts.nombreDeclarante||'[COMPLETAR NOMBRE]'}\n- Calidad procesal: ${tipoLabel}\n- Fecha: ${fechaStr}\n- Lugar: ${opts.lugar||'[COMPLETAR]'}`;

      if(caso){
        caseCtx += `\n\nDATOS DEL EXPEDIENTE:\n- Expediente: ${caso.name||'[EXPEDIENTE]'}\n- ROL: ${caso.rol||'[ROL]'}\n- Tipo: ${caso.tipo_procedimiento||'[TIPO]'}\n- Materia: ${caso.materia||'[MATERIA]'}`;
      }

      const mode = opts.baseDocText ? 'fill_acta' : (caso ? 'con_expediente' : opts.mode);

      const structResult = await apiFetch('structure', {
        rawText: rawText,
        mode: mode,
        caseContext: caseCtx,
        baseDocText: opts.baseDocText || ''
      });

      if(!structResult.ok || !structResult.structuredText){
        throw new Error(structResult.error || 'No se generó texto estructurado');
      }

      const structuredText = structResult.structuredText;
      log(`Acta estructurada: ${structuredText.length} caracteres`);

      /* PASO 4: Exportar a Word */
      state.pipelineStep = 'exporting';
      updateAutomationUI();

      /* Guardar en el objeto transcripcion para que exportActaToWord funcione */
      if(typeof transcripcion !== 'undefined'){
        transcripcion.structuredText = structuredText;
        transcripcion.rawText = rawText;
        transcripcion.meta = transcripcion.meta || {};
        transcripcion.meta.tipoDeclarante = opts.tipoDeclarante;
        transcripcion.meta.nombreDeclarante = opts.nombreDeclarante;
        transcripcion.meta.fecha = opts.fecha;
        transcripcion.meta.lugar = opts.lugar;
        transcripcion.linkedCase = caso;
      }

      if(opts.autoExport && typeof exportActaToWord === 'function'){
        log('Paso 3/3: Exportando a Word…');
        await exportActaToWord();
        toast('✅ Pipeline completo: Acta generada y descargada', 'success');
      } else {
        toast('✅ Pipeline completo: Acta lista para revisión', 'success');
      }

      state.pipelineStep = 'done';
      updateAutomationUI();
      log('Pipeline completado exitosamente');

      return { rawText, structuredText, mode };

    } catch(err){
      warn('Error en pipeline:', err.message);
      toast('❌ Pipeline: '+err.message, 'error');
      state.pipelineStep = '';
      throw err;
    } finally {
      state.isPipelineRunning = false;
      updateAutomationUI();
    }
  }

  /* Transcribir audio vía chat.js endpoint (Whisper/ElevenLabs) */
  async function transcribeAudio(file){
    const formData = new FormData();
    formData.append('audio', file);

    const res = await fetch('/.netlify/functions/chat', {
      method: 'POST',
      headers: { 'x-auth-token': getToken() },
      body: formData
    });

    if(!res.ok){
      const err = await res.json().catch(()=>({}));
      throw new Error(err.error || `Transcripción falló: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.text || data.transcription || '';
  }

  /* ═══════════════════════════════════════════
     DRIVE SCAN — Control de polling periódico
     ═══════════════════════════════════════════ */
  function startDriveScan(){
    if(state.driveScanTimer) return;
    log('Drive scan iniciado (cada', CFG.DRIVE_SCAN_INTERVAL/1000, 's)');
    /* Scan inmediato + periódico */
    scanDriveForNewFiles();
    state.driveScanTimer = setInterval(scanDriveForNewFiles, CFG.DRIVE_SCAN_INTERVAL);
  }

  function stopDriveScan(){
    if(state.driveScanTimer){
      clearInterval(state.driveScanTimer);
      state.driveScanTimer = null;
      log('Drive scan detenido');
    }
  }

  /* ═══════════════════════════════════════════
     UI — Panel de automatización
     ═══════════════════════════════════════════ */
  function injectCSS(){
    if(document.getElementById('mod-auto-css')) return;
    const s = document.createElement('style');
    s.id = 'mod-auto-css';
    s.textContent = `
      .auto-panel { background:var(--surface2,#1a1a2e); border:1px solid var(--border,#2a2a3e); border-radius:var(--radius,8px); padding:14px 16px; margin-bottom:12px; }
      .auto-panel h4 { margin:0 0 10px; font-size:13px; color:var(--gold,#d4a843); display:flex; align-items:center; gap:8px; }
      .auto-status { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
      .auto-chip { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:12px; font-size:10.5px; font-weight:600; }
      .auto-chip.active { background:rgba(34,197,94,.12); color:#22c55e; }
      .auto-chip.idle { background:rgba(148,163,184,.1); color:var(--text-dim,#94a3b8); }
      .auto-chip.busy { background:rgba(245,158,11,.12); color:#f59e0b; animation:autoPulse 1.5s infinite; }
      @keyframes autoPulse { 0%,100%{opacity:1} 50%{opacity:.6} }
      .auto-controls { display:flex; gap:8px; flex-wrap:wrap; }
      .auto-btn { padding:6px 14px; border-radius:6px; font-size:11px; cursor:pointer; border:none; font-family:var(--font-body,sans-serif); transition:opacity .15s; }
      .auto-btn:hover { opacity:.85; }
      .auto-btn:disabled { opacity:.4; cursor:not-allowed; }
      .auto-btn-primary { background:var(--gold,#d4a843); color:#fff; }
      .auto-btn-outline { background:transparent; color:var(--gold,#d4a843); border:1px solid var(--gold,#d4a843); }
      .auto-btn-danger { background:transparent; color:#ef4444; border:1px solid #ef4444; }
      .auto-pipeline-steps { display:flex; gap:4px; margin:10px 0; }
      .auto-step { flex:1; text-align:center; padding:6px 4px; border-radius:6px; font-size:10px; background:var(--bg,#0f0f1a); color:var(--text-dim,#888); border:1px solid var(--border,#2a2a3e); }
      .auto-step.active { background:rgba(212,168,67,.15); color:var(--gold,#d4a843); border-color:var(--gold,#d4a843); }
      .auto-step.done { background:rgba(34,197,94,.1); color:#22c55e; border-color:#22c55e; }
      .auto-pipeline-upload { border:2px dashed var(--border,#2a2a3e); border-radius:8px; padding:20px; text-align:center; cursor:pointer; transition:border-color .2s; }
      .auto-pipeline-upload:hover { border-color:var(--gold,#d4a843); }
      .auto-pipeline-upload.dragover { border-color:var(--gold,#d4a843); background:rgba(212,168,67,.05); }
    `;
    document.head.appendChild(s);
  }

  /* Generar HTML del panel de automatización */
  function renderAutomationPanel(){
    const scanStatus = state.driveScanTimer ? 'active' : 'idle';
    const ocrStatus = state.isProcessingOCR ? 'busy' : (state.ocrQueue.length > 0 ? 'busy' : 'idle');
    const pipelineStatus = state.isPipelineRunning ? 'busy' : 'idle';

    const pipelineSteps = ['upload','transcribing','structuring','exporting','done'];
    const stepLabels = ['📁 Audio','🎙️ Transcribir','📝 Estructurar','📄 Word','✅ Listo'];

    return `
      <div class="auto-panel">
        <h4>⚡ Centro de Automatización</h4>

        <div class="auto-status">
          <span class="auto-chip ${scanStatus}">📂 Drive Scan: ${scanStatus==='active'?'Activo':'Inactivo'}</span>
          <span class="auto-chip ${ocrStatus}">🔍 OCR: ${ocrStatus==='busy'?'Procesando ('+state.ocrQueue.length+')':'Listo'}</span>
          <span class="auto-chip ${pipelineStatus}">📋 Pipeline: ${pipelineStatus==='busy'?'En curso':'Listo'}</span>
          ${state.lastScanTime ? `<span class="auto-chip idle">Último scan: ${state.lastScanTime.toLocaleTimeString('es-CL')}</span>` : ''}
        </div>

        <div class="auto-controls">
          <button class="auto-btn auto-btn-primary" onclick="window.automate.toggleDriveScan()" ${!getCurrentCase()?'disabled':''}>
            ${state.driveScanTimer ? '⏹ Detener Scan' : '▶ Iniciar Scan Drive'}
          </button>
          <button class="auto-btn auto-btn-outline" onclick="window.automate.scanNow()" ${state.isScanning||!getCurrentCase()?'disabled':''}>
            🔄 Escanear Ahora
          </button>
          <button class="auto-btn auto-btn-outline" onclick="window.automate.processQueue()" ${state.ocrQueue.length===0?'disabled':''}>
            🔍 Procesar OCR (${state.ocrQueue.length})
          </button>
        </div>
      </div>

      <div class="auto-panel">
        <h4>🎙️ Pipeline de Actas — Un Solo Clic</h4>
        <p style="font-size:11px;color:var(--text-dim);margin:0 0 10px;line-height:1.5;">
          Sube un audio y se procesará automáticamente: transcripción → estructuración como Texto Refundido → exportación a Word.
        </p>

        <div class="auto-pipeline-steps">
          ${pipelineSteps.map((step, i) => {
            const isCurrent = state.pipelineStep === step;
            const isDone = pipelineSteps.indexOf(state.pipelineStep) > i || state.pipelineStep === 'done';
            return `<div class="auto-step ${isCurrent?'active':''} ${isDone?'done':''}">${stepLabels[i]}</div>`;
          }).join('')}
        </div>

        <div class="auto-pipeline-upload" id="autoPipelineDrop"
          ondragover="event.preventDefault();this.classList.add('dragover')"
          ondragleave="this.classList.remove('dragover')"
          ondrop="event.preventDefault();this.classList.remove('dragover');window.automate.handlePipelineDrop(event)"
          onclick="document.getElementById('autoPipelineInput').click()">
          <div style="font-size:24px;margin-bottom:6px;">🎙️</div>
          <div style="font-size:12px;color:var(--text,#e0e0e0);">
            ${state.isPipelineRunning
              ? '<strong>Procesando…</strong> ' + (state.pipelineStep||'')
              : 'Arrastra un audio aquí o haz clic para seleccionar'}
          </div>
          <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">MP3, WAV, M4A, OGG, OPUS (máx 200MB)</div>
        </div>
        <input type="file" id="autoPipelineInput" accept="audio/*,.mp3,.wav,.m4a,.ogg,.opus,.flac,.wma,.amr,.aac,.webm,.weba"
          style="display:none" onchange="window.automate.handlePipelineFile(this)"/>

        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <select id="autoPipelineTipo" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;">
            <option value="testigo">Testigo</option>
            <option value="denunciante">Denunciante</option>
            <option value="denunciado">Denunciado/a</option>
            <option value="otro">Otro</option>
          </select>
          <input id="autoPipelineNombre" placeholder="Nombre declarante" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;min-width:120px;"/>
          <select id="autoPipelineMode" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;">
            <option value="directa">Acta Directa</option>
            <option value="pregunta_respuesta">Pregunta-Respuesta</option>
            <option value="con_expediente" selected>Con Expediente</option>
          </select>
        </div>
      </div>
    `;
  }

  function updateAutomationUI(){
    const container = document.getElementById('automationPanelContent');
    if(container) container.innerHTML = renderAutomationPanel();
  }

  /* ═══════════════════════════════════════════
     INYECCIÓN EN PESTAÑA IA
     ═══════════════════════════════════════════ */
  function injectIntoIATab(){
    /* Buscar el panel de inteligencia y prepend el panel de automatización */
    const iaTab = document.getElementById('tabInteligencia');
    if(!iaTab) return;

    /* Solo inyectar si no existe */
    if(document.getElementById('automationPanelContent')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'automationPanelContent';
    wrapper.innerHTML = renderAutomationPanel();
    iaTab.prepend(wrapper);
  }

  /* Observar cuando se abre la pestaña IA */
  function watchForIATab(){
    const observer = new MutationObserver(()=>{
      if(document.getElementById('tabInteligencia') && !document.getElementById('automationPanelContent')){
        injectIntoIATab();
        observer.disconnect();
      }
    });
    observer.observe(document.body, {childList:true, subtree:true});
  }

  /* ═══════════════════════════════════════════
     HANDLER: Pipeline drop / file select
     ═══════════════════════════════════════════ */
  function handlePipelineDrop(event){
    const files = event.dataTransfer?.files;
    if(files && files.length > 0) startPipelineWithFile(files[0]);
  }

  function handlePipelineFile(input){
    if(input.files && input.files.length > 0){
      startPipelineWithFile(input.files[0]);
      input.value = '';
    }
  }

  function startPipelineWithFile(file){
    const tipo = document.getElementById('autoPipelineTipo')?.value || 'testigo';
    const nombre = document.getElementById('autoPipelineNombre')?.value || '';
    const mode = document.getElementById('autoPipelineMode')?.value || 'directa';

    runActaPipeline(file, {
      tipoDeclarante: tipo,
      nombreDeclarante: nombre,
      mode: mode
    });
  }

  /* ═══════════════════════════════════════════
     INICIALIZACIÓN
     ═══════════════════════════════════════════ */
  function init(){
    injectCSS();
    watchForIATab();
    log('Módulo de automatización cargado');

    /* Auto-iniciar Drive scan si hay caso abierto con carpeta Drive */
    setTimeout(()=>{
      const caso = getCurrentCase();
      if(caso && (caso.drive_folder_url || caso.drive_folder_id)){
        /* No auto-start para no consumir recursos; el usuario activa manualmente */
        log('Drive folder detectado — scan disponible');
      }
    }, 3000);
  }

  /* ═══════════════════════════════════════════
     API PÚBLICA — window.automate
     ═══════════════════════════════════════════ */
  window.automate = {
    /* Estado */
    getState: () => ({...state}),
    getConfig: () => ({...CFG}),

    /* Drive scan */
    toggleDriveScan: () => state.driveScanTimer ? stopDriveScan() : startDriveScan(),
    scanNow: scanDriveForNewFiles,
    startDriveScan,
    stopDriveScan,

    /* OCR */
    processQueue: processOCRQueue,

    /* Auto-advance */
    applyAdvance,

    /* Pipeline */
    runActaPipeline,
    handlePipelineDrop,
    handlePipelineFile,

    /* UI */
    refresh: updateAutomationUI,

    /* Config */
    configure: (overrides) => Object.assign(CFG, overrides),
  };

  /* Iniciar cuando el DOM esté listo */
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
