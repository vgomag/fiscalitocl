/**
 * MOD-ESTADISTICAS-AVANZADAS.JS — Gráficos y análisis complementarios
 * ────────────────────────────────────────────────────────────────────
 * Extiende el dashboard de estadísticas con:
 *   - Línea temporal de casos (apertura por mes)
 *   - Mapa de calor por semana/día
 *   - Distribución de duración (histograma)
 *   - Indicadores KPI resumidos
 *   - Análisis de prescripción (riesgo global)
 * Requiere Chart.js ya cargado.
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-estadisticas-avanzadas';

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function parseDate(s){
    if(!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b){
    if(!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .sa-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin-bottom:16px; }
      .sa-kpi { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:12px 14px; text-align:center; }
      .sa-kpi .val { font-size:24px; font-weight:700; font-family:var(--font-mono); color:var(--gold); }
      .sa-kpi .label { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-top:2px; }
      .sa-chart-wrap { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); padding:14px; margin-bottom:14px; }
      .sa-chart-wrap h4 { font-family:var(--font-serif); font-size:13px; margin:0 0 10px; }
      .sa-risk-bar { display:flex; height:24px; border-radius:4px; overflow:hidden; margin:8px 0; font-size:10px; font-weight:600; }
      .sa-risk-bar > div { display:flex; align-items:center; justify-content:center; color:#fff; transition:width .3s; }
    `;
    document.head.appendChild(s);
  }

  /* ── Patchear vista de estadísticas para agregar tab avanzado ── */
  function injectAdvancedTab(){
    // Buscar el contenedor de tabs del dashboard
    const statsTabs = document.querySelector('#viewStats .tabs, #viewStats [class*="stat-tabs"]');
    if(!statsTabs || statsTabs.querySelector('[data-tab="tabStatsAvanzado"]')) return false;

    // Agregar tab
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = 'tabStatsAvanzado';
    tab.textContent = '📊 Avanzado';
    tab.onclick = function(){
      // Desactivar otros
      statsTabs.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      // Mostrar/ocultar contenidos
      const parent = statsTabs.parentElement;
      parent.querySelectorAll('.tab-content, [id^="statsTab"]').forEach(function(c){ c.style.display='none'; });
      const adv = document.getElementById('tabStatsAvanzado');
      if(adv) adv.style.display = '';
      renderAdvanced();
    };
    statsTabs.appendChild(tab);

    // Crear contenedor de contenido
    const content = document.createElement('div');
    content.id = 'tabStatsAvanzado';
    content.className = 'tab-content';
    content.style.display = 'none';
    content.style.padding = '16px';
    statsTabs.after(content);

    return true;
  }

  /* ── Calcular KPIs ── */
  function computeKPIs(cases){
    const now = new Date();
    const active = cases.filter(function(c){ return c.status === 'active'; });
    const terminated = cases.filter(function(c){ return c.status === 'terminado'; });

    // Duración promedio de terminados
    const durations = terminated.map(function(c){
      return c.duracion_dias || daysBetween(parseDate(c.fecha_recepcion_fiscalia), parseDate(c.fecha_vista));
    }).filter(function(d){ return d != null && d > 0; });
    const avgDuration = durations.length ? Math.round(durations.reduce(function(a,b){return a+b;},0) / durations.length) : 0;

    // Casos nuevos últimos 30 días
    const thirtyAgo = new Date(now.getTime() - 30*86400000);
    const newLast30 = cases.filter(function(c){
      const d = parseDate(c.fecha_denuncia || c.created_at);
      return d && d >= thirtyAgo;
    }).length;

    // Tasa de resolución
    const resolutionRate = cases.length ? Math.round((terminated.length / cases.length) * 100) : 0;

    // Riesgo de prescripción (simplificado)
    let riskHigh = 0, riskMed = 0, riskLow = 0;
    active.forEach(function(c){
      const fecha = parseDate(c.fecha_denuncia || c.fecha_hechos);
      if(!fecha) return;
      const dias = daysBetween(fecha, now);
      if(dias > 600) riskHigh++;
      else if(dias > 365) riskMed++;
      else riskLow++;
    });

    return { total: cases.length, active: active.length, terminated: terminated.length, avgDuration, newLast30, resolutionRate, riskHigh, riskMed, riskLow };
  }

  /* ── Renderizar ── */
  function renderAdvanced(){
    const el = document.getElementById('tabStatsAvanzado');
    if(!el) return;
    const cases = typeof allCases !== 'undefined' ? (allCases || []) : [];
    if(!cases.length){
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Sin datos disponibles</div>';
      return;
    }

    const kpi = computeKPIs(cases);

    el.innerHTML = `
      <div class="sa-kpi-grid">
        <div class="sa-kpi"><div class="val">${kpi.total}</div><div class="label">Total casos</div></div>
        <div class="sa-kpi"><div class="val" style="color:var(--green)">${kpi.active}</div><div class="label">Activos</div></div>
        <div class="sa-kpi"><div class="val">${kpi.terminated}</div><div class="label">Terminados</div></div>
        <div class="sa-kpi"><div class="val">${kpi.avgDuration}</div><div class="label">Días prom.</div></div>
        <div class="sa-kpi"><div class="val">${kpi.newLast30}</div><div class="label">Nuevos (30d)</div></div>
        <div class="sa-kpi"><div class="val">${kpi.resolutionRate}%</div><div class="label">Tasa resolución</div></div>
      </div>

      <div class="sa-chart-wrap">
        <h4>⏰ Riesgo de Prescripción (casos activos)</h4>
        <div class="sa-risk-bar">
          ${kpi.riskHigh ? `<div style="width:${Math.round(kpi.riskHigh/(kpi.active||1)*100)}%;background:#ef4444">${kpi.riskHigh} crítico</div>` : ''}
          ${kpi.riskMed ? `<div style="width:${Math.round(kpi.riskMed/(kpi.active||1)*100)}%;background:#f59e0b">${kpi.riskMed} medio</div>` : ''}
          ${kpi.riskLow ? `<div style="width:${Math.round(kpi.riskLow/(kpi.active||1)*100)}%;background:#059669">${kpi.riskLow} bajo</div>` : ''}
          ${!kpi.riskHigh && !kpi.riskMed && !kpi.riskLow ? '<div style="width:100%;background:var(--border);color:var(--text-muted)">Sin datos de fecha</div>' : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="sa-chart-wrap">
          <h4>📈 Casos por Mes</h4>
          <canvas id="saChartTimeline" height="200"></canvas>
        </div>
        <div class="sa-chart-wrap">
          <h4>📊 Distribución de Duración</h4>
          <canvas id="saChartDuration" height="200"></canvas>
        </div>
      </div>

      <div class="sa-chart-wrap">
        <h4>🏷️ Materia más Frecuente</h4>
        <canvas id="saChartMateria" height="180"></canvas>
      </div>
    `;

    // Render charts after DOM update
    setTimeout(function(){ renderCharts(cases); }, 50);
  }

  function renderCharts(cases){
    if(typeof Chart === 'undefined') return;

    // 1. Timeline: casos por mes
    const monthCounts = {};
    cases.forEach(function(c){
      const d = parseDate(c.fecha_denuncia || c.created_at);
      if(!d) return;
      const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
      monthCounts[key] = (monthCounts[key]||0) + 1;
    });
    const sortedMonths = Object.keys(monthCounts).sort();
    const timelineCtx = document.getElementById('saChartTimeline');
    if(timelineCtx){
      new Chart(timelineCtx, {
        type:'line',
        data:{
          labels: sortedMonths.map(function(m){ return m; }),
          datasets:[{
            label:'Casos nuevos',
            data: sortedMonths.map(function(m){ return monthCounts[m]; }),
            borderColor:'#4f46e5', backgroundColor:'rgba(79,70,229,.1)',
            fill:true, tension:0.3, pointRadius:3
          }]
        },
        options:{ responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true,ticks:{stepSize:1}} } }
      });
    }

    // 2. Histograma de duración
    const buckets = {'0-30':0,'31-60':0,'61-90':0,'91-180':0,'180+':0};
    cases.forEach(function(c){
      const dur = c.duracion_dias || daysBetween(parseDate(c.fecha_recepcion_fiscalia), parseDate(c.fecha_vista));
      if(!dur || dur <= 0) return;
      if(dur <= 30) buckets['0-30']++;
      else if(dur <= 60) buckets['31-60']++;
      else if(dur <= 90) buckets['61-90']++;
      else if(dur <= 180) buckets['91-180']++;
      else buckets['180+']++;
    });
    const durCtx = document.getElementById('saChartDuration');
    if(durCtx){
      new Chart(durCtx, {
        type:'bar',
        data:{
          labels: Object.keys(buckets).map(function(k){ return k+' días'; }),
          datasets:[{
            label:'Casos',
            data: Object.values(buckets),
            backgroundColor:['#059669','#06b6d4','#f59e0b','#f97316','#ef4444'],
            borderRadius:4
          }]
        },
        options:{ responsive:true, plugins:{ legend:{display:false} }, scales:{ y:{beginAtZero:true,ticks:{stepSize:1}} } }
      });
    }

    // 3. Materias
    const materias = {};
    cases.forEach(function(c){
      const m = c.materia || 'Sin materia';
      materias[m] = (materias[m]||0) + 1;
    });
    const sortedMaterias = Object.entries(materias).sort(function(a,b){ return b[1]-a[1]; }).slice(0,8);
    const matCtx = document.getElementById('saChartMateria');
    if(matCtx){
      const palette = ['#4f46e5','#06b6d4','#f59e0b','#059669','#ef4444','#7c3aed','#f97316','#ec4899'];
      new Chart(matCtx, {
        type:'doughnut',
        data:{
          labels: sortedMaterias.map(function(m){ return m[0]; }),
          datasets:[{
            data: sortedMaterias.map(function(m){ return m[1]; }),
            backgroundColor: palette.slice(0, sortedMaterias.length)
          }]
        },
        options:{ responsive:true, plugins:{ legend:{ position:'right', labels:{ font:{size:11} } } } }
      });
    }
  }

  /* ── Init ── */
  function init(){
    // Intentar inyectar tab; si el dashboard no existe aún, reintentar
    if(!injectAdvancedTab()){
      let tries = 0;
      const iv = setInterval(function(){
        if(injectAdvancedTab() || ++tries > 20) clearInterval(iv);
      }, 500);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
