import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
    X, Loader2, Edit3, ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, HardHat, Download, Printer,
} from 'lucide-react';

import { apiObtenerCotizacion, apiAptitudCotizacion, apiPlanoDeItem, apiDespieceDeItem, apiDescargarPdfPropuesta, apiGetModulos } from '../../services/cotizadorApi';
import { Aptitud, Cotizacion, DespieceItem, ItemCotizacion, ModuloMeta, Plano, Propuesta, TipoCargo } from '../../types';
import { fmtCOP, fmtFecha, fmtPct } from '../../format';
import { abrirVentanaImpresion } from '../../../../utils/printWindow';
import DiagramaProducto from '../DiagramaProducto';
import ComparadorPropuestas from '../ComparadorPropuestas';
import PrintableHojaTrabajo from '../PrintableHojaTrabajo';

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle de una cotización guardada — tres vistas:
//
// - "Normal": lo que ve comercial. Cliente, propuestas, ítems con plata, cargos
//   de obra, totales y aptitud para orden de corte.
// - "Técnica": lo que se le puede compartir al taller. Mismo principio que
//   `PrintableProduccion` (ver CLAUDE.md, "Impresión de la OP"): la hoja de
//   taller nunca lleva plata. Esta vista no recibe ni renderiza ningún campo
//   monetario del backend — solo la descripción del ítem y su plano
//   (`DiagramaProducto`), que en sí mismo solo contiene geometría.
// - "Comparar": la tabla lado a lado de las propuestas, para girar la pantalla
//   hacia el cliente.
//
// DOS COSAS QUE EL BACKEND IMPONE Y ESTA PANTALLA TIENE QUE RESPETAR (2026-09-20):
//
//   1. `GET /cotizaciones/:id` trae los blobs de UNA sola propuesta. Cambiar de
//      propuesta es volver a pedir la cotización con `?propuesta=<id>`, no
//      filtrar en memoria: los ítems de las demás llegan sin despiece. Por el
//      mismo motivo el plano de un ítem viaja con esa propuesta.
//   2. La APTITUD se evalúa siempre sobre la propuesta ELEGIDA, y no acepta
//      `?propuesta`. Es correcto: la orden de corte sale de la elegida, y
//      evaluar una variante descartada daría un "sí, imprimible" sobre medidas
//      que nadie va a fabricar. Si se está mirando otra, se dice.
//
// Overlay/panel calcado del patrón de SAPModal.tsx (fixed inset-0 + backdrop
// oscuro + panel blanco redondeado), sin framer-motion.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    id: number;
    vistaInicial?: 'normal' | 'tecnico';
    onClose: () => void;
    onReabrir: (cot: Cotizacion) => void;
}

type Vista = 'normal' | 'tecnico' | 'comparar';

