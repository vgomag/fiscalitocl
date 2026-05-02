/* ══════════════════════════════════════════════════════════════════════════
   mod-plantillas-extractor.js  ·  Fiscalito  ·  v1.0  (2026-05-02)
   ──────────────────────────────────────────────────────────────────────────
   Genera plantillas reutilizables a partir de las diligencias REALES del
   usuario en sus casos terminados. Toma N ejemplos de un tipo (oficio,
   acta, notificación, resolución de inicio, etc.), los manda a Claude para
   extraer la estructura común con variables {snake_case}, y guarda el
   resultado en custom_templates — desde ahí queda disponible en el flujo
   normal de Plantillas y Actas.

   Flujo:
     1) Usuario abre el modal desde el botón "🤖 Generar plantillas desde mis casos"
     2) Elige tipo de diligencia + cantidad de ejemplos + filtros (proc/protocolo)
     3) App fetchea muestras desde diligencias.extracted_text (solo casos terminados)
     4) Llama a /.netlify/functions/chat con prompt de extracción
     5) Muestra preview + permite editar
     6) Guarda en custom_templates → reload de la vista
   ══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const _CHAT_EP = '/.netlify/functions/chat';

/* ── Helpers ── */
const _sb = () => typeof sb !== 'undefined' ? sb : (typeof supabaseClient!=='undefined'?supabaseClient:null);
const _esc = s => typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _toast = m => typeof showToast==='function'?showToast(m):console.log('[plantillas-ex]',m);

/* ── Tipos de diligencia disponibles para extracción ── */
const DIL_TYPES_FOR_EXTRACTION = [
  { value:'oficio',                label:'Oficio',                 mapsTo:'OFI', cat:'indagatoria' },
  { value:'acta',                  label:'Acta',                   mapsTo:'ACT', cat:'indagatoria' },
  { value:'notificacion',          label:'Notificación',           mapsTo:'OFI', cat:'indagatoria' },
  { value:'resolucion_inicio',     label:'Resolución de Inicio',   mapsTo:'RES', cat:'indagatoria' },
  { value:'cargos',                label:'Formulación de Cargos',  mapsTo:'RES', cat:'cargos'     },
  { value:'informe',               label:'Informe',                mapsTo:'INF', cat:'vista'       },
  { value:'vista_fiscal',          label:'Vista Fiscal',           mapsTo:'INF', cat:'vista'       },
  { value:'declaracion_testigo',   label:'Acta de Declaración Testigo',     mapsTo:'ACT', cat:'indagatoria' },
  { value:'declaracion_denunciado',label:'Acta de Declaración Denunciado/a', mapsTo:'ACT', cat:'indagatoria' },
  { value:'declaracion_denunciante',label:'Acta de Declaración Denunciante', mapsTo:'ACT', cat:'indagatoria' },
];

/* ── Estado del modal ── */
let _state = { step:1, dilType:'oficio', sampleCount:6, tipoProc:'all', protocolo:'all', resultado:'all', searchText:'', samples:[], extracted:null };

/* ── Cargar conteo por tipo (para mostrar en el selector) ──
   PostgREST no soporta funciones (`character_length`) en filtros, así que
   filtramos solo por extracted_text NOT NULL. El filtro fino de longitud lo
   hacemos en _fetchSamples al elegir las muestras reales. */
async function _loadCounts(){
  const sb = _sb();
  if(!sb || !session?.user?.id) return {};
  const types = DIL_TYPES_FOR_EXTRACTION.map(d=>d.value);
  const counts = {};
  await Promise.all(types.map(async t=>{
    try{
      const{count}=await sb.from('diligencias').select('id',{count:'exact',head:true})
        .eq('diligencia_type',t).not('extracted_text','is',null);
      counts[t]=count||0;
    }catch{ counts[t]=0; }
  }));
  return counts;
}

/* ── Sample N diligencias representativas ──
   Aplica filtros: tipo de diligencia + tipo de procedimiento + protocolo +
   resultado del caso (ej. solo "Sanción") + búsqueda libre en extracted_text
   o diligencia_label (útil para localizar resoluciones específicas como
   "apertura del probatorio", "formulación de cargos", etc.). */
async function _fetchSamples(dilType,n,tipoProc,protocolo,resultado,searchText){
  const sb = _sb();
  if(!sb || !session?.user?.id) return [];
  const{data:cases}=await sb.from('cases').select('id,tipo_procedimiento,protocolo,resultado')
    .eq('user_id',session.user.id).eq('status','terminado').is('deleted_at',null);
  if(!cases?.length) return [];
  let caseIds = cases.map(c=>c.id);
  const caseMeta = {};
  cases.forEach(c=>{caseMeta[c.id]={tipo:c.tipo_procedimiento||'',proto:c.protocolo||'',res:(c.resultado||'').toLowerCase()};});
  if(tipoProc && tipoProc!=='all') caseIds = caseIds.filter(id=>caseMeta[id].tipo===tipoProc);
  if(protocolo && protocolo!=='all') caseIds = caseIds.filter(id=>caseMeta[id].proto===protocolo);
  if(resultado && resultado!=='all'){
    const target = resultado.toLowerCase();
    caseIds = caseIds.filter(id=>caseMeta[id].res.includes(target));
  }
  if(!caseIds.length) return [];

  const{data}=await sb.from('diligencias')
    .select('id,case_id,diligencia_type,diligencia_label,extracted_text,fecha_diligencia,file_name')
    .eq('diligencia_type',dilType)
    .in('case_id',caseIds)
    .not('extracted_text','is',null)
    .limit(200);
  if(!data?.length) return [];
  /* Filtro de longitud + búsqueda libre (case-insensitive) */
  const q = (searchText||'').trim().toLowerCase();
  let useful = data.filter(d=>d.extracted_text && d.extracted_text.length>500 && d.extracted_text.length<60000);
  if(q){
    useful = useful.filter(d=>{
      const hay = (d.extracted_text||'').toLowerCase()
        + ' ' + (d.diligencia_label||'').toLowerCase()
        + ' ' + (d.file_name||'').toLowerCase();
      return hay.includes(q);
    });
  }
  if(!useful.length) return [];
  useful.sort((a,b)=>b.extracted_text.length-a.extracted_text.length);
  /* Mezcla: 60% top por largo + 40% aleatorios para variedad */
  const topN = Math.ceil(n*0.6);
  const top = useful.slice(0,topN);
  const rest = useful.slice(topN);
  const random = rest.sort(()=>Math.random()-0.5).slice(0, n-top.length);
  return [...top, ...random].slice(0,n);
}

