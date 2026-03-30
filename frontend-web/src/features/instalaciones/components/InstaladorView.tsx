import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { MapPin, FileText, Play, CheckCircle2, Clock, AlertCircle, RefreshCw, Printer, ExternalLink } from 'lucide-react';
import ReportarEntregaModal from './ReportarEntregaModal';
import PrintableOP from '../../odp/components/PrintableOP';
import PrintableDetalleTecnico from '../../odp/components/PrintableDetalleTecnico';
import PrintableSAP from '../../odp/components/PrintableSAP';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const InstaladorView: React.FC = () => {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [asignacion, setAsignacion] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [finalizando, setFinalizando] = useState<{ rutaODPId: number; numeroODP: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/rutas/mi-asignacion`, { headers });
      setAsignacion(data);
    } catch { toast.error('Error al cargar asignación'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleIniciar = async (rutaODPId: number) => {
    setIniciando(rutaODPId);
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${rutaODPId}/iniciar`, {}, { headers });
      toast.success('Instalación iniciada');
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al iniciar');
    } finally { setIniciando(null); }
  };

  const abrirDocumento = (odp: any, tipo: 'op' | 'tecnico' | 'sap') => {
    const win = window.open('', '_blank', 'width=950,height=800');
    if (!win) return;

    let contenidoId: string;
    let titulo: string;
    if (tipo === 'op') { contenidoId = `print-op-${odp.id}`; titulo = `ODP ${odp.numero_odp}`; }
    else if (tipo === 'tecnico') { contenidoId = `print-tec-${odp.id}`; titulo = `Detalle Técnico ${odp.numero_odp}`; }
    else { contenidoId = `print-sap-${odp.id}`; titulo = `SAP ${odp.numero_odp}`; }

    const el = document.getElementById(contenidoId);
    if (!el) return toast.error('Documento no disponible');

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/><title>${titulo}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @page { size: letter portrait; margin: 4mm; }
        body { margin: 0; padding: 0; font-family: sans-serif; }
        .excel-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
        .excel-table th, .excel-table td { border: 1px solid #000; padding: 2px 4px; }
        .excel-table th { font-weight: bold; text-align: center; }
        .thick-b { border-bottom: 2px solid #000 !important; }
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  const abrirMapa = (direccion: string) => {
    const query = encodeURIComponent(direccion);
    window.open(`https://maps.google.com/maps?q=${query}`, '_blank');
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
          <h1 className="text-xl font-bold text-slate-800">Mi Ruta de Trabajo</h1>
          <p className="text-xs text-slate-500 mt-0.5">{asignacion.length} instalación{asignacion.length !== 1 ? 'es' : ''} asignada{asignacion.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {asignacion.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-700">¡Todo al día!</h3>
          <p className="text-sm text-slate-500 mt-1">No tienes instalaciones asignadas para hoy.</p>
        </div>
      ) : (
        asignacion.map((item: any, idx: number) => {
          const odp = item.odp;
          const enCurso = item.estado === 'en_curso';
          const completada = item.estado === 'completada';
          const sap = odp?.saps?.[0];

          return (
            <div key={item.id} className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${enCurso ? 'border-amber-400' : completada ? 'border-emerald-300' : 'border-slate-200'}`}>
              {/* Banda de estado */}
              <div className={`h-1.5 w-full ${enCurso ? 'bg-amber-400' : completada ? 'bg-emerald-500' : 'bg-slate-200'}`} />

              <div className="p-4">
                {/* ODP info */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">{item.orden}</span>
                      <span className="font-bold text-slate-800">{odp?.numero_odp}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${enCurso ? 'bg-amber-100 text-amber-700' : completada ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {enCurso ? 'En curso' : completada ? 'Completada' : 'Pendiente'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 mt-1">{odp?.cliente?.nombre_razon_social}</p>
                  </div>
                  {item.fecha_programada && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase">Fecha</p>
                      <p className="text-xs font-semibold text-slate-600">{item.fecha_programada}</p>
                    </div>
                  )}
                </div>

                {/* Dirección */}
                {odp?.direccion_instalacion && (
                  <div className="flex items-start gap-2 bg-slate-50 rounded-lg p-2.5 mb-3">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-600 font-medium leading-tight">{odp.direccion_instalacion}</p>
                  </div>
                )}

                {/* Timestamps si en curso */}
                {enCurso && item.inicio_instalacion && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mb-3">
                    <Clock className="w-3.5 h-3.5" />
                    Iniciada: {new Date(item.inicio_instalacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}

                {/* Descripción trabajo */}
                {odp?.descripcion_pedido && (
                  <p className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3 line-clamp-2">
                    {odp.descripcion_pedido}
                  </p>
                )}

                {/* Vehículo e instaladores */}
                {item.ruta && (
                  <div className="text-xs text-slate-400 mb-3 flex flex-wrap gap-2">
                    {item.ruta.vehiculo && <span>🚐 {item.ruta.vehiculo.placa}</span>}
                    {item.ruta.instaladores?.length > 0 && (
                      <span>👷 {item.ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}</span>
                    )}
                  </div>
                )}

                {/* Botones de documentos */}
                {!completada && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button onClick={() => abrirDocumento(odp, 'op')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      <Printer className="w-3 h-3" /> ODP
                    </button>
                    <button onClick={() => abrirDocumento(odp, 'tecnico')}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                      <FileText className="w-3 h-3" /> Detalle Técnico
                    </button>
                    {sap && (
                      <button onClick={() => abrirDocumento(odp, 'sap')}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                        <FileText className="w-3 h-3" /> SAP
                      </button>
                    )}
                    {odp?.direccion_instalacion && (
                      <button onClick={() => abrirMapa(odp.direccion_instalacion)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-indigo-200 rounded-lg hover:bg-indigo-50 text-indigo-600">
                        <ExternalLink className="w-3 h-3" /> Ver ubicación
                      </button>
                    )}
                  </div>
                )}

                {/* Acción principal */}
                {!completada && (
                  enCurso ? (
                    <button onClick={() => setFinalizando({ rutaODPId: item.id, numeroODP: odp.numero_odp })}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-100 text-sm">
                      <CheckCircle2 className="w-4 h-4" /> Finalizar instalación
                    </button>
                  ) : (
                    <button onClick={() => handleIniciar(item.id)} disabled={iniciando === item.id}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 shadow-lg shadow-indigo-100 text-sm">
                      {iniciando === item.id
                        ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Iniciando...</>
                        : <><Play className="w-4 h-4" /> Iniciar instalación</>
                      }
                    </button>
                  )
                )}
                {completada && (
                  <div className="flex items-center gap-2 justify-center py-2 text-emerald-600 font-semibold text-sm">
                    <CheckCircle2 className="w-4 h-4" /> Entregada a las {item.fin_instalacion ? new Date(item.fin_instalacion).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>
                )}
              </div>

              {/* Plantillas ocultas para impresión */}
              <div className="hidden">
                <div id={`print-op-${odp?.id}`}><PrintableOP odp={odp} /></div>
                <div id={`print-tec-${odp?.id}`}><PrintableDetalleTecnico odp={odp} /></div>
                {sap && <div id={`print-sap-${odp?.id}`}><PrintableSAP odp={odp} sap={sap} /></div>}
              </div>
            </div>
          );
        })
      )}

      {finalizando && (
        <ReportarEntregaModal
          rutaODPId={finalizando.rutaODPId}
          numeroODP={finalizando.numeroODP}
          onClose={() => setFinalizando(null)}
          onCompletado={() => { setFinalizando(null); cargar(); }}
        />
      )}
    </div>
  );
};

export default InstaladorView;
