import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Filter, TrendingUp } from '../../../ui/icons';
import type { DatosPanelCotizaciones } from './tipos';
import { COLOR } from './tipos';
import { ejeX, ejeY, rejilla, cursorBarra, puntaVertical } from '../../../charts';
import { Bloque, BarraH, Leyenda, Vacio } from './Piezas';
import { fmtCompacto, fmtCOP, fmtEntero, fmtMes, fmtPct, mesesEntre } from './formato';

interface TooltipMes {
  active?: boolean;
  label?: string;
  payload?: Array<{ payload: { mes: string; cantidad: number; valor: number; aprobadas: number; valor_aprobado: number; conversion_pct: number } }>;
}

const TooltipMensual: React.FC<TooltipMes> = ({ active, payload }) => {
  const p = active && payload?.[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-float px-3 py-2 text-[12px] text-slate-900 min-w-[200px]">
      <p className="font-semibold mb-1 capitalize">{fmtMes(p.mes)}</p>
      <p className="flex justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR.cotizado }} />Cotizado</span><span className="font-semibold">{fmtCOP(p.valor)} · {p.cantidad}</span></p>
      <p className="flex justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: COLOR.aprobado }} />Aprobado</span><span className="font-semibold">{fmtCOP(p.valor_aprobado)} · {p.aprobadas}</span></p>
      <p className="flex justify-between gap-4 mt-1 pt-1 border-t border-slate-100"><span>Conversión</span><span className="font-semibold">{fmtPct(p.conversion_pct)}</span></p>
    </div>
  );
};

/** Bloque 2 — Embudo y conversión. */
export const BloqueEmbudo: React.FC<{ datos: DatosPanelCotizaciones }> = ({ datos }) => {
  const k = datos.kpis;
  const etapas = [
    { nombre: 'Creadas', n: k.cantidad, valor: k.valor, color: COLOR.cotizado, pct: null as number | null, base: '' },
    { nombre: 'Aprobadas', n: k.aprobadas, valor: k.valor_aprobado, color: COLOR.aprobado, pct: k.cantidad ? (k.aprobadas / k.cantidad) * 100 : 0, base: 'de las creadas' },
    { nombre: 'Con ODP', n: k.con_odp, valor: k.valor_con_odp, color: '#0b7a55', pct: k.aprobadas ? (k.con_odp / k.aprobadas) * 100 : 0, base: 'de las aprobadas' },
  ];

  const mensual = useMemo(() => {
    const porMes = new Map(datos.mensual.map((m) => [m.mes, m]));
    return mesesEntre(datos.filtros.desde, datos.filtros.hasta).map((mes) =>
      porMes.get(mes) ?? { mes, cantidad: 0, valor: 0, aprobadas: 0, valor_aprobado: 0, conversion_pct: 0 });
  }, [datos]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
      <Bloque className="xl:col-span-2" titulo="Embudo" icono={Filter}
        subtitulo="De cotización creada a pedido en producción. Las canceladas no cuentan.">
        {k.cantidad === 0 ? <Vacio texto="No hay cotizaciones con estos filtros." /> : (
          <div className="space-y-4">
            {etapas.map((e) => (
              <div key={e.nombre}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[13px] font-semibold text-slate-900">{e.nombre}</span>
                  <span className="text-[13px] text-slate-800 tabular-nums">
                    <span className="font-bold text-slate-900 text-[15px]">{fmtEntero(e.n)}</span>
                    <span className="mx-1.5 text-slate-400">·</span>{fmtCOP(e.valor)}
                  </span>
                </div>
                <BarraH valor={e.n} maximo={k.cantidad} color={e.color} alto={12} />
                {e.pct !== null && (
                  <p className="text-[12px] text-slate-700 mt-1"><span className="font-semibold text-slate-900">{fmtPct(e.pct)}</span> {e.base}</p>
                )}
              </div>
            ))}

            <div className="pt-4 border-t border-slate-100">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-900 mb-2">Valor cotizado vs. vendido</p>
              <div className="space-y-2">
                {[
                  { n: 'Cotizado', v: k.valor, c: COLOR.cotizado },
                  { n: 'Vendido (aprobado)', v: k.valor_aprobado, c: COLOR.aprobado },
                  { n: 'Perdido', v: k.valor_perdido, c: COLOR.alerta },
                ].map((x) => (
                  <div key={x.n} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
                    <span className="text-[12px] text-slate-800">{x.n}</span>
                    <BarraH valor={x.v} maximo={k.valor} color={x.c} />
                    <span className="text-[12px] font-semibold text-slate-900 tabular-nums w-[64px] text-right">{fmtCompacto(x.v)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Bloque>

      <Bloque className="xl:col-span-3" titulo="Evolución mensual" icono={TrendingUp}
        subtitulo="Valor cotizado y aprobado por mes de creación de la cotización."
        accion={<Leyenda series={[{ color: COLOR.cotizado, nombre: 'Cotizado' }, { color: COLOR.aprobado, nombre: 'Aprobado' }]} />}>
        {mensual.length === 0 ? <Vacio texto="Sin meses en el rango." /> : (
          <>
            <div className="h-[240px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mensual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
                  <CartesianGrid {...rejilla} />
                  <XAxis dataKey="mes" tickFormatter={fmtMes} {...ejeX} interval="preserveStartEnd" />
                  <YAxis tickFormatter={fmtCompacto} {...ejeY} width={56} />
                  <Tooltip content={<TooltipMensual />} cursor={cursorBarra} />
                  <Bar dataKey="valor" name="Cotizado" fill={COLOR.cotizado} radius={puntaVertical} maxBarSize={28} />
                  <Bar dataKey="valor_aprobado" name="Aprobado" fill={COLOR.aprobado} radius={puntaVertical} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Conversión por mes: en una fila aparte, no en un segundo eje. */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 mb-1.5">Conversión por mes (cantidad)</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {mensual.map((m) => (
                  <div key={m.mes} className="shrink-0 min-w-[58px] text-center rounded-lg bg-slate-50 ring-1 ring-slate-200 px-2 py-1">
                    <p className="text-[11px] text-slate-700 capitalize">{fmtMes(m.mes)}</p>
                    <p className={`text-[13px] font-bold tabular-nums ${m.cantidad === 0 ? 'text-slate-500' : 'text-slate-900'}`}>
                      {m.cantidad === 0 ? '—' : fmtPct(m.conversion_pct)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Bloque>
    </div>
  );
};

export default BloqueEmbudo;
