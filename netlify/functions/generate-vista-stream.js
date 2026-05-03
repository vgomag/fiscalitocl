/**
 * GENERATE-VISTA-STREAM.JS — Vista Fiscal Generation with SSE Streaming (ESM)
 * ═════════════════════════════════════════════════════════════════════════════
 * ESM version of generate-vista that streams the Anthropic response via SSE,
 * avoiding Netlify's inactivity timeout for long-running generations.
 *
 * SECURITY NOTE: This function receives sensitive case data including participant names,
 * RUTs, and denunciante/denunciado information. Do NOT log full request/response bodies.
 * Log only error codes/messages. See _sanitizeLog() helper for PII masking if logging is needed.
 *
 * POST { caseId, caseData, diligencias, participants, chronology, mode }
 *   mode: "informe" | "sancion" | "sobreseimiento" | "art129" | "vistos" | "hechos" | "estrategias" | "genero"
 *
 * Returns: SSE stream (text/event-stream)
 *   - event: meta  → { modelsUsed: [...] }
 *   - Anthropic SSE events (content_block_delta with text)
 */

/* ⚠️ IMPORTANT: This file's prompts MUST stay in sync with generate-vista.js.
   Any prompt changes must be applied to BOTH files. Consider extracting shared prompts to writing-style.js. */
import { corsHeaders } from './shared/cors-esm.js';
import {
  HUMAN_WRITING_STYLE, PRECISION_JURIDICA,
  MODELO_SANCION, MODELO_SOBRESEIMIENTO, PARRAFOS_MODELO,
  getNormativeContext
} from './shared/writing-style-esm.js';

/* ── Constants ── */
const MODEL_SONNET = (typeof Netlify !== 'undefined' && Netlify.env)
  ? (Netlify.env.get('CLAUDE_MODEL_SONNET') || 'claude-sonnet-4-20250514')
  : 'claude-sonnet-4-20250514';

/* ── Rate Limiting (inline, like chat.js) ── */
const RL_LIMITS = { 'generate-vista': 20, 'default': 60 };

function extractUserId(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1])).sub || null;
  } catch { return null; }
}

async function checkRL(userId) {
  if (!userId) return { allowed: false };
  const sbUrl = (typeof Netlify !== 'undefined' && Netlify.env)
    ? (Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL')) : '';
  const sbKey = (typeof Netlify !== 'undefined' && Netlify.env)
    ? (Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY')) : '';
  if (!sbUrl || !sbKey) return { allowed: false };
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 10000);
    const r = await fetch(`${sbUrl}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` },
      body: JSON.stringify({ p_user_id: userId, p_endpoint: 'generate-vista', p_max_requests: RL_LIMITS['generate-vista'], p_window_minutes: 60 }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!r.ok) return { allowed: false };
    return (await r.json()) || { allowed: false };
  } catch { return { allowed: false }; }
}

/* ── Env helper ── */
function env(key) {
  return (typeof Netlify !== 'undefined' && Netlify.env) ? (Netlify.env.get(key) || '') : '';
}

