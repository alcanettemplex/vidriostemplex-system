import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
    CheckCircle2, FileCheck, Inbox, Loader2, MessageCircle, MoreVertical, Plus, Search, XCircle,
} from '../../../components/ui/icons';

import { apiListarCotizaciones, apiObtenerCotizacion, apiEliminarCotizacion, apiListarAsesoresCotizador } from '../services/cotizadorApi';
import { usePermisosCotizador } from '../permisos';
import { AsesorCotizador, MOTIVOS_PERDIDA } from '../vinculo';
import { Cotizacion, CotizacionLigera, FiltrosListado, RotuloVinculo } from '../types';
import { fmtCOP, fmtCOPCorto, numeroCotizacion } from '../format';
import { abrirWhatsApp } from '../documentos';
import ModalDetalleCotizacion from './modals/ModalDetalleCotizacion';
import ODPFichaModal from '../../odp/components/ODPFichaModal';
import { BotonPrimario, BotonSecundario } from './ui';

// ─────────────────────────────────────────────────────────────────────────────
// Pestaña "Cotizaciones" — BANDEJA POR SITUACIÓN (rediseño 2026-10-01,
// dirección C1 elegida por el usuario sobre el lienzo de propuestas).
//
// Antes: una tabla de 9 columnas con 5 filtros, y el PDF escondido dentro de un
// modal. Los asesores no sabían qué hacer con ella. Ahora la pestaña responde
// "¿qué tengo pendiente?":
//
//   · Necesitan atención (arranca aquí): aprobadas sin ODP, por vencer y
//     vencidas, cada una con SU acción en la fila (Crear ODP, Recordar por
//     WhatsApp, Perdida).
//   · Esperando respuesta · Aprobadas · Perdidas · Todas.
//
// Un clic en la fila abre la cotización directo en Resumen (sin modal de
// detalle intermedio): allí están el PDF, WhatsApp, aprobar y crear la ODP.
//
// LA VALIDEZ (vigente / por vencer / vencida) la calcula el backend en el
// listado con la misma regla que el tablero del Dashboard
// (`cotizador/lib/validezOferta.ts`). Es solo una señal: el estado no cambia.
// El buscador es uno solo (`q` del backend: cliente, obra, número, ODP, PR-…,
// lead); el estado ya no es un filtro, son las pestañas, resueltas en memoria.
// ─────────────────────────────────────────────────────────────────────────────

type Pestana = 'atencion' | 'esperando' | 'aprobadas' | 'perdidas' | 'todas';

const PESTANAS: { k: Pestana; rotulo: string }[] = [
    { k: 'atencion', rotulo: 'Necesitan atención' },
    { k: 'esperando', rotulo: 'Esperando respuesta' },
    { k: 'aprobadas', rotulo: 'Aprobadas' },
    { k: 'perdidas', rotulo: 'Perdidas y canceladas' },
    { k: 'todas', rotulo: 'Todas' },
];

const esAprobadaSinOdp = (c: CotizacionLigera) => c.estado === 'APROBADA' && !c.odpId;
const esPorVencer = (c: CotizacionLigera) => c.estado === 'PENDIENTE' && c.validez?.estado === 'POR_VENCER';
const esVencida = (c: CotizacionLigera) => c.estado === 'PENDIENTE' && c.validez?.estado === 'VENCIDA';

function enPestana(c: CotizacionLigera, p: Pestana): boolean {
    switch (p) {
        case 'atencion': return esAprobadaSinOdp(c) || esPorVencer(c) || esVencida(c);
        case 'esperando': return c.estado === 'PENDIENTE' && !esVencida(c);
        case 'aprobadas': return c.estado === 'APROBADA';
        case 'perdidas': return c.estado === 'PERDIDO' || c.estado === 'CANCELADO';
        default: return true;
    }
}

/** Total que se muestra: el de la elegida, o el rango si hay varias opciones sin
 * decidir (los totales espejo quedan en 0 a propósito en ese caso). */
