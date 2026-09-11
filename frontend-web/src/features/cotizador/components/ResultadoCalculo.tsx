import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

import { ResultadoCalculo as TResultadoCalculo } from '../types';
import { fmtCOP, fmtPct } from '../format';

// ─────────────────────────────────────────────────────────────────────────────
// Resultado de calcular() para UN ítem: tabla de BOM + bloque de totales +
// advertencias del motor. Puramente presentacional — TabCotizar es quien
// decide cuándo mostrarlo y qué hacer con el botón "Agregar".
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    resultado: TResultadoCalculo;
}

const filaTotalClase = 'flex items-center justify-between gap-3';

/** Color del punto de categoría en el BOM: error manda, luego una heurística
 * simple por categoría/unidad/descripción (vidrio vs. resto) — es un detalle
 * visual, no una clasificación de negocio. */
const colorCategoria = (item: { error: boolean; categoria?: string; unidad?: string; descripcion?: string }): string => {
    if (item.error) return '#e11d48';
    const pista = `${item.categoria ?? ''} ${item.unidad ?? ''} ${item.descripcion ?? ''}`.toUpperCase();
    if (pista.includes('VIDRIO')) return '#38bdf8';
    return '#94a3b8';
};

const ResultadoCalculo: React.FC<Props> = ({ resultado }) => {
    const {
        items, hayErrores, advertencias,
        subtotalPieza, cantidadPiezas, subtotal,
        aiu, subtotalConAiu,
        descuentoPct, descuento,
        ivaPct, iva, total,
    } = resultado;

    // `aiu` es el DIVISOR que usa motorCalculo.totalizar (subtotalConAiu =
    // subtotal / aiu, default 0.96) — no una fracción que se suma directo. El
    // % real que ese divisor representa sobre el subtotal es (1/aiu - 1), no
    // (1 - aiu): con aiu=0.96 son 4.17% vs 4%, parecidos pero no la misma
    // cuenta que hace el motor. Se muestra el % correcto junto al monto ya
    // calculado (subtotalConAiu - subtotal) para no obligar al usuario a
    // hacer la resta.
    const montoAiu = subtotalConAiu - subtotal;
    const pctAiu = aiu ? (1 / aiu) - 1 : 0;

    return (
        <div className="space-y-3">
            {hayErrores && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Hay líneas en error: corrígelas antes de agregar este ítem a la cotización.
                </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium">Código</th>
                            <th className="px-3 py-2 text-left font-medium">Descripción</th>
                            <th className="px-3 py-2 text-left font-medium">Cat.</th>
                            <th className="px-3 py-2 text-left font-medium">Unidad</th>
                            <th className="px-3 py-2 text-right font-medium">Cant.</th>
                            <th className="px-3 py-2 text-right font-medium">P. Unitario</th>
                            <th className="px-3 py-2 text-right font-medium">Valor Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map((item, i) => (
                            <tr key={i} className={item.error ? 'bg-rose-50 text-rose-700' : 'odd:bg-slate-50 text-slate-700'}>
                                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{item.codigo}</td>
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: colorCategoria(item) }} />
                                        {item.error && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                                        <span>{item.descripcion}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.categoria}</td>
                                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{item.unidad}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-cotizador-head">{item.cantidad}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-cotizador-head">{fmtCOP(item.precioUnitario)}</td>
                                <td className="px-3 py-2 text-right font-bold whitespace-nowrap font-cotizador-head">{fmtCOP(item.valorTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-sm">
                <div className={filaTotalClase}>
                    <span className="text-slate-500">Subtotal por pieza</span>
                    <span className="font-semibold text-slate-700 font-cotizador-head">{fmtCOP(subtotalPieza)}</span>
                </div>
                <div className={filaTotalClase}>
                    <span className="text-slate-500">Cantidad de piezas</span>
                    <span className="font-semibold text-slate-700 font-cotizador-head">{cantidadPiezas}</span>
                </div>
                <div className={filaTotalClase}>
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-semibold text-slate-700 font-cotizador-head">{fmtCOP(subtotal)}</span>
                </div>
                <div className={filaTotalClase}>
                    <span className="text-slate-500">AIU aplicado ({fmtPct(pctAiu)})</span>
                    <span className="font-semibold text-slate-700 font-cotizador-head">+ {fmtCOP(montoAiu)}</span>
                </div>
                <div className={filaTotalClase}>
                    <span className="text-slate-500">Descuento ({fmtPct(descuentoPct)})</span>
                    <span className="font-semibold text-rose-600 font-cotizador-head">- {fmtCOP(descuento)}</span>
                </div>
                <div className={filaTotalClase}>
                    <span className="text-slate-500">IVA ({fmtPct(ivaPct)})</span>
                    <span className="font-semibold text-slate-700 font-cotizador-head">{fmtCOP(iva)}</span>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 mt-1 flex items-center justify-between">
                    <span className="font-bold text-slate-700">Total</span>
                    <span className="text-2xl font-black text-slate-900 font-cotizador-head">{fmtCOP(total)}</span>
                </div>
            </div>

            {advertencias.length > 0 && (
                <div className="space-y-1.5">
                    {advertencias.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{a}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ResultadoCalculo;
