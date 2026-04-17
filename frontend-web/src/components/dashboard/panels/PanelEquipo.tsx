import React from 'react';
import { motion } from 'framer-motion';
import { Truck, Clock, CheckCircle2 } from 'lucide-react';

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const fmtMin = (n: number | null) =>
  n == null ? '—' : n < 60 ? `${Math.round(n)}min` : `${Math.floor(n / 60)}h${Math.round(n % 60)}m`;

// ─── Activity Ring SVG ────────────────────────────────────────────────────────
const Ring: React.FC<{
  pct: number; color: string; radius: number; strokeWidth: number;
  delay?: number; cx: number; cy: number;
}> = ({ pct, color, radius, strokeWidth, delay = 0, cx, cy }) => {
  const circ   = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(pct / 100, 1)) * circ;
  const empty  = circ - filled;
  return (
    <>
      {/* track */}
      <circle cx={cx} cy={cy} r={radius} fill="none"
        stroke="rgba(0,0,0,0.08)" strokeWidth={strokeWidth} />
      {/* fill */}
      <motion.circle cx={cx} cy={cy} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${circ}`}
        initial={{ strokeDashoffset: circ, opacity: 0 }}
        animate={{ strokeDashoffset: empty, opacity: 1 }}
        transform={`rotate(-90 ${cx} ${cy})`}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay }} />
    </>
  );
};

// ─── Componente de anillos por persona ────────────────────────────────────────
const ActivityRingCard: React.FC<{
  nombre: string; rol: string;
  ring1: { pct: number; label: string; value: string };
  ring2: { pct: number; label: string; value: string };
  delay?: number;
}> = ({ nombre, rol, ring1, ring2, delay = 0 }) => {
  const SIZE    = 120;
  const cx      = SIZE / 2; const cy = SIZE / 2;
  const initials = (nombre || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const hue      = (nombre || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay }}
      whileHover={{ scale: 1.04, boxShadow: '0 4px 24px rgba(99,102,241,0.12)' }}
      className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center gap-3 cursor-default">

      {/* SVG rings */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE}>
          <Ring pct={ring1.pct} color="#FF375F" radius={46} strokeWidth={9} delay={delay + 0.1} cx={cx} cy={cy} />
          <Ring pct={ring2.pct} color="#30D158" radius={33} strokeWidth={8} delay={delay + 0.3} cx={cx} cy={cy} />
        </svg>
        {/* Avatar central */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold"
            style={{ background: `hsl(${hue},60%,48%)` }}>
            {initials}
          </div>
        </div>
      </div>

      {/* Nombre y rol */}
      <div className="text-center">
        <p className="text-[12px] font-semibold text-slate-800 truncate max-w-[120px]">{nombre.split(' ').slice(0,2).join(' ')}</p>
        <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{rol}</p>
      </div>

      {/* Leyenda rings */}
      <div className="w-full space-y-1.5">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#FF375F' }} />
          <span className="text-slate-500 flex-1 truncate">{ring1.label}</span>
          <span className="text-slate-800 font-semibold tabular-nums">{ring1.value}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#30D158' }} />
          <span className="text-slate-500 flex-1 truncate">{ring2.label}</span>
          <span className="text-slate-800 font-semibold tabular-nums">{ring2.value}</span>
        </div>
      </div>
    </motion.div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Panel ────────────────────────────────────────────────────────────────────
export const PanelEquipo: React.FC<{ data: any; isLoading: boolean }> = ({ data, isLoading }) => {

  const [activeRosterTab, setActiveRosterTab] = React.useState<'asesores'|'instaladores'|'conductores'>('asesores');

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-4 gap-3">{[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}</div>
        <div className="h-12 rounded-2xl bg-slate-200 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-52 rounded-2xl bg-slate-200" />)}
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center text-slate-400 text-sm">Sin datos disponibles</div>;

  const asesores      = data.ranking_asesores || [];
  const instaladores  = data.carga_instaladores || [];
  const conductores   = data.analisis_conductores || [];
  const maxRealAsesor = Math.max(...asesores.map((a: any) => a.real || 0), 1);
  const maxInstMes    = Math.max(...instaladores.map((i: any) => i.instalaciones_mes || 0), 1);
  const operHoy       = data.operaciones_hoy;
  const odpsHoy       = operHoy?.odps || {};
  const totalHoy      = Number(odpsHoy.pendientes || 0) + Number(odpsHoy.en_curso || 0) + Number(odpsHoy.completadas || 0);

  const rosterTabs = [
    { id: 'asesores',     label: `Asesores (${asesores.length})` },
    { id: 'instaladores', label: `Instaladores (${instaladores.length})` },
    { id: 'conductores',  label: `Conductores (${conductores.length})` },
  ] as const;

  return (
    <div className="space-y-3">

      {/* ── ROW 1: KPI chips ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Asesores Activos',  value: data.total_asesores ?? 0,            color: 'text-blue-600' },
          { label: 'Instaladores',       value: data.total_instaladores ?? 0,        color: 'text-emerald-600' },
          { label: 'ODPs / Asesor',      value: data.odps_por_asesor_promedio ?? 0,  color: 'text-slate-800' },
          { label: 'Eficiencia Taller',  value: `${data.eficiencia_taller_pct ?? 0}%`, color: (data.eficiencia_taller_pct ?? 0) >= 80 ? 'text-emerald-600' : 'text-amber-600' },
        ].map((item, i) => (
          <motion.div key={i} custom={i} variants={cardVar} initial="hidden" animate="visible"
            className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">{item.label}</p>
            <p className={`text-[28px] font-semibold leading-none tabular-nums ${item.color}`}>{item.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ── ROW 2: Tabs selector ──────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit border border-slate-200">
        {rosterTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveRosterTab(tab.id)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
              activeRosterTab === tab.id
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ROW 3: Activity Rings grid ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {activeRosterTab === 'asesores' && asesores.map((as: any, i: number) => (
          <ActivityRingCard key={as.asesor_id}
            nombre={as.nombre || 'Asesor'}
            rol="Asesor Comercial"
            ring1={{ pct: as.meta > 0 ? Math.min((as.real / as.meta) * 100, 100) : 0, label: 'Meta Financiera', value: fmtM(as.real) }}
            ring2={{ pct: (as.real / maxRealAsesor) * 100, label: 'vs Equipo', value: `#${i + 1}` }}
            delay={i * 0.08}
          />
        ))}
        {activeRosterTab === 'instaladores' && instaladores.map((inst: any, i: number) => (
          <ActivityRingCard key={inst.instalador_id}
            nombre={inst.nombre || 'Instalador'}
            rol="Instalador"
            ring1={{ pct: (inst.instalaciones_mes / maxInstMes) * 100, label: 'Instalaciones', value: String(inst.instalaciones_mes) }}
            ring2={{ pct: inst.instalaciones_mes > 0 ? (inst.con_evidencia / inst.instalaciones_mes) * 100 : 0, label: 'Con evidencia', value: `${inst.con_evidencia}/${inst.instalaciones_mes}` }}
            delay={i * 0.08}
          />
        ))}
        {activeRosterTab === 'conductores' && conductores.map((c: any, i: number) => {
          const rutas       = Number(c.rutas_mes) || 0;
          const completadas = Number(c.rutas_completadas) || 0;
          const compPct     = rutas > 0 ? (completadas / rutas) * 100 : 0;
          return (
            <ActivityRingCard key={c.conductor_id}
              nombre={c.nombre || 'Conductor'}
              rol="Conductor"
              ring1={{ pct: compPct, label: 'Rutas completadas', value: `${completadas}/${rutas}` }}
              ring2={{ pct: compPct, label: 'Duración prom.', value: fmtMin(c.avg_minutos_ruta != null ? Number(c.avg_minutos_ruta) : null) }}
              delay={i * 0.08}
            />
          );
        })}
        {((activeRosterTab === 'asesores' && asesores.length === 0) ||
          (activeRosterTab === 'instaladores' && instaladores.length === 0) ||
          (activeRosterTab === 'conductores' && conductores.length === 0)) && (
          <div className="col-span-full py-12 text-center text-slate-400 text-[12px]">
            No hay datos registrados
          </div>
        )}
      </div>

      {/* ── ROW 4: Operaciones Hoy ────────────────────────────────────── */}
      <motion.div custom={8} variants={cardVar} initial="hidden" animate="visible"
        className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-3.5 h-3.5 text-indigo-500" />
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Operaciones Hoy</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Pendientes',  value: Number(odpsHoy.pendientes ?? 0),  color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-100' },
            { label: 'En Curso',    value: Number(odpsHoy.en_curso ?? 0),    color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-100' },
            { label: 'Completadas', value: Number(odpsHoy.completadas ?? 0), color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          ].map((item, i) => (
            <div key={i} className={`${item.bg} rounded-xl p-3 text-center border`}>
              <p className={`text-[22px] font-bold tabular-nums ${item.color}`}>{item.value}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {totalHoy > 0 && (
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex mb-4">
            <motion.div className="bg-slate-300 h-full" initial={{ width: 0 }}
              animate={{ width: `${(Number(odpsHoy.pendientes || 0) / totalHoy) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.2 }} />
            <motion.div className="bg-amber-400 h-full" initial={{ width: 0 }}
              animate={{ width: `${(Number(odpsHoy.en_curso || 0) / totalHoy) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.3 }} />
            <motion.div className="bg-emerald-400 h-full" initial={{ width: 0 }}
              animate={{ width: `${(Number(odpsHoy.completadas || 0) / totalHoy) * 100}%` }}
              transition={{ duration: 0.8, delay: 0.4 }} />
          </div>
        )}

        {operHoy?.rutas_activas?.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">Rutas en Curso</p>
            {operHoy.rutas_activas.map((r: any, i: number) => (
              <motion.div key={i}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px]">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <Truck className="w-3.5 h-3.5 text-amber-500" />
                  {r.vehiculo} · {r.conductor}
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>{r.stops_completadas}/{r.stops_total}</span>
                  {r.stops_en_curso > 0 && (
                    <span className="text-amber-600 font-bold flex items-center gap-1">
                      <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>●</motion.span>
                      {r.stops_en_curso} instalando
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 text-center py-2">Sin rutas activas en este momento</p>
        )}

        {/* Rendimiento instaladores */}
        {(data.rendimiento_instaladores?.length > 0) && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold mb-3">Rendimiento Instaladores (mes)</p>
            <div className="space-y-2">
              {data.rendimiento_instaladores.map((inst: any, i: number) => {
                const min    = inst.avg_minutos_instalacion != null ? Number(inst.avg_minutos_instalacion) : null;
                const rapido = min != null && min < 60;
                return (
                  <div key={i} className="flex items-center gap-3 text-[11px]">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold shrink-0">{i + 1}</div>
                    <span className="flex-1 text-slate-600 truncate">{(inst.nombre || '').split(' ').slice(0,2).join(' ')}</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold tabular-nums">{inst.instalaciones_mes} ODPs</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-1 ${rapido ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      <Clock className="w-2.5 h-2.5" />{fmtMin(min)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

    </div>
  );
};

export default PanelEquipo;
