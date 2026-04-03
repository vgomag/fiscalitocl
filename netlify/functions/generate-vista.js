/**
 * GENERATE-VISTA.JS — Generación de Vista Fiscal con IA
 * ──────────────────────────────────────────────────────
 * Genera un borrador completo de vista fiscal (opinión del fiscal investigador)
 * basándose en los datos del caso, diligencias, participantes y cronología.
 *
 * POST { caseId, caseData, diligencias, participants, chronology, mode }
 *   mode: "sancion" | "sobreseimiento" | "art129" (medida cautelar art 129)
 */
const https = require('https');
const { callAnthropic: _sharedCall } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');

/* Wrapper que usa Sonnet con timeout largo para generación de vistas */
function callAnthropic(apiKey, system, userMsg, maxTokens) {
  return _sharedCall(apiKey, system, userMsg, {
    model: 'claude-sonnet-4-6', maxTokens: maxTokens || 8000, timeout: 55000
  });
}

/* ── Construir contexto del caso ── */
function buildCaseContext(data) {
  const { caseData, diligencias, participants, chronology } = data;
  const c = caseData || {};

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

  // Diligencias (resumen)
  if (diligencias && diligencias.length) {
    ctx += `DILIGENCIAS (${diligencias.length} documentos):\n`;
    diligencias.slice(0, 20).forEach((d, i) => {
      ctx += `${i + 1}. ${d.diligencia_label || d.file_name || 'Doc ' + (i + 1)}`;
      if (d.fecha_diligencia) ctx += ` [${d.fecha_diligencia}]`;
      if (d.ai_summary) ctx += `\n   Resumen: ${d.ai_summary.slice(0, 300)}`;
      ctx += '\n';
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

  return ctx;
}

/* ── Prompts por modo ── */
const SYSTEM_PROMPTS = {
  sancion: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de VISTA FISCAL con propuesta de SANCIÓN para un procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA:
1. VISTOS — Identificación del expediente, resolución instructora, partes
2. CONSIDERANDO — Hechos probados, valoración de prueba, análisis jurídico
3. CALIFICACIÓN JURÍDICA — Normas infringidas, subsunción de conductas
4. CIRCUNSTANCIAS — Atenuantes y agravantes
5. PROPUESTA DE SANCIÓN — Tipo de sanción propuesta con fundamento
6. CONCLUSIÓN — Resumen y solicitud

REGLAS:
- Redacción formal, jurídica, en tercera persona
- Citar normas específicas (Estatuto Administrativo, protocolo aplicable, reglamento UMAG)
- Fundamentar cada conclusión en pruebas del expediente
- No inventar hechos ni pruebas que no estén en el contexto
- Usar "[COMPLETAR]" donde falte información específica
- Extensión: 3-5 páginas equivalentes`,

  sobreseimiento: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de VISTA FISCAL con propuesta de SOBRESEIMIENTO para un procedimiento disciplinario.

ESTRUCTURA OBLIGATORIA:
1. VISTOS — Identificación del expediente
2. CONSIDERANDO — Análisis de los hechos investigados
3. FUNDAMENTOS DEL SOBRESEIMIENTO — Por qué no se configura la falta disciplinaria
4. CONCLUSIÓN — Propuesta formal de sobreseimiento

REGLAS:
- Redacción formal, jurídica, en tercera persona
- Explicar por qué los hechos no configuran falta o por qué la prueba es insuficiente
- No inventar hechos ni pruebas
- Usar "[COMPLETAR]" donde falte información
- Extensión: 2-3 páginas equivalentes`,

  art129: `Eres Fiscalito, asistente jurídico experto de la Universidad de Magallanes (UMAG).

Genera un borrador de SOLICITUD DE MEDIDA CAUTELAR (Art. 129 EA) para un procedimiento disciplinario.

ESTRUCTURA:
1. ANTECEDENTES — Identificación del caso y urgencia
2. FUNDAMENTOS DE HECHO — Hechos que justifican la medida
3. FUNDAMENTOS DE DERECHO — Art. 129 Estatuto Administrativo y normativa aplicable
4. MEDIDA SOLICITADA — Tipo de medida cautelar (ej: suspensión preventiva, cambio funciones)
5. PETITORIO

REGLAS:
- Demostrar la urgencia y proporcionalidad de la medida
- Citar artículo 129 del Estatuto Administrativo
- No inventar hechos
- Usar "[COMPLETAR]" donde falte información`
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
  if (!authToken) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'generate-vista');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const data = JSON.parse(event.body);
    const bodyStr = JSON.stringify(data);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { mode } = data;

    if (!mode || !SYSTEM_PROMPTS[mode]) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'mode inválido. Use: sancion, sobreseimiento, art129' })
      };
    }

    const context = buildCaseContext(data);
    const system = SYSTEM_PROMPTS[mode];
    const userMsg = `Con base en la siguiente información del expediente, genera el borrador de vista fiscal:\n\n${context}`;

    // Estimar tokens (aprox 4 chars per token)
    const inputTokens = Math.ceil((system.length + userMsg.length) / 4);
    if (inputTokens > 30000) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
        body: JSON.stringify({ error: 'Contexto demasiado extenso. Reduzca la cantidad de diligencias.' })
      };
    }

    const res = await callAnthropic(apiKey, system, userMsg, 8000);

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
