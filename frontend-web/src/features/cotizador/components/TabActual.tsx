import React, { useMemo, useState } from 'react';
import {
    Trash2, Inbox, AlertTriangle, Save, Package, Plus, Copy, Layers,
    CheckCircle2, Scale, FilePlus2, User, Briefcase, Receipt,
} from 'lucide-react';

import { fmtCOP, fmtPct } from '../format';
import {
    ClienteCotizacion, EstadoCotizacion, ItemCarrito, Parametros, Propuesta, SegmentoCliente,
} from '../types';
import { CabeceraCotizacion } from '../CotizadorPage';
import PanelCargosObra, { EstadoCargos, resumenCargos } from './PanelCargosObra';
import ComparadorPropuestas from './ComparadorPropuestas';
import { BotonPrimario, BotonSecundario, Chip, EstadoVacio, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Actual": la propuesta que se está armando, de principio a fin.
//
// Desde el 2026-09-20 su alcance creció: además de la cabecera (cliente y
// comercial) y del carrito, gobierna las PROPUESTAS de la cotización (chips
// A/B/C con nueva / duplicar / variante / elegir / borrar), el descuento ÚNICO
// de la propuesta y su panel de cargos de obra.
//
// Sigue sin calcular ni persistir nada por su cuenta: el dueño del estado y de
// las llamadas es `CotizadorPage`, y este componente sólo notifica hacia arriba
// (mismo patrón que `FormularioModulo` con `onResultado`). La única aritmética
// que hace es la PREVISUALIZACIÓN de los totales mientras hay cambios sin
// guardar — ver `totalesPrevistos`, y por qué no puede evitarse.
//
// Rediseño visual 2026-09-20 (misma sesión, después del de Cotizar): mismos
// datos, mismos controles y mismas reglas; lo que cambia es la presentación.
// Todo se agrupa en las `Tarjeta` de `components/ui` para que las dos pestañas
// se lean igual, el carrito pasa de una pila de fichas a una TABLA compacta
// —con el subtotal de cada línea y el rótulo "a precio lleno" en la cabecera,
// una vez, en vez de repetido en cada fila— y el TOTAL de la propuesta deja de
// pesar lo mismo que los cuatro parciales: es el número que el vendedor busca
// de un vistazo y ahora ocupa su propio bloque.
// ─────────────────────────────────────────────────────────────────────────────

export interface ControlPropuestas {
    propuestas: Propuesta[];
    activaId: number | null;
    /** null mientras la cotización no se haya guardado: sin id no hay propuestas
     * en el servidor y los chips no tienen nada que mostrar. */
    cotizacionId: number | null;
    ocupado: boolean;
    onActivar: (id: number) => void;
    onNueva: () => void;
    onDuplicar: () => void;
    onClonar: () => void;
    onElegir: (id: number) => void;
    onBorrar: (id: number) => void;
}

interface Props {
    carrito: ItemCarrito[];
    cabecera: CabeceraCotizacion;
    onCambiarCabecera: (cambios: Partial<CabeceraCotizacion>) => void;
    onQuitarItem: (idTemp: string) => void;
    onGuardar: () => Promise<void>;
    guardando: boolean;
    numeroEnEdicion: number | null;
    asesoresSugeridos: string[];
    estadosDisponibles: EstadoCotizacion[];
    parametros: Parametros | null;
    /** Descuento de la PROPUESTA activa, en fracción (0,05 = 5%). */
    descuentoPct: number;
    onCambiarDescuento: (v: number) => void;
    cargos: EstadoCargos;
    onCambiarCargos: (v: EstadoCargos) => void;
    propuestas: ControlPropuestas;
    hayCambiosSinGuardar: boolean;
    onNuevaCotizacion: () => void;
}

const SEGMENTOS: { v: SegmentoCliente; l: string }[] = [
    { v: 'PA', l: 'PA — Persona / obra pequeña' },
    { v: 'PM', l: 'PM — Constructor mediano' },
    { v: 'PB', l: 'PB — Gran obra' },
];

const ESTADO_LABELS: Record<EstadoCotizacion, string> = {
    PENDIENTE: 'Pendiente',
    APROBADA: 'Aprobada',
    CANCELADO: 'Cancelado',
    PERDIDO: 'Perdido',
};

/** Tope de propuestas por cotización. Réplica de `MAX_PROPUESTAS` del store: no
 * es un número técnico, es donde el comparador deja de caber en una pantalla
 * girada hacia el cliente. Aquí sólo deshabilita el botón; quien de verdad lo
 * impone (con un 409) es el backend. */
const MAX_PROPUESTAS = 5;

const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';
const btnChip = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11.5px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40 disabled:cursor-not-allowed';
const thClass = 'px-3 py-2 text-[10.5px] font-extrabold uppercase tracking-wide whitespace-nowrap';

/**
 * Texto de respaldo cuando el ítem no trae `descripcionItem`.
 * Ancho×alto es lo único razonablemente común a los módulos hoy; si el input
 * no trae esos campos, cae al nombre del módulo sin más.
 */
const descripcionRespaldo = (item: ItemCarrito): string => {
    const anchoCm = item.input?.anchoCm ?? item.input?.anchoNaveCm;
    const altoCm = item.input?.altoCm ?? item.input?.altoNaveCm;
    if (anchoCm != null || altoCm != null) {
        // El motor de cálculo trabaja internamente en cm; la UI muestra mm.
        const anchoMm = anchoCm != null ? (anchoCm as number) * 10 : '?';
        const altoMm = altoCm != null ? (altoCm as number) * 10 : '?';
        return `${anchoMm}×${altoMm} mm`;
    }
    return item.moduloNombre;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Renglón de la cadena de totales: rótulo con su aclaración debajo e importe a
 * la derecha. Existe para que los cuatro parciales se lean como una cadena
 * (productos → descuento → cargos → IVA) y no como cuatro tarjetas sueltas que
 * compiten en peso con el total. */
const FilaTotal: React.FC<{
    etiqueta: string;
    detalle: string;
    valor: React.ReactNode;
    tono?: 'normal' | 'rebaja' | 'apagado';
}> = ({ etiqueta, detalle, valor, tono = 'normal' }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
        <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-slate-600">{etiqueta}</div>
            <div className="text-[10.5px] text-slate-400 leading-tight">{detalle}</div>
        </div>
        <div
            className={`text-[15px] font-bold font-cotizador-head tabular-nums whitespace-nowrap ${
                tono === 'rebaja' ? 'text-rose-600' : tono === 'apagado' ? 'text-slate-400' : 'text-slate-800'
            }`}
        >
            {valor}
        </div>
    </div>
);

const TabActual: React.FC<Props> = ({
    carrito, cabecera, onCambiarCabecera, onQuitarItem, onGuardar, guardando,
    numeroEnEdicion, asesoresSugeridos, estadosDisponibles, parametros,
    descuentoPct, onCambiarDescuento, cargos, onCambiarCargos, propuestas,
    hayCambiosSinGuardar, onNuevaCotizacion,
}) => {
    const [comparando, setComparando] = useState(false);

    const cambiarCliente = (campo: keyof ClienteCotizacion, valor: string) => {
        onCambiarCabecera({ cliente: { ...cabecera.cliente, [campo]: valor } });
    };

    const activa = propuestas.propuestas.find(p => p.id === propuestas.activaId) ?? null;
    const legado = Boolean(activa?.legadoCargosEnItems);
    const ivaPct = Number(parametros?.iva) || 0;

    /**
     * Previsualización de los totales de la propuesta.
     *
     * Réplica deliberada de `calcularTotalesPropuesta()` de
     * `backend-api/src/cotizador/lib/cargos.ts`, y del único sitio donde el
     * frontend puede permitírselo: mientras hay ítems sin guardar no existe
     * ninguna propuesta en el servidor a la que pedirle el número, y mostrar el
     * total viejo mientras el vendedor agrega productos sería mentirle. En
     * cuanto se guarda, lo que manda es `activa.totales` —que es lo que se
     * pinta— y este cálculo deja de usarse.
     *
     * Si allá cambia el orden de AIU/descuento/IVA, hay que cambiarlo aquí.
     */
    const totalesPrevistos = useMemo(() => {
        const productos = round2(carrito.reduce((acc, it) => acc + (Number(it.resultado.subtotalConAiu) || 0), 0));

        // Propuesta legada: su mano de obra y su flete están DENTRO del precio de
        // cada ítem, así que se comporta como antes — suma pura, sin descuento y
        // sin cargos. Sumarle ambas cosas cobraría dos veces lo mismo.
        if (legado) {
            return {
                productos,
                descuento: 0,
                cargos: 0,
                iva: round2(carrito.reduce((acc, it) => acc + (Number(it.resultado.iva) || 0), 0)),
                total: round2(carrito.reduce((acc, it) => acc + (Number(it.resultado.total) || 0), 0)),
            };
        }

        const descuento = round2(productos * (Number(descuentoPct) || 0));
        const baseGravable = round2(productos - descuento);
        const ivaProductos = round2(baseGravable * ivaPct);
        const c = resumenCargos(cargos, ivaPct);
        return {
            productos,
            descuento,
            cargos: c.base,
            iva: round2(ivaProductos + c.iva),
            total: round2(baseGravable + ivaProductos + c.base + c.iva),
        };
    }, [carrito, descuentoPct, cargos, ivaPct, legado]);

    // Guardado = lo que devolvió el backend. Previsto = lo que se está armando.
    // Se muestra el guardado en cuanto no hay nada pendiente, para que el número
    // de la pantalla sea exactamente el que quedó en la base.
    const totales = !hayCambiosSinGuardar && activa
        ? {
            productos: activa.totales.productos,
            descuento: activa.totales.descuento,
            cargos: activa.totales.cargos,
            iva: activa.totales.iva,
            total: activa.totales.total,
        }
        : totalesPrevistos;

    const hayCarrito = carrito.length > 0;
    const hayPropuestas = propuestas.cotizacionId !== null && propuestas.propuestas.length > 0;
    const sinNada = !hayCarrito && !hayPropuestas;
    const topeAlcanzado = propuestas.propuestas.length >= MAX_PROPUESTAS;

    return (
        <div className="p-4 space-y-3 bg-slate-50">
            {sinNada && (
                <Tarjeta>
                    <EstadoVacio
                        icono={Inbox}
                        titulo="Aún no has agregado ítems"
                        detalle="Ve a la pestaña Cotizar para calcular el primero: en cuanto lo agregues aparecerán aquí el carrito, los cargos de obra y el total de la propuesta."
                    />
                </Tarjeta>
            )}

            {!sinNada && (
                <>
                    {/* ── Propuestas (A · B · C) ───────────────────────────────── */}
                    {hayPropuestas && (
                        <Tarjeta
                            titulo="Propuestas"
                            icono={Layers}
                            accion={
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                    <button
                                        onClick={propuestas.onNueva}
                                        disabled={propuestas.ocupado || topeAlcanzado}
                                        title={topeAlcanzado
                                            ? `Una cotización admite como máximo ${MAX_PROPUESTAS} propuestas.`
                                            : 'Crear una propuesta vacía'}
                                        className={btnChip}
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Nueva
                                    </button>
                                    <button
                                        onClick={propuestas.onDuplicar}
                                        disabled={propuestas.ocupado || !propuestas.activaId || topeAlcanzado}
                                        title="Copia exacta de la propuesta activa"
                                        className={btnChip}
                                    >
                                        <Copy className="w-3.5 h-3.5" /> Duplicar
                                    </button>
                                    <button
                                        onClick={propuestas.onClonar}
                                        disabled={propuestas.ocupado || !propuestas.activaId || topeAlcanzado}
                                        title="Duplicar cambiando el vidrio, la película o el matizado de todos los ítems"
                                        className={btnChip}
                                    >
                                        <Layers className="w-3.5 h-3.5" /> Variante con otro vidrio
                                    </button>
                                    {propuestas.propuestas.length > 1 && (
                                        <button onClick={() => setComparando(v => !v)} className={btnChip}>
                                            <Scale className="w-3.5 h-3.5" /> {comparando ? 'Ocultar comparación' : 'Comparar'}
                                        </button>
                                    )}
                                </div>
                            }
                        >
                            <p className="text-[11.5px] text-slate-400 leading-snug -mt-1 mb-2.5">
                                El total de la cotización es el de la elegida, y de ella sale la orden de corte.
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {propuestas.propuestas.map(p => {
                                    const esActiva = p.id === propuestas.activaId;
                                    return (
                                        <div
                                            key={p.id}
                                            className={`rounded-xl border px-3 py-2 min-w-[190px] transition ${esActiva
                                                ? 'border-indigo-300 bg-indigo-50/70 ring-1 ring-indigo-200'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                        >
                                            <button
                                                onClick={() => propuestas.onActivar(p.id)}
                                                disabled={propuestas.ocupado}
                                                title={esActiva ? 'Es la propuesta que estás editando' : `Abrir la propuesta ${p.etiqueta}`}
                                                className="text-left w-full disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg"
                                            >
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-cotizador-head tabular-nums font-black text-slate-800">{p.etiqueta}</span>
                                                    {p.elegida && (
                                                        <Chip tono="esmeralda" title="Es la propuesta que se cobra y la que sale a corte">
                                                            <CheckCircle2 className="w-3 h-3" /> Elegida
                                                        </Chip>
                                                    )}
                                                    {p.legadoCargosEnItems && (
                                                        <Chip tono="ambar" title="Sus cargos están dentro del precio de los ítems">
                                                            Legada
                                                        </Chip>
                                                    )}
                                                </div>
                                                {p.nombre && <div className="text-[11.5px] text-slate-600 truncate">{p.nombre}</div>}
                                                <div className="text-[13px] text-slate-700 font-cotizador-head tabular-nums font-bold">{fmtCOP(p.totales.total)}</div>
                                            </button>
                                            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
                                                {!p.elegida && (
                                                    <button
                                                        onClick={() => propuestas.onElegir(p.id)}
                                                        disabled={propuestas.ocupado}
                                                        className="text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                                                    >
                                                        Elegir
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => propuestas.onBorrar(p.id)}
                                                    disabled={propuestas.ocupado || propuestas.propuestas.length <= 1}
                                                    title={propuestas.propuestas.length <= 1
                                                        ? 'No se puede borrar la única propuesta de la cotización.'
                                                        : 'Borrar esta propuesta'}
                                                    className="ml-auto text-[11px] font-bold text-slate-400 hover:text-rose-600 disabled:opacity-40 disabled:hover:text-slate-400"
                                                >
                                                    Borrar
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {!propuestas.propuestas.some(p => p.elegida) && (
                                <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800 font-semibold leading-snug">
                                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                    Ninguna propuesta está elegida todavía: la cotización no muestra un total definitivo,
                                    no se puede aprobar y no sale orden de corte hasta que marques una.
                                </p>
                            )}
                        </Tarjeta>
                    )}

                    {comparando && propuestas.cotizacionId !== null && (
                        <ComparadorPropuestas
                            cotizacionId={propuestas.cotizacionId}
                            onElegir={propuestas.onElegir}
                        />
                    )}

                    {/* ── Cliente y comercial, lado a lado ─────────────────────── */}
                    {/* Son la cabecera de la cotización: se ven de una vez y dejan el
                        espacio vertical para lo que de verdad cambia mientras se
                        cotiza, que es el carrito. */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                        <Tarjeta titulo="Cliente" icono={User}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="sm:col-span-2">
                                    <label className={labelClass} htmlFor="cot-cliente-nombre">Nombre</label>
                                    <input
                                        id="cot-cliente-nombre"
                                        className={inputClass}
                                        value={cabecera.cliente.nombre || ''}
                                        onChange={e => cambiarCliente('nombre', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-cliente-obra">Obra</label>
                                    <input
                                        id="cot-cliente-obra"
                                        className={inputClass}
                                        value={cabecera.cliente.obra || ''}
                                        onChange={e => cambiarCliente('obra', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-cliente-contacto">Contacto</label>
                                    <input
                                        id="cot-cliente-contacto"
                                        className={inputClass}
                                        value={cabecera.cliente.contacto || ''}
                                        onChange={e => cambiarCliente('contacto', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-cliente-direccion">Dirección</label>
                                    <input
                                        id="cot-cliente-direccion"
                                        className={inputClass}
                                        value={cabecera.cliente.direccion || ''}
                                        onChange={e => cambiarCliente('direccion', e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-cliente-telefono">Teléfono</label>
                                    <input
                                        id="cot-cliente-telefono"
                                        className={inputClass}
                                        value={cabecera.cliente.telefono || ''}
                                        onChange={e => cambiarCliente('telefono', e.target.value)}
                                    />
                                </div>
                            </div>
                        </Tarjeta>

                        <Tarjeta titulo="Comercial" icono={Briefcase}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass} htmlFor="cot-segmento">Segmento</label>
                                    <select
                                        id="cot-segmento"
                                        className={inputClass}
                                        value={cabecera.segmentoCliente}
                                        onChange={e => onCambiarCabecera({ segmentoCliente: e.target.value as SegmentoCliente })}
                                    >
                                        {SEGMENTOS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-asesor">Asesor</label>
                                    <input
                                        id="cot-asesor"
                                        className={inputClass}
                                        list="cotizador-asesores"
                                        value={cabecera.asesor}
                                        onChange={e => onCambiarCabecera({ asesor: e.target.value })}
                                        placeholder="Nombre del asesor"
                                    />
                                    <datalist id="cotizador-asesores">
                                        {asesoresSugeridos.map(a => <option key={a} value={a} />)}
                                    </datalist>
                                </div>
                                <div>
                                    {/* UN SOLO descuento, el de la propuesta. El del
                                        formulario por ítem se retiró el 2026-09-20 y el de
                                        la cabecera quedó legado: había dos y sólo uno de
                                        los dos afectaba a algún total. */}
                                    <label className={labelClass} htmlFor="cot-descuento">
                                        Descuento (%){activa ? ` · propuesta ${activa.etiqueta}` : ''}
                                    </label>
                                    <input
                                        id="cot-descuento"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        className={inputClass}
                                        disabled={legado}
                                        title={legado ? 'Las propuestas anteriores al cambio no aplican descuento.' : ''}
                                        value={descuentoPct * 100}
                                        onChange={e => {
                                            // Se manda como fracción y con tope 1: el backend
                                            // rechaza cualquier cosa mayor porque un "5"
                                            // escrito donde iba 0,05 dejaría el total en
                                            // negativo.
                                            const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                            onCambiarDescuento(pct / 100);
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="cot-estado">Estado</label>
                                    <select
                                        id="cot-estado"
                                        className={inputClass}
                                        value={cabecera.estado}
                                        onChange={e => onCambiarCabecera({ estado: e.target.value as EstadoCotizacion })}
                                    >
                                        {estadosDisponibles.map(e => <option key={e} value={e}>{ESTADO_LABELS[e] || e}</option>)}
                                    </select>
                                </div>
                            </div>
                            {legado && (
                                <p className="mt-2 text-[11px] text-amber-700 leading-snug">
                                    Propuesta legada: sus cargos de obra están dentro del precio de los ítems, así que no
                                    admite descuento de propuesta.
                                </p>
                            )}
                        </Tarjeta>
                    </div>

                    {/* ── Cargos de obra ───────────────────────────────────────── */}
                    <PanelCargosObra
                        valor={cargos}
                        onChange={onCambiarCargos}
                        parametros={parametros}
                        cotizacionId={propuestas.cotizacionId}
                        propuestaId={propuestas.activaId}
                        // Mismo motivo que en Cotizar: sin cotización guardada, la
                        // sugerencia de mano de obra sale de los ítems del carrito.
                        itemsBorrador={carrito.map(it => ({
                            moduloId: it.moduloId,
                            input: it.input,
                            resultado: it.resultado as unknown as Record<string, unknown>,
                        }))}
                        etiquetaPropuesta={activa?.etiqueta ?? null}
                        legado={legado}
                        onDuplicarLegado={propuestas.onDuplicar}
                    />

                    {/* ── Ítems del carrito ────────────────────────────────────── */}
                    {!hayCarrito ? (
                        <Tarjeta className="border-dashed">
                            <EstadoVacio
                                icono={Inbox}
                                titulo={activa ? `La propuesta ${activa.etiqueta} todavía no tiene ítems` : 'Sin ítems'}
                                detalle="Ve a la pestaña Cotizar para agregar el primero."
                            />
                        </Tarjeta>
                    ) : (
                        <Tarjeta
                            titulo={activa ? `Ítems de la propuesta ${activa.etiqueta}` : 'Ítems de la cotización'}
                            icono={Package}
                            cuerpoClassName="pt-0"
                            accion={
                                <span className="text-[11px] text-slate-400 font-cotizador-head tabular-nums">
                                    {carrito.length} ítem{carrito.length === 1 ? '' : 's'}
                                </span>
                            }
                        >
                            {/* Sangría negativa: igual que en el despiece de Cotizar, para
                                que la banda gris del encabezado llegue a los dos bordes de
                                la tarjeta en vez de flotar dentro del padding. */}
                            <div className="overflow-x-auto -mx-4">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
                                        <tr>
                                            <th className={`${thClass} text-left`}>Producto</th>
                                            <th className={`${thClass} text-left`}>Detalle</th>
                                            <th className={`${thClass} text-right`}>Piezas</th>
                                            <th className={`${thClass} text-right`}>Subtotal + AIU</th>
                                            {/* El `iva` y el `total` del blob del ítem se
                                                calcularon a PRECIO LLENO: el descuento de la
                                                propuesta se aplica después, sobre la suma. Sin
                                                este rótulo el vendedor sumaría mal a mano. Va
                                                en la cabecera, una vez, y no repetido en cada
                                                fila como antes del rediseño. */}
                                            <th className={`${thClass} text-right`}>
                                                IVA
                                                <span className="block font-bold normal-case tracking-normal text-slate-400">a precio lleno</span>
                                            </th>
                                            <th className={`${thClass} text-right`}>
                                                Total
                                                <span className="block font-bold normal-case tracking-normal text-slate-400">a precio lleno</span>
                                            </th>
                                            <th className={`${thClass} w-10`}>
                                                <span className="sr-only">Quitar</span>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {carrito.map(item => (
                                            <tr
                                                key={item.idTemp}
                                                className={item.resultado.hayErrores
                                                    ? 'bg-rose-50 text-rose-700'
                                                    : 'text-slate-700 hover:bg-slate-50 transition-colors'}
                                            >
                                                <td className="px-3 py-2 align-top">
                                                    <span className="flex items-start gap-1.5 font-bold text-[12.5px]">
                                                        {item.resultado.hayErrores && (
                                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        )}
                                                        <span className={item.resultado.hayErrores ? '' : 'text-slate-800'}>
                                                            {item.moduloNombre}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td className={`px-3 py-2 align-top text-[12.5px] ${item.resultado.hayErrores ? '' : 'text-slate-500'}`}>
                                                    {item.descripcionItem || descripcionRespaldo(item)}
                                                </td>
                                                <td className="px-3 py-2 text-right align-top whitespace-nowrap font-cotizador-head tabular-nums">
                                                    {item.resultado.cantidadPiezas}
                                                </td>
                                                <td className="px-3 py-2 text-right align-top whitespace-nowrap font-bold font-cotizador-head tabular-nums">
                                                    {fmtCOP(item.resultado.subtotalConAiu)}
                                                </td>
                                                <td className={`px-3 py-2 text-right align-top whitespace-nowrap font-cotizador-head tabular-nums ${item.resultado.hayErrores ? '' : 'text-slate-500'}`}>
                                                    {fmtCOP(item.resultado.iva)}
                                                </td>
                                                <td className={`px-3 py-2 text-right align-top whitespace-nowrap font-cotizador-head tabular-nums ${item.resultado.hayErrores ? '' : 'text-slate-500'}`}>
                                                    {fmtCOP(item.resultado.total)}
                                                </td>
                                                <td className="px-3 py-2 text-right align-top">
                                                    <button
                                                        onClick={() => onQuitarItem(item.idTemp)}
                                                        title="Quitar ítem"
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-100/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        <span className="sr-only">Quitar {item.moduloNombre}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {descuentoPct > 0 && !legado && (
                                <p className="text-[11px] text-slate-400 leading-snug pt-2.5">
                                    El IVA y el total de cada ítem están a precio lleno: el descuento de {fmtPct(descuentoPct)} de
                                    la propuesta se aplica sobre el subtotal, no ítem por ítem. Los totales de abajo ya lo
                                    incluyen.
                                </p>
                            )}
                        </Tarjeta>
                    )}

                    {/* ── Totales de la propuesta ──────────────────────────────── */}
                    <Tarjeta
                        titulo={`Totales${activa ? ` · propuesta ${activa.etiqueta}` : ''}`}
                        icono={Receipt}
                        accion={hayCambiosSinGuardar
                            ? (
                                <Chip tono="ambar" title="Los números son una previsualización hasta que guardes: el definitivo lo calcula el servidor.">
                                    <AlertTriangle className="w-3 h-3" /> Estimado — hay cambios sin guardar
                                </Chip>
                            )
                            : undefined}
                    >
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
                            {/* La cadena, en orden de aplicación. */}
                            <div className="lg:col-span-3">
                                <FilaTotal
                                    etiqueta="Productos"
                                    detalle="Con AIU, sin descuento"
                                    valor={fmtCOP(totales.productos)}
                                />
                                <FilaTotal
                                    etiqueta="Descuento"
                                    detalle={`${fmtPct(descuentoPct)} sobre productos`}
                                    valor={totales.descuento > 0 ? `− ${fmtCOP(totales.descuento)}` : fmtCOP(0)}
                                    tono={totales.descuento > 0 ? 'rebaja' : 'apagado'}
                                />
                                <FilaTotal
                                    etiqueta="Cargos de obra"
                                    detalle="Fuera del AIU y del descuento"
                                    valor={fmtCOP(totales.cargos)}
                                />
                                <FilaTotal
                                    etiqueta="IVA"
                                    detalle="Productos + cargos"
                                    valor={fmtCOP(totales.iva)}
                                />
                            </div>

                            {/* El TOTAL no puede pesar lo mismo que los parciales: es el
                                número que el vendedor busca de un vistazo y el que acaba
                                en el papel que ve el cliente. */}
                            <div className="lg:col-span-2 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 border border-indigo-700 px-4 py-3.5 flex flex-col justify-center">
                                <span className="text-[11px] font-extrabold uppercase tracking-wide text-indigo-100 font-cotizador-head tabular-nums">
                                    Total de la propuesta
                                </span>
                                <span className="text-3xl font-black text-white font-cotizador-head tabular-nums leading-none mt-1.5 break-words">
                                    {fmtCOP(totales.total)}
                                </span>
                                <span className="text-[10.5px] text-indigo-100 mt-1.5 leading-snug">
                                    {resumenCargos(cargos, ivaPct).total > 0 && !legado
                                        ? 'Incluye cargos con su IVA'
                                        : 'Propuesta completa'}
                                </span>
                            </div>
                        </div>
                    </Tarjeta>

                    {/* ── Acciones ─────────────────────────────────────────────── */}
                    <div className="flex flex-wrap gap-2">
                        <BotonPrimario
                            onClick={onGuardar}
                            cargando={guardando}
                            icono={Save}
                            disabled={carrito.length === 0}
                            title={carrito.length === 0 ? 'Agrega al menos un ítem a esta propuesta antes de guardar.' : ''}
                            className="flex-1 min-w-[240px] py-3 shadow-lg shadow-indigo-600/25"
                        >
                            {numeroEnEdicion !== null ? `Actualizar cotización N.° ${numeroEnEdicion}` : 'Guardar cotización'}
                        </BotonPrimario>
                        {numeroEnEdicion !== null && (
                            <BotonSecundario
                                icono={FilePlus2}
                                onClick={() => {
                                    if (hayCambiosSinGuardar && !window.confirm('Hay cambios sin guardar. ¿Empezar una cotización nueva de todas formas?')) return;
                                    onNuevaCotizacion();
                                }}
                            >
                                Cotización nueva
                            </BotonSecundario>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default TabActual;
