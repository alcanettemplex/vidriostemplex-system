import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { X, User, Users } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const ROLES_ASESOR = ['asesor_comercial', 'gerencia', 'jefe_produccion'];

interface AsignarAsesorODPModalProps {
    onConfirm: (asesorId: number | null) => void; // null = usuario logueado
    onCancel: () => void;
}

const AsignarAsesorODPModal: React.FC<AsignarAsesorODPModalProps> = ({ onConfirm, onCancel }) => {
    const currentUser = useSelector((state: any) => state.auth.user);
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    const [opcion, setOpcion] = useState<'mia' | 'otro' | null>(null);
    const [asesores, setAsesores] = useState<{ id: number; nombre_completo: string; rol: string }[]>([]);
    const [asesorSeleccionado, setAsesorSeleccionado] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (opcion === 'otro') {
            setLoading(true);
            axios.get(`${API}/api/usuarios`, { headers })
                .then(res => {
                    const lista = (res.data || []).filter((u: any) =>
                        ROLES_ASESOR.includes(u.rol) && u.id !== currentUser?.id
                    );
                    setAsesores(lista);
                })
                .catch(() => setAsesores([]))
                .finally(() => setLoading(false));
        }
    }, [opcion]); // eslint-disable-line

    const handleConfirmar = () => {
        if (opcion === 'mia') {
            onConfirm(null); // backend usará el userId del token
        } else if (opcion === 'otro' && asesorSeleccionado) {
            onConfirm(asesorSeleccionado);
        }
    };

    const puedeConfirmar = opcion === 'mia' || (opcion === 'otro' && asesorSeleccionado !== null);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <h2 className="text-base font-bold text-slate-800">Nueva Orden de Producción</h2>
                        <button onClick={onCancel} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-5">
                        <p className="text-sm font-semibold text-slate-600">¿Esta ODP es tuya o de otro asesor?</p>

                        {/* Opciones */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setOpcion('mia'); setAsesorSeleccionado(null); }}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition font-semibold text-sm ${
                                    opcion === 'mia'
                                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                                        : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
                                }`}
                            >
                                <User className="w-5 h-5" />
                                Mía
                                {currentUser?.nombre_completo && (
                                    <span className="text-[10px] font-normal text-slate-500 text-center leading-tight">
                                        {currentUser.nombre_completo}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => setOpcion('otro')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition font-semibold text-sm ${
                                    opcion === 'otro'
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                        : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50'
                                }`}
                            >
                                <Users className="w-5 h-5" />
                                De otro asesor
                            </button>
                        </div>

                        {/* Selector de asesor */}
                        {opcion === 'otro' && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Seleccionar asesor
                                </label>
                                {loading ? (
                                    <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                                ) : (
                                    <select
                                        value={asesorSeleccionado ?? ''}
                                        onChange={e => setAsesorSeleccionado(Number(e.target.value) || null)}
                                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    >
                                        <option value="">— Selecciona un asesor —</option>
                                        {asesores.map(a => (
                                            <option key={a.id} value={a.id}>
                                                {a.nombre_completo}
                                                {a.rol === 'gerencia' ? ' (Gerencia)' : a.rol === 'jefe_produccion' ? ' (Jefe Prod.)' : ''}
                                            </option>
                                        ))}
                                        {asesores.length === 0 && (
                                            <option disabled>Sin asesores disponibles</option>
                                        )}
                                    </select>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirmar}
                            disabled={!puedeConfirmar}
                            className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                        >
                            Continuar
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AsignarAsesorODPModal;
