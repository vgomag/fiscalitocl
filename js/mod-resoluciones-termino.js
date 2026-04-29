/* ══════════════════════════════════════════════════════════════════════
   MOD-RESOLUCIONES-TERMINO.JS — Plataforma de redacción de resoluciones
   v1.0 · 2026-04-29 · Fiscalito / UMAG
   ══════════════════════════════════════════════════════════════════════
   Plataforma robusta para redactar resoluciones de término de la
   autoridad sobre casos en la pestaña "Finalización":

   - Biblioteca de modelos PDF (tabla resoluciones_termino_modelos)
   - Auto-detección del tipo según datos del caso
   - Generación con IA usando el modelo más relevante como referencia
   - Editor con autoguardado
   - Versionado de borradores (tabla resoluciones_drafts)
   - Estados: borrador → en_revision → aprobado → firmado
   - Exportar a Word
   - Subir PDF firmado al campo informe_final del caso

   Tipos soportados:
     A) sobreseimiento_cese     — Art. 157 letra b (cese antes de instrucción)
     B) sancion_vista_fiscal    — Sumario completo con sanción
     C) acto_termino            — Acto administrativo tras sanción firme
     D) sumario_estudiantes     — Reglamento Alumnos (Decreto 005/SU/2019)

   API expuesta en window:
     - openResolucionRedactor(caseId)   abre el modal para un caso
     - closeResolucionRedactor()        cierra el modal
     - resolGenerarBorrador()           dispara generación con IA
     - resolGuardarVersion()            guarda versión actual del editor
     - resolMarcarEstado(estado)        cambia status del draft
     - resolDescargarWord()             exporta el draft a docx
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _sb = () => typeof sb !== 'undefined' ? sb : (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
const _esc = (typeof esc === 'function') ? esc : (s => String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])));
const _toast = (msg, dur) => (typeof showToast==='function')?showToast(msg, dur):console.log('[resol]', msg);

/* ── Tipos de resolución soportados ── */
const TIPOS = {
  sobreseimiento_cese:   { label: 'Sobreseimiento por cese de funciones', icon: '⚖️', color: '#3b82f6',
    desc: 'Art. 157 letra b · cuando la persona ya había cesado al instruirse el sumario' },
  sancion_vista_fiscal:  { label: 'Sanción tras Vista Fiscal completa',   icon: '📜', color: '#f59e0b',
    desc: 'Sumario con relación de hechos, descargos, ponderación de prueba y sanción aplicada' },
  acto_termino:          { label: 'Acto de Término tras sanción firme',   icon: '✅', color: '#10b981',
    desc: 'Cierre formal cuando la sanción ya está firme (sin recursos pendientes)' },
  sumario_estudiantes:   { label: 'Sumario contra Estudiantes',           icon: '🎓', color: '#8b5cf6',
    desc: 'Reglamento General de Alumnos (Decreto 005/SU/2019) y Decreto 21/SU/2025' }
};

/* ── Estados del borrador ── */
const STATUS_LABELS = {
  borrador:    { label: 'Borrador',         icon: '📝', color: '#6b7280' },
  en_revision: { label: 'En revisión',      icon: '👀', color: '#3b82f6' },
  aprobado:    { label: 'Aprobado',         icon: '✓',  color: '#10b981' },
  firmado:     { label: 'Firmado',          icon: '🔏', color: '#059669' },
  descartado:  { label: 'Descartado',       icon: '✕',  color: '#ef4444' }
};

/* ══════════════════════════════════════════════════════════════════════
   ESTADO INTERNO DEL MODAL
   ══════════════════════════════════════════════════════════════════════ */
const state = {
  open: false,
  caseId: null,
  caseObj: null,
  modelos: [],          // todos los modelos del usuario, agrupados por tipo
  drafts: [],           // todos los drafts del caso (versionados)
  currentDraft: null,   // draft activo en el editor
  selectedTipo: null,   // tipo elegido manualmente o auto-detectado
  selectedModeloId: null,
  /* Memo Jurídico — pieza CRÍTICA del prompt. Puede venir:
     (a) auto-detectado desde la carpeta Drive del caso
     (b) subido manualmente por la fiscal vía la zona de upload
     Almacenamos: el nombre, la fuente, y el texto extraído. */
  memoJuridico: null,   // { source: 'drive'|'upload', fileName, text, fileId? }
  memoLoading: false,
  saving: false,
  generating: false,
  autosaveTimer: null
};

