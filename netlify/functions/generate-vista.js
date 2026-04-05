/**
 * GENERATE-VISTA.JS — Generación de Vista Fiscal / Informe con IA
 * ──────────────────────────────────────────────────────────────────
 * Genera borradores de vista fiscal, informe de la investigadora, etc.
 * BUSCA AUTOMÁTICAMENTE modelos de referencia en casos terminados de Supabase
 * para conservar el estilo institucional, razonamiento jurídico y lenguaje administrativo.
 *
 * POST { caseId, caseData, diligencias, participants, chronology, mode }
 *   mode: "informe" | "sancion" | "sobreseimiento" | "art129"
 */
const https = require('https');
const { callAnthropic: _sharedCall, MODEL_SONNET } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');
const { buildSharedDirectives, MODELO_SANCION, MODELO_SOBRESEIMIENTO, PARRAFOS_MODELO, HUMAN_WRITING_STYLE, PRECISION_JURIDICA, getNormativeContext } = require('./shared/writing-style');

/* Wrapper que usa Sonnet con timeout largo para generación de vistas */
function callAnthropic(apiKey, system, userMsg, maxTokens) {
  return _sharedCall(apiKey, system, userMsg, {
    model: MODEL_SONNET, maxTokens: maxTokens || 8000, timeout: 55000
  });
}

/* ══════════════════════════════════════════════
   SUPABASE: Buscar modelos de referencia
   ══════════════════════════════════════════════ */
