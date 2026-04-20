import React from 'react';
import { motion } from 'framer-motion';
import { Users, HardHat, Truck, Clock, CheckCircle2, TrendingUp, FileText } from 'lucide-react';

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

const fmtMin = (n: number | null) =>
  n == null ? '—' : n < 60 ? `${Math.round(n)}min` : `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`;

const Avatar: React.FC<{ nombre: string; size?: number }> = ({ nombre, size = 32 }) => {
  const initials = (nombre || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (nombre || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.35, background: `hsl(${hue},55%,48%)` }}>
      {initials}
    </div>
  );
};

const PctBadge: React.FC<{ pct: number }> = ({ pct }) => {
  const color = pct >= 100 ? 'bg-emerald-100 text-emerald-700'
    : pct >= 70 ? 'bg-blue-100 text-blue-700'
    : pct >= 40 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-600';
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${color}`}>
      {Math.round(pct)}%
    </span>
  );
};

const MiniBar: React.FC<{ pct: number; color?: string }> = ({ pct, color = 'bg-indigo-400' }) => (
  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={{ width: 0 }}
      animate={{ width: `${Math.min(pct, 100)}%` }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    />
  </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; count: number; color: string }> = ({ icon, title, count, color }) => (
  <div className={`flex items-center gap-2 px-4 py-3 border-b border-slate-100 ${color}`}>
    <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/60">{icon}</span>
    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex-1">{title}</span>
    <span className="text-[10px] font-semibold text-slate-400 bg-white/70 px-2 py-0.5 rounded-full">{count}</span>
  </div>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden:  { opacity: 0, y: 10 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Panel ────────────────────────────────────────────────────────────────────
export const PanelEquipo: React.FC<{ data: any; isLoading: boolean }> = ({ data, isLoading }) => {

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-slate-200" />)}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0,1,2].map(i => <div key={i} className="h-64 rounded-2xl bg-slate-200" />)}
        </div>
        <div className="h-24 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center text-slate-400 text-sm">Sin datos disponibles</div>;

  const asesores     = data.ranking_asesores     || [];
  const instaladores = data.carga_instaladores   || [];
  const conductores  = data.analisis_conductores || [];
  const operHoy      = data.operaciones_hoy;
  const odpsHoy      = operHoy?.odps || {};
  const totalHoy     = Number(odpsHoy.pendientes || 0) + Number(odpsHoy.en_curso || 0) + Number(odpsHoy.completadas || 0);

  // IDs de instaladores/conductores en ruta activa hoy
  const rutasActivas     = operHoy?.rutas_activas || [];
  const conductoresEnRuta = new Set(rutasActivas.map((r: any) => r.conductor?.toLowerCase()));

  return (
    <div className="space-y-3">

      {/* ── KPI Header compacto ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { label: 'Asesores',        value: data.total_asesores ?? 0,              color: 'text-blue-600',    icon: <Users className="w-3.5 h-3.5 text-blue-400" /> },
          { label: 'Instaladores',    value: data.total_instaladores ?? 0,          color: 'text-emerald-600', icon: <HardHat className="w-3.5 h-3.5 text-emerald-400" /> },
          { label: 'ODPs / Asesor',   value: data.odps_por_asesor_promedio ?? 0,    color: 'text-slate-700',   icon: <FileText className="w-3.5 h-3.5 text-slate-400" /> },
          { label: 'Efic. Taller',    value: `${data.eficiencia_taller_pct ?? 0}%`, color: (data.eficiencia_taller_pct ?? 0) >= 80 ? 'text-emerald-600' : 'text-amber-600', icon: <TrendingUp className="w-3.5 h-3.5 text-slate-400" /> },
        ].map((item, i) => (
          <motion.div key={i} custom={i} variants={cardVar} initial="hidden" animate="visible"
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-3">
            {item.icon}
            <div>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest leading-none mb-1">{item.label}</p>
              <p className={`text-[22px] font-bold leading-none tabular-nums ${item.color}`}>{item.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── 3 Columnas ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* COLUMNA 1: Comercial / Asesores */}
        <motion.div custom={4} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<Users className="w-4 h-4 text-blue-500" />}
            title="Comercial"
            count={asesores.length}
            color="bg-blue-50/60"
          />
          <div className="divide-y divide-slate-50">
            {asesores.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-8">Sin asesores</p>
            )}
            {asesores.map((as: any, i: number) => {
              const pct = as.meta > 0 ? (as.real / as.meta) * 100 : 0;
              const firstName = (as.nombre || 'Asesor').split(' ').slice(0, 2).join(' ');
              return (
                <motion.div key={as.asesor_id} custom={i} variants={cardVar} initial="hidden" animate="visible"
                  className="px-4 py-3 flex flex-col gap-2 hover:bg-slate-50/60 transition-colors">
                  {/* Fila nombre + badge */}
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={as.nombre || ''} size={30} />
                    <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{firstName}</span>
                    <PctBadge pct={pct} />
                  </div>
                  {/* Real vs Meta */}
                  <div className="flex items-end justify-between text-[10px] text-slate-500">
                    <span>{fmtM(as.real)} <span className="text-slate-300">/</span> {fmtM(as.meta > 0 ? as.meta : 0)}</span>
                  </div>
                  <MiniBar pct={pct} color="bg-blue-400" />
                  {/* Chips extra */}
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                      {as.prospectos_activos ?? 0} prospectos
                    </span>
                    <span className="text-[9px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {as.odps_abiertas ?? 0} ODPs abiertas
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* COLUMNA 2: Instalación */}
        <motion.div custom={5} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<HardHat className="w-4 h-4 text-emerald-500" />}
            title="Instalación"
            count={instaladores.length}
            color="bg-emerald-50/60"
          />
          <div className="divide-y divide-slate-50">
            {instaladores.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-8">Sin instaladores</p>
            )}
            {instaladores.map((inst: any, i: number) => {
              const evidPct    = inst.instalaciones_mes > 0 ? (inst.con_evidencia / inst.instalaciones_mes) * 100 : 0;
              const firstName  = (inst.nombre || 'Instalador').split(' ').slice(0, 2).join(' ');
              const rendRow    = (data.rendimiento_instaladores || []).find((r: any) => Number(r.instalador_id) === Number(inst.instalador_id));
              const avgMin     = rendRow?.avg_minutos_instalacion != null ? Number(rendRow.avg_minutos_instalacion) : null;
              return (
                <motion.div key={inst.instalador_id} custom={i} variants={cardVar} initial="hidden" animate="visible"
                  className="px-4 py-3 flex flex-col gap-2 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={inst.nombre || ''} size={30} />
                    <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{firstName}</span>
                    {rendRow?.completadas_hoy > 0 && (
                      <span className="flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>●</motion.span>
                        HOY {rendRow.completadas_hoy}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span><strong className="text-slate-700">{inst.instalaciones_mes}</strong> instalaciones</span>
                    <span className="text-slate-400">evidencia {Math.round(evidPct)}%</span>
                  </div>
                  <MiniBar pct={evidPct} color="bg-emerald-400" />
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[9px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />{fmtMin(avgMin)}
                    </span>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${inst.sin_evidencia > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {inst.sin_evidencia > 0 ? `${inst.sin_evidencia} sin foto` : 'Fotos OK'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* COLUMNA 3: Conductores */}
        <motion.div custom={6} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <SectionHeader
            icon={<Truck className="w-4 h-4 text-violet-500" />}
            title="Conductores"
            count={conductores.length}
            color="bg-violet-50/60"
          />
          <div className="divide-y divide-slate-50">
            {conductores.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-8">Sin conductores</p>
            )}
            {conductores.map((c: any, i: number) => {
              const rutas       = Number(c.rutas_mes) || 0;
              const completadas = Number(c.rutas_completadas) || 0;
              const compPct     = rutas > 0 ? (completadas / rutas) * 100 : 0;
              const firstName   = (c.nombre || 'Conductor').split(' ').slice(0, 2).join(' ');
              const enRuta      = conductoresEnRuta.has((c.nombre || '').toLowerCase());
              return (
                <motion.div key={c.conductor_id} custom={i} variants={cardVar} initial="hidden" animate="visible"
                  className="px-4 py-3 flex flex-col gap-2 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={c.nombre || ''} size={30} />
                    <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{firstName}</span>
                    {enRuta && (
                      <span className="flex items-center gap-1 text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>●</motion.span>
                        EN RUTA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span><strong className="text-slate-700">{completadas}/{rutas}</strong> rutas</span>
                    <span className="text-slate-400">{fmtMin(c.avg_minutos_ruta != null ? Number(c.avg_minutos_ruta) : null)} prom.</span>
                  </div>
                  <MiniBar pct={compPct} color="bg-violet-400" />
                  <div className="flex gap-2 flex-wrap">
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${compPct >= 80 ? 'bg-emerald-50 text-emerald-600' : compPct >= 50 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                      {Math.round(compPct)}% completadas
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ── Operaciones Hoy (footer compacto) ────────────────────────── */}
      <motion.div custom={7} variants={cardVar} initial="hidden" animate="visible"
        className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operaciones Hoy</p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {[
            { label: 'Pendientes',  value: Number(odpsHoy.pendientes  ?? 0), color: 'text-slate-600',   dot: 'bg-slate-300' },
            { label: 'En Curso',    value: Number(odpsHoy.en_curso    ?? 0), color: 'text-amber-600',   dot: 'bg-amber-400' },
            { label: 'Completadas', value: Number(odpsHoy.completadas ?? 0), color: 'text-emerald-600', dot: 'bg-emerald-400' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${item.dot}`} />
              <span className={`text-[20px] font-bold tabular-nums ${item.color}`}>{item.value}</span>
              <span className="text-[9px] text-slate-400 uppercase tracking-wide">{item.label}</span>
            </div>
          ))}

          {totalHoy > 0 && (
            <div className="flex-1 min-w-[120px] h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
              <motion.div className="bg-slate-300 h-full" initial={{ width: 0 }} animate={{ width: `${(Number(odpsHoy.pendientes || 0) / totalHoy) * 100}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
              <motion.div className="bg-amber-400 h-full"   initial={{ width: 0 }} animate={{ width: `${(Number(odpsHoy.en_curso    || 0) / totalHoy) * 100}%` }} transition={{ duration: 0.8, delay: 0.3 }} />
              <motion.div className="bg-emerald-400 h-full" initial={{ width: 0 }} animate={{ width: `${(Number(odpsHoy.completadas || 0) / totalHoy) * 100}%` }} transition={{ duration: 0.8, delay: 0.4 }} />
            </div>
          )}
        </div>

        {rutasActivas.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
            {rutasActivas.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-[11px]">
                <Truck className="w-3 h-3 text-amber-500" />
                <span className="font-medium text-slate-700">{r.vehiculo}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{r.conductor}</span>
                <span className="text-slate-400">·</span>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-slate-500 tabular-nums">{r.stops_completadas}/{r.stops_total}</span>
                {r.stops_en_curso > 0 && (
                  <span className="flex items-center gap-1 text-amber-600 font-bold">
                    <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>●</motion.span>
                    {r.stops_en_curso}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {rutasActivas.length === 0 && (
          <p className="text-[11px] text-slate-400 mt-2">Sin rutas activas en este momento</p>
        )}
      </motion.div>

    </div>
  );
};

export default PanelEquipo;