/* ── Supabase fetch (ESM, using global fetch) ── */
async function supaFetch(path) {
  const sbUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const sbKey = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!sbUrl || !sbKey) return [];
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(`${sbUrl}/rest/v1/${path}`, {
      headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

/* ══════════════════════════════════════════════
   Supabase: case_resolution_models (sección XVII)
   ──────────────────────────────────────────────
   Trae modelos de resolución/actuaciones subidos por el usuario:
     - Modelos del caso actual (case_id = caseId)
     - Modelos globales del usuario en otros casos (LIMIT 50)
   Los inyecta como referencia OBLIGATORIA de estilo.
   Presupuesto duro: MAX_RES_MODELS_TOTAL=30 000 chars / 3 000 por modelo.
   ══════════════════════════════════════════════ */
const MAX_RES_MODELS_TOTAL = 30000;
const MAX_RES_MODELS_PER_MODEL = 3000;
const MAX_RES_MODELS_GLOBAL = 50;

const RES_CATEGORY_LABELS = {
  citacion: 'Citación', notificacion: 'Notificación',
  acta_declaracion: 'Acta de Declaración', acta_ratificacion: 'Acta de Ratificación',
  acta_entrevista: 'Acta de Entrevista', acta_notificacion: 'Acta de Notificación',
  resolucion_acepta_cargo: 'Resolución Acepta Cargo',
  resolucion_cita_declarar: 'Resolución Cita a Declarar',
  resolucion_medida_resguardo: 'Medida de Resguardo',
  resolucion_decreta_diligencia: 'Decreta Diligencia',
  resolucion_general: 'Resolución General',
  oficio: 'Oficio', cuestionario: 'Cuestionario', constancia: 'Constancia',
  consentimiento: 'Consentimiento', certificacion: 'Certificación',
  acuerdo_alejamiento: 'Acuerdo de Alejamiento',
  formulacion_cargos: 'Formulación de Cargos',
  descargos: 'Descargos', provee_descargos: 'Provee Descargos',
  informe: 'Informe', vista_fiscal: 'Vista Fiscal',
  incorpora_antecedentes: 'Incorpora Antecedentes',
  denuncia: 'Denuncia', memo: 'Memo', otro: 'Otro',
};

/* Sanitización PII (RUTs, emails, teléfonos chilenos) — aplicada al texto
   inyectado al LLM. Replica la función del cliente (mod-modelos-resolucion.js). */
function sanitizePII(text) {
  if (!text) return '';
  return String(text)
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g, '[RUT]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\+?56[\s-]?)?(?:9[\s-]?\d{4}[\s-]?\d{4}|2[\s-]?\d{3,4}[\s-]?\d{4})\b/g, '[TEL]');
}

async function fetchCaseResolutionModels(userId, caseId) {
  if (!userId || !caseId) return { local: [], globals: [] };
  const select = 'name,resolution_category,procedure_type,extracted_text,case_id';
  const localPath = `case_resolution_models?select=${select}`
    + `&user_id=eq.${encodeURIComponent(userId)}`
    + `&case_id=eq.${encodeURIComponent(caseId)}`;
  const globalsPath = `case_resolution_models?select=${select}`
    + `&user_id=eq.${encodeURIComponent(userId)}`
    + `&is_global=eq.true`
    + `&case_id=neq.${encodeURIComponent(caseId)}`
    + `&order=created_at.desc&limit=${MAX_RES_MODELS_GLOBAL}`;
  const [local, globals] = await Promise.all([supaFetch(localPath), supaFetch(globalsPath)]);
  return { local: local || [], globals: globals || [] };
}

function buildResolutionModelsBlock(payload) {
  const local = (payload.local || []).map(m => ({ ...m, _origin: 'current' }));
  const globals = (payload.globals || []).map(m => ({ ...m, _origin: 'other' }));
  const all = [...local, ...globals];
  if (!all.length) return '';

  // Agrupar por categoría
  const groups = {};
  for (const m of all) {
    const c = m.resolution_category || 'otro';
    (groups[c] = groups[c] || []).push(m);
  }

  const header = [
    '',
    '═══════════════════════════════════════════════════════════════',
    'XVII. MODELOS DE ESTILO INSTITUCIONAL (referencia obligatoria)',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CRÍTICO — INSTRUCCIÓN OPERATIVA:',
    'Cuando se solicite generar una resolución, acta, oficio u otra actuación,',
    'BUSCA PRIMERO en estos modelos el tipo correspondiente y REPLICA fielmente',
    'su formato, estructura, encabezados, fórmulas y estilo. ADAPTA SOLO los',
    'datos específicos del caso actual (partes, fechas, hechos, materia). No',
    'inventes estructuras nuevas si existe un modelo del mismo tipo.',
    '',
    'Etiquetas: 📌 modelo del caso actual · 🔗 modelo de otro caso del usuario.',
    '',
  ].join('\n');

  let block = header;
  let used = block.length;
  const left = () => Math.max(0, MAX_RES_MODELS_TOTAL - used);

  for (const [catKey, items] of Object.entries(groups)) {
    if (left() < 200) break;
    const label = RES_CATEGORY_LABELS[catKey] || catKey;
    const sec = `\n──── ${label} (${items.length}) ────\n`;
    block += sec; used += sec.length;
    for (const m of items) {
      if (left() < 200) break;
      const tag = m._origin === 'current' ? '📌' : '🔗';
      // Sanitizar PII antes de inyectar (RUTs, emails, teléfonos)
      const cleaned = sanitizePII(m.extracted_text);
      const slice = cleaned.slice(0, MAX_RES_MODELS_PER_MODEL);
      const allowed = Math.min(slice.length, left() - 120);
      if (allowed <= 100) break;
      const piece = `\n${tag} ${sanitizePII(m.name || '')}\n${slice.slice(0, allowed)}\n${slice.length > allowed ? '[…truncado…]\n' : ''}`;
      block += piece; used += piece.length;
    }
  }
  return block;
}

/* ══════════════════════════════════════════════
   Supabase: Buscar modelos de referencia
   ══════════════════════════════════════════════ */
async function fetchModelReports(caseData, mode, referenceModelId) {
  const sbUrl = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
  const sbKey = env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!sbUrl || !sbKey) return [];

  const tipo = caseData.tipo_procedimiento || '';
  const protocolo = caseData.protocolo || '';
  const caseId = caseData.id || '';

  /* ── Modelo de referencia explícito (prioridad absoluta) ── */
  let pinned = null;
  if (referenceModelId) {
    try {
      const pinnedList = await supaFetch(
        `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
        + `&id=eq.${encodeURIComponent(referenceModelId)}`
        + `&informe_final=not.is.null&limit=1`
      );
      if (pinnedList && pinnedList.length && pinnedList[0].informe_final) {
        pinned = pinnedList[0];
        pinned._isPinned = true;
      }
    } catch (e) { /* ignore */ }
  }

  const resultadoFilter = (mode === 'sancion') ? '&resultado=eq.Sanción'
    : (mode === 'sobreseimiento') ? '&resultado=eq.Sobreseimiento'
    : (mode === 'genero') ? '&protocolo=not.is.null' : '';

  // 1) Match exacto
  let path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
    + `&categoria=eq.terminado&informe_final=not.is.null`
    + `&tipo_procedimiento=eq.${encodeURIComponent(tipo)}`
    + `&protocolo=eq.${encodeURIComponent(protocolo)}`
    + resultadoFilter
    + `&id=neq.${encodeURIComponent(caseId)}`
    + (pinned ? `&id=neq.${encodeURIComponent(pinned.id)}` : '')
    + `&order=nueva_resolucion.desc&limit=3`;

  let models = await supaFetch(path);

  // 2) Ampliar: mismo tipo + resultado
  if ((!models || models.length < 2) && tipo) {
    path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
      + `&categoria=eq.terminado&informe_final=not.is.null`
      + `&tipo_procedimiento=eq.${encodeURIComponent(tipo)}`
      + resultadoFilter
      + `&id=neq.${encodeURIComponent(caseId)}`
      + (pinned ? `&id=neq.${encodeURIComponent(pinned.id)}` : '')
      + `&order=nueva_resolucion.desc&limit=3`;
    const extra = await supaFetch(path);
    if (extra && extra.length) {
      const existingIds = new Set((models || []).map(m => m.nueva_resolucion));
      extra.forEach(m => { if (!existingIds.has(m.nueva_resolucion)) models.push(m); });
      models = models.slice(0, 3);
    }
  }

  // 3) Fallback general
  if (!models || models.length === 0) {
    path = `cases?select=id,name,nueva_resolucion,informe_final,tipo_procedimiento,protocolo,resultado`
      + `&categoria=eq.terminado&informe_final=not.is.null`
      + `&id=neq.${encodeURIComponent(caseId)}`
      + (pinned ? `&id=neq.${encodeURIComponent(pinned.id)}` : '')
      + `&order=nueva_resolucion.desc&limit=2`;
    models = await supaFetch(path);
  }

  let validModels = (models || []).filter(m => m.informe_final && m.informe_final.length > 500);

  /* Si tenemos modelo pin-eado, va siempre primero (prioridad absoluta) */
  if (pinned) {
    validModels = [pinned, ...validModels].slice(0, 3);
  }

  // Enriquecer con diligencias del modelo principal (pin-eado o el mejor match)
  if (validModels.length > 0 && (mode === 'hechos' || mode === 'informe' || mode === 'vistos')) {
    try {
      const bestModelId = validModels[0].id;
      if (bestModelId) {
        const dilPath = `diligencias?select=diligencia_type,diligencia_label,ai_summary,fojas_inicio,fojas_fin,fecha_diligencia`
          + `&case_id=eq.${encodeURIComponent(bestModelId)}&is_processed=eq.true`
          + `&order=order_index.asc&limit=20`;
        const modelDils = await supaFetch(dilPath);
        if (modelDils && modelDils.length > 0) validModels[0]._diligencias = modelDils;
      }
    } catch (e) { /* ignore */ }
  }

  return validModels;
}

/* ── Extract relevant sections from model reports ── */
function extractModelSections(fullText, maxLen, mode) {
  if (!fullText || fullText.length <= maxLen) return fullText || '';
  const sections = [];
  let remaining = maxLen;

  const vistosMatch = fullText.match(/V\s*I\s*S\s*T\s*O\s*S?:?\s*\n([\s\S]*?)(?=\n\s*(?:CONSIDERANDO|C\s*O\s*N\s*S\s*I\s*D\s*E\s*R)|$)/i);
  if (vistosMatch) {
    const vistosLen = mode === 'vistos' ? Math.min(3000, remaining) : Math.min(1500, remaining);
    const vistos = 'VISTOS:\n' + vistosMatch[1].slice(0, vistosLen);
    sections.push(vistos); remaining -= vistos.length;
  }

  if (mode !== 'vistos') {
    const considMatch = fullText.match(/(?:CONSIDERANDO|C\s*O\s*N\s*S\s*I\s*D\s*E\s*R\s*A\s*N\s*D\s*O):?\s*\n([\s\S]*?)(?=\n\s*(?:AN[ÁA]LISIS|CALIFICACI[ÓO]N|POR\s*TANTO|P\s*O\s*R\s*T\s*A\s*N\s*T\s*O|EN\s*M[ÉE]RITO|CONCLUSI[OÓ]N|FUNDAMENTOS?\s*DEL?\s*SOBRESEIMIENTO|PROPUESTA|CIRCUNSTANCIAS|ESTRATEGIAS?\s*PREVENTIVAS?|PERSPECTIVA\s*DE\s*G[ÉE]NERO)|$)/i);
    if (considMatch && remaining > 500) {
      const considText = considMatch[1];
      const numerales = considText.match(/\d+\.\s+Que[\s\S]*?(?=\n\d+\.\s+Que|\n\s*(?:AN[ÁA]LISIS|POR\s*TANTO|CALIFICACI|FUNDAMENTOS|PROPUESTA)|$)/gi);
      if (numerales) {
        const maxNumerales = (mode === 'hechos' || mode === 'informe') ? 5 : 3;
        let considSection = 'CONSIDERANDO:\n';
        for (let i = 0; i < Math.min(maxNumerales, numerales.length) && remaining > 200; i++) {
          const numeral = numerales[i].slice(0, mode === 'hechos' ? 1200 : 800);
          considSection += numeral + '\n'; remaining -= numeral.length;
        }
        if (numerales.length > maxNumerales) considSection += `[... ${numerales.length - maxNumerales} considerandos más ...]\n`;
        sections.push(considSection);
      }
    }
  }

  if (mode === 'sancion' || mode === 'informe') {
    const analisisMatch = fullText.match(/(AN[ÁA]LISIS\s*JUR[ÍI]DICO|CALIFICACI[ÓO]N\s*JUR[ÍI]DICA):?\s*\n([\s\S]*?)(?=\n\s*(?:CIRCUNSTANCIAS|PROPUESTA|POR\s*TANTO|CONCLUSI[OÓ]N)|$)/i);
    if (analisisMatch && remaining > 300) {
      const analisis = analisisMatch[0].slice(0, Math.min(1500, remaining));
      sections.push(analisis); remaining -= analisis.length;
    }
  }

  if (mode === 'sobreseimiento') {
    const sobMatch = fullText.match(/FUNDAMENTOS?\s*(?:DEL?)?\s*SOBRESEIMIENTO:?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO)|$)/i);
    if (sobMatch && remaining > 300) {
      const sob = sobMatch[0].slice(0, Math.min(1500, remaining));
      sections.push(sob); remaining -= sob.length;
    }
  }

  if (mode === 'genero') {
    const generoMatch = fullText.match(/(PERSPECTIVA\s*DE\s*G[ÉE]NERO|ENFOQUE\s*DE\s*G[ÉE]NERO|AN[ÁA]LISIS.*G[ÉE]NERO):?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO|ESTRATEGIAS?)|$)/i);
    if (generoMatch && remaining > 300) {
      const genero = generoMatch[0].slice(0, Math.min(2000, remaining));
      sections.push(genero); remaining -= genero.length;
    }
  }

  if (mode === 'estrategias') {
    const estMatch = fullText.match(/(ESTRATEGIAS?\s*PREVENTIVAS?|RECOMENDACIONES?\s*INSTITUCIONALES?|MEDIDAS?\s*PREVENTIVAS?):?\s*\n([\s\S]*?)(?=\n\s*(?:CONCLUSI[OÓ]N|POR\s*TANTO)|$)/i);
    if (estMatch && remaining > 300) {
      const est = estMatch[0].slice(0, Math.min(2000, remaining));
      sections.push(est); remaining -= est.length;
    }
  }

  if (mode !== 'vistos') {
    const porTantoMatch = fullText.match(/(P\s*O\s*R\s*T\s*A\s*N\s*T\s*O|EN\s*M[ÉE]RITO|CONCLUSI[OÓ]N):?\s*\n([\s\S]*?)$/i);
    if (porTantoMatch && remaining > 300) {
      sections.push(porTantoMatch[0].slice(0, Math.min(1000, remaining)));
    }
  }

  return sections.length ? sections.join('\n\n[...]\n\n') : fullText.slice(0, maxLen);
}

/* ── Build case context ── */
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

  if (diligencias && diligencias.length) {
    ctx += `DILIGENCIAS (${diligencias.length} documentos del expediente):\n`;
    ctx += `INSTRUCCIÓN: Incluye como considerandos individuales las diligencias RELEVANTES para la investigación. No es obligatorio individualizar absolutamente todas; prioriza las que aportan contenido sustantivo. Las diligencias menores o meramente formales pueden omitirse o agruparse brevemente.\n\n`;
    const maxCharsPerDiligencia = isInforme ? 6000 : 1500;
    diligencias.forEach((d, i) => {
      const fojas = d.fojas || '';
      ctx += `${i + 1}. ${d.diligencia_label || d.file_name || 'Doc ' + (i + 1)}`;
      if (fojas) ctx += ` (fojas ${fojas})`;
      if (d.fecha_diligencia) ctx += ` [${d.fecha_diligencia}]`;
      ctx += '\n';
      if (isInforme && d.extracted_text) {
        ctx += `   CONTENIDO COMPLETO:\n   ${d.extracted_text.slice(0, maxCharsPerDiligencia)}\n`;
        if (d.extracted_text.length > maxCharsPerDiligencia) {
          ctx += `   [... texto truncado, original: ${d.extracted_text.length} chars]\n`;
        }
      } else if (d.ai_summary) {
        ctx += `   Resumen: ${d.ai_summary.slice(0, 800)}\n`;
      }
      if (d.extracted_text && !isInforme && d.ai_summary) {
        ctx += `   Extracto: ${d.extracted_text.slice(0, 600)}\n`;
      }
    });
    ctx += '\n';
  }

  if (chronology && chronology.length) {
    ctx += 'CRONOLOGÍA:\n';
    chronology.slice(0, 15).forEach(ev => {
      ctx += `- ${ev.event_date || '?'}: ${ev.title || ev.description || '?'}\n`;
    });
    ctx += '\n';
  }

  if (c.observaciones) ctx += `OBSERVACIONES: ${c.observaciones}\n`;
  if (c.informe_final) ctx += `INFORME PREVIO:\n${c.informe_final.slice(0, 2000)}\n`;

  if (modelReports && modelReports.length) {
    const modeLabel = data.mode || 'informe';
    const hasPinned = modelReports.some(m => m._isPinned);
    ctx += '\n═══════════════════════════════════════════════════════════════\n';
    ctx += 'MODELOS DE REFERENCIA — Informes finales de expedientes terminados\n';
    ctx += '═══════════════════════════════════════════════════════════════\n';
    ctx += 'INSTRUCCIONES OBLIGATORIAS SOBRE LOS MODELOS:\n';
    ctx += '1. Replica fielmente el ESTILO, TONO, ESTRUCTURA y LENGUAJE INSTITUCIONAL de estos modelos.\n';
    ctx += '2. Conserva el razonamiento jurídico y el lenguaje administrativo exactamente como aparece en los modelos.\n';
    ctx += '3. NUNCA copies hechos, nombres ni datos de estos modelos — solo su estructura, estilo y vocabulario jurídico.\n';
    ctx += '4. Si los modelos contienen una sección de ' + modeLabel.toUpperCase() + ', replica su formato, extensión y nivel de detalle.\n';
    ctx += '5. Si los modelos citan normativa, usa las MISMAS citas formales adaptándolas al caso actual.\n';
    ctx += '6. El documento generado debe ser INDISTINGUIBLE en estilo de los modelos proporcionados.\n';
    if (hasPinned) {
      ctx += '7. 🔒 MODELO PRIORITARIO: El MODELO 1 ha sido EXPRESAMENTE SELECCIONADO por el usuario como referencia principal. Presta MÁXIMA atención a su estructura, su redacción y su formato. El resultado debe imitar muy de cerca el MODELO 1, incorporando solo de forma subsidiaria los estilos de los demás modelos.\n';
    }
    ctx += '═══════════════════════════════════════════════════════════════\n\n';

    const maxPerModel = isInforme ? 3000 : 2000;
    modelReports.forEach((m, i) => {
      const label = m.name || m.nueva_resolucion || '?';
      const tipoInfo = [m.tipo_procedimiento, m.protocolo, m.resultado].filter(Boolean).join(' / ');
      const pinMark = m._isPinned ? '  ⭐ [MODELO PRIORITARIO — Seleccionado expresamente por el usuario]' : '';
      ctx += `--- MODELO ${i + 1}: Exp. ${label} (${tipoInfo}) ---${pinMark}\n`;
      ctx += extractModelSections(m.informe_final, maxPerModel, data.mode) + '\n';

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

/* ── Style rules ── */
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
- DISTINCIÓN FUNDAMENTAL DE ESTILOS EN LOS CONSIDERANDOS:
  * DILIGENCIAS: Redacción SOBRIA, OBJETIVA, DESCRIPTIVA. Solo se da cuenta de lo que consta en el expediente. Sin valoraciones, sin conclusiones, sin calificar conductas. No anticipar el resultado del análisis.
  * HECHOS ACREDITADOS: AQUÍ cambia el estilo. Se valoran los hechos en función de las diligencias practicadas, se analiza la prueba, se contrastan declaraciones y se extraen conclusiones fácticas.
  Esta separación es OBLIGATORIA en todo documento que incluya considerandos.
` + HUMAN_WRITING_STYLE;

/* ── System prompts per mode ── */
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

  vistos: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Genera EXCLUSIVAMENTE la sección de VISTOS de una vista fiscal / informe de la investigadora.

{NORMATIVE_REGIME}

ESTRUCTURA OBLIGATORIA DE LOS VISTOS:
Redactar como UN SOLO PÁRRAFO CORRIDO (NO numerado) que incluya:
- "En el marco de [tipo procedimiento], ordenada instruir por Resolución Exenta N°[NUMERO]/[AÑO]..."
- Si hubo cambio de investigador/fiscal: "y continuada por Resolución Exenta N°..."
- "Los antecedentes acumulados en el curso de la presente investigación y que rolan de fojas 01 a [N] del expediente investigativo;"
- "Los reglamentos y normas que rigen esta investigación, donde se incluyen, [NORMAS_SEPARADAS_POR_PUNTO_Y_COMA]."

Normativa que DEBE incluirse (según corresponda al caso):
- Estatuto Administrativo (D.F.L. N°29 de 2005, arts. aplicables)
- Ley N°19.880 sobre procedimientos administrativos
- Ley N°18.575, LOCBGAE
- Protocolos internos de la UMAG aplicables según el tipo de procedimiento
- Si es caso de acoso sexual: Ley N°21.369 y protocolo institucional
- Si es caso Ley Karin: Ley N°21.643 y Decreto N°019/SU/2024
- Toda otra norma relevante según la materia investigada

Terminar la sección con ".-"

IMPORTANTE: NO incluir considerandos, análisis ni conclusiones. Solo los VISTOS.

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA, examina cómo estructuran su sección de VISTOS — qué normativa citan, en qué orden, con qué formato y nivel de detalle. Replica EXACTAMENTE esa misma estructura, formato y nivel de exhaustividad normativa, adaptando solo los datos al caso actual.

${PRECISION_JURIDICA}

${STYLE_RULES}`,

  hechos: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Genera EXCLUSIVAMENTE la sección de CONSIDERANDOS de una vista fiscal / informe de la investigadora. Esta sección tiene DOS PARTES con estilos de redacción DIFERENTES:

{NORMATIVE_REGIME}

═══════════════════════════════════════════════════════════════
PARTE 1: DILIGENCIAS DEL EXPEDIENTE (estilo DESCRIPTIVO-OBJETIVO)
═══════════════════════════════════════════════════════════════

Describe las diligencias RELEVANTES del expediente en orden de fojas. No es obligatorio individualizar absolutamente todas las diligencias; prioriza las que aportan contenido sustantivo. Las diligencias menores o meramente formales pueden omitirse o agruparse.

ESTILO OBLIGATORIO PARA ESTA PARTE:
- Redacción SOBRIA, OBJETIVA, sin valoraciones ni conclusiones.
- Solo describe lo que CONSTA en el documento: qué es, quién lo emite, qué fecha tiene, qué dice.
- NUNCA anticipar conclusiones ni calificar la conducta del investigado en esta sección.
- NUNCA usar expresiones valorativas como "lo que demuestra que...", "quedando en evidencia que...", "lo cual resulta grave...", "incumpliendo con ello...".
- El tono es puramente descriptivo: se da cuenta de lo que obra en el expediente, nada más.

FORMATO:
1. Cada considerando inicia con: "Que, de fojas [XX] a [YY] del expediente, consta [tipo de documento], de fecha [FECHA], [DESCRIPCIÓN OBJETIVA DEL CONTENIDO];"
2. Nombres completos con tratamiento formal ("doña", "don"), cargos, RUT si consta.
3. Fechas exactas en formato extenso.
4. Si es una declaración: reproducir lo declarado con lenguaje indirecto formal ("manifiesta que...", "señala que...", "indica que...") SIN valorar ni contrastar.
5. Si es un documento administrativo: describir su contenido objetivo.
6. Expresiones: "obra", "rola", "consta", "se consigna", "se registra".
7. Cada considerando termina con punto y coma (;).
8. Los considerandos se numeran: "1.      Que,..."

═══════════════════════════════════════════════════════════════
PARTE 2: HECHOS ACREDITADOS (estilo VALORATIVO-ANALÍTICO)
═══════════════════════════════════════════════════════════════

Tras la descripción de las diligencias, incluye un considerando que establezca: "Que, de los antecedentes reunidos y de las diligencias practicadas en el curso de la investigación, se han establecido los siguientes hechos:"

ESTILO OBLIGATORIO PARA ESTA PARTE:
- AQUÍ SÍ se valoran los hechos en función de las diligencias practicadas.
- Se analiza la prueba, se contrastan declaraciones, se extraen conclusiones fácticas.
- Se conectan los antecedentes entre sí para establecer la convicción del fiscal.
- Lenguaje analítico: "se acredita que...", "se desprende de los antecedentes que...", "queda establecido que...".
- Usar sub-numeración si es necesario (ej: 17.1, 17.2, etc.).

IMPORTANTE: NO incluir VISTOS, análisis jurídico ni propuesta. Solo los CONSIDERANDOS (diligencias + hechos acreditados).

REFERENCIA A MODELOS: Si se proporcionan MODELOS DE REFERENCIA, observa cómo redactan cada considerando — la extensión, el nivel de detalle, las expresiones jurídicas. Especialmente observa cómo distinguen la parte descriptiva de la parte valorativa.

${PRECISION_JURIDICA}

${STYLE_RULES}
- Extensión: cada diligencia importante merece su propio considerando detallado.
- No es necesario que TODAS las diligencias tengan considerando individual. Prioriza las relevantes.
- Si el documento queda extenso, eso es CORRECTO cuando el expediente lo justifica.`,

  estrategias: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Genera una sección de ESTRATEGIAS PREVENTIVAS Y RECOMENDACIONES INSTITUCIONALES basándote en los hechos investigados.

{NORMATIVE_REGIME}

ESTRUCTURA:
1. ANÁLISIS DE FACTORES DE RIESGO — Qué condiciones institucionales u organizacionales contribuyeron a los hechos investigados.
2. RECOMENDACIONES PREVENTIVAS — Medidas concretas y específicas al caso: Organizacionales, formativas, normativas y de apoyo.
3. PLAN DE IMPLEMENTACIÓN SUGERIDO — Cronograma y responsables.
4. SEGUIMIENTO — Indicadores de cumplimiento y mecanismos de monitoreo.

Las recomendaciones deben ser ESPECÍFICAS al caso y factibles dentro del marco institucional de la UMAG.

${PRECISION_JURIDICA}

${STYLE_RULES}`,

  genero: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG), con formación en perspectiva de género.

Genera un ANÁLISIS CON PERSPECTIVA DE GÉNERO del procedimiento disciplinario, conforme a la normativa vigente y los estándares internacionales.

{NORMATIVE_REGIME}

ESTRUCTURA:
1. MARCO NORMATIVO DE GÉNERO APLICABLE: Convención CEDAW, Convención de Belém do Pará, Ley N°21.369, Ley N°20.609, Ley N°20.607 (si aplica), Protocolo institucional UMAG.
2. ANÁLISIS DE LOS HECHOS CON ENFOQUE DE GÉNERO: Relaciones asimétricas de poder, componentes de violencia o discriminación de género, estereotipos de género presentes, impacto diferenciado según género.
3. ESTÁNDARES DE DEBIDA DILIGENCIA: Cumplimiento de estándares de debida diligencia reforzada, medidas de protección adoptadas, derecho a ser oída/o en condiciones de igualdad.
4. CONCLUSIONES Y RECOMENDACIONES CON PERSPECTIVA DE GÉNERO: Impacto en la calificación de los hechos, recomendaciones específicas, medidas reparatorias con enfoque de género.

El análisis debe ser técnico y fundado en normativa, no meramente declarativo. Conecta la teoría de género con los hechos específicos del caso.

${PRECISION_JURIDICA}

${STYLE_RULES}
- Terminología técnica: "perspectiva de género", "relaciones asimétricas de poder", "violencia de género", "debida diligencia reforzada".`,

  informe: `Eres un experto en derecho administrativo chileno, especializado en procedimientos disciplinarios de la Universidad de Magallanes (UMAG).

Tu tarea es generar un borrador completo de INFORME DE LA INVESTIGADORA / VISTA FISCAL para un procedimiento disciplinario o investigación sumaria. Este documento es el informe final que la fiscal investigadora presenta a la autoridad instructora.

{NORMATIVE_REGIME}

ESTRUCTURA OBLIGATORIA:

ENCABEZADO:
- Título: "INFORME DE LA INVESTIGADORA" (Invest. Sumaria) o "VISTA FISCAL" (Sumario Admin.)
- Lugar y fecha: "Punta Arenas, [fecha]"

VISTOS:
Redactar como UN SOLO PÁRRAFO CORRIDO (NO numerado):
- "En el marco de [tipo procedimiento], ordenada instruir por Resolución Exenta N°[NUMERO]/[AÑO]..."
- Rango de fojas del expediente
- Normativa aplicable separada por punto y coma
- Terminar con ".-"

CONSIDERANDO (tiene DOS PARTES con estilos DIFERENTES):

  PARTE A — DILIGENCIAS DEL EXPEDIENTE (estilo DESCRIPTIVO-OBJETIVO):
  - Un numeral por cada diligencia RELEVANTE del expediente, en orden de fojas.
  - No es obligatorio individualizar absolutamente todas las diligencias; prioriza las que aportan contenido sustantivo. Las meramente formales pueden omitirse o agruparse.
  - Redacción SOBRIA, OBJETIVA, sin valoraciones ni conclusiones.
  - Solo describe lo que CONSTA: qué documento es, quién lo emite, qué fecha tiene, qué dice.
  - NUNCA anticipar conclusiones ni calificar conductas en esta parte.
  - NUNCA usar expresiones valorativas ("lo que demuestra...", "quedando en evidencia...", "lo cual resulta grave...").
  - Declaraciones: reproducir con lenguaje indirecto formal ("manifiesta que...", "señala que...") SIN valorar.
  - Expresiones: "obra", "rola", "consta", "se consigna", "se registra".
  - Cada considerando termina con punto y coma (;).

  PARTE B — HECHOS ACREDITADOS (estilo VALORATIVO-ANALÍTICO):
  - Tras las diligencias, un considerando establece: "Que, de los antecedentes reunidos y de las diligencias practicadas..."
  - AQUÍ SÍ se valoran los hechos, se analiza la prueba, se contrastan declaraciones, se extraen conclusiones fácticas.
  - Usar sub-numeración si es necesario (ej: 17.1, 17.2...).
  - Lenguaje analítico: "se acredita que...", "se desprende de los antecedentes que...", "queda establecido que...".

ANÁLISIS JURÍDICO:
- Subsunción de hechos en normas aplicables
- Valoración de la prueba reunida
- Para sobreseimiento: sección de "hechos establecidos" con sub-numeración (N.1, N.2...)
  - Análisis de consistencia testimonial
  - Conclusión probatoria conforme a sana crítica
  - Análisis jurídico por cada denunciado
  - Conclusión sobre tipicidad

POR TANTO:
Para Investigación Sumaria: "P O R T A N T O, SE SUGIERE:"
Para Sumario Administrativo: "P O R T A N T O, SE RESUELVE O SUGIERE:"
- Si sanción: medida disciplinaria con artículo aplicable
- Si sobreseimiento: causal específica y fundamentación
- Cierre: "Remítanse los antecedentes... Es todo cuanto tengo por informar."

${MODELO_SANCION}

${MODELO_SOBRESEIMIENTO}

${PARRAFOS_MODELO}

${PRECISION_JURIDICA}

${STYLE_RULES}
- Extensión: TAN EXTENSO como lo requiera el expediente.
- Cada diligencia RELEVANTE merece su propio considerando detallado. No es obligatorio que TODAS tengan considerando individual; prioriza las que aportan contenido sustantivo.
- DISTINCIÓN DE ESTILOS: Los considerandos de diligencias son DESCRIPTIVOS y OBJETIVOS (sin valorar). Los hechos acreditados son VALORATIVOS y ANALÍTICOS (aquí sí se concluye).
- Si el documento queda extenso, eso es CORRECTO cuando el expediente lo justifica.`
};

/* ══════════════════════════════════════════════
   Instrucciones de tipo de documento
   — Vista Fiscal (Sumario Admin.) vs Informe
     de la Investigadora (Investigación Sumaria)
   ══════════════════════════════════════════════ */
const DOC_TYPE_INSTRUCTIONS = {
  vista_fiscal: `
═══════════════════════════════════════════════════════════════
🔒 TIPO DE DOCUMENTO FIJADO POR EL USUARIO: VISTA FISCAL
═══════════════════════════════════════════════════════════════
Estás redactando una VISTA FISCAL en el contexto de un SUMARIO ADMINISTRATIVO (art. 129 y ss. del Estatuto Administrativo). Reglas obligatorias:

- TÍTULO del documento: "VISTA FISCAL" (en mayúsculas, centrado). NO uses "INFORME DE LA INVESTIGADORA".
- AUTORÍA y firma: la suscribe el/la FISCAL instructor/a (tratamiento: "el Fiscal" o "la Fiscal" según corresponda). NO uses "la Investigadora".
- PRONOMBRES: cuando el instructor se refiera a sí mismo en primera persona, usar "este Fiscal" / "la suscrita Fiscal" / "el Fiscal que suscribe". Evita "la suscrita Investigadora".
- TERMINOLOGÍA: se habla del "sumario administrativo", de la "formulación de cargos", de los "descargos" (cuando corresponda), del "expediente sumarial" y del "vista fiscal" como acto procesal.
- RESOLUCIÓN DE CIERRE sugerida: "PROPÓNGASE al Sr./Sra. [autoridad instructora]..."
- El documento debe ser MÁS FORMAL, EXTENSO y TÉCNICO que un informe de investigación sumaria; la propuesta puede contemplar sanciones expulsivas (destitución) si procede.
- Fundamenta expresamente, cuando proceda, la aplicación del art. 121 del Estatuto Administrativo.
═══════════════════════════════════════════════════════════════`,

  informe_investigadora: `
═══════════════════════════════════════════════════════════════
🔒 TIPO DE DOCUMENTO FIJADO POR EL USUARIO: INFORME DE LA INVESTIGADORA
═══════════════════════════════════════════════════════════════
Estás redactando un INFORME DE LA INVESTIGADORA en el contexto de una INVESTIGACIÓN SUMARIA (art. 126 del Estatuto Administrativo). Reglas obligatorias:

- TÍTULO del documento: "INFORME DE LA INVESTIGADORA" (o "INFORME DEL INVESTIGADOR" si el instructor es hombre; úsalo solo si el contexto lo indica). NO uses "VISTA FISCAL".
- AUTORÍA y firma: la suscribe el/la INVESTIGADOR/A (tratamiento: "la Investigadora" o "el Investigador"). NO uses "el/la Fiscal".
- PRONOMBRES: cuando el instructor se refiera a sí mismo en primera persona, usar "la suscrita Investigadora" / "la Investigadora que suscribe" / "esta Investigadora". Evita "este Fiscal".
- TERMINOLOGÍA: se habla de la "investigación sumaria", de la "propuesta" de sanción o sobreseimiento, del "expediente de la investigación" y del "informe" como acto procesal. NUNCA "sumario administrativo", NUNCA "vista fiscal".
- ESTRUCTURA más breve y directa que una vista fiscal; la sanción propuesta típicamente no excede la multa (art. 126 EA), salvo excepciones expresamente justificadas.
- RESOLUCIÓN DE CIERRE sugerida: "SUGIERE al Sr./Sra. [autoridad instructora]..."
- Lenguaje técnico pero MÁS SOBRIO, sin las solemnidades propias del sumario administrativo.
═══════════════════════════════════════════════════════════════`,

  auto: `
═══════════════════════════════════════════════════════════════
TIPO DE DOCUMENTO: AUTO-DETECTAR según "Tipo" del expediente
═══════════════════════════════════════════════════════════════
Determina el tipo de documento a partir del campo "Tipo" del expediente:
- Si "Tipo" contiene "Sumario Administrativo" → redacta una VISTA FISCAL; firma el/la FISCAL; título "VISTA FISCAL".
- Si "Tipo" contiene "Investigación Sumaria" → redacta un INFORME DE LA INVESTIGADORA; firma el/la INVESTIGADOR/A; título "INFORME DE LA INVESTIGADORA".
- Usa la terminología (Fiscal vs Investigadora, sumario vs investigación sumaria, vista fiscal vs informe) consistentemente con el tipo detectado. NO mezcles ambas.
═══════════════════════════════════════════════════════════════`
};

function buildSystemPrompt(mode, participants, docType) {
  const base = SYSTEM_PROMPTS_BASE[mode] || SYSTEM_PROMPTS_BASE.informe;
  const normativeRegime = getNormativeContext(participants || []);
  let prompt = base.replace('{NORMATIVE_REGIME}', normativeRegime);

  /* Instrucciones de tipo de documento (solo cuando aplican: informe completo,
     hechos, vistos, sancion, sobreseimiento). Para art129/estrategias/genero no
     aplica porque son secciones que no dependen del tipo de instructor. */
  const docTypeRelevant = ['informe', 'hechos', 'vistos', 'sancion', 'sobreseimiento'];
  if (docTypeRelevant.includes(mode)) {
    const dt = (docType && DOC_TYPE_INSTRUCTIONS[docType]) ? docType : 'auto';
    prompt = DOC_TYPE_INSTRUCTIONS[dt] + '\n\n' + prompt;
  }

  return prompt;
}

/* ── Doc labels ── */
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

/* ── Token limits per mode ── */
const TOKEN_MAP = { informe: 32000, hechos: 24000, sancion: 16000, sobreseimiento: 16000, vistos: 8000, estrategias: 10000, genero: 10000, art129: 10000 };

/* ══════════════════════════════════════
   ESM Handler — Streaming SSE Response
   ══════════════════════════════════════ */
function jsonRes(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default async (req) => {
  const CORS = corsHeaders(req);

  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST') return jsonRes({ error: 'Method Not Allowed' }, 405, CORS);

  const authToken = req.headers.get('x-auth-token') || '';
  if (!authToken) return jsonRes({ error: 'No autorizado' }, 401, CORS);

  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) return jsonRes({ error: 'API key no configurada' }, 500, CORS);

  try {
    /* Rate limiting */
    const userId = extractUserId(authToken);
    const rl = await checkRL(userId);
    if (!rl.allowed) return jsonRes({ error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.', limit: rl.limit, remaining: 0 }, 429, CORS);

    const data = await req.json();

    /* Payload size check */
    const bodyStr = JSON.stringify(data);
    if (bodyStr.length > 2000000) return jsonRes({ error: 'Payload too large' }, 413, CORS);

    const { mode } = data;
    if (!mode || !SYSTEM_PROMPTS_BASE[mode]) {
      return jsonRes({ error: 'mode inválido. Use: informe, sancion, sobreseimiento, art129, vistos, hechos, estrategias, genero' }, 400, CORS);
    }

    /* Nuevos parámetros opcionales:
       - docType: 'vista_fiscal' | 'informe_investigadora' | 'auto'
       - referenceModelId: UUID de caso terminado a usar como modelo prioritario */
    const docType = (data.docType && DOC_TYPE_INSTRUCTIONS[data.docType]) ? data.docType : 'auto';
    const referenceModelId = (typeof data.referenceModelId === 'string' && data.referenceModelId.length > 0)
      ? data.referenceModelId : null;

    /* Fetch model reports (incluye modelo pin-eado si se indicó) */
    let modelReports = [];
    try { modelReports = await fetchModelReports(data.caseData || {}, mode, referenceModelId); }
    catch (e) { console.warn('fetchModelReports:', e.message); }

    /* Fetch case_resolution_models (sección XVII): modelos del caso + globales del usuario */
    let resolutionModelsBlock = '';
    try {
      const caseId = (data.caseData && data.caseData.id) || '';
      const resModels = await fetchCaseResolutionModels(userId, caseId);
      resolutionModelsBlock = buildResolutionModelsBlock(resModels);
    } catch (e) { console.warn('fetchCaseResolutionModels:', e.message); }

    /* Build context and prompt */
    const context = buildCaseContext(data, modelReports);
    const system = buildSystemPrompt(mode, data.participants || [], docType);
    const docLabel = (docType === 'vista_fiscal') ? 'vista fiscal'
      : (docType === 'informe_investigadora') ? 'informe de la investigadora'
      : (DOC_LABELS[mode] || 'vista fiscal');
    const userMsg = `Con base en la siguiente información del expediente, genera el borrador de ${docLabel}:\n\n${context}${resolutionModelsBlock}`;

    /* Token estimation */
    const inputTokens = Math.ceil((system.length + userMsg.length) / 4);
    const maxInput = mode === 'informe' ? 150000 : 100000;
    if (inputTokens > maxInput) {
      return jsonRes({ error: `Contexto demasiado extenso (${inputTokens} tokens estimados, máx ${maxInput}). Reduzca la cantidad de diligencias.` }, 400, CORS);
    }

    const maxOutputTokens = TOKEN_MAP[mode] || 16000;

    /* ── Call Anthropic with streaming ── */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 min

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_SONNET,
          max_tokens: maxOutputTokens,
          system: system,
          messages: [{ role: 'user', content: userMsg }],
          stream: true,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr.name === 'AbortError' ? 'Stream timeout (180s)' : fetchErr.message;
      return jsonRes({ error: msg }, 504, CORS);
    }

    if (!anthropicRes.ok) {
      clearTimeout(timeout);
      const errData = await anthropicRes.text();
      return new Response(errData, { status: anthropicRes.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    /* ── Build streaming response with metadata prefix ── */
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    /* Send custom meta event with modelsUsed info, then pipe Anthropic SSE */
    const meta = {
      modelsUsed: modelReports.map(m => m.name || m.nueva_resolucion).filter(Boolean),
      pinnedModel: modelReports.find(m => m._isPinned) ? (modelReports.find(m => m._isPinned).name || modelReports.find(m => m._isPinned).nueva_resolucion || null) : null,
      mode,
      docType,
      caseName: data.caseData?.name || '',
    };
    writer.write(encoder.encode(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`));

    /* Pipe Anthropic stream → client */
    const reader = anthropicRes.body.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { writer.close(); break; }
          writer.write(value);
        }
      } catch (e) {
        try { writer.close(); } catch (_) {}
      } finally {
        clearTimeout(timeout);
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS,
      },
    });

  } catch (err) {
    console.error('generate-vista-stream error:', err);
    return jsonRes({ error: err.message }, 500, CORS);
  }
};

export const config = {
  maxDuration: 60
};
