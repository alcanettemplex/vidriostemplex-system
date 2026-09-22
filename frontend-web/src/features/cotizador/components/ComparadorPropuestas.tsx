import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, CheckCircle2, Scale, RefreshCw } from 'lucide-react';

import { apiCompararPropuestas } from '../services/cotizadorApi';
import { ComparativaPropuestas, PropuestaComparada } from '../types';
import { ETIQUETA_CARGO_CORTA, fmtCOP, fmtPct } from '../format';

// ─────────────────────────────────────────────────────────────────────────────
// Comparador de propuestas — la pantalla que se gira hacia el cliente.
//
// Una columna por propuesta y una fila por concepto, en el mismo orden en que
// se arma el precio: productos → descuento → cargos → IVA → total. Se lee de
// arriba abajo como se explica de viva voz, y la diferencia va al pie porque es
// la pregunta que el cliente hace al final ("¿y cuánto más es la templada?").
//
// LA DIFERENCIA SE MIDE CONTRA LA PRIMERA PROPUESTA (la A), no contra la
// elegida — así lo devuelve el backend y así se rotula. La A es la que el
// cliente ya vio; un ancla que se moviera al elegir haría saltar todos los
// números delante de él.
//
// No recalcula nada: pinta los totales espejo tal como los guardó el backend.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
    cotizacionId: number;
    /** Cambia este número para forzar una recarga tras tocar cargos o ítems. */
    recargarToken?: number;
    /** Si se pasa, cada columna ofrece "Elegir esta". La cotización aprobada la
     * rechaza con 409 y el padre muestra el mensaje del backend. */
    onElegir?: (propuestaId: number) => void | Promise<void>;
}

