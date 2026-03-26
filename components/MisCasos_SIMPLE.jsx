import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MisCasos() {
  const [casos, setCasos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [casoSeleccionado, setCasoSeleccionado] = useState(null);
  const [driveLink, setDriveLink] = useState('');
  const [editando, setEditando] = useState(null);

  useEffect(() => {
    cargarCasos();
  }, []);

  const cargarCasos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .order('numero_expediente');

      if (error) {
        console.error('Error al cargar casos:', error);
        return;
      }

      setCasos(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const guardarDriveLink = async (casoId) => {
    if (!driveLink.trim()) {
      alert('Por favor ingresa un enlace válido');
      return;
    }

    try {
      const { error } = await supabase
        .from('cases')
        .update({ drive_folder_url: driveLink })
        .eq('id', casoId);

      if (error) {
        alert('Error al guardar: ' + error.message);
        return;
      }

      setCasos(casos.map(c => 
        c.id === casoId ? { ...c, drive_folder_url: driveLink } : c
      ));

      setDriveLink('');
      setEditando(null);
      alert('Enlace guardado exitosamente');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const filteredCasos = casos.filter((caso) => {
    const filtroOk = filtro === 'todos' || 
      (filtro === 'genero' && caso.tipo_caso === 'genero') ||
      (filtro === 'no_genero' && caso.tipo_caso === 'no_genero');
    
    const busquedaOk = busqueda === '' || 
      (caso.numero_expediente && caso.numero_expediente.toLowerCase().includes(busqueda.toLowerCase())) ||
      (caso.materia && caso.materia.toLowerCase().includes(busqueda.toLowerCase()));
    
    return filtroOk && busquedaOk;
  });

  if (loading) {
    return <div className="p-8 text-center">Cargando casos...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">📋 Mis Casos</h1>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="mb-6 bg-white p-4 rounded shadow">
        <div className="mb-4">
          <input
            type="text"
            placeholder="Buscar expediente o materia..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltro('todos')}
            className={`px-4 py-2 rounded font-semibold ${filtro === 'todos' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
          >
            Todos ({filteredCasos.length})
          </button>
          <button
            onClick={() => setFiltro('genero')}
            className={`px-4 py-2 rounded font-semibold ${filtro === 'genero' ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
          >
            Género ({filteredCasos.filter(c => c.tipo_caso === 'genero').length})
          </button>
          <button
            onClick={() => setFiltro('no_genero')}
            className={`px-4 py-2 rounded font-semibold ${filtro === 'no_genero' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
          >
            No Género ({filteredCasos.filter(c => c.tipo_caso === 'no_genero').length})
          </button>
        </div>
      </div>

      {/* TABLA DE CASOS */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 border-b font-semibold">EXP.</th>
              <th className="text-left px-4 py-2 border-b font-semibold">PROCEDIMIENTO</th>
              <th className="text-left px-4 py-2 border-b font-semibold">MATERIA</th>
              <th className="text-left px-4 py-2 border-b font-semibold">PROTOCOLO</th>
              <th className="text-center px-4 py-2 border-b font-semibold">📁 DRIVE</th>
              <th className="text-center px-4 py-2 border-b font-semibold">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {filteredCasos.map((caso) => (
              <tr key={caso.id} className="hover:bg-blue-50 border-b cursor-pointer transition">
                <td className="px-4 py-2 font-semibold text-blue-600">{caso.numero_expediente || '-'}</td>
                <td className="px-4 py-2 text-sm">{caso.tipo_procedimiento || '-'}</td>
                <td className="px-4 py-2">{caso.materia || '-'}</td>
                <td className="px-4 py-2 text-sm">{caso.protocolo || '-'}</td>
                <td className="px-4 py-2 text-center">
                  {caso.drive_folder_url ? (
                    <a
                      href={caso.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition font-semibold text-sm"
                      title="Abrir en Google Drive"
                    >
                      ✓ Vinculado
                    </a>
                  ) : (
                    <span className="text-gray-400 text-sm">Sin vincular</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => {
                      setCasoSeleccionado(caso);
                      setEditando(caso.id);
                      setDriveLink(caso.drive_folder_url || '');
                    }}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE DETALLES */}
      {casoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-gray-100 px-6 py-4 flex justify-between items-center border-b">
              <h2 className="text-xl font-bold">Caso {casoSeleccionado.numero_expediente}</h2>
              <button
                onClick={() => {
                  setCasoSeleccionado(null);
                  setEditando(null);
                  setDriveLink('');
                }}
                className="text-2xl text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* INFORMACIÓN DEL CASO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600 text-sm">Expediente</p>
                  <p className="font-semibold">{casoSeleccionado.numero_expediente || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Materia</p>
                  <p className="font-semibold">{casoSeleccionado.materia || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Procedimiento</p>
                  <p className="font-semibold">{casoSeleccionado.tipo_procedimiento || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-600 text-sm">Protocolo</p>
                  <p className="font-semibold">{casoSeleccionado.protocolo || '-'}</p>
                </div>
              </div>

              {/* SECCIÓN GOOGLE DRIVE - SIMPLE */}
              <div className="bg-blue-50 p-4 rounded border border-blue-200 mt-6">
                <h3 className="font-bold text-blue-900 mb-3">📁 Vincular Google Drive</h3>
                
                {editando === casoSeleccionado.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-gray-600">Pega el enlace de Google Drive:</label>
                      <input
                        type="text"
                        value={driveLink}
                        onChange={(e) => setDriveLink(e.target.value)}
                        placeholder="https://drive.google.com/drive/folders/..."
                        className="w-full px-3 py-2 border border-gray-300 rounded mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => guardarDriveLink(casoSeleccionado.id)}
                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
                      >
                        ✓ Guardar enlace
                      </button>
                      <button
                        onClick={() => {
                          setEditando(null);
                          setDriveLink('');
                        }}
                        className="flex-1 px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {casoSeleccionado.drive_folder_url ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-700">
                          <strong>Enlace guardado:</strong>
                        </p>
                        <a
                          href={casoSeleccionado.drive_folder_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-center font-semibold"
                        >
                          Abrir en Google Drive →
                        </a>
                        <button
                          onClick={() => {
                            setEditando(casoSeleccionado.id);
                            setDriveLink(casoSeleccionado.drive_folder_url);
                          }}
                          className="w-full px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 text-sm"
                        >
                          Cambiar enlace
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditando(casoSeleccionado.id);
                          setDriveLink('');
                        }}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold"
                      >
                        + Vincular Google Drive
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
