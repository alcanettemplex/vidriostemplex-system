import React, { useEffect, useState } from 'react';
import { Phone, User, Clock, TrendingUp, PhoneCall, RefreshCw, Inbox } from 'lucide-react';
import { SupervisionLeadItem } from '../types';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const PRIORIDAD_DOT: Record<string, string> = {
  alta: 'bg-rose-400',
  media: 'bg-amber-400',
  baja: 'bg-emerald-400',
};

const PRIORIDAD_TEXT: Record<string, string> = {
  alta: 'text-rose-300',
  media: 'text-amber-300',
  baja: 'text-emerald-300',
};

const ETAPA_LABEL: Record<string, string> = {
  ASIGNADO: 'Asignado', EN_CONTACTO: 'En Contacto', COTIZANDO: 'Cotizando',
  SEGUIMIENTO: 'Seguimiento', VISITA_TECNICA: 'Visita Técnica', APROBADO: 'Aprobado',
};

interface LeadRadarPanelProps {
  leads: SupervisionLeadItem[];
  loading: boolean;
  emptyLabel: string;
  onRegistrarIntento?: (leadId: number) => Promise<void>;
}

const LeadRadarPanel: React.FC<LeadRadarPanelProps> = ({ leads, loading, emptyLabel, onRegistrarIntento }) => {
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  const [registrando, setRegistrando] = useState(false);

  useEffect(() => {
    if (leads.length === 0) { setSeleccionadoId(null); return; }
    if (!leads.some(l => l.id === seleccionadoId)) setSeleccionadoId(leads[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads]);

  const seleccionado = leads.find(l => l.id === seleccionadoId) || null;

  const handleRegistrar = async () => {
    if (!seleccionado || !onRegistrarIntento) return;
    setRegistrando(true);
    try {
      await onRegistrarIntento(seleccionado.id);
    } finally {
      setRegistrando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 gap-2 text-sm font-medium">
        <RefreshCw className="w-4 h-4 animate-spin" /> Cargando radar...
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-300">
        <Inbox className="w-10 h-10" />
        <p className="text-sm font-semibold text-slate-400">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5" style={{ minHeight: 480 }}>
      {/* Panel oscuro — lista priorizada */}
      <div className="lg:col-span-2 bg-[#171330] rounded-3xl p-3 overflow-y-auto max-h-[640px]">
        <div className="space-y-1.5">
          {leads.map(lead => {
            const activo = lead.id === seleccionadoId;
            return (
              <button
                key={lead.id}
                onClick={() => setSeleccionadoId(lead.id)}
                className={`w-full text-left rounded-2xl px-4 py-3 transition-all ${
                  activo
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-900/40'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-bold truncate ${activo ? 'text-white' : 'text-slate-200'}`}>{lead.nombre}</p>
                  <span className={`text-xs font-extrabold shrink-0 ${activo ? 'text-white' : 'text-slate-300'}`}>
                    {fmtCOP(lead.monto_proyectado_cotizacion)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${PRIORIDAD_DOT[lead.accion_sugerida.prioridad]}`} />
                  <span className={`text-[11px] font-semibold truncate ${activo ? 'text-indigo-100' : PRIORIDAD_TEXT[lead.accion_sugerida.prioridad]}`}>
                    {lead.accion_sugerida.texto}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-[11px] font-medium ${activo ? 'text-indigo-100' : 'text-slate-400'}`}>{lead.asesor_nombre}</span>
                  <span className={`text-[11px] font-bold ${activo ? 'text-white' : 'text-slate-400'}`}>{lead.dias_en_etapa}d</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel blanco — detalle del seleccionado */}
      <div className="lg:col-span-3 bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] p-6">
        {!seleccionado ? (
          <div className="h-full flex items-center justify-center text-slate-300 text-sm font-medium">
            Selecciona un lead de la lista
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex items-start justify-between pb-5 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-extrabold text-slate-800">{seleccionado.nombre}</h3>
                <div className="flex items-center gap-1.5 mt-1 text-slate-400">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="text-sm font-mono font-medium">{seleccionado.telefono}</span>
                </div>
              </div>
              {seleccionado.estado_crm && (
                <span className="text-xs font-black px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600">
                  {ETAPA_LABEL[seleccionado.estado_crm] || seleccionado.estado_crm}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 py-5">
              <div className="bg-[#F6F5FC] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">Monto proyectado</p>
                <p className="text-lg font-extrabold text-slate-800">{fmtCOP(seleccionado.monto_proyectado_cotizacion)}</p>
              </div>
              <div className="bg-[#F6F5FC] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> Asesor
                </p>
                <p className="text-lg font-extrabold text-slate-800 truncate">{seleccionado.asesor_nombre}</p>
              </div>
              <div className="bg-[#F6F5FC] rounded-2xl p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Días estancado
                </p>
                <p className="text-lg font-extrabold text-slate-800">{seleccionado.dias_en_etapa}d</p>
              </div>
              {seleccionado.intentos_seguimiento !== undefined && (
                <div className="bg-[#F6F5FC] rounded-2xl p-4">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> Intentos
                  </p>
                  <p className="text-lg font-extrabold text-slate-800">{seleccionado.intentos_seguimiento}/3</p>
                </div>
              )}
            </div>

            <div className={`rounded-2xl p-4 mb-5 ${
              seleccionado.accion_sugerida.prioridad === 'alta' ? 'bg-rose-50' :
              seleccionado.accion_sugerida.prioridad === 'media' ? 'bg-amber-50' : 'bg-emerald-50'
            }`}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-1 text-slate-500">Acción sugerida</p>
              <p className={`text-sm font-bold ${
                seleccionado.accion_sugerida.prioridad === 'alta' ? 'text-rose-700' :
                seleccionado.accion_sugerida.prioridad === 'media' ? 'text-amber-700' : 'text-emerald-700'
              }`}>{seleccionado.accion_sugerida.texto}</p>
            </div>

            <div className="mt-auto flex justify-end">
              {onRegistrarIntento && (
                <button
                  onClick={handleRegistrar}
                  disabled={registrando}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <PhoneCall className="w-4 h-4" />
                  {registrando ? 'Registrando...' : 'Registrar intento'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadRadarPanel;
