import React, { useEffect, useId, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ChevronDown, Lightbulb, ListTree, Replace, Trash2, Plus, Undo2, Loader2, Sparkles,
} from '../../../components/ui/icons';

import { LineaBOM, ResultadoCalculo as TResultadoCalculo } from '../types';
import { fmtCOP } from '../format';
import { Chip } from './ui';

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
//
// SISTEMA VISUAL (2026-09-26, Fase 5): encabezados y rótulos en negro
// seminegrita, celdas en negro normal, acento `templex`. La columna Descripción
// tiene un ancho mínimo y las de código/categoría/unidad no se parten, así que
// "5020 CABEZAL 144 MATE" ya no cae en tres líneas; en pantallas estrechas la
// tabla se desplaza en horizontal en vez de aplastarse.
//
// MESA DE TRABAJO (2026-09-26): el resumen financiero del ítem se mudó al panel
// "Este producto" de la derecha (ResumenPropuesta), que siempre está a la vista.
// Aquí quedan los avisos, arriba, y el despiece PLEGADO: se abre a pedido o solo
// cuando hay líneas en error. La personalización sigue igual, dentro.
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

const btnLinea = 'p-1 rounded-md text-slate-600 hover:text-templex-700 hover:bg-templex-50 transition disabled:opacity-30 disabled:cursor-not-allowed';


/** Color del punto de categoría en el BOM: error manda, luego una heurística
 * simple por categoría/unidad/descripción (vidrio vs. resto) — es un detalle
 * visual, no una clasificación de negocio. */
/** `provisional`, `fuentePrecio` y `revisarPrecio` viajan por el index signature
 * de `LineaBOM` (sólo existen en las líneas cuyo precio NO salió del catálogo
 * de Templex), así que llegan como `unknown` y hay que estrecharlos aquí. */
const esVerdadero = (v: unknown): boolean => v === true;
const comoTexto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

const DistintivosLinea: React.FC<{ item: LineaBOM }> = ({ item }) => {
    const provisional = esVerdadero(item.provisional);
    const revisar = esVerdadero(item.revisarPrecio);
    // Precio a cotizar (2026-09-26): el asesor escribió el costo del proveedor.
    const costoManual = esVerdadero(item.precioACotizar) && typeof item.costoManual === 'number' ? item.costoManual : null;
    if (!provisional && !revisar && costoManual === null) return null;
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
            {costoManual !== null && (
                <Chip tono="ambar" title="Producto de precio a cotizar: el precio sale del costo del proveedor que escribió el asesor.">
                    Costo manual {fmtCOP(costoManual)}
                </Chip>
            )}
        </span>
    );
};

