import React from 'react';
import { motion } from 'framer-motion';

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: 'En Espera', VISITA_TECNICA: 'Visita', MEDICION: 'Medición',
  PEDIDO_PROVEEDOR: 'Pedido Prov.', ALUMINIO_CORTADO: 'Al. Cortado',
  VIDRIO_RECIBIDO: 'Vidrio Recibido', ACCESORIOS_SEPARADOS: 'Accesorios Sep.',
  LISTO_INSTALAR: 'Listo Instalar', PROGRAMADA: 'Programada',
  INSTALADA: 'Instalada', ENTREGADA: 'Entregada', PAUSADA: 'Pausada',
};

const SERVICIO_COLORS = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#64748b','#06b6d4'];

// Renombres y fusiones para el dashboard (sin tocar la BD)
const SERVICIO_LABEL: Record<string, string> = {
  'venta/suministro':   'Venta en la mano',
  'venta / suministro': 'Venta en la mano',
  'venta':              'Venta en la mano',
};
const MERGE_INTO_MANTENIMIENTO = new Set(['otro', 'otros']);

function processServicios(raw: any[]) {
  const merged: Record<string, number> = {};
  raw.forEach(s => {
    const key    = (s.tipo_servicio || 'otros').toLowerCase().trim();
    const target = MERGE_INTO_MANTENIMIENTO.has(key) ? 'mantenimiento' : key;
    merged[target] = (merged[target] || 0) + Number(s.cantidad);
  });
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  return Object.entries(merged)
    .map(([key, cantidad]) => ({
      label:    SERVICIO_LABEL[key] || (key.charAt(0).toUpperCase() + key.slice(1)),
      cantidad,
      pct:      total > 0 ? Math.round((cantidad / total) * 100) : 0,
    }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Chip KPI ─────────────────────────────────────────────────────────────────
const Chip: React.FC<{ label: string; value: string | number; desc: string; accent?: boolean; pulse?: boolean; index: number }> =
  ({ label, value, desc, accent, pulse, index }) => (
    <motion.div custom={index} variants={cardVar} initial="hidden" animate="visible"
      className={`rounded-2xl p-4 border flex flex-col justify-between ${accent
        ? 'bg-rose-50 border-rose-200'
        : 'bg-white border-slate-200'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="flex items-center gap-2 my-1">
        {pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" /></span>}
        <p className={`text-[24px] font-semibold leading-none tabular-nums ${accent ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
      </div>
      <p className="text-[9px] text-slate-400 leading-tight">{desc}</p>
    </motion.div>
  );

export const PanelProduccion: React.FC<{ data: any; isLoading: boolean; onViewOdp?: (id: number) => void }> =
  ({ data, isLoading, onViewOdp }) => {

    if (isLoading) {
      return (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200" />)}
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 lg:col-span-8 h-72 rounded-2xl bg-slate-200" />
            <div className="col-span-12 lg:col-span-4 h-72 rounded-2xl bg-slate-200" />
          </div>
          <div className="h-56 rounded-2xl bg-slate-200" />
        </div>
      );
    }

    if (!data) return <div className="p-10 text-center text-slate-400 text-sm">Sin datos disponibles</div>;

    const checks   = (data.checks_progreso || []).slice().sort((a: any, b: any) => a.pct - b.pct);
    const servicios = processServicios(data.servicios_distribucion || []);
    const totalServicios = servicios.reduce((a: number, s: any) => a + s.cantidad, 0);

    const isAlert = (data.odps_vencen_esta_semana || 0) > 5;

    return (
      <div className="space-y-3">

        {/* ── ROW 1: 6 KPI chips ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <Chip index={0} label="En Taller" value={data.odps_en_taller ?? 0}
            desc="ODPs en fabricación actualmente" />
          <Chip index={1} label="Vencen esta semana" value={data.odps_vencen_esta_semana ?? 0}
            desc="Fecha de entrega en los próximos 7 días" accent={isAlert} pulse={isAlert} />
          <Chip index={2} label="Ciclo Promedio" value={`${Math.round(data.tiempo_ciclo_promedio_dias ?? 0)} días`}
            desc="Promedio creación → entrega en el período" />
          <Chip index={3} label="Listas s/Prog." value={data.odps_listas_sin_programar ?? 0}
            desc="Listas para instalar sin ruta asignada" />
          <Chip index={4} label="Pausadas" value={data.odps_pausadas ?? 0}
            desc="Producción detenida temporalmente" accent={(data.odps_pausadas || 0) > 0} />
          <Chip index={5} label="NC Abiertas" value={data.no_conformidades_abiertas ?? 0}
            desc="No conformidades sin resolver" accent={(data.no_conformidades_abiertas || 0) > 0} />
        </div>

        {/* ── ROW 2: Avance checks + Servicios ───────────────────────── */}
        <div className="grid grid-cols-12 gap-3">

          {/* Avance de checks de producción */}
          <motion.div custom={6} variants={cardVar} initial="hidden" animate="visible"
            className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5">
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Avance de Checks de Producción</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Cuántas de las <span className="font-semibold text-slate-600">{checks[0]?.total ?? 0} ODPs activas</span> completaron cada etapa de taller — ordenadas de menor a mayor avance
              </p>
            </div>
            <div className="space-y-2.5">
              {checks.map((c: any, i: number) => {
                const color = c.pct >= 67 ? '#10b981' : c.pct >= 34 ? '#f59e0b' : '#ef4444';
                const wPct  = Math.max(c.pct, c.total > 0 ? 1.5 : 0);
                return (
                  <div key={c.campo} className="flex items-center gap-3 text-[11px]">
                    <span className="w-[118px] shrink-0 text-slate-600 truncate">{c.label}</span>
                    <div className="flex-1 h-5 bg-slate-50 rounded-lg overflow-hidden relative">
                      <motion.div className="absolute inset-y-0 left-0 rounded-lg"
                        style={{ background: color + '33' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${wPct}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.05 + i * 0.06 }} />
                      <motion.div className="absolute inset-y-1 left-1 rounded"
                        style={{ background: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(wPct - 3, 0)}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.06 }} />
                    </div>
                    <span className="shrink-0 tabular-nums text-slate-400 w-[80px] text-right text-[10px]">
                      {c.completadas}/{c.total}&nbsp;
                      <span style={{ color }} className="font-bold">({c.pct}%)</span>
                    </span>
                  </div>
                );
              })}
              {checks.length === 0 && (
                <p className="text-slate-400 text-[12px] text-center py-6">Sin ODPs activas en producción</p>
              )}
            </div>
          </motion.div>

          {/* ODPs por servicio */}
          <motion.div custom={7} variants={cardVar} initial="hidden" animate="visible"
            className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
            <div className="mb-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">ODPs por Servicio</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Distribución del período ({totalServicios} total)</p>
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto">
              {servicios.map((s: any, i: number) => {
                const maxCant = servicios[0]?.cantidad || 1;
                const barPct  = (s.cantidad / maxCant) * 100;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }} />
                        <span className="text-slate-600 truncate font-medium">{s.label}</span>
                      </div>
                      <span className="shrink-0 ml-2 tabular-nums text-slate-700 font-semibold">
                        {s.cantidad} <span className="text-slate-400 font-normal">({s.pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full"
                        style={{ background: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.7, delay: 0.1 + i * 0.06 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* ── ROW 3: ODPs más antiguas + Próximas a vencer ────────────── */}
        <div className="grid grid-cols-12 gap-3">
          {(data.odps_mas_antiguas?.length > 0) && (
            <motion.div custom={8} variants={cardVar} initial="hidden" animate="visible"
              className="col-span-12 lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">ODPs más Antiguas en Producción</p>
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] text-slate-400 uppercase tracking-wider">
                    <th className="py-2 px-4 font-semibold"># ODP</th>
                    <th className="py-2 px-4 font-semibold">Cliente</th>
                    <th className="py-2 px-4 font-semibold">Estado</th>
                    <th className="py-2 px-4 font-semibold text-center">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.odps_mas_antiguas.map((odp: any, i: number) => (
                    <motion.tr key={i}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      onClick={() => onViewOdp?.(odp.odp_id)}
                      className={`text-[11px] cursor-pointer hover:bg-slate-50 transition-colors ${odp.dias_en_sistema > 30 ? 'bg-rose-50/40' : ''}`}>
                      <td className="py-2 px-4 font-semibold text-slate-700">{odp.numero_odp}</td>
                      <td className="py-2 px-4 text-slate-600 max-w-[100px] truncate">{odp.cliente}</td>
                      <td className="py-2 px-4">
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-full uppercase tracking-wide">
                          {ESTADO_LABEL[odp.estado_produccion] || odp.estado_produccion}
                        </span>
                      </td>
                      <td className={`py-2 px-4 text-center font-bold tabular-nums ${odp.dias_en_sistema > 30 ? 'text-rose-600' : odp.dias_en_sistema > 15 ? 'text-amber-500' : 'text-slate-600'}`}>
                        {odp.dias_en_sistema}d
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          <motion.div custom={9} variants={cardVar} initial="hidden" animate="visible"
            className={`col-span-12 ${data.odps_mas_antiguas?.length > 0 ? 'lg:col-span-6' : ''} bg-white border border-slate-200 rounded-2xl overflow-hidden`}>
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Próximas a Vencer — 7 días</p>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-[9px] text-slate-400 uppercase tracking-wider">
                  <th className="py-2 px-4 font-semibold"># ODP</th>
                  <th className="py-2 px-4 font-semibold">Cliente</th>
                  <th className="py-2 px-4 font-semibold text-center">Faltan</th>
                  <th className="py-2 px-4 font-semibold text-center">Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data.odps_proximas_vencer || []).map((odp: any, i: number) => (
                  <motion.tr key={i}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    onClick={() => onViewOdp?.(odp.odp_id)}
                    className={`text-[11px] cursor-pointer hover:bg-slate-50 transition-colors ${odp.dias_restantes <= 2 ? 'bg-rose-50/50' : ''}`}>
                    <td className="py-2 px-4 font-semibold text-slate-700">{odp.numero_odp}</td>
                    <td className="py-2 px-4 text-slate-600 max-w-[100px] truncate">{odp.cliente}</td>
                    <td className={`py-2 px-4 text-center font-bold tabular-nums ${odp.dias_restantes <= 2 ? 'text-rose-600' : odp.dias_restantes <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}>
                      {odp.dias_restantes}d
                    </td>
                    <td className="py-2 px-4 text-center">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        odp.riesgo === 'alto' ? 'bg-rose-100 text-rose-700'
                          : odp.riesgo === 'medio' ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>{odp.riesgo}</span>
                    </td>
                  </motion.tr>
                ))}
                {(!data.odps_proximas_vencer || data.odps_proximas_vencer.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[11px] text-slate-400">
                      No hay ODPs próximas a vencer en los próximos 7 días
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </motion.div>
        </div>

      </div>
    );
  };

export default PanelProduccion;
