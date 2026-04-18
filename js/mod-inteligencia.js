/**
 * MOD-INTELIGENCIA.JS — Panel de Inteligencia IA
 * ────────────────────────────────────────────────
 * Integra las herramientas de IA en la UI del caso:
 *   1. Análisis de prescripción (analyze-prescription)
 *   2. Auto-avance de etapas (auto-advance)
 *   3. OCR en lote (ocr-batch)
 *   4. Medida cautelar Art. 129 (generate-vista mode=art129)
 *
 * Añade una pestaña "🤖 IA" al detalle del caso con sub-paneles.
 * Nota: La Vista Fiscal se ha movido a F7 (mod-vista-fiscal.js).
 */
(function(){
  'use strict';

  /* ───────────────────────────────────────────────────────────
     PRIVATE SCOPE: All functions and variables here are internal
     only window._ia.* methods are exposed to the global scope
     ─────────────────────────────────────────────────────────── */

  const MOD_ID = 'mod-inteligencia';
  const TAB_ID = 'tabInteligencia';
  const API_BASE = '/.netlify/functions';

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function getAuthToken(){
    try { return typeof session!=='undefined' && session?.access_token ? session.access_token : ''; }
    catch{ return ''; }
  }

  async function apiFetch(fn, body){
    const token = getAuthToken();
    const res = await fetch(`${API_BASE}/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-auth-token': token },
      body: JSON.stringify(body)
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const style = document.createElement('style');
    style.id = MOD_ID+'-css';
    style.textContent = `
      #${TAB_ID} { padding: 16px; }
      .ia-section { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:16px; margin-bottom:14px; }
      .ia-section h3 { font-family:var(--font-serif); font-size:15px; font-weight:600; margin:0 0 10px; display:flex; align-items:center; gap:8px; }
      .ia-section p.desc { font-size:11.5px; color:var(--text-dim); margin:0 0 12px; line-height:1.5; }
      .ia-btn { background:var(--gold); color:#fff; border:none; padding:8px 16px; border-radius:var(--radius); font-size:12px; font-family:var(--font-body); cursor:pointer; transition:opacity .15s; display:inline-flex; align-items:center; gap:6px; }
      .ia-btn:hover { opacity:.85; }
      .ia-btn:disabled { opacity:.5; cursor:not-allowed; }
      .ia-btn-secondary { background:transparent; color:var(--gold); border:1px solid var(--gold); }
      .ia-result { margin-top:12px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); font-size:12px; line-height:1.6; max-height:400px; overflow-y:auto; white-space:pre-wrap; }
      .ia-badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
      .ia-badge.ok { background:rgba(34,197,94,.12); color:#16a34a; }
      .ia-badge.warning { background:rgba(245,158,11,.12); color:#d97706; }
      .ia-badge.critical { background:rgba(239,68,68,.12); color:#dc2626; }
      .ia-badge.expired { background:rgba(239,68,68,.25); color:#991b1b; }
      .ia-timeline-bar { height:8px; border-radius:4px; background:var(--border); overflow:hidden; margin:6px 0; }
      .ia-timeline-fill { height:100%; border-radius:4px; transition:width .3s; }
      .ia-alert-item { padding:8px 10px; border-radius:6px; font-size:11.5px; margin-bottom:6px; line-height:1.5; }
      .ia-alert-item.critical { background:rgba(239,68,68,.08); border-left:3px solid #dc2626; }
      .ia-alert-item.warning { background:rgba(245,158,11,.08); border-left:3px solid #d97706; }
      .ia-alert-item.info { background:rgba(59,130,246,.08); border-left:3px solid #3b82f6; }
      .ia-spinner { display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,.3); border-top-color:#fff; border-radius:50%; animation:ia-spin .6s linear infinite; }
      @keyframes ia-spin { to { transform:rotate(360deg); } }
      .ia-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
      @media(max-width:768px){ .ia-grid { grid-template-columns:1fr; } }
      .ia-select { background:var(--surface2); border:1px solid var(--border2); color:var(--text); padding:6px 10px; border-radius:var(--radius); font-size:12px; font-family:var(--font-body); }
    `;
    document.head.appendChild(style);
  }

  /* ── Inyectar pestaña en caseTabs ── */
  function injectTab(){
    const tabs = document.getElementById('caseTabs');
    if(!tabs || tabs.querySelector(`[data-tab="${TAB_ID}"]`)) return;
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = TAB_ID;
    tab.textContent = '🤖 IA';
    tab.onclick = function(){ if(typeof showTab==='function') showTab(TAB_ID); };
    tabs.appendChild(tab);
  }

  /* ── Inyectar contenedor de contenido ── */
  function injectContent(){
    if(document.getElementById(TAB_ID)) return;
    const viewCase = document.getElementById('viewCase');
    if(!viewCase) return;
    const div = document.createElement('div');
    div.className = 'tab-content';
    div.id = TAB_ID;
    div.style.display = 'none';
    viewCase.appendChild(div);
  }

  /* ── Render principal del panel IA ── */
  function renderPanel(){
    const el = document.getElementById(TAB_ID);
    if(!el) return;
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ el.innerHTML='<div style="padding:20px;text-align:center;color:var(--text-muted)">Seleccione un caso</div>'; return; }

    el.innerHTML = `
      <div style="margin-bottom:14px">
        <h2 style="font-family:var(--font-serif);font-size:18px;margin:0 0 4px">🤖 Panel de Inteligencia</h2>
        <p style="font-size:11.5px;color:var(--text-muted);margin:0">Herramientas de IA para el expediente <strong>${escH(c.name||'')}</strong></p>
      </div>

      <div class="ia-grid">
        <!-- 1. Prescripción -->
        <div class="ia-section" id="iaSecPrescripcion">
          <h3>⏰ Prescripción</h3>
          <p class="desc">Analiza los plazos de prescripción según Arts. 152-153 del Estatuto Administrativo y normativa aplicable.</p>
          <button class="ia-btn" onclick="window._ia.analyzePrescription()">Analizar plazos</button>
          <button class="ia-btn ia-btn-secondary" onclick="window._ia.analyzePrescription(true)" style="margin-left:6px">+ Recomendación IA</button>
          <div id="iaPrescripcionResult"></div>
        </div>

        <!-- 2. Auto-avance -->
        <div class="ia-section" id="iaSecAutoAdvance">
          <h3>📊 Auto-avance de etapa</h3>
          <p class="desc">Analiza las diligencias del caso y sugiere en qué etapa procesal se encuentra.</p>
          <button class="ia-btn" onclick="window._ia.analyzeStage()">Analizar etapa</button>
          <div id="iaAutoAdvanceResult"></div>
        </div>

        <!-- 3. OCR en lote -->
        <div class="ia-section">
          <h3>🔍 OCR / Extracción de Texto</h3>
          <p class="desc">Extrae texto de las diligencias mediante OCR con Claude Vision.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="ia-btn" onclick="window._ia.runOcrBatch()">OCR este caso</button>
            <button class="ia-btn ia-btn-secondary" onclick="window._ia.runOcrMasivo()">🚀 OCR masivo (todos los casos)</button>
          </div>
          <div id="iaOcrResult"></div>
        </div>

        <!-- 4. Medida cautelar Art. 129 -->
        <div class="ia-section">
          <h3>🚨 Medida Cautelar (Art. 129)</h3>
          <p class="desc">Genera solicitud de medida cautelar: suspensión preventiva, cambio de funciones u otra medida urgente.</p>
          <button class="ia-btn" onclick="window._ia.generateArt129()">Generar solicitud</button>
          <div id="iaArt129Result"></div>
        </div>
      </div>
    `;
  }

  /* ── Hook showTab para renderizar al activar ── */
  const _origShowTab = window.showTab;
  window.showTab = function(tabId){
    if(typeof _origShowTab==='function') _origShowTab(tabId);
    if(tabId===TAB_ID) renderPanel();
  };

  /* ── API: Análisis de prescripción ── */
  async function analyzePrescription(includeAI){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaPrescripcionResult');
    if(!el) return;
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Analizando plazos…</div>';

    try {
      let etapas = [];
      try {
        const { data } = await sb.from('etapas').select('*').eq('case_id', c.id).order('started_at',{ascending:true});
        if(data) etapas = data;
      } catch(e){}

      const result = await apiFetch('analyze-prescription', {
        caseId: c.id,
        caseData: c,
        etapas,
        includeAI: !!includeAI
      });

      let html = `<div class="ia-result" style="white-space:normal">`;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span class="ia-badge ${result.riskLevel||'ok'}">${({ok:'Sin riesgo',warning:'Atención',critical:'Crítico',expired:'Prescrito'})[result.riskLevel]||result.riskLevel}</span>
        <span style="font-size:11px;color:var(--text-muted)">${escH(result.normativa||'')}</span>
      </div>`;

      if(result.timeline && result.timeline.length){
        result.timeline.forEach(function(t){
          const pct = t.porcentaje||0;
          const color = pct>=90?'#dc2626':pct>=70?'#d97706':'#16a34a';
          const restantes = t.diasRestantes!=null? t.diasRestantes : (t.diasHabilesRestantes!=null? t.diasHabilesRestantes+' háb.' : '?');
          html += `<div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:500;margin-bottom:2px">${escH(t.label)}</div>
            <div class="ia-timeline-bar"><div class="ia-timeline-fill" style="width:${pct}%;background:${color}"></div></div>
            <div style="font-size:10px;color:var(--text-muted);display:flex;justify-content:space-between">
              <span>Inicio: ${escH(t.fechaInicio||'?')}</span>
              <span>${pct}% — ${restantes} días restantes</span>
            </div>
          </div>`;
        });
      }

      if(result.alerts && result.alerts.length){
        html += '<div style="margin-top:8px">';
        result.alerts.forEach(function(a){
          html += `<div class="ia-alert-item ${a.severity||'info'}">${escH(a.message)}</div>`;
        });
        html += '</div>';
      }

      if(result.aiRecommendation){
        html += `<div style="margin-top:12px;padding:10px;background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.15);border-radius:6px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);margin-bottom:6px;font-weight:600">Recomendación IA</div>
          <div style="font-size:12px;line-height:1.6;white-space:pre-wrap">${escH(result.aiRecommendation)}</div>
        </div>`;
      }

      html += '</div>';
      el.innerHTML = html;
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── API: Auto-avance de etapa ── */
  async function analyzeStage(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaAutoAdvanceResult');
    if(!el) return;
    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Analizando diligencias…</div>';

    try {
      let diligencias = [];
      try {
        const { data } = await sb.from('diligencias').select('id,file_name,diligencia_label,ai_summary,extracted_text,fecha_diligencia').eq('case_id', c.id);
        if(data) diligencias = data;
      } catch(e){}

      if(!diligencias.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">No hay diligencias con texto extraído para analizar. Ejecute OCR primero.</div>';
        return;
      }

      const result = await apiFetch('auto-advance', {
        caseId: c.id,
        action: 'analyze',
        diligencias
      });

      const STAGE_LABELS = {indagatoria:'Indagatoria',cargos:'Cargos',descargos:'Descargos',prueba:'Prueba',vista:'Vista Fiscal',resolucion:'Resolución',cerrado:'Cerrado'};
      const STAGE_ICONS = {indagatoria:'🔍',cargos:'📋',descargos:'📝',prueba:'⚖️',vista:'📄',resolucion:'✅',cerrado:'🔒'};

      let html = '<div class="ia-result" style="white-space:normal">';
      if(result.suggestedStage){
        const stg = result.suggestedStage;
        html += `<div style="text-align:center;padding:10px 0">
          <div style="font-size:24px;margin-bottom:6px">${STAGE_ICONS[stg]||'📊'}</div>
          <div style="font-size:14px;font-weight:600">${escH(STAGE_LABELS[stg]||stg)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Etapa sugerida según análisis de documentos</div>
        </div>`;

        if(result.aiSuggestion){
          html += `<div style="margin-top:8px;padding:8px;background:rgba(79,70,229,.05);border-radius:6px;font-size:11.5px">
            <strong>IA:</strong> ${escH(result.aiSuggestion.reason||'')}
            <span class="ia-badge ${result.aiSuggestion.confidence==='alta'?'ok':result.aiSuggestion.confidence==='media'?'warning':'critical'}" style="margin-left:6px">${escH(result.aiSuggestion.confidence||'')}</span>
          </div>`;
        }

        if(result.metadata && Object.keys(result.metadata).length){
          html += '<div style="margin-top:10px;font-size:11px"><strong>Metadata detectada:</strong><ul style="margin:4px 0 0 16px;padding:0">';
          Object.entries(result.metadata).forEach(function(kv){
            html += `<li>${escH(kv[0])}: ${escH(kv[1])}</li>`;
          });
          html += '</ul></div>';
        }
      } else {
        html += '<div style="color:var(--text-muted);text-align:center;padding:8px">No se pudo determinar la etapa a partir de los documentos disponibles.</div>';
      }
      html += '</div>';
      el.innerHTML = html;
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── API: OCR en lote ── */
  async function runOcrBatch(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }
    const el = document.getElementById('iaOcrResult');
    if(!el) return;

    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Cargando diligencias…</div>';

    try {
      const { data: diligencias } = await sb.from('diligencias')
        .select('id,file_name,diligencia_label,drive_file_id,mime_type,extracted_text')
        .eq('case_id', c.id);

      if(!diligencias || !diligencias.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">No hay diligencias en este caso.</div>';
        return;
      }

      const sinTexto = diligencias.filter(function(d){ return !d.extracted_text && d.drive_file_id; });
      const conTexto = diligencias.filter(function(d){ return !!d.extracted_text; });

      if(!sinTexto.length){
        el.innerHTML = `<div class="ia-result" style="color:var(--text-muted)">Todas las diligencias ya tienen texto extraído (${conTexto.length}/${diligencias.length}).</div>`;
        return;
      }

      el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Procesando OCR de ${sinTexto.length} archivo(s)… (máx. 10 por lote)</div>`;

      const files = sinTexto.slice(0,10).map(function(d){
        return { driveFileId: d.drive_file_id, fileName: d.file_name || d.diligencia_label, mimeType: d.mime_type || 'application/pdf' };
      });

      const result = await apiFetch('ocr-batch', { files, caseId: c.id });

      let saved = 0;
      if(result.results){
        for(const r of result.results){
          if(r.status==='success' && r.driveFileId && r.text){
            try {
              const match = sinTexto.find(function(d){ return d.drive_file_id === r.driveFileId; });
              if(match){
                await sb.from('diligencias').update({ extracted_text: r.text }).eq('id', match.id);
                saved++;
              }
            } catch(e){}
          }
        }
      }

      let html = '<div class="ia-result" style="white-space:normal">';
      html += `<div style="font-weight:600;margin-bottom:8px">Resultados OCR</div>`;
      html += `<div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px">
        <span style="color:var(--green)">✅ ${result.processed||0} procesados</span>
        <span style="color:var(--red)">❌ ${result.failed||0} fallidos</span>
        <span style="color:var(--text-muted)">💾 ${saved} guardados</span>
      </div>`;

      if(result.results){
        result.results.forEach(function(r){
          const icon = r.status==='success'?'✅':'❌';
          const preview = r.text? r.text.substring(0,150)+'…' : (r.error||'');
          html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:11.5px">
            ${icon} <strong>${escH(r.fileName||'?')}</strong>
            ${r.textLength? `<span style="color:var(--text-muted);margin-left:4px">(${r.textLength} chars)</span>` : ''}
            <div style="color:var(--text-dim);margin-top:2px;font-size:11px">${escH(preview)}</div>
          </div>`;
        });
      }

      if(result.usage){
        html += `<div style="margin-top:8px;font-size:10px;color:var(--text-muted);text-align:right">Tokens: ${result.usage.inputTokens||0} in / ${result.usage.outputTokens||0} out</div>`;
      }
      html += '</div>';
      el.innerHTML = html;

      if(saved>0 && typeof showToast==='function'){
        showToast(`OCR completado: ${saved} diligencia(s) actualizada(s)`,'success');
      }
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── OCR masivo: procesar TODOS los casos con diligencias sin texto ── */
  async function runOcrMasivo(){
    const el = document.getElementById('iaOcrResult');
    if(!el) return;
    if(!session){if(typeof showToast==='function') showToast('Sin sesión','error');return;}

    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Buscando diligencias sin texto en todos los casos…</div>';

    try {
      const { data: sinTexto, error } = await sb.from('diligencias')
        .select('id,case_id,file_name,diligencia_label,drive_file_id,mime_type')
        .is('extracted_text', null)
        .not('drive_file_id', 'is', null)
        .limit(200);

      if(error) throw error;
      if(!sinTexto || !sinTexto.length){
        el.innerHTML = '<div class="ia-result" style="color:var(--text-muted)">✅ Todas las diligencias de todos los casos ya tienen texto extraído.</div>';
        return;
      }

      const byCaseId = {};
      sinTexto.forEach(d => {
        if(!byCaseId[d.case_id]) byCaseId[d.case_id] = [];
        byCaseId[d.case_id].push(d);
      });
      const caseCount = Object.keys(byCaseId).length;

      el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Procesando ${sinTexto.length} diligencias sin texto en ${caseCount} caso(s)… (lotes de 10, esto puede tomar varios minutos)</div>`;

      let totalProcessed = 0, totalFailed = 0, totalSaved = 0;
      const resultsByCaso = {};

      for(let i = 0; i < sinTexto.length; i += 10){
        const batch = sinTexto.slice(i, i + 10);
        const files = batch.map(d => ({
          driveFileId: d.drive_file_id,
          fileName: d.file_name || d.diligencia_label,
          mimeType: d.mime_type || 'application/pdf'
        }));

        try {
          const batchResult = await apiFetch('ocr-batch', { files, caseId: batch[0].case_id });
          if(batchResult.results){
            for(const r of batchResult.results){
              if(r.status==='success' && r.driveFileId && r.text){
                const match = batch.find(d => d.drive_file_id === r.driveFileId);
                if(match){
                  try {
                    await sb.from('diligencias').update({ extracted_text: r.text }).eq('id', match.id);
                    totalSaved++;
                    if(!resultsByCaso[match.case_id]) resultsByCaso[match.case_id] = 0;
                    resultsByCaso[match.case_id]++;
                  } catch(e){}
                }
                totalProcessed++;
              } else { totalFailed++; }
            }
          }
        } catch(e){ totalFailed += batch.length; }

        el.innerHTML = `<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Progreso: ${Math.min(i+10, sinTexto.length)}/${sinTexto.length} — ${totalSaved} guardadas, ${totalFailed} fallidas</div>`;
      }

      let html = '<div class="ia-result" style="white-space:normal">';
      html += '<div style="font-weight:600;margin-bottom:8px">📊 Resultado OCR Masivo</div>';
      html += `<div style="display:flex;gap:12px;margin-bottom:10px;font-size:12px">
        <span style="color:var(--green)">✅ ${totalProcessed} procesadas</span>
        <span style="color:var(--red)">❌ ${totalFailed} fallidas</span>
        <span style="color:var(--gold)">💾 ${totalSaved} guardadas</span>
        <span style="color:var(--text-muted)">📁 ${caseCount} casos</span>
      </div>`;

      const caseNames = typeof allCases !== 'undefined' ? allCases : [];
      Object.entries(resultsByCaso).forEach(function(kv){
        const cn = caseNames.find(c => c.id === kv[0]);
        html += `<div style="font-size:11px;padding:2px 0">📋 ${escH(cn?.name||kv[0])}: ${kv[1]} diligencia(s) extraída(s)</div>`;
      });

      html += '</div>';
      el.innerHTML = html;
      if(totalSaved>0 && typeof showToast==='function') showToast(`OCR masivo: ${totalSaved} diligencias extraídas en ${caseCount} casos`,'success');
    } catch(err){
      el.innerHTML = `<div class="ia-result" style="color:var(--red)">Error: ${escH(err.message)}</div>`;
    }
  }

  /* ── API: Medida cautelar Art. 129 ── */
  async function generateArt129(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('No hay caso seleccionado','error'); return; }

    const el = document.getElementById('iaArt129Result');
    if(!el) return;

    el.innerHTML = '<div style="padding:8px;font-size:12px;color:var(--text-muted)"><span class="ia-spinner" style="border-color:var(--gold);border-top-color:transparent"></span> Generando solicitud de medida cautelar… (hasta 1 minuto)<br><span style="font-size:10px">Consultando modelos de expedientes terminados similares</span></div>';

    try {
      var results = await Promise.all([
        sb.from('diligencias').select('diligencia_label,file_name,fecha_diligencia,ai_summary').eq('case_id', c.id).order('fecha_diligencia',{ascending:true}),
        sb.from('case_participants').select('name,role,estamento,carrera').eq('case_id', c.id),
        sb.from('cronologia').select('event_date,title,description').eq('case_id', c.id).order('event_date',{ascending:true})
      ]);

      var result = await apiFetch('generate-vista', {
        caseId: c.id,
        caseData: c,
        diligencias: results[0].data || [],
        participants: results[1].data || [],
        chronology: results[2].data || [],
        mode: 'art129'
      });

      if(result.error){
        el.innerHTML = '<div class="ia-result" style="color:var(--red)">Error: ' + escH(result.error) + '</div>';
        return;
      }

      var html = '<div class="ia-result">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
      html += '<span style="font-weight:600">Medida Cautelar Art. 129</span>';
      html += '<div style="display:flex;gap:6px">';
      html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.copyArt129()" style="padding:4px 10px;font-size:11px">📋 Copiar</button>';
      html += '<button class="ia-btn ia-btn-secondary" onclick="window._ia.sendArt129ToChat()" style="padding:4px 10px;font-size:11px">💬 Chat</button>';
      html += '</div></div>';
      if(result.modelsUsed && result.modelsUsed.length){
        html += '<div style="margin-bottom:8px;padding:6px 10px;background:rgba(79,70,229,.06);border:1px solid rgba(79,70,229,.12);border-radius:6px;font-size:10px;color:var(--text-dim)">';
        html += '📚 Modelos: <strong>' + result.modelsUsed.map(function(m){ return escH(m); }).join(', ') + '</strong>';
        html += '</div>';
      }
      html += '<div style="white-space:pre-wrap">' + escH(result.vista||'') + '</div>';
      if(result.usage) html += '<div style="margin-top:8px;font-size:10px;color:var(--text-muted);text-align:right">Tokens: '+(result.usage.inputTokens||0)+' in / '+(result.usage.outputTokens||0)+' out</div>';
      html += '</div>';
      el.innerHTML = html;

      // Almacenar para copiar/enviar
      window._ia._art129Text = result.vista || '';

      if(typeof showToast==='function') showToast('✓ Medida cautelar generada','success');
    } catch(err){
      el.innerHTML = '<div class="ia-result" style="color:var(--red)">Error: ' + escH(err.message) + '</div>';
    }
  }

  function copyArt129(){
    var text = window._ia._art129Text || '';
    if(!text){ if(typeof showToast==='function') showToast('No hay contenido para copiar','error'); return; }
    navigator.clipboard.writeText(text).then(function(){
      if(typeof showToast==='function') showToast('Medida cautelar copiada','success');
    }).catch(function(){
      if(typeof showToast==='function') showToast('No se pudo copiar (permiso denegado)','error');
    });
  }

  function sendArt129ToChat(){
    var text = window._ia._art129Text || '';
    if(!text) return;
    if(typeof showTab==='function') showTab('tabChat');
    var input = document.getElementById('chatInput') || document.getElementById('inputBox');
    if(input){
      input.value = 'Revisa y mejora esta solicitud de medida cautelar:\n\n' + text.substring(0,3000);
      input.dispatchEvent(new Event('input'));
    }
  }

  /* ── PUBLIC API: Expose only necessary functions to window._ia ──
     These functions are called from:
     - onclick="window._ia.analyzePrescription()" (lines 115-116)
     - onclick="window._ia.analyzeStage()" (line 124)
     - onclick="window._ia.runOcrBatch()" (line 133)
     - onclick="window._ia.runOcrMasivo()" (line 134)
     - onclick="window._ia.generateArt129()" (line 143)
     - onclick="window._ia.copyArt129()" (line 491)
     - onclick="window._ia.sendArt129ToChat()" (line 492)
  */
  window._ia = {
    analyzePrescription: analyzePrescription,
    analyzeStage: analyzeStage,
    generateArt129: generateArt129,
    copyArt129: copyArt129,
    sendArt129ToChat: sendArt129ToChat,
    runOcrBatch: runOcrBatch,
    runOcrMasivo: runOcrMasivo,
    _art129Text: ''
  };

  /* ── Init ── */
  function init(){
    injectTab();
    injectContent();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

/* ──────────────────────────────────────────────────────
   END IIFE: All functions above are private except those
   explicitly exposed via window._ia object
   ────────────────────────────────────────────────────── */
})();
