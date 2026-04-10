import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import {
  X, Clock, User, Phone, DollarSign,
  ChevronRight, Check, Loader2,
  Activity, Send, Flame, UserPlus, Zap, Tag,
  Calendar, CheckCircle2, ShieldCheck, Link2, Search, ExternalLink
} from 'lucide-react';
import {
  apiGetLeadTimeline,
  apiUpdateLeadMonto,
  apiRegisterLeadSeguimiento,
  apiGetAsesores,
  apiAssignLeadToUser,
  apiUpdateLeadStatus,
  apiUpdateLeadDetails,
  apiSearchODPs,
  apiVincularODP,
} from '../crmService';
import { updateLead } from '../crmSlice';
import ConvertirClienteModal from './ConvertirClienteModal';

// ─── Mapa estado → etiqueta visual ───────────────────────────────────────────
const ESTADO_INFO: Record<string, { label: string; color: string; bg: string }> = {
  NUEVO:          { label: 'Bolsa Común',    color: 'text-slate-600',  bg: 'bg-slate-100' },
  ASIGNADO:       { label: 'Asignado',       color: 'text-blue-700',   bg: 'bg-blue-100' },
  EN_CONTACTO:    { label: 'En Contacto',    color: 'text-purple-700', bg: 'bg-purple-100' },
  COTIZANDO:      { label: 'Cotizando',      color: 'text-amber-700',  bg: 'bg-amber-100' },
  VISITA_TECNICA: { label: 'Visita Técnica', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  FRIO:           { label: 'Enfriado',       color: 'text-gray-600',   bg: 'bg-gray-100' },
  APROBADO:       { label: 'Aprobado ✓',     color: 'text-emerald-700', bg: 'bg-emerald-100' },
  PERDIDO:        { label: 'Perdido',        color: 'text-rose-700',   bg: 'bg-rose-100' },
};

const PIPELINE_PATH = ['NUEVO', 'ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA', 'APROBADO'];

// Etapas mostradas en el stepper (sin NUEVO, sin FRIO/PERDIDO que son acciones separadas)
const STEPPER_STAGES = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'VISITA_TECNICA', 'APROBADO'];

const MOTIVOS_PERDIDA = [
  'Precio alto',
  'Fue con la competencia',
  'Sin respuesta del cliente',
  'Proyecto cancelado',
  'Sin presupuesto',
  'Otro',
];

// ─── Ícono inline para mensajes ───────────────────────────────────────────────
const MsgIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Mapa tipo de evento → datos visuales ────────────────────────────────────
const EVENTO_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  CREACION:      { icon: <Activity className="w-3.5 h-3.5" />,   color: 'text-blue-500 bg-blue-50' },
  ASIGNACION:    { icon: <User className="w-3.5 h-3.5" />,       color: 'text-indigo-500 bg-indigo-50' },
  SEGUIMIENTO:   { icon: <Clock className="w-3.5 h-3.5" />,      color: 'text-purple-500 bg-purple-50' },
  COMUNICACION:  { icon: <MsgIcon className="w-3.5 h-3.5" />,    color: 'text-blue-500 bg-blue-50' },
  CAMBIO_ESTADO: { icon: <ChevronRight className="w-3.5 h-3.5" />, color: 'text-amber-500 bg-amber-50' },
  PASE_A_FRIO:   { icon: <Flame className="w-3.5 h-3.5" />,      color: 'text-rose-500 bg-rose-50' },
  CONVERSION:    { icon: <Check className="w-3.5 h-3.5" />,      color: 'text-emerald-500 bg-emerald-50' },
};

// ─── Componente mini de tarjeta info ─────────────────────────────────────────
const InfoCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase mb-1">{icon} {label}</div>
    <p className="text-xs font-bold text-slate-800 truncate">{value}</p>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  lead: any;
  rol: string;
  userId?: number;
  onClose: () => void;
  inlineMode?: boolean;
}

