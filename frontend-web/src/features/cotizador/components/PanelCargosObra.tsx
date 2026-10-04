import React from 'react';
import {
    HardHat, Plus, Trash2, Truck, Package2, Layers, AlertTriangle, Lock, Loader2,
} from '../../../components/ui/icons';

import { CargoPropuesta, LineaManoObra, Parametros } from '../types';
import { EstadoCargos, LineaOtroCargo, cargosADTO, resumenCargos } from '../totalesContrato';
import { fmtCOP } from '../format';
import { Chip, BotonSecundario } from './ui';

export type { EstadoCargos, LineaOtroCargo };
export { cargosADTO };

// ─────────────────────────────────────────────────────────────────────────────
// Panel de CARGOS DE OBRA de una propuesta — mano de obra (SMO), alquiler de
// andamio, huacal, flete y servicios sueltos.
//
// POR QUÉ EXISTE (2026-09-20)
// Hasta hoy la mano de obra y el flete eran dos líneas más del BOM de cada
// ítem, y el motor multiplica TODA línea del BOM por `cantidadPiezas`: una
// ventana con 5 piezas cobraba 5 fletes y 5 manos de obra, y una cotización de
// 3 productos, 3 fletes más. Ahora son filas hermanas colgadas de la PROPUESTA
// y se cobran UNA vez — de ahí el rótulo fijo del encabezado, que no es
// decorativo: es la regla que el vendedor tiene que poder leer sin preguntar.
//
// Los cargos van FUERA del AIU y FUERA del descuento, pero SÍ llevan IVA salvo
// que la línea diga lo contrario (el caso real es el proveedor de andamios que
// factura sin IVA). El panel no calcula el total de la propuesta: sólo el de
// sus propias líneas, para que el vendedor vea lo que está sumando. La cadena
// completa la resuelve el backend en `lib/cargos.ts`, en un solo sitio.
//
// UN SOLO ESTADO, DOS VENTANAS: el dueño del `EstadoCargos` es `CotizadorPage`,
// y este componente se pinta igual en la pestaña Cotizar (siempre visible, lo
// pidió el usuario) y en Actual. Editar en una es editar en la otra.
//
// FORMA (2026-09-20): los cargos se leen como una TABLA de cuatro columnas
// —concepto · cantidad × valor unitario · total— y no como cinco tarjetas
// apiladas. El vendedor compara importes verticalmente, y para eso los dígitos
// tienen que caer en la misma columna: de ahí `tabular-nums` en toda celda de
// dinero. Nada de esto toca el cálculo.
//
// SISTEMA VISUAL (2026-09-26, Fase 5): acento `templex` en vez de índigo, texto
// en negro según su rol, sin fuente propia (Geist ya alinea las cifras). Las
// columnas numéricas ganaron anchos mínimos reales —la de cantidad no cabía su
// rótulo "Und." más el campo y el icono se montaba encima— y la rejilla se
// activa desde `md` en vez de `sm`: por debajo, cada fila se apila.
//
// SOLO EN ACTUAL (2026-09-26, mesa de trabajo): en Cotizar los cargos se editan
// en el resumen de la derecha (`ResumenPropuesta`, versión compacta con el
// mismo estado). Este panel es la vista completa —con IVA por línea— y dejó de
// tener modo plegable, que solo usaba el antiguo paso 3 de Cotizar.
//
// MANO DE OBRA POR PRODUCTO (2026-09-26): el selector "Mano de obra por tipo de
// obra" (SMO) salió. Ensamble e instalación se calculan solos en el backend
// desde los productos (m² de ventanas/proyectantes/espejos/tableros, unidades de
// cabinas; ver `calcularManoObraProductos`) y aquí se pintan de SOLO LECTURA,
// arriba de la tabla. A diferencia del resto de cargos llevan AIU y descuento.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Estado del formulario ──────────────────────────────────────────────────
// El panel NO trabaja con la lista de cargos tal cual la guarda el backend:
// para el vendedor SMO, andamio, huacal y flete son cuatro casillas fijas, no
// cuatro filas de una tabla que podrían repetirse. Sólo "otros" es una lista.
// La traducción a filas la hacen `cargosADTO` / `cargosDesdeApi`, y por eso el
// endpoint es un PUT del juego completo y no un PATCH por línea.

// `LineaOtroCargo` y `EstadoCargos` viven en `../totalesContrato.ts` (sin React)
// para que la prueba de contrato del backend pueda importarlos.

const nuevaKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Estado de arranque de una propuesta que todavía no existe en el servidor.
 *
 * Andamio y huacal arrancan APAGADOS, no en cero: es la misma invariante que
 * defiende la calibración del módulo (AUSENTE ≠ CERO). Una línea de andamio en
 * $0 en la cotización impresa le dice al cliente que el andamio es gratis,
 * cuando lo que pasa es que nadie lo ha cotizado. Sus tarifas sí se precargan
 * para que encenderlos sea un clic.
 */
export const cargosIniciales = (parametros: Parametros | null): EstadoCargos => ({
    andamio: { activo: false, dias: 1, valorUnitario: Number(parametros?.alquiler_andamio) || 0, aplicaIva: true },
    huacal: { activo: false, unidades: 1, valorUnitario: Number(parametros?.huacal) || 0, aplicaIva: true },
    flete: { activo: true, valor: Number(parametros?.flete_fijo) || 0, origen: 'SUGERIDO', aplicaIva: true },
    otros: [],
});

/** Traduce las filas que devuelve el backend al formulario. Lo que no venga
 * queda apagado con su tarifa de parámetros lista, igual que en una propuesta
 * nueva: una propuesta sin línea de andamio no cotizó andamio. */
export const cargosDesdeApi = (cargos: CargoPropuesta[] | undefined, parametros: Parametros | null): EstadoCargos => {
    const estado = cargosIniciales(parametros);
    estado.flete.activo = false;
    if (!cargos?.length) return estado;

    for (const c of cargos) {
        const cantidad = Number(c.cantidad) || 0;
        const valorUnitario = Number(c.valorUnitario) || 0;
        const aplicaIva = c.aplicaIva !== false;
        switch (c.tipo) {
            case 'ENSAMBLE':
            case 'INSTALACION':
                // Mano de obra por producto: la calcula el backend desde los
                // ítems y el panel la recibe aparte. No es parte del formulario.
                break;
            case 'SMO':
                // Mano de obra de una propuesta guardada antes del 2026-09-26. Se
                // conserva como servicio adicional (un monto global) para no
                // perder el dato; el vendedor decide si la quita.
                estado.otros.push({
                    key: nuevaKey(),
                    descripcion: `Mano de obra anterior${c.descripcion ? ` (${c.descripcion})` : ''}`,
                    valor: Math.round((cantidad || 1) * valorUnitario * 100) / 100,
                    aplicaIva,
                });
                break;
            case 'ANDAMIO':
                estado.andamio = { activo: true, dias: cantidad || 1, valorUnitario, aplicaIva };
                break;
            case 'HUACAL':
                estado.huacal = { activo: true, unidades: cantidad || 1, valorUnitario, aplicaIva };
                break;
            case 'FLETE':
                estado.flete = {
                    activo: true,
                    valor: valorUnitario,
                    origen: c.origen === 'SUGERIDO' ? 'SUGERIDO' : 'MANUAL',
                    aplicaIva,
                };
                break;
            default:
                estado.otros.push({
                    key: nuevaKey(),
                    descripcion: c.descripcion || '',
                    valor: valorUnitario,
                    aplicaIva,
                });
        }
    }
    return estado;
};

// `cargosADTO` y `resumenCargos` viven en `../totalesContrato.ts` (2026-10-03).

// ─── Componente ─────────────────────────────────────────────────────────────

interface Props {
    valor: EstadoCargos;
    onChange: (v: EstadoCargos) => void;
    parametros: Parametros | null;
    /** Hay cotización guardada (solo cambia el texto de ayuda del pie). */
    cotizacionId?: number | null;
    /** Mano de obra por producto que calculó el backend para estos ítems
     * (`useManoObra`). Se pinta de solo lectura. */
    manoObra: LineaManoObra[];
    cargandoManoObra?: boolean;
    /** Aclaración bajo la mano de obra, p. ej. que incluye el producto en pantalla. */
    notaManoObra?: string | null;
    etiquetaPropuesta?: string | null;
    /** Propuesta anterior al cambio: sus cargos están dentro de los ítems. */
    legado?: boolean;
    onDuplicarLegado?: () => void;
    /** Propuesta elegida de una cotización APROBADA: el backend rechaza cambiar
     * sus cargos (puede haber material cortado), así que se pinta de lectura. */
    aprobada?: boolean;
}

