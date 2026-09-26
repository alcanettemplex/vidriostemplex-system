import React from 'react';
import {
    AlertCircle, AlertTriangle, Lightbulb, ListTree, Receipt, Replace, Trash2, Plus, Undo2, Loader2, Sparkles,
} from '../../../components/ui/icons';

import { LineaBOM, ResultadoCalculo as TResultadoCalculo } from '../types';
import { fmtCOP, fmtPct } from '../format';
import { Chip, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Resultado de calcular() para UN ítem: despiece de materiales y servicios +
// resumen financiero + advertencias del motor. Puramente presentacional —
// TabCotizar es quien decide cuándo mostrarlo y qué hacer con el botón
// "Agregar".
//
// Rediseño 2026-09-20: los mismos datos, las mismas columnas y las mismas
// cantidades que antes; lo que cambia es la jerarquía (dos bloques con título
// en vez de una tabla suelta y un recuadro gris) y que ahora SÍ se ven los
// distintivos `provisional` / `revisarPrecio` que cada línea ya traía del
// backend (motorCalculo.lineaCatalogo) y que hasta hoy se perdían: un precio
// derivado de una fuente externa no puede leerse igual que uno del catálogo.
// ─────────────────────────────────────────────────────────────────────────────

/** Acciones de personalización (2026-09-23). Sin ellas la tabla es de sólo
 * lectura, como antes. Cada una la resuelve TabCotizar recalculando en el
 * servidor: aquí no se toca ningún número. */
export interface AccionesDespiece {
    onCambiar: (linea: LineaBOM) => void;
    onQuitar: (linea: LineaBOM) => void;
    onAgregar: () => void;
    onRestaurar: (codigo: string) => void;
    onDeshacerCambio: (de: string) => void;
    ocupado: boolean;
}

interface Props {
    resultado: TResultadoCalculo;
    acciones?: AccionesDespiece;
}

const btnLinea = 'p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-100/60 transition disabled:opacity-30 disabled:cursor-not-allowed';

const filaTotalClase = 'flex items-center justify-between gap-3';

/** Color del punto de categoría en el BOM: error manda, luego una heurística
 * simple por categoría/unidad/descripción (vidrio vs. resto) — es un detalle
 * visual, no una clasificación de negocio. */
const colorCategoria = (item: { error: boolean; categoria?: string; unidad?: string; descripcion?: string }): string => {
    if (item.error) return '#e11d48';
    const pista = `${item.categoria ?? ''} ${item.unidad ?? ''} ${item.descripcion ?? ''}`.toUpperCase();
    if (pista.includes('VIDRIO')) return '#38bdf8';
    return '#6f7a8c';
};

/** `provisional`, `fuentePrecio` y `revisarPrecio` viajan por el index signature
 * de `LineaBOM` (sólo existen en las líneas cuyo precio NO salió del catálogo
 * de Templex), así que llegan como `unknown` y hay que estrecharlos aquí. */
const esVerdadero = (v: unknown): boolean => v === true;
const comoTexto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

const DistintivosLinea: React.FC<{ item: LineaBOM }> = ({ item }) => {
    const provisional = esVerdadero(item.provisional);
    const revisar = esVerdadero(item.revisarPrecio);
    if (!provisional && !revisar) return null;
    const fuente = comoTexto(item.fuentePrecio);
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            {provisional && (
                <Chip
                    tono="neutro"
                    title={fuente ? `Precio provisional derivado de: ${fuente}` : 'Precio provisional: no proviene del catálogo de Templex'}
                >
                    Provisional
                </Chip>
            )}
            {revisar && (
                <Chip tono="ambar" title="El precio parece un valor por defecto de la fuente: confírmalo antes de cotizar.">
                    <AlertTriangle className="w-3 h-3" />
                    Revisar precio
                </Chip>
            )}
        </span>
    );
};

