import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { MapPin, Truck, Users, CheckCircle2, Clock, ExternalLink, RefreshCw, Play, Navigation, LogIn } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ESTADO_STYLES: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700',
  en_curso:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
};

const ConductorView: React.FC = () => {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [rutas, setRutas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [registrandoLlegada, setRegistrandoLlegada] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/mi-ruta-conductor`, { headers });
      setRutas(data);
    } catch { toast.error('Error al cargar tu ruta'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleIniciarRuta = async (rutaId: number) => {
    setIniciando(rutaId);
    try {
      await axios.post(`${API}/api/rutas/${rutaId}/iniciar-ruta`, {}, { headers });
      toast.success('Ruta iniciada');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al iniciar ruta');
    } finally { setIniciando(null); }
  };

  const registrarLlegada = async (rutaODPId: number) => {
    setRegistrandoLlegada(rutaODPId);
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/llegada`, {}, { headers });
      toast.success('¡Llegada registrada!');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al registrar llegada');
    } finally {
      setRegistrandoLlegada(null);
    }
  };

  const abrirMapa = (direccion: string) => {
    const q = encodeURIComponent(direccion);
    window.open(`https://maps.google.com/maps?q=${q}`, '_blank');
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
    </div>
  );

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mi Ruta</h1>
          <p className="text-xs text-slate-500 mt-0.5">{rutas.length} ruta{rutas.length !== 1 ? 's' : ''} asignada{rutas.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {rutas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Truck className="w-14 h-14 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">Sin rutas asignadas</h3>
          <p className="text-sm text-slate-500 mt-1">No tienes rutas programadas por el momento.</p>
        </div>
      ) : (
        rutas.map((ruta: any) => {
          const enCurso = ruta.estado === 'en_curso';
          const completada = ruta.estado === 'completada';
          const stops = (ruta.ruta_odps || []).sort((a: any, b: any) => a.orden - b.orden);

          return (
            <div key={ruta.id} className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
              {/* Header de la ruta */}
              <div className={`p-4 border-b border-slate-100 ${enCurso ? 'bg-amber-50' : completada ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Truck className={`w-5 h-5 ${enCurso ? 'text-amber-600' : completada ? 'text-emerald-600' : 'text-slate-500'}`} />
                    <span className="font-bold text-slate-800">Ruta #{ruta.id}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${ESTADO_STYLES[ruta.estado] || 'bg-slate-100 text-slate-600'}`}>
                      {ruta.estado}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {stops.length} parada{stops.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Vehículo */}
                {ruta.vehiculo && (
                  <p className="text-xs text-slate-600 flex items-center gap-1.5 mb-1">
                    <Truck className="w-3 h-3" />
                    <span className="font-semibold">{ruta.vehiculo.tipo.toUpperCase()}</span> — {ruta.vehiculo.placa}
                  </p>
                )}

                {/* Instaladores */}
                {ruta.instaladores?.length > 0 && (
                  <p className="text-xs text-slate-600 flex items-center gap-1.5 mb-2">
                    <Users className="w-3 h-3" />
                    {ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}
                  </p>
                )}

                {/* Botón iniciar ruta */}
                {!enCurso && !completada && (
                  <button onClick={() => handleIniciarRuta(ruta.id)} disabled={iniciando === ruta.id}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 text-sm">
                    {iniciando === ruta.id
                      ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Iniciando...</>
                      : <><Play className="w-4 h-4" /> Iniciar ruta</>
                    }
                  </button>
                )}
                {enCurso && (
                  <div className="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mt-1">
                    <Navigation className="w-3.5 h-3.5" /> Ruta en curso
                  </div>
                )}
                {completada && (
                  <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ruta completada
                  </div>
                )}

                {ruta.observaciones && (
                  <div className="mt-2 bg-white rounded-lg px-3 py-2 border border-amber-200 text-xs text-amber-700">
                    {ruta.observaciones}
                  </div>
                )}
              </div>

              {/* Lista de paradas */}
              <div className="divide-y divide-slate-50">
                {stops.map((stop: any, idx: number) => {
                  const stopCompletada = stop.estado === 'completada';
                  const stopEnCurso = stop.estado === 'en_curso';
                  return (
                    <div key={stop.id} className={`p-4 ${stopEnCurso ? 'bg-amber-50/50' : stopCompletada ? 'bg-emerald-50/50' : ''}`}>
                      <div className="flex items-start gap-3">
                        {/* Número de parada */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${stopCompletada ? 'bg-emerald-500 text-white' : stopEnCurso ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {stopCompletada ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-800 text-sm">{stop.odp?.numero_odp}</span>
                            <span className="text-xs text-slate-500">{stop.odp?.cliente?.nombre_razon_social}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${stopCompletada ? 'bg-emerald-100 text-emerald-700' : stopEnCurso ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {stop.estado}
                            </span>
                          </div>

                          {stop.odp?.direccion_instalacion && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <MapPin className="w-3 h-3 text-rose-500 flex-shrink-0" />
                              <p className="text-xs text-slate-500 flex-1 truncate">{stop.odp.direccion_instalacion}</p>
                              <button onClick={() => abrirMapa(stop.odp.direccion_instalacion)}
                                className="flex items-center gap-1 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium flex-shrink-0">
                                <ExternalLink className="w-3 h-3" /> Mapa
                              </button>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                            <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {stop.fecha_programada}</span>
                            {stop.llegada_conductor && (
                              <span className="text-indigo-600 flex items-center gap-0.5">
                                <LogIn className="w-3 h-3" /> {new Date(stop.llegada_conductor).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            {stop.inicio_instalacion && (
                              <span className="text-amber-600">▶ {new Date(stop.inicio_instalacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                            {stop.fin_instalacion && (
                              <span className="text-emerald-600">✓ {new Date(stop.fin_instalacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                            )}
                          </div>

                          {/* Botón llegué: solo si ruta en_curso, parada pendiente o en_curso, y no hay llegada registrada */}
                          {enCurso && !stopCompletada && !stop.llegada_conductor && (
                            <button
                              onClick={() => registrarLlegada(stop.id)}
                              disabled={registrandoLlegada === stop.id}
                              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              {registrandoLlegada === stop.id ? 'Registrando...' : 'Llegué'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default ConductorView;
