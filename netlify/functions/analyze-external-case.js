/**
 * Netlify Function: analyze-external-case (ESM)
 * Handles 3 actions for the Casos Externos module:
 *   1. extract_facts    — Extract facts, chronology, participants, norms from documents
 *   2. search_library   — Search Qdrant + PJUD + CGR + Biblioteca for relevant sources
 *   3. generate_section — Generate IRAC/laboral analysis sections with SSE streaming
 */
import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

/* ── Constants ── */
const CLAUDE_TIMEOUT_MS = 24000;   // Must fit within Netlify 26s function timeout
const SEARCH_TIMEOUT_MS = 10000;   // 10s per search source
const MAX_DOC_CHARS = 50000;

/* ── Claude API call (non-streaming) ── */
async function callClaude(apiKey, model, system, userContent, maxTokens = 4096) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), CLAUDE_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API ${res.status}: ${errText.substring(0, 200)}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/* ── Claude API call (streaming) ── */
async function callClaudeStream(apiKey, model, system, userContent, maxTokens = 8192) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 25000); // Fit within Netlify timeout
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userContent }],
        stream: true,
      }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API ${res.status}: ${errText.substring(0, 200)}`);
    }
    return res; // Return raw response for SSE forwarding
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/* ── Internal search helpers ── */

// Search Qdrant via the existing rag function
async function searchQdrant(baseUrl, token, query, collections) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/.netlify/functions/rag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-auth-token': token,
      },
      body: JSON.stringify({ query, collections, limit: 5 }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) return { results: [] };
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    console.warn('[analyze-external-case] Qdrant search error:', e.message);
    return { results: [] };
  }
}

// Search PJUD via existing pjud-search function
async function searchPJUD(baseUrl, token, query, court = 'Corte_Suprema') {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/.netlify/functions/pjud-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-auth-token': token,
      },
      body: JSON.stringify({ query, court, count: 5 }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) return { results: [] };
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    console.warn('[analyze-external-case] PJUD search error:', e.message);
    return { results: [] };
  }
}

// Search CGR via existing cgr-search function
async function searchCGR(baseUrl, token, query, source = 'dictamenes') {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/.netlify/functions/cgr-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-auth-token': token,
      },
      body: JSON.stringify({ query, source, count: 5 }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) return { results: [] };
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    console.warn('[analyze-external-case] CGR search error:', e.message);
    return { results: [] };
  }
}

// Search Biblioteca via Supabase RPC
async function searchBiblioteca(supabaseUrl, serviceKey, query) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/search_library`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ search_query: query, max_results: 5 }),
      signal: ac.signal,
    });
    clearTimeout(to);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    console.warn('[analyze-external-case] Biblioteca search error:', e.message);
    return [];
  }
}

/* ── Action: extract_facts ── */
async function handleExtractFacts(body, apiKey, model) {
  const { documentsContext, caseType, institution } = body;
  if (!documentsContext || documentsContext.length < 30) {
    return new Response(JSON.stringify({ error: 'documentsContext requerido (mín 30 caracteres)' }), { status: 400 });
  }

  const system = `Eres un experto jurídico chileno especializado en análisis de expedientes administrativos y laborales.
Tu tarea es extraer información estructurada de documentos de un caso.
Responde SIEMPRE en formato JSON válido, sin markdown ni bloques de código.
PROTECCIÓN DE DATOS: No incluyas nombres reales, RUT, correos ni teléfonos. Usa roles genéricos (ej: "denunciante", "funcionario investigado").`;

  const userPrompt = `Analiza los siguientes documentos de un caso ${caseType ? `de tipo "${caseType}"` : ''} ${institution ? `en la institución "${institution}"` : ''}.

DOCUMENTOS:
${documentsContext.substring(0, MAX_DOC_CHARS)}

Extrae la siguiente información en formato JSON con esta estructura exacta:
{
  "facts": [
    {"fact": "descripción del hecho", "relevance": "alta|media|baja", "source": "fuente del documento"}
  ],
  "chronology": [
    {"date": "fecha o período", "event": "descripción del evento"}
  ],
  "participants": [
    {"name": "rol genérico (NO nombre real)", "role": "rol procesal", "estamento": "estamento si aplica"}
  ],
  "mentioned_norms": ["Ley X art. Y", "DFL Z", ...]
}

REGLAS:
- Identifica TODOS los hechos relevantes, ordenados por importancia
- La cronología debe estar en orden temporal
- Clasifica relevancia como "alta" (hechos centrales), "media" (contexto importante) o "baja" (contexto secundario)
- Para participantes, usa roles genéricos en vez de nombres reales
- Incluye TODAS las normas mencionadas o aplicables`;

  const text = await callClaude(apiKey, model, system, userPrompt, 4096);

  // Parse JSON from response
  let parsed;
  try {
    // Try direct parse first
    parsed = JSON.parse(text);
  } catch {
    // Try extracting JSON from text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]); } catch { parsed = {}; }
    } else {
      parsed = {};
    }
  }

  return {
    facts: parsed.facts || [],
    chronology: parsed.chronology || [],
    participants: parsed.participants || [],
    mentioned_norms: parsed.mentioned_norms || [],
  };
}

