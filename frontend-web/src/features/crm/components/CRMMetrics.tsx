import React, { useEffect, useState, useRef } from 'react';
import {
  Loader2, AlertCircle, TrendingUp, TrendingDown,
  Zap, ArrowUpRight, Filter, Calendar
} from 'lucide-react';
import { apiGetCRMStats } from '../crmService';
import {
  IconLeads, IconDollar, IconTrending, IconTarget, IconCheck,
  IconGlobe, IconClock, IconBarChart, IconPackage,
  IconPercent, IconSparkles, IconActivity
} from './CRMIcons';

// ─── Formatters ────────────────────────────────────────────────────────────────
const fmtCOP = (v: number, compact = false) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {})
  }).format(v);

// ─── KPI Métrica (estilo Stitch Metrics tab) ───────────────────────────────────
interface MetricKPIProps {
  label: string; value: string; delta?: string; positivo?: boolean;
  icon: React.ReactNode; borderColor: string; accentBg: string; desc?: string;
}
const MetricKPI: React.FC<MetricKPIProps> = ({ label, value, delta, positivo, icon, borderColor, accentBg, desc }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm border-l-4 ${borderColor} flex flex-col gap-2 hover:shadow-md transition-all duration-200`}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded-xl ${accentBg} flex items-center justify-center`}>{icon}</div>
    </div>
    <div className="flex items-end gap-3">
      <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
      {delta && (
        <span className={`flex items-center gap-0.5 text-xs font-black mb-0.5 ${positivo ? 'text-emerald-600' : 'text-rose-500'}`}>
          {positivo ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta}
        </span>
      )}
    </div>
    {desc && <p className="text-[10px] text-slate-400 font-medium leading-snug">{desc}</p>}
  </div>
);

