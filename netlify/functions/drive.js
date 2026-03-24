// netlify/functions/drive.js v3 — 3 carpetas raíz + sync recursivo

const FOLDER_MIS_CASOS     = '135lX5Ns5I-yJlEO9Zt10ksPweWeWGw5U';
const FOLDER_TERMINADOS    = '1ZPCvFDNhNJzYITPozaQPXw8M6Axyu34B';

function base64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function getAccessToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now()/1000);
  const header  = base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload = base64url(JSON.stringify({
    iss:sa.client_email,
    scope:'https://www.googleapis.com/auth/drive',
    aud:'https://oauth2.googleapis.com/token',
    iat:now, exp:now+3600
  }));
  const sigInput = `${header}.${payload}`;
  const keyData  = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/,'')
    .replace(/-----END PRIVATE KEY-----/,'')
    .replace(/\n/g,'');
  const binaryKey = Buffer.from(keyData,'base64');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5',cryptoKey,Buffer.from(sigInput));
  const jwt = `${sigInput}.${Buffer.from(new Uint8Array(sig)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
  const res = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})
  });
  const data = await res.json();
  if(!data.access_token) throw new Error('OAuth error: '+JSON.stringify(data));
  return data.access_token;
}

async function driveListFolders(parentId, token) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=name&pageSize=200`,
    {headers:{Authorization:`Bearer ${token}`}});
  if(!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return (await res.json()).files||[];
}

async function driveListFiles(parentId, token) {
  const q = encodeURIComponent(`'${parentId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink,mimeType,size,modifiedTime)&orderBy=name&pageSize=200`,
    {headers:{Authorization:`Bearer ${token}`}});
  if(!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return (await res.json()).files||[];
}

async function driveCreateFolder(name, parentId, token) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files',{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})
  });
  if(!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return res.json();
}

// Supabase
function sbH() {
  const key = process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_ANON_KEY;
  return {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
}
async function sbGet(path) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`,{headers:sbH()});
  return res.json();
}
async function sbPatch(id, body) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/cases?id=eq.${id}`,{
    method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify(body)
  });
  return res.ok;
}

// Match carpeta ↔ caso
function norm(s){
  return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
}
function matchScore(folderName, caso) {
  const fn   = norm(folderName);
  const rol  = norm(caso.rol||'');
  const name = norm(caso.name||'');
  // Extraer número base del ROL (ej: "813" de "813-2023-VRAC")
  const rolBase = (caso.rol||'').replace(/[^0-9]/g,' ').trim().split(' ')[0];
  // Extraer número de la carpeta (ej: "08-2023-vrac" → "08")
  const folderNum = folderName.replace(/[^0-9\-]/g,' ').trim().split(/\s+/)[0];
  if(rolBase && rolBase.length>=2 && fn.includes(rolBase.toLowerCase())) return 95;
  if(folderNum && folderNum.length>=2 && rol.includes(folderNum.replace(/-/g,' ').toLowerCase())) return 90;
  if(rol && rol.length>2 && fn.includes(rol.substring(0,6))) return 85;
  if(name && name.length>3 && fn.includes(name.substring(0,6))) return 80;
  return 0;
}

const H = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Content-Type':'application/json'};

exports.handler = async(event) => {
  if(event.httpMethod==='OPTIONS') return{statusCode:200,headers:H,body:''};
  try{
    const body  = JSON.parse(event.body||'{}');
    const action= body.action;
    const token = await getAccessToken();

    // list: listar subcarpetas de una carpeta padre
    if(action==='list'){
      const folders = await driveListFolders(body.parentId||FOLDER_MIS_CASOS, token);
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,folders})};
    }

    // files: listar archivos de carpeta de un caso
    if(action==='files'){
      if(!body.folderId) throw new Error('folderId requerido');
      const files = await driveListFiles(body.folderId, token);
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,files})};
    }

    // link: vincular carpeta a caso
    if(action==='link'){
      if(!body.caseId||!body.folderId) throw new Error('caseId y folderId requeridos');
      await sbPatch(body.caseId,{
        drive_folder_id:body.folderId,
        drive_folder_url:`https://drive.google.com/drive/folders/${body.folderId}`
      });
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true})};
    }

    // createFolder: crear carpeta nueva en Mis Casos
    if(action==='createFolder'){
      if(!body.caseId||!body.folderName) throw new Error('caseId y folderName requeridos');
      const folder = await driveCreateFolder(body.folderName, FOLDER_MIS_CASOS, token);
      await sbPatch(body.caseId,{
        drive_folder_id:folder.id,
        drive_folder_url:`https://drive.google.com/drive/folders/${folder.id}`
      });
      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,folder})};
    }

    // sync: vincular automáticamente carpetas a casos
    if(action==='sync'){
      // 1. Obtener casos sin carpeta vinculada
      const cases = await sbGet('cases?select=id,name,rol,caratula,drive_folder_id&deleted_at=is.null&limit=500');

      // 2. Recopilar todas las carpetas de los 3 directorios raíz
      const rootFolders = [
        {id: FOLDER_MIS_CASOS,  name: 'Mis Casos (activos)'},
        {id: FOLDER_TERMINADOS, name: 'Terminados'}
      ];
      
      const allFolders = [];
      for(const root of rootFolders){
        const topLevel = await driveListFolders(root.id, token);
        for(const tf of topLevel){
          // Ver si tiene subcarpetas (ej: "Investigaciones Género" → subcarpetas de casos)
          const subs = await driveListFolders(tf.id, token);
          if(subs.length > 0){
            allFolders.push(...subs);
          } else {
            // La carpeta es directamente un caso
            allFolders.push(tf);
          }
        }
      }

      // 3. Matching
      const results = {linked:[], skipped:[], unmatched:[]};
      const linkedIds = new Set(cases.filter(c=>c.drive_folder_id).map(c=>c.id));

      for(const folder of allFolders){
        let best=null, bestScore=0;
        for(const caso of cases){
          if(linkedIds.has(caso.id)) continue;
          const score = matchScore(folder.name, caso);
          if(score>bestScore){bestScore=score;best=caso;}
        }
        if(best && bestScore>=80){
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

      // 4. Casos sin carpeta
      for(const caso of cases){
        if(!caso.drive_folder_id && !linkedIds.has(caso.id)){
          results.skipped.push(caso.name);
        }
      }

      return{statusCode:200,headers:H,body:JSON.stringify({ok:true,results})};
    }

    return{statusCode:400,headers:H,body:JSON.stringify({error:`Acción desconocida: ${action}`})};

  }catch(err){
    console.error('drive.js error:',err);
    return{statusCode:500,headers:H,body:JSON.stringify({error:err.message})};
  }
};
