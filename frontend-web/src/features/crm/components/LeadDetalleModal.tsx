import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import {
  X, Clock, User, Phone, DollarSign,
  ChevronRight, Check, Loader2,
  Activity, Send, Flame, UserPlus
} from 'lucide-react';
import {
  apiGetLeadTimeline,
  apiUpdateLeadMonto,
  apiRegisterLeadSeguimiento,
  apiGetAsesores,
  apiAssignLeadToUser
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
  onClose: () => void;
  inlineMode?: boolean; // Panel permanente sin overlay (Propuesta 5)
}

// ─── Componente principal ─────────────────────────────────────────────────────
const LeadDetalleModal: React.FC<Props> = ({ lead, rol, onClose, inlineMode = false }) => {
  const dispatch = useDispatch();

  // Estado del timeline
  const [timeline, setTimeline]           = useState<any[]>([]);
  const [loadingTimeline, setLoadingTL]   = useState(true);

  // Estado del monto
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [monto, setMonto]                 = useState<string>(lead.monto_proyectado_cotizacion || '');
  const [guardandoMonto, setGuardandoM]   = useState(false);

  // Estado del seguimiento
  const [notaSeguimiento, setNota]        = useState('');
  const [registrando, setRegistrando]     = useState(false);

  // Estado de asignación de asesor
  const [asesores, setAsesores]           = useState<any[]>([]);
  const [cargandoAsesores, setCargandoA]  = useState(false);
  const [asignando, setAsignando]         = useState(false);

  // Modal conversión
  const [showConvertir, setShowConvertir] = useState(false);

  // ─── Permisos por rol ─────────────────────────────────────────────────────
  const puedeAsignarManual = ['asistente_administrativo', 'admin', 'gerencia', 'root'].includes(rol);
  const puedeEditarMonto   = ['asesor_comercial', 'admin', 'gerencia', 'asistente_administrativo', 'root'].includes(rol);
  const puedeSeguir        = !!lead.asesor_id && !['APROBADO', 'PERDIDO'].includes(lead.estado_crm);
  const puedeConvertir     = lead.estado_crm === 'APROBADO' && !lead.cliente_id && ['asesor_comercial', 'admin', 'gerencia'].includes(rol);

  const estadoInfo = ESTADO_INFO[lead.estado_crm] || { label: lead.estado_crm, color: 'text-slate-600', bg: 'bg-slate-100' };

  // ─── Efectos iniciales ────────────────────────────────────────────────────
  useEffect(() => {
    // Cargar timeline
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

    // Cargar asesores solo si tiene permisos
    if (puedeAsignarManual) {
      setCargandoA(true);
      apiGetAsesores()
        .then(res => setAsesores(Array.isArray(res.data) ? res.data : []))
        .catch(() => toast.error('No se pudo cargar la lista de asesores'))
        .finally(() => setCargandoA(false));
    }
  }, [lead.id, puedeAsignarManual]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  const recargarTimeline = async () => {
    const { data } = await apiGetLeadTimeline(lead.id);
    setTimeline(data);
  };

  const handleGuardarMonto = async () => {
    const num = parseFloat(String(monto).replace(/[^\d.]/g, ''));
    if (isNaN(num) || num < 0) { toast.error('Ingresa un monto válido'); return; }
    setGuardandoM(true);
    try {
      const { data } = await apiUpdateLeadMonto(lead.id, num);
      dispatch(updateLead(data));
      toast.success('Monto actualizado');
      setEditandoMonto(false);
      await recargarTimeline();
    } catch {
      toast.error('Error al guardar el monto');
    } finally {
      setGuardandoM(false);
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

  // ─── Utilidades de formato ────────────────────────────────────────────────
  const formatCOP = (v: number | null | undefined) => {
    if (!v && v !== 0) return '—';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  };

  const formatFecha = (d: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (inlineMode) {
    return (
      <div className="flex flex-col h-full">
        {/* Cabecera inline */}
        <div className="flex items-start justify-between px-4 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ESTADO_INFO[lead.estado_crm]?.bg || 'bg-slate-100'
              } ${ESTADO_INFO[lead.estado_crm]?.color || 'text-slate-600'}`}>
                {ESTADO_INFO[lead.estado_crm]?.label || lead.estado_crm}
              </span>
              {lead.intentos_seguimiento > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${lead.intentos_seguimiento >= 2 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-amber-100 text-amber-600'}`}>
                  {lead.intentos_seguimiento}/3 🔥
                </span>
              )}
            </div>
            <h2 className="text-base font-black text-slate-800 truncate">{lead.nombre || 'Sin nombre'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Cuerpo */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {puedeConvertir && (
            <button onClick={() => setShowConvertir(true)} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition-colors">
              <Check className="w-3.5 h-3.5" /> Convertir a Cliente
            </button>
          )}
          {lead.cliente_id && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-semibold">
              <Check className="w-3.5 h-3.5" /> Ya convertido a cliente
            </div>
          )}
          {puedeAsignarManual && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
              <h3 className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                {lead.asesor_id ? 'Re-asignar' : 'Asignar Asesor'}
                {(asignando || cargandoAsesores) && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
              </h3>
              <select disabled={asignando || cargandoAsesores} value={lead.asesor_id || ''} onChange={e => handleAsignarAsesor(e.target.value)}
                className="w-full text-xs border border-blue-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-300">
                <option value="" disabled>{cargandoAsesores ? 'Cargando...' : 'Seleccionar asesor...'}</option>
                {asesores.filter((u: any) => u.rol === 'asesor_comercial').map((u: any) => (
                  <option key={u.id} value={u.id}>{u.nombre_completo}</option>
                ))}
              </select>
            </div>
          )}
          {puedeSeguir && !puedeAsignarManual && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-500" /> Registrar Seguimiento
              </h3>
              <textarea value={notaSeguimiento} onChange={e => setNota(e.target.value)} rows={3}
                placeholder="Ej: Llamé, no contestó..." className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={handleRegistrarSeguimiento} disabled={registrando || !notaSeguimiento.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
                {registrando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                Registrar Intento #{(lead.intentos_seguimiento || 0) + 1}
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <InfoCard icon={<User className="w-3.5 h-3.5" />} label="Asesor" value={lead.asesor?.nombre_completo || 'Sin asignar'} />
            <InfoCard icon={<Clock className="w-3.5 h-3.5" />} label="Segmento" value={lead.segmento || '—'} />
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5 text-indigo-500" />Monto proyectado</span>
              {puedeEditarMonto && !editandoMonto && <button onClick={() => setEditandoMonto(true)} className="text-[10px] text-indigo-600 font-bold underline">Editar</button>}
            </div>
            <div className="px-3 py-2">
              {editandoMonto ? (
                <div className="flex gap-1.5">
                  <input type="number" value={monto} onChange={e => setMonto(e.target.value)} autoFocus className="flex-1 border rounded px-2 py-1 text-xs outline-none" />
                  <button onClick={handleGuardarMonto} className="bg-indigo-600 text-white px-2 py-1 rounded text-[10px] font-bold">{guardandoMonto ? '...' : 'OK'}</button>
                  <button onClick={() => setEditandoMonto(false)} className="text-slate-400 text-xs">✕</button>
                </div>
              ) : (
                <p className="text-lg font-black text-slate-800">{formatCOP(lead.monto_proyectado_cotizacion)}</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-indigo-400" />Historial</h3>
            {loadingTimeline ? <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div> :
            timeline.length === 0 ? <p className="text-[10px] text-slate-400 italic text-center py-2">Sin eventos</p> : (
              <div className="space-y-2">
                {timeline.map((ev: any, i: number) => {
                  const ei = EVENTO_ICON[ev.tipo] || { icon: <Activity className="w-3 h-3" />, color: 'text-slate-500 bg-slate-100' };
                  return (
                    <div key={ev.id || i} className="flex items-start gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ei.color}`}>{ei.icon}</div>
                      <div><p className="text-[10px] text-slate-700 font-medium leading-snug">{ev.detalle_texto || ev.tipo}</p>
                      <span className="text-[9px] text-slate-400">{formatFecha(ev.createdAt)}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-[10px] text-slate-400">ID: {lead.id}</span>
          <button onClick={onClose} className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900">Cerrar</button>
        </div>
        {showConvertir && <ConvertirClienteModal lead={lead} onClose={() => setShowConvertir(false)} />}
      </div>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel lateral flotante */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* ── Cabecera ── */}
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
            {lead.telefono && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500">
                <Phone className="w-3.5 h-3.5" />
                {lead.telefono}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Cuerpo scrolleable ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Botón convertir */}
          {puedeConvertir && (
            <button
              onClick={() => setShowConvertir(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Check className="w-4 h-4" />
              Convertir a Cliente
            </button>
          )}

          {/* Badge ya convertido */}
          {lead.cliente_id && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-semibold">
              <Check className="w-4 h-4" />
              Este lead ya fue convertido a cliente
            </div>
          )}

          {/* ── PANEL ASIGNACIÓN DE ASESOR ── */}
          {puedeAsignarManual && (
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  {lead.asesor_id ? 'Re-asignar Asesor' : 'Asignar Asesor'}
                </h3>
                {(asignando || cargandoAsesores) && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                )}
              </div>

              <select
                disabled={asignando || cargandoAsesores}
                value={lead.asesor_id || ''}
                onChange={e => handleAsignarAsesor(e.target.value)}
                className="w-full text-sm border border-blue-200 rounded-xl px-4 py-2.5 bg-white outline-none focus:ring-2 focus:ring-blue-300 transition-all font-medium text-slate-700"
              >
                <option value="" disabled>
                  {cargandoAsesores ? 'Cargando asesores...' : 'Seleccionar asesor comercial...'}
                </option>
                {asesores
                  .filter((u: any) => u.rol === 'asesor_comercial')
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre_completo}
                    </option>
                  ))}
              </select>

              <p className="text-[10px] text-blue-600 font-medium italic">
                * El asesor verá este lead en su tablero inmediatamente después de la asignación.
              </p>
            </div>
          )}

          {/* ── PANEL SEGUIMIENTO (solo asesor sin permisos de asignación) ── */}
          {puedeSeguir && !puedeAsignarManual && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-500" />
                Registrar Seguimiento
              </h3>
              <textarea
                value={notaSeguimiento}
                onChange={e => setNota(e.target.value)}
                placeholder="Ej: Enviada propuesta técnica, esperando respuesta..."
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 min-h-[80px] focus:ring-2 focus:ring-indigo-300 outline-none transition-all"
              />
              <button
                onClick={handleRegistrarSeguimiento}
                disabled={registrando || !notaSeguimiento.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
              >
                {registrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Registrar Intento #{(lead.intentos_seguimiento || 0) + 1}
              </button>
              {lead.intentos_seguimiento >= 2 && (
                <p className="text-[11px] text-rose-500 font-bold text-center flex items-center justify-center gap-1">
                  <Flame className="w-3 h-3" />
                  ATENCIÓN: Si este intento falla, el lead pasará a FRÍO.
                </p>
              )}
            </div>
          )}

          {/* ── INFO CARDS ── */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard icon={<User className="w-4 h-4" />}     label="Segmento"     value={lead.segmento || '—'} />
            <InfoCard icon={<Activity className="w-4 h-4" />} label="Producto"     value={lead.producto_interes || '—'} />
            <InfoCard icon={<User className="w-4 h-4" />}     label="Asesor"       value={lead.asesor?.nombre_completo || 'Sin asignar'} />
            <InfoCard icon={<Clock className="w-4 h-4" />}    label="Fecha cierre" value={lead.fecha_cierre ? formatFecha(lead.fecha_cierre) : '—'} />
          </div>

          {/* ── MONTO PROYECTADO ── */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 text-slate-700 text-sm font-bold">
                <DollarSign className="w-4 h-4 text-indigo-500" />
                Monto proyectado
              </div>
              {puedeEditarMonto && !editandoMonto && (
                <button onClick={() => setEditandoMonto(true)} className="text-xs text-indigo-600 font-semibold underline">
                  Editar
                </button>
              )}
            </div>
            <div className="px-4 py-3">
              {editandoMonto ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={monto}
                    onChange={e => setMonto(e.target.value)}
                    className="flex-1 border rounded px-2 py-1 text-sm outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleGuardarMonto}
                    disabled={guardandoMonto}
                    className="bg-indigo-600 text-white px-3 py-1 rounded text-xs font-bold"
                  >
                    {guardandoMonto ? '...' : 'Guardar'}
                  </button>
                  <button onClick={() => setEditandoMonto(false)} className="text-slate-500 text-xs">✕</button>
                </div>
              ) : (
                <p className="text-2xl font-black text-slate-800">{formatCOP(lead.monto_proyectado_cotizacion)}</p>
              )}
            </div>
          </div>

          {/* ── TIMELINE ── */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Historial de actividad
            </h3>
            {loadingTimeline ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            ) : timeline.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-xs italic">Sin eventos registrados</div>
            ) : (
              <div className="space-y-3">
                {timeline.map((evento: any, idx: number) => {
                  const eInfo = EVENTO_ICON[evento.tipo] || { icon: <Activity className="w-3.5 h-3.5" />, color: 'text-slate-500 bg-slate-100' };
                  return (
                    <div key={evento.id || idx} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${eInfo.color}`}>
                        {eInfo.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-700 font-medium leading-snug">
                          {evento.detalle_texto || evento.tipo}
                        </p>
                        <span className="text-[10px] text-slate-400">{formatFecha(evento.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* ── Pie ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 italic">ID: {lead.id}</span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Modal conversión */}
      {showConvertir && (
        <ConvertirClienteModal lead={lead} onClose={() => setShowConvertir(false)} />
      )}
    </>
  );
};

export default LeadDetalleModal;