/* ── Action: search_library ── */
async function handleSearchLibrary(body, token, siteUrl) {
  const { topic, caseType, institution, analysisMode, selectedBaseCollections, extractedFacts, sources } = body;
  if (!topic || topic.length < 3) {
    return { error: 'topic requerido (mín 3 caracteres)' };
  }

  // Build search query
  const searchQuery = topic.substring(0, 500);

  // Determine which sources to search (default: all)
  const enabledSources = sources || { qdrant: true, pjud: true, cgr: true, biblioteca: true };

  // Determine courts based on case type
  const pjudCourt = (analysisMode === 'laboral') ? 'Laborales' : 'Corte_Suprema';

  // Parallel searches
  const searches = [];

  if (enabledSources.qdrant !== false) {
    const collections = selectedBaseCollections || ['jurisprudencia', 'doctrina', 'normativa'];
    searches.push(
      searchQdrant(siteUrl, token, searchQuery, collections)
        .then(r => ({ type: 'qdrant', data: r }))
    );
  } else {
    searches.push(Promise.resolve({ type: 'qdrant', data: { results: [] } }));
  }

  if (enabledSources.pjud !== false) {
    searches.push(
      searchPJUD(siteUrl, token, searchQuery, pjudCourt)
        .then(r => ({ type: 'pjud', data: r }))
    );
  } else {
    searches.push(Promise.resolve({ type: 'pjud', data: { results: [] } }));
  }

  if (enabledSources.cgr !== false) {
    searches.push(
      searchCGR(siteUrl, token, searchQuery, 'dictamenes')
        .then(r => ({ type: 'cgr', data: r }))
    );
  } else {
    searches.push(Promise.resolve({ type: 'cgr', data: { results: [] } }));
  }

  if (enabledSources.biblioteca !== false) {
    const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
    const sbKey = Netlify.env.get('SUPABASE_SERVICE_ROLE_KEY') || Netlify.env.get('SUPABASE_ANON_KEY');
    if (sbUrl && sbKey) {
      searches.push(
        searchBiblioteca(sbUrl, sbKey, searchQuery)
          .then(r => ({ type: 'biblioteca', data: r }))
      );
    } else {
      searches.push(Promise.resolve({ type: 'biblioteca', data: [] }));
    }
  } else {
    searches.push(Promise.resolve({ type: 'biblioteca', data: [] }));
  }

  const results = await Promise.all(searches);

  // Format results into categories
  let jurisprudencia = '';
  let doctrina = '';
  let normativa = '';
  let custom_collections = '';
  let pjud_results = '';
  let cgr_results = '';

  // Process Qdrant results
  const qdrantResult = results.find(r => r.type === 'qdrant');
  if (qdrantResult?.data?.results?.length) {
    const qdrantItems = qdrantResult.data.results;
    // Separate by collection
    const jurisItems = qdrantItems.filter(r =>
      ['relevant_jurisprudence', 'rulings'].includes(r.collection)
    );
    const docItems = qdrantItems.filter(r =>
      ['administrative_discipline', 'reference_books', 'specific_topics'].includes(r.collection)
    );
    const normItems = qdrantItems.filter(r =>
      ['current_regulations'].includes(r.collection)
    );
    const otherItems = qdrantItems.filter(r =>
      !['relevant_jurisprudence', 'rulings', 'administrative_discipline', 'reference_books', 'specific_topics', 'current_regulations'].includes(r.collection)
    );

    if (jurisItems.length) {
      jurisprudencia = jurisItems.map(r => `[Qdrant/${r.collection}] (score: ${r.score?.toFixed(3)})\n${r.text?.substring(0, 2000)}`).join('\n\n---\n\n');
    }
    if (docItems.length) {
      doctrina = docItems.map(r => `[Qdrant/${r.collection}] (score: ${r.score?.toFixed(3)})\n${r.text?.substring(0, 2000)}`).join('\n\n---\n\n');
    }
    if (normItems.length) {
      normativa = normItems.map(r => `[Qdrant/${r.collection}] (score: ${r.score?.toFixed(3)})\n${r.text?.substring(0, 2000)}`).join('\n\n---\n\n');
    }
    if (otherItems.length) {
      custom_collections = otherItems.map(r => `[Qdrant/${r.collection}] (score: ${r.score?.toFixed(3)})\n${r.text?.substring(0, 2000)}`).join('\n\n---\n\n');
    }
  }

  // Process PJUD results
  const pjudResult = results.find(r => r.type === 'pjud');
  if (pjudResult?.data?.results?.length) {
    pjud_results = pjudResult.data.results.map(r =>
      `[PJUD] Rol: ${r.rol || 'S/N'} | ${r.caratulado || ''}\nFecha: ${r.fecha || 'S/F'} | Sala: ${r.sala || ''} | Resultado: ${r.resultado || ''}\nTipo Recurso: ${r.tipoRecurso || ''}\n${r.fullText?.substring(0, 1500) || r.preview || ''}\nURL: ${r.url || ''}`
    ).join('\n\n---\n\n');
    // Append PJUD to jurisprudencia
    if (pjud_results) {
      jurisprudencia = jurisprudencia
        ? jurisprudencia + '\n\n═══ PODER JUDICIAL (PJUD) ═══\n\n' + pjud_results
        : '═══ PODER JUDICIAL (PJUD) ═══\n\n' + pjud_results;
    }
  }

  // Process CGR results
  const cgrResult = results.find(r => r.type === 'cgr');
  if (cgrResult?.data?.results?.length) {
    cgr_results = cgrResult.data.results.map(r =>
      `[CGR] Dictamen N° ${r.nDictamen || r.docId || 'S/N'} | Fecha: ${r.fecha || 'S/F'}\nMateria: ${r.materia || ''}\nDescriptores: ${r.descriptores || ''}\nFuentes Legales: ${r.fuentes || ''}\n${r.docCompleto?.substring(0, 1500) || r.criterio || ''}\nURL: ${r.url || ''}`
    ).join('\n\n---\n\n');
    // Append CGR to jurisprudencia
    if (cgr_results) {
      jurisprudencia = jurisprudencia
        ? jurisprudencia + '\n\n═══ CONTRALORÍA GENERAL (CGR) ═══\n\n' + cgr_results
        : '═══ CONTRALORÍA GENERAL (CGR) ═══\n\n' + cgr_results;
    }
  }

  // Process Biblioteca results
  const bibResult = results.find(r => r.type === 'biblioteca');
  if (Array.isArray(bibResult?.data) && bibResult.data.length) {
    const bibText = bibResult.data.map(r =>
      `[Biblioteca] ${r.title || r.nombre || ''}\n${(r.content || r.contenido || r.text || '').substring(0, 1500)}`
    ).join('\n\n---\n\n');
    if (bibText) {
      doctrina = doctrina
        ? doctrina + '\n\n═══ BIBLIOTECA INTERNA ═══\n\n' + bibText
        : '═══ BIBLIOTECA INTERNA ═══\n\n' + bibText;
    }
  }

  return { jurisprudencia, doctrina, normativa, custom_collections };
}