/* ── Llamar a Claude para extraer template ── */
async function _extractWithAI(samples, dilType, dilTypeLabel){
  const _doFetch = typeof authFetch==='function' ? authFetch : fetch;
  const samplesText = samples.map((s,i)=>{
    /* Truncamos cada sample a 6000 chars para no explotar el contexto */
    const txt = (s.extracted_text||'').substring(0,6000);
    return `=== EJEMPLO ${i+1} ===\n${txt}`;
  }).join('\n\n');

  const prompt = `Eres Fiscalito, asistente jurídico de la Fiscalía Universitaria UMAG. Voy a darte ${samples.length} ejemplos REALES de "${dilTypeLabel}" extraídos de procedimientos disciplinarios reales.

TAREA: extraer una PLANTILLA GENERALIZADA que capture la estructura común, reemplazando información identificable (nombres, RUTs, fechas, números de resolución, dependencias, fojas) con variables en formato {snake_case}.

REGLAS:
1. Mantén el lenguaje formal jurídico chileno y la estructura institucional UMAG.
2. Identifica las partes que aparecen en TODOS o casi todos los ejemplos. NO incluyas secciones que solo aparezcan en uno.
3. Variables comunes a usar (preferir estas keys cuando apliquen):
   {numero_resolucion}, {fecha}, {ciudad}, {tipo_procedimiento}, {normativa_aplicable},
   {nombre_denunciante}, {rut_denunciante}, {estamento_denunciante}, {carrera_denunciante},
   {nombre_denunciado}, {rut_denunciado}, {estamento_denunciado}, {carrera_denunciado}, {dependencia_denunciado},
   {nombre_fiscal}, {dependencia_fiscal}, {nombre_actuaria}, {dependencia_actuaria},
   {fecha_denuncia}, {fecha_resolucion_instruye}, {resolucion_instruye},
   {numero_fojas}, {fecha_citacion}, {hora_citacion}, {lugar_citacion},
   {tipo_presentacion}, {nombre_testigo}, {rut_testigo}, {protocolo}.
4. Si hay nombres/datos que aparecen en UN solo ejemplo y no son genéricos, omítelos (no los conviertas en variables).
5. NO inventes contenido — solo generaliza lo que aparece en los ejemplos.

OUTPUT: responde SOLO con un JSON válido (sin markdown, sin \`\`\`, sin texto antes ni después). Estructura:

{
  "name": "Nombre descriptivo de 3-7 palabras (ej: 'Citación a testigo a declarar')",
  "code": "MT-EXT-XX-NNN (genera código corto único basado en categoría y tipo, ej: 'MT-EXT-OFI-001')",
  "category": "indagatoria | cargos | descargos | vista | resolucion | custom",
  "type": "RES | OFI | ACT | CON | CER | INF",
  "description": "Una línea explicando cuándo usar esta plantilla",
  "structure": "El template completo en texto plano, con saltos de línea reales (\\\\n), con todas las variables en formato {snake_case}",
  "variables": [
    {"key":"numero_resolucion","label":"Número de Resolución","type":"text","required":true},
    {"key":"fecha","label":"Fecha","type":"date","required":true}
  ]
}

EJEMPLOS REALES:

${samplesText}`;

  const token = (typeof session!=='undefined') ? (session?.access_token||'') : '';
  const r = await _doFetch(_CHAT_EP, {
    method:'POST',
    headers:{'Content-Type':'application/json', 'x-auth-token':token},
    body:JSON.stringify({
      model: typeof CLAUDE_SONNET!=='undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages:[{role:'user',content:prompt}]
    })
  });
  if(!r.ok){
    let detail = `HTTP ${r.status}`;
    try{ const ej = await r.json(); detail = ej.error||detail; }catch{}
    throw new Error('Extracción IA falló — '+detail);
  }
  const data = await r.json();
  const replyText = (data.content && data.content[0]?.text) || data.reply || '';
  if(!replyText) throw new Error('Respuesta IA vacía');

  /* Parsear JSON — la IA a veces envuelve en markdown a pesar de las instrucciones */
  let cleaned = replyText.trim();
  if(cleaned.startsWith('```')){
    cleaned = cleaned.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  }
  /* Buscar el primer {...} balanceado por si hay texto extra */
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if(firstBrace>=0 && lastBrace>firstBrace){
    cleaned = cleaned.substring(firstBrace, lastBrace+1);
  }
  let parsed;
  try{ parsed = JSON.parse(cleaned); }
  catch(e){ throw new Error('No se pudo parsear el JSON de la IA: '+e.message); }
  if(!parsed.name || !parsed.structure) throw new Error('Respuesta IA incompleta (faltan name/structure)');
  /* Defaults */
  parsed.code = parsed.code || ('MT-EXT-'+(dilType.substring(0,3).toUpperCase())+'-'+Math.random().toString(36).substring(2,6).toUpperCase());
  parsed.category = parsed.category || 'custom';
  parsed.type = parsed.type || 'OFI';
  parsed.description = parsed.description || `Plantilla extraída de ${samples.length} ejemplos reales de ${dilTypeLabel.toLowerCase()}`;
  parsed.variables = Array.isArray(parsed.variables) ? parsed.variables : [];
  return parsed;
}

/* ── Embed metadata en description (compatible con UI existente) ──
   Formato: "<descripción humana> [ext:proc=<X>|proto=<Y>|samples=<N>]"
   Permite filtrar/badgear templates extraídos según el caso vinculado sin
   tener que añadir columnas nuevas a custom_templates. */
