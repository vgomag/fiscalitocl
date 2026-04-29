/**
 * MOD-DRIVE-RAG.JS — Retrieval Augmented Generation para Fiscalito
 * ────────────────────────────────────────────────────────────────
 * Conecta los documentos del expediente (diligencias + Drive) con
 * TODAS las funciones del chat. Busca contenido relevante según la
 * pregunta del usuario y lo inyecta como contexto adicional.
 *
 * Flujo: Usuario pregunta → RAG busca en diligencias → inyecta
 *        los fragmentos más relevantes → Claude responde con datos reales
 */

/* ═══ CONFIGURACIÓN ═══ */
const RAG_CONFIG = {
  maxResults: 8,           // Máx fragmentos a incluir
  maxCharsPerResult: 2000, // Chars por fragmento
  maxTotalChars: 12000,    // Total chars de contexto RAG
  minScore: 1,             // Score mínimo para incluir
  boostTypes: {            // Bonus por tipo de diligencia (relevancia inherente)
    denuncia: 3,
    declaracion_denunciante: 3,
    declaracion_denunciado: 3,
    declaracion_testigo: 2,
    cargos: 3,
    descargos: 3,
    vista_fiscal: 3,
    informe: 2,
    resolucion_inicio: 2,
    oficio: 1,
    acta: 1,
    notificacion: 0,
    prueba_documental: 2,
  },
};

/* ═══ EXTRAER KEYWORDS DE LA PREGUNTA ═══ */
function extractKeywords(query) {
  /* Remover stopwords español */
  const stopwords = new Set([
    'el','la','los','las','un','una','unos','unas','de','del','al','a','en','por','para',
    'con','sin','sobre','entre','que','cual','como','donde','cuando','se','su','sus','este',
    'esta','estos','estas','ese','esa','esos','esas','me','te','nos','les','lo','le','mi',
    'tu','yo','es','son','fue','ser','hay','ha','han','no','si','ya','más','muy','tan',
    'también','pero','porque','como','desde','hasta','según','cada','toda','todo','todos',
    'puede','debe','hacer','hecho','tiene','sido','está','están','era','fueron','había',
    'siendo','aquí','ahí','allí','así','entonces','además','sin embargo','respecto',
    'señalar','indica','indica','indicar','mencionar','menciona','dice','dijo',
  ]);

  const words = query
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') /* Remove accents for matching */
    .replace(/[^\w\sáéíóúñ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  /* Add bigrams for compound terms */
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(words[i] + ' ' + words[i + 1]);
  }

  return { words: [...new Set(words)], bigrams };
}

/* ═══ CALCULAR RELEVANCIA ═══ */
function scoreDocument(doc, keywords) {
  const text = ((doc.ai_summary || '') + ' ' + (doc.extracted_text || '') + ' ' + (doc.diligencia_label || ''))
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let score = 0;

  /* Word matches */
  keywords.words.forEach(w => {
    /* Escape regex metacharacters from user input to prevent SyntaxError / ReDoS */
    const safeW = String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safeW) return;
    const regex = new RegExp(safeW, 'gi');
    const matches = (text.match(regex) || []).length;
    if (matches > 0) score += Math.min(matches, 5); /* Cap at 5 per word */
  });

  /* Bigram matches (worth more) */
  keywords.bigrams.forEach(bg => {
    if (text.includes(bg)) score += 3;
  });

  /* Type boost */
  const typeBoost = RAG_CONFIG.boostTypes[doc.diligencia_type] || 0;
  score += typeBoost;

  /* Bonus for having fojas (more useful for citations) */
  if (doc.fojas_inicio) score += 1;

  /* Bonus for longer/richer content */
  if ((doc.extracted_text || '').length > 500) score += 1;
  if ((doc.ai_summary || '').length > 200) score += 1;

  return score;
}

/* ═══ BUSCAR EN DILIGENCIAS ═══ */
async function searchDiligenciasRAG(query, caseId) {
  if (!query || !caseId || !session) return [];

  const { data: dils, error } = await sb.from('diligencias')
    .select('id,diligencia_type,diligencia_label,file_name,fecha_diligencia,fojas_inicio,fojas_fin,ai_summary,extracted_text')
    .eq('case_id', caseId)
    .eq('is_processed', true);

  if (error) {
    console.error('searchDiligenciasRAG error:', error);
    return [];
  }
  if (!dils?.length) return [];

  const keywords = extractKeywords(query);
  if (!keywords.words.length) return [];

  /* Score and rank */
  const scored = dils
    .map(d => ({ ...d, score: scoreDocument(d, keywords) }))
    .filter(d => d.score >= RAG_CONFIG.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, RAG_CONFIG.maxResults);

  return scored;
}