function supabaseFetch(sbUrl, sbKey, path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(sbUrl + '/rest/v1/' + path);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'apikey': sbKey,
        'Authorization': 'Bearer ' + sbKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d || '[]')); } catch { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * Busca hasta 3 informes finales de casos terminados que coincidan con el
 * tipo_procedimiento y protocolo del caso activo. Si no encuentra match exacto,
 * amplía la búsqueda solo por tipo_procedimiento.
 */
async function fetchModelReports(caseData, mode) {
  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return [];

  const tipo = caseData.tipo_procedimiento || '';
  const protocolo = caseData.protocolo || '';
  const caseId = caseData.id || '';

  // Mapear modo a resultado esperado para buscar modelos más relevantes
  const resultadoFilter = (mode === 'sancion') ? '&resultado=eq.Sanción'
    : (mode === 'sobreseimiento') ? '&resultado=eq.Sobreseimiento'
    : (mode === 'genero') ? '&protocolo=not.is.null' : '';

  // 1) Intentar match exacto: mismo tipo + protocolo + resultado
  let path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
    + `&categoria=eq.terminado&informe_final=not.is.null`
    + `&tipo_procedimiento=eq.${encodeURIComponent(tipo)}`
    + `&protocolo=eq.${encodeURIComponent(protocolo)}`
    + resultadoFilter
    + `&id=neq.${encodeURIComponent(caseId)}`
    + `&order=nueva_resolucion.desc&limit=3`;

  let models = await supabaseFetch(sbUrl, sbKey, path);

  // 2) Si no hay suficientes, ampliar: mismo tipo + resultado (sin protocolo)
  if ((!models || models.length < 2) && tipo) {
    path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
      + `&categoria=eq.terminado&informe_final=not.is.null`
      + `&tipo_procedimiento=eq.${encodeURIComponent(tipo)}`
      + resultadoFilter
      + `&id=neq.${encodeURIComponent(caseId)}`
      + `&order=nueva_resolucion.desc&limit=3`;
    const extra = await supabaseFetch(sbUrl, sbKey, path);
    if (extra && extra.length) {
      const existingIds = new Set((models || []).map(m => m.nueva_resolucion));
      extra.forEach(m => { if (!existingIds.has(m.nueva_resolucion)) models.push(m); });
      models = models.slice(0, 3);
    }
  }

  // 3) Fallback general: cualquier terminado con informe
  if (!models || models.length === 0) {
    path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
      + `&categoria=eq.terminado&informe_final=not.is.null`
      + `&id=neq.${encodeURIComponent(caseId)}`
      + `&order=nueva_resolucion.desc&limit=2`;
    models = await supabaseFetch(sbUrl, sbKey, path);
  }

  const validModels = (models || []).filter(m => m.informe_final && m.informe_final.length > 500);

  // Para modos que necesitan estructura de diligencias, enriquecer con info de diligencias del modelo
  if (validModels.length > 0 && (mode === 'hechos' || mode === 'informe' || mode === 'vistos')) {
    try {
      const bestModelId = validModels[0].id;
      if (bestModelId) {
        const dilPath = `diligencias?select=diligencia_type,diligencia_label,ai_summary,fojas_inicio,fojas_fin,fecha_diligencia`
          + `&case_id=eq.${encodeURIComponent(bestModelId)}&is_processed=eq.true`
          + `&order=order_index.asc&limit=20`;
        const modelDils = await supabaseFetch(sbUrl, sbKey, dilPath);
        if (modelDils && modelDils.length > 0) {
          validModels[0]._diligencias = modelDils;
        }
      }
    } catch (e) { /* ignorar error de diligencias */ }
  }

  return validModels;
}

/**
 * Extrae las secciones más relevantes de un informe modelo para no exceder tokens.
 * Adapta la extracción al modo de generación solicitado.
 */
function extractModelSections(fullText, maxLen, mode) {
  if (!fullText || fullText.length <= maxLen) return fullText || '';

  const sections = [];
  let remaining = maxLen;

  // ── Siempre extraer VISTOS (estructura normativa, útil para todos los modos) ──
  const vistosMatch = fullText.match(/V\s*I\s*S\s*T\s*O\s*S?:?\s*\n([\s\S]*?)(?=\n\s*(?:CONSIDERANDO|C\s*O\s*N\s*S\s*I\s*D\s*E\s*R)|$)/i);
  if (vistosMatch) {
    const vistosLen = mode === 'vistos' ? Math.min(3000, remaining) : Math.min(1500, remaining);
    const vistos = 'VISTOS:\n' + vistosMatch[1].slice(0, vistosLen);
    sections.push(vistos);
    remaining -= vistos.length;
  }

  // ── CONSIDERANDOS (hechos acreditados y prueba) ──
  if (mode !== 'vistos') {
    const considMatch = fullText.match(/(?:CONSIDERANDO|C\s*O\s*N\s*S\s*I\s*D\s*E\s*R\s*A\s*N\s*D\s*O):?\s*\n([\s\S]*?)(?=\n\s*(?:AN[ÁA]LISIS|CALIFICACI[ÓO]N|POR\s*TANTO|P\s*O\s*R\s*T\s*A\s*N\s*T\s*O|EN\s*M[ÉE]RITO|CONCLUSI[OÓ]N|FUNDAMENTOS?\s*DEL?\s*SOBRESEIMIENTO|PROPUESTA|CIRCUNSTANCIAS|ESTRATEGIAS?\s*PREVENTIVAS?|PERSPECTIVA\s*DE\s*G[ÉE]NERO)|$)/i);
    if (considMatch && remaining > 500) {
      const considText = considMatch[1];
      const numerales = considText.match(/\d+\.\s+Que[\s\S]*?(?=\n\d+\.\s+Que|\n\s*(?:AN[ÁA]LISIS|POR\s*TANTO|CALIFICACI|FUNDAMENTOS|PROPUESTA)|$)/gi);
      if (numerales) {
        // Para modo 'hechos', extraer más considerandos
        const maxNumerales = (mode === 'hechos' || mode === 'informe') ? 5 : 3;
        let considSection = 'CONSIDERANDO:\n';
        for (let i = 0; i < Math.min(maxNumerales, numerales.length) && remaining > 200; i++) {
          const numeral = numerales[i].slice(0, mode === 'hechos' ? 1200 : 800);
          considSection += numeral + '\n';
          remaining -= numeral.length;
        }
        if (numerales.length > maxNumerales) considSection += `[... ${numerales.length - maxNumerales} considerandos más ...]\n`;
        sections.push(considSection);
      }
    }
  }

  // ── ANÁLISIS JURÍDICO / CALIFICACIÓN (para sanción, informe) ──
  if (mode === 'sancion' || mode === 'informe') {
    const analisisMatch = fullText.match(/(AN[ÁA]LISIS\s*JUR[ÍI]DICO|CALIFICACI[ÓO]N\s*JUR[ÍI]DICA):?\s*\n([\s\S]*?)(?=\n\s*(?:CIRCUNSTANCIAS|PROPUESTA|POR\s*TANTO|CONCLUSI[OÓ]N)|$)/i);
    if (analisisMatch && remaining > 300) {
      const analisis = analisisMatch[0].slice(0, Math.min(1500, remaining));
      sections.push(analisis);
      remaining -= analisis.length;
    }
  }

  // ── FUNDAMENTOS DEL SOBRESEIMIENTO (para sobreseimiento) ──
  if (mode === 'sobreseimiento') {
    const sobMatch = fullText.match(/FUNDAMENTOS?\s*(?:DEL?)?\s*SOBRESEIMIENTO:?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO)|$)/i);
    if (sobMatch && remaining > 300) {
      const sob = sobMatch[0].slice(0, Math.min(1500, remaining));
      sections.push(sob);
      remaining -= sob.length;
    }
  }

  // ── PERSPECTIVA DE GÉNERO (para modo genero) ──
  if (mode === 'genero') {
    const generoMatch = fullText.match(/(PERSPECTIVA\s*DE\s*G[ÉE]NERO|ENFOQUE\s*DE\s*G[ÉE]NERO|AN[ÁA]LISIS.*G[ÉE]NERO):?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO|ESTRATEGIAS?)|$)/i);
    if (generoMatch && remaining > 300) {
      const genero = generoMatch[0].slice(0, Math.min(2000, remaining));
      sections.push(genero);
      remaining -= genero.length;
    }
  }

  // ── ESTRATEGIAS PREVENTIVAS (para modo estrategias) ──
  if (mode === 'estrategias') {
    const estMatch = fullText.match(/(ESTRATEGIAS?\s*PREVENTIVAS?|RECOMENDACIONES?\s*INSTITUCIONALES?|MEDIDAS?\s*PREVENTIVAS?):?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO)|$)/i);
    if (estMatch && remaining > 300) {
      const est = estMatch[0].slice(0, Math.min(2000, remaining));
      sections.push(est);
      remaining -= est.length;
    }
  }

  // ── POR TANTO / CONCLUSIÓN (siempre, excepto para vistos) ──
  if (mode !== 'vistos') {
    const porTantoMatch = fullText.match(/(P\s*O\s*R\s*T\s*A\s*N\s*T\s*O|EN\s*M[ÉE]RITO|CONCLUSI[OÓ]N):?\s*\n([\s\S]*?)$/i);
    if (porTantoMatch && remaining > 300) {
      sections.push(porTantoMatch[0].slice(0, Math.min(1000, remaining)));
    }
  }

  return sections.length ? sections.join('\n\n[...]\n\n') : fullText.slice(0, maxLen);
}