const inputClass = 'w-full min-w-0 h-8 px-2 text-sm text-slate-900 border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 hover:border-slate-400 focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200 disabled:bg-slate-50 disabled:text-slate-500';
const numClass = `${inputClass} text-right tabular-nums`;

/** Toda celda de dinero lleva `tabular-nums` para que los dígitos ocupen lo
 * mismo (Geist ya lo trae global; se deja explícito porque es la razón de ser
 * de la tabla). Sin eso, "$ 180.000" y "$ 90.000" no caen alineados y la
 * columna deja de leerse de un vistazo. */
const IMPORTE = 'tabular-nums';

/** Rejilla de la tabla: concepto · cantidad · valor unitario · IVA · total.
 *
 * Las columnas de números son `minmax`, no anchos fijos: el panel se pinta a lo
 * ancho en Cotizar y en Actual, pero si alguna vez cae en una columna estrecha
 * las celdas encogen en vez de empujar la página hacia un scroll horizontal.
 *
 * Por debajo de `md` no hay rejilla: cada fila se apila con `flex-wrap`, y por
 * eso todo input lleva su propio `aria-label` — apilada, la fila pierde de
 * vista la cabecera de columna que la explicaba. */
// La columna de concepto tenía `minmax(0,1fr)`: se estiraba a llenar TODO el
// ancho sobrante del contenedor antes de llegar a la columna de Cantidad, y
// como el panel vivía a lo ancho completo de la pantalla, ese sobrante era un
// hueco muerto enorme entre el texto y los números (evidencia: captura del
// usuario, 2026-09-22). Con un tope de 18rem el checkbox+texto quedan pegados
// a las columnas de plata — el resto del ancho lo libera el panel entero, no
// esta columna sola (ver `max-w-4xl` en el `<section>` de abajo).
//
// 2026-09-26: los mínimos de las columnas numéricas eran menores que lo que
// contienen (la de cantidad lleva el rótulo "Und." + un campo de 64 px en
// 4,5rem), y en la columna estrecha de antes el contenido se desbordaba sobre
// la vecina. Ahora cada mínimo cabe su contenido, el concepto tiene un piso de
// 11rem para que "Mano de obra" no se parta, y la rejilla arranca en `md`.
const COLUMNAS = 'md:grid-cols-[minmax(11rem,18rem)_minmax(8rem,9rem)_minmax(8.5rem,10rem)_2.75rem_minmax(7rem,8.5rem)] md:gap-x-4';
const REJILLA = `flex flex-wrap items-center gap-x-3 gap-y-1.5 md:grid md:items-center md:gap-y-0 ${COLUMNAS}`;

/** Los campos numéricos se muestran vacíos cuando valen 0: un "0" escrito en un
 * campo de dinero se confunde con un importe decidido. El placeholder recuerda
 * que vacío es cero. */
const num = (n: number) => (n ? String(n) : '');

interface CampoNumero {
    valor: number;
    ariaLabel: string;
    onChange: (n: number) => void;
}

/**
 * Una fila de la tabla. Presentación pura: recibe ya resueltos el total y los
 * manejadores; no sabe de qué cargo se trata más allá de su rótulo.
 *
 * Cuando la casilla está apagada, las celdas de cantidad/valor/IVA quedan
 * vacías y el total muestra un guion — no un `$ 0`, que en un cargo apagado
 * diría "esto cuesta cero" cuando lo que dice es "esto no se cotizó".
 */
