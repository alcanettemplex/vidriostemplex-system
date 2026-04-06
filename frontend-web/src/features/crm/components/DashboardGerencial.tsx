import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import {
  TrendingUp, TrendingDown, DollarSign, Target, Users,
  UserCheck, Trophy, AlertTriangle, BarChart3, RefreshCw,
  Flame, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { toast } from 'react-toastify';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const getHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

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

// ─── Distribución estado (donut simple) ────────────────────────────────────────
const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  NUEVO:          { label: 'Bolsa Común',  color: 'bg-slate-400',   icon: <Clock className="w-3.5 h-3.5" /> },
  ASIGNADO:       { label: 'Asignados',   color: 'bg-blue-500',    icon: <Users className="w-3.5 h-3.5" /> },
  EN_CONTACTO:    { label: 'En Contacto', color: 'bg-purple-500',  icon: <TrendingUp className="w-3.5 h-3.5" /> },
  COTIZANDO:      { label: 'Cotizando',   color: 'bg-amber-500',   icon: <DollarSign className="w-3.5 h-3.5" /> },
  VISITA_TECNICA: { label: 'V. Técnica',  color: 'bg-indigo-500',  icon: <Target className="w-3.5 h-3.5" /> },
  APROBADO:       { label: 'Aprobados',   color: 'bg-emerald-500', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  FRIO:           { label: 'Enfriados',   color: 'bg-gray-400',    icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  PERDIDO:        { label: 'Perdidos',    color: 'bg-rose-500',    icon: <XCircle className="w-3.5 h-3.5" /> },
};

// ─── Componente principal ───────────────────────────────────────────────────────
interface Props {
  esVistaGlobal: boolean;
}

const DashboardGerencial: React.FC<Props> = ({ esVistaGlobal }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/crm/stats/resumen`, getHeaders());
      setStats(data);
    } catch (err: any) {
      toast.error('No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const {
    total, por_estado = {}, monto_total_cotizaciones = 0,
    monto_potencial_activo = 0, tasa_conversion = 0,
    convertidos_a_cliente = 0, stats_por_asesor = []
  } = stats;

  const aprobados = por_estado['APROBADO'] || 0;
  const perdidos = por_estado['PERDIDO'] || 0;
  const frios = por_estado['FRIO'] || 0;
  const activos = total - perdidos - frios;

  // Ordenar asesores por conversión
  const asesoresOrdenados = [...stats_por_asesor].sort((a, b) => b.tasa_conversion - a.tasa_conversion);
  const maxMonto = Math.max(...stats_por_asesor.map((a: any) => a.monto_gestionado), 1);

  return (
    <div className="space-y-6">
      {/* Header con refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800">Dashboard Gerencial</h2>
          <p className="text-xs text-slate-500">Métricas en tiempo real del ciclo de ventas</p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualizar
        </button>
      </div>

      {/* KPIs Financieros — Fila 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Monto Total Cotizaciones"
          value={formatCOP(monto_total_cotizaciones)}
          subtitle="Suma histórica de todos los leads"
          icon={<DollarSign className="w-4 h-4 text-white" />}
          colorClass="bg-indigo-500"
        />
        <KPICard
          title="Pipeline Activo"
          value={formatCOP(monto_potencial_activo)}
          subtitle="Leads que aún no se pierden"
          icon={<TrendingUp className="w-4 h-4 text-white" />}
          colorClass="bg-emerald-500"
          trend={{ value: tasa_conversion, positive: tasa_conversion >= 30 }}
        />
        <KPICard
          title="Tasa de Conversión"
          value={`${tasa_conversion}%`}
          subtitle={`${aprobados} de ${total} leads aprobados`}
          icon={<Target className="w-4 h-4 text-white" />}
          colorClass="bg-violet-500"
        />
        <KPICard
          title="Clientes Generados"
          value={String(convertidos_a_cliente)}
          subtitle="Leads convertidos a clientes reales"
          icon={<UserCheck className="w-4 h-4 text-white" />}
          colorClass="bg-teal-500"
        />
      </div>

      {/* KPIs Operativos — Fila 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Total Leads"
          value={String(total)}
          subtitle="Histórico acumulado"
          icon={<Users className="w-4 h-4 text-white" />}
          colorClass="bg-slate-500"
        />
        <KPICard
          title="Activos en Embudo"
          value={String(activos)}
          subtitle="En proceso de cierre"
          icon={<Flame className="w-4 h-4 text-white" />}
          colorClass="bg-amber-500"
        />
        <KPICard
          title="Aprobados"
          value={String(aprobados)}
          subtitle="Listos para convertir"
          icon={<CheckCircle2 className="w-4 h-4 text-white" />}
          colorClass="bg-emerald-400"
        />
        <KPICard
          title="Perdidos + Fríos"
          value={String(perdidos + frios)}
          subtitle={`${perdidos} perdidos / ${frios} enfriados`}
          icon={<XCircle className="w-4 h-4 text-white" />}
          colorClass="bg-rose-500"
        />
      </div>

      {/* Fila de análisis: Distribución + Ranking asesores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Distribución por estado */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Distribución del Embudo</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => {
              const count = por_estado[key] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.color}`} />
                  <span className="text-xs font-bold text-slate-600 w-24 shrink-0">{cfg.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${cfg.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex gap-2 w-16 justify-end shrink-0">
                    <span className="text-xs font-black text-slate-700">{count}</span>
                    <span className="text-xs text-slate-400">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ranking de asesores */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Ranking Asesores</h3>
          </div>
          {asesoresOrdenados.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              No hay asesores con leads asignados
            </div>
          ) : (
            <div>
              {asesoresOrdenados.map((asesor, i) => (
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
      </div>

      {/* Salud del pipeline: indicadores clave */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Eficiencia global */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col items-center justify-center text-center gap-2">
          <div className={`text-5xl font-black ${tasa_conversion >= 50 ? 'text-emerald-500' : tasa_conversion >= 25 ? 'text-amber-500' : 'text-rose-500'}`}>
            {tasa_conversion}%
          </div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Eficiencia Global</p>
          <p className="text-xs text-slate-400">
            {tasa_conversion >= 50 ? '🟢 Excelente rendimiento' : tasa_conversion >= 25 ? '🟡 Rendimiento aceptable' : '🔴 Requiere atención'}
          </p>
        </div>

        {/* Ratio pérdida vs ganancia */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-center gap-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ganados vs Perdidos</p>
          <div className="flex gap-2 items-center">
            <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden flex">
              <div className="bg-emerald-500 h-full rounded-l-full transition-all" style={{ width: total > 0 ? `${(aprobados / total) * 100}%` : '0%' }} />
              <div className="bg-rose-400 h-full rounded-r-full transition-all" style={{ width: total > 0 ? `${(perdidos / total) * 100}%` : '0%' }} />
            </div>
          </div>
          <div className="flex justify-between text-xs font-bold">
            <span className="text-emerald-600">✓ {aprobados} aprobados</span>
            <span className="text-rose-500">✗ {perdidos} perdidos</span>
          </div>
        </div>

        {/* Valor por lead */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-center gap-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Valor promedio / Lead</p>
          <p className="text-2xl font-black text-slate-800">
            {total > 0 ? formatCOP(monto_total_cotizaciones / total) : '$0'}
          </p>
          <p className="text-xs text-slate-400">Basado en {total} leads históricos</p>
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Ticket promedio aprobado</p>
            <p className="text-xl font-black text-emerald-600">
              {aprobados > 0 ? formatCOP(monto_potencial_activo / aprobados) : '$0'}
            </p>
          </div>
        </div>
      </div>

      {!esVistaGlobal && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">Estás viendo tus propias métricas. Solo gerencia y admin ven el ranking completo de asesores.</p>
        </div>
      )}
    </div>
  );
};

export default DashboardGerencial;
