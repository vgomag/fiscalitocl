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
      var ceState = typeof window.ce_state !== 'undefined' ? window.ce_state : null;
      var isCE = ceState && ceState._active === true;

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
        } else if (ceState) {
          query = ((ceState.focusFree || '') + ' ' + (Array.isArray(ceState.extractedFacts) ? ceState.extractedFacts.slice(0,3).join('. ') : '')).substring(0, 300);
        }
        var caseType = ceState ? ((ceState.caseType || '') + ' ' + (ceState.analysisMode || '')) : '';

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

    /* Enriquecer system prompts de CE_SYS si están disponibles */
    if (typeof window.CE_SYS !== 'undefined') {
      var addon = '\n\nFUENTES ADICIONALES DISPONIBLES:\nEl sistema te proporcionara automaticamente fragmentos de:\n- BIBLIOTECA DE REFERENCIA: 40 libros de derecho administrativo + 7 normativas internas UMAG\n- BIBLIOTECA JURIDICA QDRANT: Dictamenes CGR reales, jurisprudencia, doctrina indexada\n- NORMAS CON ENLACES LEY CHILE: 17 cuerpos normativos con enlaces BCN\n\nCuando recibas estos fragmentos:\n1. CITA los libros como fundamento doctrinario\n2. USA los dictamenes CGR como respaldo\n3. INCLUYE los enlaces BCN al citar leyes\n4. PRIORIZA estas fuentes reales sobre tu conocimiento general';

      if (window.CE_SYS.disciplinario && window.CE_SYS.disciplinario.indexOf('QDRANT') === -1) {
        window.CE_SYS.disciplinario += addon;
      }
      if (window.CE_SYS.laboral && window.CE_SYS.laboral.indexOf('QDRANT') === -1) {
        window.CE_SYS.laboral += addon;
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
   NOTA: La vista y función openAnalisisCasosExternos() se definen
   ahora en mod-casos-externos.js (módulo completo).
   Este archivo solo contiene el patch de inyección de fuentes.
   ──────────────────────────────────────────────────────────────── */