/* ══════════════════════════════════════════════════════════════════════
   AUTO-DETECCIÓN DE TIPO segun datos del caso
   ══════════════════════════════════════════════════════════════════════ */
function detectarTipoSugerido(caseObj){
  if(!caseObj) return null;
  const r   = (caseObj.resultado || caseObj.propuesta || '').toLowerCase();
  const tp  = (caseObj.tipo_procedimiento || '').toLowerCase();
  const proto = (caseObj.protocolo || '').toLowerCase();
  const mat = (caseObj.materia || '').toLowerCase();
  const inf = (caseObj.informe_final || '').length;

  /* D) Sumario contra estudiantes — protocolo o tipo lo indican */
  if(tp.includes('estudiante') || proto.includes('alumno') || proto.includes('reglamento estudiante') || proto.includes('005/su') || proto.includes('21/su'))
    return 'sumario_estudiantes';

  /* A) Sobreseimiento por cese — resultado=Sobreseimiento (variantes) */
  if(r.includes('sobreseim')) return 'sobreseimiento_cese';

  /* C) Acto de término — sancion firme + plazo recursivo agotado.
     Heurística: hay informe_final largo (vista ya redactada) Y resultado
     es una sanción (Censura, Multa, Suspensión, Destitución). */
  const sanciones = ['censura','multa','suspensi','destituci','amonestaci','absolu'];
  const esSancion = sanciones.some(s => r.includes(s));
  if(esSancion && inf > 500) return 'acto_termino';

  /* B) Sanción tras Vista Fiscal — el caso tiene informe_final pero aún no
     hay resolución que aplique sanción ⇒ esto es la primera resolución de
     término que aprueba la vista. */
  if(esSancion || inf > 100) return 'sancion_vista_fiscal';

  /* Fallback */
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   CARGA DE DATOS
   ══════════════════════════════════════════════════════════════════════ */
async function loadModelos(){
  const s = _sb(); if(!s) return [];
  const { data, error } = await s.from('resoluciones_termino_modelos')
    .select('id,tipo,nombre,numero_resolucion,resultado,descripcion,is_default,pdf_storage_path,updated_at')
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if(error){ console.warn('[resol] loadModelos error:', error); return []; }
  return data || [];
}

async function loadDrafts(caseId){
  const s = _sb(); if(!s || !caseId) return [];
  const { data, error } = await s.from('resoluciones_drafts')
    .select('*')
    .eq('case_id', caseId)
    .order('version', { ascending: false });
  if(error){ console.warn('[resol] loadDrafts error:', error); return []; }
  return data || [];
}

async function loadModeloContenido(modeloId){
  const s = _sb(); if(!s || !modeloId) return null;
  const { data, error } = await s.from('resoluciones_termino_modelos')
    .select('content_text,nombre,tipo')
    .eq('id', modeloId)
    .single();
  if(error){ console.warn('[resol] loadModeloContenido error:', error); return null; }
  return data;
}

/* ══════════════════════════════════════════════════════════════════════
   CARGA DE CONTEXTO DEL CASO (para inyectar a la IA al generar)
   ══════════════════════════════════════════════════════════════════════ */
async function buildCaseContext(c){
  if(!c) return '';
  const s = _sb();
  const fmtArr = v => Array.isArray(v) ? v.join(', ') : (v || '—');

  let ctx = `## DATOS DEL EXPEDIENTE\n` +
    `- Nombre/ROL: ${c.name||'—'}\n` +
    `- Resolución que instruye: ${c.nueva_resolucion||'—'}\n` +
    `- Carátula: ${c.caratula||'—'}\n` +
    `- Tipo de procedimiento: ${c.tipo_procedimiento||'—'}\n` +
    `- Materia: ${c.materia||'—'}\n` +
    `- Protocolo: ${c.protocolo||'—'}\n` +
    `- Estado procedimiento: ${c.estado_procedimiento||'—'}\n` +
    `- Resultado/Propuesta: ${c.resultado||c.propuesta||'—'}\n` +
    `- Fecha denuncia: ${c.fecha_denuncia||'—'}\n` +
    `- Fecha recepción fiscalía: ${c.fecha_recepcion_fiscalia||'—'}\n` +
    `- Fecha vista fiscal: ${c.fecha_vista||'—'}\n` +
    `- Denunciante(s): ${fmtArr(c.denunciantes)}\n` +
    `- Estamento denunciante: ${fmtArr(c.estamentos_denunciante)}\n` +
    `- Carrera/Dep. denunciante: ${c.carrera_denunciante||'—'}\n` +
    `- Denunciado/a(s): ${fmtArr(c.denunciados)}\n` +
    `- Estamento denunciado: ${fmtArr(c.estamentos_denunciado)}\n` +
    `- Carrera/Dep. denunciado: ${c.carrera_denunciado||'—'}\n` +
    `- Resolución término: ${c.resolucion_termino||'—'}\n` +
    `- Fecha resolución término: ${c.fecha_resolucion_termino||'—'}\n`;

  if(c.informe_final && c.informe_final.length > 50){
    ctx += `\n## VISTA FISCAL / INFORME (texto completo del caso)\n${c.informe_final}\n`;
  }
  if(c.description){
    ctx += `\n## DESCRIPCIÓN ADICIONAL\n${c.description}\n`;
  }

  /* Diligencias resumidas */
  if(s){
    try{
      const { data: dils } = await s.from('diligencias')
        .select('diligencia_label,diligencia_type,fecha_diligencia,fojas_inicio,fojas_fin,ai_summary')
        .eq('case_id', c.id)
        .order('fecha_diligencia');
      if(dils && dils.length){
        ctx += `\n## DILIGENCIAS DEL EXPEDIENTE (${dils.length})\n`;
        dils.slice(0, 30).forEach((d,i) => {
          const fojas = d.fojas_inicio ? (d.fojas_fin?` [fojas ${d.fojas_inicio}-${d.fojas_fin}]`:` [foja ${d.fojas_inicio}]`) : '';
          ctx += `${i+1}. ${d.diligencia_label||d.diligencia_type||'Diligencia'}${fojas} — ${d.fecha_diligencia||'s/f'}\n`;
          if(d.ai_summary) ctx += `   ${d.ai_summary.substring(0,300)}\n`;
        });
      }
    }catch(e){ console.warn('[resol] dils err:', e); }
  }

  return ctx;
}

/* ══════════════════════════════════════════════════════════════════════
   GENERACIÓN CON IA
   ══════════════════════════════════════════════════════════════════════ */
async function generarBorradorIA(){
  if(state.generating) return;
  if(!state.caseObj){ _toast('⚠ Sin caso activo'); return; }
  if(!state.selectedTipo){ _toast('⚠ Elige primero el tipo de resolución'); return; }

  state.generating = true;
  _renderModalContent();
  _toast('🤖 Generando borrador con IA · esto puede tardar 30-60s');

  try {
    /* 1) cargar contenido del modelo elegido (o el default del tipo) */
    let modeloId = state.selectedModeloId;
    if(!modeloId){
      const def = state.modelos.find(m => m.tipo===state.selectedTipo && m.is_default)
               || state.modelos.find(m => m.tipo===state.selectedTipo);
      modeloId = def?.id;
    }
    let modelo = null;
    if(modeloId) modelo = await loadModeloContenido(modeloId);

    /* 2) construir contexto del caso */
    const caseCtx = await buildCaseContext(state.caseObj);

    /* 3) prompt para la IA */
    const tipoLabel = TIPOS[state.selectedTipo]?.label || state.selectedTipo;
    const sysPrompt =
      `Eres Fiscalito, asistente jurídico de la Universidad de Magallanes (UMAG). ` +
      `Vas a redactar la RESOLUCIÓN DE TÉRMINO que dictará la autoridad universitaria ` +
      `para el procedimiento disciplinario que se te describe. ` +
      `Tipo: ${tipoLabel}.\n\n` +
      `INSTRUCCIONES OBLIGATORIAS:\n` +
      `1. Sigue EXACTAMENTE la estructura y estilo del MODELO DE REFERENCIA proporcionado más abajo. ` +
      `Reemplaza los placeholders [TIPO ASÍ] con los datos reales del expediente.\n` +
      `2. NUNCA inventes números de resolución, dictámenes, fojas o fechas que no estén en el contexto.\n` +
      `3. Si un dato falta, escribe [COMPLETAR: descripción] en lugar de inventar.\n` +
      `4. Mantén el tono institucional, formal, en español jurídico chileno (UMAG).\n` +
      `5. Estructura: encabezado · VISTOS · CONSIDERANDO (numerados) · RESUELVO (numerados) · ANÓTESE.\n` +
      `6. NO incluyas el "RESOLUCIÓN EXENTA N°XXX" — la autoridad la asigna al firmar; deja [N° A ASIGNAR].\n` +
      `7. La fecha del encabezado déjala como [FECHA DE FIRMA].\n` +
      `8. Cita SIEMPRE las normas con su número exacto (ej. "Art. 157 letra b) Estatuto Administrativo").\n\n` +
      (modelo ? `## MODELO DE REFERENCIA: ${modelo.nombre}\n${modelo.content_text}\n\n--- FIN MODELO ---\n\n` : '') +
      caseCtx;

    /* 4) llamada a /api/chat-stream */
    const userPrompt = `Redacta ahora la resolución de término correspondiente al expediente descrito arriba, replicando la estructura del modelo de referencia y rellenando todos los placeholders con los datos del caso.`;

    const _doFetch = (typeof authFetch === 'function') ? authFetch : fetch;
    const r = await _doFetch('/api/chat-stream', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: (typeof CLAUDE_SONNET!=='undefined'?CLAUDE_SONNET:'claude-sonnet-4-20250514'),
        max_tokens: 8000,
        system: sysPrompt,
        messages: [{ role:'user', content: userPrompt }],
        stream: true
      })
    });
    if(!r.ok){
      let msg = `HTTP ${r.status}`;
      try { msg = (await r.json()).error || msg; } catch{}
      throw new Error(msg);
    }

    /* Lectura SSE en streaming → escribe directo al editor */
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', generated = '';
    const editor = document.getElementById('resolEditor');
    if(editor){ editor.value = ''; editor.disabled = true; }

    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for(const line of lines){
        if(!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if(!data || data === '[DONE]') continue;
        try {
          const obj = JSON.parse(data);
          const delta = obj.delta?.text || obj.choices?.[0]?.delta?.content || '';
          if(delta){
            generated += delta;
            if(editor){ editor.value = generated; editor.scrollTop = editor.scrollHeight; }
          }
        } catch {}
      }
    }
    if(editor) editor.disabled = false;

    /* 5) crear nuevo draft en BD */
    const s = _sb();
    const titulo = `${TIPOS[state.selectedTipo]?.icon || ''} ${tipoLabel} · ${state.caseObj.nueva_resolucion||state.caseObj.name||''}`.trim();
    const { data: newDraft, error: insErr } = await s.from('resoluciones_drafts')
      .insert({
        user_id: state.caseObj.user_id,
        case_id: state.caseId,
        tipo: state.selectedTipo,
        status: 'borrador',
        titulo,
        content_text: generated,
        modelo_id: modeloId || null,
        prompt_used: userPrompt
      })
      .select()
      .single();
    if(insErr) throw insErr;

    state.currentDraft = newDraft;
    state.drafts = await loadDrafts(state.caseId);
    _toast(`✅ Borrador v${newDraft.version} generado y guardado`);
    _renderModalContent();
  } catch(e) {
    console.error('[resol] generarBorradorIA error:', e);
    _toast('❌ Error generando: ' + (e.message||e));
  } finally {
    state.generating = false;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   GUARDAR / ACTUALIZAR
   ══════════════════════════════════════════════════════════════════════ */
async function guardarVersion(opts){
  opts = opts || {};
  if(state.saving) return;
  if(!state.caseId) return;
  const editor = document.getElementById('resolEditor');
  const text = editor ? editor.value : '';
  if(!text.trim() && !opts.force){ _toast('⚠ El editor está vacío'); return; }

  state.saving = true;
  try {
    const s = _sb();
    if(state.currentDraft && !opts.newVersion){
      /* update in-place */
      const { data, error } = await s.from('resoluciones_drafts')
        .update({ content_text: text, titulo: state.currentDraft.titulo })
        .eq('id', state.currentDraft.id)
        .select().single();
      if(error) throw error;
      state.currentDraft = data;
      if(!opts.silent) _toast('💾 Guardado');
    } else {
      /* nueva versión */
      const titulo = state.currentDraft?.titulo
        || `${TIPOS[state.selectedTipo]?.icon || ''} ${TIPOS[state.selectedTipo]?.label || ''} · ${state.caseObj?.nueva_resolucion||state.caseObj?.name||''}`.trim();
      const { data, error } = await s.from('resoluciones_drafts')
        .insert({
          user_id: state.caseObj?.user_id,
          case_id: state.caseId,
          tipo: state.selectedTipo,
          status: 'borrador',
          titulo,
          content_text: text,
          modelo_id: state.selectedModeloId || null
        }).select().single();
      if(error) throw error;
      state.currentDraft = data;
      _toast(`💾 Versión v${data.version} guardada`);
    }
    state.drafts = await loadDrafts(state.caseId);
    _renderHeader(); _renderVersions();
  } catch(e) {
    console.error('[resol] guardarVersion error:', e);
    _toast('❌ Error al guardar: ' + (e.message||e));
  } finally {
    state.saving = false;
  }
}

async function marcarEstado(nuevoEstado){
  if(!state.currentDraft) return _toast('⚠ Sin borrador activo');
  if(!STATUS_LABELS[nuevoEstado]) return;
  const s = _sb();
  try {
    const { data, error } = await s.from('resoluciones_drafts')
      .update({ status: nuevoEstado })
      .eq('id', state.currentDraft.id)
      .select().single();
    if(error) throw error;
    state.currentDraft = data;
    state.drafts = await loadDrafts(state.caseId);

    /* Si se marca como FIRMADO, copiar el texto al campo resolucion_termino del caso
       para que la pestaña Finalización deje de mostrarlo como pendiente. */
    if(nuevoEstado === 'firmado'){
      try {
        await s.from('cases').update({
          resolucion_termino: data.content_text,
          fecha_resolucion_termino: new Date().toISOString().substring(0,10)
        }).eq('id', state.caseId);
        const idx = (typeof allCases!=='undefined') ? allCases.findIndex(c => c.id===state.caseId) : -1;
        if(idx >= 0){
          allCases[idx].resolucion_termino = data.content_text;
          allCases[idx].fecha_resolucion_termino = new Date().toISOString().substring(0,10);
        }
        if(typeof updateCatCounts==='function') updateCatCounts();
        if(typeof renderTabla==='function') renderTabla();
        _toast('🔏 Marcada como firmada · el caso ya no aparece en Finalización');
      } catch(e){ console.warn('[resol] sync resolucion_termino:', e); }
    } else {
      _toast(`${STATUS_LABELS[nuevoEstado].icon} Marcada como ${STATUS_LABELS[nuevoEstado].label}`);
    }
    _renderHeader(); _renderVersions();
  } catch(e){
    console.error('[resol] marcarEstado:', e);
    _toast('❌ ' + (e.message||e));
  }
}

/* ══════════════════════════════════════════════════════════════════════
   EXPORTAR A WORD
   ══════════════════════════════════════════════════════════════════════ */
async function descargarWord(){
  if(!state.currentDraft || !state.currentDraft.content_text){
    _toast('⚠ No hay borrador para exportar');
    return;
  }
  /* Si existe la utilidad global del módulo de exports usarla; si no, fallback a docx via blob simple. */
  const text = state.currentDraft.content_text;
  const fname = (state.caseObj?.nueva_resolucion || state.caseObj?.name || 'resolucion-termino').replace(/[^a-zA-Z0-9._-]/g,'_') + '.docx';

  if(typeof window.exportTextAsDocx === 'function'){
    try { return window.exportTextAsDocx(text, fname); } catch(e){ console.warn('[resol] exportTextAsDocx falló, fallback a HTML/Blob:', e); }
  }

  /* Fallback: HTML mínimo con extensión .doc para que Word lo abra como documento */
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'/><title>Resolución de Término</title></head>
<body style="font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5">
${_esc(text).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br/>')}
</body></html>`;
  const blob = new Blob([html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname.replace('.docx','.doc'); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  _toast('📄 Descargado como .doc');
}

/* ══════════════════════════════════════════════════════════════════════
   AUTOGUARDADO
   ══════════════════════════════════════════════════════════════════════ */
function setupAutosave(){
  if(state.autosaveTimer){ clearInterval(state.autosaveTimer); state.autosaveTimer = null; }
  state.autosaveTimer = setInterval(() => {
    if(!state.open || !state.currentDraft || state.saving || state.generating) return;
    const editor = document.getElementById('resolEditor');
    if(!editor) return;
    if(editor.value === state.currentDraft.content_text) return; // sin cambios
    guardarVersion({ silent: true });
  }, 30000); // cada 30s
}

/* ══════════════════════════════════════════════════════════════════════
   ABRIR / CERRAR EL MODAL
   ══════════════════════════════════════════════════════════════════════ */
async function open(caseId){
  const c = (typeof allCases!=='undefined') ? allCases.find(x => x.id===caseId) : null;
  if(!c){ _toast('⚠ Caso no encontrado'); return; }
  state.open = true;
  state.caseId = caseId;
  state.caseObj = c;
  state.modelos = await loadModelos();
  state.drafts = await loadDrafts(caseId);
  /* Si ya hay un borrador previo, cargar el último (mayor versión, no descartado) */
  state.currentDraft = state.drafts.find(d => d.status !== 'descartado') || null;
  state.selectedTipo = state.currentDraft?.tipo || detectarTipoSugerido(c) || 'sancion_vista_fiscal';
  state.selectedModeloId = state.currentDraft?.modelo_id || null;
  _renderModal();
  setupAutosave();
}

function close(){
  state.open = false;
  if(state.autosaveTimer){ clearInterval(state.autosaveTimer); state.autosaveTimer = null; }
  const m = document.getElementById('resolModal');
  if(m) m.remove();
  state.caseId = null;
  state.caseObj = null;
  state.currentDraft = null;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER DEL MODAL
   ══════════════════════════════════════════════════════════════════════ */
function _renderModal(){
  let m = document.getElementById('resolModal');
  if(m) m.remove();
  m = document.createElement('div');
  m.id = 'resolModal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,.65);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)';
  m.innerHTML = `
    <div style="background:var(--bg);width:min(1200px,100%);height:min(92vh,920px);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.4);border:1px solid var(--border)">
      <!-- HEADER -->
      <div id="resolHeader" style="flex-shrink:0;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:12px;flex-wrap:wrap"></div>
      <!-- BODY -->
      <div style="flex:1;display:grid;grid-template-columns:280px 1fr;overflow:hidden">
        <!-- SIDEBAR -->
        <div style="border-right:1px solid var(--border);background:var(--surface);overflow-y:auto;padding:14px">
          <div id="resolSidebar"></div>
        </div>
        <!-- EDITOR -->
        <div style="display:flex;flex-direction:column;overflow:hidden">
          <div id="resolToolbar" style="flex-shrink:0;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--surface);display:flex;align-items:center;gap:8px;flex-wrap:wrap"></div>
          <textarea id="resolEditor"
            style="flex:1;border:none;padding:18px 22px;font-family:var(--font-serif,'Georgia',serif);font-size:13.5px;line-height:1.65;color:var(--text);background:var(--bg);resize:none;outline:none;white-space:pre-wrap"
            placeholder="Aquí aparecerá el borrador de la resolución de término…"></textarea>
        </div>
      </div>
    </div>`;
  document.body.appendChild(m);
  _renderModalContent();

  /* Cerrar con click fuera del modal o ESC */
  m.addEventListener('click', e => { if(e.target === m) close(); });
  document.addEventListener('keydown', _escHandler);
}

function _escHandler(e){
  if(e.key === 'Escape' && state.open) close();
  if(e.key !== 'Escape') return;
  document.removeEventListener('keydown', _escHandler);
}

function _renderModalContent(){
  _renderHeader();
  _renderSidebar();
  _renderToolbar();
  const editor = document.getElementById('resolEditor');
  if(editor){
    editor.value = state.currentDraft?.content_text || '';
    editor.disabled = state.generating;
  }
}

function _renderHeader(){
  const el = document.getElementById('resolHeader');
  if(!el || !state.caseObj) return;
  const c = state.caseObj;
  const draft = state.currentDraft;
  const stInfo = draft ? STATUS_LABELS[draft.status] : null;
  el.innerHTML = `
    <div style="flex:1;min-width:240px">
      <div style="font-family:var(--font-serif,serif);font-size:18px;font-weight:600;margin-bottom:2px">📋 Redactor de Resolución de Término</div>
      <div style="font-size:11.5px;color:var(--text-muted)">
        Caso: <strong style="color:var(--gold);font-family:var(--font-mono,monospace)">${_esc(c.nueva_resolucion || c.name || '?')}</strong>
        · ${_esc(c.materia || '—')}
        ${c.resultado ? ' · <span style="color:'+(c.resultado==='Sanción'?'#f59e0b':'#10b981')+'">'+_esc(c.resultado)+'</span>' : ''}
      </div>
    </div>
    ${draft && stInfo ? `
      <div style="background:${stInfo.color}15;border:1px solid ${stInfo.color}50;color:${stInfo.color};padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:600">
        ${stInfo.icon} ${stInfo.label} · v${draft.version}
      </div>` : ''}
    <button onclick="closeResolucionRedactor()" style="background:transparent;border:1px solid var(--border);color:var(--text-muted);width:32px;height:32px;border-radius:6px;cursor:pointer;font-size:16px" title="Cerrar (Esc)">✕</button>
  `;
}

function _renderSidebar(){
  const el = document.getElementById('resolSidebar');
  if(!el) return;
  const c = state.caseObj;
  const sugerido = detectarTipoSugerido(c);
  /* Tipo selector */
  let html = `
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:6px;font-weight:600">Tipo de resolución</div>
  `;
  Object.entries(TIPOS).forEach(([k, t]) => {
    const isSel = state.selectedTipo === k;
    const isSug = sugerido === k;
    html += `
      <button onclick="resolSetTipo('${k}')"
        style="width:100%;text-align:left;background:${isSel?t.color+'18':'var(--bg)'};border:1px solid ${isSel?t.color:'var(--border)'};border-radius:8px;padding:9px 11px;margin-bottom:5px;cursor:pointer;font-family:inherit;color:var(--text);transition:all .15s">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:${isSel?'600':'500'}">
          <span style="font-size:14px">${t.icon}</span>
          <span style="flex:1">${t.label}</span>
          ${isSug ? '<span style="font-size:9px;background:#fbbf24;color:#78350f;padding:1px 5px;border-radius:4px;font-weight:700">SUGERIDO</span>' : ''}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px;line-height:1.4">${t.desc}</div>
      </button>
    `;
  });

  /* Modelo de referencia */
  const modelosTipo = state.modelos.filter(m => m.tipo === state.selectedTipo);
  html += `
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px 0;font-weight:600">Modelo de referencia</div>
  `;
  if(modelosTipo.length === 0){
    html += `<div style="font-size:11px;color:var(--text-muted);padding:8px;background:var(--bg);border:1px dashed var(--border);border-radius:6px;text-align:center">Sin modelos para este tipo</div>`;
  } else {
    modelosTipo.forEach(m => {
      const isSel = state.selectedModeloId === m.id || (!state.selectedModeloId && m.is_default);
      html += `
        <button onclick="resolSetModelo('${m.id}')"
          style="width:100%;text-align:left;background:${isSel?'rgba(124,58,237,.08)':'var(--bg)'};border:1px solid ${isSel?'#7c3aed':'var(--border)'};border-radius:6px;padding:7px 10px;margin-bottom:4px;cursor:pointer;font-family:inherit;color:var(--text)">
          <div style="font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px">
            ${m.is_default ? '<span style="font-size:9px;background:#7c3aed;color:#fff;padding:1px 4px;border-radius:3px">★</span>' : ''}
            ${_esc(m.numero_resolucion || '')}
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${_esc(m.nombre)}">${_esc(m.nombre)}</div>
        </button>
      `;
    });
  }

  /* Versiones (drafts del caso) */
  html += `
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:14px 0 6px 0;font-weight:600;display:flex;justify-content:space-between;align-items:center">
      <span>Versiones (${state.drafts.length})</span>
      ${state.drafts.length > 0 ? '<button onclick="resolGuardarComoNuevaVersion()" style="background:transparent;border:none;color:var(--gold);font-size:10px;cursor:pointer;padding:0">+ Nueva</button>' : ''}
    </div>
    <div id="resolVersionsList"></div>
  `;
  el.innerHTML = html;
  _renderVersions();
}

function _renderVersions(){
  const el = document.getElementById('resolVersionsList');
  if(!el) return;
  if(!state.drafts.length){
    el.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:8px;background:var(--bg);border:1px dashed var(--border);border-radius:6px;text-align:center">Aún no hay borradores · genera el primero</div>`;
    return;
  }
  el.innerHTML = state.drafts.map(d => {
    const isCur = state.currentDraft?.id === d.id;
    const stInfo = STATUS_LABELS[d.status] || STATUS_LABELS.borrador;
    const date = new Date(d.updated_at).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    return `
      <button onclick="resolSelectDraft('${d.id}')"
        style="width:100%;text-align:left;background:${isCur?'var(--gold-glow,rgba(124,58,237,.12))':'var(--bg)'};border:1px solid ${isCur?'var(--gold)':'var(--border)'};border-radius:6px;padding:6px 9px;margin-bottom:4px;cursor:pointer;font-family:inherit;color:var(--text)">
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600">
          <span>v${d.version}</span>
          <span style="background:${stInfo.color}20;color:${stInfo.color};padding:1px 5px;border-radius:3px;font-size:9px;text-transform:uppercase;letter-spacing:.04em">${stInfo.icon} ${stInfo.label}</span>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${date} · ${(d.content_text||'').length} caracteres</div>
      </button>
    `;
  }).join('');
}

function _renderToolbar(){
  const el = document.getElementById('resolToolbar');
  if(!el) return;
  const draft = state.currentDraft;
  const generating = state.generating;
  el.innerHTML = `
    <button onclick="resolGenerarBorrador()" ${generating?'disabled':''}
      style="background:var(--gold);color:#fff;border:none;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:${generating?'wait':'pointer'};display:flex;align-items:center;gap:6px;font-family:inherit">
      ${generating?'⏳ Generando…':'🤖 Generar con IA'}
    </button>
    <button onclick="resolGuardarVersion()" ${!draft?'disabled':''}
      style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:7px 12px;border-radius:6px;font-size:11.5px;cursor:pointer;font-family:inherit"
      title="Guardar cambios sobre la versión actual">💾 Guardar</button>
    <button onclick="resolDescargarWord()" ${!draft?'disabled':''}
      style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:7px 12px;border-radius:6px;font-size:11.5px;cursor:pointer;font-family:inherit">📄 Descargar Word</button>
    <div style="flex:1"></div>
    <select onchange="resolMarcarEstado(this.value)" ${!draft?'disabled':''}
      style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:6px;font-size:11.5px;cursor:pointer;font-family:inherit">
      <option value="">— Cambiar estado —</option>
      ${Object.entries(STATUS_LABELS).map(([k,v]) => `<option value="${k}" ${draft?.status===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
    </select>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   ACCIONES DEL UI
   ══════════════════════════════════════════════════════════════════════ */
window.resolSetTipo = function(tipo){
  state.selectedTipo = tipo;
  state.selectedModeloId = null;
  _renderSidebar();
};
window.resolSetModelo = function(id){
  state.selectedModeloId = id;
  _renderSidebar();
};
window.resolSelectDraft = function(id){
  const d = state.drafts.find(x => x.id === id);
  if(!d) return;
  state.currentDraft = d;
  state.selectedTipo = d.tipo;
  state.selectedModeloId = d.modelo_id;
  _renderModalContent();
};
window.resolGuardarComoNuevaVersion = function(){
  guardarVersion({ newVersion: true });
};
window.resolGenerarBorrador = generarBorradorIA;
window.resolGuardarVersion = guardarVersion;
window.resolMarcarEstado = function(estado){
  if(!estado) return;
  marcarEstado(estado);
};
window.resolDescargarWord = descargarWord;
window.openResolucionRedactor = open;
window.closeResolucionRedactor = close;

console.log('[mod-resoluciones-termino] Módulo cargado ✓');
})();
