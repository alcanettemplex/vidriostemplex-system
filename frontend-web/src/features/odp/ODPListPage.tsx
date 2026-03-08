import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Search, FileText, CheckCircle2, Clock, Truck, Eye, Trash2, Edit3, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPForm from './components/ODPForm';
import ODPDetailModal from './components/ODPDetailModal';

interface ODP {
    id: number;
    numero_odp: string;
    cliente: { nombre_razon_social: string };
    asesor: { nombre_completo: string };
    estado_produccion: string;
    estado_facturacion: string;
    estado_caja: string;
    fecha_creacion: string;
    items: any[];
}

const getStatusColor = (estado: string) => {
    switch (estado) {
        case 'EN_ESPERA': return 'bg-slate-100 text-slate-800 border-slate-200';
        case 'PEDIDO_PROVEEDOR': return 'bg-purple-100 text-purple-800 border-purple-200';
        case 'ALUMINIO_CORTADO': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'VIDRIO_RECIBIDO': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
        case 'ACCESORIOS_SEPARADOS': return 'bg-teal-100 text-teal-800 border-teal-200';
        case 'LISTO_INSTALAR': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'PROGRAMADA': return 'bg-amber-100 text-amber-800 border-amber-200';
        case 'ENTREGADA': case 'INSTALADA': return 'bg-gray-100 text-gray-800 border-gray-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
};

const getStatusIcon = (estado: string) => {
    switch (estado) {
        case 'EN_ESPERA': return <FileText className="w-4 h-4 mr-1" />;
        case 'ALUMINIO_CORTADO': case 'VIDRIO_RECIBIDO': return <Clock className="w-4 h-4 mr-1" />;
        case 'LISTO_INSTALAR': return <CheckCircle2 className="w-4 h-4 mr-1" />;
        case 'PROGRAMADA': return <Truck className="w-4 h-4 mr-1" />;
        default: return null;
    }
}

const ODPListPage: React.FC = () => {
    const [odps, setOdps] = useState<ODP[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedOdpDetail, setSelectedOdpDetail] = useState<ODP | null>(null);
    const [editingOdp, setEditingOdp] = useState<ODP | null>(null);
    const [deletingOdp, setDeletingOdp] = useState<ODP | null>(null);

    useEffect(() => {
        fetchODPs();
    }, []);

    const fetchODPs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setOdps(res.data);
        } catch (error) {
            console.error('Error fetching ODPs', error);
            // Fallback para visualización durante testing de UI sin DB
            if (odps.length === 0) {
                setOdps([{
                    id: 1, numero_odp: 'ODP-2026-0001',
                    cliente: { nombre_razon_social: 'Constructora Beta' },
                    asesor: { nombre_completo: 'Juan Admin' },
                    estado_produccion: 'EN_ESPERA', estado_facturacion: 'PENDIENTE', estado_caja: 'PENDIENTE', fecha_creacion: new Date().toISOString(), items: [1, 2, 3]
                }]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setOdps(odps.filter(o => o.id !== id));
            setDeletingOdp(null);
        } catch (error) {
            console.error('Error deleting ODP', error);
        }
    };

    const filteredOdps = odps.filter(odp =>
        odp.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        odp.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Órdenes de Producción</h1>
                    <p className="text-slate-500 text-sm mt-1">Gestiona los pedidos y su flujo por planta</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Orden
                </button>
            </div>

            <div className="glass-panel overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/50">
                    <div className="relative w-full max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por ODP o cliente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Nº ODP</th>
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Asesor</th>
                                <th className="px-6 py-4 font-medium">Items</th>
                                <th className="px-6 py-4 font-medium">Estado Taller</th>
                                <th className="px-6 py-4 font-medium">Caja</th>
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white/30">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-8"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 bg-slate-200 rounded-full w-24"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                                        <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-200 rounded w-8 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : filteredOdps.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        No se encontraron órdenes de producción.
                                    </td>
                                </tr>
                            ) : (
                                filteredOdps.map((odp, idx) => (
                                    <motion.tr
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={odp.id}
                                        className="hover:bg-slate-50/80 transition group"
                                    >
                                        <td className="px-6 py-4 font-medium text-blue-600">#{odp.numero_odp}</td>
                                        <td className="px-6 py-4 text-slate-700 font-medium">{odp.cliente.nombre_razon_social}</td>
                                        <td className="px-6 py-4 text-slate-500">{odp.asesor.nombre_completo}</td>
                                        <td className="px-6 py-4 text-slate-600 font-medium">{odp.items?.length || 0}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(odp.estado_produccion)}`}>
                                                {getStatusIcon(odp.estado_produccion)}
                                                {odp.estado_produccion.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${odp.estado_caja === 'CANCELADO' || odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>
                                                {odp.estado_caja.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right flex justify-end gap-2">
                                            <button
                                                onClick={() => setSelectedOdpDetail(odp)}
                                                className="text-slate-400 hover:text-blue-600 transition p-2 hover:bg-blue-50 rounded"
                                                title="Ver Detalles"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingOdp(odp)}
                                                className="text-slate-400 hover:text-emerald-600 transition p-2 hover:bg-emerald-50 rounded"
                                                title="Editar"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setDeletingOdp(odp)}
                                                className="text-slate-400 hover:text-red-600 transition p-2 hover:bg-red-50 rounded"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <AnimatePresence>
                {(isFormOpen || editingOdp) && (
                    <ODPForm
                        odpToEdit={editingOdp}
                        onClose={() => {
                            setIsFormOpen(false);
                            setEditingOdp(null);
                        }}
                        onSuccess={() => {
                            setIsFormOpen(false);
                            setEditingOdp(null);
                            fetchODPs();
                        }}
                    />
                )}

                {selectedOdpDetail && (
                    <ODPDetailModal
                        odp={selectedOdpDetail}
                        onClose={() => setSelectedOdpDetail(null)}
                    />
                )}
            </AnimatePresence>

            {/* Modal de Eliminación */}
            {deletingOdp && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-center"
                    >
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertCircle className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-2">¿Eliminar esta ODP?</h3>
                        <p className="text-slate-500 mb-6">
                            Estás a punto de eliminar la orden <strong>{deletingOdp.numero_odp}</strong>.
                            Esta acción es irreversible y afectará a producción.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setDeletingOdp(null)}
                                className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deletingOdp.id)}
                                className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm shadow-red-200"
                            >
                                Sí, Eliminar ODP
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default ODPListPage;