const FilaCargo: React.FC<{
    icono: React.ReactNode;
    titulo: string;
    activo: boolean;
    onToggle: (v: boolean) => void;
    deshabilitado?: boolean;
    total: number;
    aplicaIva: boolean;
    onAplicaIva: (v: boolean) => void;
    /** Cantidad editable con su rótulo de unidad. Ausente = cargo global (flete). */
    cantidad?: CampoNumero & { rotulo: string; max?: number };
    unitario: CampoNumero;
    /** Controles propios de la fila (selector de obra, Sugerir, explicación). */
    pie?: React.ReactNode;
}> = ({ icono, titulo, activo, onToggle, deshabilitado, total, aplicaIva, onAplicaIva, cantidad, unitario, pie }) => (
    <div className={`px-3 py-1.5 border-b border-slate-100 transition-colors ${activo ? 'bg-white' : 'bg-slate-50/60'}`}>
        <div className={REJILLA}>
            {/* Concepto */}
            <label className="flex items-center gap-2 min-h-[32px] min-w-[150px] flex-1 md:min-w-0 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={activo}
                    disabled={deshabilitado}
                    aria-label={`Incluir ${titulo}`}
                    onChange={(e) => onToggle(e.target.checked)}
                    className="w-[18px] h-[18px] shrink-0 accent-templex-600"
                />
                {/* Apagado sigue legible (slate-700): es una opción que el
                    vendedor puede encender, no texto deshabilitado. */}
                <span className={`flex items-center gap-1.5 min-w-0 text-[13px] font-semibold ${activo ? 'text-slate-900' : 'text-slate-700'}`}>
                    <span className={`shrink-0 ${activo ? 'text-templex-600' : 'text-slate-500'}`}>{icono}</span>
                    <span className="whitespace-nowrap">{titulo}</span>
                </span>
            </label>

            {/* Cantidad + su rótulo de unidad */}
            <div className="flex items-center justify-end gap-1.5 min-w-0">
                {activo && cantidad && (
                    <>
                        <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                            {cantidad.rotulo}
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={cantidad.max}
                            step={1}
                            placeholder="1"
                            aria-label={cantidad.ariaLabel}
                            className={`${numClass} w-16 shrink-0`}
                            value={num(cantidad.valor)}
                            disabled={deshabilitado}
                            onChange={(e) => cantidad.onChange(Number(e.target.value) || 0)}
                        />
                    </>
                )}
            </div>

            {/* Valor unitario */}
            <div className="flex items-center justify-end gap-1 min-w-0">
                {activo && (
                    <>
                        {cantidad && <span className="text-[12px] text-slate-600 shrink-0" aria-hidden="true">×</span>}
                        <input
                            type="number"
                            min={0}
                            step={1000}
                            placeholder="0"
                            aria-label={unitario.ariaLabel}
                            className={`${numClass} max-w-[120px]`}
                            value={num(unitario.valor)}
                            disabled={deshabilitado}
                            onChange={(e) => unitario.onChange(Number(e.target.value) || 0)}
                        />
                    </>
                )}
            </div>

            {/* IVA de la línea */}
            <div className="flex items-center justify-center">
                {activo && (
                    <label
                        className="inline-flex items-center justify-center gap-1 min-h-[28px] min-w-[28px] cursor-pointer select-none"
                        title="Desmarcar sólo si el proveedor factura sin IVA"
                    >
                        <input
                            type="checkbox"
                            checked={aplicaIva}
                            disabled={deshabilitado}
                            aria-label={`Aplicar IVA a ${titulo}`}
                            onChange={(e) => onAplicaIva(e.target.checked)}
                            className="w-4 h-4 accent-templex-600"
                        />
                        <span className="text-[11px] font-semibold text-slate-800 md:hidden">IVA</span>
                    </label>
                )}
            </div>

            {/* Total de la línea */}
            <div className="ml-auto md:ml-0 text-right whitespace-nowrap">
                <span className={`text-sm ${IMPORTE} ${activo ? 'font-bold text-slate-900' : 'text-slate-400'}`}>
                    {activo ? fmtCOP(total) : '—'}
                </span>
            </div>
        </div>

        {activo && pie && <div className="mt-1 md:pl-[26px]">{pie}</div>}
    </div>
);