// ─── Catálogos estandarizados ────────────────────────────────────────────────
const PRODUCTOS = [
  'Cabina de baño', 'División oficina', 'Espejos', 'Fachadas', 'Mantenimiento',
  'Otros', 'Pasamanos', 'Pérgola', 'Puerta batiente', 'Puerta corrediza',
  'Puertas de vidrio', 'Puertas vidrieras', 'Reposición vidrios', 'Tablero',
  'Ventanas aluminio', 'Ventanería', 'Ventas en la mano', 'Vidrio crudo',
  'Vidrio Templado', 'producto no disponible'
];

const SEGMENTOS = ['Arquitecto', 'Cliente final', 'Industrial', 'Institucional', 'Intervid'];

// ─── Componente principal ─────────────────────────────────────────────────────
const LeadDetalleModal: React.FC<Props> = ({ lead, rol, userId, onClose, inlineMode = false }) => {
  const dispatch = useDispatch();

  // Estado del timeline
  const [timeline, setTimeline]           = useState<any[]>([]);
  const [loadingTimeline, setLoadingTL]   = useState(true);

  // Estado de edición de datos principales
  const [editandoInfo, setEditandoInfo]   = useState(false);
  const [formData, setFormData]           = useState({
    segmento: lead.segmento || '',
    producto_interes: lead.producto_interes || '',
    monto_proyectado: lead.monto_proyectado_cotizacion || '',
    producto_otro: ''
  });

  // Estado del seguimiento
  const [notaSeguimiento, setNota]        = useState('');
  const [registrando, setRegistrando]     = useState(false);

  // Estado de asignación de asesor
  const [asesores, setAsesores]           = useState<any[]>([]);
  const [cargandoAsesores, setCargandoA]  = useState(false);
  const [asignando, setAsignando]         = useState(false);

  // Modal conversión
  const [showConvertir, setShowConvertir] = useState(false);

  // Estado movimiento de etapa
  const [moviendoEstado, setMoviendoEstado]           = useState(false);
  const [motivoPerdidaInline, setMotivoPerdidaInline] = useState(false);
  const [motivoInput, setMotivoInput]                 = useState('');

  // Estado vínculo ODP
  const [busquedaODP, setBusquedaODP]   = useState('');
  const [resultadosODP, setResultados]  = useState<any[]>([]);
  const [buscandoODP, setBuscandoODP]   = useState(false);
  const [vinculando, setVinculando]     = useState(false);

  // ─── Permisos por rol ─────────────────────────────────────────────────────
  const esAdminOGerencia  = ['admin', 'gerencia', 'root'].includes(rol);
  const esAdministrativo  = ['asistente_administrativo', 'admin', 'gerencia', 'root'].includes(rol);
  const puedeAsignarManual = esAdministrativo;
  const puedeEditar       = ['asesor_comercial', 'asistente_administrativo', 'admin', 'gerencia', 'root'].includes(rol);
  const puedeSeguir       = !!lead.asesor_id && !['APROBADO', 'PERDIDO'].includes(lead.estado_crm);
  const puedeMovarEstado  = esAdminOGerencia || (rol === 'asesor_comercial' && lead.asesor_id === userId);

  const estadoInfo = ESTADO_INFO[lead.estado_crm] || { label: lead.estado_crm, color: 'text-slate-600', bg: 'bg-slate-100' };

  // ─── Efectos iniciales ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoadingTL(true);
        const { data } = await apiGetLeadTimeline(lead.id);
        setTimeline(data);
      } catch {
        toast.error('No se pudo cargar el historial');
      } finally {
        setLoadingTL(false);
      }
    })();

    if (puedeAsignarManual) {
      setCargandoA(true);
      apiGetAsesores()
        .then(res => setAsesores(
          Array.isArray(res.data)
            ? res.data.filter((u: any) => ['asesor_comercial', 'gerencia'].includes(u.rol))
            : []
        ))
        .catch(() => toast.error('No se pudo cargar la lista de asesores'))
        .finally(() => setCargandoA(false));
    }
  }, [lead.id, puedeAsignarManual]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const recargarTimeline = async () => {
    const { data } = await apiGetLeadTimeline(lead.id);
    setTimeline(data);
  };

  const handleGuardarCambios = async () => {
    const finalProducto = formData.producto_interes === 'Otros' ? formData.producto_otro : formData.producto_interes;
    
    setRegistrando(true);
    try {
      const payload = {
        monto_proyectado_cotizacion: parseFloat(String(formData.monto_proyectado)),
        segmento: formData.segmento,
        producto_interes: finalProducto
      };

      const { data } = await apiUpdateLeadDetails(lead.id, payload);
      dispatch(updateLead(data));
      toast.success('Información actualizada');
      setEditandoInfo(false);
      await recargarTimeline();
    } catch {
      toast.error('Error al guardar los cambios');
    } finally {
      setRegistrando(false);
    }
  };

  const handleAsignarAsesor = async (asesorId: string) => {
    if (!asesorId) return;
    setAsignando(true);
    try {
      const { data } = await apiAssignLeadToUser(lead.id, parseInt(asesorId));
      dispatch(updateLead(data));
      toast.success('Asesor asignado correctamente');
      await recargarTimeline();
    } catch {
      toast.error('Error al asignar asesor');
    } finally {
      setAsignando(false);
    }
  };

  const handleRegistrarSeguimiento = async () => {
    setRegistrando(true);
    try {
      const { data } = await apiRegisterLeadSeguimiento(lead.id, notaSeguimiento);
      dispatch(updateLead(data));
      const intentos = data.intentos_seguimiento;
      if (intentos >= 3) {
        toast.info('Lead movido a estado FRÍO por 3 intentos sin respuesta.');
      } else {
        toast.success(`Seguimiento #${intentos} registrado.`);
      }
      setNota('');
      await recargarTimeline();
    } catch {
      toast.error('No se pudo registrar el seguimiento');
    } finally {
      setRegistrando(false);
    }
  };

  const handleMoverAEtapa = async (nuevoEstado: string, motivo?: string) => {
    setMoviendoEstado(true);
    try {
      const { data } = await apiUpdateLeadStatus(lead.id, nuevoEstado, motivo);
      dispatch(updateLead(data));
      setMotivoPerdidaInline(false);
      setMotivoInput('');
      const etiqueta = ESTADO_INFO[nuevoEstado]?.label || nuevoEstado;
      if (data.estado_crm === 'FRIO' && nuevoEstado !== 'FRIO') {
        toast.info(`Lead movido automáticamente a Enfriado por el sistema.`);
      } else {
        toast.success(`Lead movido a "${etiqueta}"`);
      }
      await recargarTimeline();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al cambiar de etapa');
    } finally {
      setMoviendoEstado(false);
    }
  };

  const handleBuscarODP = async (q: string) => {
    setBusquedaODP(q);
    if (!q || q.length < 2) { setResultados([]); return; }
    setBuscandoODP(true);
    try {
      const { data } = await apiSearchODPs(q, lead.cliente_id || undefined);
      setResultados(data);
    } catch {
      setResultados([]);
    } finally {
      setBuscandoODP(false);
    }
  };

  const handleVincularODP = async (odp_id: number | null) => {
    setVinculando(true);
    try {
      const { data } = await apiVincularODP(lead.id, odp_id);
      dispatch(updateLead(data));
      setBusquedaODP('');
      setResultados([]);
      toast.success(odp_id ? `Lead vinculado a ODP correctamente` : 'Vínculo con ODP eliminado');
      await recargarTimeline();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al vincular ODP');
    } finally {
      setVinculando(false);
    }
  };

  const formatCOP = (v: number | null | undefined) => {
    if (!v && v !== 0) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  };

  const formatFecha = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const calcularHoras = (inicio: string, fin: string) => {
    if (!inicio || !fin) return null;
    const diff = new Date(fin).getTime() - new Date(inicio).getTime();
    return Math.round(diff / (1000 * 60 * 60));
  };

  return (
    <>
      {!inlineMode && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />}

      <div className={`${
        inlineMode ? 'relative h-full' : 'fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl'
      } flex flex-col overflow-hidden`}>

        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${estadoInfo.bg} ${estadoInfo.color}`}>
                {estadoInfo.label}
              </span>
              {lead.intentos_seguimiento > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  lead.intentos_seguimiento >= 2 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-amber-100 text-amber-700'
                }`}>
                  {lead.intentos_seguimiento >= 2 && <Flame className="w-3 h-3" />}
                  {lead.intentos_seguimiento}/3 Intentos
                </span>
              )}
            </div>
            <h2 className="text-xl font-black text-slate-800 truncate">{lead.nombre || 'Sin nombre'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── STEPPER INTERACTIVO ─────────────────────────────────────── */}
        <div className="px-6 py-4 bg-white border-b border-slate-100 shadow-sm space-y-3">
          {puedeMovarEstado && (
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Mover a etapa →
            </p>
          )}

          {/* Etapas lineales */}
          <div className="flex items-center gap-1">
            {STEPPER_STAGES.map((stageId, idx) => {
              const currentIdx = STEPPER_STAGES.indexOf(
                ['FRIO','PERDIDO'].includes(lead.estado_crm) ? '' : lead.estado_crm
              );
              const isActive  = stageId === lead.estado_crm;
              const isPast    = currentIdx > idx;
              const isClickable = puedeMovarEstado && !isActive && !moviendoEstado;

              return (
                <React.Fragment key={stageId}>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <button
                      disabled={!isClickable}
                      onClick={() => isClickable && handleMoverAEtapa(stageId)}
                      title={isClickable ? `Mover a ${ESTADO_INFO[stageId].label}` : ESTADO_INFO[stageId].label}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                        isActive
                          ? 'bg-indigo-600 border-indigo-600 ring-4 ring-indigo-100 scale-125'
                          : isPast
                          ? 'bg-emerald-500 border-emerald-500 hover:ring-2 hover:ring-emerald-200 cursor-pointer'
                          : isClickable
                          ? 'bg-white border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                          : 'bg-slate-100 border-slate-200 cursor-default'
                      }`}
                    >
                      {isPast && <span className="sr-only">✓</span>}
                    </button>
                    <span className={`text-[7px] font-black uppercase mt-1.5 text-center leading-tight truncate w-full px-0.5 ${
                      isActive ? 'text-indigo-600' : isPast ? 'text-emerald-600' : 'text-slate-300'
                    }`}>
                      {ESTADO_INFO[stageId].label.split(' ')[0]}
                    </span>
                  </div>
                  {idx < STEPPER_STAGES.length - 1 && (
                    <div className={`h-0.5 flex-1 mb-4 transition-all rounded-full ${isPast ? 'bg-emerald-200' : 'bg-slate-100'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Indicador si está en FRIO o PERDIDO */}
          {['FRIO', 'PERDIDO'].includes(lead.estado_crm) && (
            <div className={`text-[10px] font-black px-3 py-1.5 rounded-lg text-center ${
              lead.estado_crm === 'FRIO'
                ? 'bg-slate-100 text-slate-500'
                : 'bg-rose-50 text-rose-600'
            }`}>
              {lead.estado_crm === 'FRIO' ? '❄️ Lead Enfriado' : `✗ Perdido — ${lead.motivo_perdida || 'sin motivo'}`}
            </div>
          )}

          {/* Acciones de cierre (solo si no está ya cerrado) */}
          {puedeMovarEstado && !['FRIO', 'PERDIDO', 'APROBADO'].includes(lead.estado_crm) && !motivoPerdidaInline && (
            <div className="flex gap-2 pt-1">
              <button
                disabled={moviendoEstado}
                onClick={() => handleMoverAEtapa('FRIO')}
                className="flex-1 text-[10px] font-black px-2 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                ❄️ Enfriar
              </button>
              <button
                disabled={moviendoEstado}
                onClick={() => setMotivoPerdidaInline(true)}
                className="flex-1 text-[10px] font-black px-2 py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all disabled:opacity-50"
              >
                ✗ Marcar Perdido
              </button>
            </div>
          )}

          {/* Inline motivo perdida */}
          {motivoPerdidaInline && (
            <div className="space-y-2 pt-1 animate-in slide-in-from-top-2 duration-200">
              <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Motivo de pérdida</p>
              <select
                value={motivoInput}
                onChange={e => setMotivoInput(e.target.value)}
                className="w-full text-xs border border-rose-200 rounded-xl px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-rose-200 font-medium"
              >
                <option value="">Seleccionar motivo...</option>
                {MOTIVOS_PERDIDA.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div className="flex gap-2">
                <button
                  disabled={!motivoInput || moviendoEstado}
                  onClick={() => handleMoverAEtapa('PERDIDO', motivoInput)}
                  className="flex-1 text-[10px] font-black bg-rose-600 text-white py-2 rounded-xl disabled:opacity-40 hover:bg-rose-700 transition-all"
                >
                  {moviendoEstado ? 'Guardando...' : 'CONFIRMAR PÉRDIDA'}
                </button>
                <button
                  onClick={() => { setMotivoPerdidaInline(false); setMotivoInput(''); }}
                  className="px-4 text-[10px] font-black bg-slate-100 text-slate-500 py-2 rounded-xl hover:bg-slate-200 transition-all"
                >
                  CANCELAR
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="bg-indigo-900 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
              <Clock className="w-4 h-4 text-indigo-300" />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Trazabilidad de Proceso</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Asignación', hrs: calcularHoras(lead.createdAt, lead.fecha_asignado) },
                { label: '1er Contacto', hrs: calcularHoras(lead.fecha_asignado, lead.fecha_en_contacto) },
                { label: 'Cierre', hrs: calcularHoras(lead.createdAt, lead.fecha_cierre) },
              ].map(m => (
                <div key={m.label} className="bg-white/5 rounded-xl p-2.5 border border-white/10">
                  <span className="text-[8px] font-bold text-white/40 uppercase block mb-1">{m.label}</span>
                  <p className="text-sm font-black text-white">{m.hrs !== null ? `${m.hrs}h` : '—'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                Información del Prospecto
              </h3>
              {puedeEditar && !editandoInfo && (
                <button onClick={() => setEditandoInfo(true)} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">EDITAR</button>
              )}
            </div>

            {editandoInfo ? (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Segmento</label>
                    <select
                      value={formData.segmento}
                      onChange={e => setFormData({...formData, segmento: e.target.value})}
                      className="w-full text-xs border rounded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                      <option value="">Seleccionar...</option>
                      {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Monto Proyectado</label>
                    <input
                      type="number"
                      value={formData.monto_proyectado}
                      onChange={e => setFormData({...formData, monto_proyectado: e.target.value})}
                      className="w-full text-xs border rounded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Producto de Interés</label>
                  <select
                    value={PRODUCTOS.includes(formData.producto_interes) ? formData.producto_interes : 'Otros'}
                    onChange={e => setFormData({...formData, producto_interes: e.target.value})}
                    className="w-full text-xs border rounded-lg p-2 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="">Seleccionar...</option>
                    {PRODUCTOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {formData.producto_interes === 'Otros' && (
                    <input
                      type="text"
                      placeholder="Especificar producto..."
                      value={formData.producto_otro}
                      onChange={e => setFormData({...formData, producto_otro: e.target.value})}
                      className="w-full text-xs border rounded-lg p-2 mt-2 bg-white outline-none focus:ring-2 focus:ring-indigo-300 border-indigo-200"
                    />
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={handleGuardarCambios} className="flex-1 bg-indigo-600 text-white font-black text-[11px] py-2.5 rounded-xl">GUARDAR CAMBIOS</button>
                  <button onClick={() => setEditandoInfo(false)} className="px-4 bg-slate-100 text-slate-500 font-black text-[11px] py-2.5 rounded-xl">CANCELAR</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <InfoCard icon={<Zap className="w-3 h-3" />} label="Segmento" value={lead.segmento || '—'} />
                <InfoCard icon={<Activity className="w-3 h-3" />} label="Producto" value={lead.producto_interes || '—'} />
                <div className="col-span-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                  <span className="text-[10px] font-black text-emerald-600 uppercase block mb-1">Monto Proyectado</span>
                  <p className="text-xl font-black text-emerald-800">{formatCOP(lead.monto_proyectado_cotizacion)}</p>
                </div>
                {lead.descripcion_contexto && (
                  <div className="col-span-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Descripción / Contexto</span>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{lead.descripcion_contexto}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ASIGNACIÓN (Solo Admin/Asistente/Gerencia) */}
          {puedeAsignarManual && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-3 shadow-sm">
              <h3 className="text-xs font-black text-indigo-800 uppercase flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5" /> Asignar Responsable
              </h3>
              <div className="flex gap-2">
                <select
                  disabled={asignando || cargandoAsesores}
                  onChange={(e) => handleAsignarAsesor(e.target.value)}
                  value={lead.asesor_id || ''}
                  className="flex-1 text-xs border border-indigo-200 rounded-xl px-4 py-2.5 bg-white outline-none focus:ring-2 focus:ring-indigo-300 transition-all font-bold"
                >
                  <option value="">{cargandoAsesores ? 'Cargando...' : 'Seleccionar asesor...'}</option>
                  {asesores.map((as: any) => (
                    <option key={as.id} value={as.id}>
                      {as.nombre_completo}
                    </option>
                  ))}
                </select>
                {asignando && <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mt-2" />}
              </div>
              {!lead.asesor_id && (
                <p className="text-[10px] text-indigo-600 font-bold bg-white/50 p-2 rounded-lg border border-indigo-100/50">
                  ⚠️ Este prospecto está en la bolsa común. Asígnelo para iniciar el seguimiento.
                </p>
              )}
            </div>
          )}

          {/* ── PANEL DE CIERRE (solo APROBADO) ─────────────────────────── */}
          {lead.estado_crm === 'APROBADO' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <h3 className="text-xs font-black text-emerald-800 uppercase flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" /> Cierre del Lead
              </h3>

              {/* Paso 1 — Convertir a cliente */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${lead.cliente_id ? 'bg-white border-emerald-200' : 'bg-emerald-100/50 border-emerald-300'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${lead.cliente_id ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-400 text-emerald-600'}`}>
                  {lead.cliente_id ? <Check className="w-3.5 h-3.5" /> : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Convertir a Cliente</p>
                  {lead.cliente_id
                    ? <p className="text-[10px] text-emerald-600 font-bold">Cliente creado — ID #{lead.cliente_id}</p>
                    : <p className="text-[10px] text-slate-500">Requerido para generar ODP</p>
                  }
                </div>
                {!lead.cliente_id && puedeMovarEstado && (
                  <button
                    onClick={() => setShowConvertir(true)}
                    className="text-[10px] font-black px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex-shrink-0"
                  >
                    Convertir
                  </button>
                )}
              </div>

              {/* Paso 2 — Vincular ODP */}
              <div className={`p-3 rounded-xl border space-y-3 ${lead.odp_id ? 'bg-white border-emerald-200' : lead.cliente_id ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-50 pointer-events-none'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${lead.odp_id ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-400'}`}>
                    {lead.odp_id ? <Check className="w-3.5 h-3.5" /> : '2'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Vincular ODP</p>
                    {lead.odp_id
                      ? <p className="text-[10px] text-emerald-600 font-bold">ODP vinculada correctamente</p>
                      : <p className="text-[10px] text-slate-400">Busca la ODP generada para este cliente</p>
                    }
                  </div>
                  {lead.odp_id && (
                    <button
                      onClick={() => handleVincularODP(null)}
                      disabled={vinculando}
                      className="text-[9px] font-black px-2 py-1 bg-slate-100 text-slate-400 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-all flex-shrink-0"
                      title="Desvincular ODP"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* ODP ya vinculada */}
                {lead.odp && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <Link2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-emerald-800">{lead.odp.numero_odp}</p>
                      <p className="text-[9px] text-emerald-600 capitalize">{lead.odp.estado_produccion?.replace(/_/g, ' ').toLowerCase()}</p>
                    </div>
                    <a
                      href={`/odp?buscar=${lead.odp.numero_odp}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 text-emerald-500 hover:text-emerald-700 transition-colors"
                      title="Ver ODP"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                {/* Buscador de ODP */}
                {!lead.odp_id && lead.cliente_id && puedeMovarEstado && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={busquedaODP}
                        onChange={e => handleBuscarODP(e.target.value)}
                        placeholder="Buscar por número de ODP..."
                        className="w-full text-xs pl-8 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-all"
                      />
                      {buscandoODP && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />}
                    </div>

                    {resultadosODP.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                        {resultadosODP.map((odp: any) => (
                          <button
                            key={odp.id}
                            disabled={vinculando}
                            onClick={() => handleVincularODP(odp.id)}
                            className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-100 last:border-0 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-800">{odp.numero_odp}</p>
                              <p className="text-[9px] text-slate-400 truncate">{odp.cliente?.nombre_razon_social}</p>
                            </div>
                            <span className="text-[8px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full flex-shrink-0 capitalize">
                              {odp.estado_produccion?.replace(/_/g, ' ').toLowerCase()}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {busquedaODP.length >= 2 && !buscandoODP && resultadosODP.length === 0 && (
                      <p className="text-[10px] text-slate-400 text-center py-1">Sin resultados para "{busquedaODP}"</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SEGUIMIENTO */}
          {puedeSeguir && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 shadow-md">
              <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2">
                <Send className="w-3.5 h-3.5 text-indigo-500" /> Registrar Intento de Seguimiento
              </h3>
              <textarea
                value={notaSeguimiento}
                onChange={e => setNota(e.target.value)}
                placeholder="Ej: Llamé, quedó en confirmar presupuesto mañana..."
                className="w-full text-xs border border-slate-200 rounded-xl px-4 py-3 min-h-[90px] focus:ring-2 focus:ring-indigo-300 outline-none bg-white transition-all shadow-inner"
              />
              <button
                onClick={handleRegistrarSeguimiento}
                disabled={registrando || !notaSeguimiento.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg active:scale-95"
              >
                {registrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                REGISTRAR INTENTO #{(lead.intentos_seguimiento || 0) + 1}
              </button>
            </div>
          )}

          <div className="pb-4">
            <h3 className="text-xs font-black text-slate-500 uppercase mb-4 flex items-center gap-2 px-1">
              <Activity className="w-3.5 h-3.5" /> Bitácora de Actividad
            </h3>
            {loadingTimeline ? (
              <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-slate-200" /></div>
            ) : (
              <div className="relative border-l-2 border-slate-100 ml-3.5 space-y-6">
                {timeline.map((ev: any, idx: number) => {
                  const eInfo = EVENTO_ICON[ev.tipo] || { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-slate-500 bg-slate-100' };
                  return (
                    <div key={idx} className="relative pl-6 group">
                      <div className={`absolute -left-[13px] top-0 w-6 h-6 rounded-full border-4 border-white flex items-center justify-center shadow-sm ${eInfo.color}`}>
                        {eInfo.icon}
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm group-hover:shadow-md transition-shadow">
                        <p className="text-xs text-slate-700 font-bold mb-1 leading-snug">{ev.detalle_texto || ev.tipo}</p>
                        <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{formatFecha(ev.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">ID DEL PROSPECTO</span>
            <span className="text-sm font-black text-slate-600">#{String(lead.id).padStart(5, '0')}</span>
          </div>
          <button
            onClick={onClose}
            className="px-8 py-2.5 bg-slate-900 text-white text-xs font-black rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest"
          >
            Cerrar Panel
          </button>
        </div>
      </div>

      {showConvertir && <ConvertirClienteModal lead={lead} onClose={() => setShowConvertir(false)} />}
    </>
  );
};

export default LeadDetalleModal;
