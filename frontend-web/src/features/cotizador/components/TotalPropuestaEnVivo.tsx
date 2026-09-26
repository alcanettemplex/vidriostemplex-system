import React from 'react';
import { Receipt } from '../../../components/ui/icons';

import { fmtCOP, fmtPct } from '../format';
import { TotalesPrevistos } from '../totalesPropuesta';

// ─────────────────────────────────────────────────────────────────────────────
// Total de la propuesta en vivo, al pie del paso 3 de Cotizar (2026-09-26).
//
// Pedido del usuario: al marcar un cargo de obra el total tiene que moverse en
// la misma pantalla, sin ir a Actual ni guardar. Muestra la cadena completa en
// el orden en que se suma —productos, mano de obra, descuento, cargos, IVA— para
// que el vendedor vea por qué el número cambió. La cuenta la hace
// `calcularTotalesPrevistos`, réplica del backend; al guardar manda el backend.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    totales: TotalesPrevistos;
    descuentoPct: number;
    /** Aclaración bajo el total (p. ej. que incluye el producto en pantalla). */
    nota?: string | null;
}

const Fila: React.FC<{ etiqueta: string; valor: string; tono?: 'rebaja' }> = ({ etiqueta, valor, tono }) => (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
        <span className="text-[13px] text-slate-900">{etiqueta}</span>
        <span className={`text-[13px] font-semibold tabular-nums ${tono === 'rebaja' ? 'text-rose-700' : 'text-slate-900'}`}>
            {valor}
        </span>
    </div>
);

const TotalPropuestaEnVivo: React.FC<Props> = ({ totales, descuentoPct, nota }) => (
    <section className="mt-3 rounded-xl border border-templex-200 bg-white shadow-card overflow-hidden" aria-live="polite">
        <header className="flex items-center gap-2 px-3.5 py-2.5 bg-templex-50 border-b border-templex-200">
            <Receipt className="w-4 h-4 text-templex-700 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900">Total de la propuesta con cargos de obra</h3>
        </header>
        <div className="px-3.5 py-2.5 grid gap-x-8 md:grid-cols-2">
            <div>
                <Fila etiqueta="Productos (con AIU)" valor={fmtCOP(totales.productos)} />
                <Fila etiqueta="Mano de obra de productos (con AIU)" valor={fmtCOP(totales.manoObra)} />
                {totales.descuento > 0 && (
                    <Fila etiqueta={`Descuento (${fmtPct(descuentoPct)})`} valor={`− ${fmtCOP(totales.descuento)}`} tono="rebaja" />
                )}
            </div>
            <div>
                <Fila etiqueta="Cargos de obra" valor={fmtCOP(totales.cargos)} />
                <Fila etiqueta="IVA" valor={fmtCOP(totales.iva)} />
            </div>
        </div>
        <div className="mx-3.5 mb-3 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3 flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">Total de la propuesta</span>
            <span className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{fmtCOP(totales.total)}</span>
        </div>
        {nota && <p className="px-3.5 pb-3 -mt-1 text-[11.5px] text-slate-700 leading-snug">{nota}</p>}
    </section>
);

export default TotalPropuestaEnVivo;
