/**
 * Netlify Function: pjud-search (ESM)
 * Searches PJUD (Poder Judicial) Buscador Unificado de Fallos
 *
 * Endpoints discovered:
 *   POST https://juris.pjud.cl/busqueda/buscar_sentencias
 *   POST https://juris.pjud.cl/busqueda/busqueda_por_texto_autocompletable
 *
 * Flow: 1) GET search page to obtain CSRF token + cookies
 *       2) POST FormData to buscar_sentencias
 *       3) Parse HTML response → JSON results
 */
import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

/* ── Buscador IDs per court type ── */
const BUSCADOR_IDS = {
  'Corte_Suprema':       '528',
  'Corte_de_Apelaciones':'168',
  'Laborales':           '265',
  'Cobranza':            '379',
  'Penales':             '313',
  'Familia':             '346',
  'Civiles':             '424',
};

const PJUD_BASE = 'https://juris.pjud.cl';

/* ── Step 1: Get CSRF token + session cookies ── */
async function getSession(court = 'Corte_Suprema') {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 15000);
  try {
    const url = `${PJUD_BASE}/busqueda?${court}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    clearTimeout(to);

    if (!resp.ok) throw new Error(`PJUD page HTTP ${resp.status}`);

    const html = await resp.text();

    // Extract CSRF token
    const tokenMatch = html.match(/name="_token"\s+(?:type="hidden"\s+)?value="([^"]+)"/);
    if (!tokenMatch) {
      // Try alternative pattern
      const altMatch = html.match(/value="([^"]+)"\s*(?:>|\/?>)\s*(?:<!--.*?-->)?\s*(?:<input)?/);
      // Fallback: look for meta csrf
      const metaMatch = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
      const token = tokenMatch?.[1] || metaMatch?.[1] || null;
      if (!token) throw new Error('Could not extract CSRF token from PJUD');
    }
    const token = tokenMatch[1];

    // Extract id_buscador from inline scripts
    let idBuscador = BUSCADOR_IDS[court] || '528';
    const idMatch = html.match(/"id_buscador"\s*:\s*"(\d+)"/);
    if (idMatch) idBuscador = idMatch[1];

    // Extract cookies from response
    const setCookies = resp.headers.getSetCookie?.() || [];
    const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');

    return { token, idBuscador, cookies: cookieStr };
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/* ── Step 2: Search sentencias ── */
async function searchPJUD(session, query, options = {}) {
  const {
    count = 10,
    offset = 0,
    orden = 'recientes',
    court = 'Corte_Suprema',
  } = options;

  // Build filtros JSON — words joined with " + " for "todas" (match all)
  const keywords = query.trim().split(/\s+/).join(' + ');
  const filtros = JSON.stringify({
    rol: '',
    era: '',
    fec_desde: '',
    fec_hasta: '',
    tipo_norma: '',
    num_norma: '',
    num_art: '',
    num_inciso: '',
    todas: keywords,
    algunas: '',
    excluir: '',
    literal: '',
    proximidad: '',
    distancia_proximidad: '',
    descriptores: [],
    materias: [],
    facetas: [],
  });

  // Build FormData string (multipart/form-data)
  const boundary = '----FiscalitoPJUD' + Date.now();
  const parts = [
    ['_token', session.token],
    ['id_buscador', session.idBuscador],
    ['filtros', filtros],
    ['numero_filas_paginacion', String(count)],
    ['offset_paginacion', String(offset)],
    ['orden', orden],
    ['personalizacion', 'false'],
  ];

  let body = '';
  for (const [name, value] of parts) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 20000);
  try {
    const resp = await fetch(`${PJUD_BASE}/busqueda/buscar_sentencias`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Cookie': session.cookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${PJUD_BASE}/busqueda?${court}`,
        'Origin': PJUD_BASE,
      },
      body,
      signal: ac.signal,
    });
    clearTimeout(to);

    if (!resp.ok) throw new Error(`PJUD search HTTP ${resp.status}`);

    return await resp.text();
  } catch (err) {
    clearTimeout(to);
    throw err;
  }
}