/* ── Construir contexto del caso ── */
function buildCaseContext(data, modelReports) {
  const { caseData, diligencias, participants, chronology } = data;
  const c = caseData || {};
  const isInforme = data.mode === 'informe' || data.mode === 'hechos';

  let ctx = `EXPEDIENTE: ${c.name || 'Sin nombre'}\n`;
  ctx += `ROL: ${c.nueva_resolucion || c.rol || '—'}\n`;
  ctx += `Carátula: ${c.caratula || '—'}\n`;
  ctx += `Tipo: ${c.tipo_procedimiento || '—'}\n`;
  ctx += `Protocolo: ${c.protocolo || '—'}\n`;
  ctx += `Materia: ${c.materia || '—'}\n`;
  ctx += `Fecha denuncia: ${c.fecha_denuncia || '—'}\n`;
  ctx += `Fecha resolución instructora: ${c.fecha_resolucion || '—'}\n\n`;

  // Participantes
  if (participants && participants.length) {
    ctx += 'PARTICIPANTES:\n';
    participants.forEach(p => {
      ctx += `- ${p.name || '?'} (${p.role || '?'})`;
      if (p.estamento) ctx += ` — Est: ${p.estamento}`;
      if (p.carrera) ctx += ` — Carrera: ${p.carrera}`;
      ctx += '\n';
    });
    ctx += '\n';
  }

  // Diligencias — en modo informe incluir texto completo
  if (diligencias && diligencias.length) {
    ctx += `DILIGENCIAS (${diligencias.length} documentos):\n`;
    const maxDiligencias = isInforme ? 30 : 20;
    diligencias.slice(0, maxDiligencias).forEach((d, i) => {
      const fojas = d.fojas || '';
      ctx += `${i + 1}. ${d.diligencia_label || d.file_name || 'Doc ' + (i + 1)}`;
      if (fojas) ctx += ` (fojas ${fojas})`;
      if (d.fecha_diligencia) ctx += ` [${d.fecha_diligencia}]`;
      ctx += '\n';
      if (isInforme && d.extracted_text) {
        ctx += `   CONTENIDO COMPLETO:\n   ${d.extracted_text.slice(0, 2000)}\n`;
      } else if (d.ai_summary) {
        ctx += `   Resumen: ${d.ai_summary.slice(0, 300)}\n`;
      }
    });
    ctx += '\n';
  }

  // Cronología
  if (chronology && chronology.length) {
    ctx += 'CRONOLOGÍA:\n';
    chronology.slice(0, 15).forEach(ev => {
      ctx += `- ${ev.event_date || '?'}: ${ev.title || ev.description || '?'}\n`;
    });
    ctx += '\n';
  }

  // Observaciones e informe previo
  if (c.observaciones) ctx += `OBSERVACIONES: ${c.observaciones}\n`;
  if (c.informe_final) ctx += `INFORME PREVIO:\n${c.informe_final.slice(0, 2000)}\n`;

  // Modelos de referencia AUTOMÁTICOS (desde casos terminados)
  if (modelReports && modelReports.length) {
    const modeLabel = data.mode || 'informe';
    ctx += '\n═══════════════════════════════════════════════════════════════\n';
    ctx += 'MODELOS DE REFERENCIA — Informes finales de expedientes terminados\n';
    ctx += '═══════════════════════════════════════════════════════════════\n';
    ctx += 'INSTRUCCIONES OBLIGATORIAS SOBRE LOS MODELOS:\n';
    ctx += '1. Replica fielmente el ESTILO, TONO, ESTRUCTURA y LENGUAJE\n';
    ctx += '   INSTITUCIONAL de estos modelos.\n';
    ctx += '2. Conserva el razonamiento jurídico y el lenguaje administrativo\n';
    ctx += '   exactamente como aparece en los modelos.\n';
    ctx += '3. NUNCA copies hechos, nombres ni datos de estos modelos\n';
    ctx += '   — solo su estructura, estilo y vocabulario jurídico.\n';
    ctx += '4. Si los modelos contienen una sección de ' + modeLabel.toUpperCase() + ',\n';
    ctx += '   replica su formato, extensión y nivel de detalle.\n';
    ctx += '5. Si los modelos citan normativa, usa las MISMAS citas formales\n';
    ctx += '   (número de decreto, ley, artículo) adaptándolas al caso actual.\n';
    ctx += '6. El documento generado debe ser INDISTINGUIBLE en estilo de\n';
    ctx += '   los modelos proporcionados.\n';
    ctx += '═══════════════════════════════════════════════════════════════\n\n';

    // Calcular espacio por modelo
    const maxPerModel = isInforme ? 5000 : 3000;

    modelReports.forEach((m, i) => {
      const label = m.name || m.nueva_resolucion || '?';
      const tipoInfo = [m.tipo_procedimiento, m.protocolo, m.resultado].filter(Boolean).join(' / ');
      ctx += `--- MODELO ${i + 1}: Exp. ${label} (${tipoInfo}) ---\n`;
      ctx += extractModelSections(m.informe_final, maxPerModel, data.mode) + '\n';

      // Si hay diligencias del modelo, mostrar su estructura como referencia
      if (m._diligencias && m._diligencias.length > 0) {
        ctx += '\n  [ESTRUCTURA DE DILIGENCIAS DEL MODELO — Referencia de organización]:\n';
        m._diligencias.forEach((d, j) => {
          const fojas = d.fojas_inicio ? ` (f.${d.fojas_inicio}${d.fojas_fin && d.fojas_fin !== d.fojas_inicio ? '-' + d.fojas_fin : ''})` : '';
          ctx += `  ${j + 1}. ${d.diligencia_label || d.diligencia_type || '?'}${fojas}`;
          if (d.fecha_diligencia) ctx += ` [${d.fecha_diligencia}]`;
          if (d.ai_summary) ctx += ` — ${d.ai_summary.slice(0, 120)}`;
          ctx += '\n';
        });
        ctx += '  [Usa esta estructura como referencia para organizar las diligencias del caso actual]\n';
      }
      ctx += '\n';
    });
  }

  return ctx;
}

