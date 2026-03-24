/* Fiscalito — Drive Client Integration */
async function callDrive(body) {
  var res = await fetch('/.netlify/functions/drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var d = await res.json();
  if (!d.ok) throw new Error(d.error || 'Error en Drive');
  return d;
}

function driveIcon(m) {
  if (!m) return 'F';
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('document')) return 'DOC';
  if (m.includes('sheet')) return 'XLS';
  if (m.includes('image')) return 'IMG';
  return 'F';
}

function fmtSize(b) {
  if (!b) return '';
  var n = parseInt(b);
  if (n < 1024) return n + 'B';
  if (n < 1048576) return (n / 1024).toFixed(0) + 'KB';
  return (n / 1048576).toFixed(1) + 'MB';
}

async function loadDriveTab() {
  var caso = window._currentDriveCase;
  if (!caso) return;
  var no  = document.getElementById('driveNoFolder');
  var has = document.getElementById('driveHasFolder');
  var pic = document.getElementById('drivePicker');
  if (caso.drive_folder_id) {
    no.style.display  = 'none';
    has.style.display = 'block';
    pic.style.display = 'none';
    document.getElementById('driveFolderLink').href =
      caso.drive_folder_url || ('https://drive.google.com/drive/folders/' + caso.drive_folder_id);
    document.getElementById('driveFolderName').textContent = (caso.name || 'Caso') + ' - Drive';
    await driveRefreshFiles();
  } else {
    no.style.display  = 'block';
    has.style.display = 'none';
    pic.style.display = 'none';
  }
}

async function driveRefreshFiles() {
  var caso = window._currentDriveCase;
  if (!caso || !caso.drive_folder_id) return;
  var el = document.getElementById('driveFilesList');
  el.innerHTML = '<div class="drive-empty">Cargando...</div>';
  try {
    var r = await callDrive({ action: 'files', folderId: caso.drive_folder_id });
    if (!r.files.length) {
      el.innerHTML = '<div class="drive-empty">La carpeta esta vacia.</div>';
      return;
    }
    el.innerHTML = r.files.map(function(f) {
      return '<div class="drive-file-item"><span>' + driveIcon(f.mimeType) +
        '</span><a href="' + f.webViewLink + '" target="_blank">' + f.name +
        '</a><span class="drive-file-size">' + fmtSize(f.size) + '</span></div>';
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="drive-empty" style="color:#c00">' + e.message + '</div>';
  }
}

async function driveCreateFolder() {
  var caso = window._currentDriveCase;
  if (!caso) return;
  var name = prompt('Nombre de carpeta:', caso.rol ? (caso.rol + ' - ' + caso.name) : caso.name);
  if (!name) return;
  try {
    var r = await callDrive({ action: 'createFolder', caseId: caso.id, folderName: name });
    window._currentDriveCase.drive_folder_id  = r.folder.id;
    window._currentDriveCase.drive_folder_url = 'https://drive.google.com/drive/folders/' + r.folder.id;
    if (window._casesMap && window._casesMap[caso.id]) {
      window._casesMap[caso.id].drive_folder_id  = r.folder.id;
      window._casesMap[caso.id].drive_folder_url = window._currentDriveCase.drive_folder_url;
    }
    await loadDriveTab();
  } catch(e) { alert('Error al crear: ' + e.message); }
}

async function driveShowPicker() {
  var pic  = document.getElementById('drivePicker');
  var list = document.getElementById('drivePickerList');
  pic.style.display = 'block';
  list.innerHTML = '<div class="drive-empty">Cargando carpetas...</div>';
  try {
    var r = await callDrive({ action: 'list' });
    if (!r.folders.length) {
      list.innerHTML = '<div class="drive-empty">No hay carpetas en Drive.</div>';
      return;
    }
    list.innerHTML = r.folders.map(function(f) {
      return '<div class="drive-folder-option"><span>' + f.name +
        '</span><button onclick="driveLinkFolder(\'' + f.id + '\',\'' +
        f.name.replace(/'/g, "\\'") + '\')">Vincular</button></div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div class="drive-empty" style="color:#c00">' + e.message + '</div>';
  }
}

async function driveLinkFolder(folderId, folderName) {
  var caso = window._currentDriveCase;
  if (!caso) return;
  try {
    await callDrive({ action: 'link', caseId: caso.id, folderId: folderId, folderName: folderName });
    window._currentDriveCase.drive_folder_id  = folderId;
    window._currentDriveCase.drive_folder_url = 'https://drive.google.com/drive/folders/' + folderId;
    if (window._casesMap && window._casesMap[caso.id]) {
      window._casesMap[caso.id].drive_folder_id  = folderId;
      window._casesMap[caso.id].drive_folder_url = window._currentDriveCase.drive_folder_url;
    }
    await loadDriveTab();
  } catch(e) { alert('Error al vincular: ' + e.message); }
}

async function driveUnlink() {
  if (!confirm('Desvincular carpeta? No la elimina en Drive.')) return;
  var caso = window._currentDriveCase;
  await fetch(SB_URL + '/rest/v1/cases?id=eq.' + caso.id, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ drive_folder_id: null, drive_folder_url: null })
  });
  window._currentDriveCase.drive_folder_id  = null;
  window._currentDriveCase.drive_folder_url = null;
  if (window._casesMap && window._casesMap[caso.id]) {
    window._casesMap[caso.id].drive_folder_id  = null;
    window._casesMap[caso.id].drive_folder_url = null;
  }
  await loadDriveTab();
}
