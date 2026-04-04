import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, MapPin, Search, CheckCircle2, ChevronRight, X, UploadCloud, UserCircle, FileSignature } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface ODP {
    id: number;
    numero_odp: string;
    cliente: { nombre_razon_social: string };
    estado_produccion: string;
    items: any[];
}

const evidenciaSchema = z.object({
    datos_firmante: z.string().min(2, 'Req. Nombre y DNI de quien recibe'),
    tipo_evidencia: z.enum(['foto', 'firma', 'video']),
});

type FormData = z.infer<typeof evidenciaSchema>;

const EvidenciasPage: React.FC = () => {
    const [odps, setOdps] = useState<ODP[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedODP, setSelectedODP] = useState<ODP | null>(null);
    const [filePreview, setFilePreview] = useState<string | null>(null);
    const [gpsLocation, setGpsLocation] = useState<string>('Obteniendo...');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
        resolver: zodResolver(evidenciaSchema),
        defaultValues: { tipo_evidencia: 'foto' }
    });

    const fetchODPsData = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data: ODP[] = res.data.filter((o: ODP) => o.estado_produccion === 'PROGRAMADA' || o.estado_produccion === 'LISTO_INSTALAR');

            setOdps(data);
        } catch (error) {
            console.error('Error', error);
            toast.error('Error al cargar órdenes de entrega');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchODPsData();
        // Simulate GPS
        setTimeout(() => {
            setGpsLocation('-12.046373, -77.042754');
        }, 1500);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setFilePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const onSubmitEvidencia = async (data: any) => {
        if (!filePreview || !fileInputRef.current?.files?.[0]) {
            toast.error('Debe adjuntar una foto o comprobante visual');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const file = fileInputRef.current.files[0];

            const formData = new FormData();
            formData.append('odp_id', String(selectedODP?.id));
            formData.append('tipo_evidencia', data.tipo_evidencia);
            formData.append('gps', gpsLocation || '');
            formData.append('datos_firmante', data.datos_firmante);
            formData.append('foto', file);

            // 1. Create evidencia & change estado internally
            await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/evidencias`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });

            toast.success('Entrega Registrada Vía GPS/Foto Exitosamente');
            setSelectedODP(null);
            setFilePreview(null);
            reset();
            fetchODPsData();

        } catch (error: any) {
            console.error('Error al subir evidencia:', error);
            const msg = error.response?.data?.error || 'Ocurrió un error en la sincronización';
            toast.error(msg);
        }
    };

    const filteredOdps = odps.filter(o =>
        o.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-[calc(100vh-64px)] bg-slate-100 flex flex-col md:p-6 p-0">
            <div className="bg-blue-600 px-6 py-8 md:rounded-2xl shadow-lg mb-6 flex-shrink-0">
                <h1 className="text-2xl font-bold text-white mb-2 font-display">Ruta de Entregas</h1>
                <p className="text-blue-100 text-sm">Carga las evidencias y cierra las ODPs in situ.</p>

                <div className="relative w-full max-w-md mt-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-300" />
                    <input
                        type="text"
                        placeholder="Buscar por ODP o cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border-none focus:outline-none focus:ring-4 focus:ring-blue-400/50 bg-white/10 text-white placeholder-blue-200 backdrop-blur-sm"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-0 pb-10 space-y-4 max-w-2xl mx-auto w-full">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-28 bg-white rounded-2xl animate-pulse shadow-sm border border-slate-200"></div>
                    ))
                ) : filteredOdps.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 border-dashed">
                        <CheckCircle2 className="w-16 h-16 text-emerald-300 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-slate-700">¡Todo entregado!</h3>
                        <p className="text-slate-500 mt-2">No tienes rutas pendientes por hoy.</p>
                    </div>
                ) : (
                    filteredOdps.map((odp, index) => (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05 }}
                            key={odp.id}
                            onClick={() => setSelectedODP(odp)}
                            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-300 hover:bg-blue-50/50 transition cursor-pointer group flex items-center justify-between"
                        >
                            <div>
                                <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded mb-2">
                                    Lista para Entregar
                                </span>
                                <h3 className="font-bold text-lg text-slate-800 leading-tight">
                                    {odp.cliente.nombre_razon_social}
                                </h3>
                                <p className="text-sm font-medium text-slate-500 font-mono mt-1">
                                    {odp.numero_odp} • {odp.items?.length || 0} pzas.
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-600 flex items-center justify-center transition-colors shadow-inner">
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white" />
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Modal Mobile-First Upload */}
            <AnimatePresence>
                {selectedODP && (
                    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-4">
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            className="bg-white w-full md:w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 relative shrink-0">
                                <div className="w-12 h-1.5 bg-slate-300 rounded-full absolute -top-3 left-1/2 -translate-x-1/2 md:hidden"></div>
                                <div>
                                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Reportar Entrega
                                    </h2>
                                    <p className="text-xs text-slate-500 font-mono font-medium">{selectedODP.numero_odp}</p>
                                </div>
                                <button onClick={() => { setSelectedODP(null); setFilePreview(null); }} className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <form id="evidencia-form" onSubmit={handleSubmit(onSubmitEvidencia)} className="space-y-6">

                                    {/* GPS Indicator */}
                                    <div className="bg-slate-100 p-3 rounded-xl flex items-center gap-3 border border-slate-200">
                                        <MapPin className="w-5 h-5 text-emerald-600" />
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-slate-500 uppercase">Geolocalización In-Situ</p>
                                            <p className="text-sm font-medium font-mono text-slate-800">{gpsLocation}</p>
                                        </div>
                                    </div>

                                    {/* Camera / Upload */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Evidencia Fotográfica *</label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            ref={fileInputRef}
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />

                                        {filePreview ? (
                                            <div className="relative w-full h-48 rounded-2xl overflow-hidden border-2 border-emerald-500 group">
                                                <img src={filePreview} alt="Preview" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white rounded-lg font-bold text-sm shadow-lg">Cambiar Foto</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full h-32 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 flex flex-col items-center justify-center text-slate-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition cursor-pointer"
                                            >
                                                <Camera className="w-8 h-8 mb-2" />
                                                <span className="text-sm font-medium">Pulsa para Tomar Foto</span>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Formato Evidencia</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition">
                                                <input type="radio" value="foto" {...register('tipo_evidencia')} className="w-4 h-4 text-blue-600" />
                                                <Camera className="w-4 h-4" /> <span className="text-sm font-medium">Foto Guía</span>
                                            </label>
                                            <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 transition">
                                                <input type="radio" value="firma" {...register('tipo_evidencia')} className="w-4 h-4 text-blue-600" />
                                                <FileSignature className="w-4 h-4" /> <span className="text-sm font-medium">Firma Digital</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Datos de Recepción (Nombre Completo y DNI) *</label>
                                        <div className="relative">
                                            <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                            <input
                                                {...register('datos_firmante')}
                                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                                                placeholder="Ej. Juan Pérez - 45689012"
                                            />
                                        </div>
                                        {errors.datos_firmante && <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.datos_firmante.message}</p>}
                                    </div>

                                </form>
                            </div>

                            <div className="p-4 border-t border-slate-100 bg-white shrink-0 shadow-lg">
                                <button
                                    type="submit"
                                    form="evidencia-form"
                                    disabled={isSubmitting}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    ) : (
                                        <><UploadCloud className="w-5 h-5" /> Subir y Cerrar ODP</>
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

export default EvidenciasPage;
