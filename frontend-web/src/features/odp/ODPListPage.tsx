import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { useDataChangedSocket } from '../../store/useSocketNotifications';
import { toast } from 'react-toastify';
import {
    Plus, Search, FileText, CheckCircle2, Clock, Truck, Eye, Trash2, Edit3,
    AlertCircle, Package, DollarSign, Ruler, Printer, MoreVertical,
    ChevronUp, ChevronDown, ChevronsUpDown, Filter, CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPForm from './components/ODPForm';
import ODPFichaModal from './components/ODPFichaModal';
import SAPModal from './components/SAPModal';
import COTModal from './components/COTModal';
import TMModal from './components/TMModal';

interface ODP {
    id: number;
    numero_odp: string;
    cliente: { nombre_razon_social: string };
    asesor: { nombre_completo: string };
    estado_produccion: string;
    estado_facturacion: string;
    estado_caja: string;
    fecha_creacion: string;
    fecha_entrega?: string;
    items: any[];
    valor_total?: number;
    abono?: number;
    pendiente?: number;
}

type SortField = 'numero_odp' | 'cliente' | 'asesor' | 'estado_produccion' | 'estado_caja' | 'fecha_entrega';
type SortDir = 'asc' | 'desc';

const ESTADOS_PRODUCCION = [
    'EN_ESPERA', 'VISITA_TECNICA', 'MEDICION', 'PEDIDO_PROVEEDOR',
    'ALUMINIO_CORTADO', 'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS',
    'LISTO_INSTALAR', 'PROGRAMADA', 'PAUSADA'
];

const ESTADOS_COMPLETADAS = ['ENTREGADA', 'INSTALADA'];

const getStatusColor = (estado: string) => {
    switch (estado) {
        case 'EN_ESPERA':           return 'bg-amber-50 text-amber-800 border-amber-300';
        case 'VISITA_TECNICA':      return 'bg-orange-100 text-orange-800 border-orange-300';
        case 'MEDICION':            return 'bg-sky-100 text-sky-800 border-sky-300';
        case 'PEDIDO_PROVEEDOR':    return 'bg-purple-100 text-purple-800 border-purple-300';
        case 'ALUMINIO_CORTADO':    return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'VIDRIO_RECIBIDO':     return 'bg-indigo-100 text-indigo-800 border-indigo-300';
        case 'ACCESORIOS_SEPARADOS':return 'bg-teal-100 text-teal-800 border-teal-300';
        case 'LISTO_INSTALAR':      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
        case 'PROGRAMADA':          return 'bg-amber-100 text-amber-800 border-amber-300';
        case 'INSTALADA':           return 'bg-green-100 text-green-800 border-green-300';
        case 'ENTREGADA':           return 'bg-gray-100 text-gray-700 border-gray-300';
        case 'PAUSADA':             return 'bg-rose-100 text-rose-800 border-rose-300';
        default:                    return 'bg-gray-100 text-gray-800 border-gray-200';
    }
};

const getStatusIcon = (estado: string) => {
    switch (estado) {
        case 'EN_ESPERA':           return <Clock className="w-3 h-3 mr-1 shrink-0" />;
        case 'VISITA_TECNICA':      return <Ruler className="w-3 h-3 mr-1 shrink-0" />;
        case 'MEDICION':            return <Ruler className="w-3 h-3 mr-1 shrink-0" />;
        case 'PEDIDO_PROVEEDOR':    return <Package className="w-3 h-3 mr-1 shrink-0" />;
        case 'ALUMINIO_CORTADO':    return <Clock className="w-3 h-3 mr-1 shrink-0" />;
        case 'VIDRIO_RECIBIDO':     return <Clock className="w-3 h-3 mr-1 shrink-0" />;
        case 'ACCESORIOS_SEPARADOS':return <Package className="w-3 h-3 mr-1 shrink-0" />;
        case 'LISTO_INSTALAR':      return <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" />;
        case 'PROGRAMADA':          return <Truck className="w-3 h-3 mr-1 shrink-0" />;
        case 'INSTALADA':           return <CheckSquare className="w-3 h-3 mr-1 shrink-0" />;
        case 'ENTREGADA':           return <CheckCircle2 className="w-3 h-3 mr-1 shrink-0" />;
        case 'PAUSADA':             return <AlertCircle className="w-3 h-3 mr-1 shrink-0" />;
        default:                    return null;
    }
};

const getCajaColor = (estado: string) => {
    switch (estado) {
        case 'CANCELADO':        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        case 'CREDITO_APROBADO': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
        case 'ABONADO':          return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'PENDIENTE':        return 'bg-rose-100 text-rose-800 border-rose-200';
        default:                 return 'bg-gray-100 text-gray-800 border-gray-200';
    }
};

// ─── Menú de acciones secundarias ─────────────────────────────────────────────
const ActionsMenu: React.FC<{
    odp: ODP;
    userRole: string;
    onSap: () => void;
    onCot: () => void;
    onTm: () => void;
    onVisita: () => void;
    onDelete: () => void;
}> = ({ odp, userRole, onSap, onCot, onTm, onVisita, onDelete }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const isAdmin = ['admin', 'gerencia'].includes(userRole);
    const isAsesor = ['admin', 'asesor_comercial', 'gerencia'].includes(userRole);
    const isJefe = ['admin', 'jefe_produccion', 'gerencia'].includes(userRole);

    const items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; show: boolean }[] = [
        { label: 'Solicitud Accesorios (SAP)', icon: <Package className="w-4 h-4" />, onClick: onSap, show: isAsesor },
        { label: 'Cotización (COT)',            icon: <DollarSign className="w-4 h-4" />, onClick: onCot, show: isAsesor },
        { label: 'Solicitar Visita Técnica',   icon: <Ruler className="w-4 h-4" />, onClick: onVisita, show: isAsesor && odp.estado_produccion === 'EN_ESPERA' },
        { label: 'Toma de Medidas (TM)',        icon: <Ruler className="w-4 h-4" />, onClick: onTm, show: isJefe },
        { label: 'Eliminar ODP',               icon: <Trash2 className="w-4 h-4" />, onClick: onDelete, danger: true, show: isAdmin && odp.estado_produccion !== 'ENTREGADA' },
    ].filter(i => i.show);

    if (items.length === 0) return null;

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="text-slate-400 hover:text-slate-700 transition p-1.5 hover:bg-slate-100 rounded"
                title="Más acciones"
            >
                <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-52 overflow-hidden"
                    >
                        {items.map((item, i) => (
                            <button
                                key={i}
                                onClick={() => { item.onClick(); setOpen(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition text-left
                                    ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Icono de ordenamiento ────────────────────────────────────────────────────
const SortIcon: React.FC<{ field: SortField; sortField: SortField; sortDir: SortDir }> = ({ field, sortField, sortDir }) => {
    if (sortField !== field) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-slate-300" />;
    return sortDir === 'asc'
        ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-blue-500" />
        : <ChevronDown className="w-3.5 h-3.5 ml-1 text-blue-500" />;
};

// ─── Página principal ─────────────────────────────────────────────────────────
const ODPListPage: React.FC = () => {
    const [odps, setOdps] = useState<ODP[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'activas' | 'visita' | 'listas' | 'completadas'>('activas');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedOdpDetail, setSelectedOdpDetail] = useState<number | null>(null);
    const [editingOdp, setEditingOdp] = useState<ODP | null>(null);
    const [deletingOdp, setDeletingOdp] = useState<ODP | null>(null);
    const [sapOdp, setSapOdp] = useState<ODP | null>(null);
    const [cotOdp, setCotOdp] = useState<ODP | null>(null);
    const [tmOdp, setTmOdp] = useState<ODP | null>(null);
    const [printOdp, setPrintOdp] = useState<ODP | null>(null);

    // Filtros
    const [filterAsesor, setFilterAsesor] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterMes, setFilterMes] = useState('');
    const [filterAnio, setFilterAnio] = useState('');

    // Ordenamiento
    const [sortField, setSortField] = useState<SortField>('fecha_entrega');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const user = useSelector((state: any) => state.auth.user);
    const userRole = (user?.rol || user?.role)?.toLowerCase() || '';

    const fetchODPs = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/odp`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setOdps(res.data);
        } catch (error) {
            console.error('Error fetching ODPs', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchODPs(); }, [fetchODPs]);
    useDataChangedSocket('odp', fetchODPs);

    const handleSolicitarVisita = async (odp: ODP) => {
        if (!window.confirm(`¿Solicitar visita técnica para ${odp.numero_odp}?`)) return;
        try {
            const tkn = localStorage.getItem('token');
            await axios.put(`${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api/odp/${odp.id}`,
                { estado_produccion: 'VISITA_TECNICA' },
                { headers: { Authorization: `Bearer ${tkn}` } }
            );
            toast.success(`${odp.numero_odp} — Visita técnica solicitada`);
            fetchODPs();
        } catch {
            toast.error('Error al solicitar visita técnica');
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
        } catch {
            toast.error('Error al eliminar ODP');
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    // Listas de asesores y años únicos para filtros
    const asesoresUnicos = Array.from(new Set(odps.map(o => o.asesor?.nombre_completo).filter(Boolean)));
    const aniosUnicos = Array.from(new Set(odps.map(o => o.fecha_entrega ? new Date(o.fecha_entrega).getFullYear() : null).filter(Boolean) as number[])).sort((a, b) => b - a);

    // Segmentación por tabs
    const ESTADOS_LISTAS = ['LISTO_INSTALAR', 'PROGRAMADA'];
    const odpsActivas = odps.filter(o => !['VISITA_TECNICA', ...ESTADOS_LISTAS, ...ESTADOS_COMPLETADAS].includes(o.estado_produccion));
    const odpsVisita = odps.filter(o => o.estado_produccion === 'VISITA_TECNICA');
    const odpsListas = odps.filter(o => ESTADOS_LISTAS.includes(o.estado_produccion));
    const odpsCompletadas = odps.filter(o => ESTADOS_COMPLETADAS.includes(o.estado_produccion));

    const tabBase = activeTab === 'visita' ? odpsVisita : activeTab === 'listas' ? odpsListas : activeTab === 'completadas' ? odpsCompletadas : odpsActivas;

    // Aplicar filtros
    const filtered = tabBase.filter(odp => {
        const matchSearch = odp.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) ||
            odp.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase());
        const matchAsesor = !filterAsesor || odp.asesor?.nombre_completo === filterAsesor;
        const matchEstado = !filterEstado || odp.estado_produccion === filterEstado;
        const fecha = new Date(odp.fecha_creacion);
        const fechaListo = odp.fecha_entrega ? new Date(odp.fecha_entrega) : null;
        const matchMes = !filterMes || (fechaListo && (fechaListo.getMonth() + 1) === parseInt(filterMes));
        const matchAnio = !filterAnio || (fechaListo && fechaListo.getFullYear() === parseInt(filterAnio));
        return matchSearch && matchAsesor && matchEstado && matchMes && matchAnio;
    });

    // Aplicar ordenamiento
    const sorted = [...filtered].sort((a, b) => {
        let valA: string = '';
        let valB: string = '';
        switch (sortField) {
            case 'numero_odp':       valA = a.numero_odp; valB = b.numero_odp; break;
            case 'cliente':          valA = a.cliente?.nombre_razon_social || ''; valB = b.cliente?.nombre_razon_social || ''; break;
            case 'asesor':           valA = a.asesor?.nombre_completo || ''; valB = b.asesor?.nombre_completo || ''; break;
            case 'estado_produccion':valA = a.estado_produccion; valB = b.estado_produccion; break;
            case 'estado_caja':      valA = a.estado_caja; valB = b.estado_caja; break;
            case 'fecha_entrega':    valA = a.fecha_entrega || ''; valB = b.fecha_entrega || ''; break;
        }
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    const hayFiltrosActivos = filterAsesor || filterEstado || filterMes || filterAnio;

    const thClass = "px-4 py-3 font-medium cursor-pointer select-none hover:bg-slate-100 transition";

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
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

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setActiveTab('activas')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition border ${activeTab === 'activas' ? 'bg-white border-slate-200 text-slate-800 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60'}`}
                >
                    <FileText className="w-4 h-4" />
                    Activas
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'activas' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{odpsActivas.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('visita')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition border ${activeTab === 'visita' ? 'bg-white border-orange-200 text-orange-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60'}`}
                >
                    <Ruler className="w-4 h-4" />
                    Visita Técnica
                    {odpsVisita.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-orange-100 text-orange-700">{odpsVisita.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('listas')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition border ${activeTab === 'listas' ? 'bg-white border-indigo-200 text-indigo-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60'}`}
                >
                    <Truck className="w-4 h-4" />
                    Listas para instalar
                    {odpsListas.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'listas' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{odpsListas.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('completadas')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition border ${activeTab === 'completadas' ? 'bg-white border-emerald-200 text-emerald-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/60'}`}
                >
                    <CheckCircle2 className="w-4 h-4" />
                    Completadas
                    {odpsCompletadas.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${activeTab === 'completadas' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{odpsCompletadas.length}</span>
                    )}
                </button>
            </div>

            <div className="glass-panel overflow-hidden">
                {/* Barra de búsqueda y filtros */}
                <div className="p-4 border-b border-slate-100 bg-white/50 space-y-3">
                    <div className="flex flex-wrap gap-3 items-center">
                        {/* Búsqueda */}
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por ODP o cliente..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                            />
                        </div>
                        {/* Filtro asesor */}
                        <select
                            value={filterAsesor}
                            onChange={e => setFilterAsesor(e.target.value)}
                            className="py-2 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-700 min-w-[160px]"
                        >
                            <option value="">Todos los asesores</option>
                            {asesoresUnicos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {/* Filtro estado */}
                        <select
                            value={filterEstado}
                            onChange={e => setFilterEstado(e.target.value)}
                            className="py-2 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-700 min-w-[160px]"
                        >
                            <option value="">Todos los estados</option>
                            {ESTADOS_PRODUCCION.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
                        </select>
                        {/* Filtro mes */}
                        <select
                            value={filterMes}
                            onChange={e => setFilterMes(e.target.value)}
                            className="py-2 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-700 min-w-[130px]"
                        >
                            <option value="">Todos los meses</option>
                            <option value="1">Enero</option>
                            <option value="2">Febrero</option>
                            <option value="3">Marzo</option>
                            <option value="4">Abril</option>
                            <option value="5">Mayo</option>
                            <option value="6">Junio</option>
                            <option value="7">Julio</option>
                            <option value="8">Agosto</option>
                            <option value="9">Septiembre</option>
                            <option value="10">Octubre</option>
                            <option value="11">Noviembre</option>
                            <option value="12">Diciembre</option>
                        </select>
                        {/* Filtro año */}
                        <select
                            value={filterAnio}
                            onChange={e => setFilterAnio(e.target.value)}
                            className="py-2 px-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm text-slate-700 min-w-[110px]"
                        >
                            <option value="">Todos los años</option>
                            {aniosUnicos.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {/* Limpiar filtros */}
                        {hayFiltrosActivos && (
                            <button
                                onClick={() => { setFilterAsesor(''); setFilterEstado(''); setFilterMes(''); setFilterAnio(''); }}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border border-slate-200 transition"
                            >
                                <Filter className="w-3.5 h-3.5" /> Limpiar filtros
                            </button>
                        )}
                    </div>
                    {sorted.length !== tabBase.length && (
                        <p className="text-xs text-slate-400 font-medium">
                            Mostrando <span className="font-bold text-slate-600">{sorted.length}</span> de <span className="font-bold text-slate-600">{tabBase.length}</span> órdenes
                        </p>
                    )}
                </div>

                {/* Tabla */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className={thClass} onClick={() => handleSort('numero_odp')}>
                                    <span className="flex items-center">Nº ODP <SortIcon field="numero_odp" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className={thClass} onClick={() => handleSort('cliente')}>
                                    <span className="flex items-center">Cliente <SortIcon field="cliente" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className={thClass} onClick={() => handleSort('asesor')}>
                                    <span className="flex items-center">Asesor <SortIcon field="asesor" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className={thClass} onClick={() => handleSort('estado_produccion')}>
                                    <span className="flex items-center">Estado Taller <SortIcon field="estado_produccion" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className={thClass} onClick={() => handleSort('estado_caja')}>
                                    <span className="flex items-center">Caja <SortIcon field="estado_caja" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Total</th>
                                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Abono</th>
                                <th className="px-4 py-3 font-medium text-right whitespace-nowrap">Restante</th>
                                <th className={thClass} onClick={() => handleSort('fecha_entrega')}>
                                    <span className="flex items-center">Listo Material <SortIcon field="fecha_entrega" sortField={sortField} sortDir={sortDir} /></span>
                                </th>
                                <th className="px-4 py-3 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white/30">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        {Array.from({ length: 10 }).map((__, i) => (
                                            <td key={i} className="px-4 py-4"><div className="h-4 bg-slate-200 rounded w-full"></div></td>
                                        ))}
                                    </tr>
                                ))
                            ) : sorted.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-slate-500">
                                        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                        No se encontraron órdenes de producción.
                                    </td>
                                </tr>
                            ) : (
                                sorted.map((odp, idx) => (
                                    <motion.tr
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        key={odp.id}
                                        className="hover:bg-slate-50/80 transition group"
                                    >
                                        {/* Nº ODP */}
                                        <td className="px-4 py-3 font-semibold text-blue-600 text-sm">
                                            <div className="flex items-center gap-1.5">
                                                {(odp as any).es_no_conformidad && (
                                                    <span className="text-[9px] font-black bg-amber-500 text-white px-1 py-0.5 rounded leading-none">NC</span>
                                                )}
                                                #{odp.numero_odp}
                                            </div>
                                        </td>
                                        {/* Cliente */}
                                        <td className="px-4 py-3 text-slate-700 font-medium text-sm max-w-[180px] truncate">
                                            {odp.cliente.nombre_razon_social}
                                        </td>
                                        {/* Asesor */}
                                        <td className="px-4 py-3 text-slate-500 text-sm">
                                            {odp.asesor.nombre_completo}
                                        </td>
                                        {/* Estado taller */}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(odp.estado_produccion)}`}>
                                                {getStatusIcon(odp.estado_produccion)}
                                                {odp.estado_produccion.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        {/* Caja */}
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getCajaColor(odp.estado_caja)}`}>
                                                {odp.estado_caja.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        {/* Total */}
                                        <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 whitespace-nowrap">
                                            {Number(odp.valor_total) > 0
                                                ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(odp.valor_total))
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                        {/* Abono */}
                                        <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700 whitespace-nowrap">
                                            {Number(odp.abono) > 0
                                                ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(odp.abono))
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                        {/* Restante */}
                                        <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                                            {(() => {
                                                const rest = Math.max(0, Number(odp.valor_total || 0) - Number(odp.abono || 0));
                                                return rest > 0
                                                    ? <span className="font-bold text-rose-600">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(rest)}</span>
                                                    : <span className="text-emerald-500 font-bold text-[10px] uppercase tracking-wide">Pagado</span>;
                                            })()}
                                        </td>
                                        {/* Listo Material */}
                                        <td className="px-4 py-3 text-xs font-mono">
                                            {odp.fecha_entrega
                                                ? <span className="text-slate-700 font-semibold">{new Date(odp.fecha_entrega).toLocaleDateString('es-CO')}</span>
                                                : <span className="text-slate-300">—</span>}
                                        </td>
                                        {/* Acciones */}
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end items-center gap-1">
                                                <button
                                                    onClick={() => setSelectedOdpDetail(odp.id)}
                                                    className="text-slate-400 hover:text-blue-600 transition p-1.5 hover:bg-blue-50 rounded"
                                                    title="Ver Ficha"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {userRole !== 'produccion' && odp.estado_produccion !== 'ENTREGADA' && (
                                                <button
                                                    onClick={() => setEditingOdp(odp)}
                                                    className="text-slate-400 hover:text-emerald-600 transition p-1.5 hover:bg-emerald-50 rounded"
                                                    title="Editar"
                                                >
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                )}
                                                {userRole !== 'produccion' && (
                                                <button
                                                    onClick={() => setPrintOdp(odp)}
                                                    className="text-slate-400 hover:text-slate-700 transition p-1.5 hover:bg-slate-100 rounded"
                                                    title="Imprimir"
                                                >
                                                    <Printer className="w-4 h-4" />
                                                </button>
                                                )}
                                                {userRole !== 'produccion' && (
                                                <ActionsMenu
                                                    odp={odp}
                                                    userRole={userRole}
                                                    onSap={() => setSapOdp(odp)}
                                                    onCot={() => setCotOdp(odp)}
                                                    onTm={() => setTmOdp(odp)}
                                                    onVisita={() => handleSolicitarVisita(odp)}
                                                    onDelete={() => setDeletingOdp(odp)}
                                                />
                                                )}
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modales */}
            <AnimatePresence>
                {(isFormOpen || editingOdp) && (
                    <ODPForm
                        odpToEdit={editingOdp}
                        onClose={() => { setIsFormOpen(false); setEditingOdp(null); }}
                        onSuccess={() => { setIsFormOpen(false); setEditingOdp(null); fetchODPs(); }}
                    />
                )}
                {selectedOdpDetail !== null && (
                    <ODPFichaModal odpId={selectedOdpDetail} onClose={() => setSelectedOdpDetail(null)} />
                )}
            </AnimatePresence>

            {sapOdp && <SAPModal odp={sapOdp} onClose={() => setSapOdp(null)} />}
            {cotOdp && <COTModal odp={cotOdp} onClose={() => setCotOdp(null)} />}
            {tmOdp && <TMModal odp={tmOdp} onClose={() => setTmOdp(null)} />}
            {printOdp && <ODPFichaModal odpId={printOdp.id} initialTab="imprimir" onClose={() => setPrintOdp(null)} />}

            {/* Modal eliminación */}
            <AnimatePresence>
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
                                    className="px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition shadow-sm"
                                >
                                    Sí, Eliminar ODP
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ODPListPage;
