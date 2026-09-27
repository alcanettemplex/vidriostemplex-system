import React from 'react';
import { Trophy, User } from '../../../ui/icons';
import type { DatosPanelCotizaciones } from './tipos';
import { COLOR } from './tipos';
import { Bloque, BarraH, Vacio } from './Piezas';
import { fmtCompacto, fmtCOP, fmtEntero, fmtPct } from './formato';

const TH = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-900 whitespace-nowrap';
const TD = 'px-3 py-2.5 text-[13px] text-slate-800 tabular-nums whitespace-nowrap';

/** Bloque 3 — Ranking por asesor (para un asesor: su propia fila). */
export const BloqueAsesores: React.FC<{ datos: DatosPanelCotizaciones }> = ({ datos }) => {
  const filas = datos.por_asesor;
  const propio = datos.alcance.nivel === 'propias';
  const maxAprobado = Math.max(0, ...filas.map((f) => f.valor_aprobado));
  return (
    <Bloque titulo={propio ? 'Tu desempeño' : 'Ranking por asesor'} icono={propio ? User : Trophy}
      subtitulo={propio
        ? 'Tus cotizaciones en el rango. Solo ves las que tienes asignadas.'
        : 'Ordenado por valor aprobado. Conversión = aprobadas ÷ cotizadas.'}>
      {filas.length === 0 ? <Vacio texto="No hay cotizaciones con estos filtros." /> : (
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-y border-slate-200">
              <tr>
                <th className={`${TH} text-left w-10`}>#</th>
                <th className={`${TH} text-left`}>Asesor</th>
                <th className={`${TH} text-right`}>Cotizadas</th>
                <th className={`${TH} text-right`}>Valor cotizado</th>
                <th className={`${TH} text-right`}>Aprobadas</th>
                <th className={`${TH} text-left w-[200px]`}>Valor aprobado</th>
                <th className={`${TH} text-right`}>Conversión</th>
                <th className={`${TH} text-right`}>Ticket prom.</th>
                <th className={`${TH} text-right`}>Pend. / Perd.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f, i) => (
                <tr key={`${f.asesor_id ?? 'x'}-${f.asesor}`} className="hover:bg-slate-50/70">
                  <td className={`${TD} font-semibold text-slate-900`}>{i + 1}</td>
                  <td className={`${TD} font-semibold text-slate-900 max-w-[220px] truncate`} title={f.asesor}>{f.asesor}</td>
                  <td className={`${TD} text-right`}>{fmtEntero(f.cantidad)}</td>
                  <td className={`${TD} text-right`}>{fmtCOP(f.valor)}</td>
                  <td className={`${TD} text-right font-semibold text-emerald-700`}>{fmtEntero(f.aprobadas)}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[70px]"><BarraH valor={f.valor_aprobado} maximo={maxAprobado} color={COLOR.aprobado} /></div>
                      <span className="font-semibold text-slate-900 w-[64px] text-right">{fmtCompacto(f.valor_aprobado)}</span>
                    </div>
                  </td>
                  <td className={`${TD} text-right`}>
                    <span className="font-semibold text-slate-900">{fmtPct(f.conversion_pct)}</span>
                    <span className="block text-[11px] text-slate-700">{fmtPct(f.conversion_valor_pct)} en valor</span>
                  </td>
                  <td className={`${TD} text-right`}>{f.aprobadas ? fmtCompacto(f.ticket_aprobado) : '—'}</td>
                  <td className={`${TD} text-right`}>
                    <span className="text-amber-700 font-semibold">{f.pendientes}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-rose-700 font-semibold">{f.perdidas}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Bloque>
  );
};

export default BloqueAsesores;
