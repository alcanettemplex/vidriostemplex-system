import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle, Check, CheckCircle2, ChevronDown, Copy, Download, ExternalLink, FileCheck, HardHat, Inbox, Loader2,
    Lock, MessageCircle, MoreVertical, Pencil, Plus, RotateCcw, Scale, Trash2, XCircle,
} from '../../../components/ui/icons';

import { fmtCOP, fmtPct, numeroCotizacion } from '../format';
import { descripcionDeItem } from '../fichaProducto';
import { ClienteCotizacion, EstadoCotizacion, ItemCarrito, LineaManoObra, MotivoPerdida, Parametros, Propuesta, SegmentoCliente } from '../types';
import { CabeceraCotizacion } from '../CotizadorPage';
import { EstadoCargos } from './PanelCargosObra';
import { CargosCompactos } from './ResumenPropuesta';
import { TotalesPrevistos, totalLineaManoObra } from '../totalesPropuesta';
import ComparadorPropuestas from './ComparadorPropuestas';
import { EstadoGuardado, TipoNuevaPropuesta } from './BarraTrabajo';
import { BotonPrimario, BotonSecundario, Chip, EstadoVacio, Tarjeta } from './ui';
import { AsesorCotizador, FichaVinculo, MOTIVOS_PERDIDA } from '../vinculo';
import { ChipVinculo } from './BuscadorVinculo';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Resumen" — la cotización como DOCUMENTO (rediseño 2026-10-01,
// dirección R1 elegida por el usuario sobre el lienzo de propuestas).
//
// Por qué se rehízo: los asesores no la entendían. Eran siete tarjetas del mismo
// peso (Para quién, Propuestas, Cliente, Comercial, Cargos, Productos, Totales),
// aprobar era cambiar un select "Estado" escondido en "Comercial", y el PDF —lo
// que el asesor quiere al final— ni siquiera estaba en esta pestaña.
//
// Ahora hay dos piezas:
//   · LA HOJA: la cotización tal como la verá el cliente, editable en sitio
//     (datos del cliente, productos, trabajos en obra, descuento y total), con
//     las opciones A/B/C como pestañas encima.
//   · "LO QUE SIGUE": enviar (WhatsApp / PDF) → ¿qué respondió? (Aprobó / La
//     perdimos) → Crear ODP. Lo interno (tipo de cliente, asesor, vínculo, hoja
//     de trabajo, comparar) queda plegado en "Datos internos".
//
// LA LÓGICA NO CAMBIÓ. Este componente sigue sin calcular ni persistir nada:
// todo llega de CotizadorPage y todo vuelve por sus callbacks (los mismos de
// antes más los de cierre: `onAprobar`, `onPerdida`, `onCambiarEstado`). Los
// totales son los de `totalesPropuesta.ts`; los cargos, el mismo editor del
// resumen de Cotizar (`CargosCompactos`).
// ─────────────────────────────────────────────────────────────────────────────

export interface ControlPropuestas {
    propuestas: Propuesta[];
    activaId: number | null;
    /** null mientras la cotización no se haya guardado. */
    cotizacionId: number | null;
    ocupado: boolean;
    onActivar: (id: number) => void;
    /** Copia exacta: la pide el aviso de propuesta legada. */
    onDuplicar: () => void;
    onElegir: (id: number) => void;
    onBorrar: (id: number) => void;
    onNueva: (tipo: TipoNuevaPropuesta) => void;
    motivoNoNueva: string | null;
}

interface Props {
    carrito: ItemCarrito[];
    cabecera: CabeceraCotizacion;
    onCambiarCabecera: (cambios: Partial<CabeceraCotizacion>) => void;
    onQuitarItem: (idTemp: string) => void;
    numeroEnEdicion: number | null;
    parametros: Parametros | null;
    /** Descuento de la PROPUESTA activa, en fracción (0,05 = 5%). */
    descuentoPct: number;
    onCambiarDescuento: (v: number) => void;
    cargos: EstadoCargos;
    onCambiarCargos: (v: EstadoCargos) => void;
    manoObra: LineaManoObra[];
    cargandoManoObra?: boolean;
    totalesPrevistos: TotalesPrevistos;
    propuestas: ControlPropuestas;
    hayCambiosSinGuardar: boolean;
    onNuevaCotizacion: () => void;
    onEditarItem: (idTemp: string) => void;
    onDuplicarItem: (idTemp: string) => void;
    /** Ir a Cotizar para agregar un producto a la opción a la vista. */
    onIrACotizar: () => void;
    /** Motivo por el que ítems, descuento, cargos y segmento no se tocan. */
    bloqueoEdicion: string | null;
    /** Sin permiso sobre esta cotización (solo lectura): no se ofrecen acciones de cierre. */
    sinPermiso: string | null;
    modulosDisponibles: Set<string>;
    // Guardado
    estadoGuardadoUI: EstadoGuardado;
    mensajeError: string | null;
    onReintentar?: () => void;
    // Vínculo y cierre
    vinculo?: FichaVinculo | null;
    odpVinculada?: { id: number; numero: string } | null;
    /** Estado GUARDADO (null = cotización nueva). */
    estadoGuardado?: EstadoCotizacion | null;
    motivoPerdida?: MotivoPerdida | null;
    onCrearOdp?: (() => void) | null;
    onAprobar: (propuestaId: number) => void;
    onPerdida: () => void;
    onCambiarEstado: (estado: 'PENDIENTE' | 'CANCELADO') => void;
    onPdf: () => void;
    onWhatsApp: () => void;
    generandoPdf: boolean;
    onDetalleTecnico: () => void;
    // Datos internos
    segmento: SegmentoCliente;
    onCambiarSegmento: (s: SegmentoCliente) => void;
    cambiandoSegmento: boolean;
    motivoNoSegmento: string | null;
    asesores?: AsesorCotizador[];
    puedeCambiarAsesor?: boolean;
}