function _embedMeta(desc, meta){
  const parts = [];
  if(meta.proc && meta.proc!=='all') parts.push('proc='+meta.proc);
  if(meta.proto && meta.proto!=='all') parts.push('proto='+meta.proto);
  if(meta.samples) parts.push('samples='+meta.samples);
  if(meta.dilType) parts.push('dil='+meta.dilType);
  if(!parts.length) return desc||'';
  const cleaned = (desc||'').replace(/\s*\[ext:[^\]]+\]\s*$/,'').trim();
  return cleaned + ' [ext:' + parts.join('|') + ']';
}
function _parseMeta(desc){
  const m = (desc||'').match(/\[ext:([^\]]+)\]/);
  if(!m) return null;
  const meta = {};
  m[1].split('|').forEach(kv=>{const[k,v]=kv.split('=');if(k&&v)meta[k.trim()]=v.trim();});
  return meta;
}
function _stripMeta(desc){
  return (desc||'').replace(/\s*\[ext:[^\]]+\]\s*$/,'').trim();
}

/* ── Guardar en custom_templates con anti-dupe ──
   Si ya existe una plantilla con el mismo `code` para este user, se ofrece
   reemplazar (UPDATE) o crear una nueva versión (-vN). Esto evita el
   problema de extraer la misma combo dos veces y terminar con duplicados. */
async function _save(template, opts){
  opts = opts || {};
  const sb = _sb();
  if(!sb || !session?.user?.id) throw new Error('Sesión requerida');

  /* Embed metadata si se entregó (proc/proto/samples/dilType) */
  const desc = opts.meta ? _embedMeta(template.description, opts.meta) : (template.description||'');

  /* Check dupe por code */
  const{data:existing}=await sb.from('custom_templates').select('id,code,name')
    .eq('user_id',session.user.id).eq('code',template.code).eq('is_active',true).limit(1);
  let finalCode = template.code;
  let isUpdate = false;
  let updateId = null;

  if(existing && existing.length>0){
    if(opts.replaceMode === 'replace'){
      isUpdate = true;
      updateId = existing[0].id;
    } else if(opts.replaceMode === 'newVersion'){
      /* Buscar el siguiente sufijo -vN libre */
      let n = 2;
      while(true){
        const candidate = template.code.replace(/-v\d+$/,'') + '-v' + n;
        const{data:c}=await sb.from('custom_templates').select('id').eq('user_id',session.user.id).eq('code',candidate).limit(1);
        if(!c || !c.length){ finalCode = candidate; break; }
        n++;
        if(n>50) break;
      }
    } else {
      /* Sin replaceMode: lanzamos error con info para que la UI pregunte */
      const err = new Error('DUPE');
      err.code = 'DUPE_CODE';
      err.existingId = existing[0].id;
      err.existingName = existing[0].name;
      throw err;
    }
  }

  const basePayload = {
    user_id: session.user.id,
    name: template.name,
    code: finalCode,
    type: template.type,
    category: template.category,
    description: desc,
    structure: template.structure,
    variables: template.variables,
    is_active: true,
    updated_at: new Date().toISOString()
  };

  if(isUpdate){
    const{error,data} = await sb.from('custom_templates').update(basePayload).eq('id',updateId).select().single();
    if(error) throw new Error(error.message);
    return data;
  } else {
    basePayload.created_at = new Date().toISOString();
    const{error,data} = await sb.from('custom_templates').insert(basePayload).select().single();
    if(error) throw new Error(error.message);
    return data;
  }
}