/* ── Prompts por modo ── */
const STYLE_RULES = `
REGLAS DE ESTILO IMPERATIVAS (aplicar a TODO el documento):
- NUNCA usar formato Markdown (ni **, ni ##, ni -, ni *). El documento es texto plano formal.
- Redacción en TERCERA PERSONA, formal, jurídica, administrativa.
- Usar tratamiento "doña" / "don" antes de nombres propios.
- Citar SIEMPRE la foja donde consta cada antecedente: "de fojas XX a YY del expediente, consta..."
- Vocabulario jurídico-administrativo chileno: "rolan", "obran", "constan", "se desprende de autos", "atendido lo expuesto", "en mérito de lo anterior", "al tenor de lo expuesto", "conforme a lo prevenido".
- Citar normas con denominación oficial completa (Decreto N°XX/SU/YYYY, Ley N°XX.XXX, DFL N°XX).
- Fechas en formato extenso: "de fecha 25 de octubre de 2024".
- NO inventar hechos ni pruebas que no estén en el contexto proporcionado.
- Usar "[COMPLETAR]" o "[NO CONSTA]" donde falte información específica.
- Si se proporcionan MODELOS DE REFERENCIA: replicar su estilo y tono fielmente, pero NUNCA copiar hechos de esos modelos.
- Párrafos extensos y detallados, NO telegráficos.
- Cada considerando termina con punto y coma (;) excepto el último que termina con punto (.).
- Los numerales de los considerandos siguen formato: "1.      Que,..."
- Individualización completa de cada persona: nombre completo, RUT si consta, cargo, calidad procesal.
- Las declaraciones se sintetizan con DETALLE (no genéricamente), con lenguaje indirecto formal ("manifiesta que...", "señala que...", "indica que...").
- Los testimonios de oídas se identifican expresamente como tales.
` + HUMAN_WRITING_STYLE;