/* ═══ CONSTRUIR CONTEXTO RAG ═══ */
async function buildRAGContext(query, caseId) {
  const results = await searchDiligenciasRAG(query, caseId);
  if (!results.length) return '';

  let totalChars = 0;
  const entries = [];

  results.forEach((d, i) => {
    if (totalChars >= RAG_CONFIG.maxTotalChars) return;

    const fojas = d.fojas_inicio
      ? (d.fojas_fin ? `fojas ${d.fojas_inicio}-${d.fojas_fin}` : `foja ${d.fojas_inicio}`)
      : '';

    /* Prefer extracted_text over summary for RAG (more detail) */
    const content = (d.extracted_text || d.ai_summary || '').substring(0, RAG_CONFIG.maxCharsPerResult);
    totalChars += content.length;

    entries.push(
      `[${i + 1}] ${d.diligencia_label || d.diligencia_type || 'Documento'} ` +
      `(${d.diligencia_type || 'otro'})` +
      `${d.fecha_diligencia ? ' — ' + d.fecha_diligencia : ''}` +
      `${fojas ? ' [' + fojas + ']' : ''}` +
      ` (relevancia: ${d.score})\n${content}`
    );
  });

  return `\n\n## DOCUMENTOS RELEVANTES DEL EXPEDIENTE (búsqueda automática)
Los siguientes ${entries.length} documentos del expediente fueron seleccionados automáticamente por su relevancia a la consulta del usuario.
USA esta información como fuente principal de hechos. CITA las fojas cuando estén disponibles.

${entries.join('\n\n---\n\n')}

INSTRUCCIÓN: Basa tu respuesta en los documentos anteriores. Cita fojas cuando las haya. Si la información no está en estos documentos ni en el contexto del caso, indica [NO CONSTA EN EL EXPEDIENTE].`;
}

/* ═══ BUSCAR EN DRIVE (fallback para docs no indexados) ═══ */
async function searchDriveForContext(query, caseObj) {
  if (!caseObj?.drive_folder_url) return '';

  const folderId = caseObj.drive_folder_url.match(/folders\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!folderId) return '';

  try {
    const _fetchFn = typeof authFetch === 'function' ? authFetch : fetch;
    const r = await _fetchFn('/.netlify/functions/drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', folderId })
    });
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) return '';
    if (!r.ok) return '';

    const data = await r.json();
    if (!data.files?.length) return '';

    /* Check which files are NOT yet in diligencias */
    const { data: existingDils } = await sb.from('diligencias')
      .select('drive_file_id')
      .eq('case_id', caseObj.id);
    const indexedIds = new Set((existingDils || []).map(d => d.drive_file_id));

    const unindexed = data.files.filter(f => !indexedIds.has(f.id));

    if (unindexed.length > 0) {
      return `\n\n## ARCHIVOS EN DRIVE SIN PROCESAR (${unindexed.length})
Los siguientes archivos están en la carpeta Drive pero NO han sido procesados como diligencias:
${unindexed.map(f => `- ${f.name} (${f.mimeType || '?'})`).join('\n')}

SUGERENCIA: Para acceder a su contenido, el usuario debe ir a la pestaña Diligencias e importar/procesar estos archivos.`;
    }
  } catch (e) {
    console.warn('searchDriveForContext:', e);
  }

  return '';
}

/* ═══ INTEGRACIÓN PRINCIPAL — llamada desde sendMessage ═══ */
async function getRAGContext(userMessage, caseId, caseObj) {
  if (!userMessage || !caseId) return '';

  try {
    /* 1. Buscar en diligencias procesadas */
    const ragContext = await buildRAGContext(userMessage, caseId);

    /* 2. Si no hay resultados RAG, informar sobre archivos sin procesar en Drive */
    let driveContext = '';
    if (!ragContext && caseObj?.drive_folder_url) {
      driveContext = await searchDriveForContext(userMessage, caseObj);
    }

    return ragContext + driveContext;

  } catch (e) {
    console.warn('getRAGContext error:', e);
    return '';
  }
}

/* ═══ UTILIDAD: Verificar estado de indexación del caso ═══ */
async function checkCaseIndexStatus(caseId) {
  if (!caseId || !session) return null;

  const { data: dils } = await sb.from('diligencias')
    .select('id,is_processed,processing_status,extracted_text')
    .eq('case_id', caseId);

  const total = dils?.length || 0;
  const processed = dils?.filter(d => d.is_processed)?.length || 0;
  const withText = dils?.filter(d => d.extracted_text?.length > 50)?.length || 0;
  const errors = dils?.filter(d => d.processing_status === 'error')?.length || 0;

  return { total, processed, withText, errors, pct: total > 0 ? Math.round(processed / total * 100) : 0 };
}

console.log('%c🔍 Módulo Drive RAG cargado — búsqueda inteligente en expediente', 'color:#4f46e5;font-weight:bold');
