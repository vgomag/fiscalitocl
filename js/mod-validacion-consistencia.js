/**
 * MOD-VALIDACION-CONSISTENCIA.JS — Validación de consistencia del expediente
 * ───────────────────────────────────────────────────────────────────────────
 * Verifica integridad lógica de los datos del caso:
 *   - Fechas en orden lógico (denuncia < resolución < vista)
 *   - Tipo de procedimiento coincide con protocolo
 *   - ROL/nombre sigue el formato esperado (ej: ###-G para género)
 *   - Denunciantes/denunciados tienen estamento
 *   - Duración dentro de rangos legales
 *   - Etapas procesales coherentes con diligencias
 *   - Resultado coherente con estado
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-validacion';

  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function parseDate(s){
    if(!s) return null;
    const m = String(s).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(m) return new Date(parseInt(m[3]), parseInt(m[2])-1, parseInt(m[1]));
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /* ── Reglas de validación ── */
  const RULES = [
    {
      id: 'fecha_orden',
      label: 'Orden cronológico de fechas',
      category: 'Fechas',
      check: function(c){
        const fd = parseDate(c.fecha_denuncia);
        const fr = parseDate(c.fecha_resolucion);
        const frf = parseDate(c.fecha_recepcion_fiscalia);
        const fv = parseDate(c.fecha_vista);
        const issues = [];
        if(fd && fr && fd > fr) issues.push('Fecha denuncia posterior a resolución');
        if(fr && frf && fr > frf) issues.push('Fecha resolución posterior a recepción fiscalía');
        if(frf && fv && frf > fv) issues.push('Recepción fiscalía posterior a vista fiscal');
        if(fd && fv && fd > fv) issues.push('Fecha denuncia posterior a vista fiscal');
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    },
    {
      id: 'formato_genero',
      label: 'ROL de género correcto',
      category: 'Formato',
      check: function(c){
        const name = c.name || '';
        const isGender = /\d+\s*[-]?\s*G(?:\s|$|[^a-záéíóúñ])/i.test(name);
        const cat = c.categoria;
        if(isGender && cat && cat !== 'genero'){
          return { ok:false, issues:['Nombre sugiere caso de género (tiene -G) pero categoría es "'+cat+'"'] };
        }
        if(!isGender && cat === 'genero'){
          return { ok:false, issues:['Categoría es "género" pero el nombre no tiene sufijo -G'] };
        }
        return { ok:true };
      }
    },
    {
      id: 'tipo_protocolo',
      label: 'Tipo de procedimiento vs. protocolo',
      category: 'Coherencia',
      check: function(c){
        const tipo = (c.tipo_procedimiento||'').toLowerCase();
        const proto = (c.protocolo||'').toLowerCase();
        if(tipo.includes('karin') && proto && !proto.includes('karin')){
          return { ok:false, issues:['Tipo "Ley Karin" pero protocolo no coincide: "'+c.protocolo+'"'] };
        }
        if(proto.includes('karin') && tipo && !tipo.includes('karin')){
          return { ok:false, issues:['Protocolo Ley Karin pero tipo de procedimiento no coincide: "'+c.tipo_procedimiento+'"'] };
        }
        return { ok:true };
      }
    },
    {
      id: 'participantes_estamento',
      label: 'Participantes con estamento',
      category: 'Datos',
      check: function(c){
        const issues = [];
        const hasDte = c.denunciantes && (Array.isArray(c.denunciantes)?c.denunciantes.length:!!c.denunciantes);
        const hasDdo = c.denunciados && (Array.isArray(c.denunciados)?c.denunciados.length:!!c.denunciados);
        if(hasDte && !c.estamentos_denunciante) issues.push('Denunciante sin estamento asignado');
        if(hasDdo && !c.estamentos_denunciado) issues.push('Denunciado sin estamento asignado');
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    },
    {
      id: 'duracion_legal',
      label: 'Duración dentro de plazos legales',
      category: 'Plazos',
      check: function(c){
        if(c.status !== 'active') return { ok:true };
        const fd = parseDate(c.fecha_denuncia || c.fecha_resolucion);
        if(!fd) return { ok:true };
        const days = Math.round((new Date().getTime()-fd.getTime())/86400000);
        const issues = [];
        if(days > 365*2){
          issues.push('Caso activo hace más de 2 años ('+days+' días). Verificar prescripción.');
        } else if(days > 365){
          issues.push('Caso activo hace más de 1 año ('+days+' días). Revisar avance.');
        }
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    },
    {
      id: 'resultado_estado',
      label: 'Resultado coherente con estado',
      category: 'Coherencia',
      check: function(c){
        const issues = [];
        if(c.resultado && c.status === 'active'){
          issues.push('Caso tiene resultado "'+c.resultado+'" pero estado sigue "activo"');
        }
        if(c.status === 'terminado' && !c.resultado){
          issues.push('Caso terminado sin resultado asignado');
        }
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    },
    {
      id: 'resolucion_termino',
      label: 'Resolución de término',
      category: 'Coherencia',
      check: function(c){
        if(c.status !== 'terminado') return { ok:true };
        const issues = [];
        if(!c.resolucion_termino) issues.push('Caso terminado sin resolución de término');
        if(!c.fecha_resolucion_termino) issues.push('Caso terminado sin fecha de resolución de término');
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    },
    {
      id: 'fechas_futuras',
      label: 'Fechas no en el futuro',
      category: 'Fechas',
      check: function(c){
        const now = new Date();
        const issues = [];
        ['fecha_denuncia','fecha_resolucion','fecha_recepcion_fiscalia','fecha_vista'].forEach(function(f){
          const d = parseDate(c[f]);
          if(d && d > now) issues.push(f.replace(/_/g,' ')+' está en el futuro: '+d.toISOString().split('T')[0]);
        });
        return issues.length ? { ok:false, issues:issues } : { ok:true };
      }
    }
  ];

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .val-panel { position:fixed; right:-400px; top:0; width:400px; height:100vh; background:var(--surface); border-left:1px solid var(--border); z-index:9997; transition:right .3s ease; box-shadow:-4px 0 20px rgba(0,0,0,.1); overflow-y:auto; }
      .val-panel.open { right:0; }
      .val-header { padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; }
      .val-header h3 { font-family:var(--font-serif); font-size:16px; margin:0; }
      .val-summary { display:flex; gap:10px; padding:14px 20px; border-bottom:1px solid var(--border); }
      .val-summary-item { text-align:center; flex:1; }
      .val-summary-item .num { font-size:20px; font-weight:700; font-family:var(--font-mono); }
      .val-summary-item .lbl { font-size:10px; color:var(--text-muted); text-transform:uppercase; }
      .val-rule { padding:10px 20px; border-bottom:1px solid var(--border); }
      .val-rule-header { display:flex; align-items:center; gap:8px; font-size:12px; }
      .val-rule-cat { font-size:9px; padding:1px 6px; border-radius:6px; background:var(--surface2); color:var(--text-muted); }
      .val-issue { font-size:11.5px; color:var(--red); padding:4px 0 2px 24px; line-height:1.5; }
      .val-overlay { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:9996; display:none; }
      .val-overlay.open { display:block; }
    `;
    document.head.appendChild(s);
  }

  /* ── Ejecutar validación ── */
  function runValidation(caseData){
    return RULES.map(function(rule){
      const result = rule.check(caseData);
      return { id:rule.id, label:rule.label, category:rule.category, ok:result.ok, issues:result.issues||[] };
    });
  }

  /* ── Panel UI ── */
  function createPanel(){
    if(document.getElementById('valPanel')) return;
    const overlay = document.createElement('div');
    overlay.className = 'val-overlay';
    overlay.id = 'valOverlay';
    overlay.onclick = closePanel;
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.className = 'val-panel';
    panel.id = 'valPanel';
    document.body.appendChild(panel);
  }

  function openPanel(){
    const c = typeof currentCase!=='undefined'? currentCase : null;
    if(!c){ if(typeof showToast==='function') showToast('Seleccione un caso primero','error'); return; }

    createPanel();
    const results = runValidation(c);
    const passed = results.filter(function(r){return r.ok;}).length;
    const failed = results.filter(function(r){return !r.ok;}).length;
    const totalIssues = results.reduce(function(acc,r){return acc+r.issues.length;},0);

    let html = `
      <div class="val-header">
        <h3>🔍 Validación: ${escH(c.name||'')}</h3>
        <button onclick="window._validacion.close()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">&times;</button>
      </div>
      <div class="val-summary">
        <div class="val-summary-item"><div class="num" style="color:var(--green)">${passed}</div><div class="lbl">Pasaron</div></div>
        <div class="val-summary-item"><div class="num" style="color:var(--red)">${failed}</div><div class="lbl">Fallaron</div></div>
        <div class="val-summary-item"><div class="num" style="color:var(--gold)">${totalIssues}</div><div class="lbl">Problemas</div></div>
      </div>`;

    // Mostrar fallidos primero
    var sorted = results.slice().sort(function(a,b){ return a.ok===b.ok ? 0 : a.ok ? 1 : -1; });
    sorted.forEach(function(r){
      html += `<div class="val-rule">
        <div class="val-rule-header">
          <span>${r.ok?'✅':'❌'}</span>
          <span style="font-weight:${r.ok?'400':'600'}">${escH(r.label)}</span>
          <span class="val-rule-cat">${escH(r.category)}</span>
        </div>`;
      r.issues.forEach(function(issue){
        html += '<div class="val-issue">⚠️ '+escH(issue)+'</div>';
      });
      html += '</div>';
    });

    const panel = document.getElementById('valPanel');
    panel.innerHTML = html;
    setTimeout(function(){
      panel.classList.add('open');
      document.getElementById('valOverlay').classList.add('open');
    }, 10);
  }

  function closePanel(){
    const p = document.getElementById('valPanel');
    const o = document.getElementById('valOverlay');
    if(p) p.classList.remove('open');
    if(o) o.classList.remove('open');
  }

  /* ── Botón en case header ── */
  function injectButton(){
    const header = document.getElementById('caseHeader');
    if(!header || header.querySelector('#valBtn')) return;
    // Buscar la fila de botones
    const btnRow = header.querySelector('div[style*="display:flex"][style*="gap:6px"]');
    if(!btnRow) return;
    const btn = document.createElement('button');
    btn.id = 'valBtn';
    btn.className = 'btn-sm';
    btn.title = 'Validar consistencia';
    btn.textContent = '🔍 Validar';
    btn.onclick = openPanel;
    btnRow.appendChild(btn);
  }

  /* ── Patchear renderCaseHeader ── */
  const _origRenderCaseHeader = window.renderCaseHeader;
  window.renderCaseHeader = function(){
    if(typeof _origRenderCaseHeader==='function') _origRenderCaseHeader();
    setTimeout(injectButton, 120);
  };

  /* ── API pública ── */
  window._validacion = {
    open: openPanel,
    close: closePanel,
    run: function(c){ return runValidation(c||currentCase); }
  };

})();
