import React from 'react';
import TarjetaKPI from '../../TarjetaKPI';
import { CheckCircle, FileText, Hourglass, Percent, Receipt, Timer } from '../../../ui/icons';
import type { DatosPanelCotizaciones } from './tipos';
import { fmtCompacto, fmtCOP, fmtEntero, fmtPct } from './formato';

/** Bloque 1 — KPIs a la mano. */
export const BloqueKpis: React.FC<{ datos: DatosPanelCotizaciones }> = ({ datos }) => {
  const k = datos.kpis;
  const v = datos.seguimiento.resumen_validez;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      <TarjetaKPI indice={0} rotulo="Cotizadas" icono={FileText} tono="blue"
        cifra={fmtEntero(k.cantidad)}
        descripcion={<><span className="font-semibold text-slate-900">{fmtCOP(k.valor)}</span> cotizados{k.canceladas > 0 && <> · {k.canceladas} cancelada{k.canceladas === 1 ? '' : 's'} fuera de la cuenta</>}</>} />
      <TarjetaKPI indice={1} rotulo="Aprobadas" icono={CheckCircle} tono="emerald"
        cifra={fmtEntero(k.aprobadas)} cifraClassName="text-emerald-700"
        descripcion={<><span className="font-semibold text-slate-900">{fmtCOP(k.valor_aprobado)}</span> vendidos</>} />
      <TarjetaKPI indice={2} rotulo="Tasa de conversión" icono={Percent} tono="indigo"
        cifra={fmtPct(k.conversion_pct)}
        descripcion={<>En cantidad. En valor: <span className="font-semibold text-slate-900">{fmtPct(k.conversion_valor_pct)}</span></>} />
      <TarjetaKPI indice={3} rotulo="Ticket promedio" icono={Receipt} tono="violet"
        cifra={fmtCompacto(k.ticket_aprobado)}
        descripcion={<>Por cotización aprobada. Cotizado: <span className="font-semibold text-slate-900">{fmtCompacto(k.ticket_cotizado)}</span></>} />
      <TarjetaKPI indice={4} rotulo="Días hasta aprobar" icono={Timer} tono="slate"
        cifra={k.dias_aprobar === null ? '—' : k.dias_aprobar.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
        descripcion={k.dias_aprobar === null ? 'Aún no hay aprobadas en el rango' : 'Promedio desde la creación hasta la aprobación'} />
      <TarjetaKPI indice={5} rotulo="Pendientes" icono={Hourglass} tono="amber"
        cifra={fmtEntero(k.pendientes)} cifraClassName="text-amber-700"
        descripcion={<>
          <span className="font-semibold text-slate-900">{fmtCOP(k.valor_pendiente)}</span> por cerrar
          {(v.vencidas > 0 || v.por_vencer > 0) && (
            <span className="block mt-1 text-[12px] font-semibold text-rose-700">
              {v.vencidas > 0 && `${v.vencidas} fuera de validez`}{v.vencidas > 0 && v.por_vencer > 0 && ' · '}{v.por_vencer > 0 && `${v.por_vencer} por vencer`}
            </span>
          )}
        </>} />
    </div>
  );
};

export default BloqueKpis;
