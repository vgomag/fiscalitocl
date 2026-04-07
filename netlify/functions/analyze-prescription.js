/**
 * ANALYZE-PRESCRIPTION.JS — Análisis de prescripción de acciones disciplinarias
 * ──────────────────────────────────────────────────────────────────────────────
 * Calcula plazos de prescripción según normativa chilena (Estatuto Administrativo,
 * Ley Karin, protocolos UMAG) y alerta sobre riesgo de prescripción.
 *
 * POST { caseId, caseData, diligencias, etapas }
 *
 * Normativa aplicable:
 *   - Art. 152 Estatuto Administrativo (Ley 18.834): 4 años desde falta
 *   - Art. 153 EA: 2 años desde conocimiento por autoridad
 *   - Ley 21.643 (Ley Karin): plazos especiales para acoso/violencia laboral
 *   - Reglamento UMAG: plazos internos complementarios
 */
const https = require('https');
const { callAnthropic } = require('./shared/anthropic');
const { checkRateLimit, rateLimitResponse, extractUserIdFromToken } = require('./shared/rate-limit');
const { corsHeaders } = require('./shared/cors');
const { buildLightDirectives } = require('./shared/writing-style');

/* ── Plazos de prescripción por tipo (en días) ── */
const PRESCRIPTION_RULES = {
  'Investigación Sumaria': {
    desde_hecho: 4 * 365,       // 4 años desde los hechos (Art. 152 EA)
    desde_conocimiento: 2 * 365, // 2 años desde conocimiento (Art. 153 EA)
    plazo_investigacion: 20,     // 20 días hábiles para IS
    prorroga_max: 60,            // prórroga máxima total
    label: 'Investigación Sumaria (Arts. 152-153 EA)'
  },
  'Sumario Administrativo': {
    desde_hecho: 4 * 365,
    desde_conocimiento: 2 * 365,
    plazo_investigacion: 20,     // 20 días hábiles iniciales
    prorroga_max: 60,
    label: 'Sumario Administrativo (Arts. 152-153 EA)'
  },
  'Ley Karin': {
    desde_hecho: 4 * 365,
    desde_conocimiento: 2 * 365,
    plazo_investigacion: 30,     // 30 días según Ley 21.643
    prorroga_max: 30,
    label: 'Ley Karin / Ley 21.643'
  },
  'default': {
    desde_hecho: 4 * 365,
    desde_conocimiento: 2 * 365,
    plazo_investigacion: 20,
    prorroga_max: 60,
    label: 'Procedimiento Disciplinario (Arts. 152-153 EA)'
  }
};

