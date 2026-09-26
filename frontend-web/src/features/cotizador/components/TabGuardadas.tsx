import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
    Search, Edit3, Trash2, Inbox, Loader2, ChevronUp, ChevronDown, ChevronsUpDown,
} from '../../../components/ui/icons';

import { apiListarCotizaciones, apiObtenerCotizacion, apiEliminarCotizacion } from '../services/cotizadorApi';
import { Cotizacion, CotizacionLigera, EstadoCotizacion, FiltrosListado } from '../types';
import { fmtCOP, fmtCOPCorto, fmtFecha } from '../format';
import ModalDetalleCotizacion from './modals/ModalDetalleCotizacion';
import { Campo, ChipEstadoCotizacion, Input, Select, Tarjeta } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Guardadas" del Cotizador — listado con filtros server-side de
// `apiListarCotizaciones`, misma línea visual que ExploradorODPPanel (slate/
// templex, tabla con th clickeable, sin Redux: este listado solo importa
// mientras la pestaña está montada).
//
// Fase 5 del sistema visual (2026-09-26): los encabezados de ESTADO e ÍTEMS
// quedaban alineados a la izquierda sobre celdas centradas, así que el chip
// rosa de "Perdido" se leía debajo de "ÍTEMS" como si la cifra fuera roja. Cada
// encabezado lleva ahora la misma alineación que su celda.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS: { v: EstadoCotizacion; l: string }[] = [
    { v: 'PENDIENTE', l: 'Pendiente' },
    { v: 'APROBADA', l: 'Aprobada' },
    { v: 'CANCELADO', l: 'Cancelado' },
    { v: 'PERDIDO', l: 'Perdido' },
];

type OrdenCampo = 'numero' | 'cliente' | 'estado' | 'items' | 'total' | 'fecha';

// ─── Cotizaciones con varias propuestas ─────────────────────────────────────
// Desde el 2026-09-20 una cotización puede tener hasta 5 propuestas y su total
// es el de la ELEGIDA. Cuando no hay ninguna elegida, los totales espejo de la
// cabecera quedan en CERO a propósito: presentar el de la A como definitivo
// haría pasar por precio cerrado uno que nadie escogió. En ese caso esta tabla
// pinta el RANGO ("$1,1 M – $1,8 M · sin decidir"), que es exactamente lo que
// el vendedor le puede decir al cliente en ese momento.

/** Los ítems que cuentan para una fila del listado. `c.items` trae los de TODAS
 * las propuestas juntos, así que sin filtrar por la elegida una cotización con
 * tres variantes de dos ventanas parecería tener seis productos. */
const itemsDeLaElegida = (c: CotizacionLigera): number => {
    const elegidaId = c.propuestaElegidaId ?? c.propuestas?.find(p => p.elegida)?.id ?? null;
    if (elegidaId === null) {
        // Sin elegida no hay un conjunto "el" de ítems: se muestran los de la
        // primera propuesta, que es la que el cliente ya vio.
        const primera = c.propuestas?.[0]?.id ?? null;
        if (primera === null) return c.items.length;
        return c.items.filter(i => i.propuestaId === primera).length;
    }
    return c.items.filter(i => i.propuestaId === elegidaId).length || c.items.length;
};

interface TotalDeFila {
    /** Total de la elegida, o el mayor de las propuestas cuando no hay ninguna.
     * Sólo se usa para ORDENAR: con `null` la columna quedaría al azar. */
    valorOrden: number;
    /** Lo que se pinta en la celda. */
    nodo: React.ReactNode;
}

const totalDeFila = (c: CotizacionLigera): TotalDeFila => {
    const props = c.propuestas ?? [];
    const hayElegida = (c.propuestaElegidaId ?? null) !== null || props.some(p => p.elegida);

    if (hayElegida || props.length <= 1) {
        return {
            valorOrden: c.totales.total,
            nodo: <span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(c.totales.total)}</span>,
        };
    }

    const totales = props.map(p => Number(p.totales?.total) || 0);
    const min = Math.min(...totales);
    const max = Math.max(...totales);
    return {
        valorOrden: max,
        nodo: (
            <span title={`${props.length} propuestas sin decidir: ${totales.map(t => fmtCOP(t)).join(' · ')}`}>
                <span className="font-semibold text-slate-900 tabular-nums">
                    {min === max ? fmtCOPCorto(max) : `${fmtCOPCorto(min)} – ${fmtCOPCorto(max)}`}
                </span>
                <span className="block text-[11px] font-semibold text-amber-800">sin decidir</span>
            </span>
        ),
    };
};

