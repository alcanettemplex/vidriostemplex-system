import React from 'react';
import { Layers, Package, Tag } from '../../../ui/icons';
import type { DatosPanelCotizaciones } from './tipos';
import { COLOR, NOMBRE_MODULO, NOMBRE_SEGMENTO } from './tipos';
import { Bloque, BarraH, Leyenda, Vacio } from './Piezas';
import { fmtCompacto, fmtCOP, fmtEntero, fmtPct } from './formato';

/** "Sistema7038-Interior" → "7038 Interior" (igual que la descripción comercial). */
const nombreSistema = (s: string) =>
  s.replace(/^Sistema/, '').replace(/-/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();

/** Bloque 4 — Qué se cotiza y qué se vende: por producto, por sistema y por segmento. */
export const BloqueProductos: React.FC<{ datos: DatosPanelCotizaciones }> = ({ datos }) => {
  const productos = datos.por_producto;
  const sistemas = datos.por_sistema;
  const maxValor = Math.max(0, ...productos.map((p) => p.valor));
  const maxSistema = Math.max(0, ...sistemas.map((s) => s.valor));
  const segmentos = (['PA', 'PM', 'PB'] as const).map((s) => datos.por_segmento.find((x) => x.segmento === s) ?? null);
  const totalSeg = datos.por_segmento.reduce((a, s) => a + s.valor, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Bloque className="xl:col-span-2" titulo="Por producto" icono={Package}
        subtitulo="Productos de la opción elegida de cada cotización. Valor de los productos con IVA, sin cargos de obra ni descuento."
        accion={<Leyenda series={[{ color: COLOR.cotizado, nombre: 'Cotizado' }, { color: COLOR.aprobado, nombre: 'Aprobado' }]} />}>
        {productos.length === 0 ? <Vacio texto="No hay productos cotizados con estos filtros." /> : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <ul className="lg:col-span-3 space-y-3.5">
              {productos.map((p) => (
                <li key={p.modulo_id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-[13px] font-semibold text-slate-900">{NOMBRE_MODULO[p.modulo_id] ?? p.nombre}</span>
                    <span className="text-[12px] text-slate-700 tabular-nums">
                      {fmtEntero(p.piezas)} pz · {p.cotizaciones} cot. · <span className="font-semibold text-emerald-700">{fmtEntero(p.piezas_aprobadas)} pz vendidas</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[1fr_64px] items-center gap-2">
                      <BarraH valor={p.valor} maximo={maxValor} color={COLOR.cotizado} titulo={`Cotizado ${fmtCOP(p.valor)}`} />
                      <span className="text-[12px] font-semibold text-slate-900 text-right tabular-nums">{fmtCompacto(p.valor)}</span>
                    </div>
                    <div className="grid grid-cols-[1fr_64px] items-center gap-2">
                      <BarraH valor={p.valor_aprobado} maximo={maxValor} color={COLOR.aprobado} titulo={`Aprobado ${fmtCOP(p.valor_aprobado)}`} />
                      <span className="text-[12px] font-semibold text-emerald-700 text-right tabular-nums">{fmtCompacto(p.valor_aprobado)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="lg:col-span-2 lg:border-l lg:border-slate-100 lg:pl-5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-900 mb-2">
                <Layers className="w-3.5 h-3.5 text-slate-600" /> Sistemas más cotizados
              </p>
              {sistemas.length === 0 ? <p className="text-[12px] text-slate-700">Sin sistema registrado.</p> : (
                <ol className="space-y-2">
                  {sistemas.map((s, i) => (
                    <li key={`${s.modulo_id}-${s.sistema}`} className="text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-slate-900 font-semibold truncate" title={s.sistema}>
                          <span className="text-slate-500 mr-1 tabular-nums">{i + 1}.</span>{nombreSistema(s.sistema)}
                          <span className="font-normal text-slate-700"> · {NOMBRE_MODULO[s.modulo_id] ?? s.modulo_id}</span>
                        </span>
                        <span className="tabular-nums text-slate-900 font-semibold shrink-0">{fmtCompacto(s.valor)}</span>
                      </div>
                      <div className="mt-1"><BarraH valor={s.valor} maximo={maxSistema} color={COLOR.cotizado} alto={5} /></div>
                      <p className="text-[11px] text-slate-700 mt-0.5">{fmtEntero(s.piezas)} pz cotizadas · {fmtEntero(s.piezas_aprobadas)} vendidas</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Por segmento" icono={Tag} subtitulo="Lista de precios con que se cotizó: PA, PM o PB.">
        <div className="space-y-3">
          {segmentos.map((s, i) => {
            const codigo = (['PA', 'PM', 'PB'] as const)[i];
            const part = s && totalSeg ? (s.valor / totalSeg) * 100 : 0;
            return (
              <div key={codigo} className={`rounded-xl ring-1 p-3 ${s ? 'ring-slate-200 bg-white' : 'ring-slate-100 bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-900">
                    <span className="inline-block min-w-[28px] text-center rounded-md bg-templex-50 text-templex-700 ring-1 ring-templex-100 px-1 mr-1.5 text-[12px]">{codigo}</span>
                    {NOMBRE_SEGMENTO[codigo]}
                  </span>
                  <span className="text-[12px] text-slate-700 tabular-nums">{fmtPct(part)} del valor</span>
                </div>
                {s ? (
                  <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                    <div><p className="text-[11px] text-slate-700">Cotizadas</p><p className="text-[15px] font-bold text-slate-900 tabular-nums">{fmtEntero(s.cantidad)}</p><p className="text-[11px] text-slate-700 tabular-nums">{fmtCompacto(s.valor)}</p></div>
                    <div><p className="text-[11px] text-slate-700">Aprobadas</p><p className="text-[15px] font-bold text-emerald-700 tabular-nums">{fmtEntero(s.aprobadas)}</p><p className="text-[11px] text-slate-700 tabular-nums">{fmtCompacto(s.valor_aprobado)}</p></div>
                    <div><p className="text-[11px] text-slate-700">Conversión</p><p className="text-[15px] font-bold text-slate-900 tabular-nums">{fmtPct(s.conversion_pct)}</p><p className="text-[11px] text-slate-700 tabular-nums">{fmtPct(s.conversion_valor_pct)} en $</p></div>
                  </div>
                ) : <p className="text-[12px] text-slate-700 mt-1.5">Sin cotizaciones en este segmento.</p>}
              </div>
            );
          })}
        </div>
      </Bloque>
    </div>
  );
};

export default BloqueProductos;