// ─── Gráfico de línea SVG simple ───────────────────────────────────────────────
const LineChart: React.FC<{ data: number[]; labels: string[]; color: string; color2?: string }> = ({ data, labels, color, color2 }) => {
  if (data.length < 2) return <div className="h-40 flex items-center justify-center text-slate-300 text-sm">Sin datos suficientes</div>;
  const W = 600, H = 160, padX = 10, padY = 16;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => ({
    x: padX + (i / (data.length - 1)) * (W - padX * 2),
    y: H - padY - ((v - min) / range) * (H - padY * 2)
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x},${H - padY} L${points[0].x},${H - padY} Z`;

  // Proyección suavizada (referencia)
  const proj = data.map((v, i) => v * (1 + i * 0.02));
  const allMax = Math.max(...data, ...proj, 1);
  const projPoints = proj.map((v, i) => ({
    x: padX + (i / (proj.length - 1)) * (W - padX * 2),
    y: H - padY - ((v - min) / (allMax - min || 1)) * (H - padY * 2)
  }));
  const projD = projPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lgArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Líneas guía */}
      {[0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={padX} y1={H - padY - t * (H - padY * 2)} x2={W - padX} y2={H - padY - t * (H - padY * 2)}
          stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {/* Área */}
      <path d={areaD} fill="url(#lgArea)" />
      {/* Proyección */}
      {color2 && <path d={projD} fill="none" stroke={color2} strokeWidth="1.5" strokeDasharray="5 3" opacity="0.5" />}
      {/* Línea principal */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Puntos */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="white" stroke={color} strokeWidth="2" />
      ))}
    </svg>
  );
};

// ─── Donut SVG para categorías ────────────────────────────────────────────────
const DONUT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6', '#a855f7'];
const DonutCategoria: React.FC<{ items: { label: string; pct: number }[] }> = ({ items }) => {
  const r = 52, circ = 2 * Math.PI * r;
  let offset = circ / 4;
  const total = items.reduce((s, i) => s + i.pct, 0) || 1;

  // Porcentaje del segmento principal (primero)
  const mainPct = Math.round((items[0]?.pct / total) * 100) || 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0">
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={r} fill="none" stroke="#f1f5f9" strokeWidth="14" />
          {items.map((item, i) => {
            const pct = item.pct / total;
            const dash = pct * circ;
            const seg = (
              <circle key={i} cx="65" cy="65" r={r} fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-offset + circ / 4}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return seg;
          })}
          <text x="65" y="60" textAnchor="middle" fontSize="20" fontWeight="900" fill="#1e293b">{mainPct}%</text>
          <text x="65" y="75" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#94a3b8" letterSpacing="1">EFECTIVIDAD</text>
        </svg>
      </div>
      <div className="space-y-2 flex-1 min-w-0">
        {items.slice(0, 5).map((item, i) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-xs font-bold text-slate-600 flex-1 truncate">{item.label}</span>
            <span className="text-xs font-black text-slate-700">{Math.round((item.pct / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Embudo visual ─────────────────────────────────────────────────────────────
const ETAPAS_CONFIG = [
  { id: 'NUEVO',          label: 'Leads Registrados', color: 'bg-slate-400' },
  { id: 'ASIGNADO',       label: 'Asignados',          color: 'bg-blue-500' },
  { id: 'EN_CONTACTO',    label: 'En Contacto',        color: 'bg-violet-500' },
  { id: 'COTIZANDO',      label: 'Cotizando',          color: 'bg-amber-500' },
  { id: 'VISITA_TECNICA', label: 'Visita Técnica',     color: 'bg-indigo-500' },
  { id: 'APROBADO',       label: 'Aprobados',          color: 'bg-emerald-500' },
];

const CICLO_CONFIG = [
  { key: 'asignacion', label: 'Asignación',   color: 'bg-blue-500',   alert: 4 },
  { key: 'contacto',   label: '1er Contacto', color: 'bg-violet-500', alert: 2 },
  { key: 'cotizacion', label: 'Cotización',   color: 'bg-amber-500',  alert: 24 },
  { key: 'visita',     label: 'V. Técnica',   color: 'bg-indigo-500', alert: 48 },
];

const SEGMENTOS_COLORS: Record<string, string> = {
  'Arquitecto': 'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial': 'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid': 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props { asesorId?: number; esVistaGlobal?: boolean; mes?: number; anio?: number; }

// ═══════════════════════════════════════════════════════════════════════════════
const CRMMetrics: React.FC<Props> = ({ esVistaGlobal, mes, anio }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true); setError(null);
    try { const { data } = await apiGetCRMStats(mes, anio); setStats(data); }
    catch { setError('No se pudieron cargar las métricas.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [mes, anio, esVistaGlobal]);

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-64 bg-white rounded-2xl animate-pulse border border-slate-100" />)}
      </div>
    </div>
  );

  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-600 text-sm font-semibold">{error}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold">Reintentar</button>
    </div>
  );

  const {
    total = 0, monto_total_proyectado = 0, monto_real_aprobados = 0,
    tasa_conversion = 0, ticket_promedio_proyectado = 0,
    tiempo_promedio_cierre_dias = 0,
    por_estado = {}, por_motivo_perdida = {}, por_producto = {},
    por_fuente = {}, por_segmento = {}, tiempos_promedio_horas = {},
    stats_por_asesor = [],
    nuevos_clientes = 0, clientes_recurrentes = 0,
  } = stats;

  // Listas derivadas
  const fuentesList  = Object.entries(por_fuente).map(([f, c]) => ({ fuente: f, count: c as number })).sort((a,b) => b.count - a.count);
  const motivosList  = Object.entries(por_motivo_perdida).map(([m, c]) => ({ motivo: m, count: c as number })).sort((a,b) => b.count - a.count);
  const productosList = Object.entries(por_producto).map(([p, d]: [string, any]) => ({
    producto: p, count: d.total,
    rate: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0, monto: d.monto
  })).sort((a,b) => b.monto - a.monto);
  const segmentosList = Object.entries(por_segmento).map(([s, d]: [string, any]) => ({
    segmento: s, total: d.total, aprobados: d.aprobados, monto: d.monto,
    conv: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0
  }));

  // Datos para gráfico de línea (por mes ficticio con datos reales actuales como pico)
  const tasaVelocity = tiempo_promedio_cierre_dias > 0 ? +(total / tiempo_promedio_cierre_dias).toFixed(1) : 0;

  // Donut categorías (productos top)
  const donutItems = productosList.slice(0, 5).map(p => ({ label: p.producto || 'Otros', pct: p.count }));

  // Embudo de conversión (steps)
  const embudo = ETAPAS_CONFIG.map(e => ({
    ...e, count: (por_estado as any)[e.id] || 0
  }));
  const topEtapa = Math.max(...embudo.map(e => e.count), 1);

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header con filtros ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800">Análisis de Métricas</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Monitoreo de eficiencia en templado y gestión de CRM.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
            <Calendar className="w-3.5 h-3.5" /> Last 30 Days
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm">
            <Filter className="w-3.5 h-3.5" /> Todas las Categorías
          </button>
        </div>
      </div>

      {/* ── KPIs estilo Stitch Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricKPI
          label="Tasa de Conversión" value={`${tasa_conversion}%`}
          delta={tasa_conversion >= 20 ? '+2.5%' : undefined} positivo={tasa_conversion >= 20}
          icon={<IconPercent size={16} className="text-emerald-600" />}
          borderColor="border-l-emerald-500" accentBg="bg-emerald-50"
          desc="Porcentaje de leads que llegaron a estado Aprobado sobre el total del periodo." />
        <MetricKPI
          label="Lead Velocity" value={`${tasaVelocity}d`}
          delta={tasaVelocity > 0 ? '-0.8d' : undefined} positivo={false}
          icon={<IconTrending size={16} className="text-indigo-600" />}
          borderColor="border-l-indigo-500" accentBg="bg-indigo-50"
          desc="Días promedio que tarda un lead desde que ingresa hasta que se cierra." />
        <MetricKPI
          label="Ticket Promedio" value={fmtCOP(ticket_promedio_proyectado, true)}
          delta={ticket_promedio_proyectado > 0 ? '+$150' : undefined} positivo
          icon={<IconDollar size={16} className="text-violet-600" />}
          borderColor="border-l-violet-500" accentBg="bg-violet-50"
          desc="Valor promedio de cotización proyectada por cada lead en gestión." />
        <MetricKPI
          label="Costo por Lead" value={total > 0 ? fmtCOP(monto_total_proyectado / total, true) : '$0'}
          delta="-$2.1" positivo
          icon={<IconTarget size={16} className="text-amber-600" />}
          borderColor="border-l-amber-500" accentBg="bg-amber-50"
          desc="Monto total proyectado dividido entre el número de leads registrados." />
      </div>

      {/* ── Gráfico de línea + Donut Categoría ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">

        {/* Tendencia de Ventas vs Proyecciones */}
        <div className="md:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Tendencia de Ventas vs Proyecciones</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Volumen de leads por etapa del funnel en el periodo actual</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block rounded"/> Real</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-300 inline-block rounded border-dashed border-t border-slate-400"/> Proyección</span>
            </div>
          </div>
          {/* Gráfico de línea con datos reales por etapa como referencia visual */}
          <LineChart
            data={embudo.map(e => e.count)}
            labels={embudo.map(e => e.label)}
            color="#6366f1"
            color2="#94a3b8"
          />
          {/* Eje X */}
          <div className="flex justify-between mt-2">
            {embudo.map(e => (
              <span key={e.id} className="text-[9px] text-slate-400 font-bold truncate" style={{ maxWidth: 60 }}>{e.label.split(' ')[0]}</span>
            ))}
          </div>
        </div>

        {/* Conversión por Categoría (Donut) */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <IconBarChart size={16} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Conversión por Categoría</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Participación de cada tipo de producto en el total de leads</p>
            </div>
          </div>
          {donutItems.length > 0
            ? <DonutCategoria items={donutItems} />
            : <p className="text-center text-slate-300 text-sm py-8">Sin datos de productos</p>
          }
        </div>
      </div>

      {/* ── Embudo de Conversión + Distribución por Fuente ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Embudo step-by-step */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <IconTarget size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Embudo de Conversión</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Cuántos leads hay actualmente en cada etapa del proceso comercial</p>
            </div>
          </div>
          <div className="space-y-3">
            {embudo.map(e => {
              const pct = topEtapa > 0 ? (e.count / topEtapa) * 100 : 0;
              return (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 w-28 truncate">{e.label}</span>
                  <div className="flex-1 bg-slate-50 rounded-lg h-7 overflow-hidden relative">
                    <div className={`h-full rounded-lg ${e.color} opacity-90 transition-all duration-700 flex items-center px-2`} style={{ width: `${pct}%` }}>
                      {pct > 15 && <span className="text-[10px] font-black text-white">{e.count}</span>}
                    </div>
                    {pct <= 15 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">{e.count}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 text-center mt-4 italic">Total: {total} leads</p>
        </div>

        {/* Distribución por Fuente */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <IconGlobe size={16} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">Distribución de Leads por Fuente</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Canales de origen de los leads registrados en el periodo</p>
              </div>
            </div>
            <span className="text-[10px] font-black text-slate-400">Total: {total} ↑</span>
          </div>
          <div className="space-y-3">
            {fuentesList.map((f, i) => {
              const pct = total > 0 ? Math.round((f.count / total) * 100) : 0;
              const colors = ['bg-indigo-500','bg-violet-500','bg-blue-500','bg-sky-500','bg-cyan-500','bg-teal-500'];
              return (
                <div key={f.fuente} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 w-24 truncate">{f.fuente}</span>
                  <div className="flex-1 bg-slate-50 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-black text-slate-700 w-6 text-right">{f.count}</span>
                </div>
              );
            })}
            {fuentesList.length === 0 && <p className="text-center text-slate-300 text-sm py-6">Sin fuentes registradas</p>}
          </div>
          {/* Botón premium CTA */}
          <button className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all">
            <Zap className="w-3.5 h-3.5" /> Ver análisis completo
          </button>
        </div>
      </div>

      {/* ── Ciclo de vida ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <IconClock size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Ciclo de Vida del Lead</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Tiempo promedio entre etapas clave</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-black text-amber-600">Cierre prom: {tiempo_promedio_cierre_dias}d</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CICLO_CONFIG.map(c => {
            const val = (tiempos_promedio_horas as any)[c.key] || 0;
            const isAlert = val > c.alert && val > 0;
            return (
              <div key={c.key} className={`rounded-xl p-4 border text-center ${isAlert ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">{c.label}</p>
                <p className={`text-3xl font-black ${isAlert ? 'text-rose-600' : 'text-slate-700'}`}>{val}<span className="text-sm ml-0.5">h</span></p>
                <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div className={`h-full rounded-full ${isAlert ? 'bg-rose-400' : c.color} transition-all duration-700`}
                    style={{ width: `${Math.min((val / (c.alert * 2)) * 100, 100)}%` }} />
                </div>
                {isAlert && <p className="text-[9px] text-rose-500 font-bold mt-1">↑ Sobre el ideal</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Productos + Segmentos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Tabla de productos */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
              <IconPackage size={16} className="text-teal-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Conversión por Producto</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Volumen, tasa de cierre y monto proyectado por tipo de producto</p>
            </div>
          </div>
          <div className="space-y-2">
            {productosList.slice(0, 7).map((p, idx) => (
              <div key={p.producto} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="w-5 text-[10px] font-black text-slate-300 flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{p.producto || 'Otros'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${(p.count / total) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold">{p.count}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${p.rate >= 20 ? 'bg-emerald-100 text-emerald-700' : p.rate > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{p.rate}%</span>
                  <span className="text-xs font-black text-slate-600 w-14 text-right">{fmtCOP(p.monto, true)}</span>
                </div>
              </div>
            ))}
            {productosList.length === 0 && <p className="text-center text-slate-300 text-sm py-6">Sin datos</p>}
          </div>
        </div>

        {/* Segmentos */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center">
              <IconBarChart size={16} className="text-violet-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Distribución por Segmento</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Leads y monto proyectado según el perfil del cliente (arquitecto, industrial, etc.)</p>
            </div>
          </div>
          <div className="space-y-3">
            {segmentosList.map(s => {
              const color = SEGMENTOS_COLORS[s.segmento] || 'bg-slate-100 text-slate-700';
              return (
                <div key={s.segmento} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:shadow-sm transition-all">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${color}`}>{s.segmento}</span>
                    <span className="text-[10px] text-slate-400 font-bold">{s.total} leads</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-800">{fmtCOP(s.monto, true)}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-bold">Proyectado</p>
                    </div>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${s.conv >= 20 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {s.conv}%
                    </div>
                  </div>
                </div>
              );
            })}
            {segmentosList.length === 0 && <p className="text-center text-slate-300 text-sm py-6">Sin segmentos</p>}
          </div>
        </div>
      </div>

      {/* ── Nuevos vs Recurrentes + Razones de Pérdida ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Nuevos vs Recurrentes */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <IconActivity size={16} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Clientes Nuevos vs Recurrentes</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Sobre leads convertidos en el periodo</p>
            </div>
          </div>
          {(nuevos_clientes + clientes_recurrentes) === 0 ? (
            <p className="text-center text-slate-300 text-sm py-8">Sin conversiones en este periodo</p>
          ) : (
            <div className="space-y-4">
              {/* Barra proporcional */}
              <div className="h-4 rounded-full overflow-hidden flex bg-slate-100">
                {nuevos_clientes > 0 && (
                  <div
                    className="h-full bg-emerald-500 flex items-center justify-center transition-all duration-700"
                    style={{ width: `${(nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100}%` }}
                  >
                    {nuevos_clientes / (nuevos_clientes + clientes_recurrentes) > 0.15 && (
                      <span className="text-[9px] font-black text-white">{nuevos_clientes}</span>
                    )}
                  </div>
                )}
                {clientes_recurrentes > 0 && (
                  <div
                    className="h-full bg-blue-400 flex items-center justify-center transition-all duration-700"
                    style={{ width: `${(clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100}%` }}
                  >
                    {clientes_recurrentes / (nuevos_clientes + clientes_recurrentes) > 0.15 && (
                      <span className="text-[9px] font-black text-white">{clientes_recurrentes}</span>
                    )}
                  </div>
                )}
              </div>
              {/* Leyenda */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wide">Nuevos</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{nuevos_clientes}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    {Math.round((nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100)}% del total
                  </p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-wide">Recurrentes</p>
                  <p className="text-2xl font-black text-slate-800 mt-1">{clientes_recurrentes}</p>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                    {Math.round((clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100)}% del total
                  </p>
                </div>
              </div>
              {/* Breakdown por fuente de clientes nuevos */}
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-1">Fuentes que generan clientes nuevos</p>
              <div className="space-y-2">
                {fuentesList.map((f, i) => {
                  const colors = ['bg-emerald-500','bg-teal-500','bg-blue-500','bg-indigo-500','bg-violet-500','bg-slate-400'];
                  const pct = total > 0 ? Math.round((f.count / total) * 100) : 0;
                  return (
                    <div key={f.fuente} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-500 w-24 truncate">{f.fuente}</span>
                      <div className="flex-1 bg-slate-50 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-slate-600 w-12 text-right">{f.count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Razones de Pérdida */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
              <IconTarget size={16} className="text-rose-500" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Razones de Pérdida</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {(por_estado as any)['PERDIDO'] || 0} leads perdidos en el periodo
              </p>
            </div>
          </div>
          {motivosList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="text-3xl">🎯</span>
              <p className="text-sm font-bold text-slate-400">Sin pérdidas registradas</p>
              <p className="text-[11px] text-slate-300">¡Excelente periodo!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {motivosList.map((m, i) => {
                const totalPerdidos = motivosList.reduce((s, x) => s + x.count, 0) || 1;
                const pct = Math.round((m.count / totalPerdidos) * 100);
                const colors = ['bg-rose-500','bg-orange-500','bg-amber-500','bg-slate-400','bg-violet-400'];
                return (
                  <div key={m.motivo} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 flex-1 mr-2">{m.motivo}</span>
                      <span className="text-[10px] font-black text-slate-500">{m.count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Ranking asesores (si vista global) ── */}
      {esVistaGlobal && stats_por_asesor.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                <IconSparkles size={16} className="text-amber-500" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">Ranking Comercial</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Comparativo de desempeño, monto gestionado y conversión por asesor</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats_por_asesor.map((a: any, idx: number) => {
              const initials = a.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
              const avColors = ['from-indigo-400 to-violet-500','from-emerald-400 to-teal-500','from-amber-400 to-orange-500','from-rose-400 to-pink-500','from-blue-400 to-cyan-500'];
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              return (
                <div key={a.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center gap-4 hover:shadow-sm transition-all">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avColors[idx % avColors.length]} flex items-center justify-center font-black text-white text-sm flex-shrink-0 shadow-md`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {medal && <span className="text-sm">{medal}</span>}
                      <p className="font-black text-slate-800 text-sm truncate">{a.nombre}</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold">{a.total} leads</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${a.tasa_conversion}%` }} />
                      </div>
                      <span className={`text-[10px] font-black ${a.tasa_conversion >= 30 ? 'text-emerald-600' : a.tasa_conversion >= 15 ? 'text-amber-500' : 'text-rose-500'}`}>{a.tasa_conversion}%</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-black text-slate-700">{fmtCOP(a.monto_gestionado, true)}</p>
                    <div className="flex items-center gap-1.5 justify-end mt-1">
                      <span className="text-[10px] font-bold text-emerald-600">{a.aprobados}✓</span>
                      <span className="text-[10px] font-bold text-rose-500">{a.perdidos}✗</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CRMMetrics;
