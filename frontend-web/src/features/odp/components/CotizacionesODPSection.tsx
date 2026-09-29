import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    DollarSign, Plus, Link2, X, Loader2, Download, Edit3, Search, AlertTriangle, HardHat, CheckCircle2,
} from '../../../components/ui/icons';

import { apiDescargarPdfPropuesta, apiGetModulos } from '../../cotizador/services/cotizadorApi';
import { CargoPropuesta, Cotizacion, CotizacionLigera, EstadoCotizacion, ModuloMeta, Propuesta } from '../../cotizador/types';
import { descripcionDeItem } from '../../cotizador/fichaProducto';
import { usePermisosCotizador } from '../../cotizador/permisos';
import { fmt } from './ODPFichaModal.utils';
import { listarCotizacionesAprobadas, vincularCotizacionAOdp } from './odpCotizador.api';
import { CotizacionesDeOdp } from './useCotizacionesDeOdp';
import { numeroCotizacion } from '../../cotizador/format';

// ─────────────────────────────────────────────────────────────────────────────
// Sección "Cotizaciones (COT)" de la pestaña Comercial (2026-09-27).
//
// Hasta hoy leía `odp.cotizaciones`, la tabla vieja `cotizacion` (0 filas en
// producción). Ahora muestra las cotizaciones del Cotizador vinculadas a la ODP
// (`cotizador.cotizacion.odp_id`). El Cotizador es la fuente: aquí solo se
// consulta, se vincula (PUT {odpId}) y se navega a él para crear o editar —
// los enlaces `/cotizador?abrir=<id>` y `/cotizador?nuevo=1&vinculo=odp:<id>`
// los resuelve CotizadorPage.
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO_CHIP: Record<EstadoCotizacion, { texto: string; clase: string }> = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
    APROBADA: { texto: 'Aprobada', clase: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    CANCELADO: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-800 border-slate-200' },
    PERDIDO: { texto: 'Perdida', clase: 'bg-rose-50 text-rose-800 border-rose-200' },
};

const ETIQUETA_CARGO: Record<string, string> = {
    SMO: 'Mano de obra', ANDAMIO: 'Alquiler de andamio', HUACAL: 'Huacal / embalaje', FLETE: 'Acarreo / flete',
    OTRO: 'Otro servicio', ENSAMBLE: 'Ensamble', INSTALACION: 'Instalación',
};

