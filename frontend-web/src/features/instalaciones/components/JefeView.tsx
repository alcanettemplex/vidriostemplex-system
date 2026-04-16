import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { CheckCircle2, Clock, AlertTriangle, MapPin, Truck, Users, Calendar, Pencil, Trash2, Plus, RefreshCw } from 'lucide-react';
import ProgramarRutaModal from './ProgramarRutaModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ESTADO_RUTA_STYLES: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700',
  en_curso:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
  cancelada:  'bg-slate-100 text-slate-500',
};

const ESTADO_ODP_RUTA_STYLES: Record<string, string> = {
  pendiente:  'bg-slate-100 text-slate-600',
  en_curso:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
};

const JefeView: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState<'listos' | 'pago' | 'produccion'>('listos');
  const [odps, setOdps] = useState<{ listos: any[]; espera_pago: any[]; espera_produccion: any[] }>({ listos: [], espera_pago: [], espera_produccion: [] });
  const [rutas, setRutas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [rutaEditar, setRutaEditar] = useState<any>(null);
  const [odpsParaModal, setOdpsParaModal] = useState<any[]>([]);
  const [verCompletadas, setVerCompletadas] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [gestion, rutasRes] = await Promise.all([
        axios.get(`${API}/api/rutas/odps-para-gestion`, { headers }),
        axios.get(`${API}/api/rutas`, { headers }),
      ]);
      setOdps(gestion.data);
      setRutas(rutasRes.data);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleProgramar = (odpsPre: any[] = []) => {
    setOdpsParaModal(odps.listos);
    setRutaEditar(null);
    setShowModal(true);
  };

  const handleEditar = (ruta: any) => {
    setOdpsParaModal(odps.listos);
    setRutaEditar(ruta);
    setShowModal(true);
  };

  const handleCancelar = async (rutaId: number) => {
    if (!window.confirm('¿Cancelar esta ruta? Las ODPs pendientes volverán a "Listo para instalar".')) return;
    try {
      await axios.delete(`${API}/api/rutas/${rutaId}`, { headers });
      toast.success('Ruta cancelada');
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al cancelar'); }
  };

  const TABS = [
    { key: 'listos', label: 'Listo para instalar', count: odps.listos.length, icon: CheckCircle2, color: 'text-emerald-600' },
    { key: 'pago', label: 'En espera de pago', count: odps.espera_pago.length, icon: Clock, color: 'text-amber-600' },
    { key: 'produccion', label: 'En espera de producción', count: odps.espera_produccion.length, icon: AlertTriangle, color: 'text-red-500' },
  ] as const;

  const currentOdps = tab === 'listos' ? odps.listos : tab === 'pago' ? odps.espera_pago : odps.espera_produccion;

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Instalaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programa rutas y monitorea el avance de instalaciones</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => cargar()} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          {!readOnly && (
            <button onClick={() => handleProgramar()} disabled={!odps.listos.length}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm">
              <Plus className="w-4 h-4" /> Nueva Ruta
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-100">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-all ${tab === t.key ? 'bg-slate-50 border-b-2 border-indigo-500 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Icon className={`w-4 h-4 ${tab === t.key ? 'text-indigo-600' : t.color}`} />
                {t.label}
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
        ) : currentOdps.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No hay ODPs en esta categoría</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {currentOdps.map((odp: any) => (
              <div key={odp.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-800 text-sm">{odp.numero_odp}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${odp.estado_caja === 'CANCELADO' ? 'bg-emerald-100 text-emerald-700' : odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {odp.estado_caja === 'CANCELADO' ? 'Pagado' : odp.estado_caja === 'CREDITO_APROBADO' ? 'Crédito' : odp.estado_caja}
                    </span>
                    {odp.autorizacion_especial_despacho && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">Autorización especial</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 font-medium">{odp.cliente?.nombre_razon_social}</p>
                  {odp.direccion_instalacion && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />{odp.direccion_instalacion}
                    </p>
                  )}
                </div>
                {odp.fecha_entrega && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-slate-400">Entrega</p>
                    <p className="text-xs font-semibold text-slate-600">
                      {new Date(odp.fecha_entrega).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                )}
                {tab === 'listos' && !readOnly && (
                  <button onClick={() => { setOdpsParaModal(odps.listos); setRutaEditar(null); setShowModal(true); }}
                    className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100">
                    + Agregar a ruta
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rutas activas */}
      <div>
        {(() => {
          const rutasActivas = rutas.filter((r: any) => r.estado !== 'completada');
          const rutasCompletadas = rutas.filter((r: any) => r.estado === 'completada');
          return (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-700">Rutas activas ({rutasActivas.length})</h2>
                {rutasCompletadas.length > 0 && (
                  <button onClick={() => setVerCompletadas(v => !v)}
                    className="text-xs text-slate-400 hover:text-slate-600 underline">
                    {verCompletadas ? 'Ocultar' : 'Ver'} completadas ({rutasCompletadas.length})
                  </button>
                )}
              </div>
              {rutasActivas.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 py-10 text-center text-slate-400 text-sm">
                  No hay rutas activas. Crea una desde "Nueva Ruta".
                </div>
              ) : null}
              <div className="space-y-3">
                {(verCompletadas ? rutas : rutasActivas).map((ruta: any) => (
              <div key={ruta.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Ruta header */}
                <div className="flex items-center gap-3 p-4 border-b border-slate-100">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${ESTADO_RUTA_STYLES[ruta.estado] || 'bg-slate-100 text-slate-600'}`}>
                    {ruta.estado}
                  </span>
                  <div className="flex-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    {ruta.vehiculo && (
                      <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{ruta.vehiculo.tipo} — {ruta.vehiculo.placa}</span>
                    )}
                    {ruta.conductor && (
                      <span className="flex items-center gap-1">🧑‍✈️ {ruta.conductor.nombre_completo}</span>
                    )}
                    {ruta.oficial && (
                      <span className="flex items-center gap-1 text-indigo-600 font-semibold">⭐ Oficial: {ruta.oficial.nombre_completo}</span>
                    )}
                    {ruta.instaladores?.length > 0 && (
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}</span>
                    )}
                  </div>
                  {!readOnly && (ruta.estado === 'programada' || ruta.estado === 'en_curso') && (
                    <div className="flex gap-1">
                      <button onClick={() => handleEditar(ruta)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500" title="Editar / reprogramar ruta">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleCancelar(ruta.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Cancelar ruta">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* ODPs en la ruta */}
                <div className="divide-y divide-slate-50">
                  {(ruta.ruta_odps || []).sort((a: any, b: any) => a.orden - b.orden).map((ro: any) => (
                    <div key={ro.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {ro.orden}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-800">{ro.odp?.numero_odp}</span>
                        <span className="text-xs text-slate-500 ml-2">{ro.odp?.cliente?.nombre_razon_social}</span>
                        {ro.odp?.direccion_instalacion && (
                          <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{ro.odp.direccion_instalacion}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="w-3 h-3" />
                          {ro.fecha_programada}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ESTADO_ODP_RUTA_STYLES[ro.estado] || ''}`}>
                          {ro.estado}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {ruta.observaciones && (
                  <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
                    <p className="text-xs text-amber-700">{ruta.observaciones}</p>
                  </div>
                )}
              </div>
            ))}
              </div>
            </>
          );
        })()}
      </div>

      {showModal && (
        <ProgramarRutaModal
          odpsDisponibles={odpsParaModal}
          rutaExistente={rutaEditar}
          onClose={() => { setShowModal(false); setRutaEditar(null); }}
          onSaved={() => { setShowModal(false); setRutaEditar(null); cargar(); }}
        />
      )}
    </div>
  );
};

export default JefeView;