/* ── Action: generate_section (SSE streaming) ── */
async function handleGenerateSection(body, apiKey, model, cors) {
  const { section, sectionPrompt, documentsContext, caseType, institution, estamento, analysisMode, focusContext, additionalContext, previousSections } = body;

  const systemPrompts = {
    disciplinario: `Eres un asistente jurídico-administrativo experto en procedimientos disciplinarios y sancionatorios de la Administración Pública chilena.
Tu análisis debe ser técnico, preciso y fundamentado en la normativa aplicable.
Considera la jurisprudencia de la Contraloría General de la República.
Respeta el debido proceso y las garantías fundamentales.
Aplica perspectiva de género cuando sea pertinente.
PROTECCIÓN DE DATOS: No revelar nombres, RUT, correos, teléfonos. Usar roles genéricos.`,
    laboral: `Eres un abogado laboralista experto en derecho del trabajo chileno.
Tu análisis debe ser técnico, preciso y fundamentado en el Código del Trabajo y legislación laboral.
Cita artículos específicos del CT y leyes complementarias.
Considera jurisprudencia de JLT, Cortes de Apelaciones y Corte Suprema.
Aplica la prueba indiciaria del art. 493 CT cuando corresponda.
Considera la Ley Karin (Ley 21.643) cuando sea pertinente.
PROTECCIÓN DE DATOS: No revelar nombres, RUT, correos, teléfonos. Usar roles genéricos.`,
  };

  const system = systemPrompts[analysisMode] || systemPrompts.disciplinario;

  let userPrompt = sectionPrompt || `Genera la sección "${section}" del análisis.`;
  if (documentsContext) userPrompt += `\n\nDOCUMENTOS DEL EXPEDIENTE:\n${documentsContext.substring(0, 40000)}`;
  if (caseType) userPrompt += `\n\nTIPO DE CASO: ${caseType}`;
  if (institution) userPrompt += `\nINSTITUCIÓN: ${institution}`;
  if (estamento) userPrompt += `\nESTAMENTO: ${estamento}`;
  if (focusContext) userPrompt += `\n\n${focusContext}`;
  if (additionalContext) userPrompt += `\n\n${additionalContext}`;
  if (previousSections) userPrompt += `\n\nSECCIONES PREVIAS GENERADAS:\n${previousSections.substring(0, 30000)}`;

  // Stream response
  const res = await callClaudeStream(apiKey, model, system, userPrompt, 8192);

  // Transform Anthropic SSE into simplified SSE for frontend
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.substring(6);
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`));
              } else if (parsed.type === 'message_stop') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
            } catch { /* skip unparseable lines */ }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/* ── Main Handler ── */
export default async (req, context) => {
  const cors = _corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors });
  }

  // Auth check
  const token = req.headers.get('x-auth-token') || req.headers.get('authorization')?.replace('Bearer ', '') || '';
  if (!token) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: cors });
  }

  const apiKey = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500, headers: cors });
  }

  const model = Netlify.env.get('CLAUDE_MODEL_SONNET') || 'claude-sonnet-4-20250514';

  try {
    const body = await req.json();
    const { action } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'action requerido' }), { status: 400, headers: cors });
    }

    console.log(`[analyze-external-case] Action: ${action}`);

    switch (action) {
      case 'extract_facts': {
        const result = await handleExtractFacts(body, apiKey, model);
        if (result instanceof Response) return result; // Error response
        return new Response(JSON.stringify(result), { status: 200, headers: cors });
      }

      case 'search_library': {
        // Determine site URL for calling sibling functions
        const siteUrl = Netlify.env.get('URL') || Netlify.env.get('DEPLOY_URL') || 'https://fiscalito.netlify.app';
        const result = await handleSearchLibrary(body, token, siteUrl);
        return new Response(JSON.stringify(result), { status: 200, headers: cors });
      }

      case 'generate_section': {
        return await handleGenerateSection(body, apiKey, model, cors);
      }

      default:
        return new Response(JSON.stringify({ error: `Action no válida: ${action}` }), { status: 400, headers: cors });
    }

  } catch (err) {
    console.error('[analyze-external-case] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500, headers: cors });
  }
};
