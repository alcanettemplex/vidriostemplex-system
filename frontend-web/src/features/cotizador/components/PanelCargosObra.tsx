import React from 'react';
import { toast } from 'react-toastify';
import { HardHat, Plus, Trash2, Truck, Package2, Layers, Wand2, AlertTriangle, Lock } from '../../../components/ui/icons';

import { apiSmoSugerido, apiSmoSugeridoBorrador } from '../services/cotizadorApi';
import { CargoEntrada, CargoPropuesta, OrigenCargo, Parametros, TipoObraSeleccion } from '../types';
import { fmtCOP } from '../format';
import { Chip, BotonSecundario } from './ui';

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
// tienen que caer en la misma columna: de ahí `tabular-nums` junto a
// `font-cotizador-head` en toda celda de dinero. Nada de esto toca el cálculo.
// ─────────────────────────────────────────────────────────────────────────────

/** Etiquetas de los tipos de obra. Réplica deliberada de `ETIQUETA_TIPO_OBRA`
 * de `backend-api/src/cotizador/lib/cargos.ts`: es lo que el backend guarda en
 * `cargo.descripcion` de la línea SMO, así que es también la llave con la que
 * se reconstruye el selector al reabrir una propuesta. Los MONTOS no se copian
 * —salen de `parametros.smo`, editables desde Configuración—; sólo los textos.
 * Si allá cambia una etiqueta, hay que cambiarla aquí o el selector volverá a
 * abrirse en blanco (no rompe nada: el monto guardado se respeta). */
export const ETIQUETA_TIPO_OBRA: Record<TipoObraSeleccion, string> = {
    cabinas: 'Cabinas',
    fachadas: 'Fachadas',
    armadaVentanas: 'Armada de ventanas',
    persiana: 'Persiana',
    otro: 'Otro (monto libre)',
};

const ORDEN_TIPOS_OBRA: TipoObraSeleccion[] = ['cabinas', 'fachadas', 'armadaVentanas', 'persiana', 'otro'];

/** Tarifa vigente de un tipo de obra. `otro` es monto libre y no tiene. */
const tarifaDe = (parametros: Parametros | null, tipoObra: TipoObraSeleccion | ''): number => {
    if (!parametros || !tipoObra || tipoObra === 'otro') return 0;
    return Number(parametros.smo?.[tipoObra]) || 0;
};

// ─── Estado del formulario ──────────────────────────────────────────────────
// El panel NO trabaja con la lista de cargos tal cual la guarda el backend:
// para el vendedor SMO, andamio, huacal y flete son cuatro casillas fijas, no
// cuatro filas de una tabla que podrían repetirse. Sólo "otros" es una lista.
// La traducción a filas la hacen `cargosADTO` / `cargosDesdeApi`, y por eso el
// endpoint es un PUT del juego completo y no un PATCH por línea.

export interface LineaOtroCargo {
    /** Sólo para la key de React y para poder quitar la línea; no viaja nunca. */
    key: string;
    descripcion: string;
    valor: number;
    aplicaIva: boolean;
}

export interface EstadoCargos {
    smo: {
        activo: boolean;
        tipoObra: TipoObraSeleccion | '';
        /** Unidades instaladas. La mano de obra se cobra POR UNIDAD, no por m²
         * (corregido el 2026-09-20): el sistema sugiere la suma de piezas de la
         * propuesta y el vendedor la ajusta. */
        unidades: number;
        /** Valor por unidad, no el total. El total es `unidades × valor`. */
        valor: number;
        origen: OrigenCargo;
        /** Texto que el backend devolvió bajo el campo: "2,4 m² × $60.000". */
        explicacion: string;
        aplicaIva: boolean;
    };
    andamio: { activo: boolean; dias: number; valorUnitario: number; aplicaIva: boolean };
    huacal: { activo: boolean; unidades: number; valorUnitario: number; aplicaIva: boolean };
    flete: { activo: boolean; valor: number; origen: OrigenCargo; aplicaIva: boolean };
    otros: LineaOtroCargo[];
}

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
    smo: { activo: true, tipoObra: '', unidades: 1, valor: 0, origen: 'SUGERIDO', explicacion: '', aplicaIva: true },
    andamio: { activo: false, dias: 1, valorUnitario: Number(parametros?.alquiler_andamio) || 0, aplicaIva: true },
    huacal: { activo: false, unidades: 1, valorUnitario: Number(parametros?.huacal) || 0, aplicaIva: true },
    flete: { activo: true, valor: Number(parametros?.flete_fijo) || 0, origen: 'SUGERIDO', aplicaIva: true },
    otros: [],
});