/* ── Calcular días hábiles entre dos fechas ── */
function diasHabiles(from, to) {
  let count = 0;
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/* ── Calcular días naturales entre dos fechas ── */
function diasNaturales(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/* ── Determinar tipo de procedimiento ── */
function detectTipoProcedimiento(caseData, diligencias) {
  const c = caseData || {};

  // Verificar campo directo
  if (c.tipo_procedimiento) {
    if (/karin/i.test(c.tipo_procedimiento)) return 'Ley Karin';
    if (/sumario\s+admin/i.test(c.tipo_procedimiento)) return 'Sumario Administrativo';
    if (/investigaci[oó]n\s+sumaria/i.test(c.tipo_procedimiento)) return 'Investigación Sumaria';
  }

  // Verificar protocolo
  if (c.protocolo && /karin/i.test(c.protocolo)) return 'Ley Karin';

  // Buscar en diligencias
  const texts = (diligencias || []).map(d => d.diligencia_label || d.file_name || '').join(' ');
  if (/ley\s+karin|21\.?643|acoso\s+laboral|violencia\s+en\s+el\s+trabajo/i.test(texts)) return 'Ley Karin';
  if (/sumario\s+admin/i.test(texts)) return 'Sumario Administrativo';
  if (/investigaci[oó]n\s+sumaria/i.test(texts)) return 'Investigación Sumaria';

  return 'default';
}

/* ── Extraer fecha de hechos desde datos del caso ── */
function getFechaHechos(caseData) {
  const c = caseData || {};
  // Intentar varios campos
  const candidates = [
    c.fecha_hechos,
    c.fecha_denuncia,
    c.fecha_inicio
  ].filter(Boolean);

  for (const dateStr of candidates) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* ── Extraer fecha de conocimiento por autoridad ── */
function getFechaConocimiento(caseData) {
  const c = caseData || {};
  const candidates = [
    c.fecha_conocimiento,
    c.fecha_denuncia,
    c.fecha_resolucion
  ].filter(Boolean);

  for (const dateStr of candidates) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* ── Extraer fecha de resolución instructora ── */
function getFechaResolucion(caseData) {
  const c = caseData || {};
  const candidates = [
    c.fecha_resolucion,
    c.fecha_resolucion_instructora
  ].filter(Boolean);

  for (const dateStr of candidates) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* ── Análisis principal de prescripción ── */
function analyzePrescription(caseData, diligencias, etapas) {
  const hoy = new Date();
  const tipo = detectTipoProcedimiento(caseData, diligencias);
  const rules = PRESCRIPTION_RULES[tipo] || PRESCRIPTION_RULES['default'];

  const fechaHechos = getFechaHechos(caseData);
  const fechaConocimiento = getFechaConocimiento(caseData);
  const fechaResolucion = getFechaResolucion(caseData);

  const alerts = [];
  const timeline = [];
  let riskLevel = 'ok'; // ok, warning, critical, expired

  // 1. Prescripción desde los hechos (Art. 152 EA)
  if (fechaHechos) {
    const diasTranscurridos = diasNaturales(fechaHechos, hoy);
    const diasRestantes = rules.desde_hecho - diasTranscurridos;
    const porcentaje = Math.min(100, Math.round((diasTranscurridos / rules.desde_hecho) * 100));
    const fechaLimite = new Date(fechaHechos);
    fechaLimite.setDate(fechaLimite.getDate() + rules.desde_hecho);

    timeline.push({
      tipo: 'desde_hecho',
      label: 'Prescripción desde los hechos (Art. 152 EA)',
      fechaInicio: fechaHechos.toISOString().split('T')[0],
      fechaLimite: fechaLimite.toISOString().split('T')[0],
      diasTranscurridos,
      diasRestantes: Math.max(0, diasRestantes),
      porcentaje,
      plazoTotal: rules.desde_hecho
    });

    if (diasRestantes <= 0) {
      riskLevel = 'expired';
      alerts.push({
        severity: 'critical',
        message: `⚠️ PRESCRIPCIÓN CONSUMADA: Han transcurrido ${diasTranscurridos} días desde los hechos. Plazo de ${rules.desde_hecho} días (Art. 152 EA) vencido el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    } else if (diasRestantes <= 90) {
      if (riskLevel !== 'expired') riskLevel = 'critical';
      alerts.push({
        severity: 'critical',
        message: `🔴 RIESGO CRÍTICO: Quedan solo ${diasRestantes} días para prescripción desde los hechos. Vence el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    } else if (diasRestantes <= 365) {
      if (riskLevel === 'ok') riskLevel = 'warning';
      alerts.push({
        severity: 'warning',
        message: `🟡 Atención: Quedan ${diasRestantes} días para prescripción desde los hechos. Vence el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    }
  }

  // 2. Prescripción desde conocimiento (Art. 153 EA)
  if (fechaConocimiento) {
    const diasTranscurridos = diasNaturales(fechaConocimiento, hoy);
    const diasRestantes = rules.desde_conocimiento - diasTranscurridos;
    const porcentaje = Math.min(100, Math.round((diasTranscurridos / rules.desde_conocimiento) * 100));
    const fechaLimite = new Date(fechaConocimiento);
    fechaLimite.setDate(fechaLimite.getDate() + rules.desde_conocimiento);

    timeline.push({
      tipo: 'desde_conocimiento',
      label: 'Prescripción desde conocimiento (Art. 153 EA)',
      fechaInicio: fechaConocimiento.toISOString().split('T')[0],
      fechaLimite: fechaLimite.toISOString().split('T')[0],
      diasTranscurridos,
      diasRestantes: Math.max(0, diasRestantes),
      porcentaje,
      plazoTotal: rules.desde_conocimiento
    });

    if (diasRestantes <= 0) {
      riskLevel = 'expired';
      alerts.push({
        severity: 'critical',
        message: `⚠️ PRESCRIPCIÓN CONSUMADA: Han transcurrido ${diasTranscurridos} días desde conocimiento. Plazo de ${rules.desde_conocimiento} días (Art. 153 EA) vencido el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    } else if (diasRestantes <= 60) {
      if (riskLevel !== 'expired') riskLevel = 'critical';
      alerts.push({
        severity: 'critical',
        message: `🔴 RIESGO CRÍTICO: Quedan solo ${diasRestantes} días para prescripción desde conocimiento. Vence el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    } else if (diasRestantes <= 180) {
      if (riskLevel === 'ok') riskLevel = 'warning';
      alerts.push({
        severity: 'warning',
        message: `🟡 Atención: Quedan ${diasRestantes} días para prescripción desde conocimiento. Vence el ${fechaLimite.toISOString().split('T')[0]}.`
      });
    }
  }

  // 3. Plazo de investigación
  if (fechaResolucion) {
    const diasHabilesTranscurridos = diasHabiles(fechaResolucion, hoy);
    const plazoTotal = rules.plazo_investigacion + rules.prorroga_max;
    const diasHabilesRestantes = plazoTotal - diasHabilesTranscurridos;
    const porcentaje = Math.min(100, Math.round((diasHabilesTranscurridos / plazoTotal) * 100));

    timeline.push({
      tipo: 'plazo_investigacion',
      label: `Plazo de investigación (${rules.plazo_investigacion}+${rules.prorroga_max} días hábiles)`,
      fechaInicio: fechaResolucion.toISOString().split('T')[0],
      diasHabilesTranscurridos,
      diasHabilesRestantes: Math.max(0, diasHabilesRestantes),
      porcentaje,
      plazoBase: rules.plazo_investigacion,
      prorrogaMax: rules.prorroga_max,
      plazoTotal
    });

    if (diasHabilesRestantes <= 0) {
      alerts.push({
        severity: 'critical',
        message: `⚠️ PLAZO VENCIDO: ${diasHabilesTranscurridos} días hábiles desde resolución instructora. Plazo máximo (${plazoTotal} días hábiles incl. prórroga) superado.`
      });
    } else if (diasHabilesRestantes <= 5) {
      alerts.push({
        severity: 'critical',
        message: `🔴 Quedan solo ${diasHabilesRestantes} días hábiles del plazo de investigación.`
      });
    } else if (diasHabilesTranscurridos > rules.plazo_investigacion) {
      alerts.push({
        severity: 'warning',
        message: `🟡 Plazo base de ${rules.plazo_investigacion} días hábiles superado. En período de prórroga: ${diasHabilesTranscurridos - rules.plazo_investigacion} de ${rules.prorroga_max} días de prórroga consumidos.`
      });
    }
  }

  // 4. Verificar etapas para contexto adicional
  const etapaActual = (etapas || []).find(e => e.is_current);
  const etapaInfo = etapaActual ? {
    nombre: etapaActual.stage_name || etapaActual.nombre,
    inicio: etapaActual.started_at || etapaActual.fecha_inicio
  } : null;

  // Datos faltantes
  const missing = [];
  if (!fechaHechos) missing.push('fecha_hechos o fecha_denuncia');
  if (!fechaConocimiento) missing.push('fecha_conocimiento');
  if (!fechaResolucion) missing.push('fecha_resolucion (resolución instructora)');

  if (missing.length) {
    alerts.push({
      severity: 'info',
      message: `ℹ️ Faltan datos para análisis completo: ${missing.join(', ')}. Complete estos campos para un cálculo preciso.`
    });
  }

  return {
    tipoProcedimiento: tipo,
    normativa: rules.label,
    riskLevel,
    alerts,
    timeline,
    etapaActual: etapaInfo,
    fechas: {
      hechos: fechaHechos ? fechaHechos.toISOString().split('T')[0] : null,
      conocimiento: fechaConocimiento ? fechaConocimiento.toISOString().split('T')[0] : null,
      resolucion: fechaResolucion ? fechaResolucion.toISOString().split('T')[0] : null
    },
    missingFields: missing
  };
}

/**
 * Analyze Prescription — Análisis de prescripción de acciones disciplinarias.
 * Calcula plazos según Estatuto Administrativo y Ley Karin.
 * Alerta sobre riesgo de prescripción consumada.
 *
 * @route POST /.netlify/functions/analyze-prescription
 * @param {Object} body
 * @param {string} body.caseId - ID del caso
 * @param {Object} [body.caseData] - Datos del caso (fechas, protocolo, etc.)
 * @param {Array<{diligencia_label?, file_name?}>} [body.diligencias] - Diligencias del caso
 * @param {Array<{stage_name, is_current?, started_at?}>} [body.etapas] - Etapas del procedimiento
 * @param {boolean} [body.includeAI] - Incluir recomendación de IA (default: false)
 * @returns {Object}
 *   {
 *     caseId: string,
 *     tipoProcedimiento: string,
 *     normativa: string,
 *     riskLevel: 'ok'|'warning'|'critical'|'expired',
 *     alerts: Array<{severity, message}>,
 *     timeline: Array<{tipo, label, fechaInicio, fechaLimite, diasRestantes, ...}>,
 *     etapaActual?: {nombre, inicio},
 *     fechas: {hechos, conocimiento, resolucion},
 *     missingFields: Array<string>,
 *     aiRecommendation?: string,
 *     analyzedAt: string (ISO)
 *   }
 * @auth Requiere x-auth-token (JWT Supabase)
 * @rateLimit 60 req/hora por usuario
 */

exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  const authToken = event.headers['x-auth-token'] || '';
  if (!authToken) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    const userId = extractUserIdFromToken(authToken);
    const rl = await checkRateLimit(userId, 'analyze-prescription');
    if (!rl.allowed) return rateLimitResponse(rl, CORS);

    const body = JSON.parse(event.body);
    const bodyStr = JSON.stringify(body);
    if (bodyStr.length > 1000000) {
      return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: 'Payload too large' }) };
    }

    const { caseId, caseData, diligencias, etapas, includeAI } = body;

    if (!caseId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'caseId requerido' }) };
    }

    // Análisis determinístico (siempre)
    const analysis = analyzePrescription(caseData, diligencias, etapas);

    // Análisis con IA (opcional, para recomendaciones más elaboradas)
    let aiRecommendation = null;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (includeAI && apiKey && analysis.timeline.length > 0) {
      try {
        const system = `Eres Fiscalito, asistente jurídico experto en derecho administrativo chileno (UMAG), especializado en prescripción de acciones disciplinarias.

Con base en el análisis de plazos proporcionado, genera una RECOMENDACIÓN JURÍDICA breve que incluya:
- Evaluación del riesgo de prescripción
- Acciones recomendadas para el fiscal investigador
- Fundamento normativo (artículos específicos del EA, Ley Karin si aplica)
- Plazos críticos próximos

Sé conciso (máximo 400 palabras). Usa lenguaje jurídico formal pero claro. No uses formato markdown ni viñetas; redacta en prosa continua con conectores naturales.

${buildLightDirectives()}`;

        const userMsg = `ANÁLISIS DE PRESCRIPCIÓN:
Tipo: ${analysis.tipoProcedimiento}
Riesgo: ${analysis.riskLevel}
Fechas: ${JSON.stringify(analysis.fechas)}
Alertas: ${analysis.alerts.map(a => a.message).join('\n')}
Etapa actual: ${analysis.etapaActual ? analysis.etapaActual.nombre : 'No determinada'}
Línea temporal: ${JSON.stringify(analysis.timeline)}`;

        const res = await callAnthropic(apiKey, system, userMsg, 1000);
        if (res.content && res.content[0]) {
          aiRecommendation = res.content[0].text;
        }
      } catch (e) {
        console.log('AI recommendation fallback:', e.message);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({
        caseId,
        ...analysis,
        aiRecommendation,
        analyzedAt: new Date().toISOString()
      })
    };

  } catch (err) {
    console.error('analyze-prescription error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
      body: JSON.stringify({ error: err.message })
    };
  }
};

exports.config = {
  maxDuration: 60
};
