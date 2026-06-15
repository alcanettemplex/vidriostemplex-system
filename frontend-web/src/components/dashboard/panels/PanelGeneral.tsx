import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Settings, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import DonutChart from '../charts/DonutChart';
import CarteraVencidaModal from './CarteraVencidaModal';
import ODPFichaModal from '../../../features/odp/components/ODPFichaModal';

const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const useCountUp = (target: number, duration = 1400) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p     = Math.min((now - start) / duration, 1);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
};

const ESTADO_COLORS: Record<string, string> = {
  EN_ESPERA: '#94a3b8', VISITA_TECNICA: '#c084fc', MEDICION: '#818cf8',
  ALUMINIO_CORTADO: '#06b6d4', VIDRIO_RECIBIDO: '#3b82f6',
  ACCESORIOS_SEPARADOS: '#8b5cf6', LISTO_INSTALAR: '#f97316', PROGRAMADA: '#14b8a6',
  INSTALADA: '#22c55e', ENTREGADA: '#10b981', PAUSADA: '#e11d48',
};
const ESTADO_LABELS: Record<string, string> = {
  EN_ESPERA: 'En Espera', VISITA_TECNICA: 'Visita Técnica', MEDICION: 'En producción',
  ALUMINIO_CORTADO: 'Al. Cortado', VIDRIO_RECIBIDO: 'Vidrio',
  ACCESORIOS_SEPARADOS: 'Accesorios', LISTO_INSTALAR: 'A Instalar', PROGRAMADA: 'Programada',
  INSTALADA: 'Instalada', ENTREGADA: 'Entregada', PAUSADA: 'Pausada',
};
const CAJA_COLORS: Record<string, string> = {
  CANCELADO: '#16a34a', ABONADO: '#d97706', CREDITO_APROBADO: '#2563eb', PENDIENTE: '#dc2626'
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Tooltip del gráfico mensual ──────────────────────────────────────────────
const MonthlyTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const map: Record<string, string> = {
    total_abono:     'Abono',
    total_pendiente: 'Pendiente',
    total_cancelado: 'Cancelado',
    total_credito:   'Créditos',
    cantidad_odps:   'ODPs',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] shadow-lg min-w-[140px]">
      <p className="text-slate-400 mb-1.5 font-semibold uppercase tracking-widest text-[9px]">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-semibold flex justify-between gap-3" style={{ color: p.color || p.stroke }}>
          <span>{map[p.dataKey] || p.name}</span>
          <span>{p.dataKey === 'cantidad_odps' ? p.value : fmtM(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

export const PanelGeneral: React.FC<{ data: any; isLoading: boolean }> = ({ data, isLoading }) => {
  const odpsActivas    = useCountUp(data?.odps_activas || 0);
  const facturadoMes   = useCountUp(data?.facturado_mes || 0);
  const carteraVenc    = useCountUp(data?.cartera_vencida_total || 0);
  const totalRecaudado = useCountUp(data?.total_abonado || 0);
  const [openCartera, setOpenCartera] = useState(false);
  const [fichaId, setFichaId]         = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-200" />)}
        </div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-8 h-64 rounded-2xl bg-slate-200" />
          <div className="col-span-12 lg:col-span-4 h-64 rounded-2xl bg-slate-200" />
        </div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 lg:col-span-7 h-44 rounded-2xl bg-slate-200" />
          <div className="col-span-12 lg:col-span-5 h-44 rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-10 text-center text-slate-400 text-sm">Sin datos disponibles</div>;

  const chartData    = data.estadisticas_mensuales || [];
  const cajaDist     = (data.estado_caja_distribucion || []).map((c: any) => ({ name: c.estado, pct: c.pct }));
  const embudoKeys   = ['creadas', 'en_espera', 'en_produccion', 'listas_con_pago', 'listas_sin_pago', 'completadas'];
  const embudoLabels = ['Creadas', 'En Espera', 'En producción', '↳ Listas (con pago)', '↳ Listas (falta pago)', 'Completadas'];
  const embudoColors = ['#6d28d9','#f59e0b','#4f46e5','#22c55e','#f97316','#059669'];
  const embudoSub    = [false, false, false, true, true, false];
  const completadas  = (data.embudo_conversion?.instaladas || 0) + (data.embudo_conversion?.entregadas || 0);
  const embudoVals   = [...embudoKeys.slice(0, 5).map(k => data.embudo_conversion?.[k] || 0), completadas];
  const maxEmbudo    = Math.max(...embudoVals, 1);
  const estadosData  = (data.odps_por_estado || []).filter((s: any) => s.cantidad > 0);
  const totalEstados = estadosData.reduce((acc: number, s: any) => acc + s.cantidad, 0);
  const metaPct      = data.meta_facturacion_actual > 0
    ? Math.min((data.facturado_mes / data.meta_facturacion_actual) * 100, 100) : 0;

  const IVA_RATE      = 0.19;
  const rawFacturado  = data?.facturado_mes   || 0;
  const rawRecaudado  = data?.total_abonado   || 0;
  const facturadoBase = rawFacturado / (1 + IVA_RATE);
  const facturadoIva  = rawFacturado - facturadoBase;
  const recaudadoBase = rawRecaudado / (1 + IVA_RATE);
  const recaudadoIva  = rawRecaudado - recaudadoBase;

  return (
    <div className="space-y-3">

      {/* ── ROW 1: 4 KPI cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        <motion.div custom={0} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl p-5"
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99,102,241,0.12)' }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ODPs Activas</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-2">Órdenes del período actualmente en curso, sin incluir entregadas</p>
          <p className="text-[44px] font-semibold text-slate-800 leading-none tabular-nums">{odpsActivas}</p>
          {data.odps_activas_delta_pct !== undefined && (
            <div className={`flex items-center gap-1 mt-2 text-[11px] font-medium ${data.odps_activas_delta_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {data.odps_activas_delta_pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {data.odps_activas_delta_pct > 0 ? '+' : ''}{data.odps_activas_delta_pct}% vs periodo anterior
            </div>
          )}
        </motion.div>

        <motion.div custom={1} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden"
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(99,102,241,0.12)' }}>
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Monto de Pedidos Ingresados</p>
            <Link to="/configuracion" className="text-slate-300 hover:text-indigo-500 transition-colors shrink-0">
              <Settings className="w-3.5 h-3.5" />
            </Link>
          </div>
          <p className="text-[9px] text-slate-400 leading-tight mb-2">Suma del valor total de todas las ODPs ingresadas en el período, incluye IVA</p>
          <p className="text-[34px] font-semibold text-slate-800 leading-none tabular-nums">{fmtM(facturadoMes)}</p>
          <div className="mt-2.5 mb-2 border-t border-slate-100 pt-2 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Base sin IVA</span>
              <span className="font-semibold text-slate-600 tabular-nums">{fmtM(facturadoBase)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">IVA (19%)</span>
              <span className="font-semibold text-indigo-500 tabular-nums">{fmtM(facturadoIva)}</span>
            </div>
          </div>
          {data.meta_facturacion_actual > 0 && (
            <p className="text-[10px] text-slate-400">Meta: {fmtM(data.meta_facturacion_actual)}</p>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
            <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-b-2xl"
              initial={{ width: 0 }}
              animate={{ width: `${metaPct}%` }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} />
          </div>
        </motion.div>

        <motion.div custom={2} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl p-5 cursor-pointer"
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(220,38,38,0.15)' }}
          onClick={() => setOpenCartera(true)}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Cartera Vencida</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-2">Créditos sin pago que superaron el umbral de días configurado</p>
          <p className="text-[38px] font-semibold text-rose-600 leading-none tabular-nums">{fmtM(carteraVenc)}</p>
          <p className="text-[11px] text-slate-400 mt-2">
            {data.cartera_vencida_clientes > 0
              ? `${data.cartera_vencida_clientes} cliente${data.cartera_vencida_clientes > 1 ? 's' : ''} con crédito vencido`
              : 'Sin créditos vencidos'}
          </p>
          <p className="text-[10px] text-rose-400 mt-1">Ver detalle →</p>
        </motion.div>

        <motion.div custom={3} variants={cardVar} initial="hidden" animate="visible"
          className="bg-white border border-slate-200 rounded-2xl p-5 relative overflow-hidden"
          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(16,185,129,0.1)' }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Total Recaudado</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-2">Abonos efectivamente cobrados en el período</p>
          <p className="text-[34px] font-semibold text-emerald-600 leading-none tabular-nums">{fmtM(totalRecaudado)}</p>
          <div className="mt-2.5 mb-2 border-t border-slate-100 pt-2 space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Base sin IVA</span>
              <span className="font-semibold text-slate-600 tabular-nums">{fmtM(recaudadoBase)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">IVA (19%)</span>
              <span className="font-semibold text-emerald-500 tabular-nums">{fmtM(recaudadoIva)}</span>
            </div>
          </div>
          {data.facturado_mes > 0 && (
            <p className="text-[10px] text-slate-400">
              {Math.round((rawRecaudado / data.facturado_mes) * 100)}% del facturado
            </p>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
            <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-b-2xl"
              initial={{ width: 0 }}
              animate={{ width: data.facturado_mes > 0 ? `${Math.min((rawRecaudado / data.facturado_mes) * 100, 100)}%` : '0%' }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} />
          </div>
        </motion.div>
      </div>

      {/* ── ROW 2: Gráfico mensual + Caja ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">
        <motion.div custom={4} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Estadísticas por mes</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-2">Evolución mensual de abonos, pendientes, créditos y número de ODPs en el período</p>

          {/* Leyenda manual */}
          <div className="flex flex-wrap gap-3 mb-3">
            {[
              { color: '#22c55e', label: 'Abono' },
              { color: '#f97316', label: 'Pendiente' },
              { color: '#94a3b8', label: 'Cancelado' },
              { color: '#6366f1', label: 'Créditos' },
              { color: '#0ea5e9', label: 'ODPs (eje →)', dashed: true },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.color, opacity: item.dashed ? 0.8 : 1 }} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="h-[200px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-slate-400">
                Sin datos para el periodo seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left"  tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={52} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#0ea5e9', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<MonthlyTooltip />} />
                  <Bar yAxisId="left" dataKey="total_abono"     name="Abono"     fill="#22c55e" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="total_pendiente" name="Pendiente" fill="#f97316" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="total_cancelado" name="Cancelado" fill="#94a3b8" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="total_credito"   name="Créditos"  fill="#6366f1" radius={[3,3,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cantidad_odps" name="ODPs"
                    stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#0284c7', strokeWidth: 0 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div custom={5} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Estado de Caja</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-4">Distribución de las ODPs del período según su estado de pago</p>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-[120px] h-[120px]">
              <DonutChart data={cajaDist} nameKey="name" dataKey="pct"
                colors={cajaDist.map((c: any) => CAJA_COLORS[c.name] || '#64748b')} />
            </div>
            <div className="w-full space-y-2">
              {cajaDist.map((c: any) => (
                <div key={c.name} className="flex items-center text-[11px]">
                  <span className="w-2 h-2 rounded-sm shrink-0 mr-2" style={{ background: CAJA_COLORS[c.name] || '#64748b' }} />
                  <span className="text-slate-500 capitalize flex-1">{c.name.replace(/_/g, ' ')}</span>
                  <span className="text-slate-800 font-semibold">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── ROW 3: Embudo + ODPs por estado ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">
        <motion.div custom={6} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Embudo de conversión — periodo seleccionado</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-4">Ciclo de vida de las ODPs desde su creación hasta la entrega; el % es relativo al total de creadas</p>
          <div className="space-y-2.5">
            {embudoLabels.map((lbl, i) => {
              const val      = embudoVals[i];
              const isSub    = embudoSub[i];
              const wPct     = Math.max((val / maxEmbudo) * 100, 3);
              const pctFirst = embudoVals[0] > 0 ? Math.round((val / embudoVals[0]) * 100) : 0;
              return (
                <div key={lbl} className={`flex items-center gap-3 text-[11px] ${isSub ? 'pl-4 opacity-90' : ''}`}>
                  <span className={`shrink-0 w-[105px] ${isSub ? 'text-slate-400 italic' : 'text-slate-400'}`}>{lbl}</span>
                  <div className="flex-1 h-6 relative">
                    <motion.div
                      className={`h-full flex items-center px-2.5 text-white text-[11px] font-semibold absolute left-0 top-0 ${isSub ? 'rounded-md' : 'rounded-lg'}`}
                      style={{ background: embudoColors[i], minWidth: 32, opacity: isSub ? 0.85 : 1 }}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: `${wPct}%`, opacity: isSub ? 0.85 : 1 }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.09 }}>
                      {val}
                    </motion.div>
                  </div>
                  <span className="text-slate-400 w-8 text-right shrink-0">{pctFirst}%</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div custom={7} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">ODPs por estado actual</p>
          <p className="text-[9px] text-slate-400 leading-tight mt-0.5 mb-4">Snapshot en tiempo real de todas las ODPs — sin filtro de período</p>
          <div className="space-y-2">
            {estadosData
              .sort((a: any, b: any) => b.cantidad - a.cantidad)
              .map((s: any, i: number) => {
                const barW = Math.max((s.cantidad / totalEstados) * 90, 2);
                return (
                  <div key={s.estado} className="flex items-center gap-2.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ESTADO_COLORS[s.estado] || '#64748b' }} />
                    <span className="text-slate-500 flex-1 truncate">{ESTADO_LABELS[s.estado] || s.estado}</span>
                    <div className="flex items-center gap-1.5">
                      <motion.div className="h-1.5 rounded-full"
                        style={{ background: ESTADO_COLORS[s.estado] || '#64748b', opacity: 0.6 }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barW}px` }}
                        transition={{ duration: 0.7, ease: [0.22,1,0.36,1], delay: 0.1 + i * 0.04 }} />
                      <span className="text-slate-800 font-semibold w-5 text-right">{s.cantidad}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      </div>

      {openCartera && <CarteraVencidaModal onClose={() => setOpenCartera(false)} onVerODP={setFichaId} />}
      {fichaId && <ODPFichaModal odpId={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  );
};

export default PanelGeneral;
