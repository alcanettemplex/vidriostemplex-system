import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  TrendingUp, TrendingDown, Users, Target, Clock, Flame,
  CheckCircle2, XCircle, Phone, BarChart3, Activity, Award,
  Loader2, RefreshCw, AlertCircle, DollarSign
} from 'lucide-react';
import { apiGetLeads, apiGetCRMStats } from '../crmService';

// ─── Componente MetricCard con descripción ─────────────────────────────────────
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  trend?: { value: number; positive: boolean };
}

const MetricCard: React.FC<MetricCardProps> = ({
  title, value, subtitle, description, icon, color, bgGradient, trend
}) => (
  <div className={`relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-2.5 hover:shadow-md transition-all duration-200 overflow-hidden group`}>
    {/* Fondo sutil del ícono */}
    <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 -translate-y-4 translate-x-6 ${color}`} />

    {/* Header */}
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${color}`}>
        {icon}
      </div>
    </div>

    {/* Valor principal */}
    <div>
      <p className="text-3xl font-black text-slate-800 leading-none">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1 font-semibold">{subtitle}</p>}
    </div>

    {/* Descripción — aparece siempre */}
    <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2.5 mt-auto">
      {description}
    </p>

    {/* Tendencia */}
    {trend && (
      <div className={`flex items-center gap-1 text-[11px] font-bold ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {trend.positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{trend.positive ? '+' : ''}{trend.value}%</span>
      </div>
    )}
  </div>
);

// ─── Barra del embudo ─────────────────────────────────────────────────────────
interface FunnelBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const FunnelBar: React.FC<FunnelBarProps> = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-slate-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 w-16 justify-end shrink-0">
        <span className="text-xs font-black text-slate-700">{count}</span>
        <span className="text-xs text-slate-400">({pct}%)</span>
      </div>
    </div>
  );
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const ETAPAS = [
  { id: 'NUEVO',          label: 'Bolsa Común',  color: 'bg-slate-400' },
  { id: 'ASIGNADO',       label: 'Asignados',    color: 'bg-blue-500' },
  { id: 'EN_CONTACTO',    label: 'En Contacto',  color: 'bg-purple-500' },
  { id: 'COTIZANDO',      label: 'Cotizando',    color: 'bg-amber-500' },
  { id: 'VISITA_TECNICA', label: 'V. Técnica',   color: 'bg-indigo-500' },
  { id: 'APROBADO',       label: 'Aprobados',    color: 'bg-emerald-500' },
  { id: 'FRIO',           label: 'Enfriados',    color: 'bg-gray-400' },
  { id: 'PERDIDO',        label: 'Perdidos',     color: 'bg-rose-500' },
];

const SEGMENTOS_COLOR: Record<string, string> = {
  'Arquitecto':    'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial':    'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid':      'bg-fuchsia-100 text-fuchsia-700',
};

interface Props {
  asesorId?: number;
  esVistaGlobal?: boolean;
  mes?: number;
  anio?: number;
}

const CRMMetrics: React.FC<Props> = ({ asesorId, esVistaGlobal, mes, anio }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiGetCRMStats(mes, anio);
      setStats(data);
    } catch (err) {
      setError('No se pudieron cargar las métricas detalladas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, [mes, anio, esVistaGlobal]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      <p className="text-slate-500 text-sm font-medium">Generando análisis detallado...</p>
    </div>
  );

  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-600 text-sm font-semibold">{error}</p>
      <button onClick={cargarDatos} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Reintentar</button>
    </div>
  );

  const {
    total = 0,
    monto_total_proyectado = 0,
    monto_total_real = 0,
    monto_real_aprobados = 0,
    tasa_conversion = 0,
    ticket_promedio_proyectado = 0,
    tiempo_promedio_cierre_dias = 0,
    por_estado = {},
    por_motivo_perdida = {},
    por_producto = {},
    por_fuente = {},
    por_segmento = {},
    tiempos_promedio_horas = {},
    stats_por_asesor = []
  } = stats;

  const motivosPerdida = Object.entries(por_motivo_perdida).map(([motivo, count]) => ({
    motivo,
    count: count as number
  }));

  const productosList = Object.entries(por_producto).map(([producto, data]: [string, any]) => ({
    producto,
    count: data.total,
    rate: data.total > 0 ? Math.round((data.aprobados / data.total) * 100) : 0,
    monto: data.monto
  }));

  const fuentesList = Object.entries(por_fuente).map(([fuente, count]) => ({
    fuente,
    count: count as number
  })).sort((a,b) => b.count - a.count);

  const segmentosList = Object.entries(por_segmento).map(([segmento, data]: [string, any]) => ({
    segmento,
    total: data.total,
    aprobados: data.aprobados,
    monto: data.monto
  }));

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* ── SECCIÓN 1: KPIs PRINCIPALES (Bento Style) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Leads"
          value={total}
          description="Prospectos ingresados en el periodo seleccionado."
          icon={<Users className="w-4 h-4 text-white" />}
          color="bg-slate-800"
          bgGradient="from-slate-50"
        />
        <MetricCard
          title="Ticket Promedio"
          value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(ticket_promedio_proyectado)}
          description="Valor promedio de las cotizaciones proyectadas."
          icon={<DollarSign className="w-4 h-4 text-white" />}
          color="bg-indigo-600"
          bgGradient="from-indigo-50"
        />
        <MetricCard
          title="Monto Proyectado"
          value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(monto_total_proyectado)}
          description="Potencial total de ventas en el pipeline actual."
          icon={<TrendingUp className="w-4 h-4 text-white" />}
          color="bg-blue-600"
          bgGradient="from-blue-50"
        />
        <MetricCard
          title="Tasa de Cierre"
          value={`${tasa_conversion}%`}
          description="Eficacia general de conversión de leads a ventas."
          icon={<Award className="w-4 h-4 text-white" />}
          color="bg-emerald-600"
          bgGradient="from-emerald-50"
          trend={{ value: tasa_conversion, positive: tasa_conversion > 20 }}
        />
        <MetricCard
          title="Venta Real Aprobados"
          value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(monto_real_aprobados)}
          subtitle={`${(por_estado as any)['APROBADO'] || 0} lead(s) aprobado(s)`}
          description="Suma del monto real de venta de los leads en estado Aprobado."
          icon={<CheckCircle2 className="w-4 h-4 text-white" />}
          color="bg-emerald-700"
          bgGradient="from-emerald-50"
        />
      </div>

      {/* ── SECCIÓN 2: TIEMPOS DE CICLO Y FUENTES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Tiempos Promedio entre Etapas */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-500" />
              <h3 className="font-black text-slate-800 text-sm uppercase">Ciclo de Vida (Horas promedio)</h3>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full border border-slate-100 italic">
              Desde creación hasta etapa final
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Asignación', val: tiempos_promedio_horas.asignacion, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '1er Contacto', val: tiempos_promedio_horas.primer_contacto, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Cotización', val: tiempos_promedio_horas.cotizacion, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'V. Técnica', val: tiempos_promedio_horas.visita, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            ].map(t => (
              <div key={t.label} className={`${t.bg} rounded-2xl p-4 border border-white shadow-sm flex flex-col items-center text-center`}>
                <span className="text-[9px] font-black text-slate-400 uppercase mb-1">{t.label}</span>
                <p className={`text-2xl font-black ${t.color}`}>{t.val} h</p>
                <div className="w-full bg-slate-200 h-1 rounded-full mt-3 overflow-hidden">
                  <div className={`h-full ${t.color.replace('text', 'bg')}`} style={{ width: `${Math.min((t.val / 48) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-4 italic text-center">
            * El tiempo ideal de respuesta para 1er Contacto es menor a 2 horas.
          </p>
        </div>

        {/* Origen de los Leads */}
        <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-indigo-600" />
            <h3 className="font-black text-slate-800 text-sm uppercase">Fuentes de Origen</h3>
          </div>
          <div className="space-y-4">
            {fuentesList.map(f => (
              <div key={f.fuente} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                  <span className="text-xs font-bold text-slate-600">{f.fuente}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-slate-800">{f.count}</span>
                  <div className="w-24 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(f.count / total) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por Segmento */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="font-black text-slate-800 text-sm uppercase">Distribución por Segmento</h3>
          </div>
          <div className="space-y-4">
            {segmentosList.map(s => {
              const conversion = s.total > 0 ? Math.round((s.aprobados / s.total) * 100) : 0;
              return (
                <div key={s.segmento} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${SEGMENTOS_COLOR[s.segmento] || 'bg-slate-200'}`}>
                      {s.segmento}
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">{s.total} leads</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-800">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(s.monto)}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-black">Proyectado</p>
                    </div>
                    <div className="text-right border-l pl-4 border-slate-200">
                      <p className={`text-xs font-black ${conversion > 20 ? 'text-emerald-600' : 'text-slate-600'}`}>{conversion}%</p>
                      <p className="text-[9px] text-slate-400 uppercase font-black">Éxito</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Eficacia por Producto */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <Award className="w-5 h-5 text-violet-500" />
            <h3 className="font-black text-slate-800 text-sm uppercase">Conversión por Producto</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 font-bold border-b border-slate-50">
                  <th className="pb-3 text-[10px] uppercase">Producto</th>
                  <th className="pb-3 text-center text-[10px] uppercase">Leads</th>
                  <th className="pb-3 text-center text-[10px] uppercase">Conv.</th>
                  <th className="pb-3 text-right text-[10px] uppercase">Monto total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {productosList.slice(0, 8).map((p: any) => (
                  <tr key={p.producto}>
                    <td className="py-2.5 font-bold text-slate-700">{p.producto || 'Otros'}</td>
                    <td className="py-2.5 text-center text-slate-500">{p.count}</td>
                    <td className="py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-black ${p.rate > 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {p.rate}%
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-black text-slate-800">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(p.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ranking de Asesores (Estilo Premium) */}
      {esVistaGlobal && (
        <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -translate-y-1/2 translate-x-1/2" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-900 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-lg uppercase tracking-widest text-emerald-400">Ranking Comercial</h3>
                <p className="text-white/40 text-xs font-medium">Top de asesores por tasa de conversión y monto</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
            {stats_por_asesor.map((a: any, idx: number) => (
              <div key={a.id} className="bg-white/5 rounded-2xl p-5 border border-white/10 hover:bg-white/10 transition-all hover:scale-[1.02] group">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                    idx === 0 ? 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/20' : 
                    idx === 1 ? 'bg-slate-300 text-slate-900' : 
                    idx === 2 ? 'bg-orange-400 text-slate-900' : 'bg-white/10 text-white/60'
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm truncate uppercase tracking-tight">{a.nombre}</p>
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{a.total} LEADS GESTIONADOS</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  <div>
                    <p className="text-[9px] text-white/30 font-black uppercase mb-1">Conversión</p>
                    <p className="text-xl font-black text-emerald-400">{a.tasa_conversion}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-white/30 font-black uppercase mb-1">Monto Total</p>
                    <p className="text-sm font-black text-white">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(a.monto_gestionado)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMMetrics;
