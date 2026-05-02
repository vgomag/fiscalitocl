/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAR MIS CASOS — Actuarías + Pendientes (planilla 2026-04-28)
   ───────────────────────────────────────────────────────────────────────────
   Usa los datos de la planilla "Mis-Casos_usuario_2026-04-28.xlsx" para:
     1) Asignar la ACTUARIA a cada caso (vía fiscalitoUMAG.setActuariaCaso,
        con fallback a la columna `actuaria` y a localStorage).
     2) Crear una acción PENDIENTE por cada caso con el texto del campo
        "Observaciones" (priorizada como ALTA si comienza con "PRIORIDAD:").
     3) Completar campos vacíos del caso: estado_procedimiento, denunciados,
        nueva_resolucion (sin sobrescribir lo que ya tienes).

   Es IDEMPOTENTE:
     - No crea pendientes duplicados (busca por título exacto).
     - No sobrescribe la actuaria si ya está asignada (a menos que cambies FORCE).

   USO:
     1. Abre Fiscalito en el navegador con tu sesión iniciada.
     2. Abre la consola (F12 → Console).
     3. Pega TODO este archivo y presiona Enter.
     4. Espera el resumen final. Refresca (F5) para ver la columna Actuaria.
   ═══════════════════════════════════════════════════════════════════════════ */