function totalDeFila(c: CotizacionLigera): { valor: number; texto: string; sinDecidir: boolean } {
    const props = c.propuestas ?? [];
    const hayElegida = (c.propuestaElegidaId ?? null) !== null || props.some(p => p.elegida);
    if (hayElegida || props.length <= 1) return { valor: c.totales.total, texto: fmtCOP(c.totales.total), sinDecidir: false };
    const totales = props.map(p => Number(p.totales?.total) || 0);
    const min = Math.min(...totales);
    const max = Math.max(...totales);
    return { valor: max, texto: min === max ? fmtCOPCorto(max) : `${fmtCOPCorto(min)} – ${fmtCOPCorto(max)}`, sinDecidir: true };
}

const diasDesde = (fecha?: string | null): number | null => {
    if (!fecha) return null;
    const d = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
    return Number.isFinite(d) ? Math.max(0, d) : null;
};
const haceDias = (d: number | null) => (d === null ? '' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);

/** La línea "qué pasa con ella" de cada fila, con su tono. */
function situacionDeFila(c: CotizacionLigera): { texto: string; tono: 'neutro' | 'ambar' | 'rojo' | 'verde' } {
    if (c.estado === 'APROBADA') {
        return { texto: `${c.odpId ? 'En producción' : 'Aprobada'} · ${haceDias(diasDesde(c.aprobadaEn ?? c.actualizadaEn))}`, tono: 'verde' };
    }
    if (c.estado === 'PERDIDO') {
        const motivo = MOTIVOS_PERDIDA.find(m => m.valor === c.motivoPerdida)?.rotulo;
        return { texto: motivo ? `Perdida · ${motivo}` : 'Perdida', tono: 'neutro' };
    }
    if (c.estado === 'CANCELADO') return { texto: 'Cancelada', tono: 'neutro' };
    const r = c.validez?.habilesRestantes;
    if (r === undefined || r === null) return { texto: `Enviada ${haceDias(diasDesde(c.creadaEn))}`, tono: 'neutro' };
    if (r < 0) return { texto: `Venció hace ${-r} día${r === -1 ? '' : 's'} hábil${r === -1 ? '' : 'es'}`, tono: 'rojo' };
    if (r === 0) return { texto: 'Vence hoy', tono: 'ambar' };
    if (r === 1) return { texto: 'Vence mañana', tono: 'ambar' };
    if (r <= 2) return { texto: `Vence en ${r} días hábiles`, tono: 'ambar' };
    return { texto: `Creada ${haceDias(diasDesde(c.creadaEn))} · vigente`, tono: 'neutro' };
}

const TONO_SITUACION = {
    neutro: 'text-slate-700',
    ambar: 'text-amber-800 font-semibold',
    rojo: 'text-rose-700 font-semibold',
    verde: 'text-emerald-800',
};

const ETIQUETA_VINCULO: Record<RotuloVinculo['tipo'], string> = { lead: 'Lead', prospecto: '', cliente: 'Cliente', odp: '' };

/** Menú "⋯" de la fila: hoy solo Eliminar. */
const MenuFila: React.FC<{ onEliminar: () => void; eliminando: boolean }> = ({ onEliminar, eliminando }) => {
    const [abierto, setAbierto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto]);
    return (
        <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
            <button
                type="button"
                aria-label="Más acciones"
                aria-haspopup="menu"
                aria-expanded={abierto}
                onClick={() => setAbierto(v => !v)}
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            >
                {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-5 h-5" />}
            </button>
            {abierto && (
                <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setAbierto(false); onEliminar(); }}
                        className="w-full rounded-lg px-3 py-2.5 text-left text-[13.5px] font-semibold text-rose-700 hover:bg-rose-50"
                    >
                        Eliminar cotización
                    </button>
                </div>
            )}
        </div>
    );
};

interface Props {
    /** Abre la cotización en Resumen y, si se pide, sigue con esa acción. */
    onAbrir: (cot: Cotizacion, siguiente?: 'crearOdp' | 'perdida') => void;
    onNueva: () => void;
    abrirDetalleInicial?: { id: number; vista: 'normal' | 'tecnico' };
}

