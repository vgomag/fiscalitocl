/**
 * MOD-COMPLETITUD-CASO.JS — Indicador de completitud del expediente
 * ──────────────────────────────────────────────────────────────────
 * Muestra una barra de progreso y checklist de campos faltantes
 * directamente en el header del caso. Calcula un % de completitud
 * basado en campos críticos, opcionales y datos relacionados.
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-completitud';

  /* ── Campos requeridos y su peso ── */
  const FIELD_GROUPS = {
    criticos: {
      label: 'Datos Críticos',
      weight: 3,
      fields: [
        { key:'name', label:'Nombre del caso' },
        { key:'nueva_resolucion', label:'Resolución instructora' },
        { key:'fecha_denuncia', label:'Fecha de denuncia' },
        { key:'fecha_resolucion', label:'Fecha de resolución' },
        { key:'tipo_procedimiento', label:'Tipo de procedimiento' },
        { key:'denunciantes', label:'Denunciante(s)', check: function(v){ return v && (Array.isArray(v)?v.length>0:!!v); } },
        { key:'denunciados', label:'Denunciado/a(s)', check: function(v){ return v && (Array.isArray(v)?v.length>0:!!v); } }
      ]
    },
    importantes: {
      label: 'Datos Importantes',
      weight: 2,
      fields: [
        { key:'materia', label:'Materia' },
        { key:'protocolo', label:'Protocolo' },
        { key:'estamentos_denunciante', label:'Estamento denunciante' },
        { key:'estamentos_denunciado', label:'Estamento denunciado' },
        { key:'fecha_recepcion_fiscalia', label:'Fecha recepción fiscalía' }
      ]
    },
    complementarios: {
      label: 'Datos Complementarios',
      weight: 1,
      fields: [
        { key:'caratula', label:'Carátula' },
        { key:'observaciones', label:'Observaciones' },
        { key:'carrera_denunciante', label:'Carrera denunciante' },
        { key:'carrera_denunciado', label:'Carrera denunciado' },
        { key:'fecha_vista', label:'Fecha vista fiscal' },
        { key:'resultado', label:'Resultado' }
      ]
    }
  };

  /* ── Campos relacionales (bonus) ── */
  const RELATIONAL_CHECKS = [
    { label:'Tiene diligencias', table:'diligencias', minCount:1, weight:2 },
    { label:'Tiene checklist', table:'case_checklist_items', minCount:1, weight:1 },
    { label:'Carpeta Drive vinculada', field:'drive_folder_id', weight:1 },
    { label:'Tiene etapa procesal', table:'etapas', minCount:1, weight:2 }
  ];

  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .compl-bar-wrap { margin:8px 0 4px; }
      .compl-bar { height:6px; border-radius:3px; background:var(--border); overflow:hidden; }
      .compl-bar-fill { height:100%; border-radius:3px; transition:width .5s ease; }
      .compl-label { display:flex; justify-content:space-between; align-items:center; font-size:10px; margin-bottom:3px; }
      .compl-pct { font-weight:700; font-family:var(--font-mono); }
      .compl-detail { display:none; margin-top:8px; padding:10px 12px; background:var(--bg); border:1px solid var(--border); border-radius:var(--radius); }
      .compl-detail.open { display:block; }
      .compl-detail h5 { font-size:11px; font-weight:600; margin:8px 0 4px; color:var(--text-dim); }
      .compl-detail h5:first-child { margin-top:0; }
      .compl-item { font-size:11px; padding:2px 0; display:flex; align-items:center; gap:6px; }
      .compl-item.ok { color:var(--green); }
      .compl-item.missing { color:var(--red); }
      .compl-toggle { background:none; border:none; font-size:10px; color:var(--gold); cursor:pointer; padding:2px 6px; font-family:var(--font-body); }
    `;
    document.head.appendChild(s);
  }

  /* ── Calcular completitud ── */
  async function calculateCompleteness(caseData){
    const c = caseData;
    let totalWeight = 0;
    let filledWeight = 0;
    const details = [];

    // Campos directos
    Object.entries(FIELD_GROUPS).forEach(function(kv){
      const group = kv[1];
      const groupItems = [];
      group.fields.forEach(function(f){
        totalWeight += group.weight;
        const val = c[f.key];
        const ok = f.check ? f.check(val) : (val !== null && val !== undefined && val !== '' && val !== '[]');
        if(ok) filledWeight += group.weight;
        groupItems.push({ label:f.label, ok:ok });
      });
      details.push({ label:group.label, items:groupItems });
    });

    // Checks relacionales
    const relItems = [];
    for(const rc of RELATIONAL_CHECKS){
      totalWeight += rc.weight;
      let ok = false;
      if(rc.field){
        ok = !!c[rc.field];
      } else if(rc.table){
        try {
          const { count } = await sb.from(rc.table).select('id',{count:'exact',head:true}).eq('case_id',c.id);
          ok = (count||0) >= rc.minCount;
        } catch(e){ ok = false; }
      }
      if(ok) filledWeight += rc.weight;
      relItems.push({ label:rc.label, ok:ok });
    }
    details.push({ label:'Datos Relacionados', items:relItems });

    const pct = totalWeight>0 ? Math.round((filledWeight/totalWeight)*100) : 0;
    return { pct, details };
  }

  /* ── Renderizar en el header del caso ── */
  async function renderCompleteness(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c) return;

    // Remover indicador anterior
    const old = document.getElementById('complIndicator');
    if(old) old.remove();

    const header = document.getElementById('caseHeader');
    if(!header) return;

    const { pct, details } = await calculateCompleteness(c);
    const color = pct >= 80 ? '#059669' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const label = pct >= 80 ? 'Completo' : pct >= 50 ? 'Parcial' : 'Incompleto';

    const container = document.createElement('div');
    container.id = 'complIndicator';
    container.style.cssText = 'margin-top:8px;';

    let detailHtml = '';
    details.forEach(function(group){
      detailHtml += '<h5>'+escH(group.label)+'</h5>';
      group.items.forEach(function(item){
        detailHtml += '<div class="compl-item '+(item.ok?'ok':'missing')+'">'+(item.ok?'✅':'❌')+' '+escH(item.label)+'</div>';
      });
    });

    container.innerHTML = `
      <div class="compl-bar-wrap">
        <div class="compl-label">
          <span style="color:var(--text-muted)">Completitud del expediente</span>
          <span>
            <span class="compl-pct" style="color:${color}">${pct}%</span>
            <span style="font-size:9px;color:${color};margin-left:4px">${label}</span>
            <button class="compl-toggle" onclick="this.parentElement.parentElement.parentElement.parentElement.querySelector('.compl-detail').classList.toggle('open')">▾ Detalle</button>
          </span>
        </div>
        <div class="compl-bar"><div class="compl-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>
      <div class="compl-detail">${detailHtml}</div>`;

    header.appendChild(container);
  }

  /* ── Patchear renderCaseHeader para inyectar indicador ── */
  if(window._completitudPatched) return;
  const _origRenderCaseHeader = window.renderCaseHeader;
  window.renderCaseHeader = function(){
    if(typeof _origRenderCaseHeader==='function') _origRenderCaseHeader();
    // Dar tiempo al render original
    setTimeout(renderCompleteness, 100);
  };
  window._completitudPatched = true;

  /* ── API pública ── */
  window._completitud = { refresh: renderCompleteness };

})();
