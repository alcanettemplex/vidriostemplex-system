import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Bot, ArrowRight, Loader2, RefreshCw, CheckCircle2, Undo2 } from 'lucide-react';
import socket from '../../../store/socket';
import API from '../../../services/config';

/**
 * Bitácora corta de lo que el sistema movió solo.
 *
 * Existe por un problema concreto: una ODP puede completar su última etapa por un
 * evento de Compras o de Pedidos PV, pasar sola a LISTO_INSTALAR y desaparecer del
 * tablero sin que nadie lo vea. La notificación se pierde si el usuario no estaba
 * mirando la pantalla en ese segundo; esta pestaña deja el rastro a la vista.
 *
 * Son los últimos 10 a propósito: es una cola, no un histórico. El detalle completo de
 * cada orden vive en la pestaña Historial de su ficha.
 */

const LIMITE = 10;

interface Movimiento {
    id: number;
    odp_id: number;
    estado_anterior: string | null;
    estado_nuevo: string | null;
    fecha: string;
    observacion: string | null;
    ODP?: {
        id: number;
        numero_odp: string;
        estado_produccion: string;
        cliente?: { nombre_razon_social: string };
    };
    usuario?: { id: number; nombre_completo: string };
}

const ESTADO_LABEL: Record<string, string> = {
    EN_ESPERA: 'En Espera',
    VISITA_TECNICA: 'Visita Técnica',
    MEDICION: 'Medición',
    ALUMINIO_CORTADO: 'Aluminio Cortado',
    VIDRIO_RECIBIDO: 'Vidrio Recibido',
    ACCESORIOS_SEPARADOS: 'Accesorios Separados',
    LISTO_INSTALAR: 'Listo para Instalar',
    PROGRAMADA: 'Programada',
    INSTALANDO: 'Instalando',
    INSTALADA: 'Instalada',
    ENTREGADA: 'Entregada',
    PAUSADA: 'Pausada',
};

const etiquetaEstado = (e: string | null) => (e ? ESTADO_LABEL[e] || e.replace(/_/g, ' ') : '—');

const fechaLegible = (iso: string) => {
    const d = new Date(iso);
    const hoy = new Date();
    const mismoDia = d.toDateString() === hoy.toDateString();
    const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    if (mismoDia) return `Hoy ${hora}`;
    return `${d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} ${hora}`;
};

interface Props {
    onOpenOdp: (odpId: number) => void;
}

const MovimientosAutomaticosTab: React.FC<Props> = ({ onOpenOdp }) => {
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchMovimientos = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = sessionStorage.getItem('token');
            const res = await axios.get(`${API}/api/odp/movimientos-automaticos`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: LIMITE },
            });
            setMovimientos(Array.isArray(res.data) ? res.data : []);
            setError(false);
        } catch (e) {
            console.error('Error al cargar movimientos automáticos:', e);
            setError(true);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMovimientos(); }, [fetchMovimientos]);

    // Cualquier movimiento automático emite `odp_patch`, así que sirve de señal para
    // refrescar la cola. Con debounce: recibir una ODC de 20 líneas dispara un patch
    // por cada ODP afectada y no tiene sentido pedir la lista 20 veces.
    useEffect(() => {
        const handler = () => {
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(() => fetchMovimientos(true), 600);
        };
        socket.on('odp_patch', handler);
        return () => {
            socket.off('odp_patch', handler);
            if (debounce.current) clearTimeout(debounce.current);
        };
    }, [fetchMovimientos]);

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-50 rounded-xl">
                        <Bot className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-800">Movimientos automáticos</h3>
                        <p className="text-[11px] text-slate-400 leading-tight">
                            Últimos {LIMITE} cambios que hizo el sistema solo — vidrio, herrajes y avances de estado
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => fetchMovimientos()}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Actualizar"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {error ? (
                <div className="p-10 text-center">
                    <p className="text-sm text-slate-400">
                        No se pudo cargar la bitácora. Revisa tu conexión y vuelve a intentarlo.
                    </p>
                    <button
                        onClick={() => fetchMovimientos()}
                        className="mt-3 px-4 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                        Reintentar
                    </button>
                </div>
            ) : movimientos.length === 0 ? (
                <div className="p-12 text-center">
                    <Bot className="w-9 h-9 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-400">
                        Todavía no hay movimientos automáticos.
                    </p>
                    <p className="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
                        Aquí aparecerán las órdenes que avancen solas al verificarse un pedido de vidrio
                        o al quedar cubierta toda la SAP.
                    </p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {movimientos.map((m) => {
                        // Volver atrás desde Listo para Instalar es la única señal que
                        // exige atención: alguien tiene que saber que la orden salió de
                        // Instalaciones.
                        const esRetroceso = m.estado_anterior === 'LISTO_INSTALAR';
                        return (
                            <li
                                key={m.id}
                                className={`px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition-colors cursor-pointer
                                    ${esRetroceso ? 'bg-amber-50/40' : ''}`}
                                onClick={() => m.ODP && onOpenOdp(m.ODP.id)}
                            >
                                <div className={`mt-0.5 p-1.5 rounded-lg shrink-0
                                    ${esRetroceso ? 'bg-amber-100 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {esRetroceso ? <Undo2 className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                            {m.ODP?.numero_odp || `ODP #${m.odp_id}`}
                                        </span>
                                        <span className="text-xs font-bold text-slate-700 truncate max-w-[240px]">
                                            {m.ODP?.cliente?.nombre_razon_social || ''}
                                        </span>
                                        <span className="text-[10px] text-slate-400 ml-auto shrink-0">
                                            {fechaLegible(m.fecha)}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold">
                                        <span className="text-slate-400">{etiquetaEstado(m.estado_anterior)}</span>
                                        <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
                                        <span className={esRetroceso ? 'text-amber-700' : 'text-emerald-700'}>
                                            {etiquetaEstado(m.estado_nuevo)}
                                        </span>
                                    </div>

                                    {m.observacion && (
                                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{m.observacion}</p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default MovimientosAutomaticosTab;
