import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, Edit3, ClipboardCheck, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

import { apiObtenerCotizacion, apiAptitudCotizacion, apiPlanoDeItem } from '../../services/cotizadorApi';
import { Aptitud, Cotizacion, ItemCotizacion, Plano } from '../../types';
import { fmtCOP, fmtFecha, fmtPct } from '../../format';
import DiagramaProducto from '../DiagramaProducto';

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle de una cotización guardada — dos vistas:
//
// - "Normal": lo que ve comercial. Cliente, ítems con plata, totales, aptitud
//   para orden de corte.
// - "Técnica": lo que se le puede compartir al taller. Mismo principio que
//   `PrintableProduccion` (ver CLAUDE.md, "Impresión de la OP"): la hoja de
//   taller nunca lleva plata. Esta vista no recibe ni renderiza ningún campo
//   monetario del backend — solo la descripción del ítem y su plano
//   (`DiagramaProducto`), que en sí mismo solo contiene geometría (medidas,
//   paneles, cotas), nada de precios.
//
// Overlay/panel calcado del patrón de SAPModal.tsx (fixed inset-0 + backdrop
// oscuro + panel blanco redondeado), sin framer-motion para no sumar una
// dependencia de animación a un modal que ya está en la lista de "solo estos
// 2 archivos".
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    id: number;
    vistaInicial?: 'normal' | 'tecnico';
    onClose: () => void;
    onReabrir: (cot: Cotizacion) => void;
}

