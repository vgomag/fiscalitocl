import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MisCasos() {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState(null);
  const [driveUrl, setDriveUrl] = useState('');

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .order('numero_expediente');

      if (error) throw error;
      setCasos(data || []);
    } catch (error) {
      console.error('Error cargando casos:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveDriveUrl = async () => {
    if (!driveUrl.trim() || !selectedCase) return;

    try {
      const { error } = await supabase
        .from('cases')
        .update({ drive_folder_url: driveUrl })
        .eq('id', selectedCase.id);

      if (error) throw error;

      setCasos(casos.map(c => 
        c.id === selectedCase.id ? { ...c, drive_folder_url: driveUrl } : c
      ));
      setSelectedCase(null);
      setDriveUrl('');
      alert('✓ Enlace guardado');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  if (loading) return <div className="p-8">Cargando...</div>;

  return (
    <div className="p-6 bg-gray-50">
      <h1 className="text-3xl font-bold mb-6">📋 Mis Casos</h1>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Expediente</th>
              <th className="px-4 py-2 text-left">Procedimiento</th>
              <th className="px-4 py-2 text-left">Materia</th>
              <th className="px-4 py-2 text-left">Protocolo</th>
              <th className="px-4 py-2 text-center">📁 Drive</th>
              <th className="px-4 py-2 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {casos.map(caso => (
              <tr key={caso.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2 font-bold text-blue-600">{caso.numero_expediente}</td>
                <td className="px-4 py-2 text-sm">{caso.tipo_procedimiento}</td>
                <td className="px-4 py-2">{caso.materia}</td>
                <td className="px-4 py-2 text-sm">{caso.protocolo}</td>
                <td className="px-4 py-2 text-center">
                  {caso.drive_folder_url ? (
                    <a href={caso.drive_folder_url} target="_blank" rel="noopener noreferrer" 
                       className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-semibold">
                      ✓ Vinculado
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => { setSelectedCase(caso); setDriveUrl(caso.drive_folder_url || ''); }}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Caso {selectedCase.numero_expediente}</h2>

            <div className="mb-4 space-y-2">
              <p><strong>Materia:</strong> {selectedCase.materia}</p>
              <p><strong>Procedimiento:</strong> {selectedCase.tipo_procedimiento}</p>
              <p><strong>Protocolo:</strong> {selectedCase.protocolo}</p>
            </div>

            <div className="bg-blue-50 p-4 rounded border border-blue-200 mb-4">
              <h3 className="font-bold text-blue-900 mb-3">📁 Vincular Google Drive</h3>
              <label className="text-sm text-gray-600 block mb-2">Enlace de la carpeta:</label>
              <input type="text" value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..." 
                className="w-full px-3 py-2 border rounded mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2">
                <button onClick={saveDriveUrl} className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold">
                  Guardar
                </button>
                <button onClick={() => setSelectedCase(null)} className="flex-1 px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500">
                  Cerrar
                </button>
              </div>
            </div>

            {selectedCase.drive_folder_url && (
              <a href={selectedCase.drive_folder_url} target="_blank" rel="noopener noreferrer"
                className="block w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-center font-semibold">
                Abrir en Google Drive →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
