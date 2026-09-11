import React from 'react';
import { Trash2, Inbox, AlertTriangle, Loader2, Save, Package } from 'lucide-react';

import { fmtCOP } from '../format';
import { ClienteCotizacion, EstadoCotizacion, ItemCarrito, SegmentoCliente } from '../types';
import { CabeceraCotizacion } from '../CotizadorPage';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Actual": edita la cabecera (cliente/comercial) y muestra el carrito
// acumulado en la pestaña "Cotizar". No calcula ni persiste nada — el padre
// (CotizadorPage) es dueño de `carrito`/`cabecera` y de `guardarCotizacion`;
// este componente solo notifica cambios hacia arriba (mismo patrón que
// FormularioModulo con `onResultado`).
// ─────────────────────────────────────────────────────────────────────────────

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

const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

/**
 * Texto de respaldo cuando el ítem no trae `descripcionItem` (todavía no hay
 * forma de editarla desde esta pestaña — no está en el contrato de props).
 * Ancho×alto es lo único razonablemente común a los módulos hoy; si el input
 * no trae esos campos, cae al nombre del módulo sin más.
 */
const descripcionRespaldo = (item: ItemCarrito): string => {
    const anchoCm = item.input?.anchoCm ?? item.input?.anchoNaveCm;
    const altoCm = item.input?.altoCm ?? item.input?.altoNaveCm;
    if (anchoCm != null || altoCm != null) {
        // El motor de cálculo trabaja internamente en cm; la UI ahora muestra mm.
        // `input` es Record<string, unknown> — cast explícito, el contrato ya asume numérico.
        const anchoMm = anchoCm != null ? (anchoCm as number) * 10 : '?';
        const altoMm = altoCm != null ? (altoCm as number) * 10 : '?';
        return `${anchoMm}×${altoMm} mm`;
    }
    return item.moduloNombre;
};

const TabActual: React.FC<Props> = ({
    carrito, cabecera, onCambiarCabecera, onQuitarItem, onGuardar, guardando,
    numeroEnEdicion, asesoresSugeridos, estadosDisponibles,
}) => {
    const cambiarCliente = (campo: keyof ClienteCotizacion, valor: string) => {
        onCambiarCabecera({ cliente: { ...cabecera.cliente, [campo]: valor } });
    };

    const totales = carrito.reduce(
        (acc, it) => ({
            subtotalConAiu: acc.subtotalConAiu + (it.resultado.subtotalConAiu || 0),
            iva: acc.iva + (it.resultado.iva || 0),
            total: acc.total + (it.resultado.total || 0),
        }),
        { subtotalConAiu: 0, iva: 0, total: 0 },
    );

    const hayCarrito = carrito.length > 0;

    return (
        <div className="p-4 space-y-4">
            {!hayCarrito && (
                <div className="bg-white border border-slate-200 rounded-xl py-16 text-center">
                    <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-600 font-semibold">Aún no has agregado ítems.</p>
                    <p className="text-slate-400 text-sm mt-1">Ve a la pestaña Cotizar para calcular el primero.</p>
                </div>
            )}

            {hayCarrito && (
                <>
                    {/* ── Cliente ──────────────────────────────────────────────── */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                        <span className="text-sm font-bold text-slate-700 block mb-3">Cliente</span>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className={labelClass}>Nombre</label>
                                <input
                                    className={inputClass}
                                    value={cabecera.cliente.nombre || ''}
                                    onChange={e => cambiarCliente('nombre', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Obra</label>
                                <input
                                    className={inputClass}
                                    value={cabecera.cliente.obra || ''}
                                    onChange={e => cambiarCliente('obra', e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelClass}>Dirección</label>
                                <input
                                    className={inputClass}
                                    value={cabecera.cliente.direccion || ''}
                                    onChange={e => cambiarCliente('direccion', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Teléfono</label>
                                <input
                                    className={inputClass}
                                    value={cabecera.cliente.telefono || ''}
                                    onChange={e => cambiarCliente('telefono', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Contacto</label>
                                <input
                                    className={inputClass}
                                    value={cabecera.cliente.contacto || ''}
                                    onChange={e => cambiarCliente('contacto', e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Comercial ────────────────────────────────────────────── */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                        <span className="text-sm font-bold text-slate-700 block mb-3">Comercial</span>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                                <label className={labelClass}>Segmento</label>
                                <select
                                    className={inputClass}
                                    value={cabecera.segmentoCliente}
                                    onChange={e => onCambiarCabecera({ segmentoCliente: e.target.value as SegmentoCliente })}
                                >
                                    {SEGMENTOS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Asesor</label>
                                <input
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
                                <label className={labelClass}>Descuento (%)</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    className={inputClass}
                                    value={cabecera.descuentoPct * 100}
                                    onChange={e => onCambiarCabecera({ descuentoPct: (Number(e.target.value) || 0) / 100 })}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Estado</label>
                                <select
                                    className={inputClass}
                                    value={cabecera.estado}
                                    onChange={e => onCambiarCabecera({ estado: e.target.value as EstadoCotizacion })}
                                >
                                    {estadosDisponibles.map(e => <option key={e} value={e}>{ESTADO_LABELS[e] || e}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── Ítems del carrito ────────────────────────────────────── */}
                    <div className="space-y-2">
                        {carrito.map(item => (
                            <div
                                key={item.idTemp}
                                className={`border rounded-xl p-4 flex items-start justify-between gap-4 ${item.resultado.hayErrores
                                    ? 'bg-rose-50 border-rose-200'
                                    : 'bg-white border-slate-200'}`}
                            >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-700 flex items-center justify-center shrink-0">
                                    <Package className="w-5 h-5 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        {item.resultado.hayErrores && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                                        <span className="text-sm font-bold text-slate-800">{item.moduloNombre}</span>
                                        <span className="text-xs text-slate-400 truncate">
                                            {item.descripcionItem || descripcionRespaldo(item)}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-slate-500">
                                        <span><strong className="font-cotizador-head">{item.resultado.cantidadPiezas}</strong> pieza{item.resultado.cantidadPiezas === 1 ? '' : 's'}</span>
                                        <span>Subtotal + AIU: <strong className="text-slate-700 font-cotizador-head">{fmtCOP(item.resultado.subtotalConAiu)}</strong></span>
                                        <span>IVA: <strong className="text-slate-700 font-cotizador-head">{fmtCOP(item.resultado.iva)}</strong></span>
                                        <span>Total: <strong className="text-slate-800 font-cotizador-head">{fmtCOP(item.resultado.total)}</strong></span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onQuitarItem(item.idTemp)}
                                    title="Quitar ítem"
                                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* ── Totales generales ────────────────────────────────────── */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Subtotal + AIU</div>
                            <div className="text-lg font-black text-slate-800 font-cotizador-head">{fmtCOP(totales.subtotalConAiu)}</div>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">IVA</div>
                            <div className="text-lg font-black text-slate-800 font-cotizador-head">{fmtCOP(totales.iva)}</div>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 border border-indigo-700 rounded-xl p-4">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-100">Total</div>
                            <div className="text-white font-cotizador-head text-xl font-bold">{fmtCOP(totales.total)}</div>
                        </div>
                    </div>

                    <button
                        onClick={onGuardar}
                        disabled={guardando || carrito.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {numeroEnEdicion !== null ? `Actualizar cotización N.° ${numeroEnEdicion}` : 'Guardar cotización'}
                    </button>
                </>
            )}
        </div>
    );
};

export default TabActual;