const badgeEstado = (estado: string): string => {
    switch (estado) {
        case 'PENDIENTE': return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'APROBADA': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'CANCELADO': return 'bg-slate-100 text-slate-600 border-slate-200';
        case 'PERDIDO': return 'bg-rose-100 text-rose-800 border-rose-200';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};

const ModalDetalleCotizacion: React.FC<Props> = ({ id, vistaInicial, onClose, onReabrir }) => {
    const [cot, setCot] = useState<Cotizacion | null>(null);
    const [cargando, setCargando] = useState(true);
    const [vista, setVista] = useState<'normal' | 'tecnico'>(vistaInicial ?? 'normal');

    const [aptitud, setAptitud] = useState<Aptitud | null>(null);
    const [cargandoAptitud, setCargandoAptitud] = useState(false);

    const [planos, setPlanos] = useState<Record<number, Plano | null>>({});
    const [cargandoPlanos, setCargandoPlanos] = useState(false);

    useEffect(() => {
        setCargando(true);
        setCot(null);
        setAptitud(null);
        setPlanos({});
        apiObtenerCotizacion(id)
            .then(res => setCot(res.data))
            .catch((e: any) => {
                toast.error(e?.response?.data?.error || 'No se pudo cargar el detalle de la cotización.');
                onClose();
            })
            .finally(() => setCargando(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Vista técnica: pide el plano de cada ítem con diseño, en paralelo. Una sola
    // vez por apertura del modal (no se recachea entre cotizaciones distintas).
    useEffect(() => {
        if (vista !== 'tecnico' || !cot) return;
        const conDiseno = cot.items.filter(it => it.disenoId);
        if (conDiseno.length === 0 || conDiseno.every(it => it.id in planos)) return;

        setCargandoPlanos(true);
        Promise.all(conDiseno.map(it =>
            apiPlanoDeItem(cot.id, it.id)
                .then(res => [it.id, res.data] as const)
                .catch(() => [it.id, null] as const)
        )).then(resultados => {
            setPlanos(prev => {
                const next = { ...prev };
                resultados.forEach(([itemId, plano]) => { next[itemId] = plano; });
                return next;
            });
        }).finally(() => setCargandoPlanos(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vista, cot]);

    const evaluarAptitud = async () => {
        setCargandoAptitud(true);
        try {
            const { data } = await apiAptitudCotizacion(id);
            setAptitud(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo evaluar la aptitud para orden de corte.');
        } finally {
            setCargandoAptitud(false);
        }
    };

    const reabrir = () => {
        if (!cot) return;
        onReabrir(cot);
        onClose();
    };

    const aptitudDe = (itemId: number) => aptitud?.porItem.find(p => p.itemId === itemId) || null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-200">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            Cotización {cot ? <span className="font-cotizador-head">{`N.° ${cot.numero}`}</span> : ''}
                        </h2>
                        {cot && <p className="text-xs text-slate-500 font-medium">{cot.cliente?.nombre || 'Sin cliente'}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-bold">
                            <button
                                onClick={() => setVista('normal')}
                                className={`px-3 py-1.5 transition ${vista === 'normal' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                Normal
                            </button>
                            <button
                                onClick={() => setVista('tecnico')}
                                className={`px-3 py-1.5 transition ${vista === 'tecnico' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                                Técnica
                            </button>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {cargando ? (
                    <div className="py-20 flex items-center justify-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando cotización…
                    </div>
                ) : !cot ? null : vista === 'normal' ? (
                    <div className="p-6 space-y-5">
                        {/* ── Cabecera ─────────────────────────────────────── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                            <div className="space-y-1 text-sm">
                                <div><span className="text-slate-400">Cliente:</span> <span className="font-semibold text-slate-800">{cot.cliente?.nombre || '—'}</span></div>
                                {cot.cliente?.obra && <div><span className="text-slate-400">Obra:</span> <span className="text-slate-700">{cot.cliente.obra}</span></div>}
                                {cot.cliente?.direccion && <div><span className="text-slate-400">Dirección:</span> <span className="text-slate-700">{cot.cliente.direccion}</span></div>}
                                {cot.cliente?.telefono && <div><span className="text-slate-400">Teléfono:</span> <span className="text-slate-700">{cot.cliente.telefono}</span></div>}
                                {cot.cliente?.contacto && <div><span className="text-slate-400">Contacto:</span> <span className="text-slate-700">{cot.cliente.contacto}</span></div>}
                            </div>
                            <div className="space-y-1 text-sm">
                                <div><span className="text-slate-400">Asesor:</span> <span className="font-semibold text-slate-800">{cot.asesor || '—'}</span></div>
                                <div><span className="text-slate-400">Segmento:</span> <span className="text-slate-700">{cot.segmentoCliente}</span></div>
                                <div>
                                    <span className="text-slate-400">Estado:</span>{' '}
                                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${badgeEstado(cot.estado)}`}>{cot.estado}</span>
                                </div>
                                <div><span className="text-slate-400">Descuento:</span> <span className="text-slate-700">{fmtPct(cot.descuentoPct)}</span></div>
                                <div><span className="text-slate-400">Fecha:</span> <span className="text-slate-700">{fmtFecha(cot.creadaEn)}</span></div>
                            </div>
                        </div>

                        {/* ── Ítems ────────────────────────────────────────── */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Módulo</th>
                                        <th className="px-3 py-2 text-left font-medium">Descripción</th>
                                        <th className="px-3 py-2 text-center font-medium">Piezas</th>
                                        <th className="px-3 py-2 text-right font-medium">Subtotal+AIU</th>
                                        <th className="px-3 py-2 text-right font-medium">IVA</th>
                                        <th className="px-3 py-2 text-right font-medium">Total</th>
                                        {aptitud && <th className="px-3 py-2 text-center font-medium">Corte</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cot.items.map(it => {
                                        const apt = aptitudDe(it.id);
                                        return (
                                            <React.Fragment key={it.id}>
                                                <tr>
                                                    <td className="px-3 py-2 text-slate-500">{it.moduloId}</td>
                                                    <td className="px-3 py-2 text-slate-700">{it.descripcionItem || '—'}</td>
                                                    <td className="px-3 py-2 text-center text-slate-600">{it.cantidadPiezas}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-700">{fmtCOP(it.subtotalConAiu)}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-700">{fmtCOP(it.iva)}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-800">{fmtCOP(it.total)}</td>
                                                    {aptitud && (
                                                        <td className="px-3 py-2 text-center">
                                                            {apt?.imprimible ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                                                                    <CheckCircle2 className="w-3 h-3" /> Imprimible
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold">
                                                                    <XCircle className="w-3 h-3" /> No imprimible
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                                {aptitud && apt && !apt.imprimible && apt.motivos.length > 0 && (
                                                    <tr>
                                                        <td colSpan={7} className="px-3 pb-2 pt-0">
                                                            <ul className="text-[11px] text-rose-600 list-disc list-inside pl-2">
                                                                {apt.motivos.map((m, i) => <li key={i}>{m.texto}</li>)}
                                                            </ul>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* ── Aptitud (resumen) ────────────────────────────── */}
                        {aptitud && (
                            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${aptitud.imprimible
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-800'}`}
                            >
                                {aptitud.imprimible ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                {aptitud.imprimible
                                    ? 'La cotización está lista para generar orden de corte.'
                                    : 'Hay ítems que impiden generar la orden de corte todavía.'}
                            </div>
                        )}

                        {/* ── Totales ──────────────────────────────────────── */}
                        <div className="flex justify-end">
                            <div className="w-full max-w-xs space-y-1 text-sm">
                                <div className="flex justify-between"><span className="text-slate-400">Subtotal</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(cot.totales.subtotal)}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">IVA</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(cot.totales.iva)}</span></div>
                                <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-1"><span>Total</span><span className="font-cotizador-head">{fmtCOP(cot.totales.total)}</span></div>
                            </div>
                        </div>

                        {/* ── Acciones ─────────────────────────────────────── */}
                        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={evaluarAptitud}
                                disabled={cargandoAptitud}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                            >
                                {cargandoAptitud ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                                Evaluar aptitud para orden de corte
                            </button>
                            <button
                                onClick={reabrir}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
                            >
                                <Edit3 className="w-4 h-4" /> Reabrir para editar
                            </button>
                        </div>
                    </div>
                ) : (
                    // ── Vista técnica ────────────────────────────────────────
                    // Sin plata: ni aquí ni en `DiagramaProducto` se muestra un solo
                    // valor monetario. Solo módulo, descripción y plano físico.
                    <div className="p-6 space-y-5">
                        {cargandoPlanos && (
                            <div className="flex items-center gap-2 text-slate-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando planos…
                            </div>
                        )}
                        {cot.items.map((it: ItemCotizacion) => (
                            <div key={it.id} className="border border-slate-200 rounded-2xl p-4">
                                <div className="mb-3">
                                    <h3 className="text-sm font-bold text-slate-800">{it.descripcionItem || it.moduloId}</h3>
                                    <p className="text-[11px] text-slate-400">{it.moduloId} · {it.cantidadPiezas} pieza(s)</p>
                                </div>
                                {it.disenoId ? (
                                    <DiagramaProducto plano={planos[it.id] ?? null} cargando={cargandoPlanos && !(it.id in planos)} />
                                ) : (
                                    <p className="text-sm text-slate-500 italic">Este ítem no tiene plano (cotizado por medidas libres).</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModalDetalleCotizacion;
