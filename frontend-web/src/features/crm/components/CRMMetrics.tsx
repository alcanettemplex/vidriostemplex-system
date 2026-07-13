import React, { useEffect, useState } from 'react';
import {
  AlertCircle, TrendingUp, TrendingDown
} from 'lucide-react';
import { apiGetCRMStats } from '../crmService';
import {
  IconDollar, IconCheck, IconGlobe, IconBarChart,
  IconPackage, IconPercent, IconSparkles, IconActivity, IconTarget
} from './CRMIcons';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCOP = (v: number, compact = false) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {})
  }).format(v);

const fmtDelta = (
  curr: number, prev: number, esMoneda = false
): { label: string; positivo: boolean } | null => {
  if (prev === null || prev === undefined) return null;
  const diff = curr - prev;
  if (diff === 0) return null;
  const abs = esMoneda ? fmtCOP(Math.abs(diff), true) : `${Math.abs(diff)}%`;
  return { label: `${diff > 0 ? '+' : '−'}${abs}`, positivo: diff > 0 };
};

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative group inline-flex ml-1.5 flex-shrink-0">
    <button
      type="button"
      className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[11px] font-semibold flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
    >?</button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-[11px] rounded-xl p-3 shadow-xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none leading-snug">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
    </div>
  </div>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface MetricKPIProps {
  label: string; value: string; delta?: string; positivo?: boolean;
  icon: React.ReactNode; borderColor: string; accentBg: string;
  desc?: string; tooltip?: string; onClick?: () => void;
}
const MetricKPI: React.FC<MetricKPIProps> = ({
  label, value, delta, positivo, icon, borderColor, accentBg, desc, tooltip, onClick
}) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl p-5 border border-slate-200 border-l-4 ${borderColor} flex flex-col gap-2 hover:border-slate-300 transition-all duration-200 ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
  >
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className={`w-8 h-8 rounded-lg ${accentBg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
    </div>
    <div className="flex items-end gap-3">
      <p className="text-3xl font-semibold text-slate-800 leading-none tracking-tight">{value}</p>
      {delta && (
        <span className={`flex items-center gap-0.5 text-xs font-semibold mb-0.5 ${positivo ? 'text-emerald-600' : 'text-rose-500'}`}>
          {positivo ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {delta}
          <span className="text-[11px] font-medium text-slate-400 ml-0.5">vs mes ant.</span>
        </span>
      )}
    </div>
    {desc && <p className="text-xs text-slate-400 font-medium leading-snug">{desc}</p>}
  </div>
);

// ─── Barra horizontal por categoría (part-to-whole) ────────────────────────────
// Paleta categórica validada (orden fijo, nunca ciclado — 6 checks del skill de
// dataviz: CVD ΔE 24.2, muy por encima del mínimo de 12). Un donut no es la forma
// correcta para comparar valores cercanos entre sí (28% vs 25% vs 21%…) — una
// barra ordenada de mayor a menor sí permite esa comparación de un vistazo.
const CATEGORICAL_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const BarraCategoria: React.FC<{ items: { label: string; pct: number }[] }> = ({ items }) => {
  const total = items.reduce((s, i) => s + i.pct, 0) || 1;
  const sorted = [...items].sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-3">
      {sorted.map((item, i) => {
        const pct = Math.round((item.pct / total) * 100);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-32 flex-shrink-0 text-xs font-bold text-slate-600 truncate">{item.label}</span>
            <div className="flex-1 bg-slate-100 rounded-lg h-2 overflow-hidden">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
                  borderRadius: '0 4px 4px 0',
                }}
              />
            </div>
            <span
              className="w-10 flex-shrink-0 text-right text-xs font-semibold text-slate-700"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Config embudo ────────────────────────────────────────────────────────────
const ETAPAS_CONFIG = [
  { id: 'ASIGNADO',       label: 'Asignados',      color: 'bg-blue-500' },
  { id: 'EN_CONTACTO',    label: 'En Contacto',    color: 'bg-violet-500' },
  { id: 'COTIZANDO',      label: 'Cotizando',      color: 'bg-amber-500' },
  { id: 'SEGUIMIENTO',    label: 'Seguimiento',    color: 'bg-teal-500' },
  { id: 'VISITA_TECNICA', label: 'Visita Técnica', color: 'bg-indigo-500' },
  { id: 'APROBADO',       label: 'Aprobados',      color: 'bg-emerald-500' },
];

const SEGMENTOS_COLORS: Record<string, string> = {
  'Arquitecto': 'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial': 'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid': 'bg-fuchsia-100 text-fuchsia-700',
};

// ─── Modal: Leads Aprobados sin ODP ──────────────────────────────────────────
interface LeadSinODP {
  id: number; nombre: string; telefono: string; monto: number;
  asesor_nombre: string; asesor_id: number | null; dias_desde_aprobacion: number | null;
}

const fmtCOPModal = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const LeadsSinODPModal: React.FC<{ leads: LeadSinODP[]; onClose: () => void }> = ({ leads, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}>
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200">
        <div>
          <h3 className="font-semibold text-slate-800 text-base">Leads Aprobados sin ODP</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} aprobado{leads.length !== 1 ? 's' : ''} que aún no tienen una Orden de Producción vinculada.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors text-sm font-semibold"
        >✕</button>
      </div>

      {/* Tabla */}
      <div className="overflow-y-auto flex-1 p-4">
        {leads.length === 0 ? (
          <p className="text-center text-slate-300 py-10 text-sm">Sin leads en esta condición</p>
        ) : (
          <div className="space-y-2">
            {/* Encabezado de columnas */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5">
              <span className="col-span-4 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Cliente / Lead</span>
              <span className="col-span-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Asesor</span>
              <span className="col-span-2 text-[11px] font-semibold text-slate-400 uppercase tracking-widest text-right">Monto proy.</span>
              <span className="col-span-3 text-[11px] font-semibold text-slate-400 uppercase tracking-widest text-right">Días aprobado</span>
            </div>
            {leads.map(l => {
              const diasUrgente = l.dias_desde_aprobacion !== null && l.dias_desde_aprobacion >= 7;
              return (
                <div key={l.id} className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded-lg border transition-colors ${diasUrgente ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                  {/* Nombre + teléfono */}
                  <div className="col-span-4">
                    <p className="text-xs font-bold text-slate-800 truncate">{l.nombre}</p>
                    <p className="text-xs text-slate-400 font-medium">{l.telefono}</p>
                  </div>
                  {/* Asesor */}
                  <div className="col-span-3">
                    <p className="text-xs font-bold text-slate-600 truncate">{l.asesor_nombre}</p>
                  </div>
                  {/* Monto */}
                  <div className="col-span-2 text-right">
                    <p className="text-xs font-semibold text-slate-700">{fmtCOPModal(l.monto)}</p>
                  </div>
                  {/* Días */}
                  <div className="col-span-3 text-right">
                    {l.dias_desde_aprobacion !== null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${diasUrgente ? 'bg-rose-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                        {l.dias_desde_aprobacion}d
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium">
          🔴 Rojo = aprobado hace 7+ días sin ODP. Requiere acción urgente.
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors"
        >Cerrar</button>
      </div>
    </div>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { asesorId?: number; esVistaGlobal?: boolean; fecha_desde?: string | null; fecha_hasta?: string | null; }

// ═════════════════════════════════════════════════════════════════════════════
const CRMMetrics: React.FC<Props> = ({ esVistaGlobal, fecha_desde, fecha_hasta }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinOdpModal, setSinOdpModal] = useState(false);

  const cargar = async () => {
    setLoading(true); setError(null);
    try { const { data } = await apiGetCRMStats(fecha_desde || undefined, fecha_hasta || undefined); setStats(data); }
    catch { setError('No se pudieron cargar las métricas.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [fecha_desde, fecha_hasta, esVistaGlobal]); // eslint-disable-line

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 bg-white rounded-xl animate-pulse border border-slate-200" />
        ))}
      </div>
    </div>
  );

  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-600 text-sm font-medium">{error}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-[#5e6ad2] hover:bg-[#4c58c0] text-white rounded-lg text-sm font-medium transition-colors">
        Reintentar
      </button>
    </div>
  );

  const {
    total = 0, monto_real_aprobados = 0,
    tasa_conversion = 0, ticket_promedio_proyectado = 0,
    por_estado = {}, por_motivo_perdida = {}, por_producto = {},
    por_fuente = {}, por_segmento = {},
    stats_por_asesor = [],
    nuevos_prospectos = 0, nuevos_crm = 0, clientes_recurrentes = 0,
    monto_nuevos_clientes = 0, monto_nuevos_crm = 0, monto_clientes_recurrentes = 0,
    negocios_por_fuente = [],
    vs_anterior = null,
    leads_aprobados_sin_odp = 0,
    leads_aprobados_sin_odp_detalle = [],
  } = stats;

  // "Nuevos" agrupa las dos vías de captación de clientes nuevos: prospectos formales
  // directos (sin CRM) + negocios originados en un lead del CRM. Así la tarjeta vuelve a
  // cuadrar con el total de ODPs del período (nuevos + recurrentes = total).
  const nuevos_clientes = nuevos_prospectos + nuevos_crm;
  const monto_nuevos_total = monto_nuevos_clientes + monto_nuevos_crm;

  // Listas derivadas
  const fuentesList   = Object.entries(por_fuente).map(([f, c]) => ({ fuente: f, count: c as number })).sort((a, b) => b.count - a.count);
  const negociosFuenteList = (negocios_por_fuente as { fuente: string; count: number; monto: number }[]).slice().sort((a, b) => b.count - a.count);
  const negociosFuenteTotal = negociosFuenteList.reduce((acc, f) => acc + f.count, 0);
  const negociosFuenteMontoTotal = negociosFuenteList.reduce((acc, f) => acc + (f.monto || 0), 0);
  const motivosList   = Object.entries(por_motivo_perdida).map(([m, c]) => ({ motivo: m, count: c as number })).sort((a, b) => b.count - a.count);
  const productosList = Object.entries(por_producto).map(([p, d]: [string, any]) => ({
    producto: p, count: d.total,
    rate: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0,
    monto: d.monto,
  })).sort((a, b) => b.monto - a.monto);
  const segmentosList = Object.entries(por_segmento).map(([s, d]: [string, any]) => ({
    segmento: s, total: d.total, aprobados: d.aprobados, monto: d.monto,
    conv: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0,
  }));

  const donutItems = productosList.slice(0, 5).map(p => ({ label: p.producto || 'Sin Definir', pct: p.count }));
  const embudo     = ETAPAS_CONFIG.map(e => ({ ...e, count: (por_estado as any)[e.id] || 0 }));
  const topEtapa   = Math.max(...embudo.map(e => e.count), 1);

  // Deltas reales vs período anterior
  const deltaConversion = vs_anterior ? fmtDelta(tasa_conversion, vs_anterior.tasa_conversion) : null;
  const deltaTicket     = vs_anterior ? fmtDelta(ticket_promedio_proyectado, vs_anterior.ticket_promedio_proyectado, true) : null;
  const deltaMontoReal  = vs_anterior ? fmtDelta(monto_real_aprobados, vs_anterior.monto_real_aprobados, true) : null;

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div>
        <h2 className="text-[22px] font-medium text-slate-800 tracking-tight">Análisis de Métricas</h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Monitoreo de eficiencia comercial y gestión CRM del período seleccionado.
          {vs_anterior !== null && <span className="ml-1 text-indigo-400">Los deltas (↑↓) comparan vs el mes anterior.</span>}
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricKPI
          label="Tasa de Conversión"
          value={`${tasa_conversion}%`}
          delta={deltaConversion?.label}
          positivo={deltaConversion?.positivo}
          icon={<IconPercent size={16} className="text-emerald-600" />}
          borderColor="border-l-emerald-500" accentBg="bg-emerald-50"
          tooltip="Porcentaje de leads que llegaron a estado APROBADO sobre el total del período. Una tasa saludable para este sector es superior al 20%. Si baja, revisar etapas con acumulación."
          desc="Leads Aprobados ÷ Total de leads del período."
        />
        <MetricKPI
          label="Aprobados sin ODP"
          value={String(leads_aprobados_sin_odp)}
          icon={<AlertCircle size={16} className="text-rose-500" />}
          borderColor="border-l-rose-400" accentBg="bg-rose-50"
          tooltip="Leads con estado APROBADO que todavía no tienen una Orden de Producción generada. El negocio se cerró comercialmente pero aún no arrancó en el sistema productivo. Haz clic para ver el detalle."
          desc="Haz clic para ver el detalle y gestionar."
          onClick={() => setSinOdpModal(true)}
        />
        <MetricKPI
          label="Ticket Promedio"
          value={fmtCOP(ticket_promedio_proyectado, true)}
          delta={deltaTicket?.label}
          positivo={deltaTicket?.positivo}
          icon={<IconDollar size={16} className="text-violet-600" />}
          borderColor="border-l-violet-500" accentBg="bg-violet-50"
          tooltip="Valor promedio del monto proyectado de cotización por lead. Si baja, puede indicar que están llegando leads de menor volumen o que las cotizaciones no se están actualizando en el sistema."
          desc="Suma de montos proyectados ÷ Total de leads."
        />
        <MetricKPI
          label="Monto Real Aprobados"
          value={fmtCOP(monto_real_aprobados, true)}
          delta={deltaMontoReal?.label}
          positivo={deltaMontoReal?.positivo}
          icon={<IconCheck size={16} className="text-teal-600" />}
          borderColor="border-l-teal-500" accentBg="bg-teal-50"
          tooltip="Suma del monto real confirmado de todos los leads cerrados como APROBADO. Refleja los ingresos efectivamente captados por el equipo comercial en este período."
          desc="Suma de monto_real de leads en estado Aprobado."
        />
      </div>

      {/* ── Participación por Producto ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <IconBarChart size={16} className="text-indigo-600" />
          </div>
          <div className="flex items-center">
            <h3 className="font-semibold text-slate-800 text-base tracking-tight">Participación por Producto</h3>
            <InfoTooltip text="Distribución de leads según el tipo de producto de interés registrado, ordenada de mayor a menor participación. No indica conversión, sino volumen de interés." />
          </div>
        </div>
        {donutItems.length > 0
          ? <BarraCategoria items={donutItems} />
          : <p className="text-center text-slate-300 text-sm py-8">Sin datos de productos</p>
        }
      </div>

      {/* ── Embudo + Fuentes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Embudo de conversión */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <IconTarget size={16} className="text-amber-600" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Embudo de Conversión</h3>
              <InfoTooltip text="Cuántos leads activos hay en cada etapa del proceso comercial (excluye leads sin respuesta). La barra más ancha es la etapa con más volumen. Si Cotizando o En Contacto superan ampliamente a Aprobados, hay un cuello de botella que revisar." />
            </div>
          </div>
          <div className="space-y-3">
            {embudo.map(e => {
              const pct = topEtapa > 0 ? (e.count / topEtapa) * 100 : 0;
              return (
                <div key={e.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 w-28 truncate">{e.label}</span>
                  <div className="flex-1 bg-slate-50 rounded-lg h-7 overflow-hidden relative">
                    <div
                      className={`h-full rounded-lg ${e.color} opacity-90 transition-all duration-700 flex items-center px-2`}
                      style={{ width: `${pct}%` }}
                    >
                      {pct > 15 && <span className="text-xs font-semibold text-white">{e.count}</span>}
                    </div>
                    {pct <= 15 && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">{e.count}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 text-center mt-4 italic">
            {embudo.reduce((s, e) => s + e.count, 0)} leads en etapas activas
            <span className="ml-1 text-slate-300">(de {total} totales en el período)</span>
          </p>
        </div>

        {/* Distribución por Fuente */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <IconGlobe size={16} className="text-blue-600" />
              </div>
              <div className="flex items-center">
                <h3 className="font-semibold text-slate-800 text-base tracking-tight">Distribución por Fuente</h3>
                <InfoTooltip text="Canal de origen de cada lead registrado (WhatsApp, referido, Instagram, presencial, etc.). Muestra qué canal trae más volumen y ayuda a decidir dónde enfocar esfuerzos de captación o inversión publicitaria." />
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-400">Total: {total}</span>
          </div>
          <div className="space-y-3">
            {fuentesList.map((f, i) => {
              const pct = total > 0 ? Math.round((f.count / total) * 100) : 0;
              const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-sky-500', 'bg-cyan-500', 'bg-teal-500'];
              return (
                <div key={f.fuente} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500 w-24 truncate">{f.fuente}</span>
                  <div className="flex-1 bg-slate-50 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-16 text-right">{f.count} ({pct}%)</span>
                </div>
              );
            })}
            {fuentesList.length === 0 && (
              <p className="text-center text-slate-300 text-sm py-6">Sin fuentes registradas</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Conversión por Producto + Segmentos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Tabla de productos */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
              <IconPackage size={16} className="text-teal-600" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Conversión por Producto</h3>
              <InfoTooltip text="Ranking de productos ordenado por monto proyectado acumulado. La barra interna muestra la frecuencia del producto (leads sobre el total). El badge de porcentaje es la tasa de conversión: verde ≥20%, naranja 1-19%, gris 0%." />
            </div>
          </div>
          <div className="space-y-2">
            {productosList.slice(0, 7).map((p, idx) => (
              <div key={p.producto} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="w-5 text-xs font-semibold text-slate-300 flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{p.producto || 'Sin Definir'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${total > 0 ? (p.count / total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 font-bold">{p.count} leads</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.rate >= 20 ? 'bg-emerald-100 text-emerald-700' : p.rate > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    {p.rate}% conv.
                  </span>
                  <span className="text-xs font-semibold text-slate-600 w-14 text-right">{fmtCOP(p.monto, true)}</span>
                </div>
              </div>
            ))}
            {productosList.length === 0 && (
              <p className="text-center text-slate-300 text-sm py-6">Sin datos de productos</p>
            )}
          </div>
        </div>

        {/* Segmentos */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <IconBarChart size={16} className="text-violet-600" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Distribución por Segmento</h3>
              <InfoTooltip text="Leads y monto proyectado agrupados por el perfil del cliente (arquitecto, industrial, etc.). El porcentaje en el círculo derecho es la tasa de conversión de ese segmento: verde ≥20%, naranja 1-19%. Identifica qué tipo de cliente convierte mejor." />
            </div>
          </div>
          <div className="space-y-3">
            {segmentosList.map(s => {
              const color = SEGMENTOS_COLORS[s.segmento] || 'bg-slate-100 text-slate-700';
              return (
                <div key={s.segmento} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{s.segmento}</span>
                    <span className="text-xs text-slate-400 font-bold">{s.total} leads</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-800">{fmtCOP(s.monto, true)}</p>
                      <p className="text-[11px] text-slate-400 uppercase font-bold">Monto proy.</p>
                    </div>
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-xs font-semibold ${s.conv >= 20 ? 'bg-emerald-500 text-white' : s.conv > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.conv}%
                    </div>
                  </div>
                </div>
              );
            })}
            {segmentosList.length === 0 && (
              <p className="text-center text-slate-300 text-sm py-6">Sin segmentos registrados</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Nuevos vs Recurrentes + Razones de Pérdida ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Nuevos vs Recurrentes */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <IconActivity size={16} className="text-emerald-600" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Clientes Nuevos vs Recurrentes</h3>
              <InfoTooltip text="'Nuevos' = ODPs del período de clientes nuevos captados por cualquier vía (leads del CRM o prospectos formales). 'Recurrentes' = ODPs de clientes que ya existían y volvieron a comprar. La suma cuadra con el total de ODPs del período." />
            </div>
          </div>
          {(nuevos_clientes + clientes_recurrentes) === 0 ? (
            <p className="text-center text-slate-300 text-sm py-8">Sin conversiones en este período</p>
          ) : (
            <div className="space-y-4">
              <div className="h-4 rounded-full overflow-hidden flex bg-slate-100">
                {nuevos_clientes > 0 && (
                  <div
                    className="h-full bg-emerald-500 flex items-center justify-center transition-all duration-700"
                    style={{ width: `${(nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100}%` }}
                  >
                    {nuevos_clientes / (nuevos_clientes + clientes_recurrentes) > 0.15 && (
                      <span className="text-[11px] font-semibold text-white">{nuevos_clientes}</span>
                    )}
                  </div>
                )}
                {clientes_recurrentes > 0 && (
                  <div
                    className="h-full bg-blue-400 flex items-center justify-center transition-all duration-700"
                    style={{ width: `${(clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100}%` }}
                  >
                    {clientes_recurrentes / (nuevos_clientes + clientes_recurrentes) > 0.15 && (
                      <span className="text-[11px] font-semibold text-white">{clientes_recurrentes}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Nuevos</p>
                  <p className="text-3xl font-semibold text-slate-800 mt-1">{nuevos_clientes}</p>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    {Math.round((nuevos_clientes / (nuevos_clientes + clientes_recurrentes)) * 100)}% del total
                  </p>
                  {monto_nuevos_total > 0 && (
                    <p className="text-xs font-bold text-emerald-700 mt-1">{fmtCOP(monto_nuevos_total, true)}</p>
                  )}
                  <p className="text-[11px] text-emerald-600 font-medium mt-1">Clientes nuevos (CRM + prospectos)</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Recurrentes</p>
                  <p className="text-3xl font-semibold text-slate-800 mt-1">{clientes_recurrentes}</p>
                  <p className="text-xs text-slate-400 font-bold mt-0.5">
                    {Math.round((clientes_recurrentes / (nuevos_clientes + clientes_recurrentes)) * 100)}% del total
                  </p>
                  {monto_clientes_recurrentes > 0 && (
                    <p className="text-xs font-bold text-blue-700 mt-1">{fmtCOP(monto_clientes_recurrentes, true)}</p>
                  )}
                  <p className="text-[11px] text-blue-600 font-medium mt-1">Clientes que ya existían</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Razones de Pérdida */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <IconTarget size={16} className="text-rose-500" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Razones de Pérdida</h3>
              <InfoTooltip text="Motivos registrados cuando un lead pasa a estado PERDIDO. El asesor debe seleccionar un motivo oficial al cerrar el lead. Identificar los motivos más frecuentes permite ajustar el discurso comercial y reducir fugas." />
            </div>
          </div>
          <p className="text-xs text-slate-400 font-bold mb-4">
            {(por_estado as any)['PERDIDO'] || 0} leads perdidos en el período
          </p>
          {motivosList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <span className="text-3xl">🎯</span>
              <p className="text-sm font-bold text-slate-400">Sin pérdidas registradas</p>
              <p className="text-[11px] text-slate-300">¡Excelente período!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {motivosList.map((m, i) => {
                const totalPerdidos = motivosList.reduce((s, x) => s + x.count, 0) || 1;
                const pct = Math.round((m.count / totalPerdidos) * 100);
                const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-slate-400', 'bg-violet-400'];
                return (
                  <div key={m.motivo} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600 flex-1 mr-2">{m.motivo}</span>
                      <span className="text-xs font-semibold text-slate-500">{m.count} ({pct}%)</span>
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

      {/* ── Negocios por Fuente (ODPs del período según la fuente del cliente) ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <IconGlobe size={16} className="text-emerald-600" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Negocios por Fuente</h3>
              <InfoTooltip text="Los negocios (ODPs) del período repartidos según el canal por el que llegó el cliente (WhatsApp, Facebook, Instagram, etc.). El total coincide con el de 'Clientes Nuevos vs Recurrentes'. Los negocios cuyo cliente aún no tiene fuente registrada aparecen como 'Sin especificar'." />
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-400">Total: {negociosFuenteTotal} · {fmtCOP(negociosFuenteMontoTotal, true)}</span>
        </div>
        <div className="space-y-3">
          {negociosFuenteList.map((f, i) => {
            const pct = negociosFuenteTotal > 0 ? Math.round((f.count / negociosFuenteTotal) * 100) : 0;
            const colors = ['bg-emerald-500', 'bg-teal-500', 'bg-green-500', 'bg-cyan-500', 'bg-lime-500', 'bg-sky-500'];
            return (
              <div key={f.fuente} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500 w-24 truncate">{f.fuente}</span>
                <div className="flex-1 bg-slate-50 rounded-full h-2.5 overflow-hidden">
                  <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-700 w-14 text-right">{f.count} ({pct}%)</span>
                <span className="text-xs font-bold text-emerald-700 w-16 text-right">{fmtCOP(f.monto || 0, true)}</span>
              </div>
            );
          })}
          {negociosFuenteList.length === 0 && (
            <p className="text-center text-slate-300 text-sm py-6">Sin negocios en este período</p>
          )}
        </div>
      </div>

      {/* ── Modal Leads Aprobados sin ODP ── */}
      {sinOdpModal && (
        <LeadsSinODPModal
          leads={leads_aprobados_sin_odp_detalle as LeadSinODP[]}
          onClose={() => setSinOdpModal(false)}
        />
      )}

      {/* ── Ranking Asesores (solo vista global) ── */}
      {esVistaGlobal && stats_por_asesor.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <IconSparkles size={16} className="text-amber-500" />
            </div>
            <div className="flex items-center">
              <h3 className="font-semibold text-slate-800 text-base tracking-tight">Ranking Comercial</h3>
              <InfoTooltip text="Comparativo de desempeño por asesor en el período, ordenado por tasa de conversión. El monto gestionado es la suma de montos proyectados de todos sus leads. Verde ≥30%, naranja 15-29%, rojo &lt;15%. Solo visible para roles con acceso global." />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats_por_asesor.map((a: any, idx: number) => {
              const initials = a.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
              const avColors = ['from-indigo-400 to-violet-500', 'from-emerald-400 to-teal-500', 'from-amber-400 to-orange-500', 'from-rose-400 to-pink-500', 'from-blue-400 to-cyan-500'];
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              return (
                <div key={a.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200 hover:border-slate-300 flex items-center gap-4 transition-all">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avColors[idx % avColors.length]} flex items-center justify-center font-semibold text-white text-sm flex-shrink-0 shadow-md`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {medal && <span className="text-sm">{medal}</span>}
                      <p className="font-bold text-slate-800 text-base truncate">{a.nombre}</p>
                    </div>
                    <p className="text-xs text-slate-400 font-bold">{a.total} leads asignados</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${a.tasa_conversion}%`, backgroundColor: '#5e6ad2' }} />
                      </div>
                      <span className={`text-xs font-semibold ${a.tasa_conversion >= 30 ? 'text-emerald-600' : a.tasa_conversion >= 15 ? 'text-amber-500' : 'text-rose-500'}`}>
                        {a.tasa_conversion}% conv.
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-700">{fmtCOP(a.monto_gestionado, true)}</p>
                    <p className="text-xs font-bold text-emerald-600 mt-1">{a.aprobados} aprobados</p>
                    <p className="text-xs font-bold text-rose-500">{a.perdidos} perdidos</p>
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
