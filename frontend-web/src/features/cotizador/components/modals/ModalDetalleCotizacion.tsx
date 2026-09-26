import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
    Loader2, Edit3, ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, HardHat, Download, Printer,
} from '../../../../components/ui/icons';

import { apiObtenerCotizacion, apiAptitudCotizacion, apiPlanoDeItem, apiDespieceDeItem, apiDescargarPdfPropuesta, apiGetModulos } from '../../services/cotizadorApi';
import { Aptitud, Cotizacion, DespieceItem, ItemCotizacion, ModuloMeta, Plano, Propuesta } from '../../types';
import { ETIQUETA_CARGO, fmtCOP, fmtFecha, fmtPct } from '../../format';
import { abrirVentanaImpresion } from '../../../../utils/printWindow';
import DiagramaProducto from '../DiagramaProducto';
import ComparadorPropuestas from '../ComparadorPropuestas';
import PrintableHojaTrabajo from '../PrintableHojaTrabajo';
import { BotonPrimario, BotonSecundario, Chip, ChipEstadoCotizacion, ModalShell } from '../ui';

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

/** Rótulo largo del segmento, el mismo que usa la ficha Comercial de `TabActual`. */
const NOMBRE_SEGMENTO: Record<string, string> = {
    PA: 'PA — Persona / obra pequeña',
    PM: 'PM — Constructor mediano',
    PB: 'PB — Gran obra',
};

/** Resumen de medidas cuando el ítem no trae `descripcionItem`. Mismo criterio
 * que `descripcionRespaldo` de `TabActual`: el motor guarda cm, la pantalla
 * muestra mm. Sin medidas no se inventa nada: la celda queda con guion. */
const resumenMedidas = (input: Record<string, unknown> | undefined): string | null => {
    const anchoCm = input?.anchoCm ?? input?.anchoNaveCm;
    const altoCm = input?.altoCm ?? input?.altoNaveCm;
    if (anchoCm == null && altoCm == null) return null;
    const mm = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) * 10 : '?');
    return `${mm(anchoCm)}×${mm(altoCm)} mm`;
};

/** Celda de la ficha de cabecera: rótulo arriba, valor abajo. Reemplaza a las
 * dos columnas de `FilaDato` (Fase 5, 2026-09-26): con el cliente vacío la
 * columna izquierda quedaba con un solo guion y todo el peso a la derecha. */