const ChipEstado: React.FC<{ estado: EstadoCotizacion }> = ({ estado }) => {
    const e = ESTADO_CHIP[estado] ?? { texto: estado, clase: 'bg-slate-100 text-slate-800 border-slate-200' };
    return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${e.clase}`}>{e.texto}</span>;
};

const fechaCorta = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO') : '—');

/** Opción elegida de una cotización (ligera o completa). */
function elegidaDe<P extends { id: number; elegida: boolean }>(c: { propuestas?: P[]; propuestaElegidaId?: number | null }): P | null {
    return c.propuestas?.find(p => p.elegida || p.id === c.propuestaElegidaId) ?? null;
}

/** El backend emite `aprobadaEn` (2026-09-27) aunque el tipo del Cotizador aún no lo declara. */
const aprobadaEnDe = (c: Cotizacion) => (c as Cotizacion & { aprobadaEn?: string | null }).aprobadaEn ?? null;

const nombreServicio = (c: CargoPropuesta) =>
    [ETIQUETA_CARGO[c.tipo] || c.tipo, c.descripcion && c.descripcion !== ETIQUETA_CARGO[c.tipo] ? c.descripcion : null].filter(Boolean).join(' · ');

async function descargarPdf(cot: { id: number; numero: number }, propuesta: { id: number; etiqueta: string }) {
    try {
        const { data } = await apiDescargarPdfPropuesta(cot.id, propuesta.id);
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${numeroCotizacion(cot.numero)} ${propuesta.etiqueta}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch {
        toast.error('No se pudo generar el PDF de la cotización. Intenta de nuevo.');
    }
}

// ─── Modal de detalle ───────────────────────────────────────────────────────

const DetalleCotizacionModal: React.FC<{
    cot: Cotizacion;
    modulos: ModuloMeta[];
    puedeEditar: boolean;
    onEditar: () => void;
    onClose: () => void;
}> = ({ cot, modulos, puedeEditar, onEditar, onClose }) => {
    const [descargando, setDescargando] = useState(false);
    const elegida = (cot.propuestas ?? []).find(p => p.elegida) ?? null;
    const activa: Propuesta | null = (cot.propuestas ?? []).find(p => p.id === cot.propuestaActivaId) ?? elegida;
    const totales = activa?.totales ?? null;
    const cargos = activa?.cargos ?? [];
    const nombreModulo = (id: string) => modulos.find(m => m.id === id)?.nombre || id;
    const vinculo = cot.vinculo
        ? `${{ lead: 'Lead', prospecto: 'Prospecto', cliente: 'Cliente', odp: 'ODP' }[cot.vinculo.tipo]} #${cot.vinculo.id}`
        : null;

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-slate-900">Cotización {numeroCotizacion(cot.numero)}</h2>
                            <ChipEstado estado={cot.estado} />
                            {activa && <span className="text-[12px] font-semibold text-slate-800">Opción {activa.etiqueta}{activa.elegida ? ' (elegida)' : ''}</span>}
                        </div>
                        <p className="text-[13px] text-slate-800 mt-0.5">{cot.cliente?.nombre || 'Sin cliente'} · Asesor: {cot.asesor || '—'} · {fechaCorta(cot.creadaEn)}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-[13px]">
                        {([
                            ['Obra', cot.cliente?.obra], ['Dirección', cot.cliente?.direccion], ['Teléfono', cot.cliente?.telefono],
                            ['Contacto', cot.cliente?.contacto], ['Vinculada a', vinculo], ['Segmento', cot.segmentoCliente],
                            ['Aprobada', aprobadaEnDe(cot) ? fechaCorta(aprobadaEnDe(cot)) : null], ['Actualizada', fechaCorta(cot.actualizadaEn)],
                        ] as Array<[string, string | null | undefined]>).map(([k, v]) => (
                            <div key={k} className="min-w-0">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-900">{k}</dt>
                                <dd className="text-slate-900 break-words">{v || '—'}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-900 border-b border-slate-200 text-[11px] uppercase tracking-wide">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Producto</th>
                                    <th className="px-3 py-2 text-center font-semibold">Cant.</th>
                                    <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Subtotal + AIU</th>
                                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {cot.items.length === 0 && (
                                    <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-800">Esta opción no tiene productos.</td></tr>
                                )}
                                {cot.items.map(it => (
                                    <tr key={it.id}>
                                        <td className="px-3 py-2 text-slate-900">
                                            {descripcionDeItem(it.input, it.resultado, modulos.find(m => m.id === it.moduloId), nombreModulo(it.moduloId))}
                                            <span className="block mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{nombreModulo(it.moduloId)}</span>
                                        </td>
                                        <td className="px-3 py-2 text-center tabular-nums text-slate-900">{it.cantidadPiezas}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-900 whitespace-nowrap">{fmt(it.subtotalConAiu)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-900 whitespace-nowrap">{fmt(it.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {cargos.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                                <HardHat className="w-4 h-4 text-indigo-600" /> Servicios (mano de obra y cargos)
                            </div>
                            <table className="w-full text-sm">
                                <tbody className="divide-y divide-slate-100">
                                    {cargos.map(c => (
                                        <tr key={c.id}>
                                            <td className="px-3 py-2 text-slate-900">{nombreServicio(c)}{!c.aplicaIva && <span className="ml-1.5 text-[11px] text-slate-700">(sin IVA)</span>}</td>
                                            <td className="px-3 py-2 text-right text-slate-800 tabular-nums whitespace-nowrap">
                                                {c.unidad !== 'GLOBAL' ? `${c.cantidad} ${c.unidad === 'DIA' ? 'día(s)' : c.unidad === 'M2' ? 'm²' : 'und'} × ${fmt(c.valorUnitario)}` : ''}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmt(c.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <div className="w-full max-w-xs space-y-1 text-sm">
                            {totales ? (
                                <>
                                    <div className="flex justify-between"><span className="text-slate-800">Productos (con AIU)</span><span className="font-semibold tabular-nums">{fmt(totales.productos)}</span></div>
                                    {(totales.manoObra ?? 0) > 0 && <div className="flex justify-between"><span className="text-slate-800">Mano de obra (con AIU)</span><span className="font-semibold tabular-nums">{fmt(totales.manoObra ?? 0)}</span></div>}
                                    {totales.descuento > 0 && <div className="flex justify-between"><span className="text-slate-800">Descuento</span><span className="font-semibold text-rose-700 tabular-nums">−{fmt(totales.descuento)}</span></div>}
                                    {totales.cargos > 0 && <div className="flex justify-between"><span className="text-slate-800">Cargos de obra</span><span className="font-semibold tabular-nums">{fmt(totales.cargos)}</span></div>}
                                    <div className="flex justify-between"><span className="text-slate-800">IVA</span><span className="font-semibold tabular-nums">{fmt(totales.iva)}</span></div>
                                    <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-1"><span>Total</span><span className="tabular-nums text-indigo-700">{fmt(totales.total)}</span></div>
                                </>
                            ) : (
                                <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{fmt(cot.totales.total)}</span></div>
                            )}
                            {!elegida && <p className="text-[12px] text-amber-800 font-semibold pt-1">Ninguna opción está elegida todavía.</p>}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                    {activa && (
                        <button
                            onClick={async () => { setDescargando(true); await descargarPdf(cot, activa); setDescargando(false); }}
                            disabled={descargando}
                            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-60"
                        >
                            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar PDF
                        </button>
                    )}
                    {puedeEditar && (
                        <button onClick={onEditar} className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                            <Edit3 className="w-4 h-4" /> Editar cotización
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Modal de vincular ──────────────────────────────────────────────────────

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const VincularCotizacionModal: React.FC<{
    odpId: number;
    clienteOdp: string;
    onClose: () => void;
    onVinculada: () => void;
}> = ({ odpId, clienteOdp, onClose, onVinculada }) => {
    const permisos = usePermisosCotizador();
    const [candidatas, setCandidatas] = useState<CotizacionLigera[] | null>(null);
    const [busqueda, setBusqueda] = useState('');
    const [vinculando, setVinculando] = useState<number | null>(null);

    useEffect(() => {
        listarCotizacionesAprobadas()
            .then(({ data }) => setCandidatas(data.filter(c => !c.odpId)))
            .catch(() => { toast.error('No se pudieron cargar las cotizaciones aprobadas.'); setCandidatas([]); });
    }, []);

    // Sugerencia: primero las del mismo cliente de la ODP; la búsqueda filtra por
    // cliente, obra o número.
    const visibles = useMemo(() => {
        if (!candidatas) return [];
        const q = normalizar(busqueda);
        const cliente = normalizar(clienteOdp);
        const coincide = (c: CotizacionLigera) => {
            const nombre = normalizar(c.cliente?.nombre ?? '');
            return Boolean(cliente) && Boolean(nombre) && (nombre.includes(cliente) || cliente.includes(nombre));
        };
        return candidatas
            .filter(c => !q || normalizar(`${numeroCotizacion(c.numero)} ${c.cliente?.nombre ?? ''} ${c.cliente?.obra ?? ''} ${c.asesor ?? ''}`).includes(q))
            .map(c => ({ c, sugerida: coincide(c) }))
            .sort((a, b) => Number(b.sugerida) - Number(a.sugerida) || b.c.numero - a.c.numero);
    }, [candidatas, busqueda, clienteOdp]);

    const vincular = async (c: CotizacionLigera) => {
        setVinculando(c.id);
        try {
            await vincularCotizacionAOdp(c.id, odpId);
            toast.success(`Cotización ${numeroCotizacion(c.numero)} vinculada a la ODP.`);
            onVinculada();
            onClose();
        } catch (e) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg || 'No se pudo vincular la cotización. Intenta de nuevo.');
        } finally {
            setVinculando(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">Vincular cotización</h2>
                        <p className="text-[13px] text-slate-800">Cotizaciones APROBADAS que aún no tienen ODP. Arriba, las del cliente de esta ODP.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                </div>
                <div className="px-6 pt-4">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input
                            autoFocus
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            placeholder="Buscar por cliente, obra, asesor o número…"
                            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-[13px]"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
                    {candidatas === null ? (
                        <div className="py-10 flex items-center justify-center text-slate-800 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando…</div>
                    ) : visibles.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-800">
                            {candidatas.length === 0 ? 'No hay cotizaciones aprobadas sin ODP.' : 'Ninguna coincide con la búsqueda.'}
                        </p>
                    ) : visibles.map(({ c, sugerida }) => {
                        const elegida = elegidaDe(c);
                        const motivo = permisos.motivoNoEditar(c.asesorUsuarioId, c.asesor);
                        return (
                            <div key={c.id} className={`flex items-center justify-between gap-3 border rounded-xl px-3 py-2 ${sugerida ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-bold text-slate-900">
                                        {numeroCotizacion(c.numero)} · {c.cliente?.nombre || 'Sin cliente'}
                                        {sugerida && <span className="ml-2 text-[11px] font-semibold text-emerald-800">Mismo cliente</span>}
                                    </p>
                                    <p className="text-[12px] text-slate-800">
                                        {c.asesor || 'Sin asesor'} · {fechaCorta(c.creadaEn)} · {fmt(elegida?.totales.total ?? c.totales.total)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => vincular(c)}
                                    disabled={vinculando !== null || Boolean(motivo)}
                                    title={motivo ?? 'Vincular esta cotización a la ODP'}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {vinculando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />} Vincular
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Sección ────────────────────────────────────────────────────────────────

interface Props {
    odp: { id: number; cliente?: { nombre_razon_social?: string } | null };
    cotizaciones: CotizacionesDeOdp;
}

const CotizacionesODPSection: React.FC<Props> = ({ odp, cotizaciones }) => {
    const navigate = useNavigate();
    const permisos = usePermisosCotizador();
    const { lista, detalles, cargando, error, recargar } = cotizaciones;
    const [modulos, setModulos] = useState<ModuloMeta[]>([]);
    const [abierta, setAbierta] = useState<number | null>(null);
    const [vincularAbierto, setVincularAbierto] = useState(false);

    useEffect(() => {
        if (lista.length === 0) return;
        apiGetModulos().then(r => setModulos(r.data)).catch(() => setModulos([]));
    }, [lista.length]);

    const nombreModulo = (id: string) => modulos.find(m => m.id === id)?.nombre || id;
    const detalleAbierto = abierta !== null ? detalles[abierta] ?? null : null;
    const ligeraAbierta = abierta !== null ? lista.find(c => c.id === abierta) ?? null : null;

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" /> Cotizaciones (COT)
                </h3>
                {permisos.puedeCrear && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setVincularAbierto(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
                        >
                            <Link2 className="w-3.5 h-3.5" /> Vincular cotización
                        </button>
                        <button
                            onClick={() => navigate(`/cotizador?nuevo=1&vinculo=odp:${odp.id}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
                        >
                            <Plus className="w-3.5 h-3.5" /> Nueva cotización
                        </button>
                    </div>
                )}
            </div>

            {cargando && lista.length === 0 ? (
                <div className="py-8 flex items-center justify-center text-slate-800 text-sm"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando cotizaciones…</div>
            ) : error ? (
                <div className="flex items-start gap-2 text-[13px] text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-3">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                    <button onClick={recargar} className="ml-auto underline font-semibold">Reintentar</button>
                </div>
            ) : lista.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-800">
                    <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium">No hay cotizaciones vinculadas a esta ODP</p>
                    {permisos.puedeCrear && <p className="text-[12px] mt-1">Crea una en el Cotizador o vincula una cotización aprobada.</p>}
                </div>
            ) : lista.map(c => {
                const det = detalles[c.id] ?? null;
                const elegida = det ? (det.propuestas ?? []).find(p => p.elegida) ?? null : null;
                const elegidaLigera = elegidaDe(c);
                const total = elegida?.totales.total ?? elegidaLigera?.totales.total ?? c.totales.total;
                const productos = det
                    ? det.items.map(it => ({ id: it.id, texto: descripcionDeItem(it.input, it.resultado, modulos.find(m => m.id === it.moduloId), nombreModulo(it.moduloId)), piezas: it.cantidadPiezas }))
                    : c.items.filter(it => !elegidaLigera || it.propuestaId === elegidaLigera.id)
                        .map(it => ({ id: it.id, texto: [it.descripcionItem, nombreModulo(it.moduloId)].filter(Boolean).join(' — '), piezas: it.cantidadPiezas }));
                const servicios = elegida?.cargos ?? [];
                return (
                    <button
                        key={c.id}
                        onClick={() => setAbierta(c.id)}
                        className="w-full text-left bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm hover:border-indigo-300 hover:shadow transition"
                        title="Ver el detalle de la cotización"
                    >
                        <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-bold text-blue-700 text-lg">{numeroCotizacion(c.numero)}</span>
                                    <ChipEstado estado={c.estado} />
                                    {(elegida || elegidaLigera) && (
                                        <span className="text-[12px] font-semibold text-slate-800 flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Opción {(elegida ?? elegidaLigera)?.etiqueta}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-800">{c.asesor || 'Sin asesor'} · {fechaCorta(c.creadaEn)}{c.cliente?.nombre ? ` · ${c.cliente.nombre}` : ''}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{fmt(total)}</p>
                                <p className="text-xs text-slate-800 mt-0.5">TOTAL{elegida || elegidaLigera ? '' : ' (sin opción elegida)'}</p>
                            </div>
                        </div>
                        {productos.length > 0 && (
                            <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                                {productos.slice(0, 4).map(p => (
                                    <li key={p.id} className="text-[12.5px] text-slate-900 flex gap-2">
                                        <span className="font-bold tabular-nums shrink-0">{p.piezas}×</span>
                                        <span className="truncate" title={p.texto}>{p.texto}</span>
                                    </li>
                                ))}
                                {productos.length > 4 && <li className="text-[12px] text-slate-800">…y {productos.length - 4} producto(s) más</li>}
                            </ul>
                        )}
                        {servicios.length > 0 && (
                            <p className="mt-2 text-[12px] text-slate-800">
                                <span className="font-semibold text-slate-900">Servicios:</span>{' '}
                                {servicios.map(s => `${nombreServicio(s)} ${fmt(s.total)}`).join(' · ')}
                            </p>
                        )}
                    </button>
                );
            })}

            {abierta !== null && (detalleAbierto ? (
                <DetalleCotizacionModal
                    cot={detalleAbierto}
                    modulos={modulos}
                    puedeEditar={permisos.puedeEditar(detalleAbierto.asesorUsuarioId)}
                    onEditar={() => navigate(`/cotizador?abrir=${detalleAbierto.id}`)}
                    onClose={() => setAbierta(null)}
                />
            ) : (
                // Pasó del tope de detalles o el detalle falló: se ofrece abrirla en el Cotizador.
                <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 p-3" onClick={() => setAbierta(null)}>
                    <div className="bg-white rounded-2xl p-6 max-w-md text-sm text-slate-900 space-y-3" onClick={e => e.stopPropagation()}>
                        <p>No se pudo cargar el detalle de la cotización {numeroCotizacion(ligeraAbierta?.numero)} aquí.</p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setAbierta(null)} className="px-3 py-1.5 border border-slate-300 rounded-lg">Cerrar</button>
                            <button onClick={() => navigate(`/cotizador?abrir=${abierta}`)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-bold">Abrir en el Cotizador</button>
                        </div>
                    </div>
                </div>
            ))}

            {vincularAbierto && (
                <VincularCotizacionModal
                    odpId={odp.id}
                    clienteOdp={odp.cliente?.nombre_razon_social ?? ''}
                    onClose={() => setVincularAbierto(false)}
                    onVinculada={recargar}
                />
            )}
        </div>
    );
};

export default CotizacionesODPSection;
