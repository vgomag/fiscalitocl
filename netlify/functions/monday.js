import { corsHeaders as _corsHeaders } from './shared/cors-esm.js';

/* ══════════════════════════════════════════════════════════════════════
   netlify/functions/monday.js — Bridge Fiscalito ↔ monday.com
   ══════════════════════════════════════════════════════════════════════
   Proxy autenticado al API GraphQL de monday.com. La fiscal usa este
   endpoint para enviar updates a sus actuarias y sincronizar etapas
   directamente desde "Mis Casos" sin abrir Monday.

   Acciones soportadas (vía body.action):
     - find_item_by_rol: busca item en un board por valor de columna texto__1
     - get_item: detalle del item (status, persona asignada, etc.)
     - create_update: postea comentario en un item, con mention opcional
     - change_status: actualiza la columna `status` (etapa) del item
     - list_users: lista usuarios del workspace (para autocomplete @mention)

   Auth:
     - x-auth-token: JWT de Supabase del usuario logueado en Fiscalito
     - MONDAY_API_TOKEN: env var con el personal access token de Monday
       (mismo nivel de privilegio del usuario que lo generó — single-tenant)
   ══════════════════════════════════════════════════════════════════════ */

const MONDAY_API = 'https://api.monday.com/v2';

/* ── JWT validation (mismo patrón que chat.js) ── */
async function _validateUid(token){
  if(!token) return null;
  let uid = null;
  try {
    const parts = token.split('.');
    if(parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    uid = payload.sub;
    if(!uid || !/^[a-f0-9\-]{36}$/i.test(uid)) return null;
    if(payload.exp && payload.exp < Math.floor(Date.now()/1000)) return null;
  } catch { return null; }
  // Verificar firma contra Supabase
  const sbUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
  const sbKey = Netlify.env.get('SUPABASE_ANON_KEY') || Netlify.env.get('VITE_SUPABASE_ANON_KEY');
  if(sbUrl && sbKey){
    try {
      const ac = new AbortController();
      const to = setTimeout(()=>ac.abort(), 5000);
      const r = await fetch(`${sbUrl}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': sbKey },
        signal: ac.signal
      });
      clearTimeout(to);
      if(r.ok){ const u = await r.json(); return u?.id || null; }
      if(r.status === 401) return null;
    } catch {}
  }
  return uid;
}

/* ── Llamada al API de Monday ── */
async function _mondayCall(query, variables){
  const token = Netlify.env.get('MONDAY_API_TOKEN');
  if(!token) throw new Error('MONDAY_API_TOKEN no configurado en Netlify env vars');
  const ac = new AbortController();
  const to = setTimeout(()=>ac.abort(), 25000);
  try {
    const r = await fetch(MONDAY_API, {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/json', 'API-Version': '2023-10' },
      body: JSON.stringify({ query, variables: variables||{} }),
      signal: ac.signal
    });
    clearTimeout(to);
    const data = await r.json();
    if(data.errors) throw new Error(data.errors.map(e=>e.message).join('; '));
    return data.data;
  } catch(e){
    clearTimeout(to);
    if(e.name === 'AbortError') throw new Error('Timeout llamando a Monday API');
    throw e;
  }
}

/* ── Helpers de normalización de ROL ── */
function _normRol(s){
  if(!s) return '';
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/exenta|exent|ex\./gi,'')
    .replace(/[\s\-\/]+/g,'')
    .replace(/[^a-z0-9]/g,'');
}

/* ── ACTION: find_item_by_rol ── */
async function findItemByRol({ boardId, rol }){
  if(!boardId || !rol) throw new Error('boardId y rol son requeridos');
  const target = _normRol(rol);
  /* Iteramos páginas del board buscando match por nueva_resolucion (columna texto__1) o name */
  let cursor = null;
  let attempts = 0;
  while(attempts < 5){
    attempts++;
    const q = `query($boardId: ID!, $cursor: String){
      boards(ids: [$boardId]){
        items_page(limit: 50, cursor: $cursor){
          cursor
          items {
            id name
            column_values(ids: ["texto__1"]){ id text }
          }
        }
      }
    }`;
    const data = await _mondayCall(q, { boardId: String(boardId), cursor });
    const page = data?.boards?.[0]?.items_page;
    if(!page) break;
    for(const it of (page.items||[])){
      const colRol = it.column_values?.[0]?.text || '';
      if(_normRol(colRol) === target || _normRol(it.name) === target){
        return { found: true, item_id: it.id, item_name: it.name, rol_in_monday: colRol };
      }
    }
    cursor = page.cursor;
    if(!cursor) break;
  }
  return { found: false };
}

/* ── ACTION: get_item ── */
async function getItem({ itemId }){
  if(!itemId) throw new Error('itemId requerido');
  const q = `query($id: [ID!]){
    items(ids: $id){
      id name url updated_at
      board { id name }
      column_values {
        id type text value
        ... on PeopleValue { persons_and_teams { id kind } }
      }
    }
  }`;
  const data = await _mondayCall(q, { id: [String(itemId)] });
  return data?.items?.[0] || null;
}

/* ── ACTION: create_update ── */
async function createUpdate({ itemId, body, parentId }){
  if(!itemId || !body) throw new Error('itemId y body requeridos');
  const q = `mutation($itemId: ID!, $body: String!, $parentId: ID){
    create_update(item_id: $itemId, body: $body, parent_id: $parentId){
      id body created_at
      creator { id name }
    }
  }`;
  const data = await _mondayCall(q, {
    itemId: String(itemId), body, parentId: parentId ? String(parentId) : null
  });
  return data?.create_update || null;
}

/* ── ACTION: change_status ── */
async function changeStatus({ boardId, itemId, columnId, label }){
  if(!boardId || !itemId || !columnId || !label) throw new Error('Faltan parámetros');
  const q = `mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!){
    change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value){
      id name
    }
  }`;
  const value = JSON.stringify({ label });
  const data = await _mondayCall(q, {
    boardId: String(boardId), itemId: String(itemId), columnId, value
  });
  return data?.change_column_value || null;
}

/* ── ACTION: list_users (workspace) ── */
async function listUsers(){
  const q = `query{ users(limit: 200){ id name email title enabled } }`;
  const data = await _mondayCall(q);
  return (data?.users || []).filter(u => u.enabled);
}

/* ── Endpoint handler ── */
export default async (req) => {
  const CORS = _corsHeaders(req);

  if(req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if(req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: CORS });
  }

  /* Auth */
  const authToken = req.headers.get('x-auth-token') || '';
  if(!authToken) return _json({ error: 'No autorizado — sesión requerida' }, 401, CORS);
  const uid = await _validateUid(authToken);
  if(!uid) return _json({ error: 'Token inválido o expirado' }, 401, CORS);

  /* Token de Monday configurado */
  if(!Netlify.env.get('MONDAY_API_TOKEN')){
    return _json({ error: 'MONDAY_API_TOKEN no está configurado en Netlify · pídele al admin que lo agregue' }, 500, CORS);
  }

  let body;
  try { body = await req.json(); }
  catch { return _json({ error: 'JSON inválido' }, 400, CORS); }

  const action = body?.action;
  if(!action) return _json({ error: 'action requerida' }, 400, CORS);

  try {
    switch(action){
      case 'find_item_by_rol': {
        const result = await findItemByRol(body);
        return _json(result, 200, CORS);
      }
      case 'get_item': {
        const item = await getItem(body);
        return _json({ item }, 200, CORS);
      }
      case 'create_update': {
        const update = await createUpdate(body);
        return _json({ update }, 200, CORS);
      }
      case 'change_status': {
        const result = await changeStatus(body);
        return _json({ result }, 200, CORS);
      }
      case 'list_users': {
        const users = await listUsers();
        return _json({ users }, 200, CORS);
      }
      default:
        return _json({ error: 'action desconocida: ' + action }, 400, CORS);
    }
  } catch(e){
    console.warn('[monday]', action, 'error:', e.message);
    return _json({ error: e.message || String(e) }, 500, CORS);
  }
};

function _json(obj, status, cors){
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...(cors||{}) }
  });
}

export const config = {
  path: '/.netlify/functions/monday',
  maxDuration: 30
};
