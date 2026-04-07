import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  TrendingUp, TrendingDown, Users, Target, Clock, Flame,
  CheckCircle2, XCircle, Phone, BarChart3, Activity, Award,
  Loader2, RefreshCw, AlertCircle
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
    monto_total_cotizaciones = 0,
    tasa_conversion = 0,
    tiempo_promedio_cierre_dias = 0,
    por_motivo_perdida = {},
    por_producto = {},
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Leads"
          value={total}
          description="Prospectos ingresados en el periodo seleccionado."
          icon={<Users className="w-4 h-4 text-white" />}
          color="bg-indigo-500"
          bgGradient="from-indigo-50"
        />
        <MetricCard
          title="Tasa Conversión"
          value={`${tasa_conversion}%`}
          description="Porcentaje de leads que llegaron a aprobación."
          icon={<Target className="w-4 h-4 text-white" />}
          color="bg-emerald-500"
          bgGradient="from-emerald-50"
          trend={{ value: tasa_conversion, positive: tasa_conversion > 15 }}
        />
        <MetricCard
          title="Venta Proyectada"
          value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(monto_total_cotizaciones)}
          description="Suma de montos proyectados en leads totales."
          icon={<TrendingUp className="w-4 h-4 text-white" />}
          color="bg-blue-500"
          bgGradient="from-blue-50"
        />
        <MetricCard
          title="Cierre Promedio"
          value={`${tiempo_promedio_cierre_dias} días`}
          description="Tiempo medio desde creación hasta aprobación."
          icon={<Clock className="w-4 h-4 text-white" />}
          color="bg-amber-500"
          bgGradient="from-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Motivos de Pérdida */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-6">
            <XCircle className="w-5 h-5 text-rose-500" />
            <h3 className="font-black text-slate-800 text-sm uppercase">Análisis de Pérdidas</h3>
          </div>
          <div className="space-y-4">
            {motivosPerdida.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-8 italic">Sin registros de pérdida en este periodo</p>
            ) : (
              motivosPerdida.map((m: any) => (
                <div key={m.motivo} className="group">
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-1.5">
                    <span>{m.motivo || 'No especificado'}</span>
                    <span className="text-slate-400">{m.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-rose-400 h-full rounded-full group-hover:bg-rose-500 transition-all" style={{ width: `${Math.min((m.count / total) * 100, 100)}%` }} />
                  </div>
                </div>
              ))
            )}
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
                  <th className="pb-3">Producto</th>
                  <th className="pb-3 text-center">Leads</th>
                  <th className="pb-3 text-center">Conv.</th>
                  <th className="pb-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {productosList.map((p: any) => (
                  <tr key={p.producto}>
                    <td className="py-3 font-bold text-slate-700">{p.producto || 'Otros'}</td>
                    <td className="py-3 text-center text-slate-500">{p.count}</td>
                    <td className="py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-black ${p.rate > 20 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {p.rate}%
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-slate-800">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(p.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ranking de Asesores (Solo Gerencial) */}
      {esVistaGlobal && (
        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-200">
          <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="font-black text-sm uppercase tracking-widest text-emerald-400">Ranking Comercial</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats_por_asesor.map((a: any, idx: number) => (
              <div key={a.id} className="bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-black text-white text-sm">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-xs truncate">{a.nombre}</p>
                    <p className="text-[10px] text-white/40">{a.total} leads gestión</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-black text-emerald-400">{a.tasa_conversion}%</p>
                    <p className="text-[10px] text-white/40">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(a.monto_gestionado)}</p>
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