(async function importarMisCasos20260501 () {
  const FORCE_ACTUARIA = false;     // true = sobrescribir actuaria existente
  const FORCE_PENDIENTE = false;    // true = volver a crear el pendiente aunque exista
  const PRIORITY_BY_DEFAULT = 'alta'; // todas las observaciones son PRIORIDAD

  /* ─── Datos de la planilla (60 casos) ─── */
  const DATA = [
    { exp: "14-A",  etapa: "Decisión",                 resolucion: "122-2023  Exenta",     actuaria: "Roxana Pacheco Hernández",   denunciado: "Daniel Matus Carrasco",                                          observaciones: "PRIORIDAD: Evaluar vero" },
    { exp: "18-A",  etapa: "Decisión",                 resolucion: "593-2023 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Vicente Pérez Candia",                                            observaciones: "PRIORIDAD: Evaluar vero" },
    { exp: "69-A",  etapa: "Decisión",                 resolucion: "110/2025 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Ramón Patricio Asencio Contreras",                                observaciones: "PRIORIDAD: Evaluar vero" },
    { exp: "70-A",  etapa: "Decisión",                 resolucion: "100/2023 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Quien resulte responsable (Q.R.R.)",                              observaciones: "PRIORIDAD: Evaluar vero" },
    { exp: "73 G",  etapa: "Decisión",                 resolucion: "665-2025 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Yustin Steven González Geraldo",                                  observaciones: "PRIORIDAD: Reiterar citacion denunciante." },
    { exp: "25 G",  etapa: "Discusión y Prueba",       resolucion: "673-2023-VRAC",        actuaria: "Roxana Pacheco Hernández",   denunciado: "Graciela Gonzalez Mendoza",                                       observaciones: "PRIORIDAD: Proyectar resolución de formulación de cargos y notificar al/la denunciado/a." },
    { exp: "50 G",  etapa: "Discusión y Prueba",       resolucion: "226-2024 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Nelson Fabian Mc-ardle Draguicevic",                              observaciones: "PRIORIDAD: Proyectar resolución de formulación de cargos y notificar al/la denunciado/a." },
    { exp: "54 G",  etapa: "Discusión y Prueba",       resolucion: "491-2024 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Cristina Elizabeth Paredes Silva",                                observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "56-A",  etapa: "Discusión y Prueba",       resolucion: "288-2024",             actuaria: "Alejandra Mayorga Trujillo", denunciado: "Andrea Yupanqui Concha",                                          observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "72-A",  etapa: "Discusión y Prueba",       resolucion: "719/2025",             actuaria: "Roxana Pacheco Hernández",   denunciado: "Karena Espinoza Saavedra",                                        observaciones: "PRIORIDAD: Proyectar resolución de formulación de cargos y notificar al/la denunciado/a." },
    { exp: "73-A",  etapa: "Discusión y Prueba",       resolucion: "1447/2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Loreto Ivette del Carmen Manosalva Carrasco",                     observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "74-A",  etapa: "Discusión y Prueba",       resolucion: "1448/2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Claudia Andrea Mansilla Andrade",                                 observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "75-A",  etapa: "Discusión y Prueba",       resolucion: "1449/2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Andrea Yupanqui Concha",                                          observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "78-A",  etapa: "Discusión y Prueba",       resolucion: "1463/2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Mónica Marcela López Estefo",                                     observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "79-A",  etapa: "Discusión y Prueba",       resolucion: "1464/2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Pamela Ximena Oyarzo Velásquez",                                  observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "83-A",  etapa: "Discusión y Prueba",       resolucion: "1468-2025",            actuaria: "Alejandra Mayorga Trujillo", denunciado: "Sandra Beatriz Clerc Maripani",                                   observaciones: "PRIORIDAD: Apertura del término probatorio" },
    { exp: "76 G",  etapa: "Indagatoria",              resolucion: "908/2025-VRAC",        actuaria: "Alejandra Mayorga Trujillo", denunciado: "Javiera  Antonia Oyarzo Durán y Samuel Antonio Gutiérrez Carvallo", observaciones: "PRIORIDAD: Reiterar citación denunciado y citar denunciado Samuel Antonio Gutiérrez Carvallo / requerimiento y dejar constancia." },
    { exp: "79 G",  etapa: "Indagatoria",              resolucion: "1012/2025-VRAC",       actuaria: "Alejandra Mayorga Trujillo", denunciado: "Sofìa Belén Gálvez Lobos",                                        observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "81 G",  etapa: "Indagatoria",              resolucion: "1470-2025 Exenta",     actuaria: "Alejandra Mayorga Trujillo", denunciado: "Vicente Pérez Candia",                                            observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "83 G",  etapa: "Indagatoria",              resolucion: "1531-2025 Exenta",     actuaria: "Alejandra Mayorga Trujillo", denunciado: "Valentina Beatriz Velásquez Vera",                                observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "84-A",  etapa: "Indagatoria",              resolucion: "60-2026 Exenta",       actuaria: "Alejandra Mayorga Trujillo", denunciado: "Nicole Ahern Medina",                                             observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "85-A",  etapa: "Indagatoria",              resolucion: "186-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Viviana Patricia Mañao Figueroa",                                 observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "86-A",  etapa: "Indagatoria",              resolucion: "187-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Ricardo Javier Haro Bustamante",                                  observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "87-A",  etapa: "Indagatoria",              resolucion: "370-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Verónica del Carmen Castro Soto",                                 observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "88-A",  etapa: "Indagatoria",              resolucion: "371-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Luis Alejandro Vladilo Zúñiga",                                   observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "89 G",  etapa: "Indagatoria",              resolucion: "RES-EX-N17112025",     actuaria: "Alejandra Mayorga Trujillo", denunciado: "Cristina Alvarez Filicic",                                        observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "89-A",  etapa: "Indagatoria",              resolucion: "372-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Jeanette de Lourdes Jones Arteaga.",                              observaciones: "PRIORIDAD: Citar y tomar declaración al/la denunciado/a y agregar al expediente." },
    { exp: "90 G",  etapa: "Indagatoria",              resolucion: "Resolución Exenta 27-2026", actuaria: "Alejandra Mayorga Trujillo", denunciado: "Benjamín Ignacio Zambrano Santana",                          observaciones: "PRIORIDAD: Coordinar y tomar declaraciones testimoniales pendientes." },
    { exp: "90-A",  etapa: "Indagatoria",              resolucion: "316-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Yanina Dìaz Pingel",                                              observaciones: "PRIORIDAD: Hacer seguimiento de firma de autoridad y reiterar si corresponde." },
    { exp: "91-G",  etapa: "Indagatoria",              resolucion: "R.E. 51-2026",         actuaria: "Alejandra Mayorga Trujillo", denunciado: "Paulina Alejandra Pérez Vidal",                                   observaciones: "PRIORIDAD: Hacer seguimiento de firma de autoridad y reiterar si corresponde." },
    { exp: "93-G",  etapa: "Indagatoria",              resolucion: "311-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Daniela Krautz Christie",                                         observaciones: "PRIORIDAD: Comunicar medidas de protección y PRIORIDAD: Citar denunciante a ratificar declaración denunciada" },
    { exp: "94-G",  etapa: "Indagatoria",              resolucion: "317-2026 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Daniela Krautz Christie",                                         observaciones: "PRIORIDAD: Comunicar medidas de protección y declaración denunciada PRIORIDAD: Citar denunciante a ratificar" },
    { exp: "95-G",  etapa: "Indagatoria",              resolucion: "366-2026 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Laura Valenzuela Cruces",                                         observaciones: "PRIORIDAD: Citar denunciante a ratificar" },
    { exp: "55 G",  etapa: "Preparación de Vista",     resolucion: "441-2024 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Patricia Ruiz Vera",                                              observaciones: "PRIORIDAD: Proyectar resolución de sobreseimiento y enviar a Rector/a para firma." },
    { exp: "59-A",  etapa: "Preparación de Vista",     resolucion: "1303/2024",            actuaria: "Roxana Pacheco Hernández",   denunciado: "Edelberto Ricardo Gatica Arteaga",                                observaciones: "PRIORIDAD: Redacción de la Vista Fiscal; remitir a la autoridad." },
    { exp: "71-A",  etapa: "Preparación de Vista",     resolucion: "1302/2024 Exenta",     actuaria: "Roxana Pacheco Hernández",   denunciado: "Área de Pedagogía en Educación Física",                           observaciones: "PRIORIDAD: Proyectar resolución de sobreseimiento y enviar a Rector/a para firma." },
    { exp: "82 G",  etapa: "Preparación de Vista",     resolucion: "1472-2025 Exenta",     actuaria: "Alejandra Mayorga Trujillo", denunciado: "Alejandra Ahimara Sanchez Contreras",                             observaciones: "PRIORIDAD: Redacción y firma de la Vista Fiscal; remitir a la autoridad." },
    { exp: "92-G",  etapa: "Preparación de Vista",     resolucion: "157-2026 Exenta",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Abigail Avendaño Cossio",                                         observaciones: "PRIORIDAD: Tramitar archivo provisional y comunicar a las partes." },
    { exp: "56 G",  etapa: "Término Etapa Indagatoria", resolucion: "813-2024-VRAC",       actuaria: "Roxana Pacheco Hernández",   denunciado: "Benjamín Esteban Núñez Paredes",                                  observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "57-A",  etapa: "Término Etapa Indagatoria", resolucion: "775/2024 Exenta",     actuaria: "Roxana Pacheco Hernández",   denunciado: "Mario Erwin Triviño Águila",                                      observaciones: "PRIORIDAD: Coordinar y tomar declaraciones testimoniales pendientes." },
    { exp: "58 G",  etapa: "Término Etapa Indagatoria", resolucion: "926-2024-VRAC",       actuaria: "Alejandra Mayorga Trujillo", denunciado: "Cristobal Sebastián Solis Martínez",                              observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "62 G",  etapa: "Término Etapa Indagatoria", resolucion: "1013/2024-VRAC",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Aldair Alonso Torres Molina",                                     observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "62-A",  etapa: "Término Etapa Indagatoria", resolucion: "1348/2024 Exenta",    actuaria: "Roxana Pacheco Hernández",   denunciado: "Ximena Verónica Soto Castro",                                     observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "64 G",  etapa: "Término Etapa Indagatoria", resolucion: "1328/2024-VRAC",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Luciana Emilia Galindo Pérez",                                    observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "64-A",  etapa: "Término Etapa Indagatoria", resolucion: "1968/2024 Exenta",    actuaria: "Roxana Pacheco Hernández",   denunciado: "Ira Larrondo Ortiz",                                              observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "65 G",  etapa: "Término Etapa Indagatoria", resolucion: "2170-2024 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Oscar Patricio Friedli Mella",                                    observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "65-A",  etapa: "Término Etapa Indagatoria", resolucion: "2165/2024 Exenta",    actuaria: "Roxana Pacheco Hernández",   denunciado: "Romina Piffaut Miranda",                                          observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "67-A",  etapa: "Término Etapa Indagatoria", resolucion: "30/2025 Exenta",      actuaria: "Roxana Pacheco Hernández",   denunciado: "Andrea Yupanqui Concha",                                          observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "68 G",  etapa: "Término Etapa Indagatoria", resolucion: "374-2025 Exenta",     actuaria: "Roxana Pacheco Hernández",   denunciado: "Mayra Alejandra Martínez Álvarez",                                observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "72 G",  etapa: "Término Etapa Indagatoria", resolucion: "696-2025-VRAC",       actuaria: "Roxana Pacheco Hernández",   denunciado: "María Jose Garay Ulloa",                                          observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "74 G",  etapa: "Término Etapa Indagatoria", resolucion: "811-2025-VRAC",       actuaria: "Alejandra Mayorga Trujillo", denunciado: "Milena Ignacia Nùñez Toledo",                                     observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "75 G",  etapa: "Término Etapa Indagatoria", resolucion: "846-2025-VRAC",       actuaria: "Roxana Pacheco Hernández",   denunciado: "Kevin Alexis Mullins Araya",                                      observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "77 G",  etapa: "Término Etapa Indagatoria", resolucion: "1258-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Macarena Mancisidor Mateluna",                                    observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "78 G",  etapa: "Término Etapa Indagatoria", resolucion: "1280-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Macarena Mancisidor Mateluna",                                    observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "80 G",  etapa: "Término Etapa Indagatoria", resolucion: "1290-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Matías Troncoso Villar",                                          observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "84 G",  etapa: "Término Etapa Indagatoria", resolucion: "1731-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Manuel Jesús Manríquez Figueroa",                                 observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "85 G",  etapa: "Término Etapa Indagatoria", resolucion: "1929-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Andrés Alberto Ruiz Rodríguez",                                   observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "86 G",  etapa: "Término Etapa Indagatoria", resolucion: "1702-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Pablo Andrés Soto García",                                        observaciones: "PRIORIDAD: Despachar/recoger cuestionarios pendientes e incorporar respuestas." },
    { exp: "87 G",  etapa: "Término Etapa Indagatoria", resolucion: "2082-2025 Exenta",    actuaria: "Alejandra Mayorga Trujillo", denunciado: "Juan Marcos Henríquez Troncoso",                                  observaciones: "PRIORIDAD: Coordinar y tomar declaraciones testimoniales pendientes." },
    { exp: "88 G",  etapa: "Término Etapa Indagatoria", resolucion: "R.E. 2114/2025",      actuaria: "Alejandra Mayorga Trujillo", denunciado: "Nicolás Alejandro Haro Paillán",                                  observaciones: "PRIORIDAD: Coordinar y tomar declaraciones testimoniales pendientes." }
  ];

  /* ── Mapeo de Etapa visible → estado_procedimiento estándar ── */
  const ETAPA_TO_ESTADO = {
    'indagatoria':                'Indagatoria',
    'término etapa indagatoria':  'Término Etapa Indagatoria',
    'discusión y prueba':         'Discusión y Prueba',
    'preparación de vista':       'Preparación de Vista',
    'decisión':                   'Decisión'
  };

  /* ── Helpers ── */
  const _normExp = s => String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[\/–—-]/g,'-');
  const _norm    = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  const _say     = (msg, color) => console.log('%c'+msg, 'color:'+(color||'#374151')+';font-weight:500');

  function splitObservaciones(obs) {
    if (!obs) return [];
    /* La planilla a veces concatena varias prioridades separadas por "PRIORIDAD:" */
    const parts = obs.split(/(?=PRIORIDAD:)/g)
      .map(s => s.replace(/^PRIORIDAD:\s*/i,'').trim())
      .filter(Boolean);
    return parts.length ? parts : [obs.trim()];
  }

  /* ── Verificaciones ── */
  if (typeof sb === 'undefined' || !sb || !sb.from) {
    console.error('❌ No hay sesión activa. Inicia sesión primero.');
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { console.error('❌ No hay usuario autenticado.'); return; }

  console.log('%c🚀 Importación de planilla "Mis Casos" (60 casos)', 'color:#0f766e;font-weight:bold;font-size:14px');
  console.log('   Usuario:', user.email);

  /* ── Cargar lista actual de casos ── */
  let allCasos = (typeof allCases !== 'undefined' && Array.isArray(allCases)) ? allCases : (window.allCases || []);
  if (!allCasos.length) {
    _say('· No tengo allCases en memoria, descargando de la BD…', '#6b7280');
    const r = await sb.from('cases').select('*').is('deleted_at', null);
    if (r.error) { console.error('❌ Error cargando casos:', r.error.message); return; }
    allCasos = r.data || [];
    if (typeof window !== 'undefined') window.allCases = allCasos;
  }
  const byExp = new Map();
  for (const c of allCasos) {
    if (c.name) byExp.set(_normExp(c.name), c);
    if (c.numero_exp_interno) byExp.set(_normExp(c.numero_exp_interno), c);
  }

  /* ── Cargar pendientes existentes (para no duplicar) ── */
  const exR = await sb.from('acciones_pendientes').select('id,case_id,title,status').eq('user_id', user.id);
  if (exR.error) { console.error('❌ No se pudieron leer pendientes:', exR.error.message); return; }
  const existPendByCase = new Map();
  for (const p of (exR.data || [])) {
    if (!existPendByCase.has(p.case_id)) existPendByCase.set(p.case_id, []);
    existPendByCase.get(p.case_id).push(p);
  }

  /* ── Estadísticas ── */
  const stats = {
    total: DATA.length,
    matched: 0, noMatch: [],
    actuariaSet: 0, actuariaSkip: 0,
    pendCreated: 0, pendSkipDup: 0,
    casoUpdates: 0, errors: []
  };

  /* ── Procesar cada fila ── */
  for (const row of DATA) {
    const key = _normExp(row.exp);
    const caso = byExp.get(key);
    if (!caso) {
      stats.noMatch.push(row.exp);
      _say('  ⚠ EXP sin match en BD: '+row.exp, '#b45309');
      continue;
    }
    stats.matched++;
    const lbl = caso.name || caso.id;

    /* 1) Asignar actuaria */
    const yaTiene = !!(caso.actuaria) || !!(window.fiscalitoUMAG && window.fiscalitoUMAG.getActuariaCaso && window.fiscalitoUMAG.getActuariaCaso(caso));
    if (row.actuaria && (FORCE_ACTUARIA || !yaTiene)) {
      try {
        if (window.fiscalitoUMAG && typeof window.fiscalitoUMAG.setActuariaCaso === 'function') {
          await window.fiscalitoUMAG.setActuariaCaso(caso.id, row.actuaria);
        } else {
          /* Fallback: directo a BD; si falla por columna inexistente, localStorage */
          const r2 = await sb.from('cases').update({ actuaria: row.actuaria, updated_at: new Date().toISOString() }).eq('id', caso.id);
          if (r2.error) {
            try {
              const map = JSON.parse(localStorage.getItem('fiscalito_actuarias_assign')||'{}');
              map[caso.id] = row.actuaria;
              localStorage.setItem('fiscalito_actuarias_assign', JSON.stringify(map));
            } catch {}
          } else {
            caso.actuaria = row.actuaria;
          }
        }
        stats.actuariaSet++;
        _say('  ✓ actuaria → '+lbl+': '+row.actuaria, '#059669');
      } catch (e) {
        stats.errors.push(lbl+' (actuaria): '+e.message);
      }
    } else {
      stats.actuariaSkip++;
    }

    /* 2) Crear pendientes desde Observaciones */
    const items = splitObservaciones(row.observaciones);
    const existing = (existPendByCase.get(caso.id) || []).map(p => (p.title||'').trim().toLowerCase());
    for (const text of items) {
      const title = text.length > 200 ? text.slice(0,197)+'…' : text;
      const dup = !FORCE_PENDIENTE && existing.includes(title.toLowerCase());
      if (dup) { stats.pendSkipDup++; continue; }
      try {
        const ins = await sb.from('acciones_pendientes').insert({
          case_id: caso.id,
          user_id: user.id,
          title,
          description: 'Importado desde planilla Mis-Casos · ' + row.exp,
          status: 'pendiente',
          priority: PRIORITY_BY_DEFAULT,
          due_date: null
        }).select('id').single();
        if (ins.error) {
          stats.errors.push(lbl+' (pendiente): '+ins.error.message);
        } else {
          stats.pendCreated++;
          _say('  ✓ pendiente · '+lbl+' · '+title.slice(0,80), '#4f46e5');
        }
      } catch (e) {
        stats.errors.push(lbl+' (pendiente): '+e.message);
      }
    }

    /* 3) Completar campos vacíos del caso (no sobrescribir) */
    const updates = {};
    const normEtapa = ETAPA_TO_ESTADO[_norm(row.etapa)];
    if (normEtapa && !caso.estado_procedimiento) updates.estado_procedimiento = normEtapa;
    if (row.resolucion && !caso.nueva_resolucion) updates.nueva_resolucion = row.resolucion.trim();
    if (row.denunciado && (!caso.denunciados || (Array.isArray(caso.denunciados) && !caso.denunciados.length))) {
      updates.denunciados = [row.denunciado.trim()];
    }
    if (Object.keys(updates).length) {
      updates.updated_at = new Date().toISOString();
      const u = await sb.from('cases').update(updates).eq('id', caso.id);
      if (u.error) stats.errors.push(lbl+' (caso): '+u.error.message);
      else { Object.assign(caso, updates); stats.casoUpdates++; }
    }
  }

  /* ── Refrescar la UI si estamos en la app ── */
  try {
    if (typeof renderTabla === 'function') renderTabla();
    if (typeof renderCaseList === 'function') renderCaseList();
    if (typeof loadStats === 'function') await loadStats();
  } catch {}

  /* ── Resumen ── */
  console.log('%c═══════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  console.log('%c📊 RESUMEN DE IMPORTACIÓN', 'color:#0f766e;font-weight:bold;font-size:13px');
  console.log('   Filas en planilla:        ' + stats.total);
  console.log('   Coincidieron en BD:       ' + stats.matched);
  console.log('   Sin coincidencia:         ' + stats.noMatch.length + (stats.noMatch.length?'  ['+stats.noMatch.join(', ')+']':''));
  console.log('   Actuarias asignadas:      ' + stats.actuariaSet + '   (omitidas: ' + stats.actuariaSkip + ')');
  console.log('   Pendientes creados:       ' + stats.pendCreated + '   (duplicados omitidos: ' + stats.pendSkipDup + ')');
  console.log('   Casos con campos llenos:  ' + stats.casoUpdates);
  if (stats.errors.length) {
    console.log('%c   ⚠ Errores: ' + stats.errors.length, 'color:#b91c1c;font-weight:bold');
    stats.errors.slice(0,12).forEach(e => console.log('     · ' + e));
    if (stats.errors.length > 12) console.log('     · …y ' + (stats.errors.length-12) + ' más');
  }
  console.log('%c═══════════════════════════════════════════', 'color:#0f766e;font-weight:bold');
  if (typeof showToast === 'function') showToast('✓ Importación completada · ver consola');
  console.log('%c💡 Recarga la página (F5) para ver la columna "Actuaria" en la tabla.', 'color:#7c3aed;font-style:italic');
})().catch(err => {
  console.error('💥 Importación abortada por error:', err);
});
