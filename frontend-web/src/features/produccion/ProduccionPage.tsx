import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { 
    CheckCircle2, 
    QrCode, 
    FileText, 
    Ruler, 
    Scissors, 
    Layers, 
    Wrench,
    Clock,
    Truck,
    AlertCircle,
    Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPMatrixModal from './components/ODPMatrixModal';

interface ODP {
    id: number;
    numero_odp: string;
    estado_produccion: string;
    cliente: { nombre_razon_social: string };
    items: any[];
    chk_medicion: boolean;
    chk_corte: boolean;
    chk_vidrio: boolean;
    chk_accesorios: boolean;
    fecha_entrega: string;
}

const ProduccionPage: React.FC = () => {
    const [activeOdps, setActiveOdps] = useState<ODP[]>([]);
    const [readyOdps, setReadyOdps] = useState<ODP[]>([]);
    const [selectedQR, setSelectedQR] = useState<string | null>(null);
    const [selectedODPDetail, setSelectedODPDetail] = useState<ODP | null>(null);
    const [loading, setLoading] = useState(true);

    const activeStates = ['EN_ESPERA', 'MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS'];

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const data: ODP[] = res.data;

            // Filtrar ODPs activas (en proceso de ensamblaje)
            const activas = data.filter(o => activeStates.includes(o.estado_produccion));
            // Filtrar ODPs listas para despacho/instalacion
            const listas = data.filter(o => o.estado_produccion === 'LISTO_INSTALAR');

            setActiveOdps(activas);
            setReadyOdps(listas);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar pedidos de producción");
            // Fallbacks for testing
            setActiveOdps([
                { id: 991, numero_odp: 'ODP-2026-991', estado_produccion: 'EN_ESPERA', cliente: { nombre_razon_social: 'Cliente Demo' }, items: [], chk_medicion: true, chk_corte: false, chk_vidrio: false, chk_accesorios: false, fecha_entrega: new Date().toISOString() }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const toggleCheck = async (odp: ODP, field: keyof ODP) => {
        try {
            const token = localStorage.getItem('token');
            const newValue = !odp[field];
            
            // UI Optimistic Update
            const updatedOdps = activeOdps.map(o => {
                if(o.id === odp.id) {
                    return { ...o, [field]: newValue };
                }
                return o;
            });
            setActiveOdps(updatedOdps);

            // API Call
            await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${odp.id}`, 
                { [field]: newValue }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Automáticamente avanzar el estado general para ayudar al backend legacy viejo
            if (field === 'chk_medicion' && newValue) await updateEstado(odp.id, 'MEDICION', false);
            if (field === 'chk_corte' && newValue) await updateEstado(odp.id, 'ALUMINIO_CORTADO', false);
            if (field === 'chk_vidrio' && newValue) await updateEstado(odp.id, 'VIDRIO_RECIBIDO', false);
            if (field === 'chk_accesorios' && newValue) await updateEstado(odp.id, 'ACCESORIOS_SEPARADOS', false);

        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar proceso");
            fetchData(); // Rollback local state
        }
    };

    const updateEstado = async (id: number, nuevoEstado: string, doFetch = true) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${id}`, 
                { estado_produccion: nuevoEstado }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (doFetch) fetchData();
        } catch (error) {
            console.error(error);
        }
    };

    const markAsReadyToInstall = async (odp: ODP) => {
        toast.success(`ODP ${odp.numero_odp} marcado como Listo para Instalar!`);
        await updateEstado(odp.id, 'LISTO_INSTALAR');
    };

    const renderProgressCircle = (checked: boolean, icon: React.ReactNode, label: string, onClick: () => void) => {
        return (
            <button 
                onClick={onClick}
                className={`flex flex-col items-center gap-2 group transition-all transform hover:scale-105`}
            >
                <div className={`relative w-14 h-14 rounded-full flex items-center justify-center border-4 border-white shadow-md transition-colors duration-300 z-10 
                    ${checked 
                        ? 'bg-emerald-500 text-white shadow-emerald-200' 
                        : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:shadow-slate-300'}`
                }>
                    {icon}
                    {checked && (
                       <div className="absolute -bottom-1 -right-1 bg-white rounded-full">
                         <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                       </div>
                    )}
                </div>
                <span className={`text-[11px] font-bold ${checked ? 'text-emerald-700' : 'text-slate-500 uppercase tracking-widest'}`}>{label}</span>
            </button>
        );
    };

    if (loading) return <div className="p-8 text-center text-slate-500 font-bold loading-pulse">Cargando Tablero de Producción...</div>;

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Panel de Ensamblaje</h1>
                    <p className="text-slate-500 font-medium">Línea de producción activa (Matriz Multi-estado)</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-emerald-50 px-4 py-2 border border-emerald-100 rounded-lg shadow-sm flex items-center gap-3">
                        <Truck className="w-5 h-5 text-emerald-600" />
                        <div>
                           <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Despachos Listos</p>
                           <p className="text-xl text-emerald-800 font-extrabold leading-none">{readyOdps.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: FÁBRICA ACTIVA */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-stripes-slate">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-indigo-500" />
                        Tablero Central ODPs en Curso ({activeOdps.length})
                    </h2>
                </div>
                
                <div className="divide-y divide-slate-100">
                    {activeOdps.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            <CheckCircle2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                            <p className="text-lg font-bold">Línea de producción despejada.</p>
                            <p className="text-sm">No hay órdenes pendientes en este momento.</p>
                        </div>
                    ) : activeOdps.map(odp => {
                        const scoreCheck = (odp.chk_medicion ? 1 : 0) + (odp.chk_corte ? 1 : 0) + (odp.chk_vidrio ? 1 : 0) + (odp.chk_accesorios ? 1 : 0);
                        const progress = (scoreCheck / 4) * 100;
                        const isReady = scoreCheck === 4;

                        return (
                            <motion.div 
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                key={odp.id} 
                                className={`p-6 transition-all relative overflow-hidden group hover:bg-slate-50 ${isReady ? 'bg-emerald-50/30' : ''}`}
                            >
                                {/* Barra de Progreso Fondo */}
                                <div className="absolute top-0 left-0 h-1 bg-slate-100 w-full">
                                    <div 
                                        className={`h-full transition-all duration-1000 ${isReady ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>

                                <div className="flex flex-col xl:flex-row items-center gap-8 relative z-10 w-full justify-between">
                                    
                                    {/* INFO IZQUIERDA */}
                                    <div className="flex-1 w-full xl:w-auto">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md text-sm cursor-pointer hover:bg-indigo-100 transition-colors"
                                                  onClick={() => setSelectedODPDetail(odp)}>
                                                {odp.numero_odp}
                                            </span>
                                            {progress < 100 && (
                                                <span className="text-xs font-bold text-slate-500 flex items-center gap-1 border border-slate-200 px-2 py-0.5 rounded-full">
                                                    <Clock className="w-3 h-3" />
                                                    {progress}% Ensamblado
                                                </span>
                                            )}
                                            {isReady && (
                                                <span className="text-xs font-bold text-white bg-emerald-500 flex items-center gap-1 px-3 py-0.5 rounded-full shadow-sm animate-pulse">
                                                    COMPLETADO
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800 tracking-tight">{odp.cliente.nombre_razon_social}</h3>
                                        
                                        <div className="flex gap-2 mt-4">
                                            <button 
                                                onClick={() => setSelectedODPDetail(odp)}
                                                className="p-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors tooltip"
                                                title="Ver Detalle Técnico"
                                            >
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => setSelectedQR(odp.numero_odp)}
                                                className="p-2 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors tooltip"
                                                title="Generar Etiqueta QR"
                                            >
                                                <QrCode className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* EL PUENTE AÉREO / SWITCHES MATRIZ */}
                                    <div className="flex items-center justify-center gap-4 md:gap-8 w-full xl:w-auto mt-6 xl:mt-0 relative px-4">
                                        {/* Línea conectora gráfica detrás de los botones */}
                                        <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-200 -translate-y-4 rounded-full hidden md:block z-0" />
                                        
                                        {renderProgressCircle(odp.chk_medicion, <Ruler className="w-6 h-6" />, 'Medición', () => toggleCheck(odp, 'chk_medicion'))}
                                        {renderProgressCircle(odp.chk_corte, <Scissors className="w-6 h-6" />, 'Aluminio', () => toggleCheck(odp, 'chk_corte'))}
                                        {renderProgressCircle(odp.chk_vidrio, <Layers className="w-6 h-6" />, 'Vidrios', () => toggleCheck(odp, 'chk_vidrio'))}
                                        {renderProgressCircle(odp.chk_accesorios, <Package className="w-6 h-6" />, 'Herrajes', () => toggleCheck(odp, 'chk_accesorios'))}
                                    </div>

                                    {/* BOTÓN FINAL DE LISTO */}
                                    <div className="w-full xl:w-48 flex justify-end xl:justify-center mt-6 xl:mt-0">
                                        <AnimatePresence>
                                            {isReady ? (
                                                <motion.button
                                                    initial={{ scale: 0.8, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0.8, opacity: 0 }}
                                                    onClick={() => markAsReadyToInstall(odp)}
                                                    className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-600 hover:to-teal-500 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-200 transition-all hover:-translate-y-1 flex flex-col items-center justify-center gap-1 border border-emerald-400"
                                                >
                                                    <CheckCircle2 className="w-6 h-6 mb-1" />
                                                    MARCAR LISTO
                                                    <span className="text-[10px] font-medium opacity-80 block uppercase tracking-wider">Mandar a Despacho</span>
                                                </motion.button>
                                            ) : (
                                                <div className="w-full h-full min-h-[80px] border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-slate-50/50 text-slate-400 font-bold text-sm text-center px-4">
                                                    Completa las 4 fases para finalizar.
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* SECCIÓN 2: LISTAS PARA DESPACHO */}
            {readyOdps.length > 0 && (
                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 overflow-hidden shadow-sm mt-8">
                    <div className="bg-emerald-100 px-6 py-4 border-b border-emerald-200 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-emerald-800 flex items-center gap-2">
                            <Truck className="w-5 h-5" />
                            Zona de Despacho e Instalación
                        </h2>
                        <span className="bg-emerald-200 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs">
                            {readyOdps.length} Órdenes Listas
                        </span>
                    </div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {readyOdps.map(odp => (
                            <div key={odp.id} className="bg-white border border-emerald-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-sm border border-emerald-100">
                                        {odp.numero_odp}
                                    </span>
                                    <QrCode 
                                        className="w-5 h-5 text-emerald-600 cursor-pointer hover:text-emerald-800"
                                        onClick={() => setSelectedQR(odp.numero_odp)}
                                    />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 mb-4 truncate">{odp.cliente.nombre_razon_social}</h3>
                                
                                <div className="flex gap-2 w-full mt-auto">
                                   <button 
                                      className="flex-1 text-xs font-bold text-emerald-600 bg-emerald-50 p-2 rounded text-center hover:bg-emerald-100"
                                      onClick={() => updateEstado(odp.id, 'EN_ESPERA')}
                                   >
                                      Devolver a Taller
                                   </button>
                                   <button 
                                      className="flex-1 text-xs font-bold text-white bg-indigo-600 p-2 rounded text-center hover:bg-indigo-700 shadow-sm"
                                      onClick={() => updateEstado(odp.id, 'PROGRAMADA')}
                                   >
                                      Programar Ruta
                                   </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* Modals */}
            <AnimatePresence>
                {selectedQR && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-sm w-full border border-slate-100"
                        >
                            <div className="bg-indigo-600 p-4 text-center">
                                <h3 className="text-white font-bold text-lg">Etiqueta Identificadora</h3>
                                <p className="text-indigo-200 text-sm">Escanea para abrir desde el móvil</p>
                            </div>
                            <div className="p-8 flex flex-col items-center justify-center">
                                <div className="bg-white p-4 rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.05)] border border-slate-100">
                                    <QRCodeSVG 
                                        value={`${process.env.REACT_APP_URL || window.location.origin}/odp-search?q=${selectedQR}`} 
                                        size={200} 
                                        bgColor={"#ffffff"}
                                        fgColor={"#1e293b"}
                                        level={"Q"}
                                    />
                                </div>
                                <p className="mt-6 text-2xl font-black text-slate-800 tracking-widest bg-slate-100 px-6 py-2 rounded-lg">{selectedQR}</p>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button
                                    onClick={() => setSelectedQR(null)}
                                    className="flex-1 px-4 py-2 font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Cerrar
                                </button>
                                <button className="flex-1 px-4 py-2 font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200">
                                    Imprimir
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Matrix Detalle Modal Mantenido Abierto a la creatividad futura */}
            {selectedODPDetail && (
                <ODPMatrixModal 
                    onClose={() => setSelectedODPDetail(null)}
                    odp={selectedODPDetail}
                />
            )}
        </div>
    );
};

export default ProduccionPage;