const Dato: React.FC<{ etiqueta: string; children: React.ReactNode; className?: string }> = ({ etiqueta, children, className = '' }) => {
    const vacio = children === null || children === undefined || children === '';
    return (
        <div className={`min-w-0 ${className}`}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">{etiqueta}</dt>
            <dd className={`text-[13px] mt-0.5 break-words ${vacio ? 'text-slate-500' : 'text-slate-800'}`}>
                {vacio ? '—' : children}
            </dd>
        </div>
    );
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
    // Meta de los módulos (7 desde el 2026-09-22, con "item-libre"). Se pide una
    // sola vez: no cambia entre propuestas ni entre cotizaciones.
    //
    // Hoy la Hoja de Trabajo sólo lee de aquí `modulo.nombre`, como respaldo del
    // rótulo del ítem cuando no tiene `descripcionItem`. La resolución genérica
    // de etiquetas por `grupo` que justificaba esta llamada desapareció con el
    // rediseño del 2026-09-22, que dejó la hoja en sólo plano + cortes.
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

    /** Nombre legible del módulo ("Ventanas" en vez de "ventanas"). Sale de la
     * meta que el modal ya pide para la Hoja de Trabajo; un módulo retirado
     * cae a su id. */
    const nombreModulo = (moduloId: string) => modulos.find(m => m.id === moduloId)?.nombre || moduloId;

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
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-900 mr-1">Propuesta</span>
                {propuestas.map(p => {
                    const esActiva = p.id === (cot?.propuestaActivaId ?? propuestaId);
                    return (
                        <button
                            key={p.id}
                            onClick={() => { if (!esActiva) cargar(p.id); }}
                            title={p.nombre || `Propuesta ${p.etiqueta}`}
                            className={`px-2.5 py-1 rounded-lg border text-[12px] font-semibold transition ${esActiva
                                ? 'bg-templex-600 text-white border-templex-600'
                                : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'}`}
                        >
                            {p.etiqueta}
                            {p.elegida && <CheckCircle2 className={`w-3 h-3 inline ml-1 ${esActiva ? 'text-white' : 'text-emerald-600'}`} />}
                            <span className={`ml-1.5 font-normal tabular-nums ${esActiva ? 'text-templex-50' : 'text-slate-700'}`}>
                                {fmtCOP(p.totales.total)}
                            </span>
                        </button>
                    );
                })}
                {!elegida && (
                    <Chip tono="ambar">Ninguna elegida</Chip>
                )}
            </div>
        );
    };

    return (
        <ModalShell
            titulo={<>Cotización {cot ? <span className="tabular-nums">{`N.° ${cot.numero}`}</span> : ''}</>}
            subtitulo={cot ? (cot.cliente?.nombre || 'Sin cliente asignado') : undefined}
            anchoMaximo="max-w-4xl"
            onClose={onClose}
            accionesHeader={
                <div className="flex rounded-lg border border-slate-300 overflow-hidden text-[12px] font-semibold">
                    {([['normal', 'Normal'], ['tecnico', 'Técnica'], ['comparar', 'Comparar']] as const).map(([v, texto]) => (
                        <button
                            key={v}
                            onClick={() => setVista(v)}
                            className={`px-3 py-1.5 transition ${vista === v ? 'bg-templex-600 text-white' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
                        >
                            {texto}
                        </button>
                    ))}
                </div>
            }
        >
            {cargando ? (
                    <div className="py-20 flex items-center justify-center text-slate-700">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando cotización…
                    </div>
                ) : !cot ? null : vista === 'comparar' ? (
                    <div className="p-6">
                        <ComparadorPropuestas cotizacionId={cot.id} />
                    </div>
                ) : vista === 'normal' ? (
                    <div className="p-6 space-y-5">
                        {/* ── Cabecera ─────────────────────────────────────── */}
                        {/* Ficha en dos bandas: quién (cliente y sus datos de
                            contacto, sólo los que existen) y el trato comercial,
                            en una grilla de celdas del mismo peso. */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                {cot.cliente?.nombre
                                    ? <p className="text-[15px] font-bold text-slate-900 break-words">{cot.cliente.nombre}</p>
                                    : <p className="text-[14px] text-slate-700">Sin cliente asignado</p>}
                                <ChipEstadoCotizacion estado={cot.estado} />
                            </div>
                            {(cot.cliente?.obra || cot.cliente?.direccion || cot.cliente?.telefono || cot.cliente?.contacto) && (
                                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
                                    {cot.cliente?.obra && <Dato etiqueta="Obra">{cot.cliente.obra}</Dato>}
                                    {cot.cliente?.direccion && <Dato etiqueta="Dirección">{cot.cliente.direccion}</Dato>}
                                    {cot.cliente?.telefono && <Dato etiqueta="Teléfono">{cot.cliente.telefono}</Dato>}
                                    {cot.cliente?.contacto && <Dato etiqueta="Contacto">{cot.cliente.contacto}</Dato>}
                                </dl>
                            )}
                            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-3 border-t border-slate-200">
                                <Dato etiqueta="Asesor">{cot.asesor}</Dato>
                                <Dato etiqueta="Segmento">{cot.segmentoCliente ? (NOMBRE_SEGMENTO[cot.segmentoCliente] ?? cot.segmentoCliente) : null}</Dato>
                                {/* El descuento vivo es el de la PROPUESTA; el de la
                                    cabecera quedó legado y siempre vale 0. */}
                                <Dato etiqueta={activa ? `Descuento · ${activa.etiqueta}` : 'Descuento'}>
                                    <span className="tabular-nums">{fmtPct(activa?.descuentoPct ?? 0)}</span>
                                </Dato>
                                <Dato etiqueta="Fecha">{fmtFecha(cot.creadaEn)}</Dato>
                            </dl>
                        </div>

                        {/* ── Propuestas ───────────────────────────────────── */}
                        {propuestas.length > 0 && (
                            <div className="space-y-2">
                                <Chips />
                                {activa && (activa.nombre || activa.nota) && (
                                    <p className="text-[12.5px] text-slate-800">
                                        {activa.nombre && <span className="font-semibold text-slate-900">{activa.nombre}. </span>}
                                        {activa.nota}
                                    </p>
                                )}
                                {activa?.legadoCargosEnItems && (
                                    <p className="flex items-start gap-1.5 text-[12px] text-amber-800 font-semibold">
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
                                <thead className="bg-slate-50 text-slate-900 border-b border-slate-200 text-[11px] uppercase tracking-wide">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Módulo</th>
                                        <th className="px-3 py-2 text-left font-semibold">Descripción</th>
                                        <th className="px-3 py-2 text-center font-semibold">Piezas</th>
                                        <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Subtotal + AIU</th>
                                        {/* Estos dos vienen del blob del ítem, calculados
                                            ANTES del descuento de la propuesta. Sin el
                                            rótulo, sumarlos a mano no cuadra con el total. */}
                                        <th className="px-3 py-2 text-right font-semibold">IVA <span className="block font-normal normal-case tracking-normal text-slate-700">a precio lleno</span></th>
                                        <th className="px-3 py-2 text-right font-semibold">Total <span className="block font-normal normal-case tracking-normal text-slate-700">a precio lleno</span></th>
                                        {aptitud && <th className="px-3 py-2 text-center font-semibold">Corte</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cot.items.length === 0 && (
                                        <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-700">
                                            Esta propuesta no tiene ítems.
                                        </td></tr>
                                    )}
                                    {cot.items.map(it => {
                                        const apt = aptitudDe(it.id);
                                        return (
                                            <React.Fragment key={it.id}>
                                                <tr>
                                                    <td className="px-3 py-2 font-semibold text-slate-900">{nombreModulo(it.moduloId)}</td>
                                                    <td className={`px-3 py-2 ${(it.descripcionItem || resumenMedidas(it.input)) ? 'text-slate-800' : 'text-slate-500'}`}>
                                                        {it.descripcionItem || resumenMedidas(it.input) || '—'}
                                                    </td>
                                                    <td className="px-3 py-2 text-center text-slate-800 tabular-nums">{it.cantidadPiezas}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmtCOP(it.subtotalConAiu)}</td>
                                                    <td className="px-3 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">{fmtCOP(it.iva)}</td>
                                                    <td className="px-3 py-2 text-right text-slate-800 tabular-nums whitespace-nowrap">{fmtCOP(it.total)}</td>
                                                    {aptitud && (
                                                        <td className="px-3 py-2 text-center">
                                                            {apt?.imprimible ? (
                                                                <Chip tono="esmeralda"><CheckCircle2 className="w-3 h-3" /> Imprimible</Chip>
                                                            ) : (
                                                                <Chip tono="rosa"><XCircle className="w-3 h-3" /> No imprimible</Chip>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                                {aptitud && apt && !apt.imprimible && apt.motivos.length > 0 && (
                                                    <tr>
                                                        <td colSpan={7} className="px-3 pb-2 pt-0">
                                                            <ul className="text-[12px] text-rose-800 list-disc list-inside pl-2">
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
                                    <HardHat className="w-4 h-4 text-templex-600" />
                                    <span className="text-[12.5px] font-semibold text-slate-900">Cargos de obra</span>
                                    <span className="text-[12px] text-slate-700">
                                        Se cobran una vez por propuesta · fuera del AIU y del descuento
                                    </span>
                                </div>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-slate-100">
                                        {cargos.map(c => (
                                            <tr key={c.id}>
                                                <td className="px-3 py-2 text-slate-900">
                                                    {ETIQUETA_CARGO[c.tipo] || c.tipo}
                                                    {c.descripcion && c.descripcion !== ETIQUETA_CARGO[c.tipo] && (
                                                        <span className="text-slate-700"> · {c.descripcion}</span>
                                                    )}
                                                    {c.origen === 'SUGERIDO' && (
                                                        <Chip tono="marca" className="ml-1.5">Sugerido</Chip>
                                                    )}
                                                    {!c.aplicaIva && (
                                                        <Chip tono="neutro" className="ml-1.5">Sin IVA</Chip>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right text-slate-700 tabular-nums whitespace-nowrap">
                                                    {c.unidad !== 'GLOBAL' && `${c.cantidad} ${c.unidad === 'DIA' ? 'día(s)' : 'und'} × ${fmtCOP(c.valorUnitario)}`}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmtCOP(c.total)}</td>
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
                                        <div className="flex justify-between"><span className="text-slate-800">Productos (con AIU)</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(totales.productos)}</span></div>
                                        {(totales.manoObra ?? 0) > 0 && (
                                            <div className="flex justify-between"><span className="text-slate-800">Mano de obra (con AIU)</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(totales.manoObra)}</span></div>
                                        )}
                                        {totales.descuento > 0 && (
                                            <div className="flex justify-between"><span className="text-slate-800">Descuento</span><span className="font-semibold text-rose-700 tabular-nums">−{fmtCOP(totales.descuento)}</span></div>
                                        )}
                                        {totales.cargos > 0 && (
                                            <div className="flex justify-between"><span className="text-slate-800">Cargos de obra</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(totales.cargos)}</span></div>
                                        )}
                                        <div className="flex justify-between"><span className="text-slate-800">IVA</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(totales.iva)}</span></div>
                                        <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1">
                                            <span>Total{activa ? ` · ${activa.etiqueta}` : ''}</span>
                                            <span className="tabular-nums text-templex-700">{fmtCOP(totales.total)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between"><span className="text-slate-800">Subtotal</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(cot.totales.subtotal)}</span></div>
                                        <div className="flex justify-between"><span className="text-slate-800">IVA</span><span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(cot.totales.iva)}</span></div>
                                        <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-1"><span>Total</span><span className="tabular-nums text-templex-700">{fmtCOP(cot.totales.total)}</span></div>
                                    </>
                                )}
                                {!viendoLaElegida && (
                                    <p className="text-[12px] text-amber-800 font-semibold pt-1">
                                        Estos son los totales de la propuesta {activa?.etiqueta}. La que se le cobra al
                                        cliente es la {elegida?.etiqueta} ({fmtCOP(elegida?.totales.total ?? 0)}).
                                    </p>
                                )}
                                {!elegida && propuestas.length > 1 && (
                                    <p className="text-[12px] text-amber-800 font-semibold pt-1">
                                        Ninguna propuesta está elegida: la cotización todavía no tiene un total
                                        definitivo ni puede aprobarse.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Acciones ─────────────────────────────────────── */}
                        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                            {activa && (
                                <BotonSecundario
                                    icono={Download}
                                    cargando={descargandoPdf}
                                    onClick={descargarPdf}
                                    title={`Descarga el PDF de la propuesta ${activa.etiqueta} para enviar al cliente`}
                                >
                                    Descargar PDF{activa ? ` (${activa.etiqueta})` : ''}
                                </BotonSecundario>
                            )}
                            <BotonSecundario
                                icono={Printer}
                                onClick={imprimirHojaTrabajo}
                                title="Documento interno para el taller, sin precios — sale siempre, no depende de la aptitud para orden de corte"
                            >
                                Hoja de Trabajo
                            </BotonSecundario>
                            <BotonSecundario
                                icono={ClipboardCheck}
                                cargando={cargandoAptitud}
                                onClick={evaluarAptitud}
                                title="Se evalúa siempre sobre la propuesta elegida: la orden de corte sale de ella."
                            >
                                Evaluar aptitud de la propuesta elegida
                            </BotonSecundario>
                            <BotonPrimario icono={Edit3} onClick={reabrir}>Reabrir para editar</BotonPrimario>
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
                                    <p className="flex items-start gap-1.5 text-[12px] text-amber-800 font-semibold">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                                        Estos son los planos de la propuesta {activa?.etiqueta}, que no es la elegida:
                                        no son los que van al taller.
                                    </p>
                                )}
                            </div>
                        )}
                        {cargandoPlanos && (
                            <div className="flex items-center gap-2 text-slate-700 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando planos…
                            </div>
                        )}
                        {cot.items.map((it: ItemCotizacion) => (
                            <div key={it.id} className="border border-slate-200 rounded-2xl p-4">
                                <div className="mb-3">
                                    <h3 className="text-sm font-bold text-slate-900">{it.descripcionItem || nombreModulo(it.moduloId)}</h3>
                                    <p className="text-[12px] text-slate-700">{nombreModulo(it.moduloId)}{resumenMedidas(it.input) ? ` · ${resumenMedidas(it.input)}` : ''} · {it.cantidadPiezas} pieza(s)</p>
                                </div>
                                {it.disenoId ? (
                                    <DiagramaProducto plano={planos[it.id] ?? null} cargando={cargandoPlanos && !(it.id in planos)} />
                                ) : (
                                    <p className="text-sm text-slate-700 italic">Este ítem no tiene plano (cotizado por medidas libres).</p>
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
        </ModalShell>
    );
};

export default ModalDetalleCotizacion;
