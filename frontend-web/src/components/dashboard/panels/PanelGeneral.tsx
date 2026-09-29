import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ClipboardList, Receipt, Wallet, AlertTriangle, Banknote } from '../../ui/icons';
import TarjetaKPI from '../TarjetaKPI';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import {
  ChartCard, TablaDatos, ChartTooltip, Leyenda, BarraApilada, BarraMagnitud, Medidor,
  CATEGORICA, CAJA_HEX, ESTADO, tonoEtapa, ejeX, ejeY, rejilla, cursorBarra, cursorLinea, puntaVertical,
} from '../../charts';
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

// Colores y nombres de estado: `utils/estadosODP` es la fuente única. En la leyenda del
// gráfico se usa la variante corta. El semáforo de caja vive en el kit (`CAJA_HEX`).
const CAJA_LABELS: Record<string, string> = {
  CANCELADO: 'Cancelado', ABONADO: 'Abonado', CREDITO_APROBADO: 'Crédito aprobado', PENDIENTE: 'Pendiente',
};

// Series del gráfico mensual de montos: son medidas distintas (no estados), así que usan la
// paleta categórica en su orden validado.
const SERIES_MES = [
  { key: 'total_abono',     label: 'Abonos',               color: CATEGORICA[0] },
  { key: 'total_pendiente', label: 'Pendiente por cobrar', color: CATEGORICA[1] },
  { key: 'total_cancelado', label: 'Pagado total',         color: CATEGORICA[2] },
  { key: 'total_credito',   label: 'A crédito',            color: CATEGORICA[3] },
] as const;
const NOMBRES_MES: Record<string, string> = Object.fromEntries(
  [...SERIES_MES.map(s => [s.key, s.label]), ['cantidad_odps', 'ODPs creadas']]
);

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

