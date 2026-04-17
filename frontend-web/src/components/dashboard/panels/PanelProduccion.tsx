import React from 'react';
import { motion } from 'framer-motion';

const fmtD = (n: number) => `${Number(n).toFixed(1)}d`;

const ESTADO_LABEL: Record<string, string> = {
  EN_ESPERA: 'En Espera', VISITA_TECNICA: 'Visita', MEDICION: 'Medición',
  PEDIDO_PROVEEDOR: 'Pedido Prov.', ALUMINIO_CORTADO: 'Al. Cortado',
  VIDRIO_RECIBIDO: 'Vidrio Recibido', ACCESORIOS_SEPARADOS: 'Accesorios Sep.',
  LISTO_INSTALAR: 'Listo Instalar', PROGRAMADA: 'Programada',
  INSTALADA: 'Instalada', ENTREGADA: 'Entregada', PAUSADA: 'Pausada',
};

const SERVICIO_COLORS = ['#3b82f6','#f59e0b','#10b981','#ef4444','#8b5cf6','#64748b','#06b6d4'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Chip KPI ─────────────────────────────────────────────────────────────────
const Chip: React.FC<{ label: string; value: string | number; accent?: boolean; pulse?: boolean; index: number }> =
  ({ label, value, accent, pulse, index }) => (
    <motion.div custom={index} variants={cardVar} initial="hidden" animate="visible"
      className={`rounded-2xl p-4 border ${accent
        ? 'bg-rose-50 border-rose-200'
        : 'bg-white border-slate-200'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-slate-400">{label}</p>
      <div className="flex items-center gap-2">
        {pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" /></span>}
        <p className={`text-[26px] font-semibold leading-none tabular-nums ${accent ? 'text-rose-600' : 'text-slate-800'}`}>{value}</p>
      </div>
    </motion.div>
  );

export const PanelProduccion: React.FC<{ data: any; isLoading: boolean; onViewOdp?: (id: number) => void }> =
  ({ data, isLoading, onViewOdp }) => {

    if (isLoading) {
      return (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-20 rounded-2xl bg-slate-200" />)}
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

    const etapas    = (data.tiempo_por_etapa || []).filter((e: any) => Number(e.dias_promedio) > 0);
    const maxDias   = Math.max(...etapas.map((e: any) => Number(e.dias_promedio)), 1);
    const bottleneck = etapas.reduce(
      (prev: any, curr: any) => Number(curr.dias_promedio) > Number(prev?.dias_promedio || 0) ? curr : prev,
      null
    );
    const servicios = data.servicios_distribucion || [];

    const isAlert = (data.odps_vencen_esta_semana || 0) > 5;

    return (
      <div className="space-y-3">

        {/* ── ROW 1: 6 KPI chips ─────────────────────────────────────── */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <Chip index={0} label="En Taller" value={data.odps_en_taller ?? 0} />
          <Chip index={1} label="Vencen Semana" value={data.odps_vencen_esta_semana ?? 0} accent={isAlert} pulse={isAlert} />
          <Chip index={2} label="Ciclo Promedio" value={fmtD(data.tiempo_ciclo_promedio_dias ?? 0)} />
          <Chip index={3} label="Listas s/Prog." value={data.odps_listas_sin_programar ?? 0} />
          <Chip index={4} label="Pausadas" value={data.odps_pausadas ?? 0} accent={(data.odps_pausadas || 0) > 0} />
          <Chip index={5} label="NC Abiertas" value={data.no_conformidades_abiertas ?? 0} accent={(data.no_conformidades_abiertas || 0) > 0} />
        </div>

        {/* ── ROW 2: Bottleneck chart + Servicios ─────────────────────── */}
        <div className="grid grid-cols-12 gap-3">

          {/* Barras horizontales por etapa */}
          <motion.div custom={6} variants={cardVar} initial="hidden" animate="visible"
            className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Tiempo Promedio por Etapa</p>
              {bottleneck && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
                  <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>⚠</motion.span>
                  Cuello de botella: {String(bottleneck.etapa).replace(/_/g, ' ')} ({fmtD(bottleneck.dias_promedio)})
                </div>
              )}
            </div>
            <div className="space-y-3">
              {etapas
                .slice()
                .sort((a: any, b: any) => Number(b.dias_promedio) - Number(a.dias_promedio))
                .map((e: any, i: number) => {
                  const dias    = Number(e.dias_promedio);
                  const wPct    = Math.max((dias / maxDias) * 100, 3);
                  const isBot   = bottleneck && e.etapa === bottleneck.etapa;
                  const barColor = isBot ? '#ef4444' : dias > (data.meta_ciclo_dias / 2) ? '#f59e0b' : '#4f46e5';
                  return (
                    <div key={e.etapa} className="flex items-center gap-3 text-[11px]">
                      <span className="w-[130px] shrink-0 text-slate-500 truncate">{ESTADO_LABEL[e.etapa] || String(e.etapa).replace(/_/g, ' ')}</span>
                      <div className="flex-1 relative h-7 bg-slate-50 rounded-lg overflow-hidden">
                        <motion.div className="absolute inset-y-0 left-0 rounded-lg flex items-center px-2.5"
                          style={{ background: barColor + '22', border: `1px solid ${barColor}33` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${wPct}%` }}
                          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.07 }}>
                          <motion.div className="absolute inset-y-1 left-1 rounded"
                            style={{ background: barColor, right: 'auto' }}
                            initial={{ width: 0 }}
                            animate={{ width: `${wPct * 0.6}%` }}
                            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.07 }} />
                        </motion.div>
                        <div className="absolute inset-0 flex items-center">
                          <motion.div
                            className="h-5 rounded-md flex items-center px-3 text-white text-[11px] font-bold"
                            style={{ background: barColor }}
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: `${wPct}%`, opacity: 1 }}
                            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.07 }}>
                            {dias > 0.5 ? fmtD(dias) : ''}
                          </motion.div>
                        </div>
                      </div>
                      <span className="text-slate-400 font-semibold w-10 text-right shrink-0 tabular-nums">{fmtD(dias)}</span>
                    </div>
                  );
                })}
              {etapas.length === 0 && (
                <p className="text-slate-400 text-[12px] text-center py-6">Sin datos de historial suficientes</p>
              )}
            </div>
          </motion.div>

          {/* ODPs por servicio */}
          <motion.div custom={7} variants={cardVar} initial="hidden" animate="visible"
            className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4">ODPs por Servicio</p>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {servicios
                .slice()
                .sort((a: any, b: any) => b.cantidad - a.cantidad)
                .map((s: any, i: number) => {
                  const maxServ = Math.max(...servicios.map((sv: any) => sv.cantidad), 1);
                  const pct     = (s.cantidad / maxServ) * 100;
                  return (
                    <div key={i} className="flex items-center gap-2.5 text-[11px]">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }} />
                      <span className="text-slate-600 flex-1 truncate uppercase text-[10px] tracking-wide">{s.tipo_servicio || 'Otros'}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }} />
                        </div>
                        <span className="text-slate-800 font-semibold w-5 text-right tabular-nums">{s.cantidad}</span>
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
