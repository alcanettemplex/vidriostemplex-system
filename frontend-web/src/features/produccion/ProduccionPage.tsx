import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import { 
    CheckCircle2, 
    QrCode, 
    Ruler, 
    Scissors, 
    Layers, 
    Wrench,
    Truck,
    AlertCircle,
    Package,
    Lock,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    Plus,
    Sparkles,
    Film,
    Box,
    Archive,
    Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPMatrixModal from './components/ODPMatrixModal';

interface Nota {
    id: number;
    odp_id: number;
    texto: string;
    fecha: string;
    usuario: { nombre_completo: string };
}

interface ODP {
    id: number;
    numero_odp: string;
    estado_produccion: string;
    cliente: { nombre_razon_social: string };
    items: any[];
    fecha_creacion: string;
    fecha_entrega: string;
    matizado: boolean;
    pelicula: boolean;
    huacal: boolean;
    carton: boolean;
    proveedor_vidrio?: string;
    numero_pedido_proveedor?: string;
    chk_medicion: boolean;
    chk_corte: boolean;
    chk_vidrio: boolean;
    chk_accesorios: boolean;
    chk_ensamble: boolean;
    chk_matizado: boolean;
    chk_pelicula: boolean;
    chk_huacal: boolean;
    chk_carton: boolean;
    es_no_conformidad?: boolean;
    tiene_aluminio?: boolean;
    tomas_medidas?: { id: number; numero_tm: string; croquis_url: string | null }[];
    saps?: { id: number }[];
}

const activeStates = ['EN_ESPERA', 'MEDICION', 'PEDIDO_PROVEEDOR', 'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS', 'PAUSADA'];

const ProduccionPage: React.FC = () => {
    const [activeOdps, setActiveOdps] = useState<ODP[]>([]);
    const [readyOdps, setReadyOdps] = useState<ODP[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedOdpId, setExpandedOdpId] = useState<number | null>(null);
    const [selectedQR, setSelectedQR] = useState<string | null>(null);
    const [selectedODPDetail, setSelectedODPDetail] = useState<ODP | null>(null);
    
    // Filtros
    const [filterType, setFilterType] = useState<string>('TODAS'); // TODAS, URGENTES, PROVEEDOR, PELICULA, MATIZADO, HUACAL, CARTON, NC

    const [notes, setNotes] = useState<{ [key: number]: Nota[] }>({});
    const [newNote, setNewNote] = useState('');

    const fetchData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const data: ODP[] = res.data;
            const activas = data.filter(o => activeStates.includes(o.estado_produccion));
            const listas = data.filter(o => o.estado_produccion === 'LISTO_INSTALAR');

            setActiveOdps(activas);
            setReadyOdps(listas);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar pedidos de producción");
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const fetchNotes = async (odpId: number) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/notas-produccion/${odpId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotes(prev => ({ ...prev, [odpId]: res.data }));
        } catch (error) {
            console.error("Error fetching notes:", error);
        }
    };

    const handleAddNote = async (odpId: number) => {
        if (!newNote.trim()) return;
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/notas-produccion`, {
                odp_id: odpId,
                texto: newNote
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setNotes(prev => ({ ...prev, [odpId]: [res.data, ...(prev[odpId] || [])] }));
            setNewNote('');
            toast.success("Nota agregada");
        } catch (error) {
            toast.error("Error al agregar nota");
        }
    };

    const toggleCheck = async (odp: ODP, field: string) => {
        // Validación de dependencias de vidrio
        const dependsOnVidrio = ['chk_pelicula', 'chk_matizado', 'chk_huacal', 'chk_carton'];
        if (dependsOnVidrio.includes(field) && !odp.chk_vidrio) {
            toast.warning("Esta tarea requiere que el vidrio haya sido recibido primero.");
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const newValue = !(odp as any)[field];
            
            await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${odp.id}`, 
                { [field]: newValue }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );

            // Refrescar datos silenciosamente para captar cambios automáticos (como LISTO_INSTALAR)
            fetchData(true);
            toast.success("Proceso actualizado");
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Error al actualizar");
        }
    };

    const updateEstado = async (id: number, nuevoEstado: string) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp/${id}`, 
                { estado_produccion: nuevoEstado }, 
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchData();
        } catch (error) {
            toast.error("Error al actualizar estado");
        }
    };

    const getUrgency = (fecha: string) => {
        const hoy = new Date();
        const entrega = new Date(fecha);
        const diff = Math.ceil((entrega.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        if (diff <= 1) return { label: diff === 0 ? 'VENCE HOY' : (diff < 0 ? 'VENCIDA' : 'VENCE MAÑANA'), color: 'rose', weight: 3 };
        if (diff <= 3) return { label: `En ${diff} días`, color: 'orange', weight: 2 };
        return { label: `En ${diff} días`, color: 'emerald', weight: 1 };
    };

    const filteredOdps = activeOdps.filter(odp => {
        const matchesSearch = odp.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             odp.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!matchesSearch) return false;

        const urgency = getUrgency(odp.fecha_entrega);
        switch (filterType) {
            case 'URGENTES': return urgency.weight >= 2;
            case 'PROVEEDOR': return odp.numero_pedido_proveedor && odp.estado_produccion === 'PEDIDO_PROVEEDOR';
            case 'PELICULA': return odp.pelicula;
            case 'MATIZADO': return odp.matizado;
            case 'HUACAL': return odp.huacal;
            case 'CARTON': return odp.carton;
            case 'NC': return odp.es_no_conformidad;
            default: return true;
        }
    }).sort((a, b) => new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime());

    const renderCheckItem = (odp: ODP, field: string, label: string, Icon: any, isAlwaysShown = false) => {
        const fieldName = (field.startsWith('chk_') ? field : `chk_${field}`) as keyof ODP;
        const isApplicable = isAlwaysShown || (odp as any)[field.replace('chk_', '')];
        
        if (!isApplicable) return null;

        const checked = !!odp[fieldName as keyof ODP];
        const dependsOnVidrio = ['chk_pelicula', 'chk_matizado', 'chk_huacal', 'chk_carton'].includes(fieldName);
        const isLocked = dependsOnVidrio && !odp.chk_vidrio;

        return (
            <div 
                key={field}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer select-none
                    ${checked ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 
                      isLocked ? 'bg-slate-50 border-slate-100 text-slate-300 opacity-50 cursor-not-allowed' : 
                      'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-slate-50'}`}
                onClick={() => !isLocked && toggleCheck(odp, fieldName)}
            >
                <div className="relative">
                    <Icon className={`w-6 h-6 mb-1 ${checked ? 'text-emerald-500' : isLocked ? 'text-slate-300' : 'text-slate-400'}`} />
                    {isLocked && <Lock className="w-3 h-3 absolute -top-1 -right-1 text-rose-400" />}
                    {checked && !isLocked && <CheckCircle2 className="w-4 h-4 absolute -bottom-1 -right-1 text-emerald-500 bg-white rounded-full" />}
                </div>
                <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none">{label}</span>
            </div>
        );
    };

    if (loading) return <div className="p-8 text-center text-slate-500 font-bold loading-pulse">Cargando Tablero de Taller...</div>;

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 text-slate-900">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <Wrench className="w-8 h-8 text-indigo-600" />
                        Control de Taller
                    </h1>
                    <p className="text-slate-500 font-medium font-sans">Gestión dinámica de producción y bitácora</p>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200">
                   <div className="px-4 py-2 text-center border-r border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activas</p>
                       <p className="text-xl font-black text-indigo-600 leading-none">{activeOdps.length}</p>
                   </div>
                   <div className="px-4 py-2 text-center border-r border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Urgentes</p>
                       <p className="text-xl font-black text-rose-600 leading-none">{activeOdps.filter(o => getUrgency(o.fecha_entrega).weight >= 2).length}</p>
                   </div>
                   <div className="px-4 py-2 text-center">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Listas</p>
                       <p className="text-xl font-black text-emerald-600 leading-none">{readyOdps.length}</p>
                   </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por ODP o Cliente..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-sm bg-slate-50/30"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto no-scrollbar">
                        {[
                            { id: 'TODAS', label: 'Todas', icon: null },
                            { id: 'URGENTES', label: 'Urgentes', icon: AlertCircle, color: ' rose' },
                            { id: 'PELICULA', label: 'Película', icon: Film },
                            { id: 'HUACAL', label: 'Huacal', icon: Box },
                            { id: 'NC', label: 'NC', icon: AlertCircle, color: 'rose' }
                        ].map(f => (
                            <button
                                key={f.id}
                                onClick={() => setFilterType(f.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-2 transition-all
                                    ${filterType === f.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                            >
                                {f.icon && <f.icon className="w-3.5 h-3.5" />}
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Lista Scrollable */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center bg-stripes-slate">
                    <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-500" />
                        Línea de Producción ({filteredOdps.length})
                    </h2>
                </div>

                <div className="max-h-[700px] overflow-y-auto overflow-x-hidden divide-y divide-slate-100 custom-scrollbar">
                    {filteredOdps.length === 0 ? (
                        <div className="p-12 text-center">
                            <CheckCircle2 className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                            <p className="text-slate-400 font-bold">No hay órdenes que coincidan con los filtros.</p>
                        </div>
                    ) : (
                        filteredOdps.map(odp => {
                            const urgency = getUrgency(odp.fecha_entrega);
                            const isExpanded = expandedOdpId === odp.id;
                            
                            // Calcular progreso dinámico
                            const fields: string[] = [];
                            if (odp.tomas_medidas?.length) fields.push('chk_medicion');
                            if (odp.tiene_aluminio) { fields.push('chk_corte'); fields.push('chk_ensamble'); }
                            if (odp.items?.length) fields.push('chk_vidrio');
                            if (odp.saps?.length) fields.push('chk_accesorios');
                            if (odp.matizado) fields.push('chk_matizado');
                            if (odp.pelicula) fields.push('chk_pelicula');
                            if (odp.huacal) fields.push('chk_huacal');
                            if (odp.carton) fields.push('chk_carton');
                            
                            const done = fields.filter(f => (odp as any)[f]).length;
                            const progress = (done / fields.length) * 100;

                            const missingTasks = fields.filter(f => !(odp as any)[f])
                                .map(f => f.replace('chk_', '').toUpperCase());

                            return (
                                <div key={odp.id} className={`transition-all ${isExpanded ? 'bg-indigo-50/20' : 'hover:bg-slate-50/50'}`}>
                                    {/* Fila Colapsada */}
                                    <div 
                                        className={`flex flex-col md:flex-row items-center gap-4 p-4 cursor-pointer border-l-4 ${urgency.color === 'rose' ? 'border-rose-500' : urgency.color === 'orange' ? 'border-orange-500' : 'border-emerald-500'}`}
                                        onClick={() => {
                                            if (isExpanded) setExpandedOdpId(null);
                                            else {
                                                setExpandedOdpId(odp.id);
                                                fetchNotes(odp.id);
                                            }
                                        }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                                                    {odp.numero_odp}
                                                </span>
                                                {odp.es_no_conformidad && (
                                                    <span className="text-[10px] font-black bg-rose-500 text-white px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                                                        REPROCESO
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg
                                                    ${urgency.color === 'rose' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 
                                                      urgency.color === 'orange' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 
                                                      'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                                                    {urgency.label}
                                                </span>
                                            </div>
                                            <h3 className="text-base font-bold text-slate-800 truncate">{odp.cliente.nombre_razon_social}</h3>
                                        </div>

                                        <div className="hidden lg:block flex-1 max-w-xs">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                                                <span>Progreso:</span>
                                                <span className="text-indigo-600">{Math.round(progress)}%</span>
                                            </p>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                                                    className={`h-full ${urgency.color === 'rose' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                                />
                                            </div>
                                            <p className="text-[9px] font-medium text-slate-400 mt-1 truncate">
                                                Falta: {missingTasks.length > 0 ? missingTasks.join(' · ') : 'NADA'}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex -space-x-1.5 h-6">
                                                {fields.slice(0, 5).map(f => (
                                                    <div key={f} className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black
                                                        ${(odp as any)[f] ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                        {f.charAt(4).toUpperCase()}
                                                    </div>
                                                ))}
                                                {fields.length > 5 && (
                                                    <div className="w-6 h-6 rounded-full border-2 border-white bg-indigo-100 text-indigo-600 flex items-center justify-center text-[8px] font-black">
                                                        +{fields.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                            {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                        </div>
                                    </div>

                                    {/* Vista Expandida */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div 
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden bg-white/50 border-t border-slate-100"
                                            >
                                                <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-8">
                                                    {/* Col 1: Checks & Info Técnica */}
                                                    <div className="xl:col-span-7 space-y-6">
                                                        <div>
                                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Checklist de Requisitos</h4>
                                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                                                {odp.tomas_medidas && odp.tomas_medidas.length > 0 && (() => {
                                                                    const tm = odp.tomas_medidas?.find(t => t.croquis_url);
                                                                    const checked = odp.chk_medicion;
                                                                    return (
                                                                        <div
                                                                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all select-none
                                                                                ${checked ? 'bg-emerald-50 border-emerald-500 text-emerald-700 cursor-default' : 'bg-white border-slate-200 text-slate-500 cursor-pointer hover:border-indigo-300 hover:bg-slate-50'}`}
                                                                            onClick={() => !checked && toggleCheck(odp, 'chk_medicion')}
                                                                        >
                                                                            <div className="relative">
                                                                                <Ruler className={`w-6 h-6 mb-1 ${checked ? 'text-emerald-500' : 'text-slate-400'}`} />
                                                                                {checked && <CheckCircle2 className="w-4 h-4 absolute -bottom-1 -right-1 text-emerald-500 bg-white rounded-full" />}
                                                                            </div>
                                                                            <span className="text-[10px] font-black uppercase tracking-tight text-center leading-none">Medición</span>
                                                                            {tm && <span className="text-[9px] font-bold text-emerald-600 mt-0.5 leading-none">{tm.numero_tm}</span>}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {odp.tiene_aluminio && renderCheckItem(odp, 'chk_corte', 'Aluminio', Scissors, true)}
                                                                {odp.items?.length > 0 && renderCheckItem(odp, 'chk_vidrio', 'Vidrio', Layers, true)}
                                                                {!!odp.saps?.length && renderCheckItem(odp, 'chk_accesorios', 'Herrajes', Package, true)}
                                                                {odp.tiene_aluminio && renderCheckItem(odp, 'chk_ensamble', 'Ensamble', Wrench, true)}
                                                                {renderCheckItem(odp, 'chk_matizado', 'Matizado', Sparkles)}
                                                                {renderCheckItem(odp, 'chk_pelicula', 'Película', Film)}
                                                                {renderCheckItem(odp, 'chk_huacal', 'Huacal', Box)}
                                                                {renderCheckItem(odp, 'chk_carton', 'Cartón', Archive)}
                                                            </div>
                                                        </div>

                                                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                                                                <span>Detalle de Cristales</span>
                                                                <button onClick={() => setSelectedODPDetail(odp)} className="text-indigo-600 hover:text-indigo-700 font-black text-[10px] uppercase">Ver Ficha Completa →</button>
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {odp.items?.map((item, i) => (
                                                                    <div key={i} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50">
                                                                        <span className="font-bold text-slate-700">{item.cantidad}x <span className="font-medium">{item.tipo_vidrio} {item.espesor}mm</span></span>
                                                                        <span className="text-slate-500 font-mono">{item.ancho_mm} x {item.alto_mm}</span>
                                                                    </div>
                                                                ))}
                                                                {(!odp.items || odp.items.length === 0) && <p className="text-xs text-slate-400 italic font-sans">No hay ítems registrados.</p>}
                                                            </div>
                                                            {odp.numero_pedido_proveedor && (
                                                                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="bg-amber-50 p-1.5 rounded-lg">
                                                                           <Truck className="w-3.5 h-3.5 text-amber-600" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-[9px] font-black text-slate-400 uppercase">Proveedor: {odp.proveedor_vidrio}</p>
                                                                            <p className="text-xs font-bold text-slate-700 font-sans">Pedido #{odp.numero_pedido_proveedor}</p>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase
                                                                        ${odp.chk_vidrio ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 anim-pulse'}`}>
                                                                        {odp.chk_vidrio ? 'Recibido ✅' : 'En Camino 🚚'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Col 2: Bitácora */}
                                                    <div className="xl:col-span-5 flex flex-col h-full bg-slate-50/50 rounded-2xl border border-slate-200 p-4">
                                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                            <MessageSquare className="w-3.5 h-3.5" />
                                                            Bitácora del Taller
                                                        </h4>
                                                        
                                                        <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 mb-4 pr-1 scrolly">
                                                            {(notes[odp.id]?.length || 0) === 0 ? (
                                                                <p className="text-center text-xs text-slate-400 mt-8 italic font-sans">No hay notas registradas para esta ODP.</p>
                                                            ) : (
                                                                notes[odp.id].map(n => (
                                                                    <div key={n.id} className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                                                                        <p className="text-xs text-slate-700 font-medium font-sans mb-1">{n.texto}</p>
                                                                        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                                                            <span>{n.usuario.nombre_completo}</span>
                                                                            <span>{new Date(n.fecha).toLocaleDateString()} {new Date(n.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>

                                                        <div className="relative">
                                                            <textarea 
                                                                rows={2}
                                                                className="w-full p-3 pr-10 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 resize-none font-medium font-sans bg-white"
                                                                placeholder="Agregar una nota técnica..."
                                                                value={newNote}
                                                                onChange={(e) => setNewNote(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        handleAddNote(odp.id);
                                                                    }
                                                                }}
                                                            />
                                                            <button 
                                                                onClick={() => handleAddNote(odp.id)}
                                                                className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* SECCIÓN 2: LISTAS PARA DESPACHO */}
            {readyOdps.length > 0 && (
                <div className="bg-emerald-50 rounded-3xl border-2 border-emerald-100 overflow-hidden shadow-xl mt-8">
                    <div className="bg-emerald-500/10 px-6 py-5 border-b border-emerald-100 flex items-center justify-between">
                        <h2 className="text-xl font-black text-emerald-800 flex items-center gap-3">
                            <Truck className="w-6 h-6" />
                            Zona de Despacho e Instalación
                        </h2>
                        <span className="bg-emerald-500 text-white font-black px-4 py-1.5 rounded-full text-xs shadow-lg shadow-emerald-100">
                            {readyOdps.length} ÓRDENES LISTAS ✅
                        </span>
                    </div>
                    <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {readyOdps.map(odp => (
                            <div key={odp.id} className="bg-white border-2 border-emerald-100 p-5 rounded-3xl shadow-sm hover:shadow-xl transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <span className="font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl text-sm border border-emerald-100">
                                        {odp.numero_odp}
                                    </span>
                                    <button 
                                        onClick={() => setSelectedQR(odp.numero_odp)}
                                        className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                    >
                                        <QrCode className="w-5 h-5" />
                                    </button>
                                </div>
                                <h3 className="text-base font-black text-slate-800 mb-6 truncate font-sans">{odp.cliente.nombre_razon_social}</h3>
                                
                                <div className="space-y-2">
                                   <button 
                                      className="w-full text-xs font-black text-white bg-indigo-600 py-3 rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                                      onClick={() => updateEstado(odp.id, 'PROGRAMADA')}
                                   >
                                      PROGRAMAR RUTA
                                   </button>
                                   <button 
                                      className="w-full text-[10px] font-black text-slate-400 bg-slate-50 py-2 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all uppercase tracking-widest"
                                      onClick={() => updateEstado(odp.id, 'EN_ESPERA')}
                                   >
                                      Devolver a Taller
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
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white rounded-[32px] shadow-2xl overflow-hidden max-w-sm w-full border border-slate-100"
                        >
                            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 text-center text-white">
                                <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                    <QrCode className="w-8 h-8" />
                                </div>
                                <h3 className="font-black text-2xl tracking-tight">Etiqueta de ODP</h3>
                                <p className="text-indigo-100 text-sm mt-1 font-sans">Identificador de producción</p>
                            </div>
                            <div className="p-10 flex flex-col items-center justify-center">
                                <div className="bg-white p-6 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100">
                                    <QRCodeSVG 
                                        value={`${process.env.REACT_APP_URL || window.location.origin}/odp-search?q=${selectedQR}`} 
                                        size={180} 
                                        bgColor={"#ffffff"}
                                        fgColor={"#1e293b"}
                                        level={"Q"}
                                    />
                                </div>
                                <p className="mt-8 text-3xl font-black text-indigo-900 tracking-[0.2em] bg-indigo-50 px-8 py-3 rounded-2xl border border-indigo-100">{selectedQR}</p>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button
                                    onClick={() => setSelectedQR(null)}
                                    className="flex-1 px-6 py-4 font-black text-slate-500 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cerrar
                                </button>
                                <button className="flex-1 px-6 py-4 font-black text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase text-xs tracking-widest active:scale-95 font-sans">
                                    Imprimir
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {selectedODPDetail && (
                <ODPMatrixModal 
                    onClose={() => setSelectedODPDetail(null)}
                    odp={selectedODPDetail}
                />
            )}

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
                .scrolly::-webkit-scrollbar { width: 4px; }
                .scrolly::-webkit-scrollbar-track { background: transparent; }
                .scrolly::-webkit-scrollbar-thumb { background: #f1f5f9; border-radius: 10px; }
                .anim-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            `}</style>
        </div>
    );
};

export default ProduccionPage;
