/**
 * MOD-BIBLIOTECA-PROCEDIMIENTOS.JS — Biblioteca de procedimientos disciplinarios
 * ───────────────────────────────────────────────────────────────────────────────
 * Base de conocimiento integrada con normativa chilena:
 *   - Estatuto Administrativo (Ley 18.834)
 *   - Ley Karin (21.643)
 *   - Ley 21.369 (Acoso en Educación Superior)
 *   - Reglamento interno UMAG
 *   - Flujogramas de procedimiento
 *   - Plazos y requisitos por tipo
 *   - Búsqueda por palabra clave
 */
(function(){
  'use strict';

  const MOD_ID = 'mod-biblioteca-proc';
  const VIEW_ID = 'viewBibliotecaProc';

  /* ── Base de conocimiento ── */
  const PROCEDIMIENTOS = [
    {
      id: 'is',
      tipo: 'Investigación Sumaria',
      norma: 'Arts. 126-131, Ley 18.834',
      descripcion: 'Procedimiento disciplinario breve para faltas leves o moderadas. El fiscal investigador tiene 5 días hábiles para presentar cargos y 20 días hábiles para completar la investigación.',
      etapas: ['Designación fiscal','Indagatoria (20 días háb.)','Formulación de cargos','Descargos (2 días háb.)','Vista fiscal','Resolución'],
      plazos: {
        investigacion: '20 días hábiles',
        prorroga: 'Hasta 60 días hábiles (total)',
        cargos: '5 días hábiles para formular',
        descargos: '2 días hábiles',
        vista: 'Sin plazo fijo',
        prescripcion_hecho: '4 años desde los hechos',
        prescripcion_conocimiento: '2 años desde conocimiento'
      },
      sanciones: ['Censura','Multa de 5% a 20% de remuneración'],
      tags: ['investigación sumaria','falta leve','ley 18834','estatuto administrativo','censura','multa']
    },
    {
      id: 'sa',
      tipo: 'Sumario Administrativo',
      norma: 'Arts. 132-148, Ley 18.834',
      descripcion: 'Procedimiento para faltas graves que pueden merecer destitución o suspensión. Más formal que la investigación sumaria, con fiscal titular y actuario.',
      etapas: ['Resolución instructora','Designación fiscal y actuario','Indagatoria (20 días háb.)','Formulación de cargos','Descargos (5 días háb.)','Período de prueba (plazos según EA)','Vista fiscal','Dictamen jurídico','Resolución'],
      plazos: {
        investigacion: '20 días hábiles',
        prorroga: 'Hasta 60 días hábiles (total)',
        cargos: 'Al cierre de indagatoria',
        descargos: '5 días hábiles',
        probatoria: 'Variable, según pruebas solicitadas',
        vista: 'Sin plazo fijo',
        prescripcion_hecho: '4 años desde los hechos',
        prescripcion_conocimiento: '2 años desde conocimiento'
      },
      sanciones: ['Censura','Multa 5%-20%','Suspensión hasta 3 meses','Destitución'],
      tags: ['sumario administrativo','falta grave','destitución','suspensión','actuario']
    },
    {
      id: 'karin',
      tipo: 'Procedimiento Ley Karin (21.643)',
      norma: 'Ley 21.643 (2024)',
      descripcion: 'Procedimiento especial para denuncias de acoso laboral, acoso sexual y violencia en el trabajo. Establece obligaciones específicas de prevención, investigación y sanción.',
      etapas: ['Recepción denuncia','Medidas de resguardo inmediatas','Designación investigador/a','Investigación (30 días háb.)','Informe de investigación','Pronunciamiento empleador','Comunicación a Dirección del Trabajo'],
      plazos: {
        investigacion: '30 días hábiles',
        prorroga: 'Hasta 30 días adicionales',
        medidas_resguardo: 'Inmediatas (dentro de 24-48 hrs)',
        informe: 'Al cierre de investigación',
        pronunciamiento: '15 días hábiles desde informe',
        prescripcion_hecho: '4 años',
        prescripcion_conocimiento: '2 años'
      },
      sanciones: ['Amonestación verbal','Amonestación escrita','Multa','Suspensión','Destitución','Denuncia a MP si hay delito'],
      tags: ['ley karin','acoso laboral','acoso sexual','violencia laboral','21643','medidas de resguardo','dirección del trabajo']
    },
    {
      id: 'ley21369',
      tipo: 'Procedimiento Ley 21.369',
      norma: 'Ley 21.369 (2021)',
      descripcion: 'Procedimiento para instituciones de educación superior. Establece obligaciones de prevención, investigación y sanción del acoso sexual, violencia y discriminación de género.',
      etapas: ['Recepción denuncia/requerimiento','Medidas urgentes','Admisibilidad','Investigación','Informe','Resolución','Sanciones y seguimiento'],
      plazos: {
        admisibilidad: '5 días hábiles',
        investigacion: 'Según reglamento interno',
        medidas_urgentes: 'Inmediatas',
        informe: 'Al cierre de investigación'
      },
      sanciones: ['Medidas formativas','Suspensión','Expulsión (estudiantes)','Amonestación','Destitución (funcionarios)','Inhabilitación'],
      tags: ['ley 21369','educación superior','acoso sexual','género','discriminación','universidad']
    },
    {
      id: 'cautelar',
      tipo: 'Medida Cautelar (Art. 129)',
      norma: 'Art. 129, Ley 18.834',
      descripcion: 'Suspensión preventiva del funcionario durante la substanciación del sumario cuando su permanencia sea un obstáculo para la investigación o cuando la naturaleza de los hechos lo amerite.',
      etapas: ['Solicitud fundada del fiscal','Evaluación de antecedentes','Resolución de autoridad','Notificación al afectado','Vigencia durante sumario','Levantamiento o confirmación'],
      plazos: {
        duracion: 'Mientras dure el sumario (máx. 3 meses)',
        revision: 'Revisable en cualquier momento',
        notificacion: 'Inmediata'
      },
      sanciones: [],
      tags: ['medida cautelar','art 129','suspensión preventiva','separación temporal']
    },
    {
      id: 'sobreseimiento',
      tipo: 'Sobreseimiento',
      norma: 'Arts. 134-135, Ley 18.834',
      descripcion: 'Término anticipado del procedimiento cuando no se acredita responsabilidad administrativa o los hechos no constituyen falta. También procede por prescripción.',
      etapas: ['Cierre de investigación','Análisis de antecedentes','Vista fiscal con propuesta de sobreseimiento','Resolución de autoridad'],
      plazos: {},
      sanciones: [],
      tags: ['sobreseimiento','absolución','prescripción','no responsabilidad','cierre']
    }
  ];

  /* ── Helpers ── */
  function escH(s){ return typeof esc==='function'? esc(s) : String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── CSS ── */
  if(!document.getElementById(MOD_ID+'-css')){
    const s = document.createElement('style'); s.id = MOD_ID+'-css';
    s.textContent = `
      .bp-container { padding:20px; max-width:900px; margin:0 auto; }
      .bp-search { width:100%; background:var(--surface2); border:1px solid var(--border2); color:var(--text); padding:10px 14px; border-radius:var(--radius); font-size:13px; font-family:var(--font-body); margin-bottom:16px; }
      .bp-card { background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius); margin-bottom:14px; overflow:hidden; transition:border-color .15s; }
      .bp-card:hover { border-color:var(--gold); }
      .bp-card-header { padding:14px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
      .bp-card-header h3 { font-family:var(--font-serif); font-size:15px; margin:0; }
      .bp-card-header .norma { font-size:11px; color:var(--text-muted); font-family:var(--font-mono); }
      .bp-card-body { padding:0 16px 16px; display:none; }
      .bp-card-body.open { display:block; }
      .bp-card-body p { font-size:12.5px; line-height:1.7; color:var(--text-dim); margin:0 0 12px; }
      .bp-section { margin-bottom:12px; }
      .bp-section h4 { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); margin:0 0 6px; }
      .bp-etapa { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px; }
      .bp-etapa .num { width:22px; height:22px; border-radius:50%; background:var(--gold); color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; flex-shrink:0; }
      .bp-plazo-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      .bp-plazo { padding:6px 10px; background:var(--bg); border-radius:4px; font-size:11.5px; }
      .bp-plazo .key { color:var(--text-muted); font-size:10px; text-transform:uppercase; }
      .bp-tag { display:inline-block; padding:2px 8px; margin:2px; border-radius:10px; font-size:10px; background:rgba(79,70,229,.08); color:var(--gold); }
      .bp-sancion { display:inline-block; padding:3px 10px; margin:2px; border-radius:4px; font-size:11px; background:rgba(239,68,68,.06); color:var(--red); border:1px solid rgba(239,68,68,.15); }
    `;
    document.head.appendChild(s);
  }

  /* ── Crear vista ── */
  function createView(){
    if(document.getElementById(VIEW_ID)) return;
    const main = document.querySelector('.main-content') || document.querySelector('main');
    if(!main) return;
    const div = document.createElement('div');
    div.className = 'view';
    div.id = VIEW_ID;
    div.style.display = 'none';
    main.appendChild(div);
  }

  /* ── Render ── */
  function renderBiblioteca(filter){
    const el = document.getElementById(VIEW_ID);
    if(!el) return;
    const q = (filter || '').toLowerCase().trim();

    const filtered = q ? PROCEDIMIENTOS.filter(function(p){
      const searchable = [p.tipo, p.norma, p.descripcion, p.tags.join(' ')].join(' ').toLowerCase();
      return searchable.includes(q);
    }) : PROCEDIMIENTOS;

    let html = `<div class="bp-container">
      <h2 style="font-family:var(--font-serif);font-size:20px;margin:0 0 4px">📚 Biblioteca de Procedimientos</h2>
      <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px">Normativa disciplinaria chilena aplicable a universidades estatales</p>
      <input type="text" class="bp-search" id="bpSearch" placeholder="Buscar por tipo, artículo, ley o palabra clave…" value="${escH(q)}" oninput="window._biblioProc.search(this.value)">`;

    if(!filtered.length){
      html += '<div style="text-align:center;padding:40px;color:var(--text-muted)">Sin resultados para "' + escH(q) + '"</div>';
    } else {
      filtered.forEach(function(p, idx){
        html += `<div class="bp-card">
          <div class="bp-card-header" onclick="window._biblioProc.toggle('bp-body-${idx}')">
            <div>
              <h3>${escH(p.tipo)}</h3>
              <span class="norma">${escH(p.norma)}</span>
            </div>
            <span style="font-size:14px;color:var(--text-muted)" id="bp-arrow-${idx}">▸</span>
          </div>
          <div class="bp-card-body" id="bp-body-${idx}">
            <p>${escH(p.descripcion)}</p>`;

        // Etapas
        if(p.etapas && p.etapas.length){
          html += '<div class="bp-section"><h4>Etapas del Procedimiento</h4>';
          p.etapas.forEach(function(e, i){
            html += `<div class="bp-etapa"><div class="num">${i+1}</div><span>${escH(e)}</span></div>`;
          });
          html += '</div>';
        }

        // Plazos
        if(p.plazos && Object.keys(p.plazos).length){
          html += '<div class="bp-section"><h4>Plazos</h4><div class="bp-plazo-grid">';
          Object.entries(p.plazos).forEach(function(kv){
            const label = kv[0].replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
            html += `<div class="bp-plazo"><div class="key">${escH(label)}</div><div>${escH(kv[1])}</div></div>`;
          });
          html += '</div></div>';
        }

        // Sanciones
        if(p.sanciones && p.sanciones.length){
          html += '<div class="bp-section"><h4>Sanciones Aplicables</h4><div>';
          p.sanciones.forEach(function(s){
            html += `<span class="bp-sancion">${escH(s)}</span>`;
          });
          html += '</div></div>';
        }

        // Tags
        html += '<div class="bp-section" style="margin-top:8px">';
        p.tags.forEach(function(t){
          html += `<span class="bp-tag">${escH(t)}</span>`;
        });
        html += '</div>';

        html += '</div></div>';
      });
    }

    html += '</div>';
    el.innerHTML = html;
  }

  /* ── Toggle card ── */
  function toggleCard(id){
    const body = document.getElementById(id);
    if(!body) return;
    const isOpen = body.classList.toggle('open');
    const idx = id.replace('bp-body-','');
    const arrow = document.getElementById('bp-arrow-'+idx);
    if(arrow) arrow.textContent = isOpen ? '▾' : '▸';
  }

  /* ── Sidebar nav ── */
  function addSidebarItem(){
    const nav = document.querySelector('.sidebar-nav');
    if(!nav || document.getElementById('navBiblioProc')) return;
    const item = document.createElement('div');
    item.id = 'navBiblioProc';
    item.className = 'sidebar-nav-item';
    item.innerHTML = '<span style="margin-right:6px">📚</span>Procedimientos';
    item.onclick = function(){
      if(typeof showView === 'function') showView(VIEW_ID);
      renderBiblioteca();
      document.querySelectorAll('.sidebar-nav-item').forEach(function(n){ n.classList.remove('active'); });
      item.classList.add('active');
    };
    nav.appendChild(item);
  }

  /* ── API pública ── */
  window._biblioProc = {
    toggle: toggleCard,
    search: function(q){ renderBiblioteca(q); },
    open: function(){ if(typeof showView==='function') showView(VIEW_ID); renderBiblioteca(); }
  };

  /* ── Init ── */
  function init(){
    createView();
    addSidebarItem();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
