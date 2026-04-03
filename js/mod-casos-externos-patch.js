/**
 * MOD-CASOS-EXTERNOS-PATCH.JS — Inyecta fuentes de datos al módulo Casos Externos
 * Intercepta llamadas API y agrega: Biblioteca Supabase + Qdrant + Normas BCN
 */
(function(){
  'use strict';

  async function _ceSearchLibrary(query) {
    if (!sb || !session) return '';
    try {
      const { data, error } = await sb.rpc('search_library', {
        search_query: (query || '').substring(0, 200),
        max_results: 3,
        max_chars_per_result: 1200
      });
      if (error) { console.warn('CE-patch library RPC error:', error); return ''; }
      if (!data || !data.length) return '';
      let ctx = '\n\n## BIBLIOTECA DE REFERENCIA (Libros y Normativa Interna)\n';
      data.forEach(r => {
        ctx += '\n### [' + (r.source_table === 'reference_books' ? 'Libro' : 'Normativa') + '] ' + r.doc_name + '\n' + (r.snippet || '').substring(0, 1200);
      });
      return ctx + '\n--- FIN BIBLIOTECA ---\n';
    } catch (e) { console.warn('CE-patch library:', e.message); return ''; }
  }

  async function _ceSearchQdrant(query, caseType) {
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function(){ ctrl.abort(); }, 6000);
      var fn = typeof authFetch_original === 'function' ? authFetch_original : fetch;
      var r = await fn('/.netlify/functions/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, folder: 'todos', caseContext: caseType || '' }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!r.ok) return '';
      var d = await r.json();
      var text = d.context || d.text || '';
      if (text.length < 50) return '';
      var ctx = '\n\n## BIBLIOTECA JURIDICA (Libros de Derecho, Dictamenes CGR, Jurisprudencia)\n';
      ctx += text.substring(0, 8000);
      if (d.sources && d.sources.length) ctx += '\n\nFuentes: ' + d.sources.join(', ');
      return ctx + '\n--- FIN QDRANT ---\n';
    } catch (e) {
      if (e.name === 'AbortError') console.warn('CE-patch Qdrant timeout (6s)');
      else console.warn('CE-patch Qdrant:', e.message);
      return '';
    }
  }

  async function _ceGetNormasBCN() {
    if (!sb) return '';
    try {
      var res = await sb.from('normas_custom').select('label,url_bcn').order('label');
      var data = res.data;
      if (!data || !data.length) return '';
      var ctx = '\n\n## NORMAS CON ENLACES LEY CHILE (BCN)\nSIEMPRE incluye el enlace BCN al citar estas normas.\n';
      data.forEach(function(n) { ctx += '\n- ' + n.label + (n.url_bcn ? ' -> ' + n.url_bcn : ''); });
      return ctx + '\n';
    } catch (e) { return ''; }
  }

  function installCEPatch() {
    if (typeof authFetch !== 'function') {
      setTimeout(installCEPatch, 2000);
      return;
    }

    if (!window.authFetch_original) {
      window.authFetch_original = authFetch;
    }
    var origFetch = window.authFetch_original;

    window.authFetch = async function(url, options) {
      var chatUrl = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
      var isChatPost = options && options.method === 'POST' && (url === chatUrl || url === '/.netlify/functions/chat');
      var isCE = typeof ce !== 'undefined' && ce._active === true;

      if (!isChatPost || !isCE) {
        return origFetch.apply(this, arguments);
      }

      try {
        var body = JSON.parse(options.body);
        var systemPrompt = body.system || '';
        var msgs = body.messages || [];
        var lastUserMsg = null;
        for (var i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') { lastUserMsg = msgs[i]; break; }
        }
        var query = '';
        if (lastUserMsg && typeof lastUserMsg.content === 'string') {
          query = lastUserMsg.content.substring(0, 300);
        } else if (typeof ce !== 'undefined') {
          query = ((ce.focus_free || '') + ' ' + (ce.extracted_facts || '')).substring(0, 300);
        }
        var caseType = typeof ce !== 'undefined' ? ((ce.case_type || '') + ' ' + (ce.mode || '')) : '';

        var results = await Promise.all([
          _ceSearchLibrary(query),
          _ceSearchQdrant(query, caseType),
          _ceGetNormasBCN()
        ]);

        var extraCtx = results[0] + results[1] + results[2];

        if (extraCtx.length > 50) {
          body.system = systemPrompt + '\n\n' + extraCtx;
          options = Object.assign({}, options, { body: JSON.stringify(body) });
          console.log('CE-patch: +' + extraCtx.length + ' chars inyectados (lib:' + results[0].length + ' qdrant:' + results[1].length + ' bcn:' + results[2].length + ')');
        }
      } catch (e) {
        console.warn('CE-patch parse error:', e.message);
      }

      return origFetch.call(this, url, options);
    };

    if (typeof CE_SYS !== 'undefined') {
      var addon = '\n\nFUENTES ADICIONALES DISPONIBLES:\nEl sistema te proporcionara automaticamente fragmentos de:\n- BIBLIOTECA DE REFERENCIA: 40 libros de derecho administrativo + 7 normativas internas UMAG\n- BIBLIOTECA JURIDICA QDRANT: Dictamenes CGR reales, jurisprudencia, doctrina indexada\n- NORMAS CON ENLACES LEY CHILE: 17 cuerpos normativos con enlaces BCN\n\nCuando recibas estos fragmentos:\n1. CITA los libros como fundamento doctrinario\n2. USA los dictamenes CGR como respaldo\n3. INCLUYE los enlaces BCN al citar leyes\n4. PRIORIZA estas fuentes reales sobre tu conocimiento general';

      if (CE_SYS.disciplinario && CE_SYS.disciplinario.indexOf('QDRANT') === -1) {
        CE_SYS.disciplinario += addon;
      }
      if (CE_SYS.laboral && CE_SYS.laboral.indexOf('QDRANT') === -1) {
        CE_SYS.laboral += addon;
      }
    }

    console.log('%c📚 Casos Externos: Biblioteca + Qdrant + BCN conectados', 'color:#059669;font-weight:bold');

    /* ── ESCRITOS JUDICIALES: interceptar generateEscrito ── */
    if (typeof window.generateEscrito === 'function' && !window._origGenerateEscrito) {
      window._origGenerateEscrito = window.generateEscrito;
      window.generateEscrito = async function() {
        /* Obtener el template/tipo seleccionado para buscar contexto relevante */
        var query = '';
        var templateEl = document.querySelector('.escrito-template.active, .escrito-selected, [data-escrito-type]');
        if (templateEl) query = templateEl.textContent || '';
        if (!query) {
          var titleEl = document.querySelector('#viewEscritos h2, #viewEscritos .escrito-title');
          if (titleEl) query = titleEl.textContent || '';
        }
        /* Agregar contexto del caso si existe */
        if (currentCase) {
          query += ' ' + (currentCase.tipo_procedimiento || '') + ' ' + (currentCase.materia || '');
        }
        if (!query || query.length < 5) query = 'escrito judicial procedimiento disciplinario';

        /* Buscar en las 3 fuentes en paralelo */
        try {
          var results = await Promise.all([
            _ceSearchLibrary(query.substring(0, 200)),
            _ceSearchQdrant(query.substring(0, 200), (currentCase ? currentCase.tipo_procedimiento || '' : '')),
            _ceGetNormasBCN()
          ]);
          var extraCtx = results[0] + results[1] + results[2];
          if (extraCtx.length > 50) {
            window._escritosLibraryCtx = extraCtx;
            console.log('Escritos: +' + extraCtx.length + ' chars de biblioteca preparados');
          }
        } catch (e) { console.warn('Escritos library error:', e.message); }

        return window._origGenerateEscrito.apply(this, arguments);
      };
      console.log('%c📝 Escritos Judiciales: Biblioteca + Qdrant + BCN conectados', 'color:#7c3aed;font-weight:bold');
    }

    /* ── Interceptar fetch global para inyectar biblioteca en Escritos ── */
    if (!window._origGlobalFetch) {
      window._origGlobalFetch = window.fetch;
      window.fetch = async function(url, opts) {
        var chatUrl = typeof CHAT_ENDPOINT !== 'undefined' ? CHAT_ENDPOINT : '/.netlify/functions/chat';
        if (typeof url === 'string' && (url === chatUrl || url.indexOf('/.netlify/functions/chat') !== -1) && opts && opts.body && window._escritosLibraryCtx) {
          try {
            var body = JSON.parse(opts.body);
            if (body.system && body.system.indexOf('escrito') !== -1) {
              body.system += window._escritosLibraryCtx;
              opts = Object.assign({}, opts, { body: JSON.stringify(body) });
              console.log('Escritos: biblioteca inyectada al system prompt');
              delete window._escritosLibraryCtx;
            }
          } catch (e) {}
        }
        return window._origGlobalFetch.apply(this, arguments);
      };
    }
  }

  setTimeout(installCEPatch, 2500);
})();

