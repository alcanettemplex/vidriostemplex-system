import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const useCountUp = (target: number, duration = 1400) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
};

// ─── Gauge circular ───────────────────────────────────────────────────────────
const GaugeMeta: React.FC<{ real: number; meta: number }> = ({ real, meta }) => {
  const pct       = meta > 0 ? Math.min((real / meta) * 100, 100) : 0;
  const SIZE      = 220;
  const cx        = SIZE / 2; const cy = SIZE / 2;
  const R         = 84; const SW = 13;
  const GAP       = 52;
  const TOTAL_DEG = 360 - GAP;
  const C         = (TOTAL_DEG / 360) * 2 * Math.PI * R;
  const fullC     = 2 * Math.PI * R;
  const ROT       = 90 + GAP / 2;
  const filled    = (pct / 100) * C;
  const empty     = C - filled;
  const color     = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const animPct   = useCountUp(Math.round(pct));

  return (
    <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="overflow-visible">
        <circle cx={cx} cy={cy} r={R} fill="none"
          stroke="rgba(0,0,0,0.08)" strokeWidth={SW}
          strokeDasharray={`${C} ${fullC - C}`}
          transform={`rotate(${ROT} ${cx} ${cy})`} strokeLinecap="round" />
        <motion.circle cx={cx} cy={cy} r={R} fill="none"
          stroke={color} strokeWidth={SW + 10} opacity={0.1}
          strokeDasharray={`${C} ${fullC - C}`}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: empty }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          transform={`rotate(${ROT} ${cx} ${cy})`} strokeLinecap="round" />
        <motion.circle cx={cx} cy={cy} r={R} fill="none"
          stroke={color} strokeWidth={SW}
          strokeDasharray={`${C} ${fullC - C}`}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: empty }}
          transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          transform={`rotate(${ROT} ${cx} ${cy})`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.p className="text-[46px] font-semibold leading-none tabular-nums" style={{ color }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}>
          {animPct}%
        </motion.p>
        <p className="text-[10px] text-slate-400 mt-1 tracking-wide">de la meta</p>
        <p className="text-[14px] text-slate-800 font-semibold mt-1 tabular-nums">{fmtM(real)}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">meta: {fmtM(meta)}</p>
      </div>
    </div>
  );
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar: React.FC<{ nombre: string; size?: number }> = ({ nombre, size = 28 }) => {
  const initials = (nombre || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (nombre || '').split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue},60%,48%)` }}>
      {initials}
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Panel ────────────────────────────────────────────────────────────────────
export const PanelVentas: React.FC<{ data: any; isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-5 h-80 rounded-2xl bg-slate-200" />
          <div className="col-span-12 lg:col-span-7 h-80 rounded-2xl bg-slate-200" />
        </div>
        <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}</div>
        <div className="h-56 rounded-2xl bg-slate-200" />
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center text-slate-400 text-sm">Sin datos disponibles</div>;

  const totalFacturado = data.total_facturado_mes || 0;
  const meta           = data.meta_facturacion_actual || 120_000_000;
  const asesores       = (data.meta_vs_real_asesores || []).slice().sort((a: any, b: any) => b.real - a.real);
  const cartera        = data.cartera_vencida_detalle || [];
  const carteraCritica = data.cartera_por_antiguedad?.find((c: any) => c.rango === '>60 días')?.total || 0;

  return (
    <div className="space-y-3">

      {/* ── ROW 1: Gauge + Ranking ───────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">

        {/* Gauge */}
        <motion.div custom={0} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center gap-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest self-start">Meta mensual de facturación</p>
          <GaugeMeta real={totalFacturado} meta={meta} />
          <div className="grid grid-cols-2 gap-2 w-full">
            {[
              { label: 'Recaudado',    value: fmtM(data.total_abonado || 0),    color: 'text-emerald-600' },
              { label: 'Pendiente',    value: fmtM(data.total_pendiente || 0),  color: 'text-rose-500' },
              { label: 'Ticket prom.', value: fmtM(data.ticket_promedio || 0),  color: 'text-slate-800' },
              { label: 'Sin facturar', value: `${data.odps_sin_facturar || 0} ODPs`, color: (data.odps_sin_facturar || 0) > 5 ? 'text-amber-500' : 'text-slate-800' },
            ].map((item, i) => (
              <div key={i} className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
                <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-[13px] font-semibold tabular-nums ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Ranking asesores */}
        <motion.div custom={1} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Ranking — meta vs real por asesor</p>
          {/* Header cols */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex-1" />
            <span className="text-[9px] text-slate-400 uppercase tracking-wider w-16 text-right">Meta</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider w-16 text-right">Facturado</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider w-16 text-right">Recaudado</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider w-9 text-right">%</span>
          </div>
          {asesores.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-[12px]">No hay usuarios registrados</div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {asesores.map((as: any, i: number) => {
                const pct       = as.meta > 0 ? Math.min((as.real / as.meta) * 100, 100) : 0;
                const pctLabel  = as.meta > 0 ? Math.round((as.real / as.meta) * 100) : 0;
                const color     = pct >= 100 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
                const pctRec    = as.meta > 0 ? Math.min((as.recaudado / as.meta) * 100, 100) : 0;
                const medals    = ['🥇','🥈','🥉'];
                const rolBadge: Record<string, { label: string; cls: string }> = {
                  asesor_comercial: { label: 'Asesor', cls: 'bg-indigo-50 text-indigo-600' },
                  gerencia:         { label: 'Gerencia', cls: 'bg-purple-50 text-purple-600' },
                  jefe_produccion:  { label: 'J. Prod.', cls: 'bg-amber-50 text-amber-600' },
                };
                const badge = rolBadge[as.rol] || { label: as.rol, cls: 'bg-slate-50 text-slate-500' };
                return (
                  <div key={as.asesor_id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] w-4 shrink-0">{medals[i] || `#${i+1}`}</span>
                      <Avatar nombre={as.nombre || 'U'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold text-slate-700 truncate">{as.nombre}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums w-16 text-right">{fmtM(as.meta)}</span>
                      <span className="text-[11px] font-semibold text-slate-700 tabular-nums w-16 text-right">{fmtM(as.real)}</span>
                      <span className="text-[11px] font-semibold text-emerald-600 tabular-nums w-16 text-right">{fmtM(as.recaudado)}</span>
                      <span className="text-[12px] font-bold tabular-nums w-9 text-right" style={{ color }}>{pctLabel}%</span>
                    </div>
                    {/* Barra facturado */}
                    <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden ml-6">
                      <motion.div className="absolute inset-y-0 left-0 rounded-full opacity-30"
                        style={{ background: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.2 + i * 0.08 }} />
                      <motion.div className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pctRec}%` }}
                        transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.3 + i * 0.08 }} />
                    </div>
                    <div className="flex items-center gap-3 ml-6 mt-0.5">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full opacity-40" style={{ background: color }} />
                        <span className="text-[9px] text-slate-400">Facturado</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span className="text-[9px] text-slate-400">Recaudado</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── ROW 2: Chips rápidos ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <motion.div custom={2} variants={cardVar} initial="hidden" animate="visible"
          className={`rounded-2xl p-4 border ${carteraCritica > 0 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${carteraCritica > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
            Cartera Crítica &gt;60 días
          </p>
          <p className={`text-[22px] font-semibold tabular-nums ${carteraCritica > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
            {carteraCritica > 0 ? fmtM(carteraCritica) : 'Sin cartera crítica'}
          </p>
        </motion.div>

        <motion.div custom={3} variants={cardVar} initial="hidden" animate="visible"
          className={`rounded-2xl p-4 border ${(data.odps_atrasadas || 0) > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${(data.odps_atrasadas || 0) > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            ODPs Vencidas sin Entregar
          </p>
          <p className={`text-[22px] font-semibold tabular-nums ${(data.odps_atrasadas || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {(data.odps_atrasadas || 0) > 0 ? `${data.odps_atrasadas} ODPs` : 'Sin atrasos'}
          </p>
        </motion.div>

        <motion.div custom={4} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Top Cliente</p>
          {data.top_clientes?.[0] ? (
            <>
              <p className="text-[14px] font-semibold text-slate-800 truncate">{data.top_clientes[0].nombre}</p>
              <p className="text-[12px] text-indigo-600 tabular-nums mt-0.5">{fmtM(data.top_clientes[0].total)} · {data.top_clientes[0].odps} pedidos</p>
            </>
          ) : <p className="text-slate-400 text-[12px]">Sin datos</p>}
        </motion.div>
      </div>

      {/* ── ROW 3: Cartera detalle ────────────────────────────────────── */}
      <motion.div custom={5} variants={cardVar} initial="hidden" animate="visible"
        className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Alertas de Cartera</p>
          <div className="flex gap-3">
            {(data.cartera_por_antiguedad || []).map((cpa: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full ${i===0?'bg-emerald-500':i===1?'bg-amber-500':'bg-rose-500'}`} />
                <span className="text-slate-400">{cpa.rango}</span>
                <span className="text-slate-600 font-medium tabular-nums">{fmtM(cpa.total)}</span>
              </div>
            ))}
          </div>
        </div>
        {cartera.length === 0 ? (
          <p className="text-center text-slate-400 py-6 text-[12px]">Sin alertas de cartera activas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[9px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-2 font-semibold">Cliente</th>
                  <th className="pb-2 font-semibold text-right">Monto</th>
                  <th className="pb-2 font-semibold text-center">Días</th>
                  <th className="pb-2 font-semibold text-center">Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cartera.map((cv: any, i: number) => (
                  <motion.tr key={i}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    className="text-[11px] hover:bg-slate-50 transition-colors">
                    <td className="py-2 pr-3 text-slate-600 max-w-[160px] truncate">{cv.nombre}</td>
                    <td className="py-2 pr-3 text-right text-slate-800 font-medium tabular-nums">{fmtM(cv.monto)}</td>
                    <td className="py-2 text-center text-rose-500 font-semibold">+{cv.dias_vencido}d</td>
                    <td className="py-2 text-center">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        cv.riesgo === 'critico' ? 'bg-rose-100 text-rose-600'
                          : cv.riesgo === 'alerta' ? 'bg-amber-100 text-amber-600'
                            : 'bg-emerald-100 text-emerald-600'
                      }`}>{cv.riesgo}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

    </div>
  );
};

export default PanelVentas;
