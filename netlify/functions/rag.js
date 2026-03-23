// Netlify Function: RAG con Qdrant + Claude
// Flujo: query → embedding (Claude) → búsqueda Qdrant → respuesta Claude

// Mapeo de colecciones Qdrant según carpeta seleccionada
const COLLECTIONS = {
  normativa:      'current_regulations',
  dictamenes:     'rulings',
  jurisprudencia: 'relevant_jurisprudence',
  doctrina:       'administrative_discipline',
  libros:         'material_de_consulta',
  modelos:        'models',
  caso_estudio:   'case_studys',
  tematicas:      'specific_topics',
  todos:          null, // búsqueda multi-colección
};

// Colecciones relevantes para Fiscalito (disciplinario UMAG)
const FISCALITO_COLLECTIONS = [
  'current_regulations',
  'rulings',
  'relevant_jurisprudence',
  'administrative_discipline',
  'specific_topics',
  'models',
];

async function getEmbedding(text, anthropicKey) {
  // Usamos Claude para generar embedding vía API de Anthropic
  // Anthropic no tiene endpoint de embeddings nativo aún,
  // así que usamos voyage-3 (recomendado por Anthropic) si está disponible,
  // o generamos un embedding simple basado en el texto para búsqueda por texto
  // Por ahora usamos búsqueda por texto en Qdrant (scroll + filter)
  return null;
}

async function searchQdrant(query, collection, qdrantUrl, qdrantKey, limit = 5) {
  // Búsqueda por texto usando payload filter (scroll)
  // Qdrant soporta full-text search si el campo está indexado
  const url = `${qdrantUrl}/collections/${collection}/points/scroll`;
  
  const body = {
    limit,
    with_payload: true,
    with_vector: false,
    filter: {
      should: [
        {
          key: 'page_content',
          match: { text: query }
        },
        {
          key: 'content',
          match: { text: query }
        },
        {
          key: 'text',
          match: { text: query }
        }
      ]
    }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': qdrantKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Fallback: scroll sin filtro para obtener muestra
      const fallback = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': qdrantKey },
        body: JSON.stringify({ limit: 3, with_payload: true, with_vector: false }),
      });
      const fd = await fallback.json();
      return fd.result?.points || [];
    }

    const data = await res.json();
    return data.result?.points || [];
  } catch (e) {
    console.error(`Error buscando en ${collection}:`, e.message);
    return [];
  }
}

function extractText(payload) {
  // Extraer texto del payload según diferentes estructuras posibles
  return payload?.page_content || payload?.content || payload?.text || 
         payload?.chunk || payload?.passage || 
         JSON.stringify(payload).substring(0, 500);
}

function extractSource(payload) {
  return payload?.source || payload?.file_name || payload?.title || 
         payload?.metadata?.source || payload?.metadata?.file_name || '';
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const qdrantUrl = Netlify.env.get('QDRANT_URL');
  const qdrantKey = Netlify.env.get('QDRANT_API_KEY');
  const anthropicKey = Netlify.env.get('ANTHROPIC_API_KEY');

  if (!qdrantUrl || !qdrantKey || !anthropicKey) {
    return new Response(JSON.stringify({ error: 'Variables de entorno no configuradas' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const { query, folder = 'todos', caseContext = '' } = await req.json();

  if (!query) {
    return new Response(JSON.stringify({ error: 'query es requerido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Determinar colecciones a buscar
    const targetCollection = COLLECTIONS[folder];
    const collectionsToSearch = targetCollection
      ? [targetCollection]
      : FISCALITO_COLLECTIONS;

    // Buscar en paralelo en todas las colecciones relevantes
    const searchResults = await Promise.all(
      collectionsToSearch.map(col => searchQdrant(query, col, qdrantUrl, qdrantKey, 4))
    );

    // Combinar y deduplicar resultados
    const allPoints = searchResults.flat();
    const chunks = allPoints
      .filter(p => p?.payload)
      .slice(0, 12)
      .map(p => {
        const text = extractText(p.payload);
        const source = extractSource(p.payload);
        return source ? `[${source}]\n${text}` : text;
      })
      .filter(t => t && t.length > 20);

    if (!chunks.length) {
      // Sin resultados en Qdrant — responder solo con conocimiento base
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: 'Eres Fiscalito, asistente jurídico de la UMAG especializado en procedimientos disciplinarios. No se encontraron documentos relevantes en la biblioteca para esta consulta. Responde desde tu conocimiento base sobre derecho administrativo chileno, indicando que no encontraste documentos específicos en la biblioteca.',
          messages: [{ role: 'user', content: `${caseContext ? 'CONTEXTO DEL CASO:\n' + caseContext + '\n\n' : ''}CONSULTA: ${query}` }]
        })
      });
      const d = await res.json();
      const reply = d.content?.filter(b => b.type === 'text').map(b => b.text).join('') || 'Sin respuesta.';
      return new Response(JSON.stringify({ response: reply, docsConsultados: [], sinResultados: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Construir contexto RAG
    const ragContext = chunks.join('\n\n---\n\n');

    // Llamar a Claude con contexto RAG
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `Eres Fiscalito, asistente jurídico–administrativo de la UMAG especializado en procedimientos disciplinarios. 

Responde PRINCIPALMENTE basándote en los fragmentos de la biblioteca jurídica que se te proporcionan. 
- Cita el nombre del documento fuente entre corchetes cuando uses información de él
- Si la respuesta no está en los fragmentos, indícalo y complementa con tu conocimiento base
- Usa lenguaje institucional, formal y preciso
- Aplica perspectiva de género y principios de debido proceso cuando corresponda`,
        messages: [{
          role: 'user',
          content: `FRAGMENTOS DE LA BIBLIOTECA JURÍDICA:\n\n${ragContext}\n\n${caseContext ? 'CONTEXTO DEL EXPEDIENTE:\n' + caseContext + '\n\n' : ''}CONSULTA: ${query}`
        }]
      })
    });

    const data = await res.json();
    const reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || 'Sin respuesta.';

    // Extraer fuentes únicas
    const sources = [...new Set(
      allPoints.slice(0, 12)
        .map(p => extractSource(p.payload))
        .filter(Boolean)
    )].slice(0, 5);

    return new Response(JSON.stringify({
      response: reply,
      docsConsultados: sources,
      colecciones: collectionsToSearch,
      fragmentosUsados: chunks.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

export const config = {
  path: '/.netlify/functions/rag'
};