const badgeEstado = (estado: string): string => {
    switch (estado) {
        case 'PENDIENTE': return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'APROBADA': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'CANCELADO': return 'bg-slate-100 text-slate-600 border-slate-200';
        case 'PERDIDO': return 'bg-rose-100 text-rose-800 border-rose-200';
        default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
};

const ETIQUETA_CARGO: Record<TipoCargo, string> = {
    SMO: 'Mano de obra',
    ANDAMIO: 'Alquiler de andamio',
    HUACAL: 'Huacal / embalaje',
    FLETE: 'Acarreo / flete',
    OTRO: 'Otro servicio',
};

const ModalDetalleCotizacion: React.FC<Props> = ({ id, vistaInicial, onClose, onReabrir }) => {
    const [cot, setCot] = useState<Cotizacion | null>(null);
    const [cargando, setCargando] = useState(true);
    const [vista, setVista] = useState<Vista>(vistaInicial ?? 'normal');
    /** Propuesta que se está mirando. `null` = la que decida el backend (la
     * elegida y, si no hay, la primera). */
    const [propuestaId, setPropuestaId] = useState<number | null>(null);

    const [aptitud, setAptitud] = useState<Aptitud | null>(null);
    const [cargandoAptitud, setCargandoAptitud] = useState(false);
    const [descargandoPdf, setDescargandoPdf] = useState(false);
    // Meta de los 6 módulos, para resolver etiquetas de campo en la Hoja de
    // Trabajo (grupo 'medidas'/'vidrio'). Se pide una sola vez: no cambia
    // entre propuestas ni entre cotizaciones.
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    useEffect(() => {
        apiGetModulos().then(res => setModulos(res.data)).catch(() => setModulos([]));
    }, []);

    const [planos, setPlanos] = useState<Record<number, Plano | null>>({});
    const [cargandoPlanos, setCargandoPlanos] = useState(false);
    const [despieces, setDespieces] = useState<Record<number, DespieceItem | null>>({});

    const cargar = useCallback((pid: number | null) => {
        setCargando(true);
        // Los planos y el despiece se guardan por id de ítem y los ítems
        // cambian con la propuesta: conservarlos entre propuestas mostraría el
        // plano/despiece de otra.
        setPlanos({});
        setDespieces({});
        apiObtenerCotizacion(id, pid)
            .then(res => {
                setCot(res.data);
                setPropuestaId(res.data.propuestaActivaId ?? null);
            })
            .catch((e: any) => {
                toast.error(e?.response?.data?.error || 'No se pudo cargar el detalle de la cotización.');
                onClose();
            })
            .finally(() => setCargando(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        setCot(null);
        setAptitud(null);
        cargar(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Plano de cada ítem con diseño, en paralelo, SIEMPRE con la propuesta
    // activa — el plano sale del blob `resultado` y el backend sólo carga los
    // de una propuesta. Se carga en cuanto hay cotización (no sólo al abrir
    // "Vista técnica"): la Hoja de Trabajo los necesita desde la vista Normal.
    useEffect(() => {
        if (!cot) return;
        const conDiseno = cot.items.filter(it => it.disenoId);
        if (conDiseno.length === 0 || conDiseno.every(it => it.id in planos)) return;

        setCargandoPlanos(true);
        Promise.all(conDiseno.map(it =>
            apiPlanoDeItem(cot.id, it.id, cot.propuestaActivaId ?? null)
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
    }, [cot]);

    // Despiece (perfiles + vidrio) de cada ítem con diseño, para la página 2 de
    // la Hoja de Trabajo. Mismo patrón que los planos: por propuesta activa.
    useEffect(() => {
        if (!cot) return;
        const conDiseno = cot.items.filter(it => it.disenoId);
        if (conDiseno.length === 0 || conDiseno.every(it => it.id in despieces)) return;

        Promise.all(conDiseno.map(it =>
            apiDespieceDeItem(cot.id, it.id, cot.propuestaActivaId ?? null)
                .then(res => [it.id, res.data] as const)
                .catch(() => [it.id, null] as const)
        )).then(resultados => {
            setDespieces(prev => {
                const next = { ...prev };
                resultados.forEach(([itemId, despiece]) => { next[itemId] = despiece; });
                return next;
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cot]);

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

    const propuestas: Propuesta[] = cot?.propuestas ?? [];
    const activa = propuestas.find(p => p.id === (cot?.propuestaActivaId ?? propuestaId)) ?? null;
    const elegida = propuestas.find(p => p.elegida) ?? null;
    const viendoLaElegida = !activa || !elegida || activa.id === elegida.id;
    const totales = activa?.totales ?? null;
    const cargos = activa?.cargos ?? [];

    /** PDF de la propuesta que se está mirando (no necesariamente la elegida:
     * el asesor puede querer mandarle al cliente una variante concreta). Mismo
     * patrón de descarga que `ManualVisor.tsx`/`PedidosPVPage.tsx`: con
     * `responseType: 'blob'` un error llega como Blob, no como JSON, así que el
     * mensaje de error es genérico en vez de intentar leer `.error` de él. */
    const descargarPdf = async () => {
        if (!cot || !activa) return;
        setDescargandoPdf(true);
        try {
            const { data } = await apiDescargarPdfPropuesta(cot.id, activa.id);
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Cotizacion-${cot.numero}-${activa.etiqueta}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('No se pudo generar el PDF de la cotización.');
        } finally {
            setDescargandoPdf(false);
        }
    };

    /** Documento interno, sin plata: se imprime tal cual (`window.print()`),
     * no se descarga como archivo — nunca sale del taller. Sale SIEMPRE, sin
     * pasar por `/aptitud` (decisión del usuario, 2026-09-21). */
    const imprimirHojaTrabajo = () => {
        const area = document.getElementById('hoja-trabajo-area');
        if (!cot || !area) return;
        abrirVentanaImpresion({
            titulo: `Hoja de Trabajo — Cotización ${cot.numero}`,
            contenidoHtml: area.innerHTML,
        });
    };

    /** Chips de propuestas. Cambiar de una a otra recarga desde el servidor: los
     * ítems de las demás llegan sin despiece y sin sus blobs. */
    const Chips: React.FC = () => {
        if (propuestas.length === 0) return null;
        return (
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-1">Propuesta</span>
                {propuestas.map(p => {
                    const esActiva = p.id === (cot?.propuestaActivaId ?? propuestaId);
                    return (
                        <button
                            key={p.id}
                            onClick={() => { if (!esActiva) cargar(p.id); }}
                            title={p.nombre || `Propuesta ${p.etiqueta}`}
                            className={`px-2.5 py-1 rounded-lg border text-[11.5px] font-bold transition ${esActiva
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                        >
                            {p.etiqueta}
                            {p.elegida && <CheckCircle2 className={`w-3 h-3 inline ml-1 ${esActiva ? 'text-white' : 'text-emerald-600'}`} />}
                            <span className={`ml-1.5 font-cotizador-head ${esActiva ? 'text-violet-100' : 'text-slate-400'}`}>
                                {fmtCOP(p.totales.total)}
                            </span>
                        </button>
                    );
                })}
                {!elegida && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-bold">
                        Ninguna elegida
                    </span>
                )}
            </div>
        );
    };

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
                            {([['normal', 'Normal'], ['tecnico', 'Técnica'], ['comparar', 'Comparar']] as const).map(([v, texto]) => (
                                <button
                                    key={v}
                                    onClick={() => setVista(v)}
                                    className={`px-3 py-1.5 transition ${vista === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {texto}
                                </button>
                            ))}
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
                ) : !cot ? null : vista === 'comparar' ? (
                    <div className="p-6">
                        <ComparadorPropuestas cotizacionId={cot.id} />
                    </div>
                ) : vista === 'normal' ? (
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
                                {/* El descuento vivo es el de la PROPUESTA; el de la
                                    cabecera quedó legado y siempre vale 0. */}
                                <div><span className="text-slate-400">Descuento de la propuesta:</span> <span className="text-slate-700">{fmtPct(activa?.descuentoPct ?? 0)}</span></div>
                                <div><span className="text-slate-400">Fecha:</span> <span className="text-slate-700">{fmtFecha(cot.creadaEn)}</span></div>
                            </div>
                        </div>

                        {/* ── Propuestas ───────────────────────────────────── */}
                        {propuestas.length > 0 && (
                            <div className="space-y-2">
                                <Chips />
                                {activa && (activa.nombre || activa.nota) && (
                                    <p className="text-[12.5px] text-slate-500">
                                        {activa.nombre && <span className="font-bold text-slate-700">{activa.nombre}. </span>}
                                        {activa.nota}
                                    </p>
                                )}
                                {activa?.legadoCargosEnItems && (
                                    <p className="flex items-start gap-1.5 text-[12px] text-amber-700 font-semibold">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        Propuesta anterior al cambio de cargos: su mano de obra y su flete están dentro
                                        del precio de cada ítem, no como cargos aparte.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* ── Ítems ────────────────────────────────────────── */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium">Módulo</th>
                                        <th className="px-3 py-2 text-left font-medium">Descripción</th>
                                        <th className="px-3 py-2 text-center font-medium">Piezas</th>
                                        <th className="px-3 py-2 text-right font-medium">Subtotal+AIU</th>
                                        {/* Estos dos vienen del blob del ítem, calculados
                                            ANTES del descuento de la propuesta. Sin el
                                            rótulo, sumarlos a mano no cuadra con el total. */}
                                        <th className="px-3 py-2 text-right font-medium">IVA <span className="font-normal text-[10.5px] text-slate-400">(precio lleno)</span></th>
                                        <th className="px-3 py-2 text-right font-medium">Total <span className="font-normal text-[10.5px] text-slate-400">(precio lleno)</span></th>
                                        {aptitud && <th className="px-3 py-2 text-center font-medium">Corte</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cot.items.length === 0 && (
                                        <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                                            Esta propuesta no tiene ítems.
                                        </td></tr>
                                    )}
                                    {cot.items.map(it => {
                                        const apt = aptitudDe(it.id);
                                        return (
                                            <React.Fragment key={it.id}>
                                                <tr>
                                                    <td className="px-3 py-2 text-slate-500">{it.moduloId}</td>
                                                    <td className="px-3 py-2 text-slate-700">{it.descripcionItem || '—'}</td>
                                                    <td className="px-3 py-2 text-center text-slate-600">{it.cantidadPiezas}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-700">{fmtCOP(it.subtotalConAiu)}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-500">{fmtCOP(it.iva)}</td>
                                                    <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-600">{fmtCOP(it.total)}</td>
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

                        {/* ── Cargos de obra ───────────────────────────────── */}
                        {cargos.length > 0 && (
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                                    <HardHat className="w-4 h-4 text-indigo-600" />
                                    <span className="text-[12.5px] font-bold text-slate-700">Cargos de obra</span>
                                    <span className="text-[11px] text-slate-400">
                                        Se cobran una vez por propuesta · fuera del AIU y del descuento
                                    </span>
                                </div>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-slate-100">
                                        {cargos.map(c => (
                                            <tr key={c.id}>
                                                <td className="px-3 py-2 text-slate-700">
                                                    {ETIQUETA_CARGO[c.tipo] || c.tipo}
                                                    {c.descripcion && c.descripcion !== ETIQUETA_CARGO[c.tipo] && (
                                                        <span className="text-slate-400"> · {c.descripcion}</span>
                                                    )}
                                                    {c.origen === 'SUGERIDO' && (
                                                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-bold text-indigo-700">Sugerido</span>
                                                    )}
                                                    {!c.aplicaIva && (
                                                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-500">Sin IVA</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">
                                                    {c.unidad !== 'GLOBAL' && `${c.cantidad} ${c.unidad === 'DIA' ? 'día(s)' : 'und'} × ${fmtCOP(c.valorUnitario)}`}
                                                </td>
                                                <td className="px-3 py-2 text-right font-cotizador-head font-semibold text-slate-700 whitespace-nowrap">{fmtCOP(c.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ── Aptitud (resumen) ────────────────────────────── */}
                        {aptitud && (
                            <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm font-semibold ${aptitud.imprimible
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-rose-50 border-rose-200 text-rose-800'}`}
                            >
                                {aptitud.imprimible ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                                <div>
                                    <p>
                                        {aptitud.imprimible
                                            ? 'La propuesta elegida está lista para generar orden de corte.'
                                            : 'Hay ítems que impiden generar la orden de corte todavía.'}
                                    </p>
                                    {/* Motivos de la cotización entera (hoy sólo el de
                                        "sin propuesta elegida"), distintos de los de cada ítem. */}
                                    {(aptitud.motivos ?? []).map((m, i) => (
                                        <p key={i} className="font-normal mt-1">
                                            {m.texto} {m.comoSeArregla && <span className="opacity-80">{m.comoSeArregla}</span>}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Totales ──────────────────────────────────────── */}
                        <div className="flex justify-end">
                            <div className="w-full max-w-xs space-y-1 text-sm">
                                {totales ? (
                                    <>
                                        <div className="flex justify-between"><span className="text-slate-400">Productos (con AIU)</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(totales.productos)}</span></div>
                                        {totales.descuento > 0 && (
                                            <div className="flex justify-between"><span className="text-slate-400">Descuento</span><span className="font-cotizador-head font-semibold text-rose-600">−{fmtCOP(totales.descuento)}</span></div>
                                        )}
                                        {totales.cargos > 0 && (
                                            <div className="flex justify-between"><span className="text-slate-400">Cargos de obra</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(totales.cargos)}</span></div>
                                        )}
                                        <div className="flex justify-between"><span className="text-slate-400">IVA</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(totales.iva)}</span></div>
                                        <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-1">
                                            <span>Total{activa ? ` · ${activa.etiqueta}` : ''}</span>
                                            <span className="font-cotizador-head">{fmtCOP(totales.total)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between"><span className="text-slate-400">Subtotal</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(cot.totales.subtotal)}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-400">IVA</span><span className="font-cotizador-head font-semibold text-slate-700">{fmtCOP(cot.totales.iva)}</span></div>
                                        <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-1"><span>Total</span><span className="font-cotizador-head">{fmtCOP(cot.totales.total)}</span></div>
                                    </>
                                )}
                                {!viendoLaElegida && (
                                    <p className="text-[11px] text-amber-700 font-semibold pt-1">
                                        Estos son los totales de la propuesta {activa?.etiqueta}. La que se le cobra al
                                        cliente es la {elegida?.etiqueta} ({fmtCOP(elegida?.totales.total ?? 0)}).
                                    </p>
                                )}
                                {!elegida && propuestas.length > 1 && (
                                    <p className="text-[11px] text-amber-700 font-semibold pt-1">
                                        Ninguna propuesta está elegida: la cotización todavía no tiene un total
                                        definitivo ni puede aprobarse.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Acciones ─────────────────────────────────────── */}
                        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                            {activa && (
                                <button
                                    onClick={descargarPdf}
                                    disabled={descargandoPdf}
                                    title={`Descarga el PDF de la propuesta ${activa.etiqueta} para enviar al cliente`}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                                >
                                    {descargandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Descargar PDF{activa ? ` (${activa.etiqueta})` : ''}
                                </button>
                            )}
                            <button
                                onClick={imprimirHojaTrabajo}
                                title="Documento interno para el taller, sin precios — sale siempre, no depende de la aptitud para orden de corte"
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition"
                            >
                                <Printer className="w-4 h-4" /> Hoja de Trabajo
                            </button>
                            <button
                                onClick={evaluarAptitud}
                                disabled={cargandoAptitud}
                                title="Se evalúa siempre sobre la propuesta elegida: la orden de corte sale de ella."
                                className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                            >
                                {cargandoAptitud ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
                                Evaluar aptitud de la propuesta elegida
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
                        {propuestas.length > 1 && (
                            <div className="space-y-1">
                                <Chips />
                                {!viendoLaElegida && (
                                    <p className="flex items-start gap-1.5 text-[12px] text-amber-700 font-semibold">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        Estos son los planos de la propuesta {activa?.etiqueta}, que no es la elegida:
                                        no son los que van al taller.
                                    </p>
                                )}
                            </div>
                        )}
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

                {/* Área oculta que alimenta `imprimirHojaTrabajo()`: `abrirVentanaImpresion`
                    sólo necesita el HTML, así que no hace falta mostrarla en pantalla. */}
                {cot && (
                    <div id="hoja-trabajo-area" style={{ display: 'none' }}>
                        <PrintableHojaTrabajo cot={cot} propuesta={activa} modulos={modulos} planos={planos} despieces={despieces} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModalDetalleCotizacion;
