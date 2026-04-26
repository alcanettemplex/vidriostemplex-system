import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, ArrowUpRight,
  CheckCircle2, XCircle, Clock, Trophy, Flame
} from 'lucide-react';
import { toast } from 'react-toastify';
import { apiGetCRMStats } from '../crmService';
import { IconDollar, IconTarget, IconLeads, IconUserCheck, IconTrophy, IconSparkles, IconZap, IconCheck, IconBarChart, IconClock } from './CRMIcons';

// ─── Formatters ────────────────────────────────────────────────────────────────
const fmtCOP = (v: number, compact = false) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {})
  }).format(v);

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── KPI Card estilo Stitch (borde izquierdo de color) ─────────────────────────
interface KPIStitchProps {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accentColor: string; borderColor: string;
  trend?: number; trendLabel?: string;
}
const KPIStitch: React.FC<KPIStitchProps> = ({ label, value, sub, icon, accentColor, borderColor, trend, trendLabel }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm border-l-4 ${borderColor} hover:shadow-md transition-all duration-200 flex flex-col gap-2`}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accentColor}`}>
        {icon}
      </div>
    </div>
    <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
    {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
    {trend !== undefined && (
      <div className={`flex items-center gap-1 text-[11px] font-bold mt-1 ${trend >= 20 ? 'text-emerald-600' : trend > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
        {trend >= 20 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{trendLabel || `${trend}% conversión`}</span>
      </div>
    )}
  </div>
);

// ─── KPI Secundario (mini) ─────────────────────────────────────────────────────
interface MiniKPIProps { label: string; value: string; icon: React.ReactNode; bg: string; desc?: string; }
const MiniKPI: React.FC<MiniKPIProps> = ({ label, value, icon, bg, desc }) => (
  <div className={`${bg} rounded-xl p-4 flex items-center gap-3`}>
    <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center flex-shrink-0 shadow-sm">
      {icon}
    </div>
    <div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-black text-slate-800">{value}</p>
      {desc && <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-snug">{desc}</p>}
    </div>
  </div>
);

// ─── Donut SVG de eficiencia ───────────────────────────────────────────────────
const DonutChart: React.FC<{ pct: number; color: string }> = ({ pct, color }) => {
  const r = 52, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="#EEF0F8" strokeWidth="14" />
      <circle
        cx="65" cy="65" r={r} fill="none"
        stroke={color} strokeWidth="14"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease-in-out' }}
      />
      <text x="65" y="60" textAnchor="middle" fontSize="18" fontWeight="900" fill="#1e293b">{pct}%</text>
      <text x="65" y="76" textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8" letterSpacing="1">SUCCESS RATE</text>
    </svg>
  );
};

// ─── Barra de pipeline ─────────────────────────────────────────────────────────
const PipelineBar: React.FC<{ label: string; count: number; total: number; color: string; pct: number }> = ({ label, count, total, color, pct }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <span className="text-xs font-black text-slate-500">{pct.toFixed(1)}%</span>
    </div>
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  </div>
);

// ─── Avatar de asesor ──────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'from-indigo-400 to-violet-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-500',
  'from-blue-400 to-cyan-500',
];
const ETAPA_COLORS: Record<string, string> = {
  NUEVO: 'bg-slate-400', ASIGNADO: 'bg-blue-500', EN_CONTACTO: 'bg-violet-500',
  COTIZANDO: 'bg-amber-500', VISITA_TECNICA: 'bg-indigo-500',
  FRIO: 'bg-sky-400', APROBADO: 'bg-emerald-500', PERDIDO: 'bg-rose-500',
};
const ETAPA_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo', ASIGNADO: 'Asig.', EN_CONTACTO: 'Contacto',
  COTIZANDO: 'Cotiz.', VISITA_TECNICA: 'V.Tec.', FRIO: 'Frío',
  APROBADO: 'Apro.', PERDIDO: 'Perd.',
};

const AsesorCardStitch: React.FC<{
  idx: number; nombre: string; total: number;
  aprobados: number; perdidos: number; tasa: number; monto: number;
  porEstado?: Record<string, number>; etapaCuello?: string | null;
}> = ({ idx, nombre, total, aprobados, perdidos, tasa, monto, porEstado, etapaCuello }) => {
  const initials = nombre.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;

  const etapasActivas = porEstado
    ? Object.entries(porEstado).filter(([e, c]) => c > 0 && !['APROBADO','PERDIDO'].includes(e))
    : [];
  const totalActivos = etapasActivas.reduce((s, [, c]) => s + c, 0) || 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 hover:shadow-md transition-all duration-200">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-md`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {medal && <span className="text-sm">{medal}</span>}
            <p className="font-black text-slate-800 text-sm truncate">{nombre}</p>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{total} leads gestionados</p>
          {/* Mini barra de conversión */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${tasa}%` }} />
            </div>
            <span className={`text-[10px] font-black ${tasa >= 30 ? 'text-emerald-600' : tasa >= 15 ? 'text-amber-500' : 'text-rose-500'}`}>{tasa}%</span>
          </div>
        </div>
        {/* Stats */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-sm font-black text-slate-700">{fmtCOP(monto, true)}</p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="w-3 h-3" />{aprobados}</span>
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-500"><XCircle className="w-3 h-3" />{perdidos}</span>
          </div>
        </div>
      </div>

      {/* Barra segmentada por etapa (cuello de botella) */}
      {etapasActivas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-50">
          <div className="flex items-center gap-1 h-2 rounded-full overflow-hidden bg-slate-100">
            {etapasActivas.map(([etapa, count]) => (
              <div
                key={etapa}
                className={`h-full ${ETAPA_COLORS[etapa] || 'bg-slate-400'} transition-all duration-700`}
                style={{ width: `${(count / totalActivos) * 100}%` }}
                title={`${ETAPA_LABELS[etapa] || etapa}: ${count}`}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {etapasActivas.slice(0, 4).map(([etapa, count]) => (
                <span key={etapa} className="flex items-center gap-0.5 text-[9px] font-bold text-slate-500">
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${ETAPA_COLORS[etapa] || 'bg-slate-400'}`} />
                  {ETAPA_LABELS[etapa]}: {count}
                </span>
              ))}
            </div>
            {etapaCuello && (
              <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100 whitespace-nowrap">
                ⚠ {ETAPA_LABELS[etapaCuello] || etapaCuello}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
interface Props { esVistaGlobal: boolean; mes?: number; anio?: number; }

const DashboardGerencial: React.FC<Props> = ({ esVistaGlobal, mes, anio }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try { const { data } = await apiGetCRMStats(mes, anio); setStats(data); }
    catch { toast.error('No se pudieron cargar las estadísticas.'); }
    finally { setLoading(false); }
  }, [mes, anio]);

  useEffect(() => { fetchStats(); }, [fetchStats, esVistaGlobal]);

  const periodoLabel = mes && anio ? `${MONTH_NAMES[mes - 1]} ${anio}` : 'Acumulado';

  // ─── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-slate-100" />
        ))}
      </div>
      <div className="h-72 bg-white rounded-2xl animate-pulse border border-slate-100" />
    </div>
  );

  if (!stats) return null;

  const {
    total = 0, monto_total_proyectado = 0, tasa_conversion = 0,
    convertidos_a_cliente = 0, nuevos_clientes = 0, clientes_recurrentes = 0,
    leads_con_odp = 0, leads_aprobados_sin_odp = 0,
    monto_real_aprobados = 0,
    ticket_promedio_proyectado = 0, tiempo_promedio_cierre_dias = 0,
    stats_por_asesor = [], por_estado = {}
  } = stats;

  const aprobados  = (por_estado as any)['APROBADO']  || 0;
  const perdidos   = (por_estado as any)['PERDIDO']   || 0;
  const frios      = (por_estado as any)['FRIO']      || 0;
  const activos    = total - aprobados - perdidos - frios;

  const pctAprobados = total > 0 ? (aprobados / total) * 100 : 0;
  const pctFrios     = total > 0 ? (frios     / total) * 100 : 0;
  const pctPerdidos  = total > 0 ? (perdidos  / total) * 100 : 0;
  const pctActivos   = total > 0 ? (activos   / total) * 100 : 0;

  const donutColor = tasa_conversion >= 30 ? '#10b981' : tasa_conversion >= 15 ? '#f59e0b' : '#6366f1';

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800">Dashboard Gerencial</h2>
          <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            Periodo: {periodoLabel}
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* ── KPIs principales (estilo Stitch: borde izquierdo de color) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPIStitch
          label="Venta Proyectada" value={fmtCOP(monto_total_proyectado, true)}
          sub="Suma de montos proyectados de todos los leads del periodo"
          icon={<IconDollar size={16} className="text-indigo-600" />}
          accentColor="bg-indigo-50" borderColor="border-l-indigo-500" />
        <KPIStitch
          label="Éxito Comercial" value={`${tasa_conversion}%`}
          sub={`${aprobados} leads aprobados`}
          icon={<IconTarget size={16} className="text-emerald-600" />}
          accentColor="bg-emerald-50" borderColor="border-l-emerald-500"
          trend={tasa_conversion} trendLabel={`${tasa_conversion}% conversión`} />
        <KPIStitch
          label="Leads Ingresados" value={String(total)}
          sub="Total de leads registrados en el periodo seleccionado"
          icon={<IconLeads size={16} className="text-violet-600" />}
          accentColor="bg-violet-50" borderColor="border-l-violet-500" />
        <KPIStitch
          label="Clientes Nuevos" value={String(nuevos_clientes)}
          sub={clientes_recurrentes > 0 ? `${clientes_recurrentes} recurrentes` : 'Sin recurrentes'}
          icon={<IconUserCheck size={16} className="text-rose-600" />}
          accentColor="bg-rose-50" borderColor="border-l-rose-400" />
      </div>

      {/* ── KPIs secundarios (mini, fila inferior) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MiniKPI label="Venta Real Aprobados" value={fmtCOP(monto_real_aprobados, true)}
          icon={<IconCheck size={16} className="text-emerald-600" />} bg="bg-emerald-50/60 border border-emerald-100"
          desc="Suma del monto real de los leads cerrados como Aprobados" />
        <MiniKPI label="Ticket Promedio" value={fmtCOP(ticket_promedio_proyectado, true)}
          icon={<IconDollar size={16} className="text-indigo-600" />} bg="bg-indigo-50/60 border border-indigo-100"
          desc="Cotización proyectada promedio por lead en gestión" />
        <MiniKPI label="Leads Perdidos" value={String(perdidos)}
          icon={<IconTarget size={16} className="text-rose-600" />} bg="bg-rose-50/60 border border-rose-100"
          desc="Oportunidades cerradas sin conversión en el periodo" />
        <MiniKPI label="Días Prom. Cierre" value={`${tiempo_promedio_cierre_dias}d`}
          icon={<IconClock size={16} className="text-amber-600" />} bg="bg-amber-50/60 border border-amber-100"
          desc="Tiempo promedio desde el registro hasta el cierre del lead" />
      </div>

      {/* ── Fila: Clientes nuevos vs recurrentes + Leads→ODP ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Nuevos vs Recurrentes */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="mb-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clientes Nuevos vs Recurrentes</p>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">De los leads convertidos, cuántos eran clientes nuevos o ya existentes en el sistema</p>
          </div>
          {(nuevos_clientes + clientes_recurrentes) === 0 ? (
            <p className="text-sm text-slate-300 text-center py-2">Sin conversiones en este periodo</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  {nuevos_clientes > 0 && (
                    <div
                      className="h-full bg-emerald-500 rounded-l-full transition-all duration-700"
                      style={{ width: `${((nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100)}%` }}
                    />
                  )}
                  {clientes_recurrentes > 0 && (
                    <div
                      className="h-full bg-blue-400 rounded-r-full transition-all duration-700"
                      style={{ width: `${((clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100)}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-6 text-xs">
                <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Nuevos: <strong>{nuevos_clientes}</strong>
                  <span className="text-slate-400 font-normal">
                    ({nuevos_clientes + clientes_recurrentes > 0 ? Math.round((nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100) : 0}%)
                  </span>
                </span>
                <span className="flex items-center gap-1.5 font-bold text-blue-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
                  Recurrentes: <strong>{clientes_recurrentes}</strong>
                  <span className="text-slate-400 font-normal">
                    ({nuevos_clientes + clientes_recurrentes > 0 ? Math.round((clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100) : 0}%)
                  </span>
                </span>
                <span className="text-slate-400 font-medium ml-auto">
                  {convertidos_a_cliente - nuevos_clientes - clientes_recurrentes > 0 && (
                    <span className="text-amber-500">{convertidos_a_cliente - nuevos_clientes - clientes_recurrentes} sin clasificar</span>
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Leads → ODP */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Leads → ODP</p>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Leads aprobados que ya tienen una Orden de Producción vinculada</p>
          <div className="flex items-end gap-2 mt-2">
            <p className="text-3xl font-black text-slate-800">{leads_con_odp}</p>
            <p className="text-sm text-slate-400 font-semibold mb-1">vinculados</p>
          </div>
          {leads_aprobados_sin_odp > 0 ? (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="text-amber-500 text-sm font-black">⚠</span>
              <p className="text-[11px] text-amber-700 font-bold">{leads_aprobados_sin_odp} aprobado{leads_aprobados_sin_odp > 1 ? 's' : ''} sin ODP</p>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-emerald-500 text-sm font-black">✓</span>
              <p className="text-[11px] text-emerald-700 font-bold">Todos vinculados</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bloque central: Pipeline + Eficiencia ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        {/* Estado del Pipeline */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Estado del Pipeline</h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Distribución operativa de prospectos</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-slate-800">{total}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LEADS ACTIVOS</p>
            </div>
          </div>
          <div className="space-y-4">
            <PipelineBar label="Aprobados" count={aprobados} total={total} color="bg-emerald-500" pct={pctAprobados} />
            <PipelineBar label="En Frío"   count={frios}     total={total} color="bg-indigo-400"  pct={pctFrios} />
            <PipelineBar label="Perdidos"  count={perdidos}  total={total} color="bg-rose-500"    pct={pctPerdidos} />
            <PipelineBar label="Activos"   count={activos}   total={total} color="bg-amber-400"   pct={pctActivos} />
          </div>

          {/* Stats extra bajo las barras */}
          <div className="mt-6 pt-5 border-t border-slate-50 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Cotizaciones', val: (por_estado as any)['COTIZANDO'] || 0 },
              { label: 'V. Técnicas',  val: (por_estado as any)['VISITA_TECNICA'] || 0 },
              { label: 'En Contacto', val: (por_estado as any)['EN_CONTACTO'] || 0 },
            ].map(s => (
              <div key={s.label}>
                <p className="text-xl font-black text-slate-800">{s.val}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Eficiencia Global - Donut */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center gap-4">
          <div className="w-full flex items-center justify-between mb-2">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Eficiencia Global</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Tasa de éxito del equipo comercial en el periodo</p>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-full ${tasa_conversion >= 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              {tasa_conversion >= 20 ? '✓ En meta' : '⚠ Mejorable'}
            </span>
          </div>
          <DonutChart pct={tasa_conversion} color={donutColor} />
          <div className="w-full space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500 font-bold">Conversión Lead/Sale</span>
              <span className={`font-black ${tasa_conversion > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{tasa_conversion.toFixed(2)}%</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-500 font-bold">Lead Velocity Index</span>
              <span className={`font-black ${tiempo_promedio_cierre_dias > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                {tiempo_promedio_cierre_dias > 0 ? `${tiempo_promedio_cierre_dias}d` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Líderes del Periodo ── */}
      {stats_por_asesor.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
                <IconTrophy size={18} className="text-amber-500" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">Líderes del Periodo</h3>
                <p className="text-[10px] text-slate-400 font-medium">{periodoLabel} — Ranking por monto gestionado y conversión</p>
              </div>
            </div>
            <button className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 hover:text-indigo-700 transition-colors">
              Ver ranking completo <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats_por_asesor.slice(0, 6).map((a: any, i: number) => (
              <AsesorCardStitch
                key={a.id} idx={i} nombre={a.nombre} total={a.total}
                aprobados={a.aprobados} perdidos={a.perdidos}
                tasa={a.tasa_conversion} monto={a.monto_gestionado}
                porEstado={a.por_estado} etapaCuello={a.etapa_cuello}
              />
            ))}
          </div>

          {/* CTA de acción rápida (estilo Stitch: botón azul oscuro prominente) */}
          <div className="mt-5 pt-5 border-t border-slate-50 grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="md:col-span-1 flex items-center justify-center gap-2 p-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-0.5">
              <IconZap size={18} className="text-white" />
              Actualizar Leads
            </button>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Top Asesor</p>
                <p className="text-sm font-black text-slate-800 truncate">
                  {stats_por_asesor[0]?.nombre || '—'}
                </p>
                <p className="text-xs text-indigo-600 font-bold mt-0.5">
                  {stats_por_asesor[0]?.tasa_conversion || 0}% conversión
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Monto Top</p>
                <p className="text-sm font-black text-slate-800">
                  {fmtCOP(stats_por_asesor[0]?.monto_gestionado || 0, true)}
                </p>
                <p className="text-xs text-emerald-600 font-bold mt-0.5">
                  {stats_por_asesor[0]?.aprobados || 0} aprobados
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {stats_por_asesor.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
          <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-semibold">Sin asesores con actividad en este periodo</p>
        </div>
      )}
    </div>
  );
};

export default DashboardGerencial;
