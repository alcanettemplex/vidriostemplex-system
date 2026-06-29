import React from 'react';
import {
  AlertTriangle, Truck, Camera, ExternalLink, PenTool, MapPin, User, Calendar,
  CheckCircle2, AlertCircle, History, DollarSign, Wrench, CreditCard, MessageSquare,
  Shield, Archive, Package, Ruler, FileText, Tag, ChevronDown, ChevronUp,
  RefreshCw, Loader2, ArrowRight, X, Plus, TrendingUp, Images, Printer, Film, Box, Sparkles
} from 'lucide-react';
import { toast } from 'react-toastify';
import axios from 'axios';
import { Badge } from './ODPFichaModal.utils';
import API from '../../../services/config';

const ESTADO_RUTA_ODP: Record<string, { label: string; cls: string }> = {
  pendiente:   { label: 'Pendiente',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  en_curso:    { label: 'En curso',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  pausada:     { label: 'Pausada',    cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  con_dano:    { label: 'Con daño',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  completada:  { label: 'Completada', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const TabInstalacion: React.FC<{ odp: any; onOpenLightbox: (src: string) => void; currentUser?: any; onRefresh?: () => void }> = ({ odp, onOpenLightbox, currentUser, onRefresh }) => {
  const rutaOdps: any[] = odp.ruta_odps || [];
  const evidencias = odp.evidencias || [];
  const rutasConDano = rutaOdps.filter((r: any) => r.estado === 'con_dano');

  const token = sessionStorage.getItem('token');

  const isOwner = currentUser?.id === odp.asesor_id;
  const puedeRevisar = isOwner || ['admin', 'gerencia', 'produccion', 'jefe_produccion'].includes(currentUser?.rol);

  const handleRevisarDano = async () => {
    if (!window.confirm('¿Marcar el daño como revisado? La ODP saldrá del tab "Con Daños".')) return;
    try {
      await axios.patch(`${API}/api/odp/${odp.id}/revisar-dano`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Daño marcado como revisado');
      onRefresh?.();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al revisar el daño');
    }
  };

  return (
    <div className="p-6 space-y-6">

      {odp.tiene_dano_instalacion && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-black text-orange-800">Instalación con daño reportado</p>
              <p className="text-xs text-orange-600 mt-0.5">El instalador reportó un problema durante la ejecución. Revisa el detalle abajo y decide si procede una No Conformidad.</p>
            </div>
          </div>
          {puedeRevisar && (
            <button
              onClick={handleRevisarDano}
              className="flex-shrink-0 px-4 py-2 bg-white border border-orange-300 text-orange-700 text-xs font-black rounded-xl hover:bg-orange-50 transition whitespace-nowrap"
            >
              Revisado / Sin acción
            </button>
          )}
        </div>
      )}

      {rutasConDano.length > 0 && (
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-orange-500 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Reportes de Daño ({rutasConDano.length})
          </h3>
          <div className="space-y-3">
            {rutasConDano.map((r: any) => (
              <div key={r.id} className="bg-orange-50 border border-orange-200 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                  {r.foto_dano_url && (
                    <div
                      className="w-full md:w-36 h-36 rounded-xl overflow-hidden border border-orange-200 flex-shrink-0 cursor-zoom-in bg-orange-100"
                      onClick={() => onOpenLightbox(r.foto_dano_url)}
                    >
                      <img src={r.foto_dano_url} alt="Foto daño" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-orange-100 text-orange-700 text-[10px] font-black rounded-lg uppercase tracking-wider">
                        Daño en instalación
                      </span>
                      {r.inicio_instalacion && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(r.inicio_instalacion).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{r.descripcion_dano || '—'}</p>
                    {r.ruta?.instaladores?.length > 0 && (
                      <p className="text-xs text-slate-500">
                        Instalador(es): <strong>{r.ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}</strong>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-600" /> Programaciones de Instalación ({rutaOdps.length})
        </h3>
        {rutaOdps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Truck className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin programaciones asignadas</p>
          </div>
        ) : rutaOdps.map((prog: any) => {
          const estadoBadge = ESTADO_RUTA_ODP[prog.estado] || ESTADO_RUTA_ODP['pendiente'];
          const oficial = prog.ruta?.oficial;
          const ayudantes = (prog.ruta?.instaladores || []).filter((i: any) => i.id !== oficial?.id);
          const todoInstaladores = [oficial, ...ayudantes].filter(Boolean);
          const instaladores = todoInstaladores.length > 0 ? todoInstaladores.map((i: any) => i.nombre_completo).join(', ') : '—';
          const vehiculo = prog.ruta?.vehiculo ? `${prog.ruta.vehiculo.tipo.toUpperCase()} — ${prog.ruta.vehiculo.placa}` : '—';
          return (
            <div key={prog.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Fecha programada</p>
                  <p className="font-bold">{prog.fecha_programada ? new Date(prog.fecha_programada).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Vehículo</p>
                  <p className="font-bold">{vehiculo}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Instaladores</p>
                  <p className="font-bold text-xs">{instaladores}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold uppercase">Estado</p>
                  <Badge className={`${estadoBadge.cls} mt-0.5`}>{estadoBadge.label}</Badge>
                </div>
              </div>
              {prog.inicio_instalacion && (
                <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-slate-500">
                  <span>Inicio: <strong>{new Date(prog.inicio_instalacion).toLocaleString('es-CO')}</strong></span>
                  {prog.fin_instalacion && <span>Fin: <strong>{new Date(prog.fin_instalacion).toLocaleString('es-CO')}</strong></span>}
                </div>
              )}
              {prog.datos_receptor && (
                <p className="text-xs text-slate-500 mt-2">Recibió: <strong>{prog.datos_receptor}</strong></p>
              )}
              {prog.motivo_pausa && (
                <p className="text-xs text-violet-600 mt-1.5 font-medium">Motivo de pausa: <strong>{prog.motivo_pausa}</strong></p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-emerald-600" /> Evidencias Fotográficas ({evidencias.length})
        </h3>
        {evidencias.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Camera className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">Sin evidencias cargadas</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {evidencias.map((ev: any) => (
              <div key={ev.id} className="group relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 aspect-square">
                {ev.archivo_url ? (
                  <>
                    <img src={ev.archivo_url} alt="Evidencia" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-zoom-in"
                      onClick={() => onOpenLightbox(ev.archivo_url)} />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <ExternalLink className="w-6 h-6 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <Camera className="w-8 h-8 mb-1" />
                    <p className="text-xs">Sin imagen</p>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2">
                  <p className="text-white text-[10px] font-bold truncate">{ev.instalador?.nombre_completo}</p>
                  <p className="text-white/70 text-[10px]">{ev.fecha ? new Date(ev.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const firmas = rutaOdps.filter((r: any) => r.firma_receptor);
        if (firmas.length === 0) return null;
        return (
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
              <PenTool className="w-4 h-4 text-violet-600" /> Firma(s) del Cliente ({firmas.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {firmas.map((r: any) => (
                <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Recibió: <span className="text-slate-800 font-bold">{r.datos_receptor || '—'}</span>
                  </p>
                  <div
                    className="border border-slate-200 rounded-xl overflow-hidden cursor-zoom-in bg-slate-50"
                    onClick={() => onOpenLightbox(r.firma_receptor)}
                  >
                    <img src={r.firma_receptor} alt="Firma del cliente" className="w-full max-h-40 object-contain p-2" />
                  </div>
                  {r.fin_instalacion && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {new Date(r.fin_instalacion).toLocaleString('es-CO')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default TabInstalacion;
