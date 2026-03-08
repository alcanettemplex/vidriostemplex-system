import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Camera, CheckCircle2, MapPin, Search, AlertCircle, UploadCloud, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';

const InstalacionesPage: React.FC = () => {
    const [odps, setOdps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedOdp, setSelectedOdp] = useState<any | null>(null);

    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchInstalaciones();
    }, []);

    const fetchInstalaciones = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Filtrar ODPs que están en estado PROGRAMADA o LISTO_INSTALAR (Dependiendo del flujo)
            const pendientes = res.data.filter((odp: any) =>
                odp.estado_produccion === 'PROGRAMADA' || odp.estado_produccion === 'LISTO_INSTALAR' || odp.estado_produccion === 'INSTALADA'
            );
            setOdps(pendientes);
        } catch (error) {
            console.error('Error fetching ODPs para instaladores', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleFinalizar = async () => {
        if (!selectedFile || !selectedOdp) {
            toast.error('Debe seleccionar una fotografía de evidencia');
            return;
        }

        try {
            setUploading(true);
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('foto', selectedFile);

            await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${selectedOdp.id}/instalacion`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            toast.success('¡Instalación marcada como finalizada!');
            setSelectedOdp(null);
            setSelectedFile(null);
            setPreviewUrl(null);
            fetchInstalaciones(); // Refrescar lista
        } catch (error) {
            console.error('Error finalizando instalacion:', error);
            toast.error('Hubo un error al subir la evidencia. Intente nuevamente.');
        } finally {
            setUploading(false);
        }
    };

    const filteredOdps = odps.filter(odp =>
        odp.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        odp.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (odp.direccion_instalacion && odp.direccion_instalacion.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Portal Instaladores</h1>
                    <p className="text-slate-500 text-sm">Gestiona tus instalaciones y sube evidencia fotográfica.</p>
                </div>
                <div className="relative w-full md:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="w-4 h-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Buscar ODP, Cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : filteredOdps.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-slate-700 mb-2">¡Todo al día!</h3>
                    <p className="text-slate-500">No hay instalaciones programadas pendientes.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredOdps.map((odp) => (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={odp.id}
                            className={`bg-white rounded-2xl p-5 shadow-sm border-2 overflow-hidden relative ${odp.estado_produccion === 'INSTALADA' ? 'border-emerald-200' : 'border-slate-200 hover:border-blue-400 transition-colors cursor-pointer'}`}
                            onClick={() => odp.estado_produccion !== 'INSTALADA' && setSelectedOdp(odp)}
                        >
                            {/* Cinta de estado */}
                            <div className={`absolute top-0 left-0 w-full h-1.5 ${odp.estado_produccion === 'INSTALADA' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>

                            <div className="flex justify-between items-start mb-4">
                                <span className="font-bold text-slate-800 text-lg">#{odp.numero_odp}</span>
                                <span className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-full tracking-wider ${odp.estado_produccion === 'INSTALADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {odp.estado_produccion === 'INSTALADA' ? 'COMPLETADO' : 'PENDIENTE'}
                                </span>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase">Cliente</p>
                                    <p className="text-sm font-semibold text-slate-700">{odp.cliente.nombre_razon_social}</p>
                                </div>

                                {odp.direccion_instalacion && (
                                    <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-lg">
                                        <MapPin className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
                                        <p className="text-xs text-slate-600 font-medium leading-tight">{odp.direccion_instalacion}</p>
                                    </div>
                                )}

                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase flex items-center gap-1 mb-1">
                                        <FileText className="w-3 h-3" /> Resumen Trabajo
                                    </p>
                                    <p className="text-xs text-slate-600 bg-blue-50/50 p-2 rounded border border-blue-100 line-clamp-2">
                                        {odp.descripcion_pedido}
                                    </p>
                                </div>

                                {odp.observaciones && (
                                    <div className="flex gap-2 bg-amber-50 p-2 rounded border border-amber-100">
                                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                        <p className="text-xs text-amber-800 font-medium line-clamp-2">{odp.observaciones}</p>
                                    </div>
                                )}
                            </div>

                            {odp.estado_produccion === 'INSTALADA' && odp.foto_instalacion_url && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <img src={odp.foto_instalacion_url} alt="Evidencia" className="w-full h-32 object-cover rounded-lg border border-slate-200" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Modal para reportar finalización */}
            <AnimatePresence>
                {selectedOdp && (
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="bg-blue-600 p-5 text-white flex justify-between items-center">
                                <div>
                                    <h2 className="font-bold text-lg">Reportar Instalación</h2>
                                    <p className="text-blue-100 text-sm">Orden #{selectedOdp.numero_odp}</p>
                                </div>
                                <button
                                    onClick={() => { setSelectedOdp(null); setPreviewUrl(null); setSelectedFile(null); }}
                                    className="p-2 hover:bg-white/20 rounded-full transition"
                                >
                                    <XIcon />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <p className="text-sm font-semibold text-slate-700 mb-1">Evidencia Fotográfica Requerida</p>
                                    <p className="text-xs text-slate-500 mb-4">Para cambiar el estado de la ODP a Instalada, debes adjuntar una foto de cómo quedó el trabajo en sitio.</p>

                                    <input
                                        type="file"
                                        accept="image/jpeg, image/png, image/webp"
                                        capture="environment" // Intentar abrir cámara trasera en móviles por defecto
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                    />

                                    {previewUrl ? (
                                        <div className="relative rounded-xl overflow-hidden border-2 border-slate-300">
                                            <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
                                            <button
                                                onClick={() => { setPreviewUrl(null); setSelectedFile(null); }}
                                                className="absolute top-2 right-2 bg-slate-900/70 text-white p-2 rounded-full hover:bg-red-500 transition"
                                            >
                                                <XIcon />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-full h-40 border-2 border-dashed border-blue-300 rounded-xl flex flex-col items-center justify-center text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition group"
                                        >
                                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                                <Camera className="w-6 h-6" />
                                            </div>
                                            <span className="font-bold">Tomar o Seleccionar Foto</span>
                                            <span className="text-xs text-blue-400 mt-1">Presiona aquí</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
                                <button
                                    onClick={() => { setSelectedOdp(null); setPreviewUrl(null); setSelectedFile(null); }}
                                    className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition"
                                    disabled={uploading}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleFinalizar}
                                    disabled={!selectedFile || uploading}
                                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-200"
                                >
                                    {uploading ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            Subiendo Evidencia...
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-5 h-5" />
                                            Completar Trabajo
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);

export default InstalacionesPage;