/* Las SYSTEM_PROMPTS se construyen dinámicamente con buildSystemPrompt() */
const SYSTEM_PROMPTS_BASE = {
  sancion: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Tu rol es redactar una VISTA FISCAL con propuesta de SANCIÓN. Este documento es el informe final donde se analiza la responsabilidad administrativa y se propone la medida disciplinaria correspondiente.

{NORMATIVE_REGIME}

${MODELO_SANCION}

${PARRAFOS_MODELO}

${PRECISION_JURIDICA}

${STYLE_RULES}
- Extensión: 3-5 páginas equivalentes. Cada diligencia merece su propio considerando detallado.`,

  sobreseimiento: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Tu rol es redactar una VISTA FISCAL con propuesta de SOBRESEIMIENTO. Este documento analiza por qué no procede formular cargos y propone el cierre del procedimiento.

{NORMATIVE_REGIME}

${MODELO_SOBRESEIMIENTO}

${PARRAFOS_MODELO}

${PRECISION_JURIDICA}

${STYLE_RULES}
- Extensión: 2-4 páginas equivalentes.`,

  art129: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Genera un borrador de SOLICITUD DE MEDIDA CAUTELAR (Art. 129 EA).

{NORMATIVE_REGIME}

ESTRUCTURA:
1. ANTECEDENTES — Identificación del caso y urgencia
2. FUNDAMENTOS DE HECHO — Hechos que justifican la medida
3. FUNDAMENTOS DE DERECHO — Art. 129 Estatuto Administrativo y normativa aplicable
4. MEDIDA SOLICITADA — Tipo de medida cautelar (ej: suspensión preventiva, cambio funciones)
5. PETITORIO

${PRECISION_JURIDICA}

${STYLE_RULES}`,

  vistos: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera EXCLUSIVAMENTE la sección de VISTOS de una vista fiscal / informe de la investigadora para un procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA DE ESTA SECCIÓN:
1. Identificación de la resolución que ordena instruir el procedimiento (número, fecha, autoridad que la dicta)
2. Rango de fojas del expediente ("rolan de fojas 01 a [XX]")
3. Enumeración COMPLETA de toda la normativa aplicable al caso:
   - Estatuto Administrativo (D.F.L. N°29 de 2005, arts. aplicables)
   - Ley N°19.880 sobre procedimientos administrativos
   - Ley N°18.575, LOCBGAE
   - Protocolos internos de la UMAG aplicables según el tipo de procedimiento
   - Reglamentos específicos (Reglamento de Personal, Reglamento Disciplinario, etc.)
   - Si es caso de acoso sexual: Ley N°21.369 y protocolo institucional
   - Si es caso de acoso laboral: Ley N°20.607
   - Toda otra norma relevante según la materia investigada
4. Cada norma citada con su número, fecha y descripción oficial completa
5. Terminar la sección con ".-"

IMPORTANTE: NO incluir considerandos, análisis ni conclusiones. Solo los VISTOS.

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA, examina cómo estructuran su sección de VISTOS — qué normativa citan, en qué orden, con qué formato y nivel de detalle. Replica EXACTAMENTE esa misma estructura, formato y nivel de exhaustividad normativa, adaptando solo los datos al caso actual.
${STYLE_RULES}
- Esta sección debe ser detallada y exhaustiva en la enumeración normativa`,

  hechos: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera EXCLUSIVAMENTE la sección de HECHOS ACREDITADOS Y PRUEBA (CONSIDERANDOS) de una vista fiscal / informe de la investigadora.

ESTRUCTURA OBLIGATORIA DE ESTA SECCIÓN:
1. Un numeral por CADA diligencia o pieza del expediente, siguiendo el orden de fojas
2. Cada numeral inicia con: "Que, a fojas [XX], consta [tipo de documento]..."
3. DESARROLLAR EN EXTENSO el contenido de cada diligencia:
   - Nombres completos con tratamiento formal ("doña", "don")
   - Cargos institucionales
   - Fechas exactas
   - Síntesis jurídica del contenido
4. Si es una declaración: resumir lo declarado con lenguaje indirecto formal ("manifiesta que...", "señala que...", "indica que...")
5. Si es un documento administrativo: describir su contenido y relevancia procesal
6. Usar expresiones del derecho administrativo chileno: "obra", "rola", "consta", "se desprende", "se advierte"
7. NO resumir telegráficamente. Cada considerando debe ser un párrafo completo y detallado
8. Los considerandos se numeran: "1.      Que,..."

IMPORTANTE: NO incluir VISTOS, análisis jurídico ni propuesta. Solo los CONSIDERANDOS con los hechos y la prueba.

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA, observa cómo redactan cada considerando — la extensión, el nivel de detalle, las expresiones jurídicas, cómo citan las fojas y cómo describen cada diligencia. Tu redacción debe ser INDISTINGUIBLE en estilo y profundidad de los considerandos de los modelos.
${STYLE_RULES}
- Extensión: cada diligencia merece su propio considerando detallado. Un expediente con 12 diligencias debería tener al menos 12 considerandos sustantivos`,

  estrategias: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera una sección de ESTRATEGIAS PREVENTIVAS Y RECOMENDACIONES INSTITUCIONALES basándote en los hechos investigados en el procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA:
1. ANÁLISIS DE FACTORES DE RIESGO — Identificar qué condiciones institucionales, organizacionales o normativas contribuyeron a que ocurrieran los hechos investigados
2. RECOMENDACIONES PREVENTIVAS — Proponer medidas concretas para evitar la repetición de situaciones similares:
   - Medidas organizacionales (restructuración de funciones, supervisión, controles)
   - Medidas formativas (capacitaciones, talleres, difusión de normativa)
   - Medidas normativas (actualización de reglamentos, creación de protocolos)
   - Medidas de apoyo (acompañamiento a víctimas, derivación a unidades competentes)
3. PLAN DE IMPLEMENTACIÓN SUGERIDO — Cronograma y responsables sugeridos para las medidas propuestas
4. SEGUIMIENTO — Indicadores de cumplimiento y mecanismos de monitoreo

IMPORTANTE: Las recomendaciones deben ser ESPECÍFICAS al caso y factibles dentro del marco institucional de la UMAG. No incluir recomendaciones genéricas.

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA que contengan secciones de estrategias preventivas o recomendaciones, replica su formato, extensión y nivel de detalle. Si los modelos no tienen esta sección, usa el tono y vocabulario institucional de los modelos para redactar las recomendaciones.
${STYLE_RULES}
- Tono propositivo pero formal
- Fundamentar cada recomendación en la normativa aplicable y en los hechos del caso`,

  genero: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un ANÁLISIS CON PERSPECTIVA DE GÉNERO del procedimiento disciplinario, conforme a la normativa vigente y los estándares internacionales.

ESTRUCTURA OBLIGATORIA:
1. MARCO NORMATIVO DE GÉNERO APLICABLE:
   - Convención CEDAW y Convención de Belém do Pará
   - Ley N°21.369 sobre acoso sexual, violencia y discriminación de género en educación superior
   - Ley N°20.609, Ley Zamudio (antidiscriminación)
   - Ley N°20.607 sobre acoso laboral (cuando aplique)
   - Protocolo institucional de la UMAG contra la violencia de género
   - Política de igualdad de género de la UMAG (si existe)

2. ANÁLISIS DE LOS HECHOS CON ENFOQUE DE GÉNERO:
   - Identificar si existen relaciones asimétricas de poder entre las partes
   - Evaluar si los hechos investigados tienen componentes de violencia o discriminación de género
   - Analizar estereotipos de género que pudieran estar presentes en la situación
   - Valorar el impacto diferenciado de los hechos según género

3. ESTÁNDARES DE DEBIDA DILIGENCIA:
   - Evaluar si la investigación cumplió con los estándares de debida diligencia en materia de género
   - Verificar si se adoptaron medidas de protección adecuadas
   - Analizar si se respetó el derecho a ser oída/o en condiciones de igualdad

4. CONCLUSIONES Y RECOMENDACIONES CON PERSPECTIVA DE GÉNERO:
   - Impacto del enfoque de género en la calificación de los hechos
   - Recomendaciones específicas para la resolución del caso
   - Medidas reparatorias con enfoque de género (si corresponde)

IMPORTANTE: El análisis debe ser técnico y fundado en normativa, no meramente declarativo. Debe conectar la teoría de género con los hechos específicos del caso.

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA que contengan análisis con perspectiva de género, replica EXACTAMENTE su formato, estructura, nivel de profundidad y vocabulario técnico. Si los modelos citan normativa de género (Ley 21.369, CEDAW, etc.), usa las mismas citas formales. Adapta solo los hechos al caso actual.
${STYLE_RULES}
- Citar normativa internacional y nacional de género
- Usar terminología técnica de género: "perspectiva de género", "relaciones asimétricas de poder", "violencia de género", "debida diligencia reforzada"`,

  informe: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).
Tu tarea es generar un borrador completo de INFORME DE LA INVESTIGADORA / VISTA FISCAL para un procedimiento disciplinario o investigación sumaria. Este documento es el informe final que la fiscal investigadora o actuaria presenta a la autoridad instructora.

═══════════════════════════════════════
ESTRUCTURA OBLIGATORIA
═══════════════════════════════════════

1. ENCABEZADO:
   - Título: "INFORME DE LA INVESTIGADORA" (o "VISTA FISCAL" según corresponda)
   - Línea horizontal de subrayado
   - Lugar y fecha: "Punta Arenas, [fecha actual]"

2. VISTOS:
   - Identificación de la resolución que ordena instruir (número, fecha, autoridad)
   - Rango de fojas del expediente ("rolan de fojas 01 a [XX]")
   - Enumeración COMPLETA de todos los reglamentos, decretos, protocolos y normas aplicables
   - Cada norma con su número, fecha y descripción oficial completa
   - Terminar con ".-"

3. CONSIDERANDO:
   - Un numeral por CADA diligencia o pieza del expediente, siguiendo el orden de fojas
   - Cada numeral inicia con: "Que, a fojas [XX], consta [tipo de documento]..."
   - DESARROLLAR EN EXTENSO el contenido de cada diligencia: nombres completos con tratamiento formal ("doña", "don"), cargos institucionales, fechas exactas, y una síntesis jurídica del contenido
   - Si es una declaración: resumir lo declarado con lenguaje indirecto formal ("manifiesta que...", "señala que...", "indica que...")
   - Si es un documento administrativo: describir su contenido y relevancia procesal
   - Usar expresiones propias del derecho administrativo chileno: "obra", "rola", "consta", "se desprende", "se advierte"
   - NO resumir telegráficamente. Cada considerando debe ser un párrafo completo y detallado

4. ANÁLISIS JURÍDICO (cuando corresponda):
   - Subsunción de los hechos en las normas aplicables
   - Valoración de la prueba reunida
   - Razonamiento jurídico formal

5. CONCLUSIÓN / POR TANTO:
   - Resumen de los hechos establecidos
   - Propuesta fundamentada (sanción, sobreseimiento, etc.)
${STYLE_RULES}
- Los considerandos se numeran con números arábigos seguidos de punto y tabulación: "1.      Que,..."
- Extensión: el documento debe ser TAN EXTENSO como lo requiera el expediente. Cada diligencia merece su propio considerando detallado. Un expediente con 12 diligencias debería tener al menos 12 considerandos sustantivos`
};

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'API key no configurada' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'generate-vista');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const data = JSON.parse(event.body);
    const bodyStr = JSON.stringify(data);
    if (bodyStr.length > 2000000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { mode } = data;

    if (!mode || !SYSTEM_PROMPTS[mode]) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'mode inválido. Use: informe, sancion, sobreseimiento, art129, vistos, hechos, estrategias, genero' })
      };
    }

    // ══ BÚSQUEDA AUTOMÁTICA DE MODELOS ══
    // Buscar informes finales de casos terminados como referencia de estilo
    let modelReports = [];
    try {
      modelReports = await fetchModelReports(data.caseData || {}, mode);
    } catch (e) {
      console.warn('fetchModelReports warning:', e.message);
    }

    const context = buildCaseContext(data, modelReports);
    const system = SYSTEM_PROMPTS[mode];
    const DOC_LABELS = {
      informe: 'informe de la investigadora',
      sancion: 'vista fiscal con propuesta de sanción',
      sobreseimiento: 'vista fiscal con propuesta de sobreseimiento',
      art129: 'solicitud de medida cautelar',
      vistos: 'sección de VISTOS (normativa aplicable y antecedentes)',
      hechos: 'sección de HECHOS ACREDITADOS Y PRUEBA (considerandos)',
      estrategias: 'sección de ESTRATEGIAS PREVENTIVAS',
      genero: 'análisis CON PERSPECTIVA DE GÉNERO'
    };
    const docLabel = DOC_LABELS[mode] || 'vista fiscal';
    const userMsg = `Con base en la siguiente información del expediente, genera el borrador de ${docLabel}:\n\n${context}`;

    // Estimar tokens (aprox 4 chars per token)
    const inputTokens = Math.ceil((system.length + userMsg.length) / 4);
    const maxInput = mode === 'informe' ? 80000 : 50000;
    if (inputTokens > maxInput) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'Contexto demasiado extenso. Reduzca la cantidad de diligencias.' })
      };
    }

    // Tokens de salida según modo: informe completo necesita más
    const TOKEN_MAP = { informe: 16000, hechos: 12000, sancion: 8000, sobreseimiento: 8000, vistos: 4000, estrategias: 6000, genero: 6000, art129: 6000 };
    const maxOutputTokens = TOKEN_MAP[mode] || 8000;
    const res = await callAnthropic(apiKey, system, userMsg, maxOutputTokens);

    if (res.error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: res.error.message || 'Error de API' })
      };
    }

    const generatedText = res.content?.[0]?.text || '';
    const usage = res.usage || {};

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({
        vista: generatedText,
        mode,
        modelsUsed: modelReports.map(m => m.name || m.nueva_resolucion).filter(Boolean),
        usage: {
          inputTokens: usage.input_tokens || inputTokens,
          outputTokens: usage.output_tokens || 0
        },
        caseName: data.caseData?.name || ''
      })
    };

  } catch (err) {
    console.error('generate-vista error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message })
    };
  }
};