/** Invierte `ETIQUETA_TIPO_OBRA` para repoblar el selector al reabrir. */
const tipoObraDeEtiqueta = (descripcion: string | null): TipoObraSeleccion | '' => {
    const encontrado = ORDEN_TIPOS_OBRA.find((id) => ETIQUETA_TIPO_OBRA[id] === (descripcion || ''));
    return encontrado ?? '';
};

/** Traduce las filas que devuelve el backend al formulario. Lo que no venga
 * queda apagado con su tarifa de parámetros lista, igual que en una propuesta
 * nueva: una propuesta sin línea de andamio no cotizó andamio. */
export const cargosDesdeApi = (cargos: CargoPropuesta[] | undefined, parametros: Parametros | null): EstadoCargos => {
    const estado = cargosIniciales(parametros);
    estado.smo.activo = false;
    estado.flete.activo = false;
    if (!cargos?.length) return estado;

    for (const c of cargos) {
        const cantidad = Number(c.cantidad) || 0;
        const valorUnitario = Number(c.valorUnitario) || 0;
        const aplicaIva = c.aplicaIva !== false;
        switch (c.tipo) {
            case 'SMO':
                estado.smo = {
                    activo: true,
                    tipoObra: tipoObraDeEtiqueta(c.descripcion),
                    // Una fila anterior al 2026-09-20 trae cantidad 1 y el total
                    // metido en el valor unitario: se lee igual y sigue cuadrando,
                    // sólo que sin desglose.
                    unidades: cantidad || 1,
                    valor: valorUnitario,
                    origen: c.origen === 'SUGERIDO' ? 'SUGERIDO' : 'MANUAL',
                    // La explicación no se persiste (es un texto derivado del área
                    // y de la tarifa del momento): se recupera al volver a pedir
                    // la sugerencia, no al cargar.
                    explicacion: '',
                    aplicaIva,
                };
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

/** El juego completo de cargos tal como lo espera `PUT .../cargos`. Una casilla
 * apagada no manda una fila en cero: no manda nada. */
export const cargosADTO = (e: EstadoCargos): CargoEntrada[] => {
    const filas: CargoEntrada[] = [];
    if (e.smo.activo) {
        filas.push({
            tipo: 'SMO',
            descripcion: e.smo.tipoObra ? ETIQUETA_TIPO_OBRA[e.smo.tipoObra] : 'Mano de obra',
            cantidad: Math.max(0, Number(e.smo.unidades) || 0),
            unidad: 'UND',
            valorUnitario: Math.max(0, Number(e.smo.valor) || 0),
            aplicaIva: e.smo.aplicaIva,
            origen: e.smo.origen,
        });
    }
    if (e.andamio.activo) {
        filas.push({
            tipo: 'ANDAMIO',
            descripcion: 'Alquiler de andamio',
            cantidad: Math.max(0, Number(e.andamio.dias) || 0),
            unidad: 'DIA',
            valorUnitario: Math.max(0, Number(e.andamio.valorUnitario) || 0),
            aplicaIva: e.andamio.aplicaIva,
            origen: 'MANUAL',
        });
    }
    if (e.huacal.activo) {
        filas.push({
            tipo: 'HUACAL',
            descripcion: 'Huacal / embalaje',
            cantidad: Math.max(0, Number(e.huacal.unidades) || 0),
            unidad: 'UND',
            valorUnitario: Math.max(0, Number(e.huacal.valorUnitario) || 0),
            aplicaIva: e.huacal.aplicaIva,
            origen: 'MANUAL',
        });
    }
    if (e.flete.activo) {
        filas.push({
            tipo: 'FLETE',
            descripcion: 'Acarreo / Flete',
            cantidad: 1,
            unidad: 'GLOBAL',
            valorUnitario: Math.max(0, Number(e.flete.valor) || 0),
            aplicaIva: e.flete.aplicaIva,
            origen: e.flete.origen,
        });
    }
    for (const o of e.otros) {
        // Una línea sin texto ni monto es una fila que el vendedor abrió y no
        // llenó: se descarta en vez de imprimirle al cliente un renglón vacío.
        if (!o.descripcion.trim() && !o.valor) continue;
        filas.push({
            tipo: 'OTRO',
            descripcion: o.descripcion.trim().slice(0, 200) || 'Servicio adicional',
            cantidad: 1,
            unidad: 'GLOBAL',
            valorUnitario: Math.max(0, Number(o.valor) || 0),
            aplicaIva: o.aplicaIva,
            origen: 'MANUAL',
        });
    }
    return filas;
};

/** Base de los cargos (sin IVA) y su IVA, sólo para el pie del panel. El número
 * que manda sigue siendo el que devuelve el backend en `propuesta.totales`. */
export const resumenCargos = (e: EstadoCargos, ivaPct: number) => {
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    let base = 0;
    let iva = 0;
    for (const f of cargosADTO(e)) {
        const total = round2((f.cantidad ?? 1) * (f.valorUnitario ?? 0));
        base = round2(base + total);
        if (f.aplicaIva !== false) iva = round2(iva + round2(total * ivaPct));
    }
    return { base, iva, total: round2(base + iva) };
};

// ─── Componente ─────────────────────────────────────────────────────────────

interface Props {
    valor: EstadoCargos;
    onChange: (v: EstadoCargos) => void;
    parametros: Parametros | null;
    /** Contexto de la propuesta ya guardada, si la hay. */
    cotizacionId?: number | null;
    propuestaId?: number | null;
    /** Ítems del carrito todavía sin guardar. Con ellos la sugerencia de mano de
     * obra funciona también en un borrador: el cálculo sigue viviendo en el
     * backend (`POST /smo-sugerido`), que es el único sitio donde se hace, sólo
     * que el carrito viaja en el cuerpo en vez de leerse de la propuesta. */
    itemsBorrador?: Array<{ moduloId?: string; input?: Record<string, unknown>; resultado?: Record<string, unknown> | null }>;
    etiquetaPropuesta?: string | null;
    /** Propuesta anterior al cambio: sus cargos están dentro de los ítems. */
    legado?: boolean;
    onDuplicarLegado?: () => void;
    /** Propuesta elegida de una cotización APROBADA: el backend rechaza cambiar
     * sus cargos (puede haber material cortado), así que se pinta de lectura. */
    aprobada?: boolean;
}

const inputClass = 'w-full min-w-0 h-7 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400';
const numClass = `${inputClass} text-right font-cotizador-head tabular-nums`;

/** Toda celda de dinero lleva estas clases: Space Grotesk para la cifra y
 * `tabular-nums` para que los dígitos ocupen lo mismo. Sin lo segundo, "$
 * 180.000" y "$ 90.000" no caen alineados y la columna deja de leerse de un
 * vistazo, que es la única razón de ser de esta tabla. */
const IMPORTE = 'font-cotizador-head tabular-nums';

/** Rejilla de la tabla: concepto · cantidad · valor unitario · IVA · total.
 *
 * Las columnas de números son `minmax`, no anchos fijos: el panel se pinta a lo
 * ancho en Cotizar y en Actual, pero si alguna vez cae en una columna estrecha
 * las celdas encogen en vez de empujar la página hacia un scroll horizontal.
 *
 * Por debajo de `sm` no hay rejilla: cada fila se apila con `flex-wrap`, y por
 * eso todo input lleva su propio `aria-label` — apilada, la fila pierde de
 * vista la cabecera de columna que la explicaba. */
// La columna de concepto tenía `minmax(0,1fr)`: se estiraba a llenar TODO el
// ancho sobrante del contenedor antes de llegar a la columna de Cantidad, y
// como el panel vivía a lo ancho completo de la pantalla, ese sobrante era un
// hueco muerto enorme entre el texto y los números (evidencia: captura del
// usuario, 2026-09-22). Con un tope de 18rem el checkbox+texto quedan pegados
// a las columnas de plata — el resto del ancho lo libera el panel entero, no
// esta columna sola (ver `max-w-4xl` en el `<section>` de abajo).
const COLUMNAS = 'sm:grid-cols-[minmax(0,18rem)_minmax(4.5rem,7rem)_minmax(5rem,8.5rem)_2.5rem_minmax(5rem,7.5rem)] sm:gap-x-3';
const REJILLA = `flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:grid sm:items-center sm:gap-y-0 ${COLUMNAS}`;

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
    <div className={`px-3 py-1 border-b border-slate-100 transition-colors ${activo ? 'bg-white' : 'bg-slate-50/60'}`}>
        <div className={REJILLA}>
            {/* Concepto */}
            <label className="flex items-center gap-2 min-h-[28px] min-w-[150px] flex-1 sm:min-w-0 cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={activo}
                    disabled={deshabilitado}
                    aria-label={`Incluir ${titulo}`}
                    onChange={(e) => onToggle(e.target.checked)}
                    className="w-[18px] h-[18px] shrink-0 accent-indigo-600"
                />
                <span className={`flex items-center gap-1.5 text-[12.5px] font-bold ${activo ? 'text-slate-700' : 'text-slate-400'}`}>
                    {icono} {titulo}
                </span>
            </label>

            {/* Cantidad + su rótulo de unidad */}
            <div className="flex items-center justify-end gap-1.5 min-w-0">
                {activo && cantidad && (
                    <>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
                            {cantidad.rotulo}
                        </span>
                        <input
                            type="number"
                            min={0}
                            max={cantidad.max}
                            step={1}
                            placeholder="1"
                            aria-label={cantidad.ariaLabel}
                            className={`${numClass} max-w-[64px]`}
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
                        {cantidad && <span className="text-[12px] text-slate-400 shrink-0">×</span>}
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
                            className="w-4 h-4 accent-indigo-600"
                        />
                        <span className="text-[11px] font-bold text-slate-400 sm:hidden">IVA</span>
                    </label>
                )}
            </div>

            {/* Total de la línea */}
            <div className="ml-auto sm:ml-0 text-right">
                <span className={`text-sm font-black ${IMPORTE} ${activo ? 'text-slate-800' : 'text-slate-300'}`}>
                    {activo ? fmtCOP(total) : '—'}
                </span>
            </div>
        </div>

        {activo && pie && <div className="mt-1 sm:pl-[26px]">{pie}</div>}
    </div>
);

const PanelCargosObra: React.FC<Props> = ({
    valor, onChange, parametros, cotizacionId, propuestaId, itemsBorrador, etiquetaPropuesta, legado, onDuplicarLegado,
    aprobada,
}) => {
    const [sugiriendo, setSugiriendo] = React.useState(false);
    const ivaPct = Number(parametros?.iva) || 0;
    const bloqueado = Boolean(legado || aprobada);
    const resumen = resumenCargos(valor, ivaPct);

    const set = (cambios: Partial<EstadoCargos>) => onChange({ ...valor, ...cambios });

    /** ¿Hay de dónde sacar una sugerencia? O la propuesta ya existe en el
     * servidor, o hay ítems en el carrito que mandarle en el cuerpo. */
    const hayContextoSugerencia = Boolean((cotizacionId && propuestaId) || (itemsBorrador?.length ?? 0) > 0);

    /** Pide la sugerencia al backend —único sitio donde se calcula— y la aplica.
     * El cargo vuelve a `SUGERIDO` porque el monto lo puso el sistema.
     *
     * Dos caminos, un solo cálculo: con la propuesta guardada, el backend lee
     * sus ítems; en un borrador se los mandamos. Replicar aquí la fórmula
     * perdería el piso del tablero grande, que depende de `input.anchoCm`. */
    const pedirSugerencia = async (tipoObra: TipoObraSeleccion) => {
        if (!hayContextoSugerencia) return;
        setSugiriendo(true);
        try {
            const { data } = cotizacionId && propuestaId
                ? (await apiSmoSugerido(cotizacionId, propuestaId, tipoObra))
                : (await apiSmoSugeridoBorrador(itemsBorrador ?? [], tipoObra));
            set({
                smo: {
                    ...valor.smo,
                    tipoObra,
                    // `tarifa` es el valor POR UNIDAD y `cantidad` las unidades
                    // sugeridas; el total lo hace la multiplicación, no el backend.
                    unidades: Number(data.cantidad) > 0 ? Number(data.cantidad) : valor.smo.unidades,
                    valor: Number(data.tarifa) || 0,
                    origen: 'SUGERIDO',
                    explicacion: data.explicacion,
                },
            });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo calcular la mano de obra sugerida.');
            set({ smo: { ...valor.smo, tipoObra, explicacion: '' } });
        } finally {
            setSugiriendo(false);
        }
    };

    const cambiarTipoObra = (tipoObra: TipoObraSeleccion | '') => {
        // "Otro" es monto totalmente libre: el backend no sugiere nada para él y
        // rellenar un número inventado llevaría al vendedor a aceptarlo sin
        // pensarlo.
        if (!tipoObra || tipoObra === 'otro') {
            set({ smo: { ...valor.smo, tipoObra, origen: 'MANUAL', explicacion: '' } });
            return;
        }
        if (hayContextoSugerencia) {
            pedirSugerencia(tipoObra);
            return;
        }
        // Carrito vacío: todavía no hay piezas que contar, así que se muestra la
        // tarifa vigente como referencia. En cuanto entre el primer ítem, el
        // selector ya sugiere unidades × tarifa como en una propuesta guardada; y
        // si el vendedor nunca toca el panel, al guardar es el propio backend
        // quien pone la mano de obra y el flete.
        const tarifa = tarifaDe(parametros, tipoObra);
        set({
            smo: {
                ...valor.smo,
                tipoObra,
                origen: 'MANUAL',
                explicacion: tarifa
                    ? `Tarifa vigente ${fmtCOP(tarifa)} por unidad instalada. Las unidades se sugieren en cuanto agregues el primer ítem.`
                    : '',
            },
        });
    };

    const totalSmo = (Number(valor.smo.unidades) || 0) * (Number(valor.smo.valor) || 0);
    const totalAndamio = (Number(valor.andamio.dias) || 0) * (Number(valor.andamio.valorUnitario) || 0);
    const totalHuacal = (Number(valor.huacal.unidades) || 0) * (Number(valor.huacal.valorUnitario) || 0);

    /** Segunda línea de la fila de mano de obra: tipo de obra, botón Sugerir,
     * distintivo de origen y la explicación que devolvió el backend ("3
     * unidades × $60.000"). Va debajo y no en la celda de concepto porque son
     * tres controles: metidos en la columna la estrecharían y la tabla dejaría
     * de alinear, que es justo lo que se buscaba. */
    const pieManoDeObra = (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <select
                    className={`${inputClass} max-w-[240px]`}
                    aria-label="Tipo de obra de la mano de obra"
                    value={valor.smo.tipoObra}
                    disabled={bloqueado || sugiriendo}
                    onChange={(e) => cambiarTipoObra(e.target.value as TipoObraSeleccion | '')}
                >
                    <option value="">Tipo de obra…</option>
                    {ORDEN_TIPOS_OBRA.map((id) => {
                        const tarifa = tarifaDe(parametros, id);
                        return (
                            <option key={id} value={id}>
                                {ETIQUETA_TIPO_OBRA[id]}{tarifa ? ` — ${fmtCOP(tarifa)} c/u` : ''}
                            </option>
                        );
                    })}
                </select>
                {hayContextoSugerencia && valor.smo.tipoObra && valor.smo.tipoObra !== 'otro' && (
                    <BotonSecundario
                        type="button"
                        onClick={() => pedirSugerencia(valor.smo.tipoObra as TipoObraSeleccion)}
                        disabled={bloqueado}
                        cargando={sugiriendo}
                        icono={Wand2}
                        title="Volver a proponer unidades y tarifa"
                        className="shrink-0"
                    >
                        Sugerir
                    </BotonSecundario>
                )}
                <Chip tono={valor.smo.origen === 'SUGERIDO' ? 'indigo' : 'neutro'}>
                    {valor.smo.origen === 'SUGERIDO' ? 'Sugerido' : 'Manual'}
                </Chip>
            </div>
            {valor.smo.explicacion && (
                <p className="mt-1 text-[11px] text-slate-500 leading-snug">{valor.smo.explicacion}</p>
            )}
        </>
    );

    return (
        <section className="h-full border border-slate-200 rounded-xl overflow-hidden bg-white max-w-4xl">
            <header className="bg-gradient-to-b from-indigo-50 to-violet-50 border-b border-indigo-100 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <HardHat className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-800 font-cotizador-head">Cargos de obra</h3>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-indigo-200 text-[10.5px] font-bold text-indigo-700 whitespace-nowrap">
                        Se cobra una vez por propuesta
                    </span>
                    {etiquetaPropuesta && (
                        <span className="text-[11.5px] text-indigo-700 font-bold whitespace-nowrap">
                            Propuesta {etiquetaPropuesta}
                        </span>
                    )}
                </div>
                <div className="text-[11.5px] text-indigo-700 whitespace-nowrap">
                    Base <span className={`${IMPORTE} font-bold text-indigo-950`}>{fmtCOP(resumen.base)}</span>
                    {' · '}IVA <span className={`${IMPORTE} font-bold text-indigo-950`}>{fmtCOP(resumen.iva)}</span>
                </div>
            </header>

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
                        <button onClick={onDuplicarLegado} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition">
                            Duplicar propuesta
                        </button>
                    )}
                </div>
            )}

            <div className={bloqueado ? 'opacity-50 pointer-events-none' : ''}>
                {/* Cabecera de columnas. Oculta en móvil, donde la fila se apila y
                    cada campo se explica con su propio aria-label / rótulo. */}
                <div className={`hidden sm:grid ${COLUMNAS} px-3 py-1 bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wide text-slate-400`}>
                    <span>Concepto</span>
                    <span className="text-right">Cantidad</span>
                    <span className="text-right">Valor unit.</span>
                    <span className="text-center">IVA</span>
                    <span className="text-right">Total</span>
                </div>

                {/* ── Mano de obra ─────────────────────────────────────────────
                    Dos campos desde el 2026-09-20 (unidades × valor unitario): se
                    cobra por unidad instalada, no por m². */}
                <FilaCargo
                    icono={<HardHat className="w-3.5 h-3.5" />}
                    titulo="Mano de obra"
                    activo={valor.smo.activo}
                    onToggle={(v) => set({ smo: { ...valor.smo, activo: v } })}
                    deshabilitado={bloqueado}
                    total={totalSmo}
                    aplicaIva={valor.smo.aplicaIva}
                    onAplicaIva={(v) => set({ smo: { ...valor.smo, aplicaIva: v } })}
                    cantidad={{
                        valor: valor.smo.unidades,
                        rotulo: 'Und.',
                        ariaLabel: 'Unidades de mano de obra',
                        // Si el vendedor cambia cualquiera de los dos, el cargo deja
                        // de ser el que sugirió el sistema: pasa a MANUAL y se queda
                        // como esté.
                        onChange: (n) => set({ smo: { ...valor.smo, unidades: n, origen: 'MANUAL' } }),
                    }}
                    unitario={{
                        valor: valor.smo.valor,
                        ariaLabel: 'Valor por unidad de mano de obra',
                        onChange: (n) => set({ smo: { ...valor.smo, valor: n, origen: 'MANUAL' } }),
                    }}
                    pie={pieManoDeObra}
                />

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
                        <Chip tono={valor.flete.origen === 'SUGERIDO' ? 'indigo' : 'neutro'}>
                            {valor.flete.origen === 'SUGERIDO' ? 'Sugerido' : 'Manual'}
                        </Chip>
                    }
                />

                {/* ── Otros servicios ──────────────────────────────────────────
                    Única sección que sigue siendo una LISTA: líneas que se añaden
                    y se quitan, con su descripción libre. Se pintan con la misma
                    rejilla para que su importe caiga en la columna de totales. */}
                <div className="flex items-center justify-between gap-2 px-3 py-1 bg-slate-50/70 border-b border-slate-100">
                    <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
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
                    <p className="px-3 py-1.5 text-[11.5px] text-slate-400 border-b border-slate-100">
                        Sin servicios adicionales.
                    </p>
                ) : (
                    valor.otros.map((o, i) => (
                        <div key={o.key} className="px-3 py-1 border-b border-slate-100">
                            <div className={REJILLA}>
                                {/* Concepto: descripción libre + quitar la línea */}
                                <div className="flex items-center gap-1.5 min-w-[150px] flex-1 sm:min-w-0">
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
                                        className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Sin cantidad: los servicios sueltos son globales. */}
                                <div className="hidden sm:block" />

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
                                            className="w-4 h-4 accent-indigo-600"
                                        />
                                        <span className="text-[11px] font-bold text-slate-400 sm:hidden">IVA</span>
                                    </label>
                                </div>

                                <div className="ml-auto sm:ml-0 text-right">
                                    <span className={`text-sm font-black text-slate-800 ${IMPORTE}`}>
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
                    <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-slate-500 sm:col-span-4 sm:text-right">
                        Subtotal cargos
                    </span>
                    <span className={`text-[15px] font-black text-slate-900 text-right ${IMPORTE}`}>
                        {fmtCOP(resumen.base)}
                    </span>
                </div>

                {!cotizacionId && (
                    <p className="px-3 py-1.5 text-[11px] text-slate-400 leading-snug">
                        Los cargos se guardan junto con la cotización. Si no tocas este panel, al guardarla el sistema
                        añade la mano de obra y el flete sugeridos según los ítems.
                    </p>
                )}
            </div>
        </section>
    );
};

export default PanelCargosObra;
