/**
 * Netlify Function: cgr-search (ESM)
 * Searches CGR (Contraloría General de la República) Jurisprudencia
 *
 * API discovered (Elasticsearch backend):
 *   POST https://www.contraloria.cl/apibusca/count/dictamenes   → count by type
 *   POST https://www.contraloria.cl/apibusca/search/dictamenes  → search results
 *
 * No CSRF or cookies required — direct REST API.
 */
import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

const CGR_API = 'https://www.contraloria.cl/apibusca';

/* ── Source types available in CGR ── */
const CGR_SOURCES = {
  dictamenes:   'dictamenes',
  auditoria:    'auditoria',
  cuentas:      'cuentas',
  legislacion:  'legislacion',
  contable:     'contable',
  instructivos: 'instructivos',
};

/* ── Search CGR ── */
async function searchCGR(query, options = {}) {
  const {
    source = 'dictamenes',
    exactSearch = false,
    order = 'date',          // 'date' | 'score'
    page = 0,
    count = 10,
  } = options;

  const body = {
    search: query.trim(),
    exact_search: exactSearch,
    options: [],
    order: order,
    date_name: 'fecha_documento',
    source: source,
    page: page,
  };

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 20000);
  try {
    const resp = await fetch(`${CGR_API}/search/${source}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.contraloria.cl',
        'Referer': 'https://www.contraloria.cl/web/cgr/buscar-jurisprudencia',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(to);

    if (!resp.ok) throw new Error(`CGR API HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/* ── Parse Elasticsearch response ── */
function parseResults(esResponse, maxResults = 10) {
  const hits = esResponse?.hits?.hits || [];
  const totalCount = esResponse?.hits?.total?.value || 0;

  const results = hits.slice(0, maxResults).map(hit => {
    const src = hit._source || {};
    const score = hit._score || 0;

    // Clean text fields
    const clean = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    const nDictamen = src.n_dictamen || '';
    const docId = src.doc_id || '';
    const fecha = src.fecha_documento || '';
    const fechaFormatted = fecha ? new Date(fecha).toLocaleDateString('es-CL', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }) : '';
    const materia = clean(src.materia || '');
    const descriptores = clean(src.descriptores || '');
    const fuentes = clean(src.fuentes_legales || '');
    const origen = clean(src.origen_ || '');
    const destinatarios = clean(src.destinatarios || '');
    const criterio = clean(src.criterio || '');
    const tipo = src._tipo || 'dictamenes';

    // Full document text
    let docCompleto = clean(src.documento_completo || '');
    // Limit to 3000 chars for transport
    if (docCompleto.length > 3000) {
      docCompleto = docCompleto.substring(0, 3000) + '…';
    }

    // Build CGR URL
    const url = docId
      ? `https://www.contraloria.cl/web/cgr/buscar-jurisprudencia?query=${encodeURIComponent(docId)}`
      : '';

    return {
      nDictamen,
      docId,
      fecha: fechaFormatted,
      fechaISO: fecha,
      materia,
      descriptores,
      fuentes,
      origen,
      destinatarios,
      criterio,
      tipo,
      score,
      docCompleto,
      url,
    };
  });

  return { totalCount, results };
}

/* ── Handler ── */
export default async (req, context) => {
  const cors = _corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: cors,
    });
  }

  try {
    const body = await req.json();
    const {
      query,
      source = 'dictamenes',
      exactSearch = false,
      order = 'date',
      page = 0,
      count = 10,
    } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query is required (min 2 chars)' }), {
        status: 400, headers: cors,
      });
    }

    // Validate source
    const validSource = CGR_SOURCES[source] || 'dictamenes';

    console.log(`[cgr-search] Searching: "${query}" in ${validSource} (page ${page})`);

    const esResponse = await searchCGR(query, {
      source: validSource,
      exactSearch,
      order,
      page,
      count,
    });

    const { totalCount, results } = parseResults(esResponse, Math.min(count, 20));
    console.log(`[cgr-search] Found ${totalCount} total, parsed ${results.length} results`);

    return new Response(JSON.stringify({
      totalCount,
      count: results.length,
      source: validSource,
      query,
      results,
    }), {
      status: 200, headers: cors,
    });

  } catch (err) {
    console.error('[cgr-search] Error:', err);
    return new Response(JSON.stringify({
      error: err.message || 'Internal error',
      totalCount: 0,
      count: 0,
      results: [],
    }), {
      status: 500, headers: cors,
    });
  }
};