const ResultadoCalculo: React.FC<Props> = ({ resultado, acciones }) => {
    const {
        items, hayErrores, advertencias,
        subtotalPieza, cantidadPiezas, subtotal,
        aiu, subtotalConAiu,
        descuentoPct, descuento,
        ivaPct, iva, total,
    } = resultado;
    const quitados = resultado.personalizacion?.quitados ?? [];
    const hayPersonalizacion = Boolean(
        resultado.personalizacion &&
        (resultado.personalizacion.cambios.length || quitados.length || resultado.personalizacion.extras.length)
    );

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
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px] font-bold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Hay líneas en error: corrígelas antes de agregar este ítem a la cotización.</span>
                </div>
            )}

            {/* ── Despiece de materiales y servicios ─────────────────────── */}
            <Tarjeta
                titulo="Despiece de materiales y servicios"
                icono={ListTree}
                cuerpoClassName="pt-0"
                accion={
                    <span className="inline-flex items-center gap-2">
                        {hayPersonalizacion && (
                            <Chip tono="indigo" title="Este ítem tiene componentes cambiados, quitados o agregados respecto del estándar.">
                                <Sparkles className="w-3 h-3" /> Personalizado
                            </Chip>
                        )}
                        {resultado.perfileriaPersonalizada && (
                            <Chip tono="ambar" title="Se tocó la perfilería: el ítem no sale en orden de corte ni SAP automática.">
                                Sin orden de corte
                            </Chip>
                        )}
                        <span className="text-[11px] text-slate-400 font-cotizador-head tabular-nums">
                            {items.length} línea{items.length === 1 ? '' : 's'}
                        </span>
                    </span>
                }
            >
                {/* Sangría negativa: la tabla ocupa el ancho completo de la
                    tarjeta, para que la banda gris del encabezado llegue a los
                    dos bordes en vez de flotar dentro del padding. */}
                <div className="overflow-x-auto -mx-4">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
                            <tr>
                                <th className="px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-wide">Código</th>
                                <th className="px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-wide">Descripción</th>
                                <th className="px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-wide">Cat.</th>
                                <th className="px-3 py-2 text-left text-[10.5px] font-extrabold uppercase tracking-wide">Unidad</th>
                                <th className="px-3 py-2 text-right text-[10.5px] font-extrabold uppercase tracking-wide">Cant.</th>
                                <th className="px-3 py-2 text-right text-[10.5px] font-extrabold uppercase tracking-wide">P. Unitario</th>
                                <th className="px-3 py-2 text-right text-[10.5px] font-extrabold uppercase tracking-wide">Valor Total</th>
                                {acciones && <th className="px-2 py-2 w-16"><span className="sr-only">Acciones</span></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((item, i) => (
                                <tr
                                    key={i}
                                    className={item.error
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'text-slate-700 hover:bg-slate-50 transition-colors'}
                                >
                                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap align-top">{item.codigo}</td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex items-start gap-1.5">
                                            <span
                                                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 mt-[7px] flex-shrink-0"
                                                style={{ background: colorCategoria(item) }}
                                            />
                                            {item.error && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                                            <span className="min-w-0">
                                                <span className={item.error ? 'font-semibold' : ''}>{item.descripcion}</span>
                                                <DistintivosLinea item={item} />
                                                {item.personalizada === 'cambiada' && (
                                                    <span className="flex flex-wrap items-center gap-1 mt-0.5">
                                                        <Chip tono="indigo" title={comoTexto(item.descripcionOriginal) ?? undefined}>
                                                            Cambiado · antes {String(item.codigoOriginal)}
                                                        </Chip>
                                                        {acciones && (
                                                            <button
                                                                type="button"
                                                                disabled={acciones.ocupado}
                                                                onClick={() => acciones.onDeshacerCambio(String(item.codigoOriginal))}
                                                                className="text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                                                            >
                                                                Deshacer
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                                {item.personalizada === 'agregada' && (
                                                    <span className="block mt-0.5"><Chip tono="esmeralda">Agregado</Chip></span>
                                                )}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={`px-3 py-2 whitespace-nowrap align-top ${item.error ? '' : 'text-slate-500'}`}>{item.categoria}</td>
                                    <td className={`px-3 py-2 whitespace-nowrap align-top ${item.error ? '' : 'text-slate-500'}`}>{item.unidad}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap align-top font-cotizador-head tabular-nums">{item.cantidad}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap align-top font-cotizador-head tabular-nums">{fmtCOP(item.precioUnitario)}</td>
                                    <td className="px-3 py-2 text-right font-bold whitespace-nowrap align-top font-cotizador-head tabular-nums">{fmtCOP(item.valorTotal)}</td>
                                    {acciones && (
                                        <td className="px-2 py-1.5 text-right whitespace-nowrap align-top">
                                            {item.personalizada !== 'agregada' && (
                                                <button
                                                    type="button"
                                                    className={btnLinea}
                                                    disabled={acciones.ocupado}
                                                    onClick={() => acciones.onCambiar(item)}
                                                    title="Cambiar por otro producto"
                                                >
                                                    <Replace className="w-4 h-4" />
                                                    <span className="sr-only">Cambiar {item.codigo}</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`${btnLinea} hover:text-rose-600 hover:bg-rose-100/60`}
                                                disabled={acciones.ocupado}
                                                onClick={() => acciones.onQuitar(item)}
                                                title="Quitar del despiece"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span className="sr-only">Quitar {item.codigo}</span>
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {acciones && (
                    <div className="-mx-4 -mb-4 mt-0 px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 space-y-2">
                        {quitados.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                                <span className="font-bold">Quitados:</span>
                                {quitados.map(q => (
                                    <span key={q.codigo} className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5">
                                        <span className="line-through">{q.codigo}</span>
                                        <button
                                            type="button"
                                            disabled={acciones.ocupado}
                                            onClick={() => acciones.onRestaurar(q.codigo)}
                                            className="inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                                            title={`Volver a incluir ${q.descripcion}`}
                                        >
                                            <Undo2 className="w-3 h-3" /> Restaurar
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        <button
                            type="button"
                            disabled={acciones.ocupado}
                            onClick={acciones.onAgregar}
                            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
                        >
                            {acciones.ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Agregar componente
                        </button>
                    </div>
                )}
            </Tarjeta>

            {/* ── Resumen financiero ─────────────────────────────────────── */}
            <Tarjeta titulo="Resumen financiero" icono={Receipt}>
                <div className="space-y-1.5 text-sm">
                    <div className={filaTotalClase}>
                        <span className="text-slate-500">Subtotal por pieza</span>
                        <span className="font-semibold text-slate-700 font-cotizador-head tabular-nums">{fmtCOP(subtotalPieza)}</span>
                    </div>
                    <div className={filaTotalClase}>
                        <span className="text-slate-500">Cantidad de piezas</span>
                        <span className="font-semibold text-slate-700 font-cotizador-head tabular-nums">{cantidadPiezas}</span>
                    </div>
                    <div className={filaTotalClase}>
                        <span className="text-slate-500">Subtotal</span>
                        <span className="font-semibold text-slate-700 font-cotizador-head tabular-nums">{fmtCOP(subtotal)}</span>
                    </div>
                    <div className={filaTotalClase}>
                        <span className="text-slate-500">AIU aplicado ({fmtPct(pctAiu)})</span>
                        <span className="font-semibold text-slate-700 font-cotizador-head tabular-nums">+ {fmtCOP(montoAiu)}</span>
                    </div>
                    {/* El descuento por ítem salió del formulario el 2026-09-20: hay UN
                        solo descuento y vive en la propuesta. La línea sigue aquí para
                        las cotizaciones viejas que lo traen en su blob, pero no se pinta
                        un "- $0" en las nuevas: sería un renglón que no significa nada. */}
                    {descuento > 0 && (
                        <div className={filaTotalClase}>
                            <span className="text-slate-500">Descuento ({fmtPct(descuentoPct)})</span>
                            <span className="font-semibold text-rose-600 font-cotizador-head tabular-nums">- {fmtCOP(descuento)}</span>
                        </div>
                    )}
                    <div className={filaTotalClase}>
                        <span className="text-slate-500">IVA ({fmtPct(ivaPct)})</span>
                        <span className="font-semibold text-slate-700 font-cotizador-head tabular-nums">{fmtCOP(iva)}</span>
                    </div>
                </div>

                {/* El TOTAL vive en su propio bloque: es el número que el vendedor
                    busca de un vistazo y no puede pesar lo mismo que las líneas
                    intermedias de la cadena. */}
                <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3 flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 font-cotizador-head tabular-nums">
                        Total del producto
                    </span>
                    <span className="text-3xl font-black text-slate-900 font-cotizador-head tabular-nums leading-none">{fmtCOP(total)}</span>
                </div>

                {/* Este total es el del PRODUCTO, a precio lleno. Ni la mano de obra
                    ni el flete están dentro desde el 2026-09-20 (se cobran una vez
                    por propuesta, no una por pieza: cinco piezas cobraban cinco
                    fletes), y el descuento de la propuesta se aplica después sobre
                    la suma. Sin este rótulo el vendedor lo lee como el precio final. */}
                <p className="text-[11px] text-slate-400 leading-snug pt-2">
                    Precio del producto. La mano de obra, el flete y demás cargos de obra se cobran una vez por
                    propuesta y se suman aparte; el descuento de la propuesta tampoco está aplicado aquí.
                </p>
            </Tarjeta>

            {/* ── Recomendación técnica ──────────────────────────────────── */}
            {/* TODAS las advertencias del motor, sin filtrar ni resumir: son avisos
                de fabricación (vidrio no admitido para el sistema, piezas que no
                sirven para cortar, color sustituido…). Esconder una tras un "ver
                más" es esconder un error de taller. */}
            {advertencias.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-700 font-cotizador-head tabular-nums">
                        <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                        Recomendación técnica
                        <span className="font-cotizador-head tabular-nums text-amber-600">({advertencias.length})</span>
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                        {advertencias.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-amber-800 leading-snug">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>{a}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
};

export default ResultadoCalculo;