interface Props {
    onReabrir: (cot: Cotizacion) => void;
    abrirDetalleInicial?: { id: number; vista: 'normal' | 'tecnico' };
}

const TabGuardadas: React.FC<Props> = ({ onReabrir, abrirDetalleInicial }) => {
    const [cliente, setCliente] = useState('');
    const [clienteDebounced, setClienteDebounced] = useState('');
    const [estado, setEstado] = useState('');
    const [numero, setNumero] = useState('');
    const [q, setQ] = useState('');

    const [cotizaciones, setCotizaciones] = useState<CotizacionLigera[]>([]);
    const [loading, setLoading] = useState(true);
    const [reabriendoId, setReabriendoId] = useState<number | null>(null);
    const [eliminandoId, setEliminandoId] = useState<number | null>(null);

    const [ordenCampo, setOrdenCampo] = useState<OrdenCampo>('fecha');
    const [ordenDir, setOrdenDir] = useState<'ASC' | 'DESC'>('DESC');

    const [detalleId, setDetalleId] = useState<number | null>(null);
    const [detalleVista, setDetalleVista] = useState<'normal' | 'tecnico'>('normal');

    // Debounce del texto de cliente: evita una consulta por tecla.
    useEffect(() => {
        const t = setTimeout(() => setClienteDebounced(cliente), 400);
        return () => clearTimeout(t);
    }, [cliente]);

    const filtros: FiltrosListado = useMemo(() => {
        const f: FiltrosListado = {};
        if (clienteDebounced.trim()) f.cliente = clienteDebounced.trim();
        if (estado) f.estado = estado;
        if (numero.trim()) f.numero = numero.trim();
        if (q.trim()) f.q = q.trim();
        return f;
    }, [clienteDebounced, estado, numero, q]);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await apiListarCotizaciones(filtros);
            setCotizaciones(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo cargar el listado de cotizaciones.');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { cargar(); }, [cargar]);

    // Deep-link: ?tab=guardadas&id=1&vista=tecnico abre el modal directo al montar.
    useEffect(() => {
        if (abrirDetalleInicial) {
            setDetalleId(abrirDetalleInicial.id);
            setDetalleVista(abrirDetalleInicial.vista);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const ordenar = (campo: OrdenCampo) => {
        if (ordenCampo === campo) {
            setOrdenDir(d => (d === 'DESC' ? 'ASC' : 'DESC'));
        } else {
            setOrdenCampo(campo);
            setOrdenDir('DESC');
        }
    };

    const IconoOrden: React.FC<{ campo: OrdenCampo }> = ({ campo }) => {
        if (ordenCampo !== campo) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-slate-500 inline" />;
        return ordenDir === 'ASC'
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-templex-600 inline" />
            : <ChevronDown className="w-3.5 h-3.5 ml-1 text-templex-600 inline" />;
    };

    const th = (campo: OrdenCampo, texto: string, extra = '') => (
        <th
            onClick={() => ordenar(campo)}
            className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-900 cursor-pointer select-none hover:bg-slate-100 transition whitespace-nowrap ${extra || 'text-left'}`}
        >
            {texto}<IconoOrden campo={campo} />
        </th>
    );

    const filas = useMemo(() => {
        const copia = [...cotizaciones];
        const factor = ordenDir === 'ASC' ? 1 : -1;
        copia.sort((a, b) => {
            switch (ordenCampo) {
                case 'numero': return (a.numero - b.numero) * factor;
                case 'cliente': return (a.cliente?.nombre || '').localeCompare(b.cliente?.nombre || '') * factor;
                case 'estado': return a.estado.localeCompare(b.estado) * factor;
                case 'items': return (itemsDeLaElegida(a) - itemsDeLaElegida(b)) * factor;
                case 'total': return (totalDeFila(a).valorOrden - totalDeFila(b).valorOrden) * factor;
                case 'fecha': return (new Date(a.creadaEn || 0).getTime() - new Date(b.creadaEn || 0).getTime()) * factor;
                default: return 0;
            }
        });
        return copia;
    }, [cotizaciones, ordenCampo, ordenDir]);

    const reabrir = async (id: number) => {
        setReabriendoId(id);
        try {
            const { data } = await apiObtenerCotizacion(id);
            onReabrir(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo abrir la cotización para editarla.');
        } finally {
            setReabriendoId(null);
        }
    };

    const eliminar = async (cot: CotizacionLigera) => {
        if (!window.confirm(`¿Eliminar la cotización N.° ${cot.numero}? Esta acción no se puede deshacer.`)) return;
        setEliminandoId(cot.id);
        try {
            await apiEliminarCotizacion(cot.id);
            toast.success(`Cotización N.° ${cot.numero} eliminada.`);
            await cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo eliminar la cotización.');
        } finally {
            setEliminandoId(null);
        }
    };

    return (
        <div className="p-4 space-y-4">
            {cotizaciones.length > 0 && (
                <p className="text-[12.5px] text-slate-900 font-semibold mb-1">
                    {cotizaciones.length} cotizacion{cotizaciones.length === 1 ? '' : 'es'} guardada{cotizaciones.length === 1 ? '' : 's'}
                </p>
            )}
            {/* ── Filtros ──────────────────────────────────────────────────── */}
            <Tarjeta cuerpoClassName="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Campo etiqueta="Cliente">
                    <Input placeholder="Nombre del cliente" value={cliente} onChange={e => setCliente(e.target.value)} />
                </Campo>
                <Campo etiqueta="Estado">
                    <Select value={estado} onChange={e => setEstado(e.target.value)}>
                        <option value="">Todos</option>
                        {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                    </Select>
                </Campo>
                <Campo etiqueta="N.°">
                    <Input type="number" placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} />
                </Campo>
                <Campo etiqueta="Buscar">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input className="pl-9" placeholder="Obra, contacto…" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                </Campo>
            </Tarjeta>

            {/* ── Resultados ───────────────────────────────────────────────── */}
            <Tarjeta sinRelleno>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-900 border-b border-slate-200">
                            <tr>
                                {th('numero', 'N.°')}
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-900 text-left">Cliente</th>
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-900 text-left">Asesor</th>
                                {th('estado', 'Estado', 'text-center')}
                                {th('items', 'Ítems', 'text-center')}
                                {th('total', 'Total', 'text-right')}
                                {th('fecha', 'Fecha')}
                                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-900 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={8} className="py-16 text-center text-slate-700">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Cargando cotizaciones…
                                </td></tr>
                            ) : filas.length === 0 ? (
                                <tr><td colSpan={8} className="py-16 text-center">
                                    <Inbox className="w-9 h-9 text-slate-400 mx-auto mb-2" />
                                    <p className="text-slate-900 font-semibold">Ninguna cotización guardada coincide con estos filtros</p>
                                </td></tr>
                            ) : filas.map(c => (
                                <tr
                                    key={c.id}
                                    onClick={() => { setDetalleId(c.id); setDetalleVista('normal'); }}
                                    className="hover:bg-templex-50/60 cursor-pointer transition"
                                >
                                    <td className="px-4 py-3 font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                        {c.numero}
                                        {(c.propuestas?.length ?? 0) > 1 && (
                                            <span
                                                className="ml-1.5 px-1.5 py-0.5 rounded-full bg-templex-50 ring-1 ring-templex-200 text-[11px] font-semibold text-templex-800 align-middle"
                                                title={`${c.propuestas!.length} propuestas: ${c.propuestas!.map(p => p.etiqueta).join(' · ')}`}
                                            >
                                                {c.propuestas!.length} props.
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-slate-800 max-w-[220px]">
                                        <div className="truncate" title={c.cliente?.nombre || ''}>{c.cliente?.nombre || '—'}</div>
                                        {c.cliente?.obra && <div className="text-[11.5px] text-slate-700 truncate">{c.cliente.obra}</div>}
                                    </td>
                                    <td className={`px-4 py-3 max-w-[160px] truncate ${c.asesor ? 'text-slate-800' : 'text-slate-500'}`}>{c.asesor || '—'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <ChipEstadoCotizacion estado={c.estado} />
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-800 tabular-nums">{itemsDeLaElegida(c)}</td>
                                    <td className="px-4 py-3 text-right text-slate-800 whitespace-nowrap">{totalDeFila(c).nodo}</td>
                                    <td className="px-4 py-3 text-slate-800 tabular-nums whitespace-nowrap">{fmtFecha(c.creadaEn)}</td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => reabrir(c.id)}
                                            disabled={reabriendoId === c.id}
                                            title="Reabrir para editar"
                                            className="p-1.5 rounded-lg text-templex-700 hover:bg-templex-50 transition disabled:opacity-40 mr-1"
                                        >
                                            {reabriendoId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => eliminar(c)}
                                            disabled={eliminandoId === c.id}
                                            title="Eliminar"
                                            className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 transition disabled:opacity-40"
                                        >
                                            {eliminandoId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Tarjeta>

            {detalleId !== null && (
                <ModalDetalleCotizacion
                    id={detalleId}
                    vistaInicial={detalleVista}
                    onClose={() => setDetalleId(null)}
                    onReabrir={onReabrir}
                />
            )}
        </div>
    );
};

export default TabGuardadas;
