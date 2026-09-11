import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
    Search, Edit3, Trash2, Inbox, Loader2, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';

import { apiListarCotizaciones, apiObtenerCotizacion, apiEliminarCotizacion } from '../services/cotizadorApi';
import { Cotizacion, CotizacionLigera, EstadoCotizacion, FiltrosListado } from '../types';
import { fmtCOP, fmtFecha } from '../format';
import ModalDetalleCotizacion from './modals/ModalDetalleCotizacion';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Guardadas" del Cotizador — listado con filtros server-side de
// `apiListarCotizaciones`, misma línea visual que ExploradorODPPanel (slate/
// indigo, tabla con th clickeable, sin Redux: este listado solo importa
// mientras la pestaña está montada).
// ─────────────────────────────────────────────────────────────────────────────

const ESTADOS: { v: EstadoCotizacion; l: string }[] = [
    { v: 'PENDIENTE', l: 'Pendiente' },
    { v: 'APROBADA', l: 'Aprobada' },
    { v: 'CANCELADO', l: 'Cancelado' },
    { v: 'PERDIDO', l: 'Perdido' },
];

const badgeEstado = (estado: EstadoCotizacion): string => {
    switch (estado) {
        case 'PENDIENTE': return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'APROBADA': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'CANCELADO': return 'bg-slate-100 text-slate-600 border-slate-200';
        case 'PERDIDO': return 'bg-rose-100 text-rose-800 border-rose-200';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};

const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

type OrdenCampo = 'numero' | 'cliente' | 'estado' | 'items' | 'total' | 'fecha';

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
        if (ordenCampo !== campo) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-slate-300 inline" />;
        return ordenDir === 'ASC'
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-indigo-500 inline" />
            : <ChevronDown className="w-3.5 h-3.5 ml-1 text-indigo-500 inline" />;
    };

    const th = (campo: OrdenCampo, texto: string, extra = '') => (
        <th
            onClick={() => ordenar(campo)}
            className={`px-4 py-3 font-medium cursor-pointer select-none hover:bg-slate-100 transition whitespace-nowrap ${extra}`}
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
                case 'items': return (a.items.length - b.items.length) * factor;
                case 'total': return (a.totales.total - b.totales.total) * factor;
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
                <p className="text-[12.5px] text-slate-500 font-semibold mb-1">
                    {cotizaciones.length} cotizacion{cotizaciones.length === 1 ? '' : 'es'} guardada{cotizaciones.length === 1 ? '' : 's'}
                </p>
            )}
            {/* ── Filtros ──────────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                    <label className={labelClass}>Cliente</label>
                    <input className={inputClass} placeholder="Nombre del cliente" value={cliente} onChange={e => setCliente(e.target.value)} />
                </div>
                <div>
                    <label className={labelClass}>Estado</label>
                    <select className={inputClass} value={estado} onChange={e => setEstado(e.target.value)}>
                        <option value="">Todos</option>
                        {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>N.°</label>
                    <input type="number" className={inputClass} placeholder="Número" value={numero} onChange={e => setNumero(e.target.value)} />
                </div>
                <div>
                    <label className={labelClass}>Buscar</label>
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input className={`${inputClass} pl-9`} placeholder="Obra, contacto…" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* ── Resultados ───────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                                {th('numero', 'N.°')}
                                <th className="px-4 py-3 font-medium text-left">Cliente</th>
                                <th className="px-4 py-3 font-medium text-left">Asesor</th>
                                {th('estado', 'Estado')}
                                {th('items', 'Ítems')}
                                {th('total', 'Total', 'text-right')}
                                {th('fecha', 'Fecha')}
                                <th className="px-4 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={8} className="py-16 text-center text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                    Cargando cotizaciones…
                                </td></tr>
                            ) : filas.length === 0 ? (
                                <tr><td colSpan={8} className="py-16 text-center">
                                    <Inbox className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                                    <p className="text-slate-600 font-semibold">Ninguna cotización guardada coincide con estos filtros</p>
                                </td></tr>
                            ) : filas.map(c => (
                                <tr
                                    key={c.id}
                                    onClick={() => { setDetalleId(c.id); setDetalleVista('normal'); }}
                                    className="hover:bg-violet-50/60 cursor-pointer transition"
                                >
                                    <td className="px-4 py-3 font-cotizador-head font-bold text-slate-800 whitespace-nowrap">{c.numero}</td>
                                    <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                                        <div className="truncate" title={c.cliente?.nombre || ''}>{c.cliente?.nombre || '—'}</div>
                                        {c.cliente?.obra && <div className="text-[11px] text-slate-400 truncate">{c.cliente.obra}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{c.asesor || '—'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${badgeEstado(c.estado)}`}>
                                            {ESTADOS.find(e => e.v === c.estado)?.l || c.estado}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center text-slate-600">{c.items.length}</td>
                                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap font-cotizador-head font-semibold">{fmtCOP(c.totales.total)}</td>
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(c.creadaEn)}</td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => reabrir(c.id)}
                                            disabled={reabriendoId === c.id}
                                            title="Reabrir para editar"
                                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition disabled:opacity-40 mr-1"
                                        >
                                            {reabriendoId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
                                        </button>
                                        <button
                                            onClick={() => eliminar(c)}
                                            disabled={eliminandoId === c.id}
                                            title="Eliminar"
                                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition disabled:opacity-40"
                                        >
                                            {eliminandoId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

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
