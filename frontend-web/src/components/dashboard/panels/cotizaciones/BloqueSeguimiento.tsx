import React, { useState } from 'react';
import { AlertTriangle, Clock, XCircle } from '../../../ui/icons';
import type { DatosPanelCotizaciones, PendienteValidez } from './tipos';
import { COLOR } from './tipos';
import { Bloque, BarraH, Vacio } from './Piezas';
import { fmtCompacto, fmtCOP, fmtEntero, fmtFecha } from './formato';

const TRAMOS = ['0 a 7 días', '8 a 15 días', '16 a 30 días', 'Más de 30 días'];
const TONO_TRAMO = ['#1f5ad6', '#5997fb', '#d97706', '#be123c'];

const PildoraValidez: React.FC<{ p: PendienteValidez }> = ({ p }) => {
  if (p.validez === 'VENCIDA') {
    const n = -p.habiles_restantes;
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 ring-1 ring-rose-200">
      <XCircle className="w-3 h-3" /> Vencida hace {n} día{n === 1 ? '' : 's'} háb.
    </span>;
  }
  if (p.validez === 'POR_VENCER') {
    const n = p.habiles_restantes;
    return <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-amber-50 text-amber-800 ring-1 ring-amber-200">
      <AlertTriangle className="w-3 h-3" /> {n === 0 ? 'Vence hoy' : `Vence en ${n} día${n === 1 ? '' : 's'} háb.`}
    </span>;
  }
  return <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
    Vigente · {p.habiles_restantes} días háb.
  </span>;
};

/** Bloque 5 — Seguimiento: antigüedad de pendientes, validez de la oferta y pérdidas. */
export const BloqueSeguimiento: React.FC<{ datos: DatosPanelCotizaciones }> = ({ datos }) => {
  const s = datos.seguimiento;
  const v = s.resumen_validez;
  const [vista, setVista] = useState<'POR_VENCER' | 'VENCIDA'>(v.por_vencer > 0 || v.vencidas === 0 ? 'POR_VENCER' : 'VENCIDA');
  const lista = s.pendientes.filter((p) => p.validez === vista);
  const totalVista = vista === 'POR_VENCER' ? v.por_vencer : v.vencidas;
  const maxTramo = Math.max(0, ...s.antiguedad.map((t) => t.cantidad));
  const maxMotivo = Math.max(0, ...s.perdidas_por_motivo.map((m) => m.cantidad));
  const tramos = TRAMOS.map((t) => s.antiguedad.find((x) => x.tramo === t) ?? { tramo: t, cantidad: 0, valor: 0 });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Bloque className="xl:col-span-2" titulo="Pendientes y validez de la oferta" icono={Clock}
        subtitulo={<>La oferta vale {datos.validez_oferta_dias} días hábiles (lunes a viernes). Vencerse no cambia el estado: es un aviso para llamar al cliente.</>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          {tramos.map((t, i) => (
            <div key={t.tramo} className="rounded-xl ring-1 ring-slate-200 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">{t.tramo}</p>
              <p className="text-[20px] font-extrabold text-slate-900 tabular-nums leading-tight mt-0.5">{fmtEntero(t.cantidad)}</p>
              <p className="text-[11px] text-slate-700 tabular-nums mb-1.5">{fmtCompacto(t.valor)}</p>
              <BarraH valor={t.cantidad} maximo={maxTramo} color={TONO_TRAMO[i]} alto={5} />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2" role="tablist" aria-label="Validez de las pendientes">
          {([
            { id: 'POR_VENCER' as const, label: 'Próximas a vencer', n: v.por_vencer, valor: v.valor_por_vencer, activo: 'bg-amber-600 text-white ring-amber-600' },
            { id: 'VENCIDA' as const, label: 'Fuera de validez', n: v.vencidas, valor: v.valor_vencidas, activo: 'bg-rose-700 text-white ring-rose-700' },
          ]).map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={vista === b.id} onClick={() => setVista(b.id)}
              className={`text-[12px] font-semibold rounded-lg px-3 py-1.5 ring-1 transition-colors ${vista === b.id ? b.activo : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'}`}>
              {b.label} · {b.n} <span className={vista === b.id ? 'text-white/90' : 'text-slate-700'}>({fmtCompacto(b.valor)})</span>
            </button>
          ))}
          <span className="text-[12px] text-slate-700">{v.vigentes} vigente{v.vigentes === 1 ? '' : 's'} con más de 2 días hábiles.</span>
        </div>

        {lista.length === 0 ? (
          <Vacio texto={vista === 'POR_VENCER' ? 'Ninguna pendiente vence en los próximos 2 días hábiles.' : 'Ninguna pendiente está fuera de validez.'} />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50 border-y border-slate-200">
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                  <th className="px-3 py-2 text-left">N.°</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Asesor</th>
                  <th className="px-3 py-2 text-left">Creada</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-left">Validez</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[13px] text-slate-800">
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-semibold text-slate-900 tabular-nums">{p.numero}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900 max-w-[220px] truncate" title={p.cliente}>{p.cliente}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate" title={p.asesor}>{p.asesor}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtFecha(p.fecha)} <span className="text-slate-700">· {p.dias} d</span></td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmtCOP(p.total)}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><PildoraValidez p={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalVista > lista.length && (
              <p className="px-4 sm:px-5 pt-2 text-[12px] text-slate-700">Se muestran las {lista.length} más urgentes de {totalVista}. El listado completo está en el Excel.</p>
            )}
          </div>
        )}
      </Bloque>

      <Bloque titulo="Perdidas y su motivo" icono={XCircle}
        subtitulo={`${fmtEntero(datos.kpis.perdidas)} perdida${datos.kpis.perdidas === 1 ? '' : 's'} por ${fmtCOP(datos.kpis.valor_perdido)}.`}>
        {s.perdidas_por_motivo.length === 0 ? <Vacio texto="No hay cotizaciones perdidas con estos filtros." /> : (
          <>
            <ul className="space-y-2.5">
              {s.perdidas_por_motivo.map((m) => (
                <li key={m.motivo}>
                  <div className="flex items-baseline justify-between gap-2 mb-1 text-[13px]">
                    <span className="font-semibold text-slate-900">{m.nombre}</span>
                    <span className="tabular-nums text-slate-800"><span className="font-bold text-slate-900">{m.cantidad}</span> · {fmtCompacto(m.valor)}</span>
                  </div>
                  <BarraH valor={m.cantidad} maximo={maxMotivo} color={COLOR.alerta} />
                </li>
              ))}
            </ul>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-900 mt-5 mb-2">Últimas perdidas</p>
            <ul className="divide-y divide-slate-100">
              {s.perdidas_recientes.map((p) => (
                <li key={p.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-900 truncate" title={p.cliente}>N.° {p.numero} · {p.cliente}</span>
                    <span className="text-[12px] font-semibold text-slate-900 tabular-nums shrink-0">{fmtCompacto(p.total)}</span>
                  </div>
                  <p className="text-[12px] text-slate-700">
                    <span className="font-semibold text-rose-700">{p.motivo}</span> · {p.asesor} · {fmtFecha(p.fecha)}
                  </p>
                  {p.detalle && <p className="text-[12px] text-slate-800 mt-0.5 line-clamp-2">“{p.detalle}”</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloque>
    </div>
  );
};

export default BloqueSeguimiento;
