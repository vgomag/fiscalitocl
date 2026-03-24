// netlify/functions/drive.js v4 — matching mejorado

const FOLDER_MIS_CASOS  = '135lX5Ns5I-yJlEO9Zt10ksPweWeWGw5U';
const FOLDER_TERMINADOS = '1ZPCvFDNhNJzYITPozaQPXw8M6Axyu34B';

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function getAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now()/1000);
  const hdr = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const pay = base64url(JSON.stringify({
    iss:sa.client_email, scope:'https://www.googleapis.com/auth/drive',
    aud:'https://oauth2.googleapis.com/token', iat:now, exp:now+3600
  }));
  const si = `${hdr}.${pay}`;
  const key = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,'');
  const ck  = await crypto.subtle.importKey('pkcs8',Buffer.from(key,'base64'),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',ck,Buffer.from(si));
  const jwt = `${si}.${Buffer.from(new Uint8Array(sig)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
  const r = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})
  });
  const d = await r.json();
  if(!d.access_token) throw new Error('OAuth: '+JSON.stringify(d));
  return d.access_token;
}

async function gList(q, token, fields='files(id,name,webViewLink,mimeType,size,modifiedTime)') {
  const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('files(id,name,webViewLink,createdTime,modifiedTime,mimeType,size)')}&orderBy=name&pageSize=200`;
  const r = await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok) throw new Error(`Drive ${r.status}: ${await r.text()}`);
  return (await r.json()).files||[];
}

const listFolders = (pid,tk) => gList(`'${pid}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,tk);
const listFiles   = (pid,tk) => gList(`'${pid}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`,tk);

async function createFolder(name,parent,token){
  const r=await fetch('https://www.googleapis.com/drive/v3/files',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})
  });
  if(!r.ok) throw new Error(`Drive ${r.status}: ${await r.text()}`);
  return r.json();
}

// Supabase
const sbKey = ()=> process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_ANON_KEY;
const sbH   = ()=>({apikey:sbKey(),Authorization:`Bearer ${sbKey()}`,'Content-Type':'application/json'});
const sbGet = async p=>(await fetch(`${process.env.SUPABASE_URL}/rest/v1/${p}`,{headers:sbH()})).json();
const sbPatch= async(id,body)=>(await fetch(`${process.env.SUPABASE_URL}/rest/v1/cases?id=eq.${id}`,{
  method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify(body)
})).ok;

// ── Algoritmo de match mejorado ──────────────────────────────────────────────
function norm(s){
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
}

// Extrae el "núcleo" de un nombre de carpeta Drive
// "Expediente 34 G" → "34 G"
// "Expediente 1006-2023-VRAC" → "1006 2023 vrac"
// "Expediente 08-2023-VRAC" → "08 2023 vrac"
function folderCore(name) {
  return norm(name.replace(/^expediente\s+/i,'').replace(/^exp\.?\s+/i,''));
}

// Extrae variantes de búsqueda de un caso
function caseTokens(caso) {
  const tokens = [];
  // Nombre normalizado completo
  tokens.push(norm(caso.name||''));
  // ROL normalizado
  const rolN = norm(caso.rol||'');
  if(rolN) tokens.push(rolN);
  // Solo los números del ROL (ej: "1006 2023" de "1006-2023-VRAC")
  const nums = (caso.rol||'').replace(/[^0-9]/g,' ').replace(/\s+/g,' ').trim();
  if(nums) tokens.push(nums);
  // Primer número (ej: "1006")
  const first = nums.split(' ')[0];
  if(first && first.length>=2) tokens.push(first);
  // Nombre sin sufijo de procedimiento (ej: "34 G" de "34 G - Investigación...")
  const namePart = (caso.name||'').split('-')[0].trim();
  if(namePart) tokens.push(norm(namePart));
  return [...new Set(tokens.filter(t=>t.length>=2))];
}

