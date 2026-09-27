import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { X, Loader2, AlertTriangle, Info, Package, CheckCircle2 } from '../../../components/ui/icons';

import {
    FilaTraerSap, ModoTraerSap, RespuestaTraerSap, CotizacionAprobadaResumen, traerItemsCotizacionASap,
} from './odpCotizador.api';

// ─────────────────────────────────────────────────────────────────────────────
// "Traer ítems de la cotización" a la SAP (2026-09-27).
//
// Todo pasa por el MISMO endpoint: primero en `dry_run` (lo que se ve aquí es
// exactamente lo que se escribiría) y, al confirmar, con `dry_run: false`. Las
// reglas (qué SAP, agregar/reemplazar, ítems comprometidos, doble carga) las
// impone el backend; la pantalla solo las muestra y deshabilita lo que él
// rechazaría, para que el asesor no se entere con un error al final.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    odpId: number;
    onClose: () => void;
    /** Se llama tras escribir: la ficha recarga la ODP. */
    onHecho: () => void;
}

const ETIQUETA_TIPO: Record<FilaTraerSap['tipo'], { texto: string; clase: string }> = {
    perfil: { texto: 'Perfil · cortes', clase: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    perfil_sin_cortes: { texto: 'Perfil · medir', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
    accesorio: { texto: 'Accesorio', clase: 'bg-slate-100 text-slate-800 border-slate-200' },
    acabado: { texto: 'Película / matizado', clase: 'bg-sky-50 text-sky-800 border-sky-200' },
};

const mensajeDe = (e: unknown, respaldo: string): string => {
    const r = (e as { response?: { data?: { error?: string } } })?.response?.data;
    return r?.error || respaldo;
};

const TraerItemsCotizacionModal: React.FC<Props> = ({ odpId, onClose, onHecho }) => {
    const [datos, setDatos] = useState<RespuestaTraerSap | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** La ODP tiene varias cotizaciones aprobadas: hay que elegir una. */
    const [opcionesCot, setOpcionesCot] = useState<CotizacionAprobadaResumen[]>([]);
    const [cotizacionId, setCotizacionId] = useState<number | undefined>(undefined);
    const [sapId, setSapId] = useState<number | 'nueva' | undefined>(undefined);
    const [modo, setModo] = useState<ModoTraerSap | undefined>(undefined);
    const [guardando, setGuardando] = useState(false);
    const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);

    const previsualizar = useCallback(async () => {
        setCargando(true);
        setError(null);
        setConfirmarReemplazo(false);
        try {
            const { data } = await traerItemsCotizacionASap({ odp_id: odpId, cotizacion_id: cotizacionId, sap_id: sapId, modo, dry_run: true });
            setDatos(data);
            if (data.cotizaciones_aprobadas.length > 1) setOpcionesCot(data.cotizaciones_aprobadas);
        } catch (e) {
            const cuerpo = (e as { response?: { data?: { cotizaciones_aprobadas?: CotizacionAprobadaResumen[] } } })?.response?.data;
            if (cuerpo?.cotizaciones_aprobadas && cuerpo.cotizaciones_aprobadas.length > 1) {
                setOpcionesCot(cuerpo.cotizaciones_aprobadas);
            }
            setDatos(null);
            setError(mensajeDe(e, 'No se pudo preparar la vista previa de los ítems de la cotización.'));
        } finally {
            setCargando(false);
        }
    }, [odpId, cotizacionId, sapId, modo]);

    useEffect(() => { previsualizar(); }, [previsualizar]);

    const destinoId = datos?.destino.sap_id ?? null;
    /** Mismo criterio que el backend: si se va a reemplazar la SAP que ya los
     * tiene, no cuentan (se borran); en cualquier otro caso bloquean. */
    const yaTraidaBloquea = useMemo(
        () => (datos?.ya_traida ?? []).filter(s => !(datos?.modo === 'reemplazar' && s.sap_id === destinoId)),
        [datos, destinoId],
    );

    const faltaModo = Boolean(datos?.requiere_modo && !datos?.modo);
    const reemplazoBloqueado = datos?.modo === 'reemplazar' && !datos.reemplazo.permitido;
    const puedeConfirmar = Boolean(datos) && !cargando && !guardando && (datos?.filas.length ?? 0) > 0
        && !faltaModo && !reemplazoBloqueado && yaTraidaBloquea.length === 0;

    const textoBoton = !datos ? 'Traer ítems'
        : datos.destino.nueva ? `Crear SAP con ${datos.filas.length} ítems`
            : datos.modo === 'reemplazar' ? (confirmarReemplazo ? `Sí, reemplazar los ${datos.destino.items_existentes} ítems de ${datos.destino.numero_sap}` : `Reemplazar ítems de ${datos.destino.numero_sap}`)
                : `Agregar ${datos.filas.length} ítems a ${datos.destino.numero_sap}`;

    const confirmar = async () => {
        if (!datos || !puedeConfirmar) return;
        if (datos.modo === 'reemplazar' && !confirmarReemplazo) { setConfirmarReemplazo(true); return; }
        setGuardando(true);
        try {
            const { data } = await traerItemsCotizacionASap({
                odp_id: odpId,
                cotizacion_id: datos.cotizacion.id,
                sap_id: datos.destino.nueva ? 'nueva' : (datos.destino.sap_id ?? undefined),
                modo: datos.modo ?? undefined,
                dry_run: false,
            });
            toast.success(`${data.filas.length} ítems de la cotización N.° ${data.cotizacion.numero} quedaron en ${data.destino.numero_sap}. Revísalos y ajústalos en "Ver SAP".`);
            onHecho();
            onClose();
        } catch (e) {
            toast.error(mensajeDe(e, 'No se pudieron traer los ítems a la SAP. Intenta de nuevo.'));
            previsualizar();
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Package className="w-5 h-5 text-indigo-600" /> Traer ítems de la cotización
                        </h2>
                        <p className="text-[13px] text-slate-800 mt-0.5">
                            {datos
                                ? <>Cotización <b>N.° {datos.cotizacion.numero}</b>{datos.cotizacion.cliente ? ` · ${datos.cotizacion.cliente}` : ''} · opción elegida <b>{datos.cotizacion.propuesta.etiqueta}</b>. Perfilería, accesorios y película; el vidrio va al Pedido PV.</>
                                : 'Perfilería, accesorios y película de la opción elegida. El vidrio va al Pedido PV.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* ── Parámetros ─────────────────────────────────────── */}
                    <div className="flex flex-wrap gap-4 items-end">
                        {opcionesCot.length > 1 && (
                            <label className="text-[12px] font-semibold text-slate-900">
                                Cotización
                                <select
                                    className="mt-1 block border border-slate-300 rounded-lg px-2 py-1.5 text-[13px] font-normal"
                                    value={cotizacionId ?? datos?.cotizacion.id ?? ''}
                                    onChange={e => { setCotizacionId(e.target.value ? Number(e.target.value) : undefined); setModo(undefined); }}
                                >
                                    {!datos && <option value="">Elige una…</option>}
                                    {opcionesCot.map(c => <option key={c.id} value={c.id}>N.° {c.numero}{c.cliente ? ` · ${c.cliente}` : ''}</option>)}
                                </select>
                            </label>
                        )}
                        {datos && datos.saps.length > 0 && (
                            <label className="text-[12px] font-semibold text-slate-900">
                                SAP destino
                                <select
                                    className="mt-1 block border border-slate-300 rounded-lg px-2 py-1.5 text-[13px] font-normal"
                                    value={datos.destino.nueva ? 'nueva' : String(datos.destino.sap_id)}
                                    onChange={e => { setSapId(e.target.value === 'nueva' ? 'nueva' : Number(e.target.value)); setModo(undefined); }}
                                >
                                    {datos.saps.map(s => <option key={s.id} value={s.id}>{s.numero_sap} ({s.items} ítems)</option>)}
                                    <option value="nueva">Nueva SAP</option>
                                </select>
                            </label>
                        )}
                        {datos && datos.destino.nueva && (
                            <p className="text-[12.5px] text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                {datos.saps.length === 0 ? 'La ODP aún no tiene SAP: ' : ''}se creará una SAP nueva en borrador con estos ítems.
                            </p>
                        )}
                    </div>

                    {datos?.requiere_modo && (
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                            <p className="text-[13px] font-semibold text-slate-900">
                                {datos.destino.numero_sap} ya tiene {datos.destino.items_existentes} ítems. ¿Qué hacemos?
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setModo('agregar')}
                                    className={`px-3 py-1.5 rounded-lg border text-[13px] font-semibold ${datos.modo === 'agregar' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    Agregar debajo
                                </button>
                                <button
                                    onClick={() => setModo('reemplazar')}
                                    disabled={!datos.reemplazo.permitido}
                                    title={datos.reemplazo.permitido ? 'Borra los ítems actuales de la SAP y deja los de la cotización' : 'Hay ítems en el proceso de compras'}
                                    className={`px-3 py-1.5 rounded-lg border text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${datos.modo === 'reemplazar' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    Reemplazar
                                </button>
                            </div>
                            {!datos.reemplazo.permitido && (
                                <div className="text-[12.5px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                                    <p className="font-semibold">No se puede reemplazar: estos ítems ya están en el proceso de compras.</p>
                                    <ul className="list-disc list-inside mt-1">
                                        {datos.reemplazo.motivos.slice(0, 8).map(m => <li key={m}>{m}</li>)}
                                        {datos.reemplazo.motivos.length > 8 && <li>…y {datos.reemplazo.motivos.length - 8} más.</li>}
                                    </ul>
                                </div>
                            )}
                            {datos.modo === 'agregar' && (
                                <p className="text-[12px] text-slate-800">Los ítems nuevos siguen las letras de la SAP (desde la <b>{datos.filas[0]?.item}</b>).</p>
                            )}
                        </div>
                    )}

                    {yaTraidaBloquea.length > 0 && (
                        <div className="flex items-start gap-2 text-[13px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <p>
                                Esta cotización ya se trajo a <b>{yaTraidaBloquea.map(s => `${s.numero_sap} (${s.items} ítems)`).join(', ')}</b>.
                                Para no duplicar el pedido, edita esos ítems en la SAP o usa <b>Reemplazar</b> sobre esa misma SAP.
                            </p>
                        </div>
                    )}

                    {/* ── Vista previa ───────────────────────────────────── */}
                    {cargando ? (
                        <div className="py-12 flex items-center justify-center text-slate-800 text-sm">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparando la vista previa…
                        </div>
                    ) : error ? (
                        <div className="flex items-start gap-2 text-[13px] text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-3">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <p>{error}</p>
                        </div>
                    ) : datos && (
                        <>
                            {datos.filas.length === 0 ? (
                                <p className="text-sm text-slate-800 italic">La opción elegida no tiene perfilería, accesorios ni película para traer.</p>
                            ) : (
                                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-700 text-white">
                                            <tr>
                                                <th className="px-2 py-1.5 text-center w-10">ITEM</th>
                                                <th className="px-2 py-1.5 text-left w-28">CÓDIGO</th>
                                                <th className="px-2 py-1.5 text-left">DESCRIPCIÓN</th>
                                                <th className="px-2 py-1.5 text-left">DIMENSIÓN</th>
                                                <th className="px-2 py-1.5 text-center w-16">CANT.</th>
                                                <th className="px-2 py-1.5 text-center w-12">UND</th>
                                                <th className="px-2 py-1.5 text-left">OBSERV.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {datos.filas.map((f, i) => (
                                                <tr key={`${f.item}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                                                    <td className="px-2 py-1.5 text-center font-bold text-slate-900">{f.item}</td>
                                                    <td className="px-2 py-1.5 font-mono font-bold text-blue-700">{f.codigo}</td>
                                                    <td className="px-2 py-1.5 text-slate-900">
                                                        {f.descripcion}
                                                        <span className={`ml-1.5 inline-block text-[11px] font-semibold px-1.5 rounded border ${ETIQUETA_TIPO[f.tipo].clase}`}>{ETIQUETA_TIPO[f.tipo].texto}</span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-slate-900 tabular-nums">{f.dimension || '—'}</td>
                                                    <td className="px-2 py-1.5 text-center font-bold text-slate-900 tabular-nums">{f.cantidad}</td>
                                                    <td className="px-2 py-1.5 text-center text-slate-800">{f.und || '—'}</td>
                                                    <td className="px-2 py-1.5 text-slate-800 text-[11px]">{f.observacion || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <p className="flex items-start gap-1.5 text-[12px] text-slate-800">
                                <Info className="w-4 h-4 mt-px shrink-0 text-slate-600" />
                                Perfiles con cortes: CANT. = barras de 6 m (5 % de desperdicio). Todo queda editable en la SAP como cualquier ítem.
                            </p>
                            {datos.advertencias.length > 0 && (
                                <div className="text-[12.5px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Revisa antes de pedir</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                                        {datos.advertencias.map((a, i) => <li key={i}>{a}</li>)}
                                    </ul>
                                </div>
                            )}
                            {datos.excluidos.length > 0 && (
                                <p className="text-[12px] text-slate-800">
                                    <b>No se traen</b> (van con el vidrio al Pedido PV): {datos.excluidos.map(x => `${x.codigo} ${x.descripcion}`).join(' · ')}.
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                    {faltaModo && <span className="text-[12.5px] text-slate-800 mr-auto">Elige "Agregar debajo" o "Reemplazar" para continuar.</span>}
                    <button onClick={onClose} className="px-4 py-2 text-[13px] font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">
                        Cancelar
                    </button>
                    <button
                        onClick={confirmar}
                        disabled={!puedeConfirmar}
                        className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-bold text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${datos?.modo === 'reemplazar' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        {textoBoton}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TraerItemsCotizacionModal;