export const PanelGeneral: React.FC<{ data: any; isLoading: boolean; period: PeriodParams }> = ({ data, isLoading, period }) => {
  const [criterioKPI, setCriterioKPI]     = useState<'creadas_facturadas' | 'facturadas_rango'>('creadas_facturadas');
  const rawConFacturaSeleccionado = criterioKPI === 'creadas_facturadas'
    ? (data?.facturado_con_factura || 0)
    : (data?.facturado_rango || 0);

  // Cifras directas: antes contaban desde 0 en cada actualización y el dato "desaparecía".
  const odpsActivas          = data?.odps_activas || 0;
  const facturadoMes         = data?.facturado_mes || 0;
  const facturadoConFactura  = rawConFacturaSeleccionado;
  const carteraVenc          = data?.cartera_vencida_total || 0;
  const totalRecaudado       = data?.total_abonado || 0;
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
  const embudoLabels = ['Creadas', 'En espera', 'En producción', 'Listas con pago', 'Listas, falta pago', 'Completadas'];
  // Etapas principales en la rampa azul (más oscuro = entrada del embudo). Las dos sub-etapas
  // "listas" son un estado de pago y llevan el semáforo, siempre junto a su rótulo.
  const embudoColors = [tonoEtapa(0, 4), tonoEtapa(1, 4), tonoEtapa(2, 4), ESTADO.bien, ESTADO.atencion, tonoEtapa(3, 4)];
  const embudoSub    = [false, false, false, true, true, false];
  const completadas  = (data.embudo_conversion?.instaladas || 0) + (data.embudo_conversion?.entregadas || 0);
  const embudoVals   = [...embudoKeys.slice(0, 5).map(k => data.embudo_conversion?.[k] || 0), completadas];
  const maxEmbudo    = Math.max(...embudoVals, 1);
  const estadosData  = (data.odps_por_estado || []).filter((s: any) => s.cantidad > 0);
  const totalEstados = estadosData.reduce((acc: number, s: any) => acc + s.cantidad, 0);
  const maxEstado    = estadosData.reduce((m: number, s: any) => Math.max(m, s.cantidad), 1);
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
          delta={data.odps_activas_delta_pct !== undefined ? {
            texto: `${data.odps_activas_delta_pct > 0 ? '+' : ''}${data.odps_activas_delta_pct}%`,
            positivo: data.odps_activas_delta_pct >= 0,
          } : null}
          descripcion="Órdenes del período actualmente en curso, sin incluir entregadas" />

        <TarjetaKPI indice={1} rotulo="Monto de Pedidos Ingresados" icono={Receipt} tono="indigo"
          cifra={fmtM(facturadoMes)}
          descripcion="Suma del valor total de todas las ODPs ingresadas en el período, incluye IVA"
          accion={
            <Link to="/configuracion" className="p-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
              <Settings className="w-3.5 h-3.5" />
            </Link>
          }>
          <DesgloseIva base={fmtM(facturadoBase)} iva={fmtM(facturadoIva)} ivaClassName="text-indigo-700" />
          {data.meta_facturacion_actual > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-slate-700">Meta <span className="font-semibold text-slate-900 tabular-nums">{fmtM(data.meta_facturacion_actual)}</span></span>
                <span className="font-semibold text-slate-900 tabular-nums">{Math.round(metaPct)}%</span>
              </div>
              <Medidor pct={metaPct} alto={6} />
            </div>
          )}
        </TarjetaKPI>

        <TarjetaKPI indice={2} rotulo="Pedidos Cobrados" icono={Wallet} tono="indigo"
          cifra={fmtM(facturadoConFactura)} cifraClassName="text-indigo-700"
          descripcion={conFacturaSubtitulo}>
          <div className="flex flex-wrap gap-1 mt-2.5">
            <button type="button"
              onClick={() => setCriterioKPI('creadas_facturadas')}
              className={`text-[11px] leading-tight px-2 py-1 rounded-full font-semibold transition-colors ${criterioKPI === 'creadas_facturadas' ? 'bg-templex-600 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
              Creadas y facturadas
            </button>
            <button type="button"
              onClick={() => setCriterioKPI('facturadas_rango')}
              className={`text-[11px] leading-tight px-2 py-1 rounded-full font-semibold transition-colors ${criterioKPI === 'facturadas_rango' ? 'bg-templex-600 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
              Todas facturadas (rango)
            </button>
          </div>
          <DesgloseIva base={fmtM(conFacturaBase)} iva={fmtM(conFacturaIva)} ivaClassName="text-indigo-700" />
          {rawFacturado > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-slate-700">Del monto ingresado</span>
                <span className="font-semibold text-slate-900 tabular-nums">{Math.round(conFacturaPct)}%</span>
              </div>
              <Medidor pct={conFacturaPct} alto={6} />
            </div>
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
          descripcion="Abonos efectivamente cobrados en el período">
          <DesgloseIva base={fmtM(recaudadoBase)} iva={fmtM(recaudadoIva)} ivaClassName="text-emerald-700" />
          {data.facturado_mes > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[12px] mb-1">
                <span className="text-slate-700">Del monto ingresado</span>
                <span className="font-semibold text-slate-900 tabular-nums">{Math.round((rawRecaudado / data.facturado_mes) * 100)}%</span>
              </div>
              <Medidor pct={(rawRecaudado / data.facturado_mes) * 100} alto={6} color={ESTADO.bien} />
            </div>
          )}
        </TarjetaKPI>
      </div>

      {/* ── ROW 2: Evolución mensual (montos y cantidad, en gráficas separadas) + Caja ── */}
      {/* Antes era un solo gráfico con dos ejes Y (pesos y cantidad de ODPs): cruzar dos escalas
          inventa relaciones que los datos no tienen. Ahora son dos gráficas con el mismo eje de
          meses, una debajo de la otra, que se leen alineadas. */}
      <div className="grid grid-cols-12 gap-3">
        <ChartCard indice={5} className="col-span-12 lg:col-span-8"
          titulo="Evolución mensual"
          descripcion="Montos de las ODPs del período por mes (arriba) y cuántas ODPs se crearon (abajo)"
          tabla={chartData.length > 0 ? (
            <TablaDatos
              columnas={[{ label: 'Mes' }, ...SERIES_MES.map(s => ({ label: s.label, alinear: 'der' as const })), { label: 'ODPs', alinear: 'der' }]}
              filas={chartData.map((m: any) => [m.mes, ...SERIES_MES.map(s => fmtM(m[s.key] || 0)), m.cantidad_odps ?? 0])}
            />
          ) : undefined}>
          {chartData.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-[12px] text-slate-700">
              Sin datos para el período seleccionado
            </div>
          ) : (
            <>
              <Leyenda className="mb-2" items={SERIES_MES.map(s => ({ label: s.label, color: s.color }))} />
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
                    <CartesianGrid {...rejilla} />
                    <XAxis dataKey="mes" {...ejeX} />
                    <YAxis {...ejeY} tickFormatter={fmtM} width={56} />
                    <Tooltip cursor={cursorBarra} content={<ChartTooltip nombres={NOMBRES_MES} formato={(v) => fmtM(v)} />} />
                    {SERIES_MES.map(s => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={puntaVertical} maxBarSize={22} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[12px] font-semibold text-slate-900 mt-4 mb-1">ODPs creadas por mes</p>
              <div className="h-[96px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...rejilla} />
                    <XAxis dataKey="mes" {...ejeX} />
                    <YAxis {...ejeY} width={56} allowDecimals={false} />
                    <Tooltip cursor={cursorLinea} content={<ChartTooltip nombres={NOMBRES_MES} />} />
                    <Line type="monotone" dataKey="cantidad_odps" name="ODPs creadas" stroke={CATEGORICA[0]} strokeWidth={2}
                      dot={{ r: 3, fill: CATEGORICA[0], stroke: '#ffffff', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: CATEGORICA[0], stroke: '#ffffff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard indice={6} className="col-span-12 lg:col-span-4"
          titulo="Estado de caja"
          descripcion="Reparto de las ODPs del período según su estado de pago">
          {cajaDist.length === 0 ? (
            <p className="text-[12px] text-slate-700">Sin ODPs en el período</p>
          ) : (
            <BarraApilada alto={14} mostrarPct={false}
              segmentos={cajaDist.map((c: any) => ({
                clave: c.name,
                label: CAJA_LABELS[c.name] || c.name.replace(/_/g, ' '),
                valor: c.pct,
                cifra: `${c.pct}%`,
                color: CAJA_HEX[c.name] || '#555f71',
              }))} />
          )}
        </ChartCard>
      </div>

      {/* ── ROW 3: Embudo + ODPs por estado ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-3">
        <ChartCard indice={7} className="col-span-12 lg:col-span-7"
          titulo="Embudo de conversión"
          descripcion="Ciclo de vida de las ODPs del período, de la creación a la entrega. El % es sobre el total de creadas"
          tabla={
            <TablaDatos columnas={[{ label: 'Etapa' }, { label: 'ODPs', alinear: 'der' }, { label: '% de creadas', alinear: 'der' }]}
              filas={embudoLabels.map((lbl, i) => [lbl, embudoVals[i], `${embudoVals[0] > 0 ? Math.round((embudoVals[i] / embudoVals[0]) * 100) : 0}%`])} />
          }>
          <div className="space-y-2.5">
            {embudoLabels.map((lbl, i) => (
              <BarraMagnitud key={lbl} indice={i} anchoLabel="w-[128px]"
                label={lbl} sub={embudoSub[i]}
                valor={embudoVals[i]} max={maxEmbudo} color={embudoColors[i]}
                cifraSecundaria={`${embudoVals[0] > 0 ? Math.round((embudoVals[i] / embudoVals[0]) * 100) : 0}%`} />
            ))}
          </div>
        </ChartCard>

        <ChartCard indice={8} className="col-span-12 lg:col-span-5"
          titulo="ODPs por estado actual"
          descripcion="Foto en tiempo real de todas las ODPs, sin filtro de período">
          <div className="space-y-2">
            {[...estadosData]
              .sort((a: any, b: any) => b.cantidad - a.cantidad)
              .map((s: any, i: number) => (
                <BarraMagnitud key={s.estado} indice={i} alto="fina" anchoLabel="w-[120px]"
                  label={ESTADO_LABELS[s.estado] || s.estado}
                  valor={s.cantidad} max={maxEstado}
                  color={ESTADO_COLORS[s.estado] || '#555f71'}
                  cifraSecundaria={`${totalEstados > 0 ? Math.round((s.cantidad / totalEstados) * 100) : 0}%`} />
              ))}
          </div>
        </ChartCard>
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