const PanelCargosObra: React.FC<Props> = ({
    valor, onChange, parametros, cotizacionId, manoObra, cargandoManoObra, notaManoObra,
    etiquetaPropuesta, legado, onDuplicarLegado, aprobada,
}) => {
    const ivaPct = Number(parametros?.iva) || 0;
    const totalManoObra = manoObra.reduce((acc, l) => acc + Math.round(l.cantidad * l.valorUnitario * 100) / 100, 0);
    const bloqueado = Boolean(legado || aprobada);
    const resumen = resumenCargos(valor, ivaPct);


    const set = (cambios: Partial<EstadoCargos>) => onChange({ ...valor, ...cambios });

    const totalAndamio = (Number(valor.andamio.dias) || 0) * (Number(valor.andamio.valorUnitario) || 0);
    const totalHuacal = (Number(valor.huacal.unidades) || 0) * (Number(valor.huacal.valorUnitario) || 0);


    const titulo = (
        <>
            <HardHat className="w-4 h-4 text-templex-600 shrink-0" />
            <span className="text-sm font-bold text-slate-900">Cargos de obra</span>
        </>
    );

    return (
        <section className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-card h-full max-w-4xl">
            <header className="bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 className="flex items-center gap-2">{titulo}</h3>
                    <Chip tono="marca">Se cobra una vez por propuesta</Chip>
                    {etiquetaPropuesta && (
                        <span className="text-[12px] text-slate-900 font-semibold whitespace-nowrap">
                            Propuesta {etiquetaPropuesta}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3 text-[12px] text-slate-800 whitespace-nowrap">
                    <span>
                        Mano de obra <span className={`${IMPORTE} font-bold text-slate-900`}>{fmtCOP(totalManoObra)}</span>
                        {' · '}Cargos <span className={`${IMPORTE} font-bold text-slate-900`}>{fmtCOP(resumen.base)}</span>
                    </span>
                </div>
            </header>

            <div>
            {aprobada && !legado && (
                <div className="m-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12.5px] text-emerald-800">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="flex-1">
                        La cotización está aprobada y esta es la propuesta elegida: sus cargos no se pueden cambiar.
                        Pasa la cotización a Pendiente para editarlos.
                    </p>
                </div>
            )}

            {legado && (
                <div className="m-3 flex flex-wrap items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p className="flex-1 min-w-[220px]">
                        Esta propuesta es anterior al cambio de cargos: su mano de obra y su flete ya están dentro del
                        precio de cada ítem. Añadírselos aquí cobraría lo mismo dos veces. Duplícala para trabajar con
                        la forma nueva.
                    </p>
                    {onDuplicarLegado && (
                        <button onClick={onDuplicarLegado} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition">
                            Duplicar propuesta
                        </button>
                    )}
                </div>
            )}

            <div className={bloqueado ? 'opacity-50 pointer-events-none' : ''}>
                {/* Cabecera de columnas. Oculta en móvil, donde la fila se apila y
                    cada campo se explica con su propio aria-label / rótulo. */}
                <div className={`hidden md:grid ${COLUMNAS} px-3 py-1.5 bg-white border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-900`}>
                    <span>Concepto</span>
                    <span className="text-right">Cantidad</span>
                    <span className="text-right">Valor unit.</span>
                    <span className="text-center">IVA</span>
                    <span className="text-right">Total</span>
                </div>

                {/* ── Mano de obra de productos (2026-09-26) ───────────────────
                    Solo lectura: la calcula el backend desde los productos. Va
                    primero porque entra en la cuenta ANTES del descuento. */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/70 border-b border-slate-100">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 flex items-center gap-1.5">
                        Mano de obra de productos
                        {cargandoManoObra && <Loader2 className="w-3 h-3 animate-spin text-slate-600" />}
                    </span>
                    <Chip tono="marca">Automática · lleva AIU y descuento</Chip>
                </div>
                {manoObra.length === 0 ? (
                    <p className="px-3 py-1.5 text-[12px] text-slate-700 border-b border-slate-100">
                        Sin mano de obra: se calcula sola al agregar ventanas o proyectantes (ensamble), y cabinas,
                        espejos o tableros con "Con instalación" marcado.
                    </p>
                ) : (
                    manoObra.map((l) => (
                        <div key={`${l.tipo}-${l.descripcion}`} className="px-3 py-1.5 border-b border-slate-100 bg-white">
                            <div className={REJILLA}>
                                <span className="flex items-center gap-2 min-h-[32px] min-w-[150px] flex-1 md:min-w-0 text-[13px] font-semibold text-slate-900">
                                    <HardHat className="w-3.5 h-3.5 shrink-0 text-templex-600 ml-[26px]" />
                                    <span className="whitespace-nowrap">{l.descripcion}</span>
                                </span>
                                <span className={`text-right text-[12.5px] text-slate-900 ${IMPORTE}`}>
                                    {l.cantidad.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {l.unidad === 'M2' ? 'm²' : 'und'}
                                </span>
                                <span className={`text-right text-[12.5px] text-slate-900 ${IMPORTE}`}>
                                    × {fmtCOP(l.valorUnitario)}
                                </span>
                                <span className="text-center text-[11px] font-semibold text-slate-800">{l.aplicaIva ? 'Sí' : 'No'}</span>
                                <span className={`ml-auto md:ml-0 text-right whitespace-nowrap text-sm font-bold text-slate-900 ${IMPORTE}`}>
                                    {fmtCOP(Math.round(l.cantidad * l.valorUnitario * 100) / 100)}
                                </span>
                            </div>
                            {l.explicacion && (
                                <p className="mt-0.5 md:pl-[26px] text-[11.5px] text-slate-700 leading-snug">{l.explicacion}</p>
                            )}
                        </div>
                    ))
                )}
                {notaManoObra && manoObra.length > 0 && (
                    <p className="px-3 py-1 text-[11.5px] text-slate-700 border-b border-slate-100">{notaManoObra}</p>
                )}

                <div className="px-3 py-1.5 bg-slate-50/70 border-b border-slate-100">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                        Cargos de la obra · sin AIU ni descuento
                    </span>
                </div>

                {/* ── Andamio ──────────────────────────────────────────────── */}
                <FilaCargo
                    icono={<Layers className="w-3.5 h-3.5" />}
                    titulo="Alquiler de andamio"
                    activo={valor.andamio.activo}
                    onToggle={(v) => set({ andamio: { ...valor.andamio, activo: v } })}
                    deshabilitado={bloqueado}
                    total={totalAndamio}
                    aplicaIva={valor.andamio.aplicaIva}
                    onAplicaIva={(v) => set({ andamio: { ...valor.andamio, aplicaIva: v } })}
                    cantidad={{
                        valor: valor.andamio.dias,
                        rotulo: 'Días',
                        ariaLabel: 'Días de alquiler de andamio',
                        max: 10000,
                        onChange: (n) => set({ andamio: { ...valor.andamio, dias: n } }),
                    }}
                    unitario={{
                        valor: valor.andamio.valorUnitario,
                        ariaLabel: 'Valor por día de andamio',
                        onChange: (n) => set({ andamio: { ...valor.andamio, valorUnitario: n } }),
                    }}
                />

                {/* ── Huacal ───────────────────────────────────────────────── */}
                <FilaCargo
                    icono={<Package2 className="w-3.5 h-3.5" />}
                    titulo="Huacal / embalaje"
                    activo={valor.huacal.activo}
                    onToggle={(v) => set({ huacal: { ...valor.huacal, activo: v } })}
                    deshabilitado={bloqueado}
                    total={totalHuacal}
                    aplicaIva={valor.huacal.aplicaIva}
                    onAplicaIva={(v) => set({ huacal: { ...valor.huacal, aplicaIva: v } })}
                    cantidad={{
                        valor: valor.huacal.unidades,
                        rotulo: 'Und.',
                        ariaLabel: 'Unidades de huacal o embalaje',
                        max: 10000,
                        onChange: (n) => set({ huacal: { ...valor.huacal, unidades: n } }),
                    }}
                    unitario={{
                        valor: valor.huacal.valorUnitario,
                        ariaLabel: 'Valor por unidad de huacal o embalaje',
                        onChange: (n) => set({ huacal: { ...valor.huacal, valorUnitario: n } }),
                    }}
                />

                {/* ── Flete ────────────────────────────────────────────────────
                    Sin columna de cantidad: es un global. Admite 0, porque hay
                    obras a las que el cliente manda su propio transporte y ahí el
                    flete es cero de verdad, no "ausente". */}
                <FilaCargo
                    icono={<Truck className="w-3.5 h-3.5" />}
                    titulo="Acarreo / flete"
                    activo={valor.flete.activo}
                    onToggle={(v) => set({ flete: { ...valor.flete, activo: v } })}
                    deshabilitado={bloqueado}
                    total={Number(valor.flete.valor) || 0}
                    aplicaIva={valor.flete.aplicaIva}
                    onAplicaIva={(v) => set({ flete: { ...valor.flete, aplicaIva: v } })}
                    unitario={{
                        valor: valor.flete.valor,
                        ariaLabel: 'Valor del acarreo o flete',
                        onChange: (n) => set({ flete: { ...valor.flete, valor: n, origen: 'MANUAL' } }),
                    }}
                    pie={
                        <Chip tono={valor.flete.origen === 'SUGERIDO' ? 'marca' : 'neutro'}>
                            {valor.flete.origen === 'SUGERIDO' ? 'Sugerido' : 'Manual'}
                        </Chip>
                    }
                />

                {/* ── Otros servicios ──────────────────────────────────────────
                    Única sección que sigue siendo una LISTA: líneas que se añaden
                    y se quitan, con su descripción libre. Se pintan con la misma
                    rejilla para que su importe caiga en la columna de totales. */}
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50/70 border-b border-slate-100">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">
                        Otros servicios
                    </span>
                    <BotonSecundario
                        type="button"
                        disabled={bloqueado}
                        icono={Plus}
                        onClick={() => set({ otros: [...valor.otros, { key: nuevaKey(), descripcion: '', valor: 0, aplicaIva: true }] })}
                        className="shrink-0"
                    >
                        Añadir línea
                    </BotonSecundario>
                </div>

                {valor.otros.length === 0 ? (
                    <p className="px-3 py-1.5 text-[12px] text-slate-700 border-b border-slate-100">
                        Sin servicios adicionales.
                    </p>
                ) : (
                    valor.otros.map((o, i) => (
                        <div key={o.key} className="px-3 py-1.5 border-b border-slate-100">
                            <div className={REJILLA}>
                                {/* Concepto: descripción libre + quitar la línea */}
                                <div className="flex items-center gap-1.5 min-w-[150px] flex-1 md:min-w-0">
                                    <input
                                        className={inputClass}
                                        placeholder="Descripción del servicio"
                                        aria-label={`Descripción del servicio adicional ${i + 1}`}
                                        maxLength={200}
                                        value={o.descripcion}
                                        disabled={bloqueado}
                                        onChange={(e) => {
                                            const otros = [...valor.otros];
                                            otros[i] = { ...o, descripcion: e.target.value };
                                            set({ otros });
                                        }}
                                    />
                                    <button
                                        type="button"
                                        disabled={bloqueado}
                                        onClick={() => set({ otros: valor.otros.filter((x) => x.key !== o.key) })}
                                        title="Quitar esta línea"
                                        aria-label={`Quitar el servicio adicional ${i + 1}`}
                                        className="shrink-0 p-2 rounded-lg text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition disabled:opacity-40"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Sin cantidad: los servicios sueltos son globales. */}
                                <div className="hidden md:block" />

                                <div className="flex items-center justify-end min-w-0">
                                    <input
                                        type="number" min={0} step={1000} placeholder="0"
                                        aria-label={`Valor del servicio adicional ${i + 1}`}
                                        className={`${numClass} max-w-[120px]`}
                                        value={num(o.valor)}
                                        disabled={bloqueado}
                                        onChange={(e) => {
                                            const otros = [...valor.otros];
                                            otros[i] = { ...o, valor: Number(e.target.value) || 0 };
                                            set({ otros });
                                        }}
                                    />
                                </div>

                                <div className="flex items-center justify-center">
                                    <label
                                        className="inline-flex items-center justify-center gap-1 min-h-[32px] min-w-[32px] cursor-pointer select-none"
                                        title="Desmarcar sólo si el proveedor factura sin IVA"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={o.aplicaIva}
                                            disabled={bloqueado}
                                            aria-label={`Aplicar IVA al servicio adicional ${i + 1}`}
                                            onChange={(e) => {
                                                const otros = [...valor.otros];
                                                otros[i] = { ...o, aplicaIva: e.target.checked };
                                                set({ otros });
                                            }}
                                            className="w-4 h-4 accent-templex-600"
                                        />
                                        <span className="text-[11px] font-semibold text-slate-800 md:hidden">IVA</span>
                                    </label>
                                </div>

                                <div className="ml-auto md:ml-0 text-right whitespace-nowrap">
                                    <span className={`text-sm font-bold text-slate-900 ${IMPORTE}`}>
                                        {fmtCOP(Number(o.valor) || 0)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {/* ── Subtotal ─────────────────────────────────────────────────
                    Sólo la suma de estas líneas, sin IVA: el total de la propuesta
                    lo sigue calculando el backend. La línea punteada lo separa de
                    los cargos para que no se lea como una fila más. */}
                <div className={`px-3 py-2 border-t border-dashed border-slate-300 bg-slate-50/40 justify-between ${REJILLA}`}>
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-900 md:col-span-4 md:text-right">
                        Subtotal cargos
                    </span>
                    <span className={`text-[15px] font-bold text-slate-900 text-right whitespace-nowrap ${IMPORTE}`}>
                        {fmtCOP(resumen.base)}
                    </span>
                </div>

                {!cotizacionId && (
                    <p className="px-3 py-2 text-[11.5px] text-slate-700 leading-snug">
                        Los cargos se guardan junto con la cotización. La mano de obra se calcula sola desde los
                        productos; si no tocas este panel, al guardarla el sistema añade el flete sugerido.
                    </p>
                )}
            </div>
            </div>
        </section>
    );
};

export default PanelCargosObra;
