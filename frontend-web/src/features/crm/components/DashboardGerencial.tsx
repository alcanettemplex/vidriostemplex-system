import React, { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Target, Users,
  UserCheck, Trophy, AlertTriangle, BarChart3, RefreshCw,
  Flame, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { toast } from 'react-toastify';
import { apiGetCRMStats } from '../crmService';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

// ─── Tarjeta de KPI financiero ─────────────────────────────────────────────────
interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  colorClass: string;
  trend?: { value: number; positive: boolean };
}
const KPICard: React.FC<KPICardProps> = ({ title, value, subtitle, icon, colorClass, trend }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorClass}`}>{icon}</div>
    </div>
    <p className="text-3xl font-black text-slate-800 leading-none">{value}</p>
    {subtitle && <p className="text-xs text-slate-400 font-medium">{subtitle}</p>}
    {trend && (
      <div className={`flex items-center gap-1 text-xs font-bold ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {trend.positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        {trend.positive ? '+' : ''}{trend.value}% conversión
      </div>
    )}
  </div>
);

// ─── Barra de ranking asesor ────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉'];
interface AsesorRowProps {
  rank: number;
  nombre: string;
  total: number;
  aprobados: number;
  perdidos: number;
  tasa: number;
  monto: number;
  maxMonto: number;
}
const AsesorRow: React.FC<AsesorRowProps> = ({ rank, nombre, total, aprobados, perdidos, tasa, monto, maxMonto }) => {
  const pct = maxMonto > 0 ? (monto / maxMonto) * 100 : 0;
  return (
    <div className="flex items-center gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-lg w-6 shrink-0 text-center">{MEDALS[rank] || `${rank + 1}`}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-bold text-slate-800 text-sm truncate">{nombre}</p>
          <div className="flex items-center gap-3 shrink-0 ml-2">
            <span className="text-xs font-bold text-emerald-600">{aprobados}✓</span>
            <span className="text-xs font-bold text-rose-500">{perdidos}✗</span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${tasa >= 50 ? 'bg-emerald-100 text-emerald-700' : tasa >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
              {tasa}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-bold text-slate-500 shrink-0">{formatCOP(monto)}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Componente principal ───────────────────────────────────────────────────────
interface Props {
  esVistaGlobal: boolean;
  mes?: number;
  anio?: number;
}

const DashboardGerencial: React.FC<Props> = ({ esVistaGlobal, mes, anio }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiGetCRMStats(mes, anio);
      setStats(data);
    } catch (err: any) {
      toast.error('No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  }, [mes, anio]);

  useEffect(() => { fetchStats(); }, [fetchStats, esVistaGlobal]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const {
    total = 0,
    monto_total_cotizaciones = 0,
    tasa_conversion = 0,
    convertidos_a_cliente = 0,
    stats_por_asesor = [],
    por_estado = {}
  } = stats;

  const maxMonto = Math.max(...stats_por_asesor.map((a: any) => a.monto_gestionado || 0), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-lg font-black text-slate-800">Dashboard Gerencial</h2>
          <p className="text-xs text-slate-500">
            {mes && anio ? `Periodo: ${new Date(anio, mes-1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })}` : 'Métricas acumuladas'}
          </p>
        </div>
        <button onClick={fetchStats} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 bg-white">
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          title="Venta Proyectada"
          value={formatCOP(monto_total_cotizaciones)}
          icon={<DollarSign className="w-4 h-4 text-white" />}
          colorClass="bg-indigo-600"
        />
        <KPICard
          title="Éxito Comercial"
          value={`${tasa_conversion}%`}
          icon={<Target className="w-4 h-4 text-white" />}
          colorClass="bg-emerald-500"
          trend={{ value: tasa_conversion, positive: tasa_conversion >= 20 }}
        />
        <KPICard
          title="Leads Ingresados"
          value={String(total)}
          icon={<Users className="w-4 h-4 text-white" />}
          colorClass="bg-violet-500"
        />
        <KPICard
          title="Clientes Nuevos"
          value={String(convertidos_a_cliente)}
          icon={<UserCheck className="w-4 h-4 text-white" />}
          colorClass="bg-teal-500"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="font-extrabold text-slate-800 text-sm uppercase">Líderes del Periodo</h3>
        </div>
        {stats_por_asesor.length === 0 ? (
          <p className="text-center py-8 text-slate-400 text-sm italic">Sin datos registrados</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2">
            {stats_por_asesor.map((asesor: any, i: number) => (
              <AsesorRow
                key={asesor.id}
                rank={i}
                nombre={asesor.nombre}
                total={asesor.total}
                aprobados={asesor.aprobados}
                perdidos={asesor.perdidos}
                tasa={asesor.tasa_conversion}
                monto={asesor.monto_gestionado}
                maxMonto={maxMonto}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 text-white text-center flex flex-col justify-center">
          <p className="text-xs font-bold text-white/50 uppercase mb-4">Eficiencia Global de Conversión</p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <span className="text-6xl font-black">{tasa_conversion}%</span>
            <div className="text-left">
                <p className="text-xs text-white/40">Tasa de éxito</p>
                <p className="text-xs text-white/40">en el periodo</p>
            </div>
          </div>
          <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
            <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${tasa_conversion}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-400 uppercase mb-4">Ticket de Venta Promedio</p>
          <p className="text-3xl font-black text-slate-800">
            {total > 0 && (por_estado['APROBADO'] || 0) > 0 ? formatCOP(monto_total_cotizaciones / por_estado['APROBADO']) : '$0'}
          </p>
          <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between">
            <span className="text-xs font-bold text-slate-400">Total Leads: <span className="text-indigo-600">{total}</span></span>
            <span className="text-xs font-bold text-slate-400">Proyección: <span className="text-emerald-600">{formatCOP(monto_total_cotizaciones * 1.15)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardGerencial;
