import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MisCasos() {
    const [casoTerminados, setCasosTerminados] = useState([]);
    const [casosActivos, setCasosActivos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState('todos');
    const [busqueda, setBusqueda] = useState('');
    const [caseSeleccionado, setCaseSeleccionado] = useState(null);

  useEffect(() => {
        cargarCasos();
  }, []);

  const cargarCasos = async () => {
        try {
                setLoading(true);

          // Cargar casos terminados
          const { data: terminados } = await supabase
                  .from('cases')
                  .select(`
                            id,
                                      numero_expediente,
                                                tipo_procedimiento,
                                                          etapa,
                                                                    materia,
                                                                              protocolo,
                                                                                        resultado,
                                                                                                  fecha_denuncia,
                                                                                                            fecha_resolucion,
                                                                                                                      duracion_dias,
                                                                                                                                origen,
                                                                                                                                          judicializada,
                                                                                                                                                    medida_cautelar,
                                                                                                                                                              medida_cautelar_detalles,
                                                                                                                                                                        denunciantes,
                                                                                                                                                                                  estamentos_denunciante,
                                                                                                                                                                                            denunciados,
                                                                                                                                                                                                      estamentos_denunciado,
                                                                                                                                                                                                                drive_folder_url,
                                                                                                                                                                                                                          tipo_caso
                                                                                                                                                                                                                                  `)
                  .eq('estado', 'TERMINADO')
                  .order('numero_expediente');

          // Cargar casos activos
          const { data: activos } = await supabase
                  .from('casos')
                  .select(`
                            id,
                                      numero_expediente,
                                                tipo_procedimiento,
                                                          etapa,
                                                                    materia,
                                                                              protocolo,
                                                                                        resultado,
                                                                                                  fecha_denuncia,
                                                                                                            fecha_resolucion,
                                                                                                                      duracion_dias,
                                                                                                                                origen,
                                                                                                                                          judicializada,
                                                                                                                                                    medida_cautelar,
                                                                                                                                                              medida_cautelar_detalles,
                                                                                                                                                                        denunciantes,
                                                                                                                                                                                  estamentos_denunciante,
                                                                                                                                                                                            denunciados,
                                                                                                                                                                                                      estamentos_denunciado,
                                                                                                                                                                                                                drive_folder_url,
                                                                                                                                                                                                                          tipo_caso
                                                                                                                                                                                                                                  `)
                  .eq('estado', 'ACTIVO')
                  .order('numero_expediente');

          setCasosTerminados(terminados || []);
                setCasosActivos(activos || []);
        } catch (error) {
                console.error('Error al cargar casos:', error);
        } finally {
                setLoading(false);
        }
  };

  // Combinar y filtrar casos
  const todosCasos = [...(casoTerminados || []), ...(casosActivos || [])];

  const filteredCasos = todosCasos.filter((caso) => {
        const filtroOk = filtro === 'todos' || caso.tipo_caso === filtro;
        const busquedaOk = busqueda === '' || 
                (caso.numero_expediente && caso.numero_expediente.toLowerCase().includes(busqueda.toLowerCase())) ||
                (caso.materia && caso.materia.toLowerCase().includes(busqueda.toLowerCase()));
        return filtroOk && busquedaOk;
  });

  if (loading) {
        return <div className="p-8 text-center">Cargando casos...</div>div>;
  }
  
    return (
          <div className="p-6 bg-gray-50 min-h-screen">
                <h1 className="text-3xl font-bold mb-6 text-gray-800">📋 Mis Casos</h1>h1>
          
            {/* FILTROS Y BUSQUEDA */}
                <div className="mb-6 bg-white p-4 rounded shadow">
                        <div className="mb-4">
                                  <input
                                                type="text"
                                                placeholder="Buscar expediente, materia o ROL..."
                                                value={busqueda}
                                                onChange={(e) => setBusqueda(e.target.value)}
                                                className="w-full px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                              />
                        </div>div>
                
                        <div className="flex gap-2 flex-wrap">
                                  <button onClick={() => setFiltro('todos')} className={`px-4 py-2 rounded font-semibold ${filtro === 'todos' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Todos ({filteredCasos.length})</button>button>
                                  <button onClick={() => setFiltro('genero')} className={`px-4 py-2 rounded font-semibold ${filtro === 'genero' ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>Genero ({filteredCasos.filter(c => c.tipo_caso === 'genero').length})</button>button>
                                  <button onClick={() => setFiltro('no_genero')} className={`px-4 py-2 rounded font-semibold ${filtro === 'no_genero' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}>No Genero ({filteredCasos.filter(c => c.tipo_caso === 'no_genero').length})</button>button>
                        </div>div>
                </div>div>
          
            {/* TABLA DE CASOS */}
                <div className="bg-white rounded shadow overflow-x-auto">
                        <table className="min-w-full border-collapse">
                                  <thead className="bg-gray-100 sticky top-0">
                                              <tr>
                                                            <th className="text-left px-4 py-2 border-b font-semibold">EXP.</th>th>
                                                            <th className="text-left px-4 py-2 border-b font-semibold">PROCEDIMIENTO</th>th>
                                                            <th className="text-left px-4 py-2 border-b font-semibold">MATERIA</th>th>
                                                            <th className="text-left px-4 py-2 border-b font-semibold">PROTOCOLO</th>th>
                                                            <th className="text-left px-4 py-2 border-b font-semibold">RESULTADO</th>th>
                                                            <th className="text-center px-4 py-2 border-b font-semibold">DURACION</th>th>
                                                            <th className="text-center px-4 py-2 border-b font-semibold">M. CAUTELAR</th>th>
                                                            <th className="text-center px-4 py-2 border-b font-semibold">📁 DRIVE</th>th>
                                                            <th className="text-center px-4 py-2 border-b font-semibold">ACCIONES</th>th>
                                              </tr>tr>
                                  </thead>thead>
                                  <tbody>
                                    {filteredCasos.map((caso) => (
                          <tr key={caso.id} className="hover:bg-blue-50 border-b cursor-pointer transition" onClick={() => setCaseSeleccionado(caso)}>
                                          <td className="px-4 py-2 font-semibold text-blue-600">{caso.numero_expediente}</td>td>
                                          <td className="px-4 py-2 text-sm">{caso.tipo_procedimiento || '-'}</td>td>
                                          <td className="px-4 py-2">{caso.materia || '-'}</td>td>
                                          <td className="px-4 py-2 text-sm">{caso.protocolo || '-'}</td>td>
                                          <td className="px-4 py-2 text-sm">{caso.resultado ? <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">{caso.resultado}</span>span> : '-'}</td>td>
                                          <td className="px-4 py-2 text-center">{caso.duracion_dias ? <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm font-semibold">{caso.duracion_dias}d</span>span> : '-'}</td>td>
                                          <td className="px-4 py-2 text-center">{caso.medida_cautelar ? <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-semibold">SI</span>span> : <span className="text-gray-400">No</span>span>}</td>td>
                                          <td className="px-4 py-2 text-center">{caso.drive_folder_url ? <a href={caso.drive_folder_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition font-semibold" onClick={(e) => e.stopPropagation()} title="Abrir carpeta en Google Drive">📁 Ver</a>a> : <span className="text-gray-300 text-sm">-</span>span>}</td>td>
                                          <td className="px-4 py-2 text-center"><button onClick={(e) => {e.stopPropagation(); setCaseSeleccionado(caso);}} className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">Ver</button>button></td>td>
                          </tr>tr>
                        ))}
                                  </tbody>tbody>
                        </table>table>
                </div>div>
          
            {/* MODAL DE DETALLES */}
            {caseSeleccionado && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                              <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-96 overflow-y-auto">
                                          <div className="sticky top-0 bg-gray-100 px-6 py-4 flex justify-between items-center border-b">
                                                        <h2 className="text-xl font-bold">Caso {caseSeleccionado.numero_expediente}</h2>h2>
                                                        <button onClick={() => setCaseSeleccionado(null)} className="text-2xl text-gray-500 hover:text-gray-800">✕</button>button>
                                          </div>div>
                                          <div className="p-6 space-y-4">
                                                        <div className="grid grid-cols-2 gap-4">
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Expediente</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.numero_expediente}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Materia</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.materia || '-'}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Procedimiento</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.tipo_procedimiento || '-'}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Protocolo</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.protocolo || '-'}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Duracion</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.duracion_dias || '-'} dias</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Resultado</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.resultado || '-'}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Fecha Denuncia</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.fecha_denuncia || '-'}</p>p>
                                                                        </div>div>
                                                                        <div>
                                                                                          <p className="text-gray-600 text-sm">Fecha Resolucion</p>p>
                                                                                          <p className="font-semibold">{caseSeleccionado.fecha_resolucion || '-'}</p>p>
                                                                        </div>div>
                                                          {caseSeleccionado.medida_cautelar && (
                                        <div className="col-span-2">
                                                            <p className="text-gray-600 text-sm">Medida Cautelar</p>p>
                                                            <p className="font-semibold text-red-600">{caseSeleccionado.medida_cautelar_detalles || 'Si'}</p>p>
                                        </div>div>
                                                                        )}
                                                        </div>div>
                                            {caseSeleccionado.drive_folder_url && (
                                      <div className="bg-blue-50 p-4 rounded border border-blue-200">
                                                        <p className="text-sm text-gray-600 mb-2">Carpeta de Google Drive:</p>p>
                                                        <a href={caseSeleccionado.drive_folder_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">📁 Abrir en Google Drive</a>a>
                                      </div>div>
                                                        )}
                                          </div>div>
                              </div>div>
                    </div>div>
                )}
          </div>div>
        );
}</div>