function matchScore(folderName, caso) {
  const core = folderCore(folderName);
  if(!core) return 0;

  // Match exacto del core con el nombre del caso
  const nameN = norm(caso.name||'');
  if(core === nameN) return 100;
  if(nameN.startsWith(core) || core.startsWith(nameN.split(' ').slice(0,3).join(' '))) return 95;

  // Match del core con ROL normalizado
  const rolN = norm(caso.rol||'');
  if(core === rolN) return 98;
  if(rolN && core.includes(rolN.substring(0,8))) return 90;
  if(rolN && rolN.includes(core.substring(0,8))) return 88;

  // Match por tokens del caso contra el core
  for(const token of caseTokens(caso)) {
    if(token.length < 2) continue;
    if(core === token) return 95;
    if(core.startsWith(token) && token.length >= 4) return 88;
    if(token.startsWith(core) && core.length >= 4) return 85;
  }

  // Match por número principal del ROL contra core
  const rolBase = (caso.rol||'').replace(/[^0-9]/g,' ').trim().split(/\s+/)[0];
  if(rolBase && rolBase.length>=3 && core.includes(rolBase)) return 85;

  // Match parcial: al menos 5 chars en común al inicio
  const minLen = Math.min(core.length, nameN.length);
  if(minLen>=5 && core.substring(0,5) === nameN.substring(0,5)) return 75;

  return 0;
}

const H = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Content-Type':'application/json'};

exports.handler = async(event)=>{
  if(event.httpMethod==='OPTIONS') return{statusCode:200,headers:H,body:''};
  try{
    const body  = JSON.parse(event.body||'{}');
    const {action} = body;
    const token = await getAccessToken();

    if(action==='list'){
      const folders = await listFolders(body.parentId||FOLDER_MIS_CASOS,token);
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,folders})};
    }

    if(action==='files'){
      if(!body.folderId) throw new Error('folderId requerido');
      const files = await listFiles(body.folderId,token);
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,files})};
    }

    if(action==='link'){
      if(!body.caseId||!body.folderId) throw new Error('caseId y folderId requeridos');
      await sbPatch(body.caseId,{
        drive_folder_id:body.folderId,
        drive_folder_url:`https://drive.google.com/drive/folders/${body.folderId}`
      });
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true})};
    }

    if(action==='createFolder'){
      if(!body.caseId||!body.folderName) throw new Error('caseId y folderName requeridos');
      const folder = await createFolder(body.folderName,FOLDER_MIS_CASOS,token);
      await sbPatch(body.caseId,{
        drive_folder_id:folder.id,
        drive_folder_url:`https://drive.google.com/drive/folders/${folder.id}`
      });
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,folder})};
    }

    if(action==='sync'){
      // 1. Todos los casos
      const cases = await sbGet('cases?select=id,name,rol,caratula,drive_folder_id&deleted_at=is.null&limit=500');
      const linkedIds = new Set(cases.filter(c=>c.drive_folder_id).map(c=>c.id));

      // 2. Recopilar TODAS las carpetas de todos los directorios raíz
      const roots = [FOLDER_MIS_CASOS, FOLDER_TERMINADOS];
      const allFolders = [];

      for(const rootId of roots){
        const top = await listFolders(rootId,token);
        for(const tf of top){
          const subs = await listFolders(tf.id,token);
          if(subs.length>0) allFolders.push(...subs);
          else allFolders.push(tf);
        }
      }

      // 3. Matching con algoritmo mejorado
      const results={linked:[],skipped:[],unmatched:[]};

      for(const folder of allFolders){
        let best=null,bestScore=0;
        for(const caso of cases){
          if(linkedIds.has(caso.id)) continue;
          const score=matchScore(folder.name,caso);
          if(score>bestScore){bestScore=score;best=caso;}
        }
        if(best && bestScore>=75){
          await sbPatch(best.id,{
            drive_folder_id:folder.id,
            drive_folder_url:`https://drive.google.com/drive/folders/${folder.id}`
          });
          linkedIds.add(best.id);
          results.linked.push({folder:folder.name,case:best.name,rol:best.rol,score:bestScore});
        } else {
          results.unmatched.push(folder.name);
        }
      }

      for(const caso of cases){
        if(!linkedIds.has(caso.id)) results.skipped.push(caso.name);
      }

      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,results})};
    }

    return{statusCode:400,headers:H,body:JSON.stringify({error:`Acción desconocida: ${action}`})};

  }catch(err){
    console.error('drive.js error:',err);
    return{statusCode:500,headers:H,body:JSON.stringify({error:err.message})};
  }
};
