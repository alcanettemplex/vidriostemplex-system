import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  RefreshCw, AlertTriangle, ChevronDown, ChevronRight,
  Activity, User, Clock, Circle, Loader2,
} from 'lucide-react';
import { apiGetMonitorAsesores, apiGetLeadById } from '../crmService';
import LeadDetalleModal from './LeadDetalleModal';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface LeadResumen {
  id: number;
  nombre: string;
  telefono: string;
  producto_interes: string | null;
  estado_crm: string;
  dias_en_etapa: number;
  monto_proyectado_cotizacion: number;
  intentos_seguimiento: number;
  segmento: string | null;
  createdAt: string;
}

interface AsesorMonitor {
  asesor_id: number;
  asesor_nombre: string;
  total_activos: number;
  total_en_rojo: number;
  total_en_ambar: number;
  leads_por_etapa: Record<string, LeadResumen[]>;
}

interface Props {
  rol: string;
  userId?: number;
}

// ─── Config de etapas ─────────────────────────────────────────────────────────
const ETAPAS_ORDEN = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA'] as const;

const ETAPA_CFG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  ASIGNADO:       { label: 'Asignado',      color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100',   dot: 'bg-blue-500' },
  EN_CONTACTO:    { label: 'En Contacto',   color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100', dot: 'bg-violet-500' },
  COTIZANDO:      { label: 'Cotizando',     color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100',  dot: 'bg-amber-500' },
  SEGUIMIENTO:    { label: 'Seguimiento',   color: 'text-teal-700',   bg: 'bg-teal-50',   border: 'border-teal-100',   dot: 'bg-teal-500' },
  VISITA_TECNICA: { label: 'V. Técnica',    color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-100', dot: 'bg-indigo-500' },
};

// ─── Semáforo ─────────────────────────────────────────────────────────────────
const getSemaforo = (dias: number): { color: string; bg: string; label: string } => {
  if (dias > 5)  return { color: 'text-red-600',   bg: 'bg-red-100',   label: `${dias}d` };
  if (dias >= 3) return { color: 'text-amber-600', bg: 'bg-amber-100', label: `${dias}d` };
  return              { color: 'text-emerald-600', bg: 'bg-emerald-100', label: `${dias}d` };
};

const SemaforoCircle: React.FC<{ dias: number; size?: 'sm' | 'md' }> = ({ dias, size = 'sm' }) => {
  const s = getSemaforo(dias);
  const sz = size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black ${s.bg} ${s.color}`}>
      <Circle className={`${sz} fill-current`} />
      {s.label}
    </span>
  );
};

// ─── Fila de un lead ──────────────────────────────────────────────────────────
const LeadFila: React.FC<{ lead: LeadResumen; onClick: (id: number) => void }> = ({ lead, onClick }) => (
  <button
    onClick={() => onClick(lead.id)}
    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0 group"
  >
    <SemaforoCircle dias={lead.dias_en_etapa} size="md" />
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
        {lead.nombre}
      </p>
      <p className="text-[10px] text-slate-400 truncate">
        {lead.producto_interes || 'Sin producto'}{lead.segmento ? ` · ${lead.segmento}` : ''}
      </p>
    </div>
    {lead.intentos_seguimiento > 0 && (
      <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full shrink-0">
        {lead.intentos_seguimiento} seg.
      </span>
    )}
    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
  </button>
);

// ─── Sección de una etapa ─────────────────────────────────────────────────────
const SeccionEtapa: React.FC<{
  etapa: string;
  leads: LeadResumen[];
  onLeadClick: (id: number) => void;
}> = ({ etapa, leads, onLeadClick }) => {
  const [open, setOpen] = useState(true);
  const cfg = ETAPA_CFG[etapa];
  if (!cfg || leads.length === 0) return null;

  const enRojo  = leads.filter(l => l.dias_en_etapa > 5).length;
  const enAmbar = leads.filter(l => l.dias_en_etapa >= 3 && l.dias_en_etapa <= 5).length;

  return (
    <div className={`border ${cfg.border} rounded-xl overflow-hidden`}>
      {/* Header etapa */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-4 py-2.5 ${cfg.bg} hover:opacity-90 transition-opacity`}
      >
        <span className={`w-2 h-2 rounded-full ${cfg.dot} shrink-0`} />
        <span className={`text-[11px] font-black uppercase tracking-wider ${cfg.color} flex-1 text-left`}>
          {cfg.label}
        </span>
        <span className={`text-[10px] font-black ${cfg.color} opacity-60`}>
          {leads.length} lead{leads.length !== 1 ? 's' : ''}
        </span>
        {enRojo > 0 && (
          <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
            {enRojo} rojo{enRojo !== 1 ? 's' : ''}
          </span>
        )}
        {enAmbar > 0 && (
          <span className="text-[9px] font-black text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
            {enAmbar} ámbar
          </span>
        )}
        {open
          ? <ChevronDown className={`w-3.5 h-3.5 ${cfg.color} shrink-0`} />
          : <ChevronRight className={`w-3.5 h-3.5 ${cfg.color} shrink-0`} />
        }
      </button>

      {/* Filas leads */}
      {open && (
        <div className="bg-white divide-y divide-slate-50">
          {leads.map(l => <LeadFila key={l.id} lead={l} onClick={onLeadClick} />)}
        </div>
      )}
    </div>
  );
};

// ─── Tab de un asesor ─────────────────────────────────────────────────────────
const PanelAsesor: React.FC<{
  asesor: AsesorMonitor;
  onLeadClick: (id: number) => void;
}> = ({ asesor, onLeadClick }) => {
  const sinLeads = asesor.total_activos === 0;

  return (
    <div className="space-y-3">
      {/* Resumen del asesor */}
      <div className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-5 py-3 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{asesor.asesor_nombre}</p>
          <p className="text-[10px] text-slate-400 font-medium">{asesor.total_activos} lead{asesor.total_activos !== 1 ? 's' : ''} activos</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {asesor.total_en_rojo > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-full">
              <AlertTriangle className="w-2.5 h-2.5" />
              {asesor.total_en_rojo} &gt;5d
            </span>
          )}
          {asesor.total_en_ambar > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">
              <Clock className="w-2.5 h-2.5" />
              {asesor.total_en_ambar} 3–5d
            </span>
          )}
          {asesor.total_en_rojo === 0 && asesor.total_en_ambar === 0 && asesor.total_activos > 0 && (
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
              Al día ✓
            </span>
          )}
        </div>
      </div>

      {/* Secciones por etapa */}
      {sinLeads ? (
        <div className="text-center py-10 text-slate-300">
          <Activity className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm font-bold">Sin leads activos en el pipeline</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ETAPAS_ORDEN.map(etapa => (
            <SeccionEtapa
              key={etapa}
              etapa={etapa}
              leads={asesor.leads_por_etapa[etapa] || []}
              onLeadClick={onLeadClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const MonitorAsesores: React.FC<Props> = ({ rol, userId }) => {
  const [asesores, setAsesores] = useState<AsesorMonitor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tabActivo, setTabActivo] = useState<number | null>(null);

  // Modal de detalle
  const [leadDetalle, setLeadDetalle] = useState<any | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetMonitorAsesores();
      setAsesores(data);
      if (data.length > 0 && tabActivo === null) {
        setTabActivo(data[0].asesor_id);
      }
    } catch {
      toast.error('No se pudo cargar el monitor de pipeline');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const handleLeadClick = async (leadId: number) => {
    setCargandoDetalle(true);
    try {
      const { data } = await apiGetLeadById(leadId);
      setLeadDetalle(data);
    } catch {
      toast.error('No se pudo cargar el detalle del lead');
    } finally {
      setCargandoDetalle(false);
    }
  };

  const asesorActivo = asesores.find(a => a.asesor_id === tabActivo) ?? null;

  // ─── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-9 w-28 bg-slate-200 rounded-xl" />)}
        </div>
        <div className="h-16 bg-white rounded-xl border border-slate-100" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-slate-100" />)}
      </div>
    );
  }

  if (asesores.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
        <Activity className="w-10 h-10 text-slate-200" />
        <p className="text-sm font-bold">No hay leads activos en el pipeline</p>
        <button onClick={cargar} className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Header con leyenda y botón actualizar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <Circle className="w-2 h-2 fill-emerald-500" /> ≤2 días
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <Circle className="w-2 h-2 fill-amber-500" /> 3–5 días
          </span>
          <span className="flex items-center gap-1.5 text-red-600">
            <Circle className="w-2 h-2 fill-red-500" /> &gt;5 días
          </span>
        </div>
        <button
          onClick={cargar}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Tabs de asesores */}
      <div className="flex flex-wrap gap-2 mb-5">
        {asesores.map(a => {
          const activo = a.asesor_id === tabActivo;
          return (
            <button
              key={a.asesor_id}
              onClick={() => setTabActivo(a.asesor_id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                activo
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[120px]">{a.asesor_nombre}</span>
              {/* Badge total activos */}
              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                activo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {a.total_activos}
              </span>
              {/* Indicador rojo si tiene leads vencidos */}
              {a.total_en_rojo > 0 && (
                <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-black ${
                  activo ? 'bg-white text-red-600' : 'bg-red-500 text-white'
                }`}>
                  {a.total_en_rojo}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel del asesor seleccionado */}
      {asesorActivo && (
        <PanelAsesor
          asesor={asesorActivo}
          onLeadClick={handleLeadClick}
        />
      )}

      {/* Overlay de carga al abrir lead */}
      {cargandoDetalle && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 flex items-center gap-3 shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span className="text-sm font-bold text-slate-700">Cargando detalle...</span>
          </div>
        </div>
      )}

      {/* LeadDetalleModal */}
      {leadDetalle && (
        <div className="fixed inset-0 z-50 flex">
          <LeadDetalleModal
            lead={leadDetalle}
            rol={rol}
            userId={userId}
            onClose={() => { setLeadDetalle(null); cargar(); }}
            onLeadUpdate={setLeadDetalle}
            inlineMode={false}
          />
        </div>
      )}
    </>
  );
};

export default MonitorAsesores;