/* ── Step 3: Parse HTML results ── */
function parseResults(html) {
  const results = [];

  // Extract total count
  let totalCount = 0;
  const countMatch = html.match(/encontrado\s+([\d.]+)\s+resultado/i);
  if (countMatch) {
    totalCount = parseInt(countMatch[1].replace(/\./g, ''), 10);
  }

  // Parse card blocks — each result card has .estilo_resultado_titulo and .estilo_resultado_subtitulo
  // Split by card-header pattern
  const cardPattern = /<div[^>]*class="card-header"[^>]*>([\s\S]*?)(?=<div[^>]*class="card-header"|$)/gi;
  let match;

  while ((match = cardPattern.exec(html)) !== null) {
    const block = match[1];

    // Extract titles (Rol and Caratulado)
    const titles = [];
    const titlePattern = /<span[^>]*class="estilo_resultado_titulo"[^>]*>([\s\S]*?)<\/span>/gi;
    let tMatch;
    while ((tMatch = titlePattern.exec(block)) !== null) {
      titles.push(tMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // Extract subtitles (Fecha, Sala, Resultado, Tipo recurso)
    const subtitles = [];
    const subPattern = /<span[^>]*class="estilo_resultado_subtitulo"[^>]*>([\s\S]*?)<\/span>/gi;
    let sMatch;
    while ((sMatch = subPattern.exec(block)) !== null) {
      subtitles.push(sMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    // Extract text preview
    let preview = '';
    const prevMatch = block.match(/<div[^>]*class="texto-preview"[^>]*>([\s\S]*?)<\/div>/i);
    if (prevMatch) {
      preview = prevMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Extract full text (if present)
    let fullText = '';
    const fullMatch = block.match(/<div[^>]*class="texto-completo"[^>]*>([\s\S]*?)<\/div>/i);
    if (fullMatch) {
      fullText = fullMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    // Parse individual fields
    const rol = titles.find(t => t.startsWith('Rol:'))?.replace('Rol:', '').trim() || '';
    const caratulado = titles.find(t => t.startsWith('Caratulado:'))?.replace('Caratulado:', '').trim() || '';
    const fecha = subtitles.find(t => t.startsWith('Fecha sentencia:'))?.replace('Fecha sentencia:', '').trim() || '';
    const sala = subtitles.find(t => t.startsWith('Sala:'))?.replace('Sala:', '').trim() || '';
    const resultado = subtitles.find(t => t.startsWith('Resultado recurso:'))?.replace('Resultado recurso:', '').trim() || '';
    const tipoRecurso = subtitles.find(t => t.startsWith('Tipo recurso:'))?.replace('Tipo recurso:', '').trim() || '';

    if (rol || caratulado || preview) {
      results.push({
        rol,
        caratulado,
        fecha,
        sala,
        resultado,
        tipoRecurso,
        preview: preview.substring(0, 800),
        fullText: (fullText || preview).substring(0, 2000),
        url: rol ? `${PJUD_BASE}/busqueda/pagina_detalle_sentencia?rol=${encodeURIComponent(rol)}` : '',
      });
    }
  }

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
    const { query, court = 'Corte_Suprema', count = 10, offset = 0 } = body;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'Query is required (min 2 chars)' }), {
        status: 400, headers: cors,
      });
    }

    // Validate court
    const validCourts = Object.keys(BUSCADOR_IDS);
    const courtKey = validCourts.includes(court) ? court : 'Corte_Suprema';

    // Step 1: Get session (CSRF token + cookies)
    console.log(`[pjud-search] Getting session for ${courtKey}...`);
    const session = await getSession(courtKey);

    // Step 2: Search
    console.log(`[pjud-search] Searching: "${query}" in ${courtKey}`);
    const html = await searchPJUD(session, query, {
      count: Math.min(count, 20),
      offset,
      court: courtKey,
    });

    // Step 3: Parse results
    const { totalCount, results } = parseResults(html);
    console.log(`[pjud-search] Found ${totalCount} total, parsed ${results.length} results`);

    return new Response(JSON.stringify({
      totalCount,
      count: results.length,
      court: courtKey,
      query,
      results,
    }), {
      status: 200, headers: cors,
    });

  } catch (err) {
    console.error('[pjud-search] Error:', err);
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