/* ────────────────────────────────────────────────────────────────
   ANÁLISIS DE CASOS EXTERNOS — VIEW OPENER
   ──────────────────────────────────────────────────────────────── */

// Module state
const ce_view = {
  search: '',
  results: [],
  loading: false
};

function openAnalisisCasosExternos() {
  // Remove active class from all sidebar items
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if (typeof event !== 'undefined' && event?.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  // Clear current case
  if (typeof currentCase !== 'undefined') {
    currentCase = null;
  }

  // Create view if it doesn't exist
  if (!document.getElementById('viewCasosExternos')) {
    createCasosExternosView();
  }

  // Show the view
  showView('viewCasosExternos');

  // Render the UI
  renderCasosExternosView();
}

function createCasosExternosView() {
  const main = document.querySelector('.main');
  if (!main) return;

  const viewDiv = document.createElement('div');
  viewDiv.id = 'viewCasosExternos';
  viewDiv.className = 'view';
  viewDiv.style.cssText = 'flex-direction:column;overflow:hidden;';

  viewDiv.innerHTML = `
    <div style="padding:14px 20px 8px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
      <div style="font-family:var(--font-serif);font-size:22px;font-weight:400;color:var(--text)">Análisis de Casos Externos</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Analiza casos de referencia externos para comparar con tus expedientes</div>
    </div>
    <div id="casosExternosContainer" style="flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;background:var(--surface);">
      <div class="loading">Cargando módulo…</div>
    </div>
  `;

  main.appendChild(viewDiv);
}

function renderCasosExternosView() {
  const container = document.getElementById('casosExternosContainer');
  if (!container) return;

  container.style.cssText = 'flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;background:var(--surface);padding:16px;';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:16px;max-width:900px;margin:0 auto;">

      <!-- Search Section -->
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-muted);">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6.5" cy="6.5" r="4"/>
            <line x1="10" y1="10" x2="14" y2="14"/>
          </svg>
          <input
            id="casosExternosSearch"
            type="text"
            placeholder="Buscar casos externos por palabra clave…"
            value="${ce_view.search}"
            oninput="ce_view.search=this.value;renderCasosExternosView()"
            style="flex:1;border:none;background:transparent;outline:none;font-size:13px;color:var(--text);font-family:inherit;"
          />
        </div>
        <button
          onclick="loadCasosExternos()"
          style="padding:8px 14px;background:var(--gold);color:var(--surface);border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity 0.2s;"
          onmouseover="this.style.opacity='0.9'"
          onmouseout="this.style.opacity='1'"
        >
          🔍 Buscar
        </button>
      </div>

      <!-- Results Container -->
      <div id="casosExternosResults" style="display:flex;flex-direction:column;gap:12px;">
        ${ce_view.loading ?
          '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">Buscando casos externos…</div>' :
          ce_view.results.length === 0 ?
          `<div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:13px;">
            <div style="margin-bottom:8px;">📂</div>
            <div>Ingresa términos de búsqueda para encontrar casos externos relevantes</div>
            <div style="font-size:11px;margin-top:8px;opacity:0.7;">Se buscarán en la biblioteca QDRANT, jurisprudencia y bases de datos externas</div>
          </div>` :
          ce_view.results.map((result, idx) => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:12px;background:var(--surface);transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="font-family:var(--font-serif);font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px;">${result.title || 'Caso sin título'}</div>
              <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:8px;">${result.description || 'Sin descripción disponible'}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;">
                ${result.source ? `<span style="padding:3px 8px;background:rgba(0,0,0,0.05);border-radius:4px;color:var(--text-muted);">📚 ${result.source}</span>` : ''}
                ${result.type ? `<span style="padding:3px 8px;background:rgba(0,0,0,0.05);border-radius:4px;color:var(--text-muted);">⚖️ ${result.type}</span>` : ''}
              </div>
            </div>
          `).join('')
        }
      </div>

      <!-- Info Panel -->
      <div style="margin-top:16px;padding:12px;background:rgba(0,0,0,0.03);border-left:3px solid var(--gold);border-radius:4px;font-size:12px;color:var(--text-muted);line-height:1.5;">
        <strong style="color:var(--text);display:block;margin-bottom:6px;">💡 Consejos:</strong>
        <ul style="margin:0;padding-left:16px;">
          <li>Busca por materia legal (ej: "disciplinario", "laboral", "administrativo")</li>
          <li>Usa términos específicos de tu procedimiento (ej: "sumario", "suspensión")</li>
          <li>Los resultados incluyen jurisprudencia, doctrina y casos referenciados</li>
        </ul>
      </div>

    </div>
  `;
}

function loadCasosExternos() {
  if (!ce_view.search.trim()) {
    if (typeof showToast === 'function') {
      showToast('⚠ Ingresa términos de búsqueda');
    }
    return;
  }

  ce_view.loading = true;
  renderCasosExternosView();

  // Simulate search delay (in a real app, this would call an API)
  setTimeout(() => {
    ce_view.loading = false;

    // Mock results for demonstration
    ce_view.results = [
      {
        title: 'Jurisprudencia CGR - Sumarios Administrativos',
        description: 'Línea jurisprudencial en sumarios administrativos. Garantías del debido proceso, garantías de defensa y procedimientos de investigación.',
        source: 'Dictámenes CGR',
        type: 'Jurisprudencia'
      },
      {
        title: 'Doctrina: Principios de Proporcionalidad en Sanciones',
        description: 'Análisis doctrinal sobre el principio de proporcionalidad en la imposición de sanciones administrativas, con énfasis en el caso de funcionarios públicos.',
        source: 'Biblioteca de Referencia',
        type: 'Doctrina'
      },
      {
        title: 'Resolución sobre Nulidad por Defectos Procedimentales',
        description: 'Casos relevantes de recursos administrativos por vicios procedimentales en procesos disciplinarios. Criterios de reparabilidad según jurisprudencia.',
        source: 'Qdrant - Jurisprudencia',
        type: 'Jurisprudencia'
      }
    ];

    renderCasosExternosView();
  }, 800);
}