const SEGMENTOS: { v: SegmentoCliente; corto: string; largo: string }[] = [
    { v: 'PA', corto: 'Persona', largo: 'PA — Persona / obra pequeña' },
    { v: 'PM', corto: 'Constructor', largo: 'PM — Constructor mediano' },
    { v: 'PB', corto: 'Gran obra', largo: 'PB — Gran obra' },
];

/** Situación en palabras del asesor, a partir del estado guardado. */
function situacion(estado: EstadoCotizacion | null | undefined, odp: boolean): { texto: string; clase: string } {
    if (!estado) return { texto: 'Sin guardar', clase: 'bg-slate-100 text-slate-800' };
    if (estado === 'APROBADA') return odp
        ? { texto: 'Aprobada · en producción', clase: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' }
        : { texto: 'Aprobada · falta la ODP', clase: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' };
    if (estado === 'PERDIDO') return { texto: 'Perdida', clase: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200' };
    if (estado === 'CANCELADO') return { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-800 ring-1 ring-slate-300' };
    return { texto: 'Esperando respuesta', clase: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' };
}

const INDICADOR_GUARDADO: Record<EstadoGuardado, { texto: string; clase: string }> = {
    nuevo: { texto: 'Se guarda sola con el primer producto', clase: 'text-slate-700' },
    pendiente: { texto: 'Cambios por guardar…', clase: 'text-slate-700' },
    guardando: { texto: 'Guardando…', clase: 'text-templex-700' },
    guardado: { texto: 'Guardada automáticamente', clase: 'text-emerald-700' },
    error: { texto: 'No se pudo guardar', clase: 'text-rose-700' },
};

const campoHoja =
    'w-full bg-transparent border-0 border-b border-dashed border-slate-400 px-0 py-1 text-[14px] text-slate-900 ' +
    'placeholder:text-slate-500 focus:outline-none focus:border-solid focus:border-templex-600 disabled:border-transparent';

/** Menú "⋯" con las acciones poco frecuentes. */
const MenuMas: React.FC<{ opciones: { texto: string; onClick: () => void; peligro?: boolean }[] }> = ({ opciones }) => {
    const [abierto, setAbierto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
    }, [abierto]);
    if (opciones.length === 0) return null;
    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setAbierto(v => !v)}
                aria-haspopup="menu"
                aria-expanded={abierto}
                aria-label="Más acciones"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            >
                <MoreVertical className="w-5 h-5" />
            </button>
            {abierto && (
                <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    {opciones.map(o => (
                        <button
                            key={o.texto}
                            type="button"
                            role="menuitem"
                            onClick={() => { setAbierto(false); o.onClick(); }}
                            className={`w-full rounded-lg px-3 py-2.5 text-left text-[13.5px] font-semibold hover:bg-slate-50 ${o.peligro ? 'text-rose-700' : 'text-slate-900'}`}
                        >
                            {o.texto}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Paso numerado de "Lo que sigue". */
const Paso: React.FC<{
    n: number;
    estado: 'hecho' | 'actual' | 'futuro' | 'bloqueado';
    titulo: string;
    detalle?: React.ReactNode;
    children?: React.ReactNode;
}> = ({ n, estado, titulo, detalle, children }) => {
    const circulo = estado === 'hecho'
        ? <span className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><Check className="w-4 h-4" /></span>
        : estado === 'actual'
            ? <span className="w-7 h-7 rounded-full bg-templex-600 text-white flex items-center justify-center text-[13px] font-bold shrink-0 tabular-nums">{n}</span>
            : estado === 'bloqueado'
                ? <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><Lock className="w-3.5 h-3.5" /></span>
                : <span className="w-7 h-7 rounded-full border-2 border-slate-300 text-slate-600 flex items-center justify-center text-[13px] font-bold shrink-0 tabular-nums">{n}</span>;
    return (
        <li className={`flex gap-3 ${estado === 'bloqueado' ? 'opacity-80' : ''}`}>
            {circulo}
            <div className="min-w-0 flex-1 space-y-2.5">
                <div>
                    <p className="text-[14px] font-semibold text-slate-900">{titulo}</p>
                    {detalle && <p className="text-[12.5px] text-slate-700 leading-snug">{detalle}</p>}
                </div>
                {children}
            </div>
        </li>
    );
};

const TabActual: React.FC<Props> = ({
    carrito, cabecera, onCambiarCabecera, onQuitarItem, numeroEnEdicion, parametros,
    descuentoPct, onCambiarDescuento, cargos, onCambiarCargos, manoObra, cargandoManoObra, totalesPrevistos, propuestas,
    hayCambiosSinGuardar, onNuevaCotizacion, onEditarItem, onDuplicarItem, onIrACotizar,
    bloqueoEdicion, sinPermiso, modulosDisponibles,
    estadoGuardadoUI, mensajeError, onReintentar,
    vinculo = null, odpVinculada = null, estadoGuardado = null, motivoPerdida = null, onCrearOdp = null,
    onAprobar, onPerdida, onCambiarEstado, onPdf, onWhatsApp, generandoPdf, onDetalleTecnico,
    segmento, onCambiarSegmento, cambiandoSegmento, motivoNoSegmento, asesores = [], puedeCambiarAsesor = false,
}) => {
    const [comparando, setComparando] = useState(false);
    const [eligiendoAprobada, setEligiendoAprobada] = useState(false);
    const [menuNueva, setMenuNueva] = useState(false);

    const cambiarCliente = (campo: keyof ClienteCotizacion, valor: string) => {
        onCambiarCabecera({ cliente: { ...cabecera.cliente, [campo]: valor } });
    };

    const lista = propuestas.propuestas;
    const activa = lista.find(p => p.id === propuestas.activaId) ?? null;
    const elegida = lista.find(p => p.elegida) ?? null;
    const legado = Boolean(activa?.legadoCargosEnItems);
    const soloLectura = Boolean(sinPermiso);
    const bloqueoCargos = legado
        ? 'Opción anterior al cambio de cargos: duplícala para editarlos.'
        : bloqueoEdicion;

    // Guardado = lo que devolvió el backend. Previsto = lo que se está armando.
    const totales = !hayCambiosSinGuardar && activa
        ? {
            productos: activa.totales.productos,
            manoObra: activa.totales.manoObra ?? 0,
            descuento: activa.totales.descuento,
            cargos: activa.totales.cargos,
            iva: activa.totales.iva,
            total: activa.totales.total,
        }
        : totalesPrevistos;

    const hayCarrito = carrito.length > 0;
    const guardada = numeroEnEdicion !== null;
    const sit = situacion(estadoGuardado, Boolean(odpVinculada));
    const indicador = INDICADOR_GUARDADO[estadoGuardadoUI];

    if (!hayCarrito && !guardada) {
        return (
            <div className="p-4 md:p-6 bg-slate-50">
                <Tarjeta>
                    <EstadoVacio
                        icono={Inbox}
                        titulo="Todavía no hay productos"
                        detalle="Arma el primero en Cotizar. Apenas lo agregues, aquí verás la cotización tal como le llegará al cliente."
                    />
                    <div className="flex justify-center pb-4">
                        <BotonPrimario icono={Plus} onClick={onIrACotizar}>Ir a Cotizar</BotonPrimario>
                    </div>
                </Tarjeta>
            </div>
        );
    }

    // ── Acciones poco frecuentes ──────────────────────────────────────────
    const opcionesMas: { texto: string; onClick: () => void; peligro?: boolean }[] = [];
    if (guardada && !soloLectura) {
        if (estadoGuardado && estadoGuardado !== 'PENDIENTE') {
            opcionesMas.push({ texto: 'Volver a “Esperando respuesta”', onClick: () => onCambiarEstado('PENDIENTE') });
        }
        if (estadoGuardado === 'PENDIENTE') {
            opcionesMas.push({ texto: 'Cancelar la cotización', onClick: () => onCambiarEstado('CANCELADO'), peligro: true });
        }
        if (activa && lista.length > 1 && !bloqueoEdicion) {
            opcionesMas.push({ texto: `Borrar la Opción ${activa.etiqueta}`, onClick: () => propuestas.onBorrar(activa.id), peligro: true });
        }
    }
    if (guardada) opcionesMas.push({ texto: 'Cotizar a otro cliente', onClick: onNuevaCotizacion });

    // ── "Lo que sigue" ────────────────────────────────────────────────────
    const pendiente = estadoGuardado === 'PENDIENTE';
    const aprobada = estadoGuardado === 'APROBADA';
    const cerrada = estadoGuardado === 'PERDIDO' || estadoGuardado === 'CANCELADO';
    const hayErrores = carrito.some(it => it.resultado.hayErrores);
    const motivoNoEnviar = !guardada
        ? (vinculo ? 'Guardando la cotización…' : 'Primero elige para quién es, en Cotizar.')
        : hayErrores ? 'Hay productos con líneas en error: corrígelos antes de enviar.' : null;
    // Un cambio de estado en camino (o un guardado en curso) frena los botones de
    // cierre: dos guardados con la misma versión darían el 409 "otra ventana".
    const estadoEnCamino = Boolean(estadoGuardado) && cabecera.estado !== estadoGuardado;
    const cierreOcupado = estadoEnCamino || estadoGuardadoUI === 'guardando' || propuestas.ocupado;

    const aprobar = () => {
        if (lista.length > 1) { setEligiendoAprobada(true); return; }
        const pid = activa?.id ?? elegida?.id;
        if (pid) onAprobar(pid);
    };

    return (
        <div className="p-3 sm:p-5 bg-slate-50 space-y-4">
            {/* ── Encabezado ─────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0">
                    <h2 className="text-[22px] font-extrabold text-slate-900 leading-tight truncate">
                        {cabecera.cliente.nombre?.trim() || 'Cotización sin nombre de cliente'}
                    </h2>
                    <p className="text-[13px] text-slate-700 truncate">
                        {guardada ? numeroCotizacion(numeroEnEdicion) : 'Cotización nueva'}
                        {cabecera.cliente.obra?.trim() ? ` · ${cabecera.cliente.obra.trim()}` : ''}
                        {vinculo ? ` · ${vinculo.titulo}` : ''}
                    </p>
                </div>
                <span className={`inline-flex items-center h-7 px-3 rounded-full text-[12.5px] font-semibold ${sit.clase}`}>{sit.texto}</span>
                <div className="ml-auto flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold ${indicador.clase}`} aria-live="polite">
                        {estadoGuardadoUI === 'guardando' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        {estadoGuardadoUI === 'guardado' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {estadoGuardadoUI === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                        <span title={mensajeError ?? undefined}>{indicador.texto}</span>
                        {estadoGuardadoUI === 'error' && onReintentar && (
                            <button type="button" onClick={onReintentar} className="underline underline-offset-2">Reintentar</button>
                        )}
                    </span>
                    <MenuMas opciones={opcionesMas} />
                </div>
            </header>

            {(bloqueoEdicion || sinPermiso) && (
                <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-slate-800">
                    <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>{sinPermiso ?? bloqueoEdicion}</p>
                </div>
            )}

            <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0">
                    {/* ── Pestañas de opción ──────────────────────────────── */}
                    {lista.length > 0 && (
                        <nav aria-label="Opciones de la cotización" className="flex flex-wrap items-end gap-1.5">
                            {lista.map(p => {
                                const esActiva = p.id === propuestas.activaId;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => propuestas.onActivar(p.id)}
                                        disabled={propuestas.ocupado}
                                        aria-current={esActiva ? 'true' : undefined}
                                        className={`relative text-left rounded-t-xl border px-4 py-2.5 transition disabled:cursor-wait ${esActiva
                                            ? 'bg-white border-slate-300 border-b-white -mb-px z-[1]'
                                            : 'bg-slate-100 border-slate-200 hover:bg-white'}`}
                                    >
                                        <span className={`flex items-center gap-1.5 text-[13.5px] ${esActiva ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                                            Opción {p.etiqueta}{p.nombre ? ` · ${p.nombre}` : ''}
                                            {p.elegida && lista.length > 1 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-label="elegida" />}
                                        </span>
                                        <span className={`block text-[12.5px] tabular-nums ${esActiva ? 'font-semibold text-templex-700' : 'text-slate-700'}`}>
                                            {fmtCOP(esActiva ? totales.total : p.totales.total)}
                                        </span>
                                    </button>
                                );
                            })}
                            {!soloLectura && guardada && (
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setMenuNueva(v => !v)}
                                        disabled={Boolean(propuestas.motivoNoNueva) || propuestas.ocupado}
                                        title={propuestas.motivoNoNueva ?? undefined}
                                        aria-haspopup="menu"
                                        aria-expanded={menuNueva}
                                        className="rounded-t-xl border border-dashed border-slate-400 px-4 py-2.5 text-[13.5px] font-semibold text-templex-700 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] inline-flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Ofrecerle otra opción <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                    {menuNueva && (
                                        <div role="menu" className="absolute left-0 top-full mt-1 z-30 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                                            {([
                                                ['copia', 'Copiar esta opción', 'Mismos productos y cargos; luego cambias lo que sea distinto.'],
                                                ['variante', 'Igual pero con otro vidrio', 'Recalcula todo con otro vidrio, película o matizado.'],
                                                ['vacia', 'Opción en blanco', 'Para cotizarle algo distinto desde cero.'],
                                            ] as [TipoNuevaPropuesta, string, string][]).map(([tipo, titulo, detalle]) => (
                                                <button
                                                    key={tipo}
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => { setMenuNueva(false); propuestas.onNueva(tipo); }}
                                                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                                                >
                                                    <span className="block text-[13.5px] font-semibold text-slate-900">{titulo}</span>
                                                    <span className="block text-[12px] text-slate-700">{detalle}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </nav>
                    )}

                    {/* ── La hoja ─────────────────────────────────────────── */}
                    <article
                        aria-label="Cotización tal como la verá el cliente"
                        className={`bg-white border border-slate-300 shadow-[0_12px_32px_rgba(17,22,32,0.08)] px-5 py-6 sm:px-10 sm:py-9 space-y-7 ${lista.length > 0 ? 'rounded-b-2xl rounded-tr-2xl' : 'rounded-2xl'}`}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-[20px] font-extrabold tracking-wide text-templex-800">VIDRIOS TEMPLEX</p>
                                <p className="text-[12.5px] text-slate-700">Así la verá el cliente en el PDF</p>
                            </div>
                            <p className="text-right text-[16px] font-bold text-slate-900">
                                {guardada ? `Cotización ${numeroCotizacion(numeroEnEdicion)}` : 'Cotización'}{activa && lista.length > 1 ? ` ${activa.etiqueta}` : ''}
                            </p>
                        </div>

                        {/* Datos del cliente, editables en sitio. */}
                        <section aria-label="Datos del cliente" className="grid gap-x-5 gap-y-3 rounded-xl bg-slate-50 px-4 py-3.5 sm:grid-cols-2 xl:grid-cols-4">
                            {([
                                ['nombre', 'Cliente'],
                                ['telefono', 'Teléfono'],
                                ['direccion', 'Dirección'],
                                ['obra', 'Obra'],
                            ] as [keyof ClienteCotizacion, string][]).map(([campo, rotulo]) => (
                                <label key={campo} className="block min-w-0">
                                    <span className="block text-[12px] font-semibold text-slate-700">{rotulo}</span>
                                    <input
                                        className={campoHoja}
                                        value={cabecera.cliente[campo] || ''}
                                        disabled={soloLectura}
                                        onChange={e => cambiarCliente(campo, e.target.value)}
                                    />
                                </label>
                            ))}
                        </section>

                        {/* Productos. */}
                        <section aria-label="Productos">
                            <div className="grid grid-cols-[28px_minmax(0,1fr)_56px_120px] gap-3 border-b-2 border-slate-900 pb-2 text-[12px] font-bold text-slate-900">
                                <span>#</span><span>Descripción</span><span className="text-center">Cant.</span><span className="text-right">Valor antes de IVA</span>
                            </div>
                            {!hayCarrito && (
                                <p className="py-5 text-[13.5px] text-slate-700">
                                    {activa ? `La Opción ${activa.etiqueta} todavía no tiene productos.` : 'Sin productos.'}
                                </p>
                            )}
                            {carrito.map((item, i) => {
                                const moduloExiste = modulosDisponibles.has(item.moduloId);
                                const motivoNoEditar = bloqueoEdicion
                                    ?? (legado ? 'Opción antigua: duplícala a la forma nueva para editar sus productos.' : null)
                                    ?? (moduloExiste ? null : 'Este producto ya no existe en el cotizador: no se puede recalcular.');
                                const personalizado = item.resultado.personalizacion && (
                                    item.resultado.personalizacion.cambios.length +
                                    item.resultado.personalizacion.quitados.length +
                                    item.resultado.personalizacion.extras.length
                                ) > 0;
                                return (
                                    <div
                                        key={item.idTemp}
                                        className={`grid grid-cols-[28px_minmax(0,1fr)_56px_120px] gap-3 border-b border-slate-200 py-3.5 ${item.resultado.hayErrores ? 'bg-rose-50 -mx-3 px-3 rounded-lg' : ''}`}
                                    >
                                        <span className="text-[14px] font-bold text-slate-900 tabular-nums">{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="flex items-start gap-1.5 text-[14px] text-slate-900 leading-snug">
                                                {item.resultado.hayErrores && <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-700" />}
                                                {descripcionDeItem(item.input, item.resultado, null, item.moduloNombre)}
                                            </p>
                                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                                                {personalizado && (
                                                    <Chip
                                                        tono={item.resultado.perfileriaPersonalizada ? 'ambar' : 'marca'}
                                                        title={item.resultado.perfileriaPersonalizada
                                                            ? 'Tiene componentes personalizados, incluida perfilería: no sale en orden de corte.'
                                                            : 'Tiene componentes cambiados, quitados o agregados respecto del estándar.'}
                                                    >
                                                        Personalizado
                                                    </Chip>
                                                )}
                                                {!soloLectura && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => onEditarItem(item.idTemp)}
                                                            disabled={Boolean(motivoNoEditar)}
                                                            title={motivoNoEditar ?? undefined}
                                                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-templex-700 hover:underline disabled:text-slate-500 disabled:no-underline disabled:cursor-not-allowed"
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" /> Editar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => onDuplicarItem(item.idTemp)}
                                                            disabled={Boolean(bloqueoEdicion || legado)}
                                                            title={bloqueoEdicion ?? (legado ? 'Opción antigua: duplícala a la forma nueva.' : undefined)}
                                                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-templex-700 hover:underline disabled:text-slate-500 disabled:no-underline disabled:cursor-not-allowed"
                                                        >
                                                            <Copy className="w-3.5 h-3.5" /> Duplicar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => onQuitarItem(item.idTemp)}
                                                            disabled={Boolean(bloqueoEdicion)}
                                                            title={bloqueoEdicion ?? undefined}
                                                            className="inline-flex items-center gap-1 text-[13px] font-semibold text-rose-700 hover:underline disabled:text-slate-500 disabled:no-underline disabled:cursor-not-allowed"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" /> Quitar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-center text-[14px] text-slate-900 tabular-nums">{item.resultado.cantidadPiezas}</span>
                                        <span className="text-right text-[14px] font-semibold text-slate-900 tabular-nums">{fmtCOP(item.resultado.subtotalConAiu)}</span>
                                    </div>
                                );
                            })}
                            {!soloLectura && !bloqueoEdicion && !legado && (
                                <button
                                    type="button"
                                    onClick={onIrACotizar}
                                    className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-templex-700 hover:underline"
                                >
                                    <Plus className="w-4 h-4" /> Agregar otro producto
                                </button>
                            )}
                        </section>

                        {/* Trabajos en obra: mano de obra automática + cargos editables. */}
                        <section aria-label="Trabajos en obra" className="space-y-2.5">
                            <h3 className="text-[14px] font-bold text-slate-900">Trabajos en obra</h3>
                            {manoObra.length > 0 && (
                                <ul className="space-y-1.5">
                                    {manoObra.map(l => (
                                        <li key={`${l.tipo}-${l.descripcion}`} className="flex items-start justify-between gap-3 text-[13.5px]">
                                            <span className="min-w-0 text-slate-900">
                                                {l.descripcion}
                                                <span className="block text-[12px] text-slate-700">Se calcula solo con cada producto</span>
                                            </span>
                                            <span className="tabular-nums text-slate-900 whitespace-nowrap">{fmtCOP(totalLineaManoObra(l))}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {cargandoManoObra && manoObra.length === 0 && (
                                <p className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculando la instalación…</p>
                            )}
                            {legado && (
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                                    Esta opción es anterior al cambio de cargos: sus trabajos en obra van dentro del precio de cada producto.
                                    {!soloLectura && (
                                        <button type="button" onClick={propuestas.onDuplicar} className="font-semibold underline underline-offset-2">Duplicarla para editarlos</button>
                                    )}
                                </div>
                            )}
                            {!legado && (
                                <CargosCompactos
                                    cargos={cargos}
                                    onChange={onCambiarCargos}
                                    parametros={parametros}
                                    deshabilitado={Boolean(bloqueoCargos) || soloLectura}
                                />
                            )}
                        </section>

                        {/* Totales. */}
                        <section aria-label="Totales" aria-live="polite" className="ml-auto w-full max-w-sm space-y-2 text-[14px]">
                            <div className="flex justify-between gap-3"><span className="text-slate-800">Productos</span><span className="tabular-nums text-slate-900">{fmtCOP(totales.productos)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-slate-800">Instalación y ensamble</span><span className="tabular-nums text-slate-900">{fmtCOP(totales.manoObra)}</span></div>
                            <div className="flex items-center justify-between gap-3">
                                <label htmlFor="cot-descuento" className="text-slate-800">Descuento</label>
                                <span className="inline-flex items-center gap-1.5">
                                    {totales.descuento > 0 && <span className="tabular-nums text-rose-700">− {fmtCOP(totales.descuento)}</span>}
                                    <input
                                        id="cot-descuento"
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        disabled={legado || Boolean(bloqueoEdicion) || soloLectura}
                                        title={legado ? 'Las opciones anteriores al cambio no aplican descuento.' : bloqueoEdicion ?? undefined}
                                        value={descuentoPct * 100}
                                        onChange={e => {
                                            // Fracción con tope 1: el backend rechaza más.
                                            const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                            onCambiarDescuento(pct / 100);
                                        }}
                                        className="h-9 w-16 rounded-lg border border-slate-300 px-2 text-right tabular-nums focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200 disabled:bg-slate-50"
                                    />
                                    %
                                </span>
                            </div>
                            <div className="flex justify-between gap-3"><span className="text-slate-800">Otros trabajos en obra</span><span className="tabular-nums text-slate-900">{fmtCOP(totales.cargos)}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-slate-800">IVA {fmtPct(Number(parametros?.iva) || 0)}</span><span className="tabular-nums text-slate-900">{fmtCOP(totales.iva)}</span></div>
                            <div className="flex items-baseline justify-between gap-3 border-t-2 border-slate-900 pt-2.5">
                                <span className="font-bold text-slate-900">Total</span>
                                <span className="text-[28px] font-extrabold text-slate-900 tabular-nums leading-none">{fmtCOP(totales.total)}</span>
                            </div>
                            {hayCambiosSinGuardar && (
                                <p className="text-[12px] text-slate-700 text-right">Estimado: el definitivo queda al guardarse (en segundos).</p>
                            )}
                        </section>
                    </article>

                    {comparando && propuestas.cotizacionId !== null && (
                        <div className="mt-4">
                            <ComparadorPropuestas cotizacionId={propuestas.cotizacionId} onElegir={propuestas.onElegir} />
                        </div>
                    )}
                </div>

                {/* ── Lo que sigue ────────────────────────────────────────── */}
                <aside aria-label="Lo que sigue" className="space-y-4 lg:sticky lg:top-3">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <h3 className="text-[16px] font-bold text-slate-900 mb-4">Lo que sigue</h3>
                        <ol className="space-y-5">
                            <Paso
                                n={1}
                                estado={hayCarrito && !hayErrores ? 'hecho' : 'actual'}
                                titulo={hayCarrito ? 'Cotización armada' : 'Arma la cotización'}
                                detalle={hayCarrito
                                    ? `${carrito.length} producto${carrito.length === 1 ? '' : 's'}${lista.length > 1 ? ` · ${lista.length} opciones` : ''}`
                                    : 'Agrega el primer producto en Cotizar.'}
                            />

                            {!cerrada && (
                                <Paso
                                    n={2}
                                    estado={aprobada ? 'hecho' : motivoNoEnviar ? 'futuro' : 'actual'}
                                    titulo={aprobada ? 'Enviada al cliente' : 'Envíasela al cliente'}
                                    detalle={motivoNoEnviar ?? (lista.length > 1 ? `Sale la opción que estás viendo (${activa?.etiqueta ?? 'A'}).` : 'Sale en PDF, lista para el cliente.')}
                                >
                                    {!motivoNoEnviar && (
                                        <div className="space-y-2">
                                            <BotonPrimario ancho icono={MessageCircle} onClick={onWhatsApp} cargando={generandoPdf} className="min-h-[44px]">
                                                Enviar por WhatsApp
                                            </BotonPrimario>
                                            <BotonSecundario ancho icono={Download} onClick={onPdf} cargando={generandoPdf} className="min-h-[44px]">
                                                Descargar PDF
                                            </BotonSecundario>
                                            <p className="text-[12px] text-slate-700 leading-snug">
                                                WhatsApp se abre con el mensaje listo y el PDF se descarga para que lo adjuntes.
                                            </p>
                                        </div>
                                    )}
                                </Paso>
                            )}

                            {pendiente && (
                                <Paso
                                    n={3}
                                    estado={motivoNoEnviar ? 'futuro' : 'actual'}
                                    titulo="¿Qué respondió?"
                                    detalle="Al aprobar, el lead pasa solo a Aprobado en el CRM."
                                >
                                    {soloLectura ? null : !eligiendoAprobada ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            <BotonPrimario
                                                icono={CheckCircle2}
                                                onClick={aprobar}
                                                disabled={Boolean(motivoNoEnviar) || cierreOcupado}
                                                cargando={estadoEnCamino && cabecera.estado === 'APROBADA'}
                                                claseColor="bg-emerald-600 text-white hover:bg-emerald-700"
                                                className="min-h-[44px]"
                                            >
                                                Aprobó
                                            </BotonPrimario>
                                            <BotonSecundario
                                                icono={XCircle}
                                                onClick={onPerdida}
                                                disabled={Boolean(motivoNoEnviar) || cierreOcupado}
                                                className="min-h-[44px] !text-rose-700"
                                            >
                                                La perdimos
                                            </BotonSecundario>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                            <p className="text-[13px] font-semibold text-emerald-900">¿Cuál opción aprobó?</p>
                                            {lista.map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => { setEligiendoAprobada(false); onAprobar(p.id); }}
                                                    disabled={cierreOcupado}
                                                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2.5 text-left hover:bg-emerald-100 min-h-[44px]"
                                                >
                                                    <span className="text-[13.5px] font-semibold text-slate-900">Opción {p.etiqueta}{p.nombre ? ` · ${p.nombre}` : ''}</span>
                                                    <span className="text-[13px] tabular-nums text-slate-900">{fmtCOP(p.totales.total)}</span>
                                                </button>
                                            ))}
                                            <button type="button" onClick={() => setEligiendoAprobada(false)} className="text-[12.5px] font-semibold text-slate-700 hover:underline">
                                                Cancelar
                                            </button>
                                        </div>
                                    )}
                                </Paso>
                            )}

                            {aprobada && (
                                <Paso
                                    n={3}
                                    estado="hecho"
                                    titulo={`Aprobada${elegida && lista.length > 1 ? ` · Opción ${elegida.etiqueta}` : ''}`}
                                />
                            )}

                            {!cerrada && (
                                <Paso
                                    n={4}
                                    estado={odpVinculada ? 'hecho' : aprobada ? 'actual' : 'bloqueado'}
                                    titulo={odpVinculada ? 'ODP creada' : 'Crear la ODP'}
                                    detalle={odpVinculada ? null : aprobada ? 'Pasa la cotización a producción.' : 'Se habilita cuando el cliente apruebe.'}
                                >
                                    {odpVinculada && (
                                        <a
                                            href={`/odp?buscar=${encodeURIComponent(odpVinculada.numero)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1.5 text-[14px] font-bold text-emerald-800 hover:underline"
                                        >
                                            <FileCheck className="w-4 h-4" /> {odpVinculada.numero} <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    )}
                                    {!odpVinculada && aprobada && onCrearOdp && (
                                        <BotonPrimario ancho icono={FileCheck} onClick={onCrearOdp} claseColor="bg-emerald-600 text-white hover:bg-emerald-700" className="min-h-[44px]">
                                            Crear ODP
                                        </BotonPrimario>
                                    )}
                                </Paso>
                            )}

                            {cerrada && (
                                <li className="space-y-3">
                                    <p className="text-[14px] font-semibold text-slate-900">
                                        {estadoGuardado === 'PERDIDO' ? 'La cotización se perdió' : 'La cotización se canceló'}
                                    </p>
                                    {estadoGuardado === 'PERDIDO' && motivoPerdida && (
                                        <p className="text-[13px] text-rose-800">
                                            Motivo: <span className="font-semibold">{MOTIVOS_PERDIDA.find(m => m.valor === motivoPerdida)?.rotulo ?? motivoPerdida}</span>
                                        </p>
                                    )}
                                    {!soloLectura && (
                                        <BotonSecundario ancho icono={RotateCcw} onClick={() => onCambiarEstado('PENDIENTE')} disabled={cierreOcupado} className="min-h-[44px]">
                                            Volver a “Esperando respuesta”
                                        </BotonSecundario>
                                    )}
                                </li>
                            )}
                        </ol>
                    </section>

                    {/* ── Datos internos (no salen en el PDF) ─────────────── */}
                    <details className="group rounded-2xl border border-slate-200 bg-white px-5 py-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-slate-900 min-h-[28px]">
                            Datos internos
                            <ChevronDown className="w-4 h-4 transition group-open:rotate-180" />
                        </summary>
                        <div className="mt-4 space-y-4 text-[13px]">
                            <div>
                                <p className="mb-1.5 font-semibold text-slate-800">Tipo de cliente (lista de precios)</p>
                                <div role="radiogroup" aria-label="Tipo de cliente" className="grid grid-cols-3 gap-1.5">
                                    {SEGMENTOS.map(s => (
                                        <button
                                            key={s.v}
                                            type="button"
                                            role="radio"
                                            aria-checked={segmento === s.v}
                                            title={motivoNoSegmento ?? s.largo}
                                            disabled={Boolean(motivoNoSegmento) || cambiandoSegmento || soloLectura}
                                            onClick={() => onCambiarSegmento(s.v)}
                                            className={`rounded-lg border px-2 py-2 text-[12.5px] font-semibold min-h-[40px] disabled:cursor-not-allowed ${segmento === s.v
                                                ? 'border-templex-600 bg-templex-600 text-white'
                                                : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-500'}`}
                                        >
                                            {s.corto}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1 text-[12px] text-slate-700">
                                    {cambiandoSegmento ? 'Recalculando precios…' : motivoNoSegmento ?? 'Cambiarlo recalcula los precios de todas las opciones.'}
                                </p>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <span className="text-slate-700">Asesor</span>
                                {puedeCambiarAsesor && asesores.length > 0 ? (
                                    <select
                                        className="h-9 max-w-[180px] rounded-lg border border-slate-300 px-2 text-[13px] text-slate-900"
                                        value={cabecera.asesorUsuarioId ?? ''}
                                        onChange={e => {
                                            const a = asesores.find(x => x.id === Number(e.target.value));
                                            if (a) onCambiarCabecera({ asesorUsuarioId: a.id, asesor: a.nombre });
                                        }}
                                    >
                                        {cabecera.asesorUsuarioId === null && <option value="">{cabecera.asesor || 'Sin asesor asignado'}</option>}
                                        {cabecera.asesorUsuarioId !== null && !asesores.some(a => a.id === cabecera.asesorUsuarioId) && (
                                            <option value={cabecera.asesorUsuarioId}>{cabecera.asesor}</option>
                                        )}
                                        {asesores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                    </select>
                                ) : (
                                    <span className="font-semibold text-slate-900 text-right">{cabecera.asesor || '—'}</span>
                                )}
                            </div>

                            <div>
                                <p className="mb-1 text-slate-700">Vinculada a</p>
                                {vinculo
                                    ? <ChipVinculo ficha={vinculo} />
                                    : <p className="text-slate-800">Sin vínculo todavía: se elige en Cotizar.</p>}
                            </div>

                            <label className="block">
                                <span className="block text-slate-700">Contacto en obra</span>
                                <input
                                    className={campoHoja}
                                    value={cabecera.cliente.contacto || ''}
                                    disabled={soloLectura}
                                    onChange={e => cambiarCliente('contacto', e.target.value)}
                                />
                            </label>

                            {guardada && (
                                <div className="space-y-2 border-t border-slate-200 pt-3">
                                    <BotonSecundario ancho compacto icono={HardHat} onClick={onDetalleTecnico}>
                                        Hoja de trabajo y orden de corte
                                    </BotonSecundario>
                                    {lista.length > 1 && (
                                        <BotonSecundario ancho compacto icono={Scale} onClick={() => setComparando(v => !v)}>
                                            {comparando ? 'Ocultar comparación' : 'Comparar las opciones'}
                                        </BotonSecundario>
                                    )}
                                </div>
                            )}
                        </div>
                    </details>
                </aside>
            </div>
        </div>
    );
};

export default TabActual;