const TabGuardadas: React.FC<Props> = ({ onAbrir, onNueva, abrirDetalleInicial }) => {
    const permisos = usePermisosCotizador();
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [asesores, setAsesores] = useState<AsesorCotizador[]>([]);
    /** '' = todos, o el id del asesor. Arranca en "las mías" para quien edita solo las suyas. */
    const [asesorId, setAsesorId] = useState<string>(
        permisos.nivel === 'propias' && permisos.usuarioId ? String(permisos.usuarioId) : ''
    );
    const [cotizaciones, setCotizaciones] = useState<CotizacionLigera[]>([]);
    const [loading, setLoading] = useState(true);
    const [pestana, setPestana] = useState<Pestana | null>(null);
    const [abriendoId, setAbriendoId] = useState<number | null>(null);
    const [eliminandoId, setEliminandoId] = useState<number | null>(null);
    const [detalle, setDetalle] = useState<{ id: number; vista: 'normal' | 'tecnico' } | null>(null);
    const [odpFichaId, setOdpFichaId] = useState<number | null>(null);

    useEffect(() => {
        apiListarAsesoresCotizador().then(r => setAsesores(r.data)).catch(() => setAsesores([]));
    }, []);

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 400);
        return () => clearTimeout(t);
    }, [q]);

    const filtros: FiltrosListado = useMemo(() => {
        const f: FiltrosListado = {};
        if (qDebounced) f.q = qDebounced;
        if (asesorId) f.asesorUsuarioId = Number(asesorId);
        return f;
    }, [qDebounced, asesorId]);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await apiListarCotizaciones(filtros);
            setCotizaciones(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo cargar la lista de cotizaciones. Revisa tu conexión e inténtalo de nuevo.');
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    useEffect(() => { cargar(); }, [cargar]);

    // Deep-link: ?tab=guardadas&id=1&vista=tecnico abre el detalle al montar.
    useEffect(() => {
        if (abrirDetalleInicial) setDetalle(abrirDetalleInicial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const conteos = useMemo(() => {
        const r = {} as Record<Pestana, number>;
        PESTANAS.forEach(p => { r[p.k] = cotizaciones.filter(c => enPestana(c, p.k)).length; });
        return r;
    }, [cotizaciones]);

    // Arranca en "Necesitan atención" solo si hay algo; si no, en lo que espera respuesta.
    const activa: Pestana = pestana ?? (loading || conteos.atencion > 0 ? 'atencion' : 'esperando');

    const filas = useMemo(() => {
        const lista = cotizaciones.filter(c => enPestana(c, activa));
        if (activa === 'esperando') {
            return [...lista].sort((a, b) => (a.validez?.habilesRestantes ?? 99) - (b.validez?.habilesRestantes ?? 99));
        }
        return lista; // el backend ya las trae de la más nueva a la más vieja
    }, [cotizaciones, activa]);

    const abrir = async (id: number, siguiente?: 'crearOdp' | 'perdida') => {
        setAbriendoId(id);
        try {
            const { data } = await apiObtenerCotizacion(id);
            onAbrir(data, siguiente);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo abrir la cotización. Inténtalo de nuevo.');
        } finally {
            setAbriendoId(null);
        }
    };

    const eliminar = async (cot: CotizacionLigera) => {
        if (!window.confirm(`¿Eliminar la cotización ${numeroCotizacion(cot.numero)}? Esta acción no se puede deshacer.`)) return;
        setEliminandoId(cot.id);
        try {
            await apiEliminarCotizacion(cot.id);
            toast.success(`Cotización ${numeroCotizacion(cot.numero)} eliminada.`);
            await cargar();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo eliminar la cotización.');
        } finally {
            setEliminandoId(null);
        }
    };

    const recordar = (c: CotizacionLigera) => {
        abrirWhatsApp({
            telefono: c.cliente?.telefono,
            cliente: c.cliente?.nombre,
            numero: c.numero,
            asesor: permisos.usuarioNombre,
            recordatorio: true,
        });
    };

    /** La acción principal de la fila, según su situación. */
    const accionDeFila = (c: CotizacionLigera): React.ReactNode => {
        const puede = permisos.puedeEditar(c.asesorUsuarioId);
        const cargando = abriendoId === c.id;
        if (esAprobadaSinOdp(c) && puede) {
            return (
                <BotonPrimario compacto icono={FileCheck} cargando={cargando} onClick={() => abrir(c.id, 'crearOdp')}
                    claseColor="bg-emerald-600 text-white hover:bg-emerald-700" className="min-h-[40px]">
                    Crear ODP
                </BotonPrimario>
            );
        }
        if (c.estado === 'APROBADA' && c.odpId) {
            const odp = c.vinculos?.find(v => v.tipo === 'odp');
            return (
                <button type="button" onClick={() => setOdpFichaId(c.odpId!)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 min-h-[40px] text-[13px] font-semibold text-emerald-800 hover:bg-emerald-50">
                    <CheckCircle2 className="w-4 h-4" /> {odp?.etiqueta ?? 'Ver ODP'}
                </button>
            );
        }
        if (esVencida(c) && puede) {
            return (
                <BotonSecundario compacto icono={XCircle} cargando={cargando} onClick={() => abrir(c.id, 'perdida')} className="min-h-[40px] !text-rose-700">
                    Marcar perdida
                </BotonSecundario>
            );
        }
        if (c.estado === 'PENDIENTE') {
            return (
                <BotonSecundario compacto icono={MessageCircle} onClick={() => recordar(c)} className="min-h-[40px]"
                    title="Abre WhatsApp con un mensaje de seguimiento listo">
                    {esPorVencer(c) ? 'Recordar por WhatsApp' : 'Escribir por WhatsApp'}
                </BotonSecundario>
            );
        }
        return null;
    };

    const fila = (c: CotizacionLigera) => {
        const total = totalDeFila(c);
        const sit = situacionDeFila(c);
        const origen = (c.vinculos ?? []).filter(v => v.tipo !== 'odp')
            .map(v => (ETIQUETA_VINCULO[v.tipo] ? `${ETIQUETA_VINCULO[v.tipo]}` : v.etiqueta))[0];
        const nOpciones = c.propuestas?.length ?? 0;
        return (
            <li key={c.id}>
                <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[96px_minmax(0,1.5fr)_minmax(0,1fr)_150px_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 hover:bg-templex-50/50 transition cursor-pointer"
                    onClick={() => abrir(c.id)}
                >
                    <span className="hidden md:block text-[13.5px] font-bold text-slate-900 tabular-nums">{numeroCotizacion(c.numero)}</span>
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); abrir(c.id); }}
                            className="block max-w-full truncate text-left text-[15px] font-semibold text-slate-900 hover:underline"
                        >
                            {c.cliente?.nombre?.trim() || 'Sin nombre'}
                        </button>
                        <p className="truncate text-[12.5px] text-slate-700">
                            <span className="md:hidden tabular-nums">{numeroCotizacion(c.numero)} · </span>
                            {[c.cliente?.obra?.trim(), origen, nOpciones > 1 ? `${nOpciones} opciones` : null, permisos.nivel !== 'propias' || !asesorId ? c.asesor : null]
                                .filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    <span className={`col-span-2 md:col-span-1 text-[13px] ${TONO_SITUACION[sit.tono]}`}>{sit.texto}</span>
                    <span className="text-right">
                        <span className="block text-[15px] font-bold text-slate-900 tabular-nums">{total.texto}</span>
                        {total.sinDecidir && <span className="block text-[11.5px] font-semibold text-amber-800">sin decidir</span>}
                    </span>
                    <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        {accionDeFila(c)}
                        {permisos.puedeEditar(c.asesorUsuarioId) && (
                            <MenuFila onEliminar={() => eliminar(c)} eliminando={eliminandoId === c.id} />
                        )}
                    </div>
                </div>
            </li>
        );
    };

    /** Grupo con título dentro de "Necesitan atención". */
    const grupo = (titulo: string, detalleGrupo: string, clase: string, lista: CotizacionLigera[]) => lista.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-slate-200">
                <span className={`inline-flex items-center h-7 px-3 rounded-full text-[12.5px] font-bold ${clase}`}>{titulo} · {lista.length}</span>
                <span className="text-[13px] text-slate-700">{detalleGrupo}</span>
            </header>
            <ul className="divide-y divide-slate-200">{lista.map(fila)}</ul>
        </section>
    );

    return (
        <div className="p-3 sm:p-5 space-y-4">
            {/* ── Encabezado ─────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-center gap-3">
                <label className="relative flex-1 min-w-[240px] max-w-xl">
                    <span className="sr-only">Buscar cotización</span>
                    <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Buscar por cliente, número, obra u ODP"
                        className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-[14px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-templex-500 focus:ring-2 focus:ring-templex-200"
                    />
                </label>
                <label className="flex items-center gap-2">
                    <span className="sr-only">Asesor</span>
                    <select
                        value={asesorId}
                        onChange={e => setAsesorId(e.target.value)}
                        className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-[14px] text-slate-900"
                    >
                        <option value="">Todos los asesores</option>
                        {permisos.usuarioId && <option value={String(permisos.usuarioId)}>Solo las mías</option>}
                        {asesores.filter(a => a.id !== permisos.usuarioId).map(a => (
                            <option key={a.id} value={String(a.id)}>{a.nombre}</option>
                        ))}
                    </select>
                </label>
                {permisos.puedeCrear && (
                    <BotonPrimario icono={Plus} onClick={onNueva} className="ml-auto min-h-[44px]">Nueva cotización</BotonPrimario>
                )}
            </header>

            {/* ── Pestañas por situación ─────────────────────────────────── */}
            <nav aria-label="Situación" className="flex flex-wrap gap-2">
                {PESTANAS.map(p => {
                    const sel = p.k === activa;
                    const n = conteos[p.k];
                    return (
                        <button
                            key={p.k}
                            type="button"
                            onClick={() => setPestana(p.k)}
                            aria-pressed={sel}
                            className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full border text-[14px] font-semibold transition ${sel
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'}`}
                        >
                            {p.rotulo}
                            <span className={`tabular-nums rounded-full px-2 text-[12px] ${p.k === 'atencion' && n > 0
                                ? 'bg-rose-600 text-white'
                                : sel ? 'bg-white/20' : 'bg-slate-100 text-slate-800'}`}>
                                {n}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* ── Contenido ──────────────────────────────────────────────── */}
            {loading ? (
                <div className="py-16 text-center text-slate-700">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando cotizaciones…
                </div>
            ) : filas.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-14 text-center">
                    <Inbox className="w-9 h-9 text-slate-500 mx-auto mb-2" />
                    <p className="text-[15px] font-semibold text-slate-900">
                        {qDebounced ? `Ninguna cotización coincide con “${qDebounced}”.`
                            : activa === 'atencion' ? 'Nada pendiente: no hay aprobadas sin ODP ni ofertas por vencer.'
                                : 'No hay cotizaciones en esta lista.'}
                    </p>
                </div>
            ) : activa === 'atencion' ? (
                <div className="space-y-4">
                    {grupo('Aprobadas sin ODP', 'El cliente dijo que sí: falta pasarlas a producción.',
                        'bg-emerald-50 text-emerald-800', filas.filter(esAprobadaSinOdp))}
                    {grupo('Vencen pronto', 'Les quedan 2 días hábiles o menos de validez.',
                        'bg-amber-50 text-amber-900', filas.filter(esPorVencer))}
                    {grupo('Vencidas', 'Pasó la validez sin respuesta: escríbele o dala por perdida.',
                        'bg-rose-50 text-rose-800', filas.filter(esVencida))}
                </div>
            ) : (
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <ul className="divide-y divide-slate-200">{filas.map(fila)}</ul>
                </section>
            )}

            <p className="text-[12.5px] text-slate-700">Haz clic en cualquier cotización para abrirla.</p>

            {odpFichaId !== null && <ODPFichaModal odpId={odpFichaId} onClose={() => setOdpFichaId(null)} />}

            {detalle !== null && (
                <ModalDetalleCotizacion
                    id={detalle.id}
                    vistaInicial={detalle.vista}
                    onClose={() => setDetalle(null)}
                    onReabrir={cot => onAbrir(cot)}
                />
            )}
        </div>
    );
};

export default TabGuardadas;