const ResultadoCalculo: React.FC<Props> = ({ resultado, acciones }) => {
    const { items, hayErrores, advertencias, subtotalPieza } = resultado;
    // Plegado por defecto: para el asesor el despiece es detalle. Se abre solo
    // si hay líneas en error, que son justo las que hay que corregir.
    const [abierto, setAbierto] = useState(Boolean(hayErrores));
    useEffect(() => { if (hayErrores) setAbierto(true); }, [hayErrores]);
    const idTabla = useId();
    const quitados = resultado.personalizacion?.quitados ?? [];
    const hayPersonalizacion = Boolean(
        resultado.personalizacion &&
        (resultado.personalizacion.cambios.length || quitados.length || resultado.personalizacion.extras.length)
    );


    return (
        <div className="space-y-3">
            {hayErrores && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[12.5px] font-semibold">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Hay líneas en error: corrígelas en el despiece antes de agregar este ítem a la cotización.</span>
                </div>
            )}

            {/* ── Recomendación técnica ──────────────────────────────────── */}
            {/* TODAS las advertencias del motor, sin filtrar ni resumir: son avisos
                de fabricación (vidrio no admitido para el sistema, piezas que no
                sirven para cortar, color sustituido…). Esconder una tras un "ver
                más" es esconder un error de taller. Van ANTES del despiece: el
                despiece se pliega y ellas no. */}
            {advertencias.length > 0 && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                        Recomendación técnica
                        <span className="tabular-nums">({advertencias.length})</span>
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                        {advertencias.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-[12px] text-amber-900 leading-snug">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>{a}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ── Despiece de materiales y servicios, plegable ───────────── */}
            <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                    type="button"
                    onClick={() => setAbierto(a => !a)}
                    aria-expanded={abierto}
                    aria-controls={idTabla}
                    className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-templex-400"
                >
                    <ChevronDown className={`w-4 h-4 text-slate-700 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    <ListTree className="w-4 h-4 text-templex-600 shrink-0" />
                    <span className="text-[13.5px] font-bold text-slate-900">Despiece de materiales</span>
                    <span className="text-[12px] text-slate-700 tabular-nums">
                        {items.length} línea{items.length === 1 ? '' : 's'} · {fmtCOP(subtotalPieza)} por pieza
                    </span>
                    {hayPersonalizacion && (
                        <Chip tono="marca" title="Este ítem tiene componentes cambiados, quitados o agregados respecto del estándar.">
                            <Sparkles className="w-3 h-3" /> Personalizado
                        </Chip>
                    )}
                    {resultado.perfileriaPersonalizada && (
                        <Chip tono="ambar" title="Se tocó la perfilería: el ítem no sale en orden de corte ni SAP automática.">
                            Sin orden de corte
                        </Chip>
                    )}
                    <span className="ml-auto text-[12px] font-semibold text-templex-700">
                        {abierto ? 'Ocultar' : acciones ? 'Ver y editar componentes' : 'Ver'}
                    </span>
                </button>

                <div id={idTabla} hidden={!abierto} className="border-t border-slate-200">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-[13px]">
                        <thead className="bg-slate-50 text-slate-900 border-y border-slate-200">
                            <tr>
                                <th className="pl-4 pr-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">Código</th>
                                <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide min-w-[12rem]">Descripción</th>
                                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">Cant.</th>
                                <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap">P. Unitario</th>
                                <th className={`py-2 text-right text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${acciones ? 'px-2' : 'pl-2 pr-4'}`}>Valor Total</th>
                                {acciones && <th className="pl-1 pr-3 py-2 w-16"><span className="sr-only">Acciones</span></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map((item, i) => (
                                <tr
                                    key={i}
                                    className={item.error
                                        ? 'bg-rose-50 text-rose-800'
                                        : 'text-slate-800 hover:bg-slate-50 transition-colors'}
                                >
                                    {/* Código del ERP primero (2026-09-27): es el que conocen Compras y
                                        el catálogo. El del Cotizador queda debajo cuando difiere. */}
                                    <td className="pl-4 pr-2 py-2 font-mono text-[12px] whitespace-nowrap align-top">
                                        {item.codigoErp ?? item.codigo}
                                        {item.codigoErp && (
                                            <span className={`block text-[11px] ${item.error ? '' : 'text-slate-600'}`} title="Código interno del Cotizador">
                                                {item.codigo}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2 align-top">
                                        <div className="flex items-start gap-1.5">
                                            {item.error && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                                            <span className="min-w-0">
                                                <span className={item.error ? 'font-semibold' : ''}>{item.descripcion}</span>
                                                {/* Categoría y unidad van como segunda línea y no en columnas
                                                    propias (Fase 5): con ellas la tabla no cabía en la columna
                                                    de resultado y el VALOR TOTAL quedaba fuera de la vista. */}
                                                {(item.categoria || item.unidad) && (
                                                    <span className={`block text-[11.5px] ${item.error ? '' : 'text-slate-700'}`}>
                                                        {[item.categoria, item.unidad].filter(Boolean).join(' · ')}
                                                    </span>
                                                )}
                                                <DistintivosLinea item={item} />
                                                {item.personalizada === 'cambiada' && (
                                                    <span className="flex flex-wrap items-center gap-1 mt-0.5">
                                                        <Chip tono="marca" title={comoTexto(item.descripcionOriginal) ?? undefined}>
                                                            Cambiado · antes {String(item.codigoOriginal)}
                                                        </Chip>
                                                        {acciones && (
                                                            <button
                                                                type="button"
                                                                disabled={acciones.ocupado}
                                                                onClick={() => acciones.onDeshacerCambio(String(item.codigoOriginal))}
                                                                className="text-[11px] font-semibold text-templex-700 hover:underline disabled:opacity-40"
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
                                    <td className="px-2 py-2 text-right whitespace-nowrap align-top tabular-nums">{item.cantidad}</td>
                                    <td className="px-2 py-2 text-right whitespace-nowrap align-top tabular-nums">{fmtCOP(item.precioUnitario)}</td>
                                    <td className={`py-2 text-right font-semibold whitespace-nowrap align-top tabular-nums ${item.error ? '' : 'text-slate-900'} ${acciones ? 'px-2' : 'pl-2 pr-4'}`}>{fmtCOP(item.valorTotal)}</td>
                                    {acciones && (
                                        <td className="pl-1 pr-3 py-1.5 text-right whitespace-nowrap align-top">
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
                                                className={`${btnLinea} hover:text-rose-700 hover:bg-rose-50`}
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
                    <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 space-y-2">
                        {quitados.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-800">
                                <span className="font-semibold text-slate-900">Quitados:</span>
                                {quitados.map(q => (
                                    <span key={q.codigo} className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5">
                                        <span className="line-through">{q.codigo}</span>
                                        <button
                                            type="button"
                                            disabled={acciones.ocupado}
                                            onClick={() => acciones.onRestaurar(q.codigo)}
                                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-templex-700 hover:underline disabled:opacity-40"
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
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-templex-700 hover:text-templex-800 disabled:opacity-40"
                        >
                            {acciones.ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Agregar componente
                        </button>
                    </div>
                )}
                </div>
            </section>
        </div>
    );
};

export default ResultadoCalculo;
