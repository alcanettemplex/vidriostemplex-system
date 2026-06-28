import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  CheckCircle2, Clock, AlertTriangle, MapPin, Truck, Users, Calendar,
  Pencil, Trash2, Plus, RefreshCw, PackageCheck, PauseCircle, Search,
  Route, History, ChevronDown, ChevronUp, HardHat, Upload, X as XIcon, Receipt,
  AlertOctagon,
} from 'lucide-react';
import ProgramarRutaModal from './ProgramarRutaModal';
import InstaladorGestionTab from './InstaladorGestionTab';
import AgendaTab from './AgendaTab';
import FolderTabs, { FOLDER_BODY } from '../../../components/FolderTabs';
import ODPFichaModal from '../../odp/components/ODPFichaModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

const getLunes = (): string => {
  const d = new Date();
  const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
};

const getDomingo = (): string => {
  const d = new Date();
  const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? 0 : 7);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
};

const formatFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDuracion = (msOrInicio: string | null, fin?: string | null): string | null => {
  if (!msOrInicio) return null;
  const inicio = new Date(msOrInicio).getTime();
  const hastaMs = fin ? new Date(fin).getTime() : Date.now();
  const ms = hastaMs - inicio;
  if (ms < 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
};

// ─── Helpers de estado / badges ───────────────────────────────────────────────

const ESTADO_RUTA_STYLES: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700',
  en_curso:   'bg-amber-100 text-amber-700',
  completada: 'bg-emerald-100 text-emerald-700',
  cancelada:  'bg-slate-100 text-slate-500',
};

const ESTADO_RUTA_LABEL: Record<string, string> = {
  programada: 'Programada',
  en_curso:   'En curso',
  completada: 'Completada',
  cancelada:  'Cancelada',
};

const ESTADO_ODP_RUTA_STYLES: Record<string, string> = {
  pendiente:  'bg-slate-100 text-slate-600',
  en_curso:   'bg-amber-100 text-amber-700',
  pausada:    'bg-violet-100 text-violet-700',
  completada: 'bg-emerald-100 text-emerald-700',
  con_dano:   'bg-orange-100 text-orange-700',
};

const getTipoServicio = (odp: any) => {
  if (odp?.instalacion && odp?.acarreo) return { label: 'Instalación + Acarreo', cls: 'bg-indigo-100 text-indigo-700', icon: '🔧' };
  if (odp?.instalacion) return { label: 'Instalación', cls: 'bg-indigo-100 text-indigo-700', icon: '🔧' };
  if (odp?.acarreo)     return { label: 'Acarreo', cls: 'bg-sky-100 text-sky-700', icon: '🚚' };
  return { label: 'Entrega taller', cls: 'bg-slate-100 text-slate-600', icon: '📦' };
};

