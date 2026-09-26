import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Settings, TrendingUp, TrendingDown, ClipboardList, Receipt, Wallet, AlertTriangle, Banknote } from '../../ui/icons';
import TarjetaKPI from '../TarjetaKPI';
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import DonutChart from '../charts/DonutChart';
import CarteraVencidaModal from './CarteraVencidaModal';
import PedidosFacturadosModal from './PedidosFacturadosModal';
import ODPFichaModal from '../../../features/odp/components/ODPFichaModal';
import { ESTADO_HEX as ESTADO_COLORS, ESTADO_LABELS_CORTOS as ESTADO_LABELS } from '../../../utils/estadosODP';
import { PeriodParams } from '../hooks/useDashboardData';

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

// Colores y nombres de estado: `utils/estadosODP` es la fuente única. En la leyenda del
// gráfico se usa la variante corta.
const CAJA_COLORS: Record<string, string> = {
  CANCELADO: '#16a34a', ABONADO: '#d97706', CREDITO_APROBADO: '#2563eb', PENDIENTE: '#dc2626'
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cardVar: any = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] } }),
};

// ─── Desglose base / IVA de las tarjetas de montos ────────────────────────────
const DesgloseIva: React.FC<{ base: string; iva: string; ivaClassName: string }> = ({ base, iva, ivaClassName }) => (
  <div className="mt-3 border-t border-slate-100 pt-2.5 space-y-1">
    <div className="flex justify-between gap-2 text-[12px]">
      <span className="text-slate-700">Base sin IVA</span>
      <span className="font-semibold text-slate-900 tabular-nums whitespace-nowrap">{base}</span>
    </div>
    <div className="flex justify-between gap-2 text-[12px]">
      <span className="text-slate-700">IVA (19%)</span>
      <span className={`font-semibold tabular-nums whitespace-nowrap ${ivaClassName}`}>{iva}</span>
    </div>
  </div>
);

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
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[12px] shadow-float min-w-[160px]">
      <p className="text-slate-900 mb-1.5 font-semibold text-[12px]">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-800">
            <span className="w-2 h-2 rounded-sm" style={{ background: p.color || p.stroke }} />
            {map[p.dataKey] || p.name}
          </span>
          <span className="font-semibold text-slate-900 tabular-nums">{p.dataKey === 'cantidad_odps' ? p.value : fmtM(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

export const PanelGeneral: React.FC<{ data: any; isLoading: boolean; period: PeriodParams }> = ({ data, isLoading, period }) => {
  const [criterioKPI, setCriterioKPI]     = useState<'creadas_facturadas' | 'facturadas_rango'>('creadas_facturadas');
  const rawConFacturaSeleccionado = criterioKPI === 'creadas_facturadas'
    ? (data?.facturado_con_factura || 0)
    : (data?.facturado_rango || 0);

  const odpsActivas          = useCountUp(data?.odps_activas || 0);
  const facturadoMes         = useCountUp(data?.facturado_mes || 0);
  const facturadoConFactura  = useCountUp(rawConFacturaSeleccionado);
  const carteraVenc          = useCountUp(data?.cartera_vencida_total || 0);
  const totalRecaudado       = useCountUp(data?.total_abonado || 0);
  const [openCartera, setOpenCartera]     = useState(false);
  const [openFacturados, setOpenFacturados] = useState<'creadas_facturadas' | 'facturadas_rango' | null>(null);
  const [fichaId, setFichaId]             = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[0,1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-200" />)}
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

  if (!data) return <div className="p-10 text-center text-slate-700 text-sm">Sin datos disponibles</div>;

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
  // Las OAs (Órdenes Azules) no llevan IVA: se descuenta su porción antes del desglose
  const facturadoOA      = data?.facturado_mes_oa || 0;
  const recaudadoOA      = data?.total_abonado_oa || 0;
  const facturadoConIva  = rawFacturado - facturadoOA;
  const facturadoIva     = facturadoConIva - facturadoConIva / (1 + IVA_RATE);
  const facturadoBase    = rawFacturado - facturadoIva;
  const recaudadoConIva  = rawRecaudado - recaudadoOA;
  const recaudadoIva     = recaudadoConIva - recaudadoConIva / (1 + IVA_RATE);
  const recaudadoBase    = rawRecaudado - recaudadoIva;

  // Lógica de desglose para la tarjeta de Pedidos Cobrados, según el criterio seleccionado.
  // Mide abono (caja), no valor_total (devengo) — decisión de negocio 2026-09-15.
  const rawConFactura      = rawConFacturaSeleccionado;
  const conFacturaOA       = criterioKPI === 'creadas_facturadas'
    ? (data?.facturado_con_factura_oa || 0)
    : (data?.facturado_rango_oa || 0);
  const conFacturaConIva   = rawConFactura - conFacturaOA;
  const conFacturaIva      = conFacturaConIva - conFacturaConIva / (1 + IVA_RATE);
  const conFacturaBase     = rawConFactura - conFacturaIva;
  const conFacturaPct      = rawFacturado > 0 ? Math.min((rawConFactura / rawFacturado) * 100, 100) : 0;
  const conFacturaSubtitulo = criterioKPI === 'creadas_facturadas'
    ? 'Órdenes creadas en el período que ya cuentan con factura electrónica, con su abono real'
    : 'Órdenes facturadas dentro del período, sin importar cuándo fueron creadas, con su abono real';

  return (
    <div className="space-y-3">

      {/* ── ROW 1: 5 KPI cards — anatomía común en TarjetaKPI ─────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">

        <TarjetaKPI indice={0} rotulo="ODPs Activas" icono={ClipboardList} tono="slate"
          cifra={odpsActivas}
          descripcion="Órdenes del período actualmente en curso, sin incluir entregadas">
          {data.odps_activas_delta_pct !== undefined && (
            <div className={`flex items-center gap-1 mt-3 text-[12px] font-semibold ${data.odps_activas_delta_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {data.odps_activas_delta_pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {data.odps_activas_delta_pct > 0 ? '+' : ''}{data.odps_activas_delta_pct}% vs periodo anterior
            </div>
          )}
        </TarjetaKPI>

        <TarjetaKPI indice={1} rotulo="Monto de Pedidos Ingresados" icono={Receipt} tono="indigo"
          cifra={fmtM(facturadoMes)}
          descripcion="Suma del valor total de todas las ODPs ingresadas en el período, incluye IVA"
          accion={
            <Link to="/configuracion" className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </Link>
          }
          barra={
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
              <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-b-2xl"
                initial={{ width: 0 }}
                animate={{ width: `${metaPct}%` }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} />
            </div>
          }>
          <DesgloseIva base={fmtM(facturadoBase)} iva={fmtM(facturadoIva)} ivaClassName="text-indigo-700" />
          {data.meta_facturacion_actual > 0 && (
            <p className="text-[12px] text-slate-700 mt-2">Meta: <span className="font-semibold text-slate-900 tabular-nums">{fmtM(data.meta_facturacion_actual)}</span></p>
          )}
        </TarjetaKPI>

        <TarjetaKPI indice={2} rotulo="Pedidos Cobrados" icono={Wallet} tono="indigo"
          cifra={fmtM(facturadoConFactura)} cifraClassName="text-indigo-700"
          descripcion={conFacturaSubtitulo}
          barra={
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
              <motion.div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-b-2xl"
                initial={{ width: 0 }}
                animate={{ width: `${conFacturaPct}%` }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} />
            </div>
          }>
          <div className="flex flex-wrap gap-1 mt-2.5">
            <button type="button"
              onClick={() => setCriterioKPI('creadas_facturadas')}
              className={`text-[11px] leading-tight px-2 py-1 rounded-full font-semibold transition-colors ${criterioKPI === 'creadas_facturadas' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
              Creadas y facturadas
            </button>
            <button type="button"
              onClick={() => setCriterioKPI('facturadas_rango')}
              className={`text-[11px] leading-tight px-2 py-1 rounded-full font-semibold transition-colors ${criterioKPI === 'facturadas_rango' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
              Todas facturadas (rango)
            </button>
          </div>
          <DesgloseIva base={fmtM(conFacturaBase)} iva={fmtM(conFacturaIva)} ivaClassName="text-indigo-700" />
          {rawFacturado > 0 && (
            <p className="text-[12px] text-slate-700 mt-2">
              {Math.round((rawConFactura / rawFacturado) * 100)}% del ingresado
            </p>
          )}
          <button type="button"
            className="self-start text-[12px] font-semibold text-indigo-700 hover:text-indigo-900 mt-1.5 mb-1"
            onClick={() => setOpenFacturados(criterioKPI)}>
            Ver detalle →
          </button>
        </TarjetaKPI>

        <TarjetaKPI indice={3} rotulo="Cartera Vencida" icono={AlertTriangle} tono="rose"
          cifra={fmtM(carteraVenc)} cifraClassName="text-rose-700"
          descripcion="Créditos sin pago que superaron el umbral de días configurado"
          onClick={() => setOpenCartera(true)}>
          <p className="text-[12px] text-slate-800 mt-3 pt-2.5 border-t border-slate-100">
            {data.cartera_vencida_clientes > 0
              ? `${data.cartera_vencida_clientes} cliente${data.cartera_vencida_clientes > 1 ? 's' : ''} con crédito vencido`
              : 'Sin créditos vencidos'}
          </p>
          <p className="text-[12px] font-semibold text-rose-700 mt-1.5">Ver detalle →</p>
        </TarjetaKPI>

        <TarjetaKPI indice={4} rotulo="Total Recaudado" icono={Banknote} tono="emerald"
          cifra={fmtM(totalRecaudado)} cifraClassName="text-emerald-700"
          descripcion="Abonos efectivamente cobrados en el período"
          barra={
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-100">
              <motion.div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-b-2xl"
                initial={{ width: 0 }}
                animate={{ width: data.facturado_mes > 0 ? `${Math.min((rawRecaudado / data.facturado_mes) * 100, 100)}%` : '0%' }}
                transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.4 }} />
            </div>
          }>
          <DesgloseIva base={fmtM(recaudadoBase)} iva={fmtM(recaudadoIva)} ivaClassName="text-emerald-700" />
          {data.facturado_mes > 0 && (
            <p className="text-[12px] text-slate-700 mt-2">
              {Math.round((rawRecaudado / data.facturado_mes) * 100)}% del facturado
            </p>
          )}
        </TarjetaKPI>
      </div>

      {/* ── ROW 2: Gráfico mensual + Caja ──────────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">
        <motion.div custom={4} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-card p-5">
          <p className="text-[15px] font-semibold text-slate-900">Estadísticas por mes</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-2">Evolución mensual de abonos, pendientes, créditos y número de ODPs en el período</p>

          {/* Leyenda manual */}
          <div className="flex flex-wrap gap-3 mb-3">
            {[
              { color: '#22c55e', label: 'Abono' },
              { color: '#f97316', label: 'Pendiente' },
              { color: '#6f7a8c', label: 'Cancelado' },
              { color: '#6366f1', label: 'Créditos' },
              { color: '#0ea5e9', label: 'ODPs (eje →)', dashed: true },
            ].map(item => (
              <span key={item.label} className="flex items-center gap-1.5 text-[12px] text-slate-800">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.color, opacity: item.dashed ? 0.8 : 1 }} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="h-[200px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[12px] text-slate-700">
                Sin datos para el periodo seleccionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 4, right: 36, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <XAxis dataKey="mes" tick={{ fill: '#3f4858', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left"  tick={{ fill: '#3f4858', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={52} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: '#0369a1', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <CartesianGrid vertical={false} stroke="#e1e5eb" strokeDasharray="3 3" />
                  <Tooltip content={<MonthlyTooltip />} cursor={{ fill: '#f6f7f9' }} />
                  <Bar yAxisId="left" dataKey="total_abono"     name="Abono"     fill="#22c55e" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="total_pendiente" name="Pendiente" fill="#f97316" radius={[3,3,0,0]} />
                  <Bar yAxisId="left" dataKey="total_cancelado" name="Cancelado" fill="#6f7a8c" radius={[3,3,0,0]} />
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
          className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-2xl shadow-card p-5 flex flex-col">
          <p className="text-[15px] font-semibold text-slate-900">Estado de Caja</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-4">Distribución de las ODPs del período según su estado de pago</p>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-[120px] h-[120px]">
              <DonutChart data={cajaDist} nameKey="name" dataKey="pct"
                colors={cajaDist.map((c: any) => CAJA_COLORS[c.name] || '#555f71')} />
            </div>
            <div className="w-full space-y-2">
              {cajaDist.map((c: any) => (
                <div key={c.name} className="flex items-center text-[12px]">
                  <span className="w-2 h-2 rounded-sm shrink-0 mr-2" style={{ background: CAJA_COLORS[c.name] || '#555f71' }} />
                  <span className="text-slate-800 capitalize flex-1">{c.name.replace(/_/g, ' ')}</span>
                  <span className="text-slate-900 font-semibold tabular-nums">{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── ROW 3: Embudo + ODPs por estado ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">
        <motion.div custom={6} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-card p-5">
          <p className="text-[15px] font-semibold text-slate-900">Embudo de conversión — periodo seleccionado</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-4">Ciclo de vida de las ODPs desde su creación hasta la entrega; el % es relativo al total de creadas</p>
          <div className="space-y-2.5">
            {embudoLabels.map((lbl, i) => {
              const val      = embudoVals[i];
              const isSub    = embudoSub[i];
              const wPct     = Math.max((val / maxEmbudo) * 100, 3);
              const pctFirst = embudoVals[0] > 0 ? Math.round((val / embudoVals[0]) * 100) : 0;
              return (
                <div key={lbl} className={`flex items-center gap-3 text-[12px] ${isSub ? 'pl-4 opacity-90' : ''}`}>
                  <span className={`shrink-0 w-[105px] ${isSub ? 'text-slate-700 italic' : 'text-slate-800'}`}>{lbl}</span>
                  <div className="flex-1 h-6 relative">
                    <motion.div
                      className={`h-full flex items-center px-2.5 text-white text-[12px] font-semibold absolute left-0 top-0 ${isSub ? 'rounded-md' : 'rounded-lg'}`}
                      style={{ background: embudoColors[i], minWidth: 32, opacity: isSub ? 0.85 : 1 }}
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: `${wPct}%`, opacity: isSub ? 0.85 : 1 }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.09 }}>
                      {val}
                    </motion.div>
                  </div>
                  <span className="text-slate-800 font-semibold tabular-nums w-10 text-right shrink-0">{pctFirst}%</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div custom={7} variants={cardVar} initial="hidden" animate="visible"
          className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-card p-5">
          <p className="text-[15px] font-semibold text-slate-900">ODPs por estado actual</p>
          <p className="text-[12px] text-slate-700 leading-snug mt-1 mb-4">Snapshot en tiempo real de todas las ODPs — sin filtro de período</p>
          <div className="space-y-2">
            {estadosData
              .sort((a: any, b: any) => b.cantidad - a.cantidad)
              .map((s: any, i: number) => {
                const barW = Math.max((s.cantidad / totalEstados) * 90, 2);
                return (
                  <div key={s.estado} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ESTADO_COLORS[s.estado] || '#555f71' }} />
                    <span className="text-slate-800 flex-1 truncate">{ESTADO_LABELS[s.estado] || s.estado}</span>
                    <div className="flex items-center gap-1.5">
                      <motion.div className="h-1.5 rounded-full"
                        style={{ background: ESTADO_COLORS[s.estado] || '#555f71', opacity: 0.6 }}
                        initial={{ width: 0 }}
                        animate={{ width: `${barW}px` }}
                        transition={{ duration: 0.7, ease: [0.22,1,0.36,1], delay: 0.1 + i * 0.04 }} />
                      <span className="text-slate-900 font-semibold tabular-nums w-6 text-right">{s.cantidad}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>
      </div>

      {openCartera && <CarteraVencidaModal onClose={() => setOpenCartera(false)} onVerODP={setFichaId} />}
      {openFacturados && (
        <PedidosFacturadosModal
          modo={openFacturados}
          period={period}
          onClose={() => setOpenFacturados(null)}
          onVerODP={setFichaId}
        />
      )}
      {fichaId && <ODPFichaModal odpId={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  );
};

export default PanelGeneral;
