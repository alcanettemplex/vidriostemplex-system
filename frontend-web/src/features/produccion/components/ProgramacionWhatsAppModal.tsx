import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, Copy, Check, Calendar, MessageCircle } from '../../../components/ui/icons';
import { toast } from 'react-toastify';
import API from '../../../services/config';

interface ODPItemData {
    item: string;
    tipo_vidrio: string;
    color: string;
    espesor: string;
    ancho_mm: number;
    alto_mm: number;
    cantidad: number;
    prod: string;
}

interface RutaODPData {
    orden: number;
    odp: {
        numero_odp: string;
        tipo_servicio: string | null;
        descripcion_pedido: string | null;
        direccion_instalacion: string | null;
        cliente: { nombre_razon_social: string };
        items: ODPItemData[];
    };
}

interface RutaData {
    id: number;
    vehiculo: { placa: string; tipo: string } | null;
    conductor: { nombre_completo: string } | null;
    oficial: { nombre_completo: string } | null;
    instaladores: { nombre_completo: string }[];
    ruta_odps: RutaODPData[];
}

const formatFechaDisplay = (fechaISO: string): string => {
    const [year, month, day] = fechaISO.split('-');
    return `${day}/${month}/${year}`;
};

const primerNombre = (nombre: string): string =>
    nombre.split(' ').slice(0, 2).join(' ');

const resumirItems = (items: ODPItemData[]): string => {
    if (!items.length) return '';
    const primeros = items.slice(0, 3).map(it => {
        const partes: string[] = [];
        if (it.tipo_vidrio) partes.push(it.tipo_vidrio);
        if (it.color && it.color !== 'Otro') partes.push(it.color);
        if (it.espesor) partes.push(`v${it.espesor}`);
        if (it.ancho_mm && it.alto_mm) partes.push(`${it.ancho_mm}×${it.alto_mm}mm`);
        const desc = partes.join(' ') || it.item || '';
        return `${it.cantidad > 1 ? `${it.cantidad}× ` : ''}${desc}`.trim();
    }).filter(Boolean);
    const resto = items.length > 3 ? ` +${items.length - 3} más` : '';
    return primeros.join(', ') + resto;
};

const generarTexto = (rutas: RutaData[], fecha: string): string => {
    const encabezado = `📋 *PROGRAMACIÓN DEL DÍA — ${formatFechaDisplay(fecha)}*`;

    if (!rutas.length) {
        return `${encabezado}\n\n❌ No hay instalaciones programadas para esta fecha.`;
    }

    const lines: string[] = [encabezado, ''];

    rutas.forEach((ruta, idx) => {
        if (rutas.length > 1) {
            lines.push(`━━━ RUTA ${idx + 1} ━━━`);
        }

        const vehiculo = ruta.vehiculo
            ? `${ruta.vehiculo.placa} (${ruta.vehiculo.tipo})`
            : 'Sin vehículo';
        const conductor = ruta.conductor?.nombre_completo || 'Sin conductor';
        lines.push(`🚗 ${vehiculo} | 👨‍🚗 Conductor: ${conductor}`);

        if (ruta.oficial) {
            const ayudantes = ruta.instaladores.length
                ? ` | Ayudantes: ${ruta.instaladores.map(i => primerNombre(i.nombre_completo)).join(', ')}`
                : '';
            lines.push(`👷 Oficial: ${ruta.oficial.nombre_completo}${ayudantes}`);
        } else if (ruta.instaladores.length) {
            lines.push(`👷 Instaladores: ${ruta.instaladores.map(i => primerNombre(i.nombre_completo)).join(', ')}`);
        }

        lines.push('');

        const odpsOrdenadas = [...ruta.ruta_odps].sort((a, b) => a.orden - b.orden);
        odpsOrdenadas.forEach((ro, i) => {
            const { odp } = ro;
            lines.push(`*${i + 1}. ${odp.numero_odp} — ${odp.cliente.nombre_razon_social}*`);

            if (odp.direccion_instalacion) {
                lines.push(`📍 ${odp.direccion_instalacion}`);
            }

            const resumenItems = resumirItems(odp.items);
            if (resumenItems) {
                lines.push(`🔧 ${resumenItems}`);
            }

            const servicio = [odp.tipo_servicio, odp.descripcion_pedido]
                .filter(Boolean)
                .join(' | ');
            if (servicio) {
                lines.push(`📝 ${servicio}`);
            }

            lines.push('');
        });
    });

    const totalODPs = rutas.reduce((acc, r) => acc + r.ruta_odps.length, 0);
    lines.push('──────────────');
    lines.push(`Total: ${totalODPs} instalación${totalODPs !== 1 ? 'es' : ''} programada${totalODPs !== 1 ? 's' : ''}`);

    return lines.join('\n');
};

interface Props {
    onClose: () => void;
}

const ProgramacionWhatsAppModal: React.FC<Props> = ({ onClose }) => {
    const hoy = new Date().toISOString().split('T')[0];
    const [fecha, setFecha] = useState(hoy);
    const [loading, setLoading] = useState(false);
    const [texto, setTexto] = useState('');
    const [copiado, setCopiado] = useState(false);

    const fetchProgramacion = useCallback(async (f: string) => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await axios.get(`${API}/api/rutas/programacion?fecha=${f}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setTexto(generarTexto(res.data, f));
        } catch {
            toast.error('Error al cargar la programación');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProgramacion(fecha); }, [fecha, fetchProgramacion]);

    const handleCopiar = async () => {
        try {
            await navigator.clipboard.writeText(texto);
            setCopiado(true);
            toast.success('¡Texto copiado! Pégalo en WhatsApp.');
            setTimeout(() => setCopiado(false), 3000);
        } catch {
            toast.error('No se pudo copiar al portapapeles');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 flex flex-col"
                style={{ maxHeight: '90vh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shadow-emerald-600/25">
                            <MessageCircle className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-900 text-base">Compartir en WhatsApp</h3>
                            <p className="text-xs text-slate-700">Programación de instalaciones del día</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Selector de fecha */}
                <div className="px-6 py-3 border-b border-slate-200 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <label className="text-[11px] font-semibold text-slate-900 uppercase tracking-wider whitespace-nowrap">
                            Fecha
                        </label>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                            <input
                                type="date"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white outline-none"
                            />
                        </div>
                        {fecha !== hoy && (
                            <button
                                onClick={() => setFecha(hoy)}
                                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 whitespace-nowrap transition-colors"
                            >
                                Hoy
                            </button>
                        )}
                    </div>
                </div>

                {/* Vista previa editable */}
                <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 gap-2 min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0">
                        <label className="text-[11px] font-semibold text-slate-900 uppercase tracking-wider">
                            Vista previa
                        </label>
                        {loading && (
                            <span className="text-xs text-emerald-700 font-medium animate-pulse">Cargando...</span>
                        )}
                    </div>
                    <textarea
                        className="flex-1 min-h-0 w-full border border-slate-300 rounded-xl p-4 text-[13px] font-mono text-slate-900 bg-slate-50 resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none leading-relaxed"
                        value={texto}
                        onChange={e => setTexto(e.target.value)}
                        spellCheck={false}
                    />
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 font-semibold text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition text-sm"
                    >
                        Cerrar
                    </button>
                    <button
                        onClick={handleCopiar}
                        className={`flex-1 py-2.5 font-semibold text-white rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-sm
                            ${copiado
                                ? 'bg-emerald-700 shadow-emerald-700/25'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25'
                            }`}
                    >
                        {copiado ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiado ? '¡Copiado!' : 'Copiar al portapapeles'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProgramacionWhatsAppModal;
