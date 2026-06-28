import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-toastify';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import FolderTabs from '../../components/FolderTabs';
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
    Plus,
    Sparkles,
    Film,
    Box,
    Archive,
    Search,
    X,
    ShoppingCart,
    ClipboardList,
    Loader2,
    Calendar,
    Clock,
    AlertTriangle,
    Inbox,
    PackageCheck,
    ShieldCheck,
    TriangleAlert,
    MessageCircle,
    PauseCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ODPMatrixModal from './components/ODPMatrixModal';
import PrintableSAP from '../odp/components/PrintableSAP';
import ProgramacionWhatsAppModal from './components/ProgramacionWhatsAppModal';

interface Nota {
    id: number;
    odp_id: number;
    texto: string;
    fecha: string;
    usuario: { nombre_completo: string };
}

interface PedidoPVDetalle {
    id: number;
    numero_pedido: string;
    proveedor: string;
    estado: 'PENDIENTE' | 'ENVIADO' | 'CONFIRMADO_PROVEEDOR' | 'LLEGADO' | 'VERIFICADO' | 'PROBLEMA';
    fecha_envio: string | null;
    fecha_entrega_prometida: string | null;
    fecha_llegada_real: string | null;
    dias_diferencia: number | null;
    observaciones: string | null;
    tuvo_problema: boolean;
}

interface ODCDetalle {
    id: number;
    numero_odc: string;
    proveedor: string;
    tipo: 'perfileria' | 'vidrio';
    estado: string;
    fecha_creacion: string;
    fecha_recepcion: string | null;
}

interface SAPDetalle {
    id: number;
    numero_sap: string;
    estado: 'borrador' | 'enviada' | 'aprobada';
    fecha_creacion: string;
    ordenes_compra: ODCDetalle[];
}

interface ODPDetalle {
    pedidos_pv: PedidoPVDetalle[];
    saps: SAPDetalle[];
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
    es_garantia?: boolean;
    tiene_aluminio?: boolean;
    tomas_medidas?: { id: number; numero_tm: string; croquis_url: string | null }[];
    saps?: { id: number }[];
    instalacion?: boolean;
    acarreo?: boolean;
    forma_pago?: string;
    estado_caja?: string;
    tipo_odp?: string;
    color_taller?: string | null;
    odp_padre_id?: number | null;
}

const activeStates = [
    'EN_ESPERA', 'VISITA_TECNICA',
    'MEDICION', 'ALUMINIO_CORTADO',
    'VIDRIO_RECIBIDO', 'ACCESORIOS_SEPARADOS'
];

const ESTADOS_NC_ACTIVOS = [...activeStates];

const ESTADO_ORDEN: Record<string, number> = {
    EN_ESPERA: 0, VISITA_TECNICA: 1, MEDICION: 2,
    ALUMINIO_CORTADO: 3, VIDRIO_RECIBIDO: 4, ACCESORIOS_SEPARADOS: 5,
};

const TALLER_COLORS = [
    { hex: '#FEF9C3', label: 'Amarillo' },
    { hex: '#DCFCE7', label: 'Verde' },
    { hex: '#DBEAFE', label: 'Azul' },
    { hex: '#FFEDD5', label: 'Naranja' },
    { hex: '#FFE4E6', label: 'Rojo' },
    { hex: '#F3E8FF', label: 'Violeta' },
];

const COLUMNS = [
    { key: 'chk_medicion',  label: 'Medición',  Icon: Ruler },
    { key: 'chk_corte',     label: 'Aluminio',  Icon: Scissors },
    { key: 'chk_vidrio',    label: 'Vidrio',    Icon: Layers },
    { key: 'chk_accesorios',label: 'Herrajes',  Icon: Package },
    { key: 'chk_ensamble',  label: 'Ensamble',  Icon: Wrench },
    { key: 'chk_matizado',  label: 'Matizado',  Icon: Sparkles },
    { key: 'chk_pelicula',  label: 'Película',  Icon: Film },
    { key: 'chk_huacal',    label: 'Huacal',    Icon: Box },
    { key: 'chk_carton',    label: 'Cartón',    Icon: Archive },
];

const isColApplicable = (odp: ODP, key: string): boolean => {
    switch (key) {
        case 'chk_medicion':   return (odp.tomas_medidas?.length || 0) > 0;
        case 'chk_corte':      return !!odp.tiene_aluminio;
        case 'chk_vidrio':     return (odp.items?.length || 0) > 0;
        case 'chk_accesorios': return (odp.saps?.length || 0) > 0;
        case 'chk_ensamble':   return !!odp.tiene_aluminio;
        case 'chk_matizado':   return !!odp.matizado;
        case 'chk_pelicula':   return !!odp.pelicula;
        case 'chk_huacal':     return !!odp.huacal;
        case 'chk_carton':     return !!odp.carton;
        default: return false;
    }
};

const isColLocked = (odp: ODP, key: string): boolean => {
    return ['chk_pelicula', 'chk_matizado', 'chk_huacal', 'chk_carton'].includes(key) && !odp.chk_vidrio;
};

const isPagoOk = (odp: ODP): boolean =>
    odp.forma_pago === 'credito' ||
    odp.estado_caja === 'CANCELADO' ||
    odp.estado_caja === 'CREDITO_APROBADO';

const getPaymentInfo = (odp: ODP): { label: string; cls: string } => {
    if (odp.forma_pago === 'credito') return { label: 'Crédito', cls: 'bg-blue-50 text-blue-700' };
    if (odp.estado_caja === 'CANCELADO') return { label: 'Cancelado ✓', cls: 'bg-emerald-50 text-emerald-700' };
    if (odp.estado_caja === 'CREDITO_APROBADO') return { label: 'Crédito aprobado', cls: 'bg-indigo-50 text-indigo-700' };
    if (odp.estado_caja === 'ABONADO') return { label: 'Abono parcial', cls: 'bg-amber-50 text-amber-700' };
    return { label: 'Pendiente', cls: 'bg-slate-100 text-slate-500' };
};

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const ProduccionPage: React.FC = () => {
    const [mainTab, setMainTab]           = useState<'activas' | 'pedido_mano' | 'nc_garantias' | 'pausadas'>('activas');
    const [manoSubTab, setManoSubTab]     = useState<'listos' | 'espera_pago' | 'entregadas'>('listos');

    const [activeOdps, setActiveOdps]     = useState<ODP[]>([]);
    const [readyOdps, setReadyOdps]       = useState<ODP[]>([]);
    const [despachoOdps, setDespachoOdps] = useState<ODP[]>([]);
    const [manoOdps, setManoOdps]         = useState<ODP[]>([]);
    const [entregadasOdps, setEntregadasOdps] = useState<ODP[]>([]);
    const [ncGarantiasOdps, setNcGarantiasOdps] = useState<ODP[]>([]);
    const [pausadasOdps, setPausadasOdps]       = useState<ODP[]>([]);

    const [loading, setLoading]           = useState(true);
    const [searchTerm, setSearchTerm]     = useState('');
    const [fichaOdpId, setFichaOdpId]     = useState<number | null>(null);
    const [selectedQR, setSelectedQR]     = useState<string | null>(null);
    const [selectedODPDetail, setSelectedODPDetail] = useState<ODP | null>(null);
    const [filterType, setFilterType]     = useState<string>('TODAS');
    const [sortBy, setSortBy]             = useState<'fecha' | 'numero' | 'estado'>('fecha');
    const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc');
    const [colorPicker, setColorPicker]   = useState<{ odpId: number; top: number; left: number } | null>(null);
    const [notes, setNotes]               = useState<{ [key: number]: Nota[] }>({});
    const [newNotes, setNewNotes]         = useState<{ [key: number]: string }>({});
    const [panelOdp, setPanelOdp]         = useState<ODP | null>(null);
    const [panelDetail, setPanelDetail]   = useState<ODPDetalle | null>(null);
    const [panelDetailLoading, setPanelDetailLoading] = useState(false);
    const [odpFullDetail, setOdpFullDetail] = useState<any>(null);
    const [printSap, setPrintSap]         = useState<{ odp: any; sap: any } | null>(null);
    const [marcandoEntregada, setMarcandoEntregada] = useState<number | null>(null);

    // Modales PV inline
    const [pvModalLlegada, setPvModalLlegada]       = useState<PedidoPVDetalle | null>(null);
    const [pvFechaLlegada, setPvFechaLlegada]       = useState('');
    const [pvModalAccion, setPvModalAccion]         = useState<{ pv: PedidoPVDetalle; tipo: 'verificar' | 'problema' } | null>(null);
    const [pvObsAccion, setPvObsAccion]             = useState('');
    const [pvLoadingAccion, setPvLoadingAccion]     = useState(false);
    const [marcandoListo, setMarcandoListo]         = useState(false);
    const [showProgramacion, setShowProgramacion]   = useState(false);

    // Role check
    const authUser = useSelector((state: any) => state.auth.user);
    const userRol: string = (authUser?.rol || authUser?.role || '').toLowerCase();
    const puedeMarcarEntregada = ['compras', 'produccion', 'admin', 'jefe_produccion', 'gerencia', 'root'].includes(userRol);
    const puedePV = ['compras', 'produccion', 'jefe_produccion', 'admin', 'gerencia', 'root'].includes(userRol);
    const puedeMarcarListo = ['compras', 'produccion', 'jefe_produccion', 'admin', 'gerencia', 'root'].includes(userRol);

    const fetchData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = sessionStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const [res, resNcG] = await Promise.all([
                axios.get(`${API}/api/odp?limit=1000`, { headers }),
                axios.get(`${API}/api/odp/nc-garantias`, { headers }),
            ]);
            const data: ODP[] = Array.isArray(res.data) ? res.data : (res.data.rows || []);
            const allPausadas = data.filter(o => o.estado_produccion === 'PAUSADA');
            const allActive = data.filter(o => activeStates.includes(o.estado_produccion));
            const allReady  = data.filter(o => o.estado_produccion === 'LISTO_INSTALAR');
            const allEntregadas = data.filter(o =>
                o.estado_produccion === 'ENTREGADA' && !o.instalacion && !o.acarreo
            );
            setActiveOdps(allActive);
            setPausadasOdps(allPausadas);
            setReadyOdps(allReady);
            setDespachoOdps(allReady.filter(o => o.instalacion || o.acarreo));
            setManoOdps(allReady.filter(o => !o.instalacion && !o.acarreo));
            setEntregadasOdps(allEntregadas);
            setNcGarantiasOdps(resNcG.data);
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar pedidos de producción');
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Clear panel when switching main tabs
    useEffect(() => {
        setPanelOdp(null);
        setPanelDetail(null);
        setPrintSap(null);
    }, [mainTab]);

    // Sync panelOdp when data refreshes
    useEffect(() => {
        if (!panelOdp) return;
        const all = [...activeOdps, ...pausadasOdps, ...despachoOdps, ...manoOdps, ...entregadasOdps, ...ncGarantiasOdps];
        const updated = all.find(o => o.id === panelOdp.id);
        if (updated) setPanelOdp(updated);
        else setPanelOdp(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeOdps, pausadasOdps, despachoOdps, manoOdps, entregadasOdps, ncGarantiasOdps]);

    const fetchNotes = async (odpId: number) => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await axios.get(
                `${API}/api/notas-produccion/${odpId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNotes(prev => ({ ...prev, [odpId]: res.data }));
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    };

    const handleAddNote = async (odpId: number) => {
        const text = newNotes[odpId]?.trim();
        if (!text) return;
        try {
            const token = sessionStorage.getItem('token');
            const res = await axios.post(
                `${API}/api/notas-produccion`,
                { odp_id: odpId, texto: text },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNotes(prev => ({ ...prev, [odpId]: [res.data, ...(prev[odpId] || [])] }));
            setNewNotes(prev => ({ ...prev, [odpId]: '' }));
            toast.success('Nota agregada');
        } catch (error) {
            toast.error('Error al agregar nota');
        }
    };

    const handleSetColor = async (odpId: number, color: string | null) => {
        setColorPicker(null);
        try {
            const token = sessionStorage.getItem('token');
            await axios.put(
                `${API}/api/odp/${odpId}`,
                { color_taller: color },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchData(true);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al guardar color');
        }
    };

    const toggleCheck = async (odp: ODP, field: string) => {
        if (isColLocked(odp, field)) {
            toast.warning('Esta tarea requiere que el vidrio haya sido recibido primero.');
            return;
        }
        const newValue = !(odp as any)[field];
        // Desmarcar una etapa aplicable de una ODP ya lista la regresa a producción
        if (!newValue && odp.estado_produccion === 'LISTO_INSTALAR' && isColApplicable(odp, field)) {
            const etapa = COLUMNS.find(c => c.key === field)?.label || 'esta etapa';
            if (!window.confirm(`La ${odp.numero_odp} ya está LISTA PARA INSTALAR. Al desmarcar «${etapa}» volverá a producción. ¿Continuar?`)) {
                return;
            }
        }
        try {
            const token = sessionStorage.getItem('token');
            await axios.put(
                `${API}/api/odp/${odp.id}`,
                { [field]: newValue },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchData(true);
            toast.success('Proceso actualizado');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al actualizar');
        }
    };

    const handleMarcarEntregada = async (odp: ODP) => {
        setMarcandoEntregada(odp.id);
        try {
            const token = sessionStorage.getItem('token');
            await axios.put(
                `${API}/api/odp/${odp.id}`,
                { estado_produccion: 'ENTREGADA' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`${odp.numero_odp} marcada como Entregada`);
            fetchData(true);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al actualizar');
        } finally {
            setMarcandoEntregada(null);
        }
    };

    const handlePvRegistrarLlegada = async () => {
        if (!pvModalLlegada) return;
        setPvLoadingAccion(true);
        try {
            const token = sessionStorage.getItem('token');
            await axios.patch(
                `${API}/api/pedidos-pv/${pvModalLlegada.id}/registrar-llegada`,
                { fecha_llegada_real: pvFechaLlegada || undefined },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success('Llegada registrada');
            setPvModalLlegada(null);
            setPvFechaLlegada('');
            if (panelOdp) fetchPanelDetail(panelOdp.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Error al registrar llegada');
        } finally { setPvLoadingAccion(false); }
    };

    const handlePvAccion = async () => {
        if (!pvModalAccion) return;
        setPvLoadingAccion(true);
        const endpoint = pvModalAccion.tipo === 'verificar' ? 'verificar' : 'problema';
        const body = pvModalAccion.tipo === 'verificar'
            ? { observacion_verificacion: pvObsAccion || null }
            : { observacion: pvObsAccion };
        try {
            const token = sessionStorage.getItem('token');
            await axios.patch(
                `${API}/api/pedidos-pv/${pvModalAccion.pv.id}/${endpoint}`,
                body,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(pvModalAccion.tipo === 'verificar' ? 'PV verificado correctamente' : 'Problema reportado');
            setPvModalAccion(null);
            setPvObsAccion('');
            if (panelOdp) fetchPanelDetail(panelOdp.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Error al procesar acción');
        } finally { setPvLoadingAccion(false); }
    };

    const handleMarcarListoInstalar = async () => {
        if (!panelOdp) return;
        if (!window.confirm(`¿Marcar "${panelOdp.numero_odp}" como Listo para Instalar?\nEsta acción avanzará la ODP directamente a esa etapa.`)) return;
        setMarcandoListo(true);
        try {
            const token = sessionStorage.getItem('token');
            await axios.put(
                `${API}/api/odp/${panelOdp.id}`,
                { estado_produccion: 'LISTO_INSTALAR' },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            toast.success(`${panelOdp.numero_odp} marcada como Listo para Instalar`);
            fetchData(true);
            setPanelOdp(null);
            setPanelDetail(null);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Error al actualizar estado');
        } finally {
            setMarcandoListo(false);
        }
    };

    const getUrgency = (fecha: string) => {
        const diff = Math.ceil((new Date(fecha).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        if (diff <= 1) return { label: diff === 0 ? 'VENCE HOY' : diff < 0 ? 'VENCIDA' : 'VENCE MAÑANA', color: 'rose', weight: 3 };
        if (diff <= 3) return { label: `En ${diff} días`, color: 'orange', weight: 2 };
        return { label: `En ${diff} días`, color: 'emerald', weight: 1 };
    };

    const fetchPanelDetail = async (odpId: number) => {
        setPanelDetailLoading(true);
        setOdpFullDetail(null);
        try {
            const token = sessionStorage.getItem('token');
            const res = await axios.get(
                `${API}/api/odp/${odpId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setOdpFullDetail(res.data);
            setPanelDetail({
                pedidos_pv: res.data.pedidos_pv || [],
                saps: res.data.saps || [],
            });
        } catch (error) {
            console.error('Error fetching panel detail:', error);
        } finally {
            setPanelDetailLoading(false);
        }
    };

    const handleSelectOdp = (odp: ODP) => {
        setPanelOdp(odp);
        setPanelDetail(null);
        setPrintSap(null);
        if (!notes[odp.id]) fetchNotes(odp.id);
        fetchPanelDetail(odp.id);
    };

    const filteredOdps = activeOdps.filter(odp => {
        const matchesSearch =
            odp.numero_odp.toLowerCase().includes(searchTerm.toLowerCase()) ||
            odp.cliente.nombre_razon_social.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        const urgency = getUrgency(odp.fecha_entrega);
        switch (filterType) {
            case 'URGENTES': return urgency.weight >= 2;
            case 'PELICULA': return odp.pelicula;
            case 'HUACAL':   return odp.huacal;
            case 'NC':       return odp.es_no_conformidad;
            default:         return true;
        }
    }).sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'numero') cmp = a.numero_odp.localeCompare(b.numero_odp, undefined, { numeric: true });
        else if (sortBy === 'estado') cmp = (ESTADO_ORDEN[a.estado_produccion] ?? 99) - (ESTADO_ORDEN[b.estado_produccion] ?? 99);
        else cmp = new Date(a.fecha_entrega).getTime() - new Date(b.fecha_entrega).getTime();
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const ncOdps = ncGarantiasOdps
        .filter(o => ESTADOS_NC_ACTIVOS.includes(o.estado_produccion))
        .sort((a, b) => new Date(a.fecha_creacion || 0).getTime() - new Date(b.fecha_creacion || 0).getTime());

    const pagoOkOdps     = manoOdps.filter(o => isPagoOk(o));
    const esperaPagoOdps = manoOdps.filter(o => !isPagoOk(o));
    const currentManoOdps = manoSubTab === 'listos' ? pagoOkOdps
        : manoSubTab === 'espera_pago' ? esperaPagoOdps
        : entregadasOdps;

    if (loading) return (
        <div className="p-8 text-center text-slate-500 font-bold">Cargando Tablero de Taller...</div>
    );

    // ─── Renderizado del panel de detalle (reutilizable) ─────────────────────
    const renderPanel = () => {
        if (!panelOdp) return (
            <div className="flex flex-col items-center justify-center h-72 text-center p-8">
                <MessageSquare className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-slate-400 text-sm font-medium leading-relaxed">
                    Selecciona una ODP de la tabla para ver su detalle y bitácora
                </p>
            </div>
        );

        const urgency = getUrgency(panelOdp.fecha_entrega);
        const pvEstadoConfig: Record<string, { label: string; cls: string }> = {
            PENDIENTE:            { label: 'Pendiente',           cls: 'bg-slate-100 text-slate-500' },
            ENVIADO:              { label: 'Enviado',              cls: 'bg-blue-100 text-blue-700' },
            CONFIRMADO_PROVEEDOR: { label: 'Confirmado',           cls: 'bg-indigo-100 text-indigo-700' },
            LLEGADO:              { label: 'Llegado — sin verif.', cls: 'bg-amber-100 text-amber-700' },
            VERIFICADO:           { label: 'Verificado ✓',         cls: 'bg-emerald-100 text-emerald-700' },
            PROBLEMA:             { label: '⚠ Problema',           cls: 'bg-rose-100 text-rose-700 animate-pulse' },
        };
        const sapEstadoCfg: Record<string, string> = {
            borrador: 'bg-slate-100 text-slate-500',
            enviada:  'bg-blue-100 text-blue-700',
            aprobada: 'bg-emerald-100 text-emerald-700',
        };
        const odcEstadoCfg = (estado: string) => {
            const s = estado.toLowerCase();
            if (s === 'recibida' || s === 'completada') return 'bg-emerald-100 text-emerald-700';
            if (s === 'parcial') return 'bg-amber-100 text-amber-700';
            return 'bg-slate-100 text-slate-500';
        };

        return (
            <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                {/* Panel header */}
                <div className={`p-4 border-b border-slate-100 flex-shrink-0 border-l-4
                    ${urgency.color === 'rose'   ? 'border-rose-500 bg-rose-50/30' :
                      urgency.color === 'orange' ? 'border-orange-500 bg-orange-50/30' :
                                                   'border-emerald-500 bg-emerald-50/30'}`}
                >
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <button
                                    className="text-sm font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                    onClick={() => setFichaOdpId(panelOdp.id)}
                                >
                                    {panelOdp.numero_odp}
                                </button>
                                <button
                                    onClick={() => setSelectedQR(panelOdp.numero_odp)}
                                    className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                >
                                    <QrCode className="w-3.5 h-3.5" />
                                </button>
                                {panelOdp.es_no_conformidad && (
                                    <span className="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full">REPROCESO</span>
                                )}
                                {panelOdp.es_garantia && (
                                    <span className="text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">GARANTÍA</span>
                                )}
                            </div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{panelOdp.cliente.nombre_razon_social}</p>
                            <span className={`inline-block mt-1.5 text-[9px] font-black px-1.5 py-0.5 rounded
                                ${urgency.color === 'rose'   ? 'bg-rose-100 text-rose-600' :
                                  urgency.color === 'orange' ? 'bg-orange-100 text-orange-600' :
                                                               'bg-emerald-100 text-emerald-600'}`}>
                                {urgency.label}
                            </span>
                        </div>
                        <button
                            onClick={() => setPanelOdp(null)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Botón Marcar Listo para Instalar */}
                {puedeMarcarListo && activeStates.includes(panelOdp.estado_produccion) && (
                    <div className="px-4 pt-3 pb-1 flex-shrink-0">
                        <button
                            onClick={handleMarcarListoInstalar}
                            disabled={marcandoListo}
                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition disabled:opacity-40"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {marcandoListo ? 'Procesando...' : 'Marcar como Listo para Instalar'}
                        </button>
                    </div>
                )}

                {/* Contenido scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    {/* Cristales */}
                    {(panelOdp.items?.length || 0) > 0 && (
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cristales</h4>
                                <button
                                    onClick={() => setSelectedODPDetail(panelOdp)}
                                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase"
                                >
                                    Ficha completa →
                                </button>
                            </div>
                            <div className="space-y-1.5">
                                {panelOdp.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs p-2 rounded-lg bg-slate-50">
                                        <span className="font-bold text-slate-700">
                                            {item.cantidad}x <span className="font-medium">{item.tipo_vidrio} {item.espesor}mm</span>
                                        </span>
                                        <span className="text-slate-500 font-mono">{item.ancho_mm} × {item.alto_mm}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pedido PV */}
                    {panelDetailLoading && (
                        <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-xs font-medium">Cargando detalle...</span>
                        </div>
                    )}

                    {!panelDetailLoading && panelDetail && panelDetail.pedidos_pv.length > 0 && (() => {
                        const hoy = new Date();
                        return (
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <Truck className="w-3 h-3" />
                                    Pedido de Vidrio
                                </h4>
                                <div className="space-y-2">
                                    {panelDetail.pedidos_pv.map(pv => {
                                        const cfg = pvEstadoConfig[pv.estado] ?? { label: pv.estado, cls: 'bg-slate-100 text-slate-500' };
                                        let diasLabel: React.ReactNode = null;
                                        if (pv.fecha_entrega_prometida && pv.estado !== 'VERIFICADO') {
                                            const diff = Math.ceil((new Date(pv.fecha_entrega_prometida).getTime() - hoy.getTime()) / 86400000);
                                            diasLabel = diff < 0
                                                ? <span className="text-rose-600 font-black">Vencida hace {Math.abs(diff)}d</span>
                                                : diff === 0
                                                ? <span className="text-rose-600 font-black">Vence hoy</span>
                                                : <span className="text-slate-500">Faltan {diff}d</span>;
                                        }
                                        return (
                                            <div key={pv.id} className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-100">
                                                    <div>
                                                        <p className="text-[9px] font-black text-slate-400 uppercase">{pv.proveedor}</p>
                                                        <p className="text-xs font-black text-slate-800">#{pv.numero_pedido}</p>
                                                    </div>
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                                                </div>
                                                <div className="px-3 py-2 space-y-1.5">
                                                    {pv.fecha_envio && (
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="flex items-center gap-1 text-slate-400 font-medium"><Clock className="w-3 h-3" /> Enviado</span>
                                                            <span className="font-bold text-slate-600">{new Date(pv.fecha_envio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                                                        </div>
                                                    )}
                                                    {pv.fecha_entrega_prometida && (
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="flex items-center gap-1 text-slate-400 font-medium"><Calendar className="w-3 h-3" /> Prometida</span>
                                                            <span className="font-bold text-slate-600 flex items-center gap-1.5">
                                                                {new Date(pv.fecha_entrega_prometida).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                                                {diasLabel && <span className="text-[9px]">({diasLabel})</span>}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {pv.fecha_llegada_real && (
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="flex items-center gap-1 text-slate-400 font-medium"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Llegó</span>
                                                            <span className="font-bold text-emerald-600">
                                                                {new Date(pv.fecha_llegada_real).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                                                {pv.dias_diferencia !== null && (
                                                                    <span className={`ml-1 ${pv.dias_diferencia > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                                        ({pv.dias_diferencia > 0 ? `+${pv.dias_diferencia}d tarde` : `${Math.abs(pv.dias_diferencia)}d antes`})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {pv.observaciones && (
                                                        <p className="text-[9px] text-slate-500 italic border-t border-slate-100 pt-1.5 mt-1">{pv.observaciones}</p>
                                                    )}
                                                    {/* Botones de acción según estado */}
                                                    {puedePV && ['ENVIADO', 'CONFIRMADO_PROVEEDOR'].includes(pv.estado) && (
                                                        <div className="border-t border-slate-100 pt-2 mt-1">
                                                            <button
                                                                onClick={() => { setPvModalLlegada(pv); setPvFechaLlegada(''); }}
                                                                className="w-full flex items-center justify-center gap-1.5 text-[10px] font-black py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
                                                            >
                                                                <PackageCheck className="w-3.5 h-3.5" /> Registrar llegada
                                                            </button>
                                                        </div>
                                                    )}
                                                    {puedePV && pv.estado === 'LLEGADO' && (
                                                        <div className="border-t border-slate-100 pt-2 mt-1 flex gap-1.5">
                                                            <button
                                                                onClick={() => { setPvModalAccion({ pv, tipo: 'verificar' }); setPvObsAccion(''); }}
                                                                className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                                                            >
                                                                <ShieldCheck className="w-3.5 h-3.5" /> Verificar
                                                            </button>
                                                            <button
                                                                onClick={() => { setPvModalAccion({ pv, tipo: 'problema' }); setPvObsAccion(''); }}
                                                                className="flex-1 flex items-center justify-center gap-1 text-[10px] font-black py-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                                                            >
                                                                <TriangleAlert className="w-3.5 h-3.5" /> Problema
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* SAP + ODC Perfilería */}
                    {!panelDetailLoading && panelDetail && panelDetail.saps.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <ClipboardList className="w-3 h-3" />
                                Perfilería / SAP
                            </h4>
                            <div className="space-y-2">
                                {panelDetail.saps.map(sap => (
                                    <div key={sap.id} className="rounded-xl border border-slate-200 overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-100">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-400 uppercase">Solicitud</p>
                                                <button
                                                    className="text-xs font-black text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                                                    onClick={() => {
                                                        const sapFull = odpFullDetail?.saps?.find((s: any) => s.id === sap.id);
                                                        if (sapFull && odpFullDetail) setPrintSap({ odp: odpFullDetail, sap: sapFull });
                                                    }}
                                                >
                                                    {sap.numero_sap}
                                                </button>
                                            </div>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full capitalize ${sapEstadoCfg[sap.estado] ?? 'bg-slate-100 text-slate-500'}`}>
                                                {sap.estado}
                                            </span>
                                        </div>
                                        {sap.ordenes_compra.filter(o => o.tipo === 'perfileria').length > 0 ? (
                                            <div className="bg-slate-50 px-3 py-2 space-y-1.5">
                                                {sap.ordenes_compra.filter(o => o.tipo === 'perfileria').map(odc => (
                                                    <div key={odc.id} className="flex items-center justify-between text-[10px]">
                                                        <div>
                                                            <span className="font-black text-slate-700">{odc.numero_odc}</span>
                                                            <span className="text-slate-400 ml-1">· {odc.proveedor}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full capitalize ${odcEstadoCfg(odc.estado)}`}>{odc.estado}</span>
                                                            {odc.fecha_recepcion && (
                                                                <span className="text-[9px] text-emerald-600 font-bold">
                                                                    {new Date(odc.fecha_recepcion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[9px] text-slate-400 italic px-3 py-2 bg-slate-50">Sin ODC creada</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ODC directa de vidrio */}
                    {!panelDetailLoading && panelDetail && (() => {
                        const odcEstadoCfg = (estado: string) => {
                            const s = estado.toLowerCase();
                            if (s === 'recibida' || s === 'completada') return 'bg-emerald-100 text-emerald-700';
                            if (s === 'parcial') return 'bg-amber-100 text-amber-700';
                            return 'bg-slate-100 text-slate-500';
                        };
                        const odcsVidrio = panelDetail.saps.flatMap(s => s.ordenes_compra.filter(o => o.tipo === 'vidrio'));
                        if (odcsVidrio.length === 0) return null;
                        return (
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                    <ShoppingCart className="w-3 h-3" />
                                    ODC Vidrio
                                </h4>
                                <div className="space-y-1.5">
                                    {odcsVidrio.map(odc => (
                                        <div key={odc.id} className="flex items-center justify-between text-[10px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                                            <div>
                                                <span className="font-black text-slate-700">{odc.numero_odc}</span>
                                                <span className="text-slate-400 ml-1">· {odc.proveedor}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full capitalize ${odcEstadoCfg(odc.estado)}`}>{odc.estado}</span>
                                                {odc.fecha_recepcion && (
                                                    <span className="text-[9px] text-emerald-600 font-bold">
                                                        {new Date(odc.fecha_recepcion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Bitácora */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <MessageSquare className="w-3 h-3" />
                            Bitácora del Taller
                        </h4>
                        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 mb-3">
                            {(notes[panelOdp.id]?.length || 0) === 0 ? (
                                <p className="text-center text-xs text-slate-400 py-6 italic">
                                    No hay notas registradas para esta ODP.
                                </p>
                            ) : notes[panelOdp.id].map(n => (
                                <div key={n.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <p className="text-xs text-slate-700 mb-1 leading-relaxed">{n.texto}</p>
                                    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                        <span>{n.usuario.nombre_completo}</span>
                                        <span>
                                            {new Date(n.fecha).toLocaleDateString()}{' '}
                                            {new Date(n.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="relative">
                            <textarea
                                rows={2}
                                className="w-full p-3 pr-10 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 resize-none bg-white transition-all"
                                placeholder="Agregar una nota técnica..."
                                value={newNotes[panelOdp.id] || ''}
                                onChange={e => setNewNotes(prev => ({ ...prev, [panelOdp.id]: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddNote(panelOdp.id);
                                    }
                                }}
                            />
                            <button
                                onClick={() => handleAddNote(panelOdp.id)}
                                className="absolute right-2 bottom-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ─── Renderizado de la matriz (reutilizable para Activas y NC) ───────────
    const renderMatrix = (odps: ODP[], emptyMsg: string) => (
        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
            <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[220px] sticky left-0 bg-slate-50 z-20 border-r border-slate-200">
                            ODP / Cliente
                        </th>
                        {COLUMNS.map(col => (
                            <th key={col.key} className="px-2 py-3 text-center min-w-[72px]">
                                <div className="flex flex-col items-center gap-0.5">
                                    <col.Icon className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{col.label}</span>
                                </div>
                            </th>
                        ))}
                        <th className="px-2 py-3 text-center min-w-[56px]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Avance</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {odps.length === 0 ? (
                        <tr>
                            <td colSpan={COLUMNS.length + 2} className="p-12 text-center">
                                <CheckCircle2 className="w-12 h-12 text-slate-100 mx-auto mb-3" />
                                <p className="text-slate-400 text-sm font-medium">{emptyMsg}</p>
                            </td>
                        </tr>
                    ) : odps.map(odp => {
                        const urgency    = getUrgency(odp.fecha_entrega);
                        const isSelected = panelOdp?.id === odp.id;
                        const applicable = COLUMNS.filter(c => isColApplicable(odp, c.key));
                        const done       = applicable.filter(c => (odp as any)[c.key]);
                        const progress   = applicable.length > 0
                            ? Math.round((done.length / applicable.length) * 100)
                            : 0;
                        const borderColor = urgency.color === 'rose' ? 'border-rose-400'
                            : urgency.color === 'orange' ? 'border-orange-400' : 'border-emerald-400';
                        const hasColor = !!odp.color_taller;
                        const rowBg = isSelected ? 'bg-indigo-50/60'
                            : urgency.color === 'rose' ? 'hover:bg-rose-50/20'
                            : urgency.color === 'orange' ? 'hover:bg-orange-50/20' : 'hover:bg-slate-50';

                        return (
                            <tr
                                key={odp.id}
                                onClick={() => handleSelectOdp(odp)}
                                className={`cursor-pointer transition-colors border-l-4 ${borderColor} ${hasColor ? '' : rowBg}`}
                                style={hasColor ? { backgroundColor: odp.color_taller! } : undefined}
                            >
                                <td
                                    className={`px-4 py-3 sticky left-0 z-10 border-r border-slate-100 ${isSelected ? 'bg-indigo-50/60' : ''}`}
                                    style={!isSelected ? { backgroundColor: odp.color_taller || 'white' } : undefined}
                                >
                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                        {/* Círculo de color / selector */}
                                        <button
                                            title="Resaltar ODP"
                                            onClick={e => {
                                                e.stopPropagation();
                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setColorPicker({ odpId: odp.id, top: rect.bottom + 6, left: rect.left });
                                            }}
                                            className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0 transition-transform hover:scale-125 focus:outline-none"
                                            style={{ backgroundColor: odp.color_taller || '#f1f5f9' }}
                                        />
                                        <span
                                            className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors cursor-pointer"
                                            onClick={e => { e.stopPropagation(); setFichaOdpId(odp.id); }}
                                        >
                                            {odp.numero_odp}
                                        </span>
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded
                                            ${urgency.color === 'rose'   ? 'bg-rose-50 text-rose-600' :
                                              urgency.color === 'orange' ? 'bg-orange-50 text-orange-600' :
                                                                           'bg-emerald-50 text-emerald-600'}`}>
                                            {urgency.label}
                                        </span>
                                        {odp.es_no_conformidad && (
                                            <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full">NC</span>
                                        )}
                                        {odp.es_garantia && (
                                            <span className="text-[8px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">GAR</span>
                                        )}
                                        {(odp.estado_produccion === 'EN_ESPERA' || odp.estado_produccion === 'VISITA_TECNICA') && (
                                            <span className="text-[8px] font-black bg-amber-400 text-white px-1.5 py-0.5 rounded-full">
                                                {odp.estado_produccion === 'VISITA_TECNICA' ? 'VISITA' : 'EN ESPERA'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm font-bold text-slate-700 truncate max-w-[190px]">
                                        {odp.cliente.nombre_razon_social}
                                    </p>
                                </td>
                                {COLUMNS.map(col => {
                                    const app     = isColApplicable(odp, col.key);
                                    const locked  = isColLocked(odp, col.key);
                                    const checked = !!(odp as any)[col.key];
                                    if (!app) return (
                                        <td key={col.key} className="px-2 py-3 text-center">
                                            <span className="text-slate-200 text-sm select-none">—</span>
                                        </td>
                                    );
                                    return (
                                        <td key={col.key} className="px-2 py-3 text-center"
                                            onClick={e => { e.stopPropagation(); toggleCheck(odp, col.key); }}>
                                            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl border-2 transition-all mx-auto
                                                ${checked ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                                                : locked  ? 'bg-slate-50 border-slate-100 cursor-not-allowed'
                                                : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 cursor-pointer'}`}>
                                                {locked   ? <Lock className="w-4 h-4 text-slate-300" />
                                                : checked  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                : <col.Icon className="w-4 h-4" />}
                                            </div>
                                        </td>
                                    );
                                })}
                                <td className="px-2 py-3 text-center">
                                    <div className="flex flex-col items-center gap-1.5">
                                        <span className={`text-xs font-black ${progress === 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{progress}%</span>
                                        <div className="w-9 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : urgency.color === 'rose' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    return (
        <>
        <div className="p-4 md:p-6 max-w-[1700px] mx-auto space-y-4 text-slate-900">

            {/* ── Header ── */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <Wrench className="w-6 h-6 text-indigo-600" />
                        Control de Taller
                    </h1>
                    <p className="text-slate-500 text-sm font-medium">Gestión dinámica de producción y bitácora</p>
                </div>
                <div className="flex items-center gap-3">
                <button
                    onClick={() => setShowProgramacion(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md shadow-green-100 transition-all active:scale-95"
                >
                    <MessageCircle className="w-4 h-4" />
                    Compartir programación
                </button>
                <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200">
                    <div className="px-4 py-2 text-center border-r border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activas</p>
                        <p className="text-xl font-black text-indigo-600 leading-none">{activeOdps.length}</p>
                    </div>
                    <div className="px-4 py-2 text-center border-r border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Urgentes</p>
                        <p className="text-xl font-black text-rose-600 leading-none">
                            {activeOdps.filter(o => getUrgency(o.fecha_entrega).weight >= 2).length}
                        </p>
                    </div>
                    <div className="px-4 py-2 text-center border-r border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Despacho</p>
                        <p className="text-xl font-black text-emerald-600 leading-none">{despachoOdps.length}</p>
                    </div>
                    <div className="px-4 py-2 text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En la mano</p>
                        <p className="text-xl font-black text-amber-600 leading-none">{manoOdps.length}</p>
                    </div>
                </div>
                </div>
            </div>

            {/* ── Main Tabs — estilo carpeta ── */}
            <div>
                <FolderTabs
                    tabs={[
                        { key: 'activas',      label: 'Control Taller',    icon: <Wrench className="w-4 h-4" /> },
                        { key: 'pedido_mano',  label: 'Pedido en la mano', icon: <Inbox className="w-4 h-4" /> },
                        { key: 'nc_garantias', label: 'NC / Garantías',    icon: <AlertTriangle className="w-4 h-4" />, badge: ncOdps.length || undefined, badgeClassName: 'bg-rose-100 text-rose-600' },
                        { key: 'pausadas',     label: 'ODP Pausadas',      icon: <PauseCircle className="w-4 h-4" />,   badge: pausadasOdps.length || undefined, badgeClassName: 'bg-amber-100 text-amber-600' },
                    ]}
                    activeKey={mainTab}
                    onChange={(k) => setMainTab(k as any)}
                    className="border-b border-slate-200"
                />
            </div>

            {/* ══════════════════════════════════════════════
                TAB: ACTIVAS (Control Taller)
            ══════════════════════════════════════════════ */}
            {mainTab === 'activas' && (
                <>
                    {/* Filtros */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-3 flex flex-col md:flex-row gap-3 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por ODP o Cliente..."
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-slate-50 transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            {[
                                { id: 'TODAS',    label: 'Todas' },
                                { id: 'URGENTES', label: 'Urgentes', icon: AlertCircle },
                                { id: 'PELICULA', label: 'Película',  icon: Film },
                                { id: 'HUACAL',   label: 'Huacal',   icon: Box },
                                { id: 'NC',       label: 'NC',        icon: AlertCircle },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFilterType(f.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 transition-all
                                        ${filterType === f.id
                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {f.icon && <f.icon className="w-3 h-3" />}
                                    {f.label}
                                </button>
                            ))}
                        </div>
                        {/* Ordenamiento */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-slate-200 pl-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Orden:</span>
                            {[
                                { id: 'fecha',  label: 'Fecha' },
                                { id: 'numero', label: '# ODP' },
                                { id: 'estado', label: 'Etapa' },
                            ].map(s => {
                                const isActive = sortBy === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => {
                                            if (isActive) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                            else { setSortBy(s.id as any); setSortDir('asc'); }
                                        }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1
                                            ${isActive ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        {s.label}
                                        {isActive && (
                                            <span className="text-[11px] leading-none">{sortDir === 'asc' ? '↑' : '↓'}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Split Panel */}
                    <div className="flex gap-4 items-start">
                        {/* Matriz */}
                        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                    <Package className="w-4 h-4 text-indigo-500" />
                                    Línea de Producción ({filteredOdps.length})
                                </h2>
                                <span className="text-[10px] text-slate-400 font-medium hidden md:block">
                                    Click en celda para marcar · Click en fila para ver detalle y bitácora
                                </span>
                            </div>
                            {renderMatrix(filteredOdps, 'No hay órdenes que coincidan.')}
                        </div>

                        {/* Panel Detalle */}
                        <div
                            className={`w-[340px] flex-shrink-0 rounded-2xl border shadow-sm overflow-hidden transition-all sticky top-4
                                ${panelOdp ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                            style={{ maxHeight: 'calc(100vh - 200px)' }}
                        >
                            {renderPanel()}
                        </div>
                    </div>

                    {/* Zona de Despacho (solo instalacion/acarreo) */}
                    {despachoOdps.length > 0 && (
                        <div className="bg-emerald-50 rounded-3xl border-2 border-emerald-100 overflow-hidden shadow-xl mt-2">
                            <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
                                <h2 className="text-lg font-black text-emerald-800 flex items-center gap-2">
                                    <Truck className="w-5 h-5" />
                                    Zona de Despacho e Instalación
                                </h2>
                                <span className="bg-emerald-500 text-white font-black px-3 py-1.5 rounded-full text-xs shadow-lg shadow-emerald-100">
                                    {despachoOdps.length} ÓRDENES LISTAS ✅
                                </span>
                            </div>
                            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {despachoOdps.map(odp => (
                                    <div key={odp.id} className="bg-white border-2 border-emerald-100 p-4 rounded-2xl shadow-sm hover:shadow-lg transition-all">
                                        <div className="flex justify-between items-start mb-3">
                                            <span
                                                className="font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl text-sm border border-emerald-100 cursor-pointer hover:bg-emerald-100 transition-colors"
                                                onClick={() => setFichaOdpId(odp.id)}
                                            >
                                                {odp.numero_odp}
                                            </span>
                                            <button
                                                onClick={() => setSelectedQR(odp.numero_odp)}
                                                className="p-1.5 bg-slate-50 text-slate-400 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                            >
                                                <QrCode className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-800 truncate">{odp.cliente.nombre_razon_social}</h3>
                                        <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1">Lista para instalación</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════
                TAB: PEDIDO EN LA MANO
            ══════════════════════════════════════════════ */}
            {mainTab === 'pedido_mano' && (
                <div className="space-y-4">
                    {/* Sub-tabs */}
                    <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit">
                        {[
                            { id: 'listos',      label: 'Listo para entregar', count: pagoOkOdps.length,     color: 'emerald' },
                            { id: 'espera_pago', label: 'En espera de pago',   count: esperaPagoOdps.length, color: 'amber'   },
                            { id: 'entregadas',  label: 'Entregadas',           count: entregadasOdps.length, color: 'slate'   },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setManoSubTab(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all
                                    ${manoSubTab === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-400 hover:text-slate-700'}`}
                            >
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black
                                    ${manoSubTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <Inbox className="w-4 h-4 text-indigo-500" />
                                {manoSubTab === 'listos'      ? 'Listas para entregar'
                                : manoSubTab === 'espera_pago' ? 'En espera de pago'
                                : 'Entregadas'}
                                <span className="text-slate-400">({currentManoOdps.length})</span>
                            </h2>
                        </div>

                        {currentManoOdps.length === 0 ? (
                            <div className="p-16 text-center">
                                <CheckCircle2 className="w-12 h-12 text-slate-100 mx-auto mb-3" />
                                <p className="text-slate-400 text-sm font-medium">No hay órdenes en esta categoría.</p>
                            </div>
                        ) : (
                            <div className="overflow-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">ODP / Cliente</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrega</th>
                                            <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Pago</th>
                                            {manoSubTab === 'entregadas' ? null : (
                                                <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[80px]">Estado caja</th>
                                            )}
                                            {(manoSubTab === 'listos' || manoSubTab === 'espera_pago') && puedeMarcarEntregada && (
                                                <th className="px-4 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Acción</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentManoOdps.map(odp => {
                                            const urgency = getUrgency(odp.fecha_entrega);
                                            const payInfo = getPaymentInfo(odp);
                                            return (
                                                <tr key={odp.id} className={`hover:bg-slate-50 transition-colors border-l-4
                                                    ${urgency.color === 'rose' ? 'border-rose-400' : urgency.color === 'orange' ? 'border-orange-400' : 'border-emerald-400'}`}>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                            <span
                                                                className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 cursor-pointer hover:bg-indigo-100"
                                                                onClick={() => setFichaOdpId(odp.id)}
                                                            >
                                                                {odp.numero_odp}
                                                            </span>
                                                            {odp.es_no_conformidad && (
                                                                <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full">NC</span>
                                                            )}
                                                            {odp.es_garantia && (
                                                                <span className="text-[8px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">GAR</span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-700">{odp.cliente.nombre_razon_social}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-[9px] font-black px-2 py-1 rounded-full
                                                            ${urgency.color === 'rose' ? 'bg-rose-50 text-rose-600' : urgency.color === 'orange' ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                            {urgency.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`text-[9px] font-black px-2 py-1 rounded-full ${payInfo.cls}`}>
                                                            {payInfo.label}
                                                        </span>
                                                    </td>
                                                    {manoSubTab === 'entregadas' ? null : (
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="text-[9px] text-slate-500 font-medium">
                                                                {odp.estado_caja || '—'}
                                                            </span>
                                                        </td>
                                                    )}
                                                    {(manoSubTab === 'listos' || manoSubTab === 'espera_pago') && puedeMarcarEntregada && (
                                                        <td className="px-4 py-3 text-center">
                                                            {manoSubTab === 'listos' && (
                                                                <button
                                                                    onClick={() => handleMarcarEntregada(odp)}
                                                                    disabled={marcandoEntregada === odp.id}
                                                                    className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all whitespace-nowrap"
                                                                >
                                                                    {marcandoEntregada === odp.id ? 'Marcando...' : 'Marcar Entregada'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB: NC / GARANTÍAS
            ══════════════════════════════════════════════ */}
            {mainTab === 'nc_garantias' && (
                <div className="flex gap-4 items-start">
                    {/* Matriz NC */}
                    <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                            <h2 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-rose-500" />
                                No Conformidades y Garantías ({ncOdps.length})
                            </h2>
                            <span className="text-[10px] text-slate-400 font-medium hidden md:block">
                                Click en celda para marcar · Click en fila para ver detalle
                            </span>
                        </div>
                        {renderMatrix(ncOdps, 'No hay NC ni garantías activas.')}
                    </div>

                    {/* Panel Detalle */}
                    <div
                        className={`w-[340px] flex-shrink-0 rounded-2xl border shadow-sm overflow-hidden transition-all sticky top-4
                            ${panelOdp ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                        style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                        {renderPanel()}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════
                TAB: ODP PAUSADAS
            ══════════════════════════════════════════════ */}
            {mainTab === 'pausadas' && (
                <div className="flex gap-4 items-start">
                    {/* Tabla de pausadas */}
                    <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
                            <h2 className="text-xs font-black text-amber-800 uppercase tracking-widest flex items-center gap-2">
                                <PauseCircle className="w-4 h-4 text-amber-500" />
                                ODPs Pausadas por No Conformidad ({pausadasOdps.length})
                            </h2>
                            <span className="text-[10px] text-slate-400 font-medium hidden md:block">
                                Click en fila para ver detalle y bitácora
                            </span>
                        </div>
                        <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                            <table className="w-full border-collapse">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[180px]">ODP Madre</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Fecha creación</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[180px]">ODP Hija (Reproceso)</th>
                                        <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[100px]">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pausadasOdps.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-12 text-center">
                                                <CheckCircle2 className="w-12 h-12 text-slate-100 mx-auto mb-3" />
                                                <p className="text-slate-400 text-sm font-medium">No hay ODPs pausadas por No Conformidad.</p>
                                            </td>
                                        </tr>
                                    ) : pausadasOdps.map(odp => {
                                        const isSelected = panelOdp?.id === odp.id;
                                        const hija = ncGarantiasOdps.find(nc => nc.odp_padre_id === odp.id);
                                        return (
                                            <tr
                                                key={odp.id}
                                                onClick={() => handleSelectOdp(odp)}
                                                className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-amber-50/40'}`}
                                            >
                                                {/* ODP Madre */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-slate-800 text-sm">{odp.numero_odp}</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-700 uppercase tracking-wider">Pausada</span>
                                                    </div>
                                                </td>
                                                {/* Cliente */}
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-semibold text-slate-700 truncate max-w-[220px]">{odp.cliente.nombre_razon_social}</p>
                                                </td>
                                                {/* Fecha creación */}
                                                <td className="px-4 py-3">
                                                    <p className="text-xs text-slate-500 font-medium">
                                                        {odp.fecha_creacion ? new Date(odp.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                    </p>
                                                </td>
                                                {/* ODP Hija */}
                                                <td className="px-4 py-3">
                                                    {hija ? (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setFichaOdpId(hija.id); }}
                                                            className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-black text-xs underline underline-offset-2 transition-colors"
                                                        >
                                                            {hija.numero_odp}
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black no-underline ${
                                                                hija.estado_produccion === 'LISTO_INSTALAR' ? 'bg-emerald-100 text-emerald-700'
                                                                : hija.estado_produccion === 'ACCESORIOS_SEPARADOS' ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {hija.estado_produccion.replace(/_/g, ' ')}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">Sin hija registrada</span>
                                                    )}
                                                </td>
                                                {/* Acción */}
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setFichaOdpId(odp.id); }}
                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                                    >
                                                        Ver detalle
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Panel Detalle */}
                    <div
                        className={`w-[340px] flex-shrink-0 rounded-2xl border shadow-sm overflow-hidden transition-all sticky top-4
                            ${panelOdp ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                        style={{ maxHeight: 'calc(100vh - 200px)' }}
                    >
                        {renderPanel()}
                    </div>
                </div>
            )}

            {/* ── Modal QR ── */}
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
                                <p className="text-indigo-100 text-sm mt-1">Identificador de producción</p>
                            </div>
                            <div className="p-10 flex flex-col items-center justify-center">
                                <div className="bg-white p-6 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100">
                                    <QRCodeSVG
                                        value={`${process.env.REACT_APP_URL || window.location.origin}/odp-search?q=${selectedQR}`}
                                        size={180} bgColor="#ffffff" fgColor="#1e293b" level="Q"
                                    />
                                </div>
                                <p className="mt-8 text-3xl font-black text-indigo-900 tracking-[0.2em] bg-indigo-50 px-8 py-3 rounded-2xl border border-indigo-100">
                                    {selectedQR}
                                </p>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                                <button
                                    onClick={() => setSelectedQR(null)}
                                    className="flex-1 px-6 py-4 font-black text-slate-500 bg-white border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest"
                                >
                                    Cerrar
                                </button>
                                <button className="flex-1 px-6 py-4 font-black text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase text-xs tracking-widest active:scale-95">
                                    Imprimir
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {selectedODPDetail && (
                <ODPMatrixModal onClose={() => setSelectedODPDetail(null)} odp={selectedODPDetail} />
            )}

            {/* Modal SAP */}
            {printSap && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 print:hidden">
                            <div>
                                <h3 className="text-base font-black text-slate-800">SAP — {printSap.sap.numero_sap}</h3>
                                <p className="text-xs text-slate-500 font-medium">{printSap.odp.numero_odp} · {printSap.odp.cliente?.nombre_razon_social}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100 uppercase tracking-wider"
                                >
                                    Imprimir
                                </button>
                                <button
                                    onClick={() => setPrintSap(null)}
                                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-slate-50 print:p-0 print:bg-white">
                            <PrintableSAP odp={printSap.odp} sap={printSap.sap} />
                        </div>
                    </div>
                </div>
            )}
        </div>

        {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
        {showProgramacion && <ProgramacionWhatsAppModal onClose={() => setShowProgramacion(false)} />}

        {/* Modal: Registrar llegada PV */}
        <AnimatePresence>
            {pvModalLlegada && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
                >
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800">Registrar llegada</h3>
                                <p className="text-xs text-slate-500 mt-0.5">PV #{pvModalLlegada.numero_pedido} · {pvModalLlegada.proveedor}</p>
                            </div>
                            <button onClick={() => setPvModalLlegada(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                            Fecha de llegada <span className="text-slate-400 font-normal">(opcional)</span>
                        </label>
                        <input
                            type="date"
                            value={pvFechaLlegada}
                            onChange={e => setPvFechaLlegada(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 mb-5"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setPvModalLlegada(null)}
                                className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                                Cancelar
                            </button>
                            <button onClick={handlePvRegistrarLlegada} disabled={pvLoadingAccion}
                                className="flex-1 py-2.5 font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition disabled:opacity-40 text-sm flex items-center justify-center gap-2">
                                <PackageCheck className="w-4 h-4" />
                                {pvLoadingAccion ? 'Guardando...' : 'Registrar'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Modal: Verificar / Problema PV */}
        <AnimatePresence>
            {pvModalAccion && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
                >
                    <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800">
                                    {pvModalAccion.tipo === 'verificar' ? 'Verificar pedido' : 'Reportar problema'}
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">PV #{pvModalAccion.pv.numero_pedido} · {pvModalAccion.pv.proveedor}</p>
                            </div>
                            <button onClick={() => setPvModalAccion(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                            {pvModalAccion.tipo === 'verificar' ? 'Observación (opcional)' : 'Descripción del problema'}
                        </label>
                        <textarea
                            rows={3}
                            value={pvObsAccion}
                            onChange={e => setPvObsAccion(e.target.value)}
                            placeholder={pvModalAccion.tipo === 'verificar' ? 'Todo correcto...' : 'Describir el problema...'}
                            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-5 resize-none"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setPvModalAccion(null)}
                                className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                                Cancelar
                            </button>
                            <button onClick={handlePvAccion} disabled={pvLoadingAccion}
                                className={`flex-1 py-2.5 font-bold text-white rounded-xl transition disabled:opacity-40 text-sm flex items-center justify-center gap-2
                                    ${pvModalAccion.tipo === 'verificar' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}>
                                {pvModalAccion.tipo === 'verificar' ? <ShieldCheck className="w-4 h-4" /> : <TriangleAlert className="w-4 h-4" />}
                                {pvLoadingAccion ? 'Guardando...' : pvModalAccion.tipo === 'verificar' ? 'Verificado' : 'Confirmar problema'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Paleta de color flotante */}
        {colorPicker && (
            <>
                <div className="fixed inset-0 z-[200]" onClick={() => setColorPicker(null)} />
                <div
                    className="fixed z-[201] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3"
                    style={{ top: colorPicker.top, left: colorPicker.left }}
                >
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Resaltar ODP</p>
                    <div className="flex gap-1.5 mb-2">
                        {TALLER_COLORS.map(c => (
                            <button
                                key={c.hex}
                                title={c.label}
                                onClick={() => handleSetColor(colorPicker.odpId, c.hex)}
                                className="w-7 h-7 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400"
                                style={{ backgroundColor: c.hex }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => handleSetColor(colorPicker.odpId, null)}
                        className="w-full text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-wider py-1 rounded-xl hover:bg-rose-50 transition-colors"
                    >
                        ✕ Quitar color
                    </button>
                </div>
            </>
        )}
        </>
    );
};

export default ProduccionPage;
