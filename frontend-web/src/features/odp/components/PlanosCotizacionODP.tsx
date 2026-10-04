import React from 'react';
import { Loader2 } from '../../../components/ui/icons';
import { TemplexLogo } from '../../../components/ui/TemplexLogo';

import DiagramaProducto from '../../cotizador/components/DiagramaProducto';
import { descripcionDeItem, leerFicha } from '../../cotizador/fichaProducto';
import { numeroCotizacion } from '../../cotizador/format';
import { ItemCotizacion } from '../../cotizador/types';
import { useCotizacionTecnica } from './useCotizacionTecnica';

// ─────────────────────────────────────────────────────────────────────────────
// Hojas de PLANOS del Detalle Técnico (2026-10-03, destino 5 de
// cotizador-vision.md). Van DESPUÉS de la hoja de siempre, que no cambia y sigue
// llevando el croquis a mano si lo hay (decisión del usuario: conviven).
//
// · 4 planos por hoja, en 2 × 2 (decisión del 2026-09-20: una ODP puede tener de
//   1 a 30 productos, así que se pagina en vez de amontonar).
// · Los planos son los del Cotizador (`DiagramaProducto`, SVG): la hoja se
//   imprime como HTML, así que no hace falta convertirlos a imagen.
// · El número de ítem es su posición en la opción elegida, el mismo que usan la
//   Hoja de trabajo y el PDF: "ítem 3" es el mismo producto en los tres papeles.
// · Un plano de confianza `nula` es un esquema sin escala: se imprime, pero
//   rotulado para que nadie mida sobre él.
// · Los ítems sin diseño no tienen plano: se nombran al pie de la última hoja.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    odp: { numero_odp?: string | null };
    cotizacionId: number;
    /** Hojas que ya tiene el documento antes de estas (la del croquis): 1. */
    hojasPrevias?: number;
}

const PLANOS_POR_HOJA = 4;
const OPCIONES = { conDespieces: false, error: 'No se pudieron cargar los planos de la cotización vinculada.' };

const PlanosCotizacionODP: React.FC<Props> = ({ odp, cotizacionId, hojasPrevias = 1 }) => {
    const { cot, propuesta, modulos, planos, cargando, error } = useCotizacionTecnica(cotizacionId, OPCIONES);

    if (cargando) {
        return (
            <div className="print:hidden py-6 flex items-center justify-center text-slate-800 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando los planos de la cotización…
            </div>
        );
    }
    if (error || !cot) return <p className="print:hidden py-6 text-center text-sm text-rose-800">{error ?? 'Sin datos.'}</p>;

    const items = [...cot.items].sort((a, b) => a.orden - b.orden);
    const numerados = items.map((it, i) => ({ it, numero: i + 1 }));
    const conPlano = numerados.filter(({ it }) => it.disenoId);
    const sinPlano = numerados.filter(({ it }) => !it.disenoId);

    if (conPlano.length === 0) {
        return (
            <p className="print:hidden py-6 text-center text-sm text-slate-800">
                {numeroCotizacion(cot.numero)} no tiene productos con diseño: no hay planos que agregar al Detalle Técnico.
            </p>
        );
    }

    const hojas: Array<typeof conPlano> = [];
    for (let k = 0; k < conPlano.length; k += PLANOS_POR_HOJA) hojas.push(conPlano.slice(k, k + PLANOS_POR_HOJA));
    const totalHojas = hojasPrevias + hojas.length;
    const opcion = propuesta && (cot.propuestas?.length ?? 0) > 1 ? ` · Opción ${propuesta.etiqueta}` : '';

    const nombreModulo = (it: ItemCotizacion) => modulos.find(m => m.id === it.moduloId)?.nombre ?? it.moduloId;

    return (
        <>
            <style>
                {`
                .planos-hoja { page-break-before: always; break-before: page; }
                .planos-celda { break-inside: avoid; page-break-inside: avoid; }
                `}
            </style>
            {hojas.map((hoja, h) => (
                <div
                    key={h}
                    className="planos-hoja print-root block w-[21.5cm] min-h-[29cm] print:min-h-0 bg-white shadow-xl print:shadow-none text-black font-sans text-[10px] mx-auto mt-6 print:mt-0 overflow-hidden print:overflow-visible"
                >
                    <div className="print-container p-6">
                        {/* ---------- CABECERA (misma de la hoja del croquis) ---------- */}
                        <div className="flex justify-between items-end mb-1">
                            <div className="flex items-center w-1/3">
                                <TemplexLogo className="h-10 w-40 justify-start" />
                            </div>
                            <div className="w-1/3 text-center font-bold text-[13px] mb-2 uppercase tracking-[0.2em]">
                                Detalle técnico · Planos
                            </div>
                            <div className="w-1/3 flex justify-end mb-1">
                                <div className="border-[2px] border-black text-xl font-bold w-32 h-10 flex items-center justify-center">
                                    {odp.numero_odp?.split('-').pop() || odp.numero_odp}
                                </div>
                            </div>
                        </div>
                        <div className="border-2 border-black px-2 py-1 mb-2 flex justify-between font-bold text-[11px] uppercase">
                            <span>{numeroCotizacion(cot.numero)}{opcion} · {cot.cliente?.nombre || '—'}</span>
                            <span>Planos de la cotización</span>
                        </div>

                        {/* ---------- 4 PLANOS (2 × 2) ---------- */}
                        <div className="grid grid-cols-2 gap-2">
                            {hoja.map(({ it, numero }) => {
                                const plano = planos[it.id] ?? null;
                                const ficha = leerFicha(it.input, it.resultado, modulos.find(m => m.id === it.moduloId));
                                const sinEscala = plano?.confianza === 'nula';
                                return (
                                    <div key={it.id} className="planos-celda border-2 border-black flex flex-col" style={{ height: '440px' }}>
                                        <div className="border-b border-black px-2 py-1">
                                            <div className="flex justify-between font-bold text-[11px] uppercase">
                                                <span>Ítem {numero}</span>
                                                <span>{ficha.medidas ?? ''} · Cant. {ficha.piezas}</span>
                                            </div>
                                            <p className="text-[10px] leading-tight line-clamp-2">
                                                {descripcionDeItem(it.input, it.resultado, modulos.find(m => m.id === it.moduloId), nombreModulo(it))}
                                            </p>
                                        </div>
                                        {sinEscala && (
                                            <div className="mx-2 mt-1 border-2 border-rose-700 text-rose-800 text-center font-bold text-[10px] uppercase py-0.5">
                                                Esquema sin escala — no usar para medir
                                            </div>
                                        )}
                                        <div className="flex-1 overflow-hidden p-1 flex items-center justify-center">
                                            {plano ? (
                                                <DiagramaProducto plano={plano} cargando={false} altoMaximoPx={sinEscala ? 300 : 330} anchoMaximoPx={340} impresion />
                                            ) : (
                                                <span className="text-[11px] italic text-slate-700">No se pudo calcular el plano de este ítem.</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {h === hojas.length - 1 && sinPlano.length > 0 && (
                            <p className="mt-2 text-[10px]">
                                <span className="font-bold uppercase">Sin plano (productos sin diseño): </span>
                                {sinPlano.map(({ it, numero }) => `ítem ${numero} — ${nombreModulo(it)}`).join(' · ')}
                            </p>
                        )}

                        <div className="text-right mt-1 font-bold text-[8px]">
                            Hoja {hojasPrevias + h + 1} de {totalHojas}
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
};

export default PlanosCotizacionODP;
