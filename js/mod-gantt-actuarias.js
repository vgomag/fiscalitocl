/* ═══════════════════════════════════════════════════════════════════
   MOD-GANTT-ACTUARIAS.JS — Carta Gantt + Pendientes Actuarias · Fiscalito
   v1.0 · 2026-04-28
   - Tab "📅 Gantt" dentro de Estadísticas (vista en la app)
   - Cálculo de días hábiles UMAG (excluyendo feriados Chile + recesos)
   - Plazos legales por etapa × procedimiento
   - Asignación de actuaria por caso (manual, inline en la vista Gantt)
   - Export a Excel con 4 hojas adicionales: Carta Gantt, Pendientes
     Actuarias, Plazos, Feriados (replica el formato de la plantilla).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  console.log('[gantt-actuarias] cargando módulo…');

  /* ── Acceso a globals tipo `let` ───────────────────────────────── */
  const _readGlobal = (name) => {
    try {
      return (new Function(
        'try { return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined; } catch(e){ return undefined; }'
      ))();
    } catch { return undefined; }
  };
  const X = () => (typeof window !== 'undefined' && window.XLSX) ? window.XLSX : null;

  /* ── Lista de actuarias conocidas (configurable por el usuario) ── */
  const ACTUARIAS_DEFAULT = [
    'Roxana Pacheco Hernández',
    'Alejandra Mayorga Trujillo'
  ];
  function getActuarias() {
    try {
      const saved = JSON.parse(localStorage.getItem('fiscalito_actuarias') || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return ACTUARIAS_DEFAULT.slice();
  }
  function setActuarias(list) {
    if (Array.isArray(list)) localStorage.setItem('fiscalito_actuarias', JSON.stringify(list));
  }

  /* ── Tabla de plazos legales (días hábiles restantes según etapa) ── */
  const PLAZOS_TABLE = {
    'indagatoria':              { 'Sumario Administrativo':110, 'Investigación Sumaria':19, 'Procedimiento Disciplinario':95 },
    'cargos':                   { 'Sumario Administrativo':50,  'Investigación Sumaria':14, 'Procedimiento Disciplinario':50 },
    'descargos':                { 'Sumario Administrativo':40,  'Investigación Sumaria':10, 'Procedimiento Disciplinario':40 },
    'prueba':                   { 'Sumario Administrativo':40,  'Investigación Sumaria':10, 'Procedimiento Disciplinario':40 },
    'vista':                    { 'Sumario Administrativo':20,  'Investigación Sumaria':7,  'Procedimiento Disciplinario':30 },
    'resolucion':               { 'Sumario Administrativo':15,  'Investigación Sumaria':5,  'Procedimiento Disciplinario':20 },
    'finalizacion':             { 'Sumario Administrativo':0,   'Investigación Sumaria':0,  'Procedimiento Disciplinario':0  }
  };
  /* Etiquetas legibles para la tabla "Plazos" del Excel */
  const ETAPA_LABEL = {
    indagatoria:'Indagatoria', cargos:'Término Etapa Indagatoria',
    descargos:'Discusión y Prueba', prueba:'Discusión y Prueba',
    vista:'Preparación de Vista', resolucion:'Decisión',
    finalizacion:'Finalización', sin_etapa:'Sin etapa'
  };
  /* Para agrupación visual (Gantt + Pendientes), normalizamos descargos+prueba a "Discusión y Prueba" */
  function getEtapaKeyAndLabel(c) {
    let key = 'sin_etapa';
    try {
      if (typeof window.getEtapaKey === 'function') key = window.getEtapaKey(c) || 'sin_etapa';
      else if (typeof getEtapaKey === 'function') key = getEtapaKey(c) || 'sin_etapa';
    } catch {}
    if (key === 'descargos') key = 'prueba';
    return { key, label: ETAPA_LABEL[key] || 'Sin etapa' };
  }

  /* Procedimiento normalizado al diccionario de plazos */
  function normalizeProcedimiento(t) {
    const s = String(t || '').toLowerCase();
    if (/investigaci[oó]n\s*sumaria/.test(s)) return 'Investigación Sumaria';
    if (/sumario\s*administrativo/.test(s))   return 'Sumario Administrativo';
    if (/procedimiento\s*disciplinario/.test(s)) return 'Procedimiento Disciplinario';
    return 'Sumario Administrativo'; /* default */
  }
  function getPlazoDias(etapaKey, tipoProc) {
    const t = PLAZOS_TABLE[etapaKey] || {};
    return t[normalizeProcedimiento(tipoProc)] ?? 0;
  }

  /* ── Calendario UMAG: feriados Chile + recesos ─────────────────── */
  /* Feriados fijos Chile (mes 1-12, día) */
  const FERIADOS_FIJOS = [
    [1,1,'Año Nuevo'], [5,1,'Día del Trabajador'], [5,21,'Glorias Navales'],
    [6,29,'San Pedro y San Pablo'], [7,16,'Virgen del Carmen'],
    [8,15,'Asunción de la Virgen'], [9,18,'Independencia Nacional'],
    [9,19,'Glorias del Ejército'], [10,12,'Encuentro de Dos Mundos'],
    [10,31,'Iglesias Evangélicas'], [11,1,'Todos los Santos'],
    [12,8,'Inmaculada Concepción'], [12,25,'Navidad']
  ];
  /* Pascua (algoritmo de Gauss) → devuelve Date del Domingo de Pascua */
  function easterDate(year) {
    const a=year%19, b=Math.floor(year/100), c=year%100;
    const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
    const g=Math.floor((b-f+1)/3);
    const h=(19*a+b-d-g+15)%30;
    const i=Math.floor(c/4), k=c%4;
    const l=(32+2*e+2*i-h-k)%7;
    const m=Math.floor((a+11*h+22*l)/451);
    const month=Math.floor((h+l-7*m+114)/31);
    const day=((h+l-7*m+114)%31)+1;
    return new Date(year, month-1, day);
  }
  /* Recesos UMAG estándar (configurables) */
  function recesosUMAG(year) {
    const ranges = [
      ['Receso Verano funcionarios UMAG', new Date(year,0,26), new Date(year,1,8)],
      ['Receso semestral I',                new Date(year,6,15), new Date(year,6,21)],
      ['Receso semestral II',               new Date(year,7,15), new Date(year,7,21)],
      ['Receso fin de año',                 new Date(year,11,25),new Date(year,11,31)]
    ];
    const out = [];
    for (const [desc,a,b] of ranges) {
      for (let d=new Date(a); d<=b; d.setDate(d.getDate()+1)) out.push({date:new Date(d),desc,tipo:'Receso UMAG'});
    }
    return out;
  }
  /* Generación del calendario completo de feriados (rango de años) */
  function buildHolidaysMap(yearStart, yearEnd) {
    const map = new Map();   /* key 'YYYY-MM-DD' → {desc, tipo} */
    const list = [];
    for (let y=yearStart; y<=yearEnd; y++) {
      for (const [m,d,desc] of FERIADOS_FIJOS) {
        const dt = new Date(y, m-1, d);
        list.push({ date: dt, desc, tipo: 'Feriado legal' });
      }
      const easter = easterDate(y);
      const friSanto = new Date(easter); friSanto.setDate(easter.getDate()-2);
      const sabSanto = new Date(easter); sabSanto.setDate(easter.getDate()-1);
      list.push({ date: friSanto, desc: 'Viernes Santo', tipo: 'Feriado legal' });
      list.push({ date: sabSanto, desc: 'Sábado Santo',  tipo: 'Feriado legal' });
      list.push(...recesosUMAG(y));
    }
    list.sort((a,b)=>a.date - b.date);
    for (const f of list) {
      const k = ymdKey(f.date);
      if (!map.has(k)) map.set(k, f);
    }
    return { map, list };
  }
  function ymdKey(d) {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
  }
  let _HOLI = null;
  function H() {
    if (_HOLI) return _HOLI;
    const y = new Date().getFullYear();
    _HOLI = buildHolidaysMap(y-1, y+3);
    return _HOLI;
  }

  function isWeekend(d) { const w=d.getDay(); return w===0 || w===6; }
  function isUMAGHoliday(d) { return H().map.has(ymdKey(d)); }
  function isWorkingDay(d) { return !isWeekend(d) && !isUMAGHoliday(d); }

  /* Suma N días hábiles a `from` (excluye fin de semana y feriados/recesos) */
  function addWorkingDays(from, n) {
    const d = new Date(from);
    let added = 0;
    while (added < n) {
      d.setDate(d.getDate()+1);
      if (isWorkingDay(d)) added++;
    }
    return d;
  }
  /* Cuenta días hábiles entre dos fechas (excluyentes) */
  function countWorkingDays(start, end) {
    if (!start || !end) return 0;
    const a = new Date(start), b = new Date(end);
    if (isNaN(a)||isNaN(b)||a>=b) return 0;
    let n=0;
    const d = new Date(a);
    d.setDate(d.getDate()+1);
    while (d <= b) {
      if (isWorkingDay(d)) n++;
      d.setDate(d.getDate()+1);
    }
    return n;
  }

  /* ── Heurística próxima acción basada en observaciones ─────────── */
  const PRIO_RULES = [
    { re:/cuestionari/i,                         txt:'PRIORIDAD: Despachar/recoger cuestionarios pendientes y foliar respuestas.' },
    { re:/declarac.*testimon|testimonial/i,      txt:'PRIORIDAD: Coordinar y tomar declaraciones testimoniales pendientes.' },
    { re:/oficiar|oficio/i,                      txt:'PRIORIDAD: Redactar y despachar oficio; controlar respuesta.' },
    { re:/formulaci[oó]n.*cargo|^cargos$/i,      txt:'PRIORIDAD: Proyectar resolución de formulación de cargos y notificar al/la denunciado/a.' },
    { re:/probatorio|t[eé]rmino.*probator/i,     txt:'PRIORIDAD: Cerrar etapa probatoria; proyectar resolución que declara el término de la prueba.' },
    { re:/vista\s*fiscal/i,                      txt:'PRIORIDAD: Apoyar redacción y firma de la Vista Fiscal; remitir a la autoridad.' },
    { re:/sobresei/i,                            txt:'PRIORIDAD: Proyectar resolución de sobreseimiento y enviar a Rector/a para firma.' },
    { re:/ratificar|denunciante/i,               txt:'PRIORIDAD: Citar denunciante a ratificar.' },
    { re:/protecci[oó]n|enfoque de g[eé]nero/i,  txt:'PRIORIDAD: Tramitar medidas de protección con enfoque de género.' },
    { re:/reapertura/i,                          txt:'PRIORIDAD: Coordinar reapertura y notificar al fiscal.' },
    { re:/citaci[oó]n|reiterar/i,                txt:'PRIORIDAD: Reiterar citación / requerimiento y dejar constancia.' },
    { re:/firma.*autoridad|seguimiento.*firma/i, txt:'PRIORIDAD: Hacer seguimiento de firma de autoridad y reiterar si corresponde.' }
  ];
  const PRIO_DEFAULT_BY_ETAPA = {
    indagatoria:'PRIORIDAD: Citar y tomar declaración al/la denunciado/a; foliar y agregar al expediente.',
    cargos:'PRIORIDAD: Despachar/recoger cuestionarios pendientes y foliar respuestas.',
    prueba:'PRIORIDAD: Cerrar etapa probatoria; proyectar resolución que declara el término de la prueba.',
    descargos:'PRIORIDAD: Cerrar etapa probatoria; proyectar resolución que declara el término de la prueba.',
    vista:'PRIORIDAD: Apoyar redacción y firma de la Vista Fiscal; remitir a la autoridad.',
    resolucion:'PRIORIDAD: Apoyar análisis de antecedentes y proyectar resolución correspondiente.',
    finalizacion:'PRIORIDAD: Cierre formal del expediente.',
    sin_etapa:'PRIORIDAD: Verificar etapa procesal actual y planificar siguiente diligencia.'
  };
  function getProximaAccion(observaciones, etapaKey) {
    const obs = String(observaciones || '');
    for (const r of PRIO_RULES) if (r.re.test(obs)) return r.txt;
    return PRIO_DEFAULT_BY_ETAPA[etapaKey] || PRIO_DEFAULT_BY_ETAPA.sin_etapa;
  }

  /* ── Checklists por etapa (textos según plantilla del usuario) ─── */
  const CHECKLISTS = {
    indagatoria: [
      'Verificar aceptación escrita del cargo por parte del/la fiscal.',
      'Evaluar y proponer medidas de protección con enfoque de género y derechos.',
      'Solicitar ratificación o subsanación de la denuncia (si corresponde).',
      'Coordinar primera declaración del/la denunciado/a y agregar al expediente.',
      'Realizar revisión documental (contratos, correos, actas, reglamentos).',
      'Preparar y enviar cuestionarios a testigos con plazo claro.',
      'Digitalizar, foliar y archivar respuestas recibidas.',
      'Solicitar pruebas periciales u oficios externos requeridos.',
      'Mantener actualizada la planilla maestra (estado, plazos, prioridad).'
    ],
    cargos: [
      'Cerrar diligencias indagatorias pendientes (testimoniales, oficios, peritajes).',
      'Foliar y ordenar el expediente de forma íntegra.',
      'Verificar que toda la prueba esté incorporada y digitalizada.',
      'Proyectar borrador de informe (sobreseimiento o formulación de cargos).',
      'Someter borrador a revisión del/la fiscal.',
      'Registrar fecha de cierre y enviar informe a la autoridad inmediata.'
    ],
    prueba: [
      'Notificar correctamente la resolución que formula cargos al/la denunciado/a.',
      'Controlar el plazo legal para presentar descargos y registrar vencimiento.',
      'Recibir descargos, digitalizarlos, foliarlos e incorporarlos.',
      'Diligenciar nuevas pruebas si los descargos aportan antecedentes.',
      'Proyectar resolución que abre el término probatorio (si no se ha hecho).',
      'Recibir y foliar prueba rendida.',
      'Proyectar resolución que declara el término del probatorio.'
    ],
    descargos: null, /* alias prueba */
    vista: [
      'Recopilar y revisar todo el material probatorio y descargos.',
      'Apoyar al/la fiscal en la redacción de la Vista Fiscal con análisis de hechos, normativa aplicable y prueba.',
      'Verificar firmas y foliación final.',
      'Remitir el expediente a la autoridad competente (Rector/a o Vicerrector/a).',
      'Registrar fecha de envío en la planilla.'
    ],
    resolucion: [
      'Realizar seguimiento con la autoridad competente respecto a la dictación de la resolución.',
      'Preparar oficios o antecedentes adicionales que se soliciten.',
      'Proyectar notificación de la resolución a las partes.',
      'Verificar cómputo de plazos para eventuales recursos.',
      'Si se interpone recurso, foliar y dejar constancia.'
    ],
    finalizacion: [
      'Confirmar archivo del expediente físico y digital.',
      'Registrar resultado final en la planilla maestra.',
      'Comunicar cierre formal a las partes.'
    ],
    sin_etapa: [
      'Identificar etapa procesal actual del caso.',
      'Actualizar campo estado_procedimiento en Fiscalito.'
    ]
  };
  function getChecklist(etapaKey) {
    return CHECKLISTS[etapaKey] || CHECKLISTS.sin_etapa;
  }

  /* ── Picking de casos activos ───────────────────────────────────── */
  function pickAllCases() {
    try {
      if (typeof allCases !== 'undefined' && Array.isArray(allCases)) return allCases.slice();
    } catch {}
    if (Array.isArray(window.allCases)) return window.allCases.slice();
    const v = _readGlobal('allCases');
    if (Array.isArray(v)) return v.slice();
    return [];
  }
  const isActivo = c => c && c.status !== 'terminado' && c.status !== 'archived' && !c.deleted_at;

  /* ── Persistir actuaria asignada ─────────────────────────────────
     Si el campo `actuaria` existe en el row → usarlo directo.
     Como fallback (BD aún sin la columna) → guardar en localStorage
     map { caseId → 'NombreActuaria' } para no perder asignaciones. */
  const LS_KEY_ASSIGN = 'fiscalito_actuarias_assign';
  function getAssignMap() {
    try { return JSON.parse(localStorage.getItem(LS_KEY_ASSIGN)||'{}') || {}; }
    catch { return {}; }
  }
  function saveAssignMap(m) {
    try { localStorage.setItem(LS_KEY_ASSIGN, JSON.stringify(m||{})); } catch {}
  }
  function getActuariaCaso(c) {
    if (!c) return '';
    if (c.actuaria) return c.actuaria;
    return getAssignMap()[c.id] || '';
  }
  async function setActuariaCaso(caseId, nombre) {
    /* 1) Intentar persistir en BD */
    let dbOk = false;
    try {
      const sb = window.sb || _readGlobal('sb');
      if (sb && typeof sb.from === 'function') {
        const r = await sb.from('cases').update({ actuaria: nombre || null, updated_at:new Date().toISOString() }).eq('id', caseId);
        if (!r.error) dbOk = true;
        else console.warn('[gantt] no se pudo guardar actuaria en BD (probable columna inexistente):', r.error.message);
      }
    } catch (e) { console.warn('[gantt] update actuaria error:', e.message); }
    /* 2) Siempre mantener fallback en localStorage para que no se pierda si la columna no existe */
    const map = getAssignMap();
    if (nombre) map[caseId] = nombre; else delete map[caseId];
    saveAssignMap(map);
    /* 3) Actualizar el row in-memory para reflejo inmediato */
    try {
      const all = pickAllCases();
      const row = all.find(c => c.id === caseId);
      if (row) row.actuaria = nombre || null;
    } catch {}
    return dbOk;
  }

  /* ── Cálculo principal por caso para el Gantt ──────────────────── */
  function lastResolutionDate(c) {
    return c.fecha_resolucion_termino || c.fecha_resolucion || c.fecha_recepcion_fiscalia || c.fecha_denuncia || c.created_at || null;
  }
  function buildGanttRow(c) {
    const { key:etapaKey, label:etapaLbl } = getEtapaKeyAndLabel(c);
    const proc = c.tipo_procedimiento || '';
    const procNorm = normalizeProcedimiento(proc);
    const dias = getPlazoDias(etapaKey, proc);
    const ultimaRes = lastResolutionDate(c);
    const fechaTermino = dias > 0 ? addWorkingDays(new Date(), dias) : null;
    const denunciadoTxt = Array.isArray(c.denunciados) ? c.denunciados.join(', ') : (c.denunciados || '');
    return {
      caso: c,
      exp: c.name || c.numero_expediente || '',
      actuaria: getActuariaCaso(c),
      etapaKey, etapaLbl,
      procedimiento: procNorm,
      protocolo: c.protocolo || '',
      denunciado: denunciadoTxt,
      fechaRecepcion: c.fecha_recepcion_fiscalia || null,
      ultimaResolucion: ultimaRes,
      diasRestantes: dias,
      fechaTermino
    };
  }

  /* ───────────────────────────────────────────────────────────────
     UI: Vista Gantt en la app (tab dentro de Estadísticas)
     ─────────────────────────────────────────────────────────────── */

  let _ganttFilterActuaria = '';   /* '' = todas */
  let _ganttData = null;

  function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  function loadGanttData() {
    const all = pickAllCases().filter(isActivo);
    return all.map(buildGanttRow);
  }

  function actuariaColor(name) {
    /* Hash simple del nombre → color estable */
    if (!name) return '#94a3b8';
    let h=0; for (let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))|0;
    const palette = ['#ef4444','#3b82f6','#059669','#7c3aed','#f59e0b','#ec4899','#06b6d4','#14b8a6','#f97316','#64748b'];
    return palette[Math.abs(h)%palette.length];
  }

  function ganttWeeks(weeks) {
    const out=[];
    const today=new Date(); today.setHours(0,0,0,0);
    /* Lunes de esta semana */
    const day=today.getDay();
    const diffToMonday = (day===0?-6:1-day);
    const monday=new Date(today); monday.setDate(today.getDate()+diffToMonday);
    for (let i=0;i<weeks;i++){
      const d=new Date(monday); d.setDate(monday.getDate()+i*7);
      out.push(d);
    }
    return out;
  }

  function renderGanttView() {
    const el = document.getElementById('statsTabContent');
    if (!el) return;
    _ganttData = loadGanttData();
    const data = _ganttFilterActuaria
      ? _ganttData.filter(r => r.actuaria === _ganttFilterActuaria)
      : _ganttData;

    const actuariasUsadas = Array.from(new Set(_ganttData.map(r => r.actuaria).filter(Boolean))).sort();
    const opciones = getActuarias();
    const totalSinAsignar = _ganttData.filter(r => !r.actuaria).length;

    /* Agrupar por actuaria → etapa */
    const byActuaria = {};
    for (const r of data) {
      const k = r.actuaria || '— Sin actuaria —';
      (byActuaria[k] = byActuaria[k] || []).push(r);
    }
    const orderedActs = Object.keys(byActuaria).sort();

    const weeks = ganttWeeks(30);
    const today = new Date(); today.setHours(0,0,0,0);

    /* Construir cabecera de meses (agrupar semanas por mes) */
    const monthsHdr = [];
    let cur = null;
    for (let i=0;i<weeks.length;i++) {
      const w = weeks[i];
      const ml = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][w.getMonth()] + ' ' + String(w.getFullYear()).slice(-2);
      if (cur && cur.label===ml) cur.span++;
      else { cur = { label:ml, span:1 }; monthsHdr.push(cur); }
    }

    const META_COLS = 9; /* exp, actuaria, etapa, proc, prot, denunciado, recepcion, ultimaRes, dias, fechaTermino */

    let html = `
      <style>
        .gantt-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;overflow:auto}
        .gantt-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
        .gantt-toolbar .pill{font-size:11px;color:var(--text-muted);background:var(--surface2);padding:4px 9px;border-radius:12px}
        table.gantt{border-collapse:collapse;font-size:10.5px;font-family:var(--font-body);min-width:100%;}
        table.gantt th, table.gantt td{border:1px solid #e5e7eb;padding:3px 5px;white-space:nowrap;vertical-align:middle}
        table.gantt thead th{background:#f3f4f6;font-weight:600;color:#374151;text-align:left;font-size:10px}
        table.gantt thead th.month{text-align:center;background:#e5e7eb}
        table.gantt thead th.weekcol{text-align:center;font-family:var(--font-mono);font-size:9.5px;writing-mode:vertical-rl;transform:rotate(180deg);padding:4px 2px;min-width:18px;background:#f9fafb}
        table.gantt tbody td.metacol{font-size:10.5px}
        table.gantt tbody td.cell{min-width:18px;padding:0;height:24px;text-align:center}
        table.gantt tbody td.cell.active{background:#bfdbfe}
        table.gantt tbody td.cell.today{background:#fbbf24 !important}
        table.gantt tbody td.cell.end{background:#10b981 !important;color:#fff;font-weight:bold}
        table.gantt tbody tr.actuaria-sep td{background:linear-gradient(to right, var(--gold-glow), transparent);font-weight:700;color:var(--gold);padding:6px 10px;font-size:11px}
        table.gantt tbody tr.etapa-sep td{background:#f9fafb;color:#6b7280;font-style:italic;padding:3px 10px;font-size:10px}
        .gantt-act-select{font-size:10.5px;padding:2px 5px;border:1px solid #d1d5db;border-radius:4px;background:#fff;max-width:140px}
        .gantt-act-select.unassigned{background:#fef3c7}
        .gantt-warn{background:#fee2e2;color:#991b1b}
        .gantt-ok{background:#d1fae5;color:#065f46}
      </style>

      <div class="gantt-wrap">
        <!-- Toolbar -->
        <div class="gantt-toolbar">
          <strong style="font-size:13px">📅 Carta Gantt — Seguimiento Actuarias</strong>
          <span class="pill">Hoy: ${today.toLocaleDateString('es-CL')}</span>
          <span class="pill">${data.length} casos · ${actuariasUsadas.length} actuarias asignadas · ${totalSinAsignar} sin asignar</span>
          <span style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <label style="font-size:11px;color:var(--text-dim)">Filtrar actuaria:</label>
            <select onchange="setGanttFilter(this.value)" style="font-size:11px;padding:3px 6px;border-radius:4px">
              <option value="">— Todas —</option>
              ${actuariasUsadas.map(a => `<option value="${_esc(a)}" ${a===_ganttFilterActuaria?'selected':''}>${_esc(a)}</option>`).join('')}
            </select>
            <button class="btn-sm" onclick="exportGanttXLSX()" title="Descargar Excel completo (Mis Casos + Gestión + Gantt + Pendientes + Plazos + Feriados)" style="background:#1F4E78;color:#fff;font-weight:600;font-size:11px">📥 Excel completo</button>
            <button class="btn-sm" onclick="renderGanttView()" title="Refrescar" style="font-size:11px">↻</button>
            <button class="btn-sm" onclick="manageActuariasModal()" title="Gestionar lista de actuarias" style="font-size:11px">⚙ Actuarias</button>
          </span>
        </div>
        <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">
          Cálculo de plazos: días hábiles excluyendo fines de semana, feriados Chile y recesos UMAG (verano, semestrales, fin de año).
          Cada celda = 1 semana. <span style="color:#3b82f6">azul</span> = semana activa del caso · <span style="background:#10b981;color:#fff;padding:0 4px">verde</span> = fecha estimada de término · <span style="background:#fbbf24;padding:0 4px">amarillo</span> = semana actual.
        </div>

        <table class="gantt">
          <thead>
            <tr>
              <th rowspan="2">EXP.</th>
              <th rowspan="2">Actuaria</th>
              <th rowspan="2">Etapa actual</th>
              <th rowspan="2">Procedimiento</th>
              <th rowspan="2">Protoc.</th>
              <th rowspan="2">Denunciado/a</th>
              <th rowspan="2">Fecha recepción</th>
              <th rowspan="2">Última resol.</th>
              <th rowspan="2">Días háb. rest.</th>
              <th rowspan="2">Fecha estim. término</th>
              ${monthsHdr.map(m => `<th class="month" colspan="${m.span}">${_esc(m.label)}</th>`).join('')}
            </tr>
            <tr>
              ${weeks.map(w => `<th class="weekcol">${String(w.getDate()).padStart(2,'0')}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    /* Render rows agrupadas por actuaria → etapa */
    for (const act of orderedActs) {
      html += `<tr class="actuaria-sep"><td colspan="${META_COLS+1+weeks.length}">━━━ ${_esc(act)} (${byActuaria[act].length}) ━━━</td></tr>`;
      const byEt = {};
      for (const r of byActuaria[act]) (byEt[r.etapaLbl]=byEt[r.etapaLbl]||[]).push(r);
      for (const etLbl of Object.keys(byEt).sort()) {
        html += `<tr class="etapa-sep"><td colspan="${META_COLS+1+weeks.length}">▸ Etapa: ${_esc(etLbl)} (${byEt[etLbl].length})</td></tr>`;
        for (const r of byEt[etLbl]) {
          const recep = r.fechaRecepcion ? new Date(r.fechaRecepcion) : null;
          const ult   = r.ultimaResolucion ? new Date(r.ultimaResolucion) : null;
          const fin   = r.fechaTermino ? new Date(r.fechaTermino) : null;
          const startWk = recep || ult || today;

          /* Select inline para cambiar actuaria */
          const actAct = r.actuaria || '';
          const opts = ['<option value="">— Asignar —</option>',
            ...opciones.map(o => `<option value="${_esc(o)}" ${o===actAct?'selected':''}>${_esc(o)}</option>`)].join('');

          /* Pintar celdas: activa entre startWk y fin */
          let cellsHtml='';
          for (let i=0;i<weeks.length;i++) {
            const wkStart = weeks[i];
            const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate()+6);
            const isToday = today >= wkStart && today <= wkEnd;
            const inRange = (startWk <= wkEnd && (!fin || fin >= wkStart));
            const isEnd = fin && fin >= wkStart && fin <= wkEnd;
            let cls = 'cell';
            if (isEnd) cls += ' end';
            else if (inRange) cls += ' active';
            if (isToday) cls += ' today';
            const bg = inRange && !isEnd ? actuariaColor(act).replace('#','') : null;
            const inlineStyle = bg && !isEnd && !isToday ? `style="background:#${bg}55"` : '';
            cellsHtml += `<td class="${cls}" ${inlineStyle}>${isEnd?'■':''}</td>`;
          }

          const diasCls = r.diasRestantes <= 7 ? 'gantt-warn' : (r.diasRestantes >= 60 ? 'gantt-ok' : '');
          html += `<tr>
            <td class="metacol" style="font-weight:600">${_esc(r.exp)}</td>
            <td class="metacol"><select class="gantt-act-select ${actAct?'':'unassigned'}" data-case-id="${_esc(r.caso.id)}" onchange="assignActuaria('${_esc(r.caso.id)}', this.value)">${opts}</select></td>
            <td class="metacol">${_esc(r.etapaLbl)}</td>
            <td class="metacol">${_esc(r.procedimiento)}</td>
            <td class="metacol">${_esc(r.protocolo)}</td>
            <td class="metacol">${_esc((r.denunciado||'').substring(0,38))}</td>
            <td class="metacol">${_esc(r.fechaRecepcion?String(r.fechaRecepcion).slice(0,10):'—')}</td>
            <td class="metacol">${_esc(r.ultimaResolucion?String(r.ultimaResolucion).slice(0,10):'—')}</td>
            <td class="metacol ${diasCls}" style="text-align:center;font-weight:600">${r.diasRestantes||'—'}</td>
            <td class="metacol" style="text-align:center">${fin?fin.toISOString().slice(0,10):'—'}</td>
            ${cellsHtml}
          </tr>`;
        }
      }
    }

    if (!data.length) html += `<tr><td colspan="${META_COLS+1+weeks.length}" style="text-align:center;padding:20px;color:var(--text-muted)">Sin casos activos para mostrar.</td></tr>`;

    html += `</tbody></table></div>`;

    el.innerHTML = html;
  }

  function setGanttFilter(v) { _ganttFilterActuaria = v||''; renderGanttView(); }

  async function assignActuaria(caseId, nombre) {
    const sel = document.querySelector(`select.gantt-act-select[data-case-id="${caseId}"]`);
    if (sel) sel.disabled = true;
    try {
      await setActuariaCaso(caseId, nombre || '');
      if (typeof showToast==='function') showToast(nombre ? '✓ Asignada: '+nombre : '✓ Asignación removida');
    } catch (e) {
      if (typeof showToast==='function') showToast('⚠ '+e.message);
    } finally {
      if (sel) sel.disabled = false;
      /* refrescar la sub-vista (re-agrupa) */
      setTimeout(renderGanttView, 200);
    }
  }

  function manageActuariasModal() {
    const cur = getActuarias();
    const txt = prompt(
      'Lista de actuarias (una por línea). Estas opciones aparecerán en el selector de cada caso.',
      cur.join('\n')
    );
    if (txt === null) return;
    const list = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    setActuarias(list);
    if (typeof showToast==='function') showToast('✓ '+list.length+' actuarias guardadas');
    renderGanttView();
  }

  /* ───────────────────────────────────────────────────────────────
     Tab "📅 Gantt" inyectado en mod-estadisticas
     Patcheamos `renderDashboard` para añadir el botón de tab.
     ─────────────────────────────────────────────────────────────── */
  function injectGanttTab() {
    if (typeof window.renderDashboard !== 'function' || typeof window.setStatsTab !== 'function') return false;
    if (window._ganttTabPatched) return true;
    const origRender = window.renderDashboard;
    window.renderDashboard = function() {
      origRender.apply(this, arguments);
      /* Tras render, inyectar (a) un botón en la toolbar principal y (b) un tab */
      try {
        /* (a) Botón muy visible en la toolbar principal de Estadísticas */
        const toolbar = document.querySelector('#viewDashboard div[style*="display:flex;gap:6px"]');
        if (toolbar && !toolbar.querySelector('[data-gantt-toolbar-btn]')) {
          const tbtn = document.createElement('button');
          tbtn.className='btn-sm';
          tbtn.dataset.ganttToolbarBtn='1';
          tbtn.title='Abrir la Carta Gantt — seguimiento de actuarias por etapa y plazos';
          tbtn.style.cssText='background:#1F4E78;color:#fff;font-weight:700;font-size:11.5px;padding:5px 12px;border-radius:6px;border:none;cursor:pointer;box-shadow:0 0 0 0 rgba(31,78,120,0.6);animation:ganttPulse 2s ease-out 1';
          tbtn.innerHTML='📅 Carta Gantt';
          tbtn.onclick = ()=>renderGanttView();
          toolbar.insertBefore(tbtn, toolbar.firstChild);
          /* Inyectar keyframes una sola vez */
          if (!document.getElementById('gantt-pulse-style')) {
            const st=document.createElement('style');
            st.id='gantt-pulse-style';
            st.textContent='@keyframes ganttPulse{0%{box-shadow:0 0 0 0 rgba(31,78,120,0.6)}70%{box-shadow:0 0 0 12px rgba(31,78,120,0)}100%{box-shadow:0 0 0 0 rgba(31,78,120,0)}}';
            document.head.appendChild(st);
          }
        }

        /* (b) Tab "📅 Gantt Actuarias" en la fila de tabs */
        const tabsRow = document.querySelector('#viewDashboard div[style*="border-bottom:2px solid"]');
        if (tabsRow && !tabsRow.querySelector('[data-gantt-tab]')) {
          const btn = document.createElement('button');
          btn.className='btn-sm';
          btn.dataset.ganttTab='1';
          btn.style.cssText='border-radius:8px 8px 0 0;padding:8px 16px;font-weight:400;background:var(--surface);color:var(--text-dim)';
          btn.innerHTML='📅 Gantt Actuarias';
          btn.onclick = ()=>{
            document.querySelectorAll('#viewDashboard div[style*="border-bottom:2px solid"] button').forEach(b=>{
              b.style.background='var(--surface)';b.style.color='var(--text-dim)';b.style.fontWeight='400';
            });
            btn.style.background='var(--gold)';btn.style.color='#fff';btn.style.fontWeight='700';
            renderGanttView();
          };
          tabsRow.appendChild(btn);
        }
      } catch (e) { console.warn('[gantt] inject err:', e.message); }
    };
    window._ganttTabPatched = true;
    console.log('[gantt-actuarias] inyección activa: botón toolbar + tab en Estadísticas');
    return true;
  }
  function tryInject(retries) {
    retries = retries || 0;
    if (injectGanttTab()) return;
    if (retries > 50) { console.warn('[gantt-actuarias] no se pudo inyectar tab tras 50 intentos'); return; }
    setTimeout(()=>tryInject(retries+1), 200);
  }

  /* ───────────────────────────────────────────────────────────────
     EXPORT XLSX — Workbook con 6 hojas (estilo plantilla del usuario)
     ─────────────────────────────────────────────────────────────── */

  function fmtFechaDDMMYYYY(v) {
    if (!v) return '';
    if (v instanceof Date) return String(v.getDate()).padStart(2,'0')+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+v.getFullYear();
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3]+'-'+m[2]+'-'+m[1];
    return String(v);
  }
  function fechaCorteLarga() {
    const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const d=new Date(); return d.getDate()+' de '+meses[d.getMonth()]+' de '+d.getFullYear();
  }
  function getFiscalNombre() {
    const sess = (window.session && window.session.user) ? window.session : _readGlobal('session');
    const u = (sess && sess.user) || {};
    const meta = u.user_metadata || {};
    const nombre = meta.full_name || meta.name || meta.nombre || '';
    if (nombre) return String(nombre).toUpperCase();
    if (u.email) return String(u.email).split('@')[0].replace(/[._-]/g,' ').toUpperCase();
    return 'FISCAL';
  }

  /* Hoja "Mis Casos" (15 cols como el adjunto) */
  function buildMisCasosSheet(cases) {
    const xx = X();
    const headers = ['EXP.','Etapa','Resolución','Fecha Resolución','Fecha denuncia','Fecha de recepción fiscalía','Procedimiento','Denunciante','Estamento Denunciante','Denunciado/a','Estamento denunciado/a','Protocolo aplicable','Materia','Observaciones','Actuaria asignada'];
    const rows = cases.map(c => {
      const { label:etapaLbl } = getEtapaKeyAndLabel(c);
      return [
        c.name||'',
        etapaLbl,
        c.nueva_resolucion||c.resolucion||'',
        fmtFechaDDMMYYYY(c.fecha_resolucion),
        fmtFechaDDMMYYYY(c.fecha_denuncia),
        fmtFechaDDMMYYYY(c.fecha_recepcion_fiscalia),
        c.tipo_procedimiento||'',
        Array.isArray(c.denunciantes)?c.denunciantes.join(', '):(c.denunciantes||''),
        Array.isArray(c.estamentos_denunciante)?c.estamentos_denunciante.join(', '):(c.estamentos_denunciante||''),
        Array.isArray(c.denunciados)?c.denunciados.join(', '):(c.denunciados||''),
        Array.isArray(c.estamentos_denunciado)?c.estamentos_denunciado.join(', '):(c.estamentos_denunciado||''),
        c.protocolo||'',
        c.materia||'',
        c.observaciones||'',
        getActuariaCaso(c)
      ];
    });
    const ws = xx.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [{wch:8},{wch:22},{wch:18},{wch:14},{wch:14},{wch:18},{wch:24},{wch:22},{wch:18},{wch:24},{wch:18},{wch:18},{wch:30},{wch:34},{wch:22}];
    if (rows.length) ws['!autofilter']={ref:xx.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};
    return ws;
  }

  /* Hoja "Gestión" — replica formato fiscal del export legacy */
  function buildGestionSheet(cases) {
    const xx=X();
    const ws={};
    const merges=[];
    const NCOLS=4;
    const ETAPA_MAP=[
      { label:'Indagatoria',               keys:['indagatoria'],         obs:'En investigación inicial' },
      { label:'Término Etapa Indagatoria', keys:['cargos'],              obs:'Próxima resolución de cierre' },
      { label:'Discusión y Prueba',        keys:['descargos','prueba'],  obs:'Etapa de rendición de pruebas' },
      { label:'Preparación de Vista',      keys:['vista'],               obs:'En preparación de vista sumario' },
      { label:'Decisión',                  keys:['resolucion'],          obs:'Resolución pendiente del fiscal' },
      { label:'Finalización',              keys:['finalizacion'],        obs:'Pendiente de cierre formal' }
    ];
    const TIPO_MAP=[
      { label:'Investigación Sumaria',     match:t=>/investigaci[oó]n\s*sumaria/i.test(t),  norma:'Estatuto Administrativo / Protocolo' },
      { label:'Sumario Administrativo',    match:t=>/sumario\s*administrativo/i.test(t),    norma:'Estatuto Administrativo / Protocolo' },
      { label:'Procedimiento Disciplinario',match:t=>/procedimiento\s*disciplinario/i.test(t), norma:'Reglamento de Estudiante / Protocolo' },
      { label:'Sumario (sin clasificar)',  match:t=>!t||/^\s*sumario\s*$/i.test(String(t)), norma:'Estatuto Administrativo' }
    ];
    function setCell(r,c,v){
      const ref=xx.utils.encode_cell({r,c});
      const isNum=typeof v==='number';
      ws[ref]={t:isNum?'n':'s',v:isNum?v:(v==null?'':String(v))};
    }
    setCell(0,0,'PLANILLA DE GESTIÓN – FISCAL '+getFiscalNombre());
    merges.push({s:{r:0,c:0},e:{r:0,c:NCOLS-1}});
    setCell(1,0,'Fecha de corte: '+fechaCorteLarga());
    merges.push({s:{r:1,c:0},e:{r:1,c:NCOLS-1}});
    let r=3;
    setCell(r,0,'A) CASOS POR ETAPA DE TRAMITACIÓN'); merges.push({s:{r,c:0},e:{r,c:NCOLS-1}}); r++;
    setCell(r,0,'ETAPA'); setCell(r,1,'N° CASOS'); setCell(r,2,'% DEL TOTAL'); setCell(r,3,'OBSERVACIÓN'); r++;
    const conteoEt={}; let totEt=0;
    for(const c of cases){ const k=getEtapaKeyAndLabel(c).key; conteoEt[k]=(conteoEt[k]||0)+1; if(k!=='sin_etapa')totEt++; }
    for(const f of ETAPA_MAP){
      const n=f.keys.reduce((a,k)=>a+(conteoEt[k]||0),0);
      const pct=totEt>0?(n/totEt)*100:0;
      setCell(r,0,f.label); setCell(r,1,n); setCell(r,2,pct.toFixed(1).replace('.',',')+'%'); setCell(r,3,f.obs); r++;
    }
    setCell(r,0,'TOTAL'); setCell(r,1,totEt); r+=2;
    setCell(r,0,'B) CASOS POR MATERIA (TIPO DE PROCEDIMIENTO)'); merges.push({s:{r,c:0},e:{r,c:NCOLS-1}}); r++;
    setCell(r,0,'TIPO DE PROCEDIMIENTO'); setCell(r,1,'N° CASOS'); setCell(r,2,'% DEL TOTAL'); setCell(r,3,'NORMA APLICABLE'); r++;
    const conteoTp={}; let totTp=0;
    for(const c of cases){ for(const m of TIPO_MAP){ if(m.match(c.tipo_procedimiento)){ conteoTp[m.label]=(conteoTp[m.label]||0)+1; totTp++; break; } } }
    for(const m of TIPO_MAP){
      const n=conteoTp[m.label]||0;
      const pct=totTp>0?(n/totTp)*100:0;
      setCell(r,0,m.label); setCell(r,1,n); setCell(r,2,pct.toFixed(1).replace('.',',')+'%'); setCell(r,3,m.norma); r++;
    }
    setCell(r,0,'TOTAL'); setCell(r,1,totTp); r++;
    ws['!cols']=[{wch:32},{wch:14},{wch:14},{wch:38}];
    ws['!merges']=merges;
    ws['!ref']=xx.utils.encode_range({s:{r:0,c:0},e:{r:r-1,c:NCOLS-1}});
    return ws;
  }

  /* Hoja "Carta Gantt" */
  function buildGanttSheet(rowsGantt) {
    const xx=X();
    const aoa=[];
    const today=new Date(); today.setHours(0,0,0,0);
    aoa.push(['CARTA GANTT - PLANIFICACIÓN DE TÉRMINO DE CASOS']);
    aoa.push(['Fiscal: '+getFiscalNombre()+'  |  Fecha de corte: '+fmtFechaDDMMYYYY(today)+'  |  Días hábiles excluyendo feriados Chile y recesos UMAG']);
    aoa.push(['HOY:', today, '', '', '', '', '', '', '', '', '■','Fecha estimada de término']);
    const weeks = ganttWeeks(30);
    /* Fila de meses */
    const monthsRow = ['','','','','','','','','',''];
    let lastM=null;
    for (const w of weeks) {
      const ml = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][w.getMonth()] + ' ' + w.getFullYear();
      monthsRow.push(ml===lastM ? '' : ml);
      lastM = ml;
    }
    aoa.push(monthsRow);
    /* Cabecera */
    const headers = ['EXP.','Actuaria','Etapa actual','Procedimiento','Protocolo','Denunciado/a','Fecha recepción','Última resolución','Días hábiles restantes','Fecha estimada término', ...weeks];
    aoa.push(headers);
    /* Filas: agrupar por actuaria → etapa */
    const grouped = {};
    for (const r of rowsGantt) {
      const act = r.actuaria || '— Sin actuaria —';
      (grouped[act] = grouped[act] || []).push(r);
    }
    const orderedActs = Object.keys(grouped).sort();
    for (const act of orderedActs) {
      aoa.push(['━━━ '+act.toUpperCase()+' ━━━']);
      const byEt = {};
      for (const r of grouped[act]) (byEt[r.etapaLbl]=byEt[r.etapaLbl]||[]).push(r);
      for (const etLbl of Object.keys(byEt).sort()) {
        aoa.push(['  ▸ Etapa: '+etLbl]);
        for (const r of byEt[etLbl]) {
          const recep = r.fechaRecepcion ? new Date(r.fechaRecepcion) : null;
          const ult   = r.ultimaResolucion ? new Date(r.ultimaResolucion) : null;
          const fin   = r.fechaTermino;
          const startWk = recep || ult || today;
          const cells = weeks.map(w => {
            const wkStart = w;
            const wkEnd = new Date(w); wkEnd.setDate(w.getDate()+6);
            if (fin && fin >= wkStart && fin <= wkEnd) return '■';
            if (startWk <= wkEnd && (!fin || fin >= wkStart)) return '·';
            return '';
          });
          aoa.push([
            r.exp, r.actuaria||'', r.etapaLbl, r.procedimiento, r.protocolo, r.denunciado||'',
            recep, ult, r.diasRestantes||'', fin||'',
            ...cells
          ]);
        }
      }
    }
    const ws = xx.utils.aoa_to_sheet(aoa, { cellDates:true });
    /* Anchos */
    const cols = [{wch:8},{wch:22},{wch:22},{wch:24},{wch:10},{wch:28},{wch:14},{wch:14},{wch:10},{wch:14}];
    for (let i=0;i<weeks.length;i++) cols.push({wch:6});
    ws['!cols']=cols;
    /* Formato fecha en columnas relevantes (índices 6,7,9 + cabecera fila 4 col 10..) */
    return ws;
  }

  /* Hoja "Pendientes Actuarias" */
  function buildPendientesSheet(rowsGantt) {
    const xx=X();
    const aoa=[];
    aoa.push(['PENDIENTES POR CASO - INSTRUCCIONES PARA ACTUARIAS']);
    aoa.push(['Basado en CHECKLIST PROCEDIMIENTOS DISCIPLINARIOS y observaciones por caso  |  Fecha: '+fmtFechaDDMMYYYY(new Date())]);
    aoa.push([]);
    aoa.push(['EXP.','Etapa','Procedimiento','Denunciado/a','Próxima acción (PRIORIDAD)','Acciones según checklist','Plazo (días hábiles)']);
    const grouped = {};
    for (const r of rowsGantt) {
      const act = r.actuaria || '— Sin actuaria —';
      (grouped[act]=grouped[act]||[]).push(r);
    }
    for (const act of Object.keys(grouped).sort()) {
      aoa.push(['━━━ '+act.toUpperCase()+' ━━━']);
      const byEt = {};
      for (const r of grouped[act]) (byEt[r.etapaLbl]=byEt[r.etapaLbl]||[]).push(r);
      for (const etLbl of Object.keys(byEt).sort()) {
        aoa.push(['  ▸ Etapa: '+etLbl]);
        for (const r of byEt[etLbl]) {
          const obs = r.caso.observaciones || '';
          const prio = getProximaAccion(obs, r.etapaKey);
          const checklist = getChecklist(r.etapaKey).map((x,i)=>(i+1)+') '+x).join('\n');
          aoa.push([r.exp, r.etapaLbl, r.procedimiento, r.denunciado||'', prio, checklist, r.diasRestantes||0]);
        }
      }
    }
    const ws=xx.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:8},{wch:24},{wch:26},{wch:30},{wch:60},{wch:80},{wch:14}];
    return ws;
  }

  /* Hoja "Plazos" */
  function buildPlazosSheet() {
    const xx=X();
    const aoa=[
      ['TABLA DE PLAZOS LEGALES (días hábiles restantes según etapa actual)'],
      ['Fuente: Estatuto Administrativo Ley 18.834, Decreto N° 21/SU/2025, Ley 21.369 y Protocolos UMAG'],
      [],
      ['ETAPA ACTUAL','Sumario Administrativo','Investigación Sumaria','Procedimiento Disciplinario','OBSERVACIÓN'],
      ['Indagatoria',              110,19,95, 'Investigación + cierre + cargos + probatorio + vista + decisión + recursos'],
      ['Término Etapa Indagatoria',50, 14,50, 'Cierre + cargos + probatorio + vista + decisión + recursos'],
      ['Discusión y Prueba',       40, 10,40, 'Probatorio + vista + decisión + recursos'],
      ['Preparación de Vista',     20, 7, 30, 'Vista fiscal + decisión + recursos'],
      ['Decisión',                 15, 5, 20, 'Resolución autoridad + recursos'],
      ['Finalización',             0,  0, 0,  'Cierre formal del expediente']
    ];
    const ws=xx.utils.aoa_to_sheet(aoa);
    ws['!cols']=[{wch:30},{wch:22},{wch:22},{wch:24},{wch:60}];
    return ws;
  }

  /* Hoja "Feriados" — todos los feriados/recesos del rango actual */
  function buildFeriadosSheet() {
    const xx=X();
    const aoa=[
      ['FERIADOS Y RECESOS ACADÉMICOS UMAG'],
      ['FECHA','DESCRIPCIÓN','TIPO']
    ];
    const list = H().list;
    for (const f of list) aoa.push([f.date, f.desc, f.tipo]);
    const ws=xx.utils.aoa_to_sheet(aoa,{cellDates:true});
    ws['!cols']=[{wch:14},{wch:38},{wch:18}];
    /* Formato fecha */
    for (let r=2; r<aoa.length; r++) {
      const ref=xx.utils.encode_cell({r,c:0});
      if (ws[ref] && ws[ref].v instanceof Date) { ws[ref].t='d'; ws[ref].z='dd-mm-yyyy'; }
    }
    return ws;
  }

  async function exportGanttXLSX() {
    const xx = X();
    if (!xx || !xx.utils || typeof xx.writeFile !== 'function') {
      const m='La librería XLSX no está disponible. Recarga la página.';
      if (typeof showToast==='function') showToast('⚠ '+m); else alert(m); return;
    }
    if (typeof showToast==='function') showToast('📥 Generando Excel completo (6 hojas)…');
    try {
      const all = pickAllCases().filter(isActivo);
      const rowsGantt = all.map(buildGanttRow);
      const wb = xx.utils.book_new();
      xx.utils.book_append_sheet(wb, buildMisCasosSheet(all),     'Mis Casos');
      xx.utils.book_append_sheet(wb, buildGestionSheet(all),      'Gestión');
      xx.utils.book_append_sheet(wb, buildGanttSheet(rowsGantt),  'Carta Gantt');
      xx.utils.book_append_sheet(wb, buildPendientesSheet(rowsGantt),'Pendientes Actuarias');
      xx.utils.book_append_sheet(wb, buildPlazosSheet(),          'Plazos');
      xx.utils.book_append_sheet(wb, buildFeriadosSheet(),        'Feriados');
      const sess = (window.session && window.session.user) ? window.session : _readGlobal('session');
      const usuario = ((sess && sess.user && sess.user.email) || 'usuario').split('@')[0];
      const fecha = new Date().toISOString().slice(0,10);
      const filename = `Mis-Casos-Gantt_${usuario}_${fecha}.xlsx`;
      xx.writeFile(wb, filename);
      if (typeof showToast==='function') showToast('✓ '+filename+' descargado');
    } catch (e) {
      console.error('[exportGanttXLSX] error:', e);
      if (typeof showToast==='function') showToast('⚠ Error: '+e.message); else alert('Error: '+e.message);
    }
  }


  /* ───────────────────────────────────────────────────────────────
     INIT
     ─────────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>tryInject());
  } else {
    tryInject();
  }

  /* ── API global ─────────────────────────────────────────────── */
  window.renderGanttView = renderGanttView;
  window.openGanttView = openGanttView;
  window.setGanttFilter = setGanttFilter;
  window.assignActuaria = assignActuaria;
  window.manageActuariasModal = manageActuariasModal;
  window.exportGanttXLSX = exportGanttXLSX;
  /* Expuestos por si otros módulos quieren reutilizar el calendario */
  window.fiscalitoUMAG = {
    isWorkingDay, addWorkingDays, countWorkingDays,
    getPlazoDias, getEtapaKeyAndLabel, getProximaAccion, getChecklist,
    getActuarias, setActuarias, getActuariaCaso, setActuariaCaso
  };

  console.log('%c📅 Módulo Gantt Actuarias cargado','color:#1F4E78;font-weight:bold');
})();