const Celda: React.FC<{ children: React.ReactNode; fuerte?: boolean; clase?: string }> = ({ children, fuerte, clase = '' }) => (
    <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums font-cotizador-head tabular-nums ${fuerte ? 'font-black text-slate-900' : 'font-semibold text-slate-700'} ${clase}`}>
        {children}
    </td>
);

const ComparadorPropuestas: React.FC<Props> = ({ cotizacionId, recargarToken, onElegir }) => {
    const [datos, setDatos] = useState<ComparativaPropuestas | null>(null);
    const [cargando, setCargando] = useState(true);
    const [eligiendo, setEligiendo] = useState<number | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await apiCompararPropuestas(cotizacionId);
            setDatos(data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo armar la comparación de propuestas.');
        } finally {
            setCargando(false);
        }
    }, [cotizacionId]);

    useEffect(() => { cargar(); }, [cargar, recargarToken]);

    const elegir = async (p: PropuestaComparada) => {
        if (!onElegir) return;
        setEligiendo(p.id);
        try {
            await onElegir(p.id);
            await cargar();
        } finally {
            setEligiendo(null);
        }
    };

    if (cargando) {
        return (
            <div className="border border-slate-200 rounded-2xl py-12 flex items-center justify-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Comparando propuestas…
            </div>
        );
    }
    if (!datos || datos.propuestas.length === 0) {
        return (
            <div className="border border-slate-200 rounded-2xl py-10 text-center text-slate-500 text-sm">
                Esta cotización todavía no tiene propuestas que comparar.
            </div>
        );
    }

    const props = datos.propuestas;
    const hayDescuento = props.some((p) => p.totales.descuento > 0);
    const hayCargos = props.some((p) => p.totales.cargos > 0);

    return (
        <section className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <header className="bg-gradient-to-b from-indigo-50 to-violet-50 border-b border-indigo-100 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800 font-cotizador-head tabular-nums flex items-center gap-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    Comparar propuestas
                    <span className="text-[11.5px] font-semibold text-indigo-700">
                        Cotización N.° {datos.numero}
                    </span>
                </h3>
                <button
                    onClick={cargar}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-50 transition"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                </button>
            </header>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-3 py-3 text-left font-medium text-slate-500 whitespace-nowrap">Concepto</th>
                            {props.map((p) => (
                                <th key={p.id} className="px-3 py-3 text-right min-w-[170px] align-top">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span className="font-cotizador-head tabular-nums font-black text-slate-800 text-base">{p.etiqueta}</span>
                                        {p.elegida && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                                <CheckCircle2 className="w-3 h-3" /> Elegida
                                            </span>
                                        )}
                                    </div>
                                    {p.nombre && <div className="text-[11.5px] font-semibold text-slate-600 mt-0.5">{p.nombre}</div>}
                                    {p.nota && <div className="text-[10.5px] font-normal text-slate-400 mt-0.5 max-w-[200px] ml-auto">{p.nota}</div>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr>
                            <td className="px-3 py-2 text-slate-500">Ítems</td>
                            {props.map((p) => (
                                <Celda key={p.id}>{p.cantidadItems}</Celda>
                            ))}
                        </tr>
                        <tr>
                            <td className="px-3 py-2 text-slate-500">Productos (con AIU)</td>
                            {props.map((p) => (
                                <Celda key={p.id}>{fmtCOP(p.totales.productos)}</Celda>
                            ))}
                        </tr>
                        {hayDescuento && (
                            <tr>
                                <td className="px-3 py-2 text-slate-500">Descuento</td>
                                {props.map((p) => (
                                    <Celda key={p.id} clase="text-rose-600">
                                        {p.totales.descuento > 0 ? `−${fmtCOP(p.totales.descuento)}` : '—'}
                                        {p.descuentoPct > 0 && (
                                            <span className="block text-[10.5px] font-semibold text-slate-400">{fmtPct(p.descuentoPct)}</span>
                                        )}
                                    </Celda>
                                ))}
                            </tr>
                        )}
                        {hayCargos && (
                            <tr>
                                <td className="px-3 py-2 text-slate-500">
                                    Cargos de obra
                                    <span className="block text-[10.5px] text-slate-400">Fuera del AIU y del descuento</span>
                                </td>
                                {props.map((p) => (
                                    <Celda key={p.id}>
                                        {fmtCOP(p.totales.cargos)}
                                        {p.cargos.length > 0 && (
                                            <span className="block text-[10.5px] font-normal text-slate-400 leading-tight mt-0.5">
                                                {p.cargos.map((c) => `${ETIQUETA_CARGO_CORTA[c.tipo] || c.tipo} ${fmtCOP(c.total)}`).join(' · ')}
                                            </span>
                                        )}
                                    </Celda>
                                ))}
                            </tr>
                        )}
                        <tr>
                            <td className="px-3 py-2 text-slate-500">IVA</td>
                            {props.map((p) => (
                                <Celda key={p.id}>{fmtCOP(p.totales.iva)}</Celda>
                            ))}
                        </tr>
                        <tr className="bg-slate-50">
                            <td className="px-3 py-3 font-bold text-slate-800">Total</td>
                            {props.map((p) => (
                                <Celda key={p.id} fuerte clase="text-base">{fmtCOP(p.totales.total)}</Celda>
                            ))}
                        </tr>
                        <tr>
                            <td className="px-3 py-2 text-slate-500">
                                Diferencia
                                {datos.baseEtiqueta && (
                                    <span className="block text-[10.5px] text-slate-400">contra la propuesta {datos.baseEtiqueta}</span>
                                )}
                            </td>
                            {props.map((p) => (
                                <Celda
                                    key={p.id}
                                    clase={p.diferencia > 0 ? 'text-rose-600' : p.diferencia < 0 ? 'text-emerald-600' : 'text-slate-400'}
                                >
                                    {p.diferencia === 0 ? '—' : `${p.diferencia > 0 ? '+' : '−'}${fmtCOP(Math.abs(p.diferencia))}`}
                                    {p.diferencia !== 0 && p.diferenciaPct !== null && (
                                        <span className="block text-[10.5px] font-semibold">
                                            {p.diferenciaPct > 0 ? '+' : ''}{p.diferenciaPct.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%
                                        </span>
                                    )}
                                </Celda>
                            ))}
                        </tr>
                        {onElegir && (
                            <tr>
                                <td className="px-3 py-3" />
                                {props.map((p) => (
                                    <td key={p.id} className="px-3 py-3 text-right">
                                        {p.elegida ? (
                                            <span className="text-[11.5px] font-bold text-emerald-700">Es la elegida</span>
                                        ) : (
                                            <button
                                                onClick={() => elegir(p)}
                                                disabled={eligiendo !== null}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11.5px] font-bold hover:bg-indigo-700 transition disabled:opacity-40"
                                            >
                                                {eligiendo === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                Elegir esta
                                            </button>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ComparadorPropuestas;