/* ══════════════════ UI: MODAL ══════════════════ */
function _modalShell(bodyHtml){
  /* Overlay reutilizable. Se cierra con clic afuera o ✕. */
  const old = document.getElementById('plantillaExtractorOverlay');
  if(old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'plantillaExtractorOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = e => { if(e.target===overlay) closeExtractor(); };
  overlay.innerHTML = `
    <div style="background:var(--bg,#fff);border:1px solid var(--border);border-radius:14px;max-width:820px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px">🤖 Generar plantillas desde mis casos</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Extrae modelos reusables analizando tus diligencias reales con IA</div>
        </div>
        <button class="btn-action" onclick="window._plExtractor.close()" style="font-size:18px">✕</button>
      </div>
      <div id="plExtractorBody" style="flex:1;overflow-y:auto;padding:18px 20px">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
}

function _renderStep1(counts){
  _state.step = 1;
  const TIPOS_PROC = [
    {id:'all',label:'Todos'},
    {id:'Investigación Sumaria',label:'Investigación Sumaria (IS)'},
    {id:'Sumario Administrativo',label:'Sumario Administrativo (SA)'},
    {id:'Procedimiento Disciplinario',label:'Procedimiento Disciplinario (PD)'},
    {id:'Sumario',label:'Sumario'}
  ];
  const PROTOS = [
    {id:'all',label:'Todos'},
    {id:'Ley Karin',label:'Ley Karin'},
    {id:'Protocolo 2020',label:'Protocolo 2020'},
    {id:'Protocolo 2022',label:'Protocolo 2022'},
    {id:'Reglamento Estudiantes',label:'Reglamento Estudiantes'},
    {id:'Estatuto Administrativo',label:'Estatuto Administrativo'},
    {id:'21-SU-2025',label:'21-SU-2025'},
    {id:'34-SU',label:'34-SU'}
  ];
  const html = `
    <div style="font-size:13px;font-weight:500;margin-bottom:10px">1. Elige el tipo de diligencia a usar como base</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-bottom:18px">
      ${DIL_TYPES_FOR_EXTRACTION.map(d=>{
        const c = counts[d.value]||0;
        const enabled = c>=2;
        const sel = _state.dilType===d.value;
        return `
          <button ${enabled?'':'disabled'}
            onclick="window._plExtractor.pickType('${d.value}')"
            style="text-align:left;padding:10px 12px;border-radius:8px;border:1.5px solid ${sel?'var(--gold,#7c3aed)':'var(--border)'};background:${sel?'var(--gold-glow,rgba(124,58,237,.05))':'var(--surface)'};cursor:${enabled?'pointer':'not-allowed'};opacity:${enabled?'1':'.45'};font-family:inherit">
            <div style="font-size:12px;font-weight:600">${_esc(d.label)}</div>
            <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${c} ejemplo${c===1?'':'s'} disponible${c===1?'':'s'}</div>
          </button>`;
      }).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Cantidad de ejemplos</label>
        <input type="number" id="plExSampleCount" value="${_state.sampleCount}" min="3" max="12"
          oninput="window._plExtractor.setSamples(parseInt(this.value)||6)"
          style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px">
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Recomendado 5-8.</div>
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Tipo de procedimiento</label>
        <select id="plExTipoProc" onchange="window._plExtractor.setTipoProc(this.value)"
          style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px;background:var(--surface)">
          ${TIPOS_PROC.map(t=>`<option value="${_esc(t.id)}" ${_state.tipoProc===t.id?'selected':''}>${_esc(t.label)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Protocolo</label>
        <select id="plExProto" onchange="window._plExtractor.setProto(this.value)"
          style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px;background:var(--surface)">
          ${PROTOS.map(p=>`<option value="${_esc(p.id)}" ${_state.protocolo===p.id?'selected':''}>${_esc(p.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;margin-bottom:18px">
      <div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Resultado del caso</label>
        <select id="plExResultado" onchange="window._plExtractor.setResultado(this.value)"
          style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px;background:var(--surface)">
          <option value="all" ${_state.resultado==='all'?'selected':''}>Todos</option>
          <option value="Sanción" ${_state.resultado==='Sanción'?'selected':''}>Solo sancionados</option>
          <option value="Sobreseimiento" ${_state.resultado==='Sobreseimiento'?'selected':''}>Solo sobreseídos</option>
          <option value="Absuelto" ${_state.resultado==='Absuelto'?'selected':''}>Solo absueltos</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Buscar texto en el documento (opcional)</label>
        <input type="text" id="plExSearch" value="${_esc(_state.searchText)}"
          oninput="window._plExtractor.setSearchText(this.value)"
          placeholder="ej: 'término probatorio', 'formulación de cargos', 'absuelvo'"
          style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;margin-top:4px;font-family:var(--font-mono,monospace)">
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Filtra solo diligencias cuyo texto/etiqueta contenga la frase.</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn-sm" onclick="window._plExtractor.close()">Cancelar</button>
      <button class="btn-save" onclick="window._plExtractor.startExtraction()" style="background:var(--gold,#7c3aed);color:#fff;font-weight:600">⚡ Extraer plantilla</button>
    </div>
  `;
  document.getElementById('plExtractorBody').innerHTML = html;
}

function _renderStep2(){
  _state.step = 2;
  document.getElementById('plExtractorBody').innerHTML = `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:36px;margin-bottom:12px">⚡</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">Analizando tus ejemplos…</div>
      <div id="plExStatus" style="font-size:11.5px;color:var(--text-muted);margin-bottom:18px">Buscando diligencias…</div>
      <div style="height:4px;background:var(--surface);border-radius:2px;overflow:hidden;max-width:380px;margin:0 auto">
        <div id="plExBar" style="height:100%;width:10%;background:var(--gold,#7c3aed);transition:width .35s"></div>
      </div>
    </div>`;
}

function _setStatus(text, pct){
  const s = document.getElementById('plExStatus');
  const b = document.getElementById('plExBar');
  if(s) s.textContent = text;
  if(b && pct!=null) b.style.width = pct+'%';
}

function _renderStep3(template, samples){
  _state.step = 3;
  _state.extracted = template;
  const dilLbl = (DIL_TYPES_FOR_EXTRACTION.find(d=>d.value===_state.dilType)||{}).label || _state.dilType;
  const html = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:4px">Plantilla generada · revisa antes de guardar</div>
      <div style="font-size:11px;color:var(--text-muted)">Generada de ${samples.length} ejemplos reales de ${_esc(dilLbl)}.</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:14px">
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Nombre</label>
        <input id="plExName" value="${_esc(template.name||'')}" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:8px;align-items:center">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Código · Tipo</label>
        <input id="plExCode" value="${_esc(template.code||'')}" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:var(--font-mono)">
        <select id="plExType" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface)">
          ${['RES','OFI','ACT','CON','CER','INF'].map(t=>`<option value="${t}" ${template.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted)">Categoría</label>
        <select id="plExCategory" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--surface)">
          ${['indagatoria','cargos','descargos','vista','resolucion','custom'].map(c=>`<option value="${c}" ${template.category===c?'selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:start">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);padding-top:7px">Descripción</label>
        <input id="plExDesc" value="${_esc(template.description||'')}" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>
    </div>

    <div style="margin-bottom:8px;font-size:11px;font-weight:600;color:var(--text-muted)">ESTRUCTURA (con variables {snake_case}) — editable</div>
    <textarea id="plExStructure" style="width:100%;min-height:240px;padding:10px;border:1px solid var(--border);border-radius:8px;font-family:var(--font-mono,monospace);font-size:11.5px;line-height:1.5;resize:vertical">${_esc(template.structure||'')}</textarea>

    <div style="margin-top:10px;font-size:11px;color:var(--text-muted)">
      <strong>${(template.variables||[]).length}</strong> variables detectadas: ${(template.variables||[]).slice(0,12).map(v=>`<code style="background:var(--gold-glow);padding:1px 5px;border-radius:3px;font-size:10.5px">{${_esc(v.key||'')}}</code>`).join(' ')}${(template.variables||[]).length>12?' …':''}
    </div>

    <details style="margin-top:14px">
      <summary style="cursor:pointer;font-size:11.5px;color:var(--gold);user-select:none">Ver los ejemplos originales (verifica que el template sea fiel)</summary>
      <div style="margin-top:8px;max-height:280px;overflow-y:auto;padding:10px;background:var(--surface);border-radius:6px;font-size:10.5px;line-height:1.5;white-space:pre-wrap;font-family:var(--font-mono,monospace)">${samples.map((s,i)=>`<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px dashed var(--border)"><div style="font-weight:700;color:var(--gold);margin-bottom:4px">Ejemplo ${i+1}${s.diligencia_label?' — '+_esc(s.diligencia_label):''}</div>${_esc((s.extracted_text||'').substring(0,1500))}${(s.extracted_text||'').length>1500?'…':''}</div>`).join('')}</div>
    </details>

    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
      <button class="btn-sm" onclick="window._plExtractor.back()">← Volver</button>
      <div style="display:flex;gap:8px">
        <button class="btn-sm" onclick="window._plExtractor.close()">Cancelar</button>
        <button class="btn-save" onclick="window._plExtractor.save()" style="background:var(--green,#059669);color:#fff;font-weight:600">💾 Guardar plantilla</button>
      </div>
    </div>
  `;
  document.getElementById('plExtractorBody').innerHTML = html;
}

/* ══════════════════ FLOW CONTROLLERS ══════════════════ */
async function open(){
  if(!session?.user?.id) return _toast('⚠ Sesión requerida');
  _state = { step:1, dilType:'oficio', sampleCount:6, tipoProc:'all', protocolo:'all', resultado:'all', searchText:'', samples:[], extracted:null };
  _modalShell('<div style="text-align:center;padding:40px;color:var(--text-muted)">Cargando inventario…</div>');
  const counts = await _loadCounts();
  /* Auto-pick el tipo con más ejemplos si oficio no tiene */
  if((counts[_state.dilType]||0) < 2){
    const sorted = DIL_TYPES_FOR_EXTRACTION.map(d=>({k:d.value,n:counts[d.value]||0})).sort((a,b)=>b.n-a.n);
    if(sorted[0]?.n>=2) _state.dilType = sorted[0].k;
  }
  _renderStep1(counts);
}

function close(){
  const o = document.getElementById('plantillaExtractorOverlay');
  if(o) o.remove();
}

function pickType(t){ _state.dilType = t; _renderStep1Cache(); }
function setSamples(n){ _state.sampleCount = Math.max(3, Math.min(12, n||6)); }
function setTipoProc(v){ _state.tipoProc = v; }
function setProto(v){ _state.protocolo = v; }
function setResultado(v){ _state.resultado = v; }
function setSearchText(v){ _state.searchText = v||''; }

/* re-render step1 sin re-loadCounts (las cuentas no cambian) */
let _cachedCounts = null;
async function _renderStep1Cache(){
  if(!_cachedCounts) _cachedCounts = await _loadCounts();
  _renderStep1(_cachedCounts);
}

async function startExtraction(){
  try{
    _renderStep2();
    _setStatus('Buscando diligencias representativas…', 15);
    const dilLbl = (DIL_TYPES_FOR_EXTRACTION.find(d=>d.value===_state.dilType)||{}).label || _state.dilType;
    const samples = await _fetchSamples(_state.dilType, _state.sampleCount, _state.tipoProc, _state.protocolo, _state.resultado, _state.searchText);
    if(!samples.length){
      _toast('⚠ No se encontraron ejemplos con texto extraído para esos filtros.');
      _renderStep1Cache();
      return;
    }
    _state.samples = samples;
    _setStatus(`Llamando a Claude con ${samples.length} ejemplos…`, 50);
    const tpl = await _extractWithAI(samples, _state.dilType, dilLbl);
    /* Defaults dependientes del tipo si la IA no los puso */
    const meta = DIL_TYPES_FOR_EXTRACTION.find(d=>d.value===_state.dilType);
    if(!tpl.type) tpl.type = meta?.mapsTo || 'OFI';
    if(!tpl.category) tpl.category = meta?.cat || 'custom';
    _setStatus('Listo — preparando vista previa…', 95);
    setTimeout(()=>_renderStep3(tpl, samples), 300);
  }catch(e){
    _toast('⚠ '+e.message);
    console.error('[plantillas-extractor]', e);
    _renderStep1Cache();
  }
}

function back(){ _renderStep1Cache(); }

async function save(replaceMode){
  const name = document.getElementById('plExName')?.value?.trim();
  const code = document.getElementById('plExCode')?.value?.trim();
  const type = document.getElementById('plExType')?.value;
  const category = document.getElementById('plExCategory')?.value;
  const description = document.getElementById('plExDesc')?.value?.trim();
  const structure = document.getElementById('plExStructure')?.value;
  if(!name || !structure){ _toast('⚠ Nombre y estructura son obligatorios'); return; }
  /* Re-detectar variables del structure final por si el usuario editó */
  const detectedKeys = [...new Set((structure.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g)||[]).map(m=>m.slice(1,-1)))];
  const oldVars = (_state.extracted?.variables||[]).reduce((m,v)=>{m[v.key]=v;return m;},{});
  const variables = detectedKeys.map(k=>oldVars[k] || {key:k, label:k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), type:'text', required:false});

  const tpl = { name, code, type, category, description, structure, variables };
  const meta = { proc: _state.tipoProc, proto: _state.protocolo, samples: _state.samples?.length, dilType: _state.dilType };
  try{
    await _save(tpl, { replaceMode, meta });
    _toast('✅ Plantilla guardada — disponible en "Mis Plantillas"');
    close();
    if(typeof loadTemplates==='function'){ try{ await loadTemplates(); }catch{} }
    if(typeof renderCuestionariosView==='function'){ try{ renderCuestionariosView(); }catch{} }
  }catch(e){
    if(e.code === 'DUPE_CODE'){
      /* Pedir al usuario que decida: reemplazar o nueva versión */
      const ans = confirm(`Ya existe una plantilla con código "${code}" llamada "${e.existingName}".\n\n• Aceptar = REEMPLAZAR la existente (mantiene el código).\n• Cancelar = crear como NUEVA VERSIÓN (código será ${code}-v2, v3…).`);
      const mode = ans ? 'replace' : 'newVersion';
      return save(mode);
    }
    _toast('⚠ Error al guardar: '+e.message);
    console.error('[plantillas-extractor] save', e);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   FILLER: openCustomTplWizard(tpl, caseObj)
   ────────────────────────────────────────────────────────────────────────
   Modal para llenar una plantilla custom_templates con datos del caso.
   Antes esto NO existía: las custom_templates no se podían usar porque
   `useTmplInWizard` apuntaba a un `openWizard()` inexistente. Esto cierra
   el círculo: extraer → guardar → abrir → llenar → exportar.
   ════════════════════════════════════════════════════════════════════════ */
let _fillState = null;

function _fillerModalShell(bodyHtml){
  const old = document.getElementById('plantillaFillerOverlay');
  if(old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'plantillaFillerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = e => { if(e.target===overlay) closeFiller(); };
  overlay.innerHTML = `
    <div style="background:var(--bg,#fff);border:1px solid var(--border);border-radius:14px;max-width:1080px;width:100%;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <div id="plFillerHeader" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"></div>
      <div id="plFillerBody" style="flex:1;overflow:hidden;display:flex;gap:0">${bodyHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
}

function closeFiller(){
  const o = document.getElementById('plantillaFillerOverlay');
  if(o) o.remove();
  _fillState = null;
}

async function openCustomTplWizard(tpl, caseObj){
  if(!tpl) return _toast('⚠ Plantilla inválida');
  /* Auto-fill desde el caso si está disponible */
  let autoVals = {};
  if(caseObj && typeof autoFillFromCase === 'function'){
    try{ autoVals = await autoFillFromCase(caseObj) || {}; }catch(e){ console.warn('[plantillas-fill] autoFill error',e); }
  }
  const variables = tpl.variables && tpl.variables.length
    ? tpl.variables
    : [...new Set((tpl.structure.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g)||[]).map(m=>m.slice(1,-1)))]
        .map(k=>({key:k,label:k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),type:'text',required:false}));
  const initialVals = {};
  variables.forEach(v=>{ initialVals[v.key] = autoVals[v.key] || ''; });
  _fillState = { tpl, caseObj, variables, vals: initialVals };

  _fillerModalShell('');
  document.getElementById('plFillerHeader').innerHTML = `
    <div>
      <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px">📋 ${_esc(tpl.name||'Plantilla')}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${_esc(_stripMeta(tpl.description||''))} ${caseObj?'· Caso vinculado: <strong>'+_esc(caseObj.name||'')+'</strong>':''}</div>
    </div>
    <button class="btn-action" onclick="window._plExtractor.closeFiller()" style="font-size:18px">✕</button>`;
  _renderFillerBody();
}

function _applyVars(structure, vals){
  return (structure||'').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, key)=>{
    const v = vals[key];
    return (v && String(v).trim()) ? String(v) : m;
  });
}

function _renderFillerBody(){
  const { tpl, variables, vals } = _fillState;
  const filled = variables.filter(v=>vals[v.key] && String(vals[v.key]).trim()).length;
  const total = variables.length;

  const body = document.getElementById('plFillerBody');
  body.innerHTML = `
    <div style="width:42%;border-right:1px solid var(--border);overflow-y:auto;padding:14px 16px;background:var(--surface)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Variables (${filled}/${total} llenas)</div>
        <button class="btn-sm" style="font-size:10px;padding:3px 8px" onclick="window._plExtractor.fillerReset()" title="Restaurar auto-fill">↺ Reset</button>
      </div>
      ${variables.map(v=>{
        const val = vals[v.key]||'';
        const filled = !!val.trim();
        return `
        <div style="margin-bottom:10px">
          <label style="font-size:10.5px;font-weight:600;color:${filled?'var(--text)':'var(--text-muted)'};display:flex;align-items:center;gap:4px">
            ${filled?'<span style="color:var(--green,#059669)">●</span>':'<span style="color:var(--text-muted)">○</span>'}
            ${_esc(v.label||v.key)} ${v.required?'<span style="color:var(--red,#ef4444)">*</span>':''}
            <code style="font-size:9.5px;color:var(--text-muted);font-weight:400">{${_esc(v.key)}}</code>
          </label>
          ${(v.type==='textarea')
            ? `<textarea rows="3" data-var="${_esc(v.key)}" oninput="window._plExtractor.fillerSetVar('${_esc(v.key)}',this.value)" style="width:100%;margin-top:3px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:11.5px;font-family:inherit">${_esc(val)}</textarea>`
            : (v.type==='date')
            ? `<input type="date" data-var="${_esc(v.key)}" value="${_esc(val)}" oninput="window._plExtractor.fillerSetVar('${_esc(v.key)}',this.value)" style="width:100%;margin-top:3px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:11.5px">`
            : `<input type="text" data-var="${_esc(v.key)}" value="${_esc(val)}" oninput="window._plExtractor.fillerSetVar('${_esc(v.key)}',this.value)" style="width:100%;margin-top:3px;padding:6px 8px;border:1px solid var(--border);border-radius:5px;font-size:11.5px">`}
        </div>`;
      }).join('')}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;flex:1">Vista previa (en vivo)</span>
        <button class="btn-sm" onclick="window._plExtractor.fillerCopy()" title="Copiar al portapapeles">📋 Copiar</button>
        <button class="btn-sm" onclick="window._plExtractor.fillerDownload()" title="Descargar como .txt">⬇ TXT</button>
        <button class="btn-sm" onclick="window._plExtractor.fillerAdaptIA()" title="Pedir a Fiscalito que adapte el texto al caso vinculado" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none">✨ Adaptar con IA</button>
      </div>
      <div id="plFillerPreview" style="flex:1;overflow-y:auto;padding:18px 22px;font-family:var(--font-serif,Georgia,serif);font-size:13px;line-height:1.65;white-space:pre-wrap"></div>
    </div>`;
  _renderFillerPreview();
}

function _renderFillerPreview(){
  const el = document.getElementById('plFillerPreview');
  if(!el) return;
  const { tpl, vals } = _fillState;
  const text = _applyVars(tpl.structure||'', vals);
  /* Resaltar variables NO llenas */
  const html = _esc(text).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, '<span style="background:rgba(245,158,11,.18);color:#d97706;padding:0 4px;border-radius:3px;font-family:var(--font-mono);font-size:11.5px">{$1}</span>');
  el.innerHTML = html;
}

function fillerSetVar(key, value){
  if(!_fillState) return;
  _fillState.vals[key] = value;
  _renderFillerPreview();
  /* Re-render dot indicators sin perder foco — pero actualizar el contador */
  const{variables, vals} = _fillState;
  const filled = variables.filter(v=>vals[v.key] && String(vals[v.key]).trim()).length;
  const total = variables.length;
  const headerCount = document.querySelector('#plFillerBody div[style*="text-transform:uppercase"]');
  if(headerCount) headerCount.textContent = `Variables (${filled}/${total} llenas)`;
}

async function fillerReset(){
  if(!_fillState) return;
  const { tpl, caseObj, variables } = _fillState;
  let autoVals = {};
  if(caseObj && typeof autoFillFromCase === 'function'){
    try{ autoVals = await autoFillFromCase(caseObj) || {}; }catch{}
  }
  variables.forEach(v=>{ _fillState.vals[v.key] = autoVals[v.key] || ''; });
  _renderFillerBody();
}

function fillerCopy(){
  if(!_fillState) return;
  const text = _applyVars(_fillState.tpl.structure||'', _fillState.vals);
  navigator.clipboard.writeText(text).then(()=>_toast('📋 Copiado al portapapeles')).catch(()=>_toast('⚠ No se pudo copiar'));
}

function fillerDownload(){
  if(!_fillState) return;
  const text = _applyVars(_fillState.tpl.structure||'', _fillState.vals);
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ((_fillState.tpl.name||'plantilla').replace(/[^a-zA-Z0-9_-]/g,'_')) + '_' + new Date().toISOString().slice(0,10) + '.txt';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  _toast('⬇ Descargado');
}

async function fillerAdaptIA(){
  if(!_fillState) return;
  const { tpl, caseObj, vals } = _fillState;
  const _doFetch = typeof authFetch==='function' ? authFetch : fetch;
  const filledText = _applyVars(tpl.structure||'', vals);
  const remaining = (filledText.match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g)||[]).length;
  let caseCtx = '';
  if(caseObj){
    const fields = ['name','rol','tipo_procedimiento','protocolo','materia','fecha_denuncia','fecha_resolucion','denunciantes','denunciados','medida_cautelar_detalle','observaciones'];
    const lines = fields.map(f=>{
      const v = caseObj[f];
      if(!v) return null;
      return `- ${f}: ${typeof v==='object'?JSON.stringify(v):v}`;
    }).filter(Boolean);
    if(lines.length) caseCtx = '\nDATOS DEL CASO VINCULADO:\n'+lines.join('\n');
  }
  const prompt = `Eres Fiscalito, asistente jurídico UMAG. Tienes una plantilla parcialmente llena (${remaining} variables aún sin completar). Adapta el texto al caso usando los datos provistos. NO inventes información: si no tienes un dato, déjalo entre llaves. Mantén formato y estilo formal jurídico chileno.${caseCtx}\n\nPLANTILLA RELLENA (con variables {} pendientes resaltadas):\n\n${filledText}\n\nDevuelve SOLO el texto final adaptado, sin comentarios ni preámbulos.`;

  const btn = document.querySelector('#plFillerBody button[onclick*="fillerAdaptIA"]');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Adaptando…'; }
  try{
    const token = (typeof session!=='undefined') ? (session?.access_token||'') : '';
    const r = await _doFetch(_CHAT_EP, {
      method:'POST',
      headers:{'Content-Type':'application/json','x-auth-token':token},
      body:JSON.stringify({
        model: typeof CLAUDE_SONNET!=='undefined' ? CLAUDE_SONNET : 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages:[{role:'user',content:prompt}]
      })
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    const reply = (data.content && data.content[0]?.text) || data.reply || '';
    if(!reply) throw new Error('Respuesta IA vacía');
    /* Reemplazar la estructura del fillState con el texto adaptado.
       Ojo: esto rompe la relación con variables, pero la idea es que la
       IA ya generó un texto final; el usuario puede copiar/descargar. */
    _fillState.tpl = { ..._fillState.tpl, structure: reply };
    /* Limpiar las vals porque ya están en el texto */
    _fillState.variables.forEach(v=>{ _fillState.vals[v.key] = ''; });
    _renderFillerBody();
    _toast('✨ Texto adaptado por Fiscalito');
  }catch(e){
    _toast('⚠ Error al adaptar: '+e.message);
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = '✨ Adaptar con IA'; }
  }
}

/* ════════════════════════════════════════════════════════════════════════
   SECCIÓN PARA INYECTAR EN CUESTIONARIOS Y ACTAS
   ────────────────────────────────────────────────────────────────────────
   Carga las custom_templates del usuario, las ordena (las extraídas que
   matcheen el caso vinculado primero), y devuelve HTML listo para insertar.
   ════════════════════════════════════════════════════════════════════════ */
async function renderExtractedTemplatesSection(linkedCase){
  const sb = _sb();
  if(!sb || !session?.user?.id) return '';
  const{data}=await sb.from('custom_templates').select('*')
    .eq('user_id',session.user.id).eq('is_active',true).order('created_at',{ascending:false});
  if(!data || !data.length) return '';

  const TYPE_ICON = { RES:'📜', OFI:'📨', ACT:'📋', CON:'🛡️', CER:'✅', INF:'📄' };

  /* Calcular match score: 2=ambos coinciden, 1=uno coincide, 0=ninguno o sin meta */
  const linkedProc = (linkedCase?.tipo_procedimiento||'').trim();
  const linkedProto = (linkedCase?.protocolo||'').trim();
  const enriched = data.map(t=>{
    const meta = _parseMeta(t.description) || {};
    let score = 0;
    if(meta.proc && linkedProc && meta.proc===linkedProc) score++;
    if(meta.proto && linkedProto && meta.proto===linkedProto) score++;
    return { tpl:t, meta, score };
  });
  /* Ordenar: matches primero, luego por created_at */
  enriched.sort((a,b)=>b.score-a.score);

  const cards = enriched.map(({tpl, meta, score})=>{
    const desc = _stripMeta(tpl.description||'');
    const icon = TYPE_ICON[tpl.type] || '📄';
    const isExt = (tpl.code||'').startsWith('MT-EXT');
    const badgeMatch = (linkedCase && score>=2)
      ? '<span style="font-size:9.5px;background:rgba(5,150,105,.12);color:#059669;padding:2px 7px;border-radius:10px;font-weight:600">✓ Compatible con tu caso</span>'
      : (linkedCase && score===1)
      ? '<span style="font-size:9.5px;background:rgba(245,158,11,.12);color:#d97706;padding:2px 7px;border-radius:10px;font-weight:600">~ Parcialmente compatible</span>'
      : '';
    const tagExt = isExt ? '<span style="font-size:9px;background:rgba(124,58,237,.12);color:#7c3aed;padding:1px 6px;border-radius:8px;font-weight:600">EXTRAÍDA</span>' : '<span style="font-size:9px;background:rgba(245,158,11,.12);color:#d97706;padding:1px 6px;border-radius:8px;font-weight:600">CUSTOM</span>';
    const metaInfo = (meta.proc||meta.proto) ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${meta.proc?'· '+_esc(meta.proc):''}${meta.proto?' · '+_esc(meta.proto):''}${meta.samples?' · '+meta.samples+' ej':''}</div>` : '';
    const escId = _esc(tpl.id);
    return `
      <div onclick="window._plExtractor.useExtracted('${escId}')" style="background:var(--surface);border:1.5px solid ${score>=2?'rgba(5,150,105,.4)':'var(--border)'};border-radius:10px;padding:12px;cursor:pointer;transition:all .12s" onmouseover="this.style.borderColor='var(--gold-dim)';this.style.boxShadow='var(--shadow-sm)'" onmouseout="this.style.borderColor='${score>=2?'rgba(5,150,105,.4)':'var(--border)'}';this.style.boxShadow='none'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:18px">${icon}</span>
          <span style="font-size:10px;background:var(--gold-glow);border:1px solid var(--gold-dim);color:var(--gold);padding:1px 6px;border-radius:4px;font-weight:600;font-family:var(--font-mono)">${_esc(tpl.code||'')}</span>
          ${tagExt}
          ${badgeMatch}
        </div>
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${_esc(tpl.name||'Sin nombre')}</div>
        ${desc?`<div style="font-size:11px;color:var(--text-muted);line-height:1.4">${_esc(desc.substring(0,140))}${desc.length>140?'…':''}</div>`:''}
        ${metaInfo}
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${(tpl.variables||[]).length} variables</div>
      </div>`;
  }).join('');

  const matchCount = enriched.filter(e=>e.score>=1).length;
  const headerNote = linkedCase
    ? `${matchCount>0?'<strong style="color:#059669">'+matchCount+' compatible(s) con tu caso</strong> · ':''}${enriched.length} totales`
    : `${enriched.length} plantillas`;

  return `
    <div style="margin-top:24px;padding-top:18px;border-top:2px dashed var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:600">🤖 Mis plantillas extraídas y custom</div>
          <div style="font-size:11px;color:var(--text-muted)">${headerNote}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">${cards}</div>
    </div>`;
}

async function useExtracted(id){
  const sb = _sb();
  if(!sb) return;
  const{data}=await sb.from('custom_templates').select('*').eq('id',id).maybeSingle();
  if(!data) return _toast('⚠ Plantilla no encontrada');
  /* Tomar el caso vinculado de Cuestionarios o currentCase */
  const caseObj = (typeof _wizState!=='undefined' && _wizState?.linkedCase)
    || (typeof currentCase!=='undefined' ? currentCase : null);
  await openCustomTplWizard(data, caseObj);
}

/* ════════════════════════════════════════════════════════════════════════
   BANNER DE SUGERENCIA
   ────────────────────────────────────────────────────────────────────────
   Si hay tipos de diligencia con ≥10 ejemplos disponibles y NINGUNA
   custom_template extraída para ese tipo, sugerimos extraer.
   ════════════════════════════════════════════════════════════════════════ */
async function getSuggestionBanner(){
  const sb = _sb();
  if(!sb || !session?.user?.id) return '';
  /* Conteo de diligencias por tipo (con texto) y de custom_templates por dilType en meta */
  const counts = await _loadCounts();
  const{data:tpls}=await sb.from('custom_templates').select('description')
    .eq('user_id',session.user.id).eq('is_active',true);
  const coveredDilTypes = new Set();
  (tpls||[]).forEach(t=>{
    const meta = _parseMeta(t.description);
    if(meta?.dil) coveredDilTypes.add(meta.dil);
  });
  /* Tipos con ≥10 ejemplos y sin plantilla aún */
  const candidates = DIL_TYPES_FOR_EXTRACTION
    .filter(d => (counts[d.value]||0) >= 10 && !coveredDilTypes.has(d.value))
    .sort((a,b)=>(counts[b.value]||0)-(counts[a.value]||0))
    .slice(0,3);
  if(!candidates.length) return '';

  const top = candidates[0];
  const others = candidates.slice(1).map(d=>`${d.label} (${counts[d.value]})`).join(', ');
  return `
    <div style="background:linear-gradient(135deg,rgba(124,58,237,.06),rgba(168,85,247,.06));border:1px solid rgba(124,58,237,.25);border-radius:10px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:20px">💡</span>
      <div style="flex:1;min-width:200px">
        <div style="font-size:12.5px;font-weight:600;color:var(--text)">
          Tienes <strong>${counts[top.value]} ejemplos</strong> de "${_esc(top.label)}" sin plantilla extraída.
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
          Genera una plantilla reusable a partir de tus diligencias reales.${others?' También: '+_esc(others)+'.':''}
        </div>
      </div>
      <button class="btn-save" onclick="window._plExtractor.openWith('${_esc(top.value)}')" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;font-size:11.5px;padding:6px 12px;border-radius:7px;font-weight:600;cursor:pointer">⚡ Extraer ahora</button>
    </div>`;
}

async function openWith(dilType){
  await open();
  /* Pre-seleccionar el tipo */
  _state.dilType = dilType;
  _renderStep1Cache();
}

/* API pública */
window._plExtractor = {
  open, close, pickType, setSamples, setTipoProc, setProto, setResultado, setSearchText,
  startExtraction, back, save,
  openCustomTplWizard, closeFiller, fillerSetVar, fillerReset, fillerCopy, fillerDownload, fillerAdaptIA,
  useExtracted, openWith
};
window.openPlantillaExtractor = open;
window.openCustomTplWizard = openCustomTplWizard;
window.renderExtractedTemplatesSection = renderExtractedTemplatesSection;
window.getExtractorSuggestionBanner = getSuggestionBanner;

console.log('%c🤖 mod-plantillas-extractor cargado (con filler + sección Cuestionarios + sugerencias)', 'color:#7c3aed;font-weight:bold');
})();