const getPagoBadge = (odp: any) => {
  if (odp?.es_garantia)                          return { label: 'Garantía', cls: 'bg-blue-100 text-blue-700' };
  if (odp?.estado_caja === 'CANCELADO')           return { label: '✓ Pagado', cls: 'bg-emerald-100 text-emerald-700' };
  if (odp?.estado_caja === 'CREDITO_APROBADO')    return { label: 'Crédito', cls: 'bg-blue-100 text-blue-700' };
  if (odp?.autorizacion_especial_despacho)        return { label: 'Autorización', cls: 'bg-purple-100 text-purple-700' };
  return { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700' };
};

// ─── Tarjeta de ruta ──────────────────────────────────────────────────────────

const RutaCard: React.FC<{
  ruta: any;
  readOnly: boolean;
  historial?: boolean;
  onEditar?: (r: any) => void;
  onCancelar?: (id: number) => void;
  onFinalizar?: (rutaOdpId: number, numero: string) => void;
  onPausar?: (rutaOdpId: number, numero: string) => void;
  onVerODP?: (id: number) => void;
}> = ({ ruta, readOnly, historial = false, onEditar, onCancelar, onFinalizar, onPausar, onVerODP }) => {
  const [expandida, setExpandida] = useState(true);

  const totalOdps      = ruta.ruta_odps?.length ?? 0;
  const completadasOdp = ruta.ruta_odps?.filter((ro: any) => ro.estado === 'completada').length ?? 0;
  const pct            = totalOdps > 0 ? Math.round((completadasOdp / totalOdps) * 100) : 0;

  const duracion = ruta.estado === 'en_curso'
    ? formatDuracion(ruta.inicio_ruta)
    : ruta.estado === 'completada'
    ? formatDuracion(ruta.inicio_ruta, ruta.fin_ruta)
    : null;

  const puedeEditar    = !readOnly && !historial && (ruta.estado === 'programada' || ruta.estado === 'en_curso');
  const puedeCancelar  = puedeEditar;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 space-y-2.5">
        {/* Fila 1: estado + vehículo + conductor + fecha + acciones */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${ESTADO_RUTA_STYLES[ruta.estado] ?? 'bg-slate-100 text-slate-600'}`}>
            {ESTADO_RUTA_LABEL[ruta.estado] ?? ruta.estado}
          </span>
          {ruta.vehiculo && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Truck className="w-3 h-3" />{ruta.vehiculo.tipo} — {ruta.vehiculo.placa}
            </span>
          )}
          {ruta.conductor && (
            <span className="text-xs text-slate-500">🧑‍✈️ {ruta.conductor.nombre_completo}</span>
          )}
          <span className="text-xs text-slate-400 ml-auto flex items-center gap-1">
            <Calendar className="w-3 h-3" />{formatFecha(ruta.creado_en)}
          </span>
          {puedeEditar && (
            <button onClick={() => onEditar?.(ruta)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400" title="Editar ruta">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {puedeCancelar && (
            <button onClick={() => onCancelar?.(ruta.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Cancelar ruta">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => setExpandida(v => !v)} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400">
            {expandida ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Fila 2: oficial + instaladores */}
        {(ruta.oficial || ruta.instaladores?.length > 0) && (
          <div className="flex flex-wrap gap-3 text-xs">
            {ruta.oficial && (
              <span className="flex items-center gap-1 text-indigo-600 font-semibold">
                ⭐ Oficial: {ruta.oficial.nombre_completo}
              </span>
            )}
            {ruta.instaladores?.length > 0 && (
              <span className="flex items-center gap-1 text-slate-500">
                <Users className="w-3 h-3" />
                {ruta.instaladores.map((i: any) => i.nombre_completo).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Fila 3: progreso + duración */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-500">{completadasOdp}/{totalOdps} ODPs completadas</span>
              <span className="font-bold text-slate-600">{pct}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {duracion && (
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap flex items-center gap-1">
              ⏱ {ruta.estado === 'en_curso' ? `En ruta: ${duracion}` : `Duración: ${duracion}`}
            </span>
          )}
        </div>
      </div>

      {/* ODPs en la ruta */}
      {expandida && (
        <div className="divide-y divide-slate-50 border-t border-slate-100">
          {(ruta.ruta_odps ?? []).map((ro: any) => {
            const tipo = getTipoServicio(ro.odp);
            const pago = getPagoBadge(ro.odp);
            return (
              <div key={ro.id} className="flex items-start gap-3 px-4 py-3">
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                  {ro.orden}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-semibold text-slate-800 hover:text-indigo-600 cursor-pointer hover:underline underline-offset-2"
                      onClick={() => ro.odp?.id && onVerODP?.(ro.odp.id)}
                    >
                      {ro.odp?.numero_odp}
                    </span>
                    <span className="text-xs text-slate-500 truncate">{ro.odp?.cliente?.nombre_razon_social}</span>
                  </div>
                  {ro.odp?.direccion_instalacion && (
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                      {ro.odp.direccion_instalacion}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${tipo.cls}`}>
                      {tipo.icon} {tipo.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pago.cls}`}>
                      {pago.label}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${ESTADO_ODP_RUTA_STYLES[ro.estado] ?? ''}`}>
                      {ro.estado?.replace('_', ' ')}
                    </span>
                    {ro.fecha_programada && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />{ro.fecha_programada}
                      </span>
                    )}
                  </div>
                  {ro.estado === 'pausada' && ro.motivo_pausa && (
                    <p className="text-xs text-violet-600 mt-1 flex items-start gap-1">
                      <PauseCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      {ro.motivo_pausa}
                    </p>
                  )}
                </div>

                {/* Acciones por ODP */}
                {!readOnly && !historial && (
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    {ro.estado === 'en_curso' && (
                      <button
                        onClick={() => onPausar?.(ro.id, ro.odp?.numero_odp)}
                        className="p-1 rounded hover:bg-violet-50 text-violet-400 hover:text-violet-600"
                        title="Pausar instalación"
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {ro.estado === 'en_curso' && (
                      <button
                        onClick={() => onFinalizar?.(ro.id, ro.odp?.numero_odp)}
                        className="p-1 rounded hover:bg-emerald-50 text-emerald-400 hover:text-emerald-600"
                        title="Registrar entrega"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ruta.observaciones && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-700">{ruta.observaciones}</p>
        </div>
      )}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

type MainTab = 'agenda' | 'listos' | 'pago' | 'factura' | 'produccion' | 'programados' | 'completados' | 'instaladores' | 'atascadas';
type SubTabProg = 'programada' | 'en_curso';
type SubTabComp = 'completadas' | 'canceladas';

const JefeView: React.FC<{ readOnly?: boolean }> = ({ readOnly = false }) => {
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // State
  const [mainTab, setMainTab] = useState<MainTab>('agenda');
  const [subTabProg, setSubTabProg] = useState<SubTabProg>('programada');
  const [subTabComp, setSubTabComp] = useState<SubTabComp>('completadas');
  const [odps, setOdps] = useState<{ listos: any[]; espera_pago: any[]; espera_produccion: any[]; espera_factura: any[] }>({ listos: [], espera_pago: [], espera_produccion: [], espera_factura: [] });
  const [rutas, setRutas] = useState<any[]>([]);
  const [atascadas, setAtascadas] = useState<any[]>([]);
  const [rutasHistorial, setRutasHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [historialCargado, setHistorialCargado] = useState(false);
  const [fechaDesde, setFechaDesde] = useState<string>(getLunes());
  const [fechaHasta, setFechaHasta] = useState<string>(getDomingo());
  const [showModal, setShowModal] = useState(false);
  const [rutaEditar, setRutaEditar] = useState<any>(null);
  const [odpsParaModal, setOdpsParaModal] = useState<any[]>([]);
  const [preseleccionRuta, setPreseleccionRuta] = useState<{ odps: any[]; fecha: string } | null>(null);
  const [pauseModal, setPauseModal] = useState<{ rutaOdpId: number; numeroOdp: string } | null>(null);
  const [pauseMotivo, setPauseMotivo] = useState('');
  const [finalizarModal, setFinalizarModal] = useState<{ rutaOdpId: number; numeroOdp: string } | null>(null);
  const [fotosFinalizar, setFotosFinalizar] = useState<File[]>([]);
  const [datosReceptor, setDatosReceptor] = useState('');
  const [savingFinalizar, setSavingFinalizar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [selectedOdpId, setSelectedOdpId] = useState<number | null>(null);

  // Carga datos principales
  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [gestion, rutasRes, atascadasRes] = await Promise.all([
        axios.get(`${API}/api/rutas/odps-para-gestion`, { headers }),
        axios.get(`${API}/api/rutas`, { headers }),
        axios.get(`${API}/api/rutas/atascadas`, { headers }),
      ]);
      setOdps(gestion.data);
      setRutas(rutasRes.data);
      setAtascadas(atascadasRes.data);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  // Carga historial (lazy)
  const cargarHistorial = useCallback(async (desde: string, hasta: string) => {
    setLoadingHistorial(true);
    try {
      const res = await axios.get(`${API}/api/rutas/historial`, { headers, params: { desde, hasta } });
      setRutasHistorial(res.data);
      setHistorialCargado(true);
    } catch { toast.error('Error al cargar historial'); }
    finally { setLoadingHistorial(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (mainTab === 'completados') {
      setHistorialCargado(false);
      cargarHistorial(fechaDesde, fechaHasta);
    }
  }, [mainTab, fechaDesde, fechaHasta]); // eslint-disable-line

  // Segmentación de rutas
  const rutasProgramadas  = useMemo(() => rutas.filter((r: any) => r.estado === 'programada'), [rutas]);
  const rutasEnCurso      = useMemo(() => rutas.filter((r: any) => r.estado === 'en_curso'), [rutas]);
  const rutasCompletadas  = useMemo(() => rutasHistorial.filter((r: any) => r.estado === 'completada'), [rutasHistorial]);
  const rutasCanceladas   = useMemo(() => rutasHistorial.filter((r: any) => r.estado === 'cancelada'), [rutasHistorial]);

  // Búsqueda
  const q = busqueda.toLowerCase().trim();

  const filtrarOdps = (lista: any[]) =>
    q ? lista.filter((o: any) =>
      o.numero_odp?.toLowerCase().includes(q) ||
      o.cliente?.nombre_razon_social?.toLowerCase().includes(q)
    ) : lista;

  const filtrarRutas = (lista: any[]) =>
    q ? lista.filter((r: any) =>
      r.ruta_odps?.some((ro: any) =>
        ro.odp?.numero_odp?.toLowerCase().includes(q) ||
        ro.odp?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
      )
    ) : lista;

  // Handlers
  const handleEditar = (ruta: any) => { setPreseleccionRuta(null); setOdpsParaModal(odps.listos); setRutaEditar(ruta); setShowModal(true); };
  // Crear ruta desde un día de la agenda: precarga las ODPs de ese día
  const handleCrearRutaDia = (odpsDia: any[], fecha: string) => {
    setOdpsParaModal(odps.listos);
    setRutaEditar(null);
    setPreseleccionRuta({ odps: odpsDia, fecha });
    setShowModal(true);
  };
  const handleCancelar = async (rutaId: number) => {
    if (!window.confirm('¿Cancelar esta ruta? Las ODPs volverán a "Listo para instalar".')) return;
    try { await axios.delete(`${API}/api/rutas/${rutaId}`, { headers }); toast.success('Ruta cancelada'); cargar(); }
    catch (e: any) { toast.error(e.response?.data?.error || 'Error al cancelar'); }
  };
  const handleFinalizarODP = (rutaOdpId: number, numeroOdp: string) => {
    setFotosFinalizar([]);
    setDatosReceptor('');
    setFinalizarModal({ rutaOdpId, numeroOdp });
  };

  const handleConfirmarFinalizar = async () => {
    if (!finalizarModal) return;
    if (!fotosFinalizar.length) { toast.error('La foto de evidencia es obligatoria'); return; }
    setSavingFinalizar(true);
    try {
      const fd = new FormData();
      for (const f of fotosFinalizar) fd.append('fotos', f);
      if (datosReceptor.trim()) fd.append('datos_receptor', datosReceptor.trim());
      await axios.post(`${API}/api/rutas/ruta-odp/${finalizarModal.rutaOdpId}/finalizar`, fd, { headers });
      toast.success(`ODP ${finalizarModal.numeroOdp} marcada como entregada`);
      setFinalizarModal(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al registrar entrega');
    } finally {
      setSavingFinalizar(false);
    }
  };
  const handlePausar = (rutaOdpId: number, numeroOdp: string) => { setPauseMotivo(''); setPauseModal({ rutaOdpId, numeroOdp }); };
  const handleConfirmarPausa = async () => {
    if (!pauseModal) return;
    if (!pauseMotivo.trim()) { toast.error('Ingresa el motivo de la pausa'); return; }
    try {
      await axios.post(`${API}/api/rutas/ruta-odp/${pauseModal.rutaOdpId}/pausar`, { motivo_pausa: pauseMotivo.trim() }, { headers });
      toast.success(`Instalación de ${pauseModal.numeroOdp} pausada`);
      setPauseModal(null);
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al pausar'); }
  };

  // Atascadas: reprogramar (→ Listo para instalar) o marcar entregada (cierre administrativo)
  const handleReprogramarAtascada = async (rutaOdpId: number, numeroOdp: string) => {
    if (!window.confirm(`¿Reprogramar ${numeroOdp}? Volverá a "Listo para instalar" para asignarla a una ruta nueva.`)) return;
    try {
      await axios.post(`${API}/api/rutas/atascadas/${rutaOdpId}/reprogramar`, {}, { headers });
      toast.success(`${numeroOdp} reprogramada`);
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al reprogramar'); }
  };
  const handleEntregarAtascada = async (rutaOdpId: number, numeroOdp: string) => {
    if (!window.confirm(`¿Marcar ${numeroOdp} como ENTREGADA? Úsalo solo si la instalación realmente se realizó. Es un cierre administrativo.`)) return;
    try {
      await axios.post(`${API}/api/rutas/atascadas/${rutaOdpId}/entregar`, {}, { headers });
      toast.success(`${numeroOdp} marcada como entregada`);
      cargar();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al marcar entregada'); }
  };

  // Tabs principales
  const MAIN_TABS = [
    { key: 'agenda',        label: 'Agenda',                count: null,                            icon: Calendar,      color: 'text-indigo-600',  soloEscritura: false },
    { key: 'listos',        label: 'Listo para instalar',  count: odps.listos.length,              icon: CheckCircle2,  color: 'text-emerald-600', soloEscritura: false },
    { key: 'pago',          label: 'Espera de pago',        count: odps.espera_pago.length,         icon: Clock,         color: 'text-amber-600',   soloEscritura: false },
    { key: 'factura',       label: 'Espera de factura',     count: odps.espera_factura.length,      icon: Receipt,       color: 'text-orange-600',  soloEscritura: false },
    { key: 'produccion',    label: 'Espera de producción',  count: odps.espera_produccion.length,   icon: AlertTriangle, color: 'text-red-500',     soloEscritura: false },
    { key: 'programados',   label: 'Programados',           count: rutas.length,                    icon: Route,         color: 'text-indigo-600',  soloEscritura: false },
    { key: 'atascadas',     label: 'Atascadas',             count: atascadas.length,                icon: AlertOctagon,  color: 'text-rose-600',    soloEscritura: false },
    { key: 'completados',   label: 'Completados',           count: null,                            icon: History,       color: 'text-slate-500',   soloEscritura: false },
    { key: 'instaladores',  label: 'Instaladores',          count: null,                            icon: HardHat,       color: 'text-teal-600',    soloEscritura: true  },
  ] as const;

  // ODP list actual según tab
  const odpListaActual = mainTab === 'listos' ? odps.listos : mainTab === 'pago' ? odps.espera_pago : mainTab === 'factura' ? odps.espera_factura : odps.espera_produccion;
  const odpsMostradas  = filtrarOdps(odpListaActual);

  // Atascadas: estructura plana (cliente es string), filtro propio
  const atascadasMostradas = q
    ? atascadas.filter((a: any) =>
        a.numero_odp?.toLowerCase().includes(q) ||
        a.cliente?.toLowerCase().includes(q))
    : atascadas;

  // Rutas según sub-tab programados
  const rutasProg = filtrarRutas(subTabProg === 'programada' ? rutasProgramadas : rutasEnCurso);

  // Rutas según sub-tab completados
  const rutasComp = filtrarRutas(subTabComp === 'completadas' ? rutasCompletadas : rutasCanceladas);

  const propsRutaCard = { readOnly, onEditar: handleEditar, onCancelar: handleCancelar, onFinalizar: handleFinalizarODP, onPausar: handlePausar, onVerODP: setSelectedOdpId };

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Instalaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">Programa rutas y monitorea el avance de instalaciones</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50" title="Recargar">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          {!readOnly && (
            <button
              onClick={() => { setPreseleccionRuta(null); setOdpsParaModal(odps.listos); setRutaEditar(null); setShowModal(true); }}
              disabled={!odps.listos.length}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
            >
              <Plus className="w-4 h-4" /> Nueva Ruta
            </button>
          )}
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por N° ODP o nombre de cliente..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-slate-400"
        />
      </div>

      {/* Tabs principales — estilo carpeta (FolderTabs) */}
      <div className="relative">
        <FolderTabs
          tabs={MAIN_TABS
            .filter(t => (!t.soloEscritura || !readOnly) && (t.key !== 'atascadas' || atascadas.length > 0))
            .map(t => ({ key: t.key, label: t.label, icon: React.createElement(t.icon, { className: 'w-4 h-4' }), badge: t.count ?? undefined }))}
          activeKey={mainTab}
          onChange={(k) => setMainTab(k as MainTab)}
        />

        {/* Cuerpo de la carpeta (panel de contenido) */}
        <div className={FOLDER_BODY}>

        {/* ── Contenido tab Agenda ── */}
        {mainTab === 'agenda' && (
          <AgendaTab
            odpsListos={odps.listos}
            readOnly={readOnly}
            onVerODP={setSelectedOdpId}
            onCrearRutaDia={handleCrearRutaDia}
            onAgendaChange={cargar}
          />
        )}

        {/* ── Contenido tabs ODP (listos / pago / factura / produccion) ── */}
        {(mainTab === 'listos' || mainTab === 'pago' || mainTab === 'factura' || mainTab === 'produccion') && (
          loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>
          ) : odpsMostradas.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No hay ODPs en esta categoría</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {odpsMostradas.map((odp: any) => (
                <div key={odp.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="font-bold text-slate-800 text-sm hover:text-indigo-600 cursor-pointer hover:underline underline-offset-2"
                        onClick={() => setSelectedOdpId(odp.id)}
                      >
                        {odp.numero_odp}
                      </span>
                      {odp.es_garantia && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">🛡 Garantía</span>}
                      {!odp.es_garantia && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${odp.estado_caja === 'CANCELADO' ? 'bg-emerald-100 text-emerald-700' : odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {odp.estado_caja === 'CANCELADO' ? 'Pagado' : odp.estado_caja === 'CREDITO_APROBADO' ? 'Crédito' : odp.estado_caja}
                        </span>
                      )}
                      {odp.autorizacion_especial_despacho && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">Autorización especial</span>}
                      {odp.agenda && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          Agendada {new Date(`${odp.agenda.fecha_tentativa}T00:00:00`).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      {mainTab === 'factura' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">Sin factura</span>}
                    </div>
                    <p className="text-sm text-slate-600 font-medium">{odp.cliente?.nombre_razon_social}</p>
                    {odp.direccion_instalacion && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{odp.direccion_instalacion}</p>
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
                  {mainTab === 'listos' && !readOnly && (
                    <button
                      onClick={() => { setPreseleccionRuta(null); setOdpsParaModal(odps.listos); setRutaEditar(null); setShowModal(true); }}
                      className="flex-shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100"
                    >
                      + Agregar a ruta
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Contenido tab Programados ── */}
        {mainTab === 'programados' && (
          <div className="p-4 space-y-4">
            {/* Sub-tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
              {([
                { key: 'programada', label: 'Programada', count: rutasProgramadas.length, cls: 'text-blue-700 bg-white' },
                { key: 'en_curso',   label: 'En curso',   count: rutasEnCurso.length,     cls: 'text-amber-700 bg-white' },
              ] as const).map(st => (
                <button
                  key={st.key}
                  onClick={() => setSubTabProg(st.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${subTabProg === st.key ? st.cls + ' shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {st.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${subTabProg === st.key ? 'bg-slate-100' : 'bg-slate-200 text-slate-500'}`}>
                    {st.count}
                  </span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
            ) : rutasProg.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                {q ? 'Sin resultados para la búsqueda.' : `No hay rutas ${subTabProg === 'programada' ? 'programadas' : 'en curso'}.`}
              </div>
            ) : (
              <div className="space-y-3">
                {rutasProg.map((r: any) => <RutaCard key={r.id} ruta={r} {...propsRutaCard} />)}
              </div>
            )}
          </div>
        )}

        {/* ── Contenido tab Atascadas ── */}
        {mainTab === 'atascadas' && (
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-800">
              <AlertOctagon className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <span>
                ODPs que quedaron en <b>PROGRAMADA</b> porque su ruta se cerró sin registrar la instalación.
                Reprogámalas para asignarlas a una ruta nueva, o márcalas como entregadas si la instalación
                sí se realizó pero no se registró.
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-rose-600" /></div>
            ) : atascadasMostradas.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                {q ? 'Sin resultados para la búsqueda.' : 'No hay ODPs atascadas. 🎉'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {atascadasMostradas.map((a: any) => (
                  <div key={a.ruta_odp_id} className="border border-slate-200 rounded-xl p-3.5 bg-white hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => setSelectedOdpId(a.odp_id)} className="font-bold text-sm text-indigo-700 hover:underline">
                            {a.numero_odp}
                          </button>
                          {a.es_no_conformidad && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">REPROCESO</span>}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Ruta #{a.ruta_id} cerrada</span>
                        </div>
                        <p className="text-sm text-slate-700 font-medium mt-1 truncate">{a.cliente || 'Sin cliente'}</p>
                        {a.direccion_instalacion && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" /> {a.direccion_instalacion}
                          </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-0.5">Asesor: {a.asesor || '—'}</p>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleReprogramarAtascada(a.ruta_odp_id, a.numero_odp)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Reprogramar
                          </button>
                          <button
                            onClick={() => handleEntregarAtascada(a.ruta_odp_id, a.numero_odp)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <PackageCheck className="w-3.5 h-3.5" /> Marcar entregada
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Contenido tab Completados ── */}
        {mainTab === 'completados' && (
          <div className="p-4 space-y-4">
            {/* Filtro por fechas */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Período</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={e => setFechaDesde(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-slate-400 text-xs">—</span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              {/* Atajos */}
              <div className="flex gap-1.5">
                {[
                  { label: 'Esta semana', desde: getLunes(), hasta: getDomingo() },
                  { label: 'Este mes',    desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], hasta: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0] },
                ].map(atajo => (
                  <button
                    key={atajo.label}
                    onClick={() => { setFechaDesde(atajo.desde); setFechaHasta(atajo.hasta); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${fechaDesde === atajo.desde && fechaHasta === atajo.hasta ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                    {atajo.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
              {([
                { key: 'completadas', label: 'Completadas', count: rutasCompletadas.length, cls: 'text-emerald-700 bg-white' },
                { key: 'canceladas',  label: 'Canceladas',  count: rutasCanceladas.length,  cls: 'text-slate-600 bg-white' },
              ] as const).map(st => (
                <button
                  key={st.key}
                  onClick={() => setSubTabComp(st.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${subTabComp === st.key ? st.cls + ' shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {st.label}
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${subTabComp === st.key ? 'bg-slate-100' : 'bg-slate-200 text-slate-500'}`}>
                    {st.count}
                  </span>
                </button>
              ))}
            </div>

            {loadingHistorial ? (
              <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600" /></div>
            ) : rutasComp.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                {q ? 'Sin resultados para la búsqueda.' : `No hay rutas ${subTabComp} en el período seleccionado.`}
              </div>
            ) : (
              <div className="space-y-3">
                {rutasComp.map((r: any) => <RutaCard key={r.id} ruta={r} {...propsRutaCard} historial />)}
              </div>
            )}
          </div>
        )}

        {/* ── Contenido tab Instaladores ── */}
        {mainTab === 'instaladores' && !readOnly && (
          <InstaladorGestionTab />
        )}
        </div>
      </div>

      {/* Modal programar ruta */}
      {showModal && (
        <ProgramarRutaModal
          odpsDisponibles={odpsParaModal}
          rutaExistente={rutaEditar}
          odpsPreseleccionadas={preseleccionRuta?.odps}
          fechaPreseleccion={preseleccionRuta?.fecha}
          onClose={() => { setShowModal(false); setRutaEditar(null); setPreseleccionRuta(null); }}
          onSaved={() => { setShowModal(false); setRutaEditar(null); setPreseleccionRuta(null); cargar(); }}
        />
      )}

      {/* Modal registrar entrega con foto */}
      {finalizarModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <PackageCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">Registrar entrega</p>
                  <p className="text-xs text-slate-400">{finalizarModal.numeroOdp}</p>
                </div>
              </div>
              <button onClick={() => setFinalizarModal(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <XIcon className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Fotos evidencia */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Fotos de evidencia *
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">{fotosFinalizar.length}/10</span>
                </div>
                {fotosFinalizar.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {fotosFinalizar.map((f, i) => (
                      <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 aspect-square">
                        <img src={URL.createObjectURL(f)} alt={`Evidencia ${i + 1}`} className="w-full h-full object-cover" />
                        <button onClick={() => setFotosFinalizar(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/60 text-white hover:bg-red-600">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {fotosFinalizar.length < 10 && (
                  <label className="flex flex-col items-center justify-center gap-1 w-full h-20 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-all">
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        const restantes = 10 - fotosFinalizar.length;
                        if (files.length > restantes) return toast.error(`Máximo 10 fotos. Puedes agregar ${restantes} más.`);
                        setFotosFinalizar(prev => [...prev, ...files]);
                      }}
                    />
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-[10px] text-slate-400 font-medium">Agregar foto{fotosFinalizar.length > 0 ? ' más' : ''}</span>
                  </label>
                )}
              </div>

              {/* Datos receptor */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                  Nombre de quien recibe <span className="normal-case font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={datosReceptor}
                  onChange={e => setDatosReceptor(e.target.value)}
                  placeholder="Ej. Carlos Mendoza, portero, propietario..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={() => setFinalizarModal(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarFinalizar}
                disabled={savingFinalizar || !fotosFinalizar.length}
                className="flex-[2] py-2.5 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
              >
                {savingFinalizar ? 'Guardando...' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ODPFichaModal */}
      {selectedOdpId && (
        <ODPFichaModal
          odpId={selectedOdpId}
          onClose={() => setSelectedOdpId(null)}
        />
      )}

      {/* Modal motivo pausa */}
      {pauseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                <PauseCircle className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">Pausar instalación</p>
                <p className="text-xs text-slate-400">{pauseModal.numeroOdp} — La ODP volverá a "Listo para instalar"</p>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Motivo *</label>
              <textarea
                rows={3}
                value={pauseMotivo}
                onChange={e => setPauseMotivo(e.target.value)}
                placeholder="Ej. El cliente no estaba en el sitio, faltó material..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPauseModal(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-200 transition">
                Cancelar
              </button>
              <button onClick={handleConfirmarPausa} className="flex-1 py-2.5 bg-violet-600 text-white font-semibold text-sm rounded-xl hover:bg-violet-700 transition shadow-sm">
                Confirmar pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JefeView;
