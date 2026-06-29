import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, RefreshCw, Clock, Package, CheckCircle2, Truck, ListChecks, Eye, Edit3, X, Layers, Plus, Printer, RotateCw, Trash2, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import ODCModal, { SAPItemConContexto } from './components/ODCModal';
import ODCVidriosModal, { ODPItemConContexto } from './components/ODCVidriosModal';
import ODCSinSAPModal from './components/ODCSinSAPModal';
import PrintableODC from './components/PrintableODC';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import FolderTabs from '../../components/FolderTabs';

import { useDataChangedSocket } from '../../store/useSocketNotifications';

import API from '../../services/config';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface ODCItemConContexto {
  id: number;
  sap_item_id: number | null;
  odp_item_id?: number | null;
  item: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  recibido: boolean;
  odp_directo?: { id: number; numero_odp: string; estado_produccion: string; cliente?: { nombre_razon_social: string } };
  sap_item?: {
    codigo?: string;
    descripcion?: string;
    cantidad?: number;
    dimension?: string;
    und?: string;
    observacion?: string;
    modificado?: boolean;
    datos_anteriores?: { codigo?: string; descripcion?: string; dimension?: string; cantidad?: number; und?: string; observacion?: string } | null;
    SAP?: {
      numero_sap: string;
      ODP?: {
        id: number;
        numero_odp: string;
        cliente?: { nombre_razon_social: string };
        asesor?: { nombre_completo: string };
      };
    };
  };
}

interface ODC {
  id: number; numero_odc: string; proveedor: string;
  tipo?: 'perfileria' | 'vidrio' | 'consumible';
  estado: 'pendiente' | 'en_transito' | 'recibido' | 'problema';
  notas: string; fecha_creacion: string; fecha_recepcion?: string;
  creador: { id: number; nombre_completo: string };
  items: ODCItemConContexto[];
  // backward compat: ODCs antiguas con sap_id tienen esto
  sap?: {
    id: number; numero_sap: string;
    ODP?: {
      id: number; numero_odp: string; descripcion: string; estado_produccion: string;
      cliente: { id: number; nombre_razon_social: string };
      asesor: { id: number; nombre_completo: string };
    };
  };
  // ODC con odp_id directo en cabecera
  odp?: {
    id: number; numero_odp: string; estado_produccion: string;
    cliente: { id: number; nombre_razon_social: string };
  };
}

// Helper: extrae ODPs únicas de una ODC (multi-SAP, vidrio, legacy o directo)
const getODPsDeODC = (odc: ODC): Array<{ numero_odp: string; cliente: string }> => {
  const map = new Map<string, string>();
  for (const it of odc.items) {
    const odp = it.sap_item?.SAP?.ODP ?? (it as any).odp_item?.ODP ?? it.odp_directo;
    if (odp?.numero_odp) map.set(odp.numero_odp, odp.cliente?.nombre_razon_social || '');
  }
  // fallback 1: sap header (ODCs antiguas con sap_id)
  if (map.size === 0 && odc.sap?.ODP) {
    map.set(odc.sap.ODP.numero_odp, odc.sap.ODP.cliente?.nombre_razon_social || '');
  }
  // fallback 2: odp_id directo en cabecera
  if (map.size === 0 && odc.odp?.numero_odp) {
    map.set(odc.odp.numero_odp, odc.odp.cliente?.nombre_razon_social || '');
  }
  return Array.from(map.entries()).map(([numero_odp, cliente]) => ({ numero_odp, cliente }));
};

// Helper: extrae números de SAP únicos de una ODC (items o header legacy)
const getSAPsDeODC = (odc: ODC): string[] => {
  const saps = new Set<string>();
  for (const it of odc.items) {
    const num = it.sap_item?.SAP?.numero_sap;
    if (num) saps.add(num);
  }
  if (saps.size === 0 && odc.sap?.numero_sap) saps.add(odc.sap.numero_sap);
  return Array.from(saps);
};

// Pieza de inventario de perfilería (dropdown / gestión de existencia)
interface PiezaPerfil {
  id: number;
  consecutivo: number;
  codigo: string | null;
  mm: number | null;
  ubicacion: string | null;
  fecha_corte?: string | null;
}

// SAPItem de perfilería cubierto por existencia (pestaña "En Existencia")
interface PerfileriaExistenciaItem {
  id: number;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  und?: string;
  exist_perf?: string;
  SAP?: {
    numero_sap: string;
    ODP?: {
      id: number;
      numero_odp: string;
      estado_produccion?: string;
      cliente?: { nombre_razon_social: string };
      asesor?: { nombre_completo: string };
    };
  };
}

// Texto descriptivo compartido de las piezas asignadas (mismo formato que ODCModal.formatExistPerf)
const formatExistPerf = (piezas: PiezaPerfil[]): string =>
  piezas
    .map(p => `${p.mm != null ? `${Math.round(p.mm)} mm` : 'sin mm'} — #${p.consecutivo} (${p.ubicacion || '—'})`)
    .join(' / ');

// ─── Constantes UI ──────────────────────────────────────────────────────────

const ESTADO_PROD_COLOR: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-600', MEDICION: 'bg-yellow-100 text-yellow-700',
  ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700',
  VIDRIO_RECIBIDO: 'bg-cyan-100 text-cyan-700', ACCESORIOS_SEPARADOS: 'bg-indigo-100 text-indigo-700',
  LISTO_INSTALAR: 'bg-green-100 text-green-700', PROGRAMADA: 'bg-violet-100 text-violet-700',
  INSTALADA: 'bg-emerald-100 text-emerald-700', ENTREGADA: 'bg-teal-100 text-teal-700',
  PAUSADA: 'bg-red-100 text-red-700',
};

const ODC_ESTADO_STYLE: Record<string, { label: string; className: string }> = {
  pendiente:   { label: 'Pendiente',   className: 'bg-amber-100 text-amber-700 border-amber-200' },
  en_transito: { label: 'En tránsito', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  recibido:    { label: 'Recibido',    className: 'bg-green-100 text-green-700 border-green-200' },
  problema:    { label: 'Problema',    className: 'bg-red-100 text-red-700 border-red-200' },
};

const TABS = [
  { key: 'pendientes',   label: 'Pendientes',   icon: Clock },
  { key: 'seguimiento',  label: 'Seguimiento',  icon: Truck },
  { key: 'recibidas',    label: 'Recibidas',    icon: CheckCircle2 },
  { key: 'vidrios',      label: 'Vidrios',      icon: Layers },
  { key: 'existencia',   label: 'En Existencia', icon: Package },
];

const ESTADO_COMPRA_STYLE: Record<string, { label: string; className: string }> = {
  pendiente:      { label: 'Pendiente',      className: 'bg-amber-50 text-amber-700 border-amber-200' },
  en_odc:         { label: 'En ODC',         className: 'bg-blue-50 text-blue-700 border-blue-200' },
  en_existencia:  { label: 'En existencia',  className: 'bg-green-50 text-green-700 border-green-200' },
};

// Helper: construye texto de tooltip comparando datos del ODCItem (viejos) vs SAPItem actual
const buildTooltipModificado = (it: ODCItemConContexto): string => {
  const lines: string[] = ['⚠ ÍTEM MODIFICADO — valores al crear la ODC vs actuales:'];
  const comparar = (campo: string, viejo: string | number | undefined, nuevo: string | number | undefined) => {
    const v = String(viejo ?? '—'), n = String(nuevo ?? '—');
    if (v !== n) lines.push(`  ${campo}: "${v}" → "${n}"`);
  };
  comparar('Código', it.codigo, it.sap_item?.codigo);
  comparar('Descripción', it.descripcion, it.sap_item?.descripcion);
  comparar('Cantidad', it.cantidad, it.sap_item?.cantidad);
  comparar('Dimensión', it.sap_item?.datos_anteriores?.dimension, it.sap_item?.dimension);
  comparar('Und.', it.sap_item?.datos_anteriores?.und, it.sap_item?.und);
  return lines.join('\n');
};

// ─── Componente tarjeta ODC (Seguimiento / Recibidas) ───────────────────────

const ODCCard: React.FC<{ odc: ODC; onActualizar: () => void; onEstadoCambiado?: (nuevoEstado: string) => void; onFichaOdp?: (id: number) => void; soloLectura?: boolean }> = ({ odc, onActualizar, onEstadoCambiado, onFichaOdp, soloLectura }) => {
  const [loading, setLoading] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const [itemsDetalle, setItemsDetalle] = useState<any[] | null>(null);
  const [loadingItemsDetalle, setLoadingItemsDetalle] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editProveedor, setEditProveedor] = useState(odc.proveedor);
  const [editNotas, setEditNotas] = useState(odc.notas || '');
  const [editEstado, setEditEstado] = useState<string>(odc.estado);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [sincronizandoItem, setSincronizandoItem] = useState<number | null>(null);
  // Edición de ítems (perfilería/consumible) dentro del modal Editar
  type EditLinea = { id?: number; sap_item_id?: number | null; codigo: string; descripcion: string; cantidad: number };
  const [editItems, setEditItems] = useState<EditLinea[]>([]);
  const [guardandoItems, setGuardandoItems] = useState(false);
  const [mostrarSelectorPanel, setMostrarSelectorPanel] = useState(false);
  const [panelItems, setPanelItems] = useState<SAPItemConContexto[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelSeleccion, setPanelSeleccion] = useState<Set<number>>(new Set());
  const [showRecibirModal, setShowRecibirModal] = useState(false);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Set<number>>(new Set());
  const [recibiendoItems, setRecibiendoItems] = useState(false);

  // ¿La ODC tiene material modificado sin actualizar? Bloquea la recepción.
  const hayModificados = odc.items.some(it => it.sap_item?.modificado === true);
  // ¿Tiene material ya recibido (total o parcial)? No se puede cancelar.
  const tieneRecibidos = odc.estado === 'recibido' || odc.items.some(it => it.recibido === true);

  const token = sessionStorage.getItem('token');

  const cargarItemsDetalle = async (): Promise<any[]> => {
    if (itemsDetalle !== null) return itemsDetalle;
    setLoadingItemsDetalle(true);
    try {
      const res = await axios.get(`${API}/api/compras/odc/${odc.id}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItemsDetalle(res.data);
      return res.data;
    } catch (e) {
      console.error('Error cargando ítems ODC:', e);
      return odc.items;
    } finally {
      setLoadingItemsDetalle(false);
    }
  };
  const odpsInfo = getODPsDeODC(odc);
  const sapsInfo = getSAPsDeODC(odc);
  const isMultiODP = odpsInfo.length > 1;
  // legacy compat + fallback a odp directo
  const odp = odc.sap?.ODP ?? odc.odp;
  const estadoProd = odp?.estado_produccion || odpsInfo[0] && '' || '';
  const est = ODC_ESTADO_STYLE[odc.estado] || ODC_ESTADO_STYLE['pendiente'];

  const handleGuardarEdicion = async () => {
    // Si el usuario seleccionó "Recibido" y la ODC no está recibida → abrir modal de items
    if (editEstado === 'recibido' && odc.estado !== 'recibido') {
      if (hayModificados) {
        toast.error('Hay materiales modificados sin actualizar. Actualiza la orden antes de recibir.');
        return;
      }
      // Guardar proveedor/notas sin cambiar el estado
      if (editProveedor !== odc.proveedor || editNotas !== (odc.notas || '')) {
        setLoading(true);
        try {
          await axios.put(
            `${API}/api/compras/odc/${odc.id}`,
            { proveedor: editProveedor, notas: editNotas, estado: odc.estado },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (e: any) {
          console.error('Error al guardar ODC:', e?.response?.data || e?.message);
        } finally { setLoading(false); }
      }
      setEditando(false);
      const noRecibidos = new Set(odc.items.filter(it => !it.recibido).map(it => it.id));
      setItemsSeleccionados(noRecibidos);
      setShowRecibirModal(true);
      return;
    }

    setLoading(true);
    try {
      await axios.put(
        `${API}/api/compras/odc/${odc.id}`,
        { proveedor: editProveedor, notas: editNotas, estado: editEstado },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditando(false);
      onActualizar();
    } catch (e: any) {
      console.error('Error al guardar ODC:', e?.response?.data || e?.message);
    } finally { setLoading(false); }
  };

  const handleConfirmarRecepcion = async () => {
    if (itemsSeleccionados.size === 0) return;
    setRecibiendoItems(true);
    try {
      await axios.put(
        `${API}/api/compras/odc/${odc.id}/recibir-items`,
        { items_recibidos: Array.from(itemsSeleccionados) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowRecibirModal(false);
      // Si se marcaron todos → mover a recibidas
      const listaItems = itemsDetalle ?? odc.items;
      const todosRecibidos = listaItems.every((it: any) => it.recibido || itemsSeleccionados.has(it.id));
      if (todosRecibidos && onEstadoCambiado) {
        onEstadoCambiado('recibido');
      } else {
        onActualizar();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al registrar la recepción');
    } finally { setRecibiendoItems(false); }
  };

  const handleEliminar = async () => {
    setEliminando(true);
    try {
      await axios.delete(`${API}/api/compras/odc/${odc.id}`,
        { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`ODC ${odc.numero_odc} eliminada`);
      setConfirmDelete(false);
      onActualizar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo eliminar la ODC');
    } finally { setEliminando(false); }
  };

  // ── Edición de ítems (perfilería/consumible) ──
  const puedeEditarItems = odc.tipo !== 'vidrio' && !hayModificados && !tieneRecibidos;
  const motivoBloqueoItems = tieneRecibidos
    ? 'hay material ya recibido'
    : hayModificados ? 'hay materiales modificados sin sincronizar' : '';

  const abrirSelectorPanel = async () => {
    setPanelSeleccion(new Set());
    setMostrarSelectorPanel(true);
    if (panelItems.length === 0) {
      setPanelLoading(true);
      try {
        const res = await axios.get(`${API}/api/compras/panel`, { headers: { Authorization: `Bearer ${token}` }, params: { limit: 500 } });
        setPanelItems(res.data.rows || []);
      } catch (e: any) {
        toast.error(e?.response?.data?.error || 'Error al cargar ítems pendientes');
      } finally { setPanelLoading(false); }
    }
  };

  const confirmarSelectorPanel = () => {
    const yaSapIds = new Set(editItems.map(l => l.sap_item_id).filter(Boolean) as number[]);
    const nuevos: EditLinea[] = panelItems
      .filter(it => panelSeleccion.has(it.id) && !yaSapIds.has(it.id))
      .map(it => ({ sap_item_id: it.id, codigo: it.codigo, descripcion: it.descripcion, cantidad: Number(it.cantidad) || 0 }));
    setEditItems(prev => [...prev, ...nuevos]);
    setMostrarSelectorPanel(false);
  };

  const handleGuardarItems = async () => {
    if (editItems.length === 0) { toast.error('La ODC debe conservar al menos un ítem'); return; }
    setGuardandoItems(true);
    try {
      // 1. Guardar cambios de ítems (incluye proveedor/notas en el mismo PUT)
      await axios.put(`${API}/api/compras/odc/${odc.id}/items`, {
        proveedor: editProveedor,
        notas: editNotas,
        items: editItems.map(l => ({
          ...(l.id != null ? { id: l.id } : {}),
          ...(l.sap_item_id != null ? { sap_item_id: l.sap_item_id } : {}),
          codigo: l.codigo,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
        })),
      }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('ODC actualizada');
      setEditando(false);
      onActualizar();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo actualizar la ODC');
    } finally { setGuardandoItems(false); }
  };

  // Caso 1 — "Actualizar orden": sincroniza la línea de la ODC con la cantidad nueva del SAP
  const handleSincronizarItem = async (odcItemId: number) => {
    setSincronizandoItem(odcItemId);
    try {
      await axios.patch(`${API}/api/compras/odc/${odc.id}/sincronizar-item/${odcItemId}`, {},
        { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Orden actualizada con la nueva cantidad');
      onActualizar();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'No se pudo actualizar el ítem');
    } finally { setSincronizandoItem(null); }
  };

  const handleImprimir = () => {
    const area = document.getElementById(`odc-print-area-${odc.id}`);
    if (!area) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>ODC ${odc.numero_odc}</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        @page { size: letter portrait; margin: 8mm; }
        body { margin: 0; padding: 0; font-family: sans-serif; }
        .odc-table { width: 100%; border-collapse: collapse; }
        .odc-table th, .odc-table td { border: 1px solid #cbd5e1; padding: 3px 6px; font-size: 10px; }
        .odc-table th { background-color: #1e293b; color: white; font-weight: bold; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; }
        .odc-table tr:nth-child(even) { background-color: #f8fafc; }
      </style>
    </head><body>${area.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  };

  const hayItemsParciales = odc.estado === 'pendiente' && odc.items.some(it => it.recibido);

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5 flex-wrap">
              <span className="font-black text-indigo-700 text-base">{odc.numero_odc}</span>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${est.className}`}>{est.label}</span>
              {hayItemsParciales && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Recepción parcial
                </span>
              )}
              {isMultiODP && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                  {odpsInfo.length} ODPs
                </span>
              )}
              {!isMultiODP && estadoProd && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_PROD_COLOR[estadoProd] || 'bg-slate-100 text-slate-600'}`}>
                  {estadoProd.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            {isMultiODP ? (
              <p className="text-sm font-semibold text-slate-700">
                {odpsInfo.map(o => o.cliente).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3).join(', ')}
                {odpsInfo.length > 3 && ` +${odpsInfo.length - 3} más`}
              </p>
            ) : (
              <p className="text-sm font-semibold text-slate-700">{odpsInfo[0]?.cliente || odp?.cliente?.nombre_razon_social}</p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              {isMultiODP ? (
                <span>ODPs: <span className="font-bold text-slate-700">{odpsInfo.map(o => o.numero_odp).join(', ')}</span></span>
              ) : (
                <>
                  <span>ODP: <span className="font-bold text-slate-700">{odpsInfo[0]?.numero_odp || odp?.numero_odp}</span></span>
                  {sapsInfo.length > 0 && <span>SAP: <span className="font-bold text-slate-700">{sapsInfo.join(', ')}</span></span>}
                </>
              )}
              <span>Proveedor: <span className="font-bold text-slate-700">{odc.proveedor}</span></span>
              <span>Creada: <span className="font-bold text-slate-700">{new Date(odc.fecha_creacion).toLocaleDateString('es-CO')}</span></span>
              {odc.fecha_recepcion && (
                <span>Recibida: <span className="font-bold text-green-700">{new Date(odc.fecha_recepcion).toLocaleDateString('es-CO')}</span></span>
              )}
            </div>
            {odc.notas && <p className="text-xs text-slate-400 italic mt-1">"{odc.notas}"</p>}
          </div>

          {/* Botones de acción */}
          <div className="ml-4 shrink-0 flex items-center gap-1.5">
            <button
              onClick={() => setVerDetalle(true)}
              title="Ver detalles"
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition"
            >
              <Eye className="w-3.5 h-3.5" /> Ver
            </button>
            {!soloLectura && (
              <button
                onClick={() => {
                  setEditProveedor(odc.proveedor);
                  setEditNotas(odc.notas || '');
                  setEditEstado(odc.estado);
                  setEditItems(odc.items.map(it => ({
                    id: it.id,
                    sap_item_id: it.sap_item_id,
                    codigo: it.codigo || '',
                    descripcion: it.descripcion || '',
                    cantidad: Number(it.cantidad) || 0,
                  })));
                  setEditando(true);
                }}
                title="Editar ODC"
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            {!soloLectura && !tieneRecibidos && (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Eliminar ODC"
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </button>
            )}
            {!soloLectura && tieneRecibidos && (
              <span
                title="No se puede eliminar: ya tiene material recibido"
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-100 text-slate-300 rounded-lg cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" /> Eliminar
              </span>
            )}
          </div>
        </div>

        {/* Items de la ODC */}
        <div className="border-t border-slate-100 overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left w-28">CÓDIGO</th>
                <th className="px-4 py-2 text-left">DESCRIPCIÓN</th>
                <th className="px-4 py-2 text-center w-16">CANT.</th>
                <th className="px-4 py-2 text-left w-24">DIMENSIÓN</th>
                <th className="px-4 py-2 text-left w-36">OBSERVACIÓN</th>
                <th className="px-4 py-2 text-left w-24">SAP</th>
                <th className="px-4 py-2 text-left w-24">ODP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {odc.items.map((it, i) => {
                const pendiente = !it.recibido && odc.estado === 'pendiente';
                const esModificado = it.sap_item?.modificado === true;
                const rowClass = esModificado
                  ? 'bg-red-50 border-l-4 border-red-400'
                  : it.recibido ? 'bg-green-50/40'
                  : hayItemsParciales && pendiente ? 'bg-amber-50'
                  : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30';
                return (
                  <tr key={i} className={rowClass} title={esModificado ? buildTooltipModificado(it) : undefined}>
                    <td className="px-4 py-1.5 font-mono text-blue-700 font-bold">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{it.codigo || '—'}</span>
                        {esModificado && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white align-middle">MOD</span>
                        )}
                        {esModificado && !soloLectura && (
                          <button
                            onClick={() => handleSincronizarItem(it.id)}
                            disabled={sincronizandoItem === it.id}
                            title="Actualizar la orden con la nueva cantidad del SAP"
                            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
                          >
                            <RotateCw className="w-2.5 h-2.5" /> {sincronizandoItem === it.id ? '...' : 'Actualizar'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-slate-700">{it.descripcion || '—'}</td>
                    <td className="px-4 py-1.5 text-center font-bold text-slate-600">{Number(it.cantidad) % 1 === 0 ? Math.round(Number(it.cantidad)) : it.cantidad}</td>
                    <td className="px-4 py-1.5 text-slate-500">{it.sap_item?.dimension || '—'}</td>
                    <td className="px-4 py-1.5 text-slate-400 text-[10px] max-w-[140px] truncate" title={it.sap_item?.observacion || ''}>{it.sap_item?.observacion || '—'}</td>
                    <td className="px-4 py-1.5 text-indigo-600 font-bold">{it.sap_item?.SAP?.numero_sap || odc.sap?.numero_sap || '—'}</td>
                    <td className="px-4 py-1.5 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => { const id = it.sap_item?.SAP?.ODP?.id || (it as any).odp_item?.ODP?.id || it.odp_directo?.id || odc.sap?.ODP?.id || odc.odp?.id; if (id) onFichaOdp?.(id); }}>{it.sap_item?.SAP?.ODP?.numero_odp || (it as any).odp_item?.ODP?.numero_odp || it.odp_directo?.numero_odp || odc.sap?.ODP?.numero_odp || odc.odp?.numero_odp || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL VER DETALLES ── */}
      <AnimatePresence>
        {verDetalle && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 print:hidden`}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-black text-slate-800">{odc.numero_odc}</h3>
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${est.className}`}>{est.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">Detalle completo de la orden de compra</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImprimir}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
                  >
                    <Printer className="w-3.5 h-3.5" /> Imprimir
                  </button>
                  <button onClick={() => setVerDetalle(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Info general */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Número ODC</span>
                    <p className="font-black text-indigo-700 text-sm mt-0.5">{odc.numero_odc}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Estado</span>
                    <p className="mt-0.5">
                      <span className={`inline-block font-bold px-2.5 py-0.5 rounded-full border text-xs ${est.className}`}>{est.label}</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Proveedor</span>
                    <p className="font-semibold text-slate-700 mt-0.5">{odc.proveedor}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Creador</span>
                    <p className="font-semibold text-slate-700 mt-0.5">{odc.creador?.nombre_completo}</p>
                  </div>
                  {isMultiODP ? (
                    <div className="col-span-2">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">ODPs involucradas</span>
                      <p className="font-semibold text-slate-700 mt-0.5">{odpsInfo.map(o => `${o.numero_odp} (${o.cliente})`).join(' · ')}</p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider">SAP</span>
                        <p className="font-semibold text-slate-700 mt-0.5">{sapsInfo.join(', ') || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider">ODP</span>
                        <p className="font-semibold text-slate-700 mt-0.5">{odpsInfo[0]?.numero_odp || odp?.numero_odp || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Cliente</span>
                        <p className="font-semibold text-slate-700 mt-0.5">{odpsInfo[0]?.cliente || odp?.cliente?.nombre_razon_social || '—'}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <span className="text-slate-400 font-bold uppercase tracking-wider">Fecha creación</span>
                    <p className="font-semibold text-slate-700 mt-0.5">{new Date(odc.fecha_creacion).toLocaleDateString('es-CO')}</p>
                  </div>
                  {odc.fecha_recepcion && (
                    <div>
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Fecha recepción</span>
                      <p className="font-semibold text-green-700 mt-0.5">{new Date(odc.fecha_recepcion).toLocaleDateString('es-CO')}</p>
                    </div>
                  )}
                  {odc.notas && (
                    <div className="col-span-2">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Notas</span>
                      <p className="text-slate-600 italic mt-0.5">"{odc.notas}"</p>
                    </div>
                  )}
                </div>

                {/* Tabla de ítems */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Items</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs min-w-[600px]">
                      <thead className="bg-slate-700 text-white text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2 text-left w-28">CÓDIGO</th>
                          <th className="px-3 py-2 text-left">DESCRIPCIÓN</th>
                          <th className="px-3 py-2 w-16 text-center">CANT.</th>
                          <th className="px-3 py-2 text-left w-24">DIMENSIÓN</th>
                          <th className="px-3 py-2 text-left w-36">OBSERVACIÓN</th>
                          <th className="px-3 py-2 text-left w-24">SAP</th>
                          <th className="px-3 py-2 text-left w-24">ODP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {odc.items.map((it, i) => {
                          const pendiente = !it.recibido && odc.estado === 'pendiente';
                          const esModificado = it.sap_item?.modificado === true;
                          const rowClass = esModificado
                            ? 'bg-red-50 border-l-4 border-red-400'
                            : it.recibido ? 'bg-green-50/60'
                            : hayItemsParciales && pendiente ? 'bg-amber-50'
                            : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';
                          return (
                            <tr key={i} className={rowClass} title={esModificado ? buildTooltipModificado(it) : undefined}>
                              <td className="px-3 py-2 font-mono text-blue-700 font-bold">
                                {it.codigo || '—'}
                                {esModificado && (
                                  <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-red-500 text-white align-middle">MOD</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{it.descripcion || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold text-slate-600">{Number(it.cantidad) % 1 === 0 ? Math.round(Number(it.cantidad)) : it.cantidad}</td>
                              <td className="px-3 py-2 text-slate-500">{it.sap_item?.dimension || '—'}</td>
                              <td className="px-3 py-2 text-slate-400 text-[10px] max-w-[140px] truncate" title={it.sap_item?.observacion || ''}>{it.sap_item?.observacion || '—'}</td>
                              <td className="px-3 py-2 text-indigo-600 font-bold">{it.sap_item?.SAP?.numero_sap || odc.sap?.numero_sap || '—'}</td>
                              <td className="px-3 py-2 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => { const id = it.sap_item?.SAP?.ODP?.id || (it as any).odp_item?.ODP?.id || odc.sap?.ODP?.id; if (id) onFichaOdp?.(id); }}>{it.sap_item?.SAP?.ODP?.numero_odp || (it as any).odp_item?.ODP?.numero_odp || odc.sap?.ODP?.numero_odp || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hayItemsParciales && (
                    <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      Amarillo = pendiente de recibir · Verde = ya recibido
                    </p>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={() => setVerDetalle(false)}
                  className="w-full py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── ÁREA DE IMPRESIÓN (siempre en DOM cuando el modal está abierto, oculta en pantalla) ── */}
      {verDetalle && (
        <div id={`odc-print-area-${odc.id}`} style={{ display: 'none' }}>
          <PrintableODC odc={odc} />
        </div>
      )}

      {/* ── MODAL EDITAR ── */}
      <AnimatePresence>
        {editando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-base font-black text-slate-800">Editar ODC — {odc.numero_odc}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Modifica proveedor, notas{odc.tipo !== 'vidrio' ? ', ítems' : ''} o estado</p>
                </div>
                <button onClick={() => setEditando(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                    Proveedor <span className="text-red-400">*</span>
                  </label>
                  <input
                    value={editProveedor}
                    onChange={e => setEditProveedor(e.target.value)}
                    placeholder="Nombre del proveedor..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Notas (opcional)</label>
                  <input
                    value={editNotas}
                    onChange={e => setEditNotas(e.target.value)}
                    placeholder="Observaciones..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                {/* ── Edición de ítems (perfilería / consumible) ── */}
                {odc.tipo !== 'vidrio' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Ítems</label>
                      {puedeEditarItems && (
                        <button
                          onClick={() => { if (odc.tipo === 'perfileria') { abrirSelectorPanel(); } else { setEditItems(prev => [...prev, { codigo: '', descripcion: '', cantidad: 1 }]); } }}
                          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 transition"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar ítem
                        </button>
                      )}
                    </div>
                    {!puedeEditarItems ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0" />
                        No se pueden editar los ítems: {motivoBloqueoItems}.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left w-24">Código</th>
                              <th className="px-3 py-2 text-left">Descripción</th>
                              <th className="px-3 py-2 text-center w-20">Cant.</th>
                              <th className="px-3 py-2 w-10" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {editItems.length === 0 ? (
                              <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-400">Sin ítems. Agrega al menos uno.</td></tr>
                            ) : editItems.map((linea, idx) => (
                              <tr key={linea.id ?? `nuevo-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                                <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">
                                  {odc.tipo === 'consumible' ? (
                                    <input
                                      value={linea.codigo}
                                      onChange={e => setEditItems(prev => prev.map((l, i) => i === idx ? { ...l, codigo: e.target.value } : l))}
                                      placeholder="Código"
                                      className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                  ) : (linea.codigo || '—')}
                                </td>
                                <td className="px-3 py-1.5 text-slate-700">
                                  {odc.tipo === 'consumible' ? (
                                    <input
                                      value={linea.descripcion}
                                      onChange={e => setEditItems(prev => prev.map((l, i) => i === idx ? { ...l, descripcion: e.target.value } : l))}
                                      placeholder="Descripción"
                                      className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                  ) : (linea.descripcion || '—')}
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <input
                                    type="number" min={0} step={1}
                                    value={linea.cantidad}
                                    onChange={e => setEditItems(prev => prev.map((l, i) => i === idx ? { ...l, cantidad: parseFloat(e.target.value) || 0 } : l))}
                                    className="w-16 text-center font-bold text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  />
                                </td>
                                <td className="px-3 py-1.5 text-center">
                                  <button
                                    onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                                    title="Quitar ítem"
                                    className="p-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Estado</label>
                  <select
                    value={editEstado}
                    onChange={e => setEditEstado(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="recibido">Recibido</option>
                  </select>
                  {editEstado === 'recibido' && odc.estado !== 'recibido' && (
                    <p className="text-[11px] text-amber-600 mt-1.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                      Al guardar se abrirá la selección de ítems recibidos
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={() => setEditando(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                {(() => {
                  const irARecibido = editEstado === 'recibido' && odc.estado !== 'recibido';
                  // Para ODC editable de ítems (perfilería/consumible) y sin pasar a recibido → PUT items
                  const usarPutItems = odc.tipo !== 'vidrio' && puedeEditarItems && !irARecibido;
                  return (
                    <button
                      onClick={usarPutItems ? handleGuardarItems : handleGuardarEdicion}
                      disabled={(usarPutItems ? guardandoItems : loading) || !editProveedor.trim()}
                      className="flex-1 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
                    >
                      {(usarPutItems ? guardandoItems : loading)
                        ? 'Guardando...'
                        : irARecibido ? 'Siguiente →' : 'Guardar cambios'}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL RECIBIR ITEMS ── */}
      <AnimatePresence>
        {showRecibirModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col border border-slate-200"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-base font-black text-slate-800">Recepción de Materiales</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{odc.numero_odc} · Selecciona los ítems que llegaron físicamente</p>
                </div>
                <button onClick={() => setShowRecibirModal(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex items-center justify-between mb-3 px-1">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-700">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-indigo-600"
                      checked={odc.items.filter(it => !it.recibido).length > 0 && odc.items.filter(it => !it.recibido).every(it => itemsSeleccionados.has(it.id))}
                      onChange={e => {
                        const noRecibidos = odc.items.filter(it => !it.recibido).map(it => it.id);
                        if (e.target.checked) {
                          setItemsSeleccionados(new Set(noRecibidos));
                        } else {
                          setItemsSeleccionados(new Set());
                        }
                      }}
                    />
                    Seleccionar todos
                  </label>
                  <span className="text-xs text-slate-500">
                    {itemsSeleccionados.size} de {odc.items.filter(it => !it.recibido).length} ítems pendientes
                  </span>
                </div>

                <div className="space-y-2">
                  {odc.items.map(it => (
                    <label
                      key={it.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        it.recibido
                          ? 'bg-green-50 border-green-200 opacity-60 cursor-not-allowed'
                          : itemsSeleccionados.has(it.id)
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-indigo-600 mt-0.5 shrink-0"
                        checked={it.recibido || itemsSeleccionados.has(it.id)}
                        disabled={it.recibido}
                        onChange={e => {
                          if (it.recibido) return;
                          setItemsSeleccionados(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(it.id) : next.delete(it.id);
                            return next;
                          });
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-blue-700 text-xs">{it.codigo || '—'}</span>
                          <span className="text-slate-700 text-xs">{it.descripcion || '—'}</span>
                          {it.recibido && <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full border border-green-200">Ya recibido</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                          <span>Cant: <strong className="text-slate-600">{it.cantidad}</strong></span>
                          {it.sap_item?.dimension && <span>Dim: <strong className="text-slate-600">{it.sap_item.dimension}</strong></span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {itemsSeleccionados.size > 0 && itemsSeleccionados.size < odc.items.filter(it => !it.recibido).length && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                    <strong>Recepción parcial:</strong> La ODC permanecerá en estado <em>Pendiente</em> con los ítems no seleccionados resaltados en amarillo.
                  </div>
                )}
                {itemsSeleccionados.size > 0 && odc.items.filter(it => !it.recibido).every(it => itemsSeleccionados.has(it.id)) && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700">
                    <strong>Recepción completa:</strong> La ODC pasará a estado <em>Recibida</em> y los ítems SAP se marcarán como <em>en existencia</em>.
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={() => setShowRecibirModal(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarRecepcion}
                  disabled={recibiendoItems || itemsSeleccionados.size === 0}
                  className="flex-1 py-2.5 font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition disabled:opacity-40"
                >
                  {recibiendoItems ? 'Procesando...' : `Confirmar recepción (${itemsSeleccionados.size})`}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL CONFIRMAR ELIMINACIÓN ── */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 mb-2 text-center">¿Eliminar {odc.numero_odc}?</h3>
              <p className="text-sm text-slate-500 mb-4 text-center">
                La orden se borrará <strong>permanentemente</strong> y no se podrá recuperar. El material que no esté en otra orden activa vuelve a <strong>Pendientes</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={eliminando}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Volver
                </button>
                <button
                  onClick={handleEliminar}
                  disabled={eliminando}
                  className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition disabled:opacity-50"
                >
                  {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── SUB-MODAL: SELECTOR DE ÍTEMS PENDIENTES (agregar a ODC perfilería) ── */}
      <AnimatePresence>
        {mostrarSelectorPanel && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-slate-200"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-base font-black text-slate-800">Agregar ítem desde Pendientes</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Selecciona uno o varios ítems de perfilería pendientes</p>
                </div>
                <button onClick={() => setMostrarSelectorPanel(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {panelLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-7 h-7 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : panelItems.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-12">No hay ítems pendientes.</p>
                ) : (
                  <div className="space-y-2">
                    {panelItems.map(it => {
                      const yaEnODC = editItems.some(l => l.sap_item_id === it.id);
                      const sel = panelSeleccion.has(it.id);
                      return (
                        <label
                          key={it.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                            yaEnODC ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                            : sel ? 'bg-indigo-50 border-indigo-300 cursor-pointer'
                            : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-indigo-600 mt-0.5 shrink-0"
                            checked={sel}
                            disabled={yaEnODC}
                            onChange={e => {
                              if (yaEnODC) return;
                              setPanelSeleccion(prev => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(it.id) : next.delete(it.id);
                                return next;
                              });
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-blue-700 text-xs">{it.codigo || '—'}</span>
                              <span className="text-slate-700 text-xs">{it.descripcion || '—'}</span>
                              {yaEnODC && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Ya en la ODC</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                              <span>Dim: <strong className="text-slate-600">{it.dimension || '—'}</strong></span>
                              <span>Cant: <strong className="text-slate-600">{it.cantidad}</strong></span>
                              <span>SAP: <strong className="text-indigo-600">{it.SAP?.numero_sap || '—'}</strong></span>
                              <span>ODP: <strong className="text-indigo-700">{it.SAP?.ODP?.numero_odp || '—'}</strong></span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                <button
                  onClick={() => setMostrarSelectorPanel(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarSelectorPanel}
                  disabled={panelSeleccion.size === 0}
                  className="flex-1 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
                >
                  Agregar ({panelSeleccion.size})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

// ─── Componente principal ────────────────────────────────────────────────────

const ComprasPage: React.FC = () => {
  const [tab, setTab] = useState<'pendientes' | 'seguimiento' | 'recibidas' | 'vidrios' | 'existencia'>('pendientes');
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);
  const [itemsPendientes, setItemsPendientes] = useState<SAPItemConContexto[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mostrarModalSinSAP, setMostrarModalSinSAP] = useState(false);
  const [odcsSeguimiento, setOdcsSeguimiento] = useState<ODC[]>([]);
  const [odcsRecibidas, setOdcsRecibidas] = useState<ODC[]>([]);
  const [vidriosFlat, setVidriosFlat] = useState<ODPItemConContexto[]>([]);
  const [seleccionadosVidrios, setSeleccionadosVidrios] = useState<Set<number>>(new Set());
  const [mostrarModalVidrios, setMostrarModalVidrios] = useState(false);
  const [vidriosExistencia, setVidriosExistencia] = useState<ODPItemConContexto[]>([]);
  const [perfileriaExistencia, setPerfileriaExistencia] = useState<PerfileriaExistenciaItem[]>([]);
  const [revirtiendoExist, setRevirtiendoExist] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendientesPage, setPendientesPage] = useState(1);
  const [pendientesTotalPages, setPendientesTotalPages] = useState(1);
  const [pendientesLoadingMore, setPendientesLoadingMore] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [codigosConStock, setCodigosConStock] = useState<Set<string>>(new Set());
  const [stockPorCodigo, setStockPorCodigo] = useState<Record<string, PiezaPerfil[]>>({});
  // ── Gestión de existencia (modal Pendientes "Exis. Perf.") ──
  const [gestionItem, setGestionItem] = useState<SAPItemConContexto | null>(null);
  const [gestionSel, setGestionSel] = useState<Set<number>>(new Set()); // consecutivos seleccionados
  const [gestionLoading, setGestionLoading] = useState(false);
  const [gestionGuardando, setGestionGuardando] = useState(false);
  const [gestionVista, setGestionVista] = useState<'piezas' | 'faltante'>('piezas');
  const [faltanteCant, setFaltanteCant] = useState('');
  const [faltanteDim, setFaltanteDim] = useState('');

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchTab = useCallback(async (t: string, page: number = 1, append: boolean = false) => {
    setLoading(true);
    try {
      if (t === 'pendientes') {
        const res = await axios.get(`${API}/api/compras/panel`, { headers, params: { page, limit: 50 } });
        if (append) {
          setItemsPendientes(prev => [...prev, ...res.data.rows]);
        } else {
          setItemsPendientes(res.data.rows);
          setPendientesPage(page);
          setPendientesTotalPages(res.data.totalPages);
        }
        setSeleccionados(new Set());
      } else if (t === 'seguimiento') {
        const res = await axios.get(`${API}/api/compras/seguimiento`, { headers });
        setOdcsSeguimiento(res.data);
      } else if (t === 'vidrios') {
        const res = await axios.get(`${API}/api/compras/vidrios/panel`, { headers });
        setVidriosFlat(res.data);
        setSeleccionadosVidrios(new Set());
      } else if (t === 'existencia') {
        const [resV, resP] = await Promise.all([
          axios.get(`${API}/api/compras/vidrios/existencia`, { headers }),
          axios.get(`${API}/api/compras/perfileria/existencia`, { headers }),
        ]);
        setVidriosExistencia(resV.data);
        setPerfileriaExistencia(resP.data);
      } else {
        setOdcsRecibidas([]);
      }
    } catch (err) { console.error('Error en operación de compras:', err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTab(tab); setBusqueda(''); }, [tab, fetchTab]);

  // Busqueda server-side con debounce para tab recibidas
  const busquedaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscarRecibidas = useCallback(async (q: string) => {
    if (!q.trim()) { setOdcsRecibidas([]); return; }
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/compras/recibidas`, { headers, params: { q: q.trim() } });
      setOdcsRecibidas(res.data);
    } catch (err) { console.error('Error buscando recibidas:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab !== 'recibidas') return;
    if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current);
    busquedaDebounceRef.current = setTimeout(() => { buscarRecibidas(busqueda); }, 400);
    return () => { if (busquedaDebounceRef.current) clearTimeout(busquedaDebounceRef.current); };
  }, [busqueda, tab, buscarRecibidas]);

  const refresh = useCallback(() => {
    if (tab === 'recibidas') {
      buscarRecibidas(busqueda);
    } else {
      fetchTab(tab);
    }
  }, [tab, busqueda, fetchTab, buscarRecibidas]);

  useDataChangedSocket('compras', refresh);

  const loadMorePendientes = useCallback(async () => {
    if (pendientesLoadingMore || pendientesPage >= pendientesTotalPages) return;
    setPendientesLoadingMore(true);
    try {
      const nextPage = pendientesPage + 1;
      const res = await axios.get(`${API}/api/compras/panel`, { headers, params: { page: nextPage, limit: 50 } });
      const { rows, totalPages } = res.data;
      setItemsPendientes(prev => [...prev, ...rows]);
      setPendientesPage(nextPage);
      setPendientesTotalPages(totalPages);
    } catch (err) {
      console.error('Error cargando más items:', err);
    } finally {
      setPendientesLoadingMore(false);
    }
  }, [pendientesPage, pendientesTotalPages, pendientesLoadingMore]);

  useEffect(() => {
    if (tab !== 'pendientes') return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMorePendientes(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, loadMorePendientes]);

  const refreshTrasRecibida = () => {
    setOdcsSeguimiento(prev => prev.filter(() => false));
    setTab('recibidas');
  };

  // Filtro de items pendientes
  const filtrarItemsPendientes = (list: SAPItemConContexto[]) => {
    const q = busqueda.toLowerCase();
    if (!q) return list;
    return list.filter(i =>
      i.codigo?.toLowerCase().includes(q) ||
      i.descripcion?.toLowerCase().includes(q) ||
      i.SAP?.numero_sap?.toLowerCase().includes(q) ||
      i.SAP?.ODP?.numero_odp?.toLowerCase().includes(q) ||
      i.SAP?.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
    );
  };

  const filtrarOdcs = (list: ODC[]) => {
    const q = busqueda.toLowerCase();
    if (!q) return list;
    return list.filter(o => {
      if (o.numero_odc.toLowerCase().includes(q)) return true;
      if (o.proveedor.toLowerCase().includes(q)) return true;
      const odps = getODPsDeODC(o);
      return odps.some(p =>
        p.numero_odp.toLowerCase().includes(q) ||
        p.cliente.toLowerCase().includes(q)
      );
    });
  };

  // Carga (o refresca) las piezas del código en cache
  const cargarPiezasCodigo = async (codigo: string): Promise<PiezaPerfil[]> => {
    try {
      const res = await axios.get(`${API}/api/compras/inventario-perfileria/${encodeURIComponent(codigo)}`, { headers });
      setStockPorCodigo(prev => ({ ...prev, [codigo]: res.data }));
      return res.data;
    } catch {
      setStockPorCodigo(prev => ({ ...prev, [codigo]: [] }));
      return [];
    }
  };

  // ── Abrir modal "Gestionar existencia" para un ítem pendiente ──
  const abrirGestionExistencia = async (item: SAPItemConContexto) => {
    setGestionItem(item);
    setGestionSel(new Set());
    setGestionVista('piezas');
    setFaltanteCant('');
    setFaltanteDim('');
    if (!stockPorCodigo[item.codigo]) {
      setGestionLoading(true);
      await cargarPiezasCodigo(item.codigo);
      setGestionLoading(false);
    }
  };

  const cerrarGestion = () => {
    setGestionItem(null);
    setGestionSel(new Set());
    setGestionVista('piezas');
    setFaltanteCant('');
    setFaltanteDim('');
  };

  // Piezas actualmente seleccionadas como objetos completos (para enviar al backend)
  const piezasSeleccionadasGestion = (): PiezaPerfil[] => {
    if (!gestionItem) return [];
    const piezas = stockPorCodigo[gestionItem.codigo] || [];
    return piezas.filter(p => gestionSel.has(p.consecutivo));
  };

  // Invalida el cache del código tras consumir piezas y recalcula codigosConStock
  const invalidarStockCodigo = async (codigo: string) => {
    const restantes = await cargarPiezasCodigo(codigo);
    if (restantes.length === 0) {
      setCodigosConStock(prev => { const next = new Set(prev); next.delete(codigo); return next; });
    }
  };

  // Acción: asignar existencia (cobertura total)
  const handleAsignarExistencia = async () => {
    if (!gestionItem || gestionSel.size === 0) return;
    const item = gestionItem;
    const piezas = piezasSeleccionadasGestion();
    setGestionGuardando(true);
    try {
      await axios.post(`${API}/api/compras/sap-item/${item.id}/asignar-existencia`, {
        exist_perf: formatExistPerf(piezas),
        consecutivos: piezas.map(p => p.consecutivo),
        piezas: piezas.map(p => ({ consecutivo: p.consecutivo, codigo: p.codigo ?? null, mm: p.mm ?? null, ubicacion: p.ubicacion ?? null, fecha_corte: p.fecha_corte ?? null })),
      }, { headers });
      toast.success('Ítem cubierto por existencia');
      setItemsPendientes(prev => prev.filter(i => i.id !== item.id));
      cerrarGestion();
      await invalidarStockCodigo(item.codigo);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al asignar existencia');
    } finally { setGestionGuardando(false); }
  };

  // Acción: dividir existencia (cobertura parcial + faltante)
  const handleDividirExistencia = async () => {
    if (!gestionItem || gestionSel.size === 0) return;
    if (!faltanteDim.trim()) { toast.error('Ingresa la dimensión del faltante'); return; }
    const item = gestionItem;
    const piezas = piezasSeleccionadasGestion();
    setGestionGuardando(true);
    try {
      await axios.post(`${API}/api/compras/sap-item/${item.id}/dividir-existencia`, {
        exist_perf: formatExistPerf(piezas),
        consecutivos: piezas.map(p => p.consecutivo),
        piezas: piezas.map(p => ({ consecutivo: p.consecutivo, codigo: p.codigo ?? null, mm: p.mm ?? null, ubicacion: p.ubicacion ?? null, fecha_corte: p.fecha_corte ?? null })),
        faltante: { cantidad: Number(faltanteCant) || 0, dimension: faltanteDim.trim() },
      }, { headers });
      toast.success('Faltante registrado y enviado a Pendientes');
      cerrarGestion();
      await invalidarStockCodigo(item.codigo);
      refresh(); // refrescar el panel para traer el nuevo faltante
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Error al registrar el faltante');
    } finally { setGestionGuardando(false); }
  };

  // Revertir un ítem de perfilería en existencia → Pendientes
  const revertirPerfileriaExistencia = async (itemId: number) => {
    setRevirtiendoExist(itemId);
    try {
      await axios.post(`${API}/api/compras/sap-item/${itemId}/revertir-existencia`, {}, { headers });
      setPerfileriaExistencia(prev => prev.filter(it => it.id !== itemId));
      toast.success('Devuelto a Pendientes');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo revertir');
    } finally { setRevirtiendoExist(null); }
  };

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodos = (listaFiltrada: SAPItemConContexto[]) => {
    const ids = listaFiltrada.map(i => i.id);
    const todosSeleccionados = ids.every(id => seleccionados.has(id));
    if (todosSeleccionados) {
      setSeleccionados(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    } else {
      setSeleccionados(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
    }
  };

  const countBadge = (t: string) => {
    if (t === 'pendientes') return itemsPendientes.length;
    if (t === 'seguimiento') return odcsSeguimiento.length;
    if (t === 'vidrios') return vidriosFlat.length;
    if (t === 'existencia') return perfileriaExistencia.length + vidriosExistencia.length;
    return odcsRecibidas.length;
  };

  // Desmarcar ítem de existencia → vuelve a pendiente
  const desmarcaExistencia = async (itemId: number) => {
    try {
      await axios.patch(`${API}/api/compras/vidrios/item/${itemId}/estado`, { estado_compra: 'pendiente' }, { headers });
      setVidriosExistencia(prev => prev.filter(it => it.id !== itemId));
    } catch (err) { console.error('Error al desmarcar existencia:', err); }
  };

  // Actualización optimista en la lista plana: el item desaparece si pasa a en_existencia
  const toggleEstadoItemVidrio = async (itemId: number, estadoActual: string) => {
    const nuevoEstado = estadoActual === 'en_existencia' ? 'pendiente' : 'en_existencia';
    try {
      await axios.patch(`${API}/api/compras/vidrios/item/${itemId}/estado`, { estado_compra: nuevoEstado }, { headers });
      if (nuevoEstado === 'en_existencia') {
        // Sale de vidrios pendientes
        const itemMovido = vidriosFlat.find(it => it.id === itemId);
        setVidriosFlat(prev => prev.filter(it => it.id !== itemId));
        setSeleccionadosVidrios(prev => { const next = new Set(prev); next.delete(itemId); return next; });
        // Aparece en existencia
        if (itemMovido) setVidriosExistencia(prev => [...prev, { ...itemMovido, estado_compra: 'en_existencia' }]);
      } else {
        // Vuelve a pendiente
        setVidriosFlat(prev => prev.filter(it => it.id !== itemId));
        setVidriosExistencia(prev => prev.filter(it => it.id !== itemId));
      }
    } catch (err) { console.error('Error en operación de compras:', err); }
  };


  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl shadow-sm">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">Módulo de Compras</h1>
            <p className="text-sm text-slate-500">Gestión de Órdenes de Compra vinculadas a SAP</p>
          </div>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition shadow-sm">
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Tabs — estilo carpeta */}
      <div className="mb-5">
        <FolderTabs
          tabs={TABS.map(t => {
            const Icon = t.icon;
            const count = countBadge(t.key);
            return { key: t.key, label: t.label, icon: <Icon className="w-4 h-4" />, badge: count > 0 ? count : undefined };
          })}
          activeKey={tab}
          onChange={(k) => setTab(k as any)}
          className="border-b border-slate-200"
        />
      </div>

      {/* Buscador */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder={tab === 'pendientes' ? 'Buscar código, SAP, ODP o cliente...' : 'Buscar ODC, proveedor, ODP o cliente...'}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {/* ── TAB PENDIENTES ── */}
            {tab === 'pendientes' && (() => {
              const listaFiltrada = filtrarItemsPendientes(itemsPendientes);
              const seleccionadosEnLista = listaFiltrada.filter(i => seleccionados.has(i.id));

              // Agrupar por código
              const gruposPorCodigo = (() => {
                const map = new Map<string, SAPItemConContexto[]>();
                for (const item of listaFiltrada) {
                  const key = item.codigo || '—';
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(item);
                }
                return map;
              })();

              return (
                <div className="space-y-4">
                  {/* Barra de acciones — siempre visible */}
                  <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-indigo-600"
                        checked={listaFiltrada.length > 0 && listaFiltrada.every(i => seleccionados.has(i.id))}
                        onChange={() => toggleTodos(listaFiltrada)}
                      />
                      <span className="text-sm text-slate-600">
                        {seleccionados.size > 0
                          ? <><span className="font-black text-indigo-700">{seleccionados.size}</span> item(s) seleccionado(s)</>
                          : <span className="text-slate-400">Seleccionar todos</span>
                        }
                      </span>
                      {seleccionados.size > 0 && (
                        <span className="text-xs text-slate-400">
                          · {new Set(seleccionadosEnLista.map(i => i.SAP?.id)).size} SAP(s) · {new Set(seleccionadosEnLista.map(i => i.SAP?.ODP?.id)).size} ODP(s)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMostrarModalSinSAP(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white text-sm font-bold rounded-xl hover:bg-slate-700 transition shadow-sm"
                      >
                        <Plus className="w-4 h-4" /> Nueva ODC sin SAP
                      </button>
                      <button
                        onClick={() => setMostrarModal(true)}
                        disabled={seleccionados.size === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" /> Crear ODC ({seleccionados.size})
                      </button>
                    </div>
                  </div>

                  {/* Tabla de items agrupada por código */}
                  {listaFiltrada.length === 0 ? (
                    <div className="text-center py-20">
                      <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-3" />
                      <p className="text-lg font-bold text-slate-500">
                        {busqueda ? 'Sin resultados' : 'No hay items pendientes de gestionar'}
                      </p>
                    </div>
                  ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {Array.from(gruposPorCodigo.entries()).map(([codigo, grupo], gi) => {
                      const todosDelGrupoSeleccionados = grupo.every(i => seleccionados.has(i.id));
                      const algunoDelGrupoSeleccionado = grupo.some(i => seleccionados.has(i.id));
                      const totalCant = grupo.reduce((s, i) => s + Number(i.cantidad), 0);
                      return (
                        <div key={codigo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                          {/* Encabezado del grupo de código */}
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 cursor-pointer hover:bg-indigo-100 transition"
                            onClick={() => {
                              if (todosDelGrupoSeleccionados) {
                                setSeleccionados(prev => { const next = new Set(prev); grupo.forEach(i => next.delete(i.id)); return next; });
                              } else {
                                setSeleccionados(prev => { const next = new Set(prev); grupo.forEach(i => next.add(i.id)); return next; });
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                              checked={todosDelGrupoSeleccionados}
                              ref={el => { if (el) el.indeterminate = algunoDelGrupoSeleccionado && !todosDelGrupoSeleccionados; }}
                              onChange={() => {}}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="font-mono font-black text-indigo-700">{codigo}</span>
                            <span className="text-slate-400 text-xs">—</span>
                            <span className="text-sm text-slate-700 font-medium flex-1 truncate">{grupo[0].descripcion || '—'}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-indigo-600">
                                Total: {totalCant}
                              </span>
                              {grupo.length > 1 && (
                                <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full border border-indigo-200">
                                  {grupo.length} SAPs
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Filas de items del grupo */}
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="px-4 py-1.5 w-10" />
                                <th className="px-3 py-1.5 text-left w-24">Dimensión</th>
                                <th className="px-3 py-1.5 text-center w-16">Cant.</th>
                                <th className="px-3 py-1.5 text-left w-36">Observ.</th>
                                <th className="px-3 py-1.5 text-left w-28">SAP</th>
                                <th className="px-3 py-1.5 text-left w-28">ODP</th>
                                <th className="px-3 py-1.5 text-left">Cliente</th>
                                <th className="px-3 py-1.5 text-center w-20">Exis. Perf.</th>
                                <th className="px-3 py-1.5 text-left w-40">Asesor</th>
                                <th className="px-3 py-1.5 text-center w-16">Exist.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {grupo.map((item, i) => {
                                const esModificado = item.modificado === true;
                                return (
                                <tr
                                  key={item.id}
                                  onClick={() => toggleSeleccion(item.id)}
                                  className={`cursor-pointer transition ${
                                    esModificado
                                      ? 'bg-amber-50 border-l-4 border-amber-400 hover:bg-amber-100'
                                      : seleccionados.has(item.id) ? 'bg-indigo-50'
                                      : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-100'
                                  }`}
                                >
                                  <td className="px-4 py-2 w-10" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded accent-indigo-600"
                                      checked={seleccionados.has(item.id)}
                                      onChange={() => toggleSeleccion(item.id)}
                                    />
                                  </td>
                                  <td className="px-3 py-2 w-24 text-slate-500">
                                    {esModificado && (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500 text-white mr-1 align-middle">MOD</span>
                                    )}
                                    {item.dimension || '—'}
                                  </td>
                                  <td className="px-3 py-2 w-16 text-center font-bold text-slate-700">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                                  <td className="px-3 py-2 text-slate-400 text-xs max-w-[140px] truncate" title={(item as any).observacion || ''}>{(item as any).observacion || '—'}</td>
                                  <td className="px-3 py-2 w-28">
                                    <span className="font-bold text-indigo-600">{item.SAP?.numero_sap || '—'}</span>
                                  </td>
                                  <td className="px-3 py-2 w-28" onClick={e => { e.stopPropagation(); if (item.SAP?.ODP?.id) setFichaOdpId(item.SAP.ODP.id); }}>
                                    <span className="font-bold text-indigo-700 cursor-pointer hover:underline">{item.SAP?.ODP?.numero_odp || '—'}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">
                                    {item.SAP?.ODP?.cliente?.nombre_razon_social || '—'}
                                  </td>
                                  <td className="px-3 py-2 w-20" onClick={e => e.stopPropagation()}>
                                    {item.codigo && codigosConStock.has(item.codigo) ? (
                                      <button
                                        onClick={() => abrirGestionExistencia(item)}
                                        title="Gestionar existencia (asignar / falta material)"
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
                                      >
                                        <Package className="w-3 h-3" /> Gestionar
                                      </button>
                                    ) : (
                                      <span className="text-slate-300 text-[10px]">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400 text-[10px] truncate max-w-[160px]">
                                    {item.SAP?.ODP?.asesor?.nombre_completo || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center w-16" onClick={e => e.stopPropagation()}>
                                    <button
                                      title="Marcar como en existencia"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await axios.patch(`${API}/api/compras/sap-item/${item.id}/existencia`, {}, { headers });
                                          setItemsPendientes(prev => prev.filter(i => i.id !== item.id));
                                        } catch {
                                          // el item permanece en lista si falla
                                        }
                                      }}
                                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition border border-emerald-200"
                                    >
                                      <Package className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                  )}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="h-4" />
                  {pendientesLoadingMore && (
                    <div className="text-center py-4">
                      <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block" />
                      <p className="text-sm text-slate-400 mt-2">Cargando más...</p>
                    </div>
                  )}
                  {pendientesPage >= pendientesTotalPages && itemsPendientes.length > 0 && (
                    <p className="text-center text-sm text-slate-400 py-4">Todos los items cargados</p>
                  )}

                </div>
              );
            })()}

            {/* ── TAB SEGUIMIENTO ── */}
            {tab === 'seguimiento' && (() => {
              const lista = filtrarOdcs(odcsSeguimiento);
              return lista.length === 0 ? (
                <div className="text-center py-20">
                  <ListChecks className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">{busqueda ? 'Sin resultados' : 'No hay ODCs en seguimiento'}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {lista.map(odc => <ODCCard key={odc.id} odc={odc} onActualizar={refresh} onEstadoCambiado={refreshTrasRecibida} onFichaOdp={setFichaOdpId} />)}
                </div>
              );
            })()}

            {/* ── TAB RECIBIDAS ── */}
            {tab === 'recibidas' && (() => {
              return odcsRecibidas.length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle2 className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">{busqueda ? 'Sin resultados' : 'Escribe en el buscador para encontrar ODCs recibidas'}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {odcsRecibidas.map(odc => <ODCCard key={odc.id} odc={odc} onActualizar={refresh} onFichaOdp={setFichaOdpId} />)}
                </div>
              );
            })()}

            {/* ── TAB VIDRIOS ── */}
            {tab === 'vidrios' && (() => {
              const q = busqueda.toLowerCase();
              const listaFiltrada = vidriosFlat.filter(it =>
                !busqueda ||
                (it.tipo_vidrio || '').toLowerCase().includes(q) ||
                (it.color || '').toLowerCase().includes(q) ||
                it.ODP?.numero_odp?.toLowerCase().includes(q) ||
                it.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q) ||
                it.ODP?.asesor?.nombre_completo?.toLowerCase().includes(q)
              );
              const seleccionadosEnLista = listaFiltrada.filter(i => seleccionadosVidrios.has(i.id));

              // Agrupar por tipo_vidrio (la lista ya viene ordenada por tipo desde el backend)
              const gruposPorTipo = (() => {
                const map = new Map<string, ODPItemConContexto[]>();
                for (const item of listaFiltrada) {
                  const key = item.tipo_vidrio || item.prod || '—';
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(item);
                }
                return map;
              })();

              const toggleSeleccionVidrio = (id: number) => {
                setSeleccionadosVidrios(prev => {
                  const next = new Set(prev);
                  next.has(id) ? next.delete(id) : next.add(id);
                  return next;
                });
              };

              const toggleTodosVidrios = () => {
                const ids = listaFiltrada.map(i => i.id);
                const todosSeleccionados = ids.every(id => seleccionadosVidrios.has(id));
                if (todosSeleccionados) {
                  setSeleccionadosVidrios(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
                } else {
                  setSeleccionadosVidrios(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
                }
              };

              return listaFiltrada.length === 0 ? (
                <div className="text-center py-20">
                  <Layers className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">
                    {busqueda ? 'Sin resultados' : 'No hay vidrios pendientes de gestionar'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Barra de acciones */}
                  <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded accent-cyan-600"
                        checked={listaFiltrada.length > 0 && listaFiltrada.every(i => seleccionadosVidrios.has(i.id))}
                        onChange={toggleTodosVidrios}
                      />
                      <span className="text-sm text-slate-600">
                        {seleccionadosVidrios.size > 0
                          ? <><span className="font-black text-cyan-700">{seleccionadosVidrios.size}</span> ítem(s) seleccionado(s)</>
                          : <span className="text-slate-400">Seleccionar todos</span>
                        }
                      </span>
                      {seleccionadosVidrios.size > 0 && (
                        <span className="text-xs text-slate-400">
                          · {new Set(seleccionadosEnLista.map(i => i.ODP?.id)).size} ODP(s)
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => setMostrarModalVidrios(true)}
                      disabled={seleccionadosVidrios.size === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-bold rounded-xl hover:bg-cyan-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" /> Crear ODC ({seleccionadosVidrios.size})
                    </button>
                  </div>

                  {/* Tabla agrupada por tipo_vidrio */}
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {Array.from(gruposPorTipo.entries()).map(([tipo, grupo], gi) => {
                      const todosDelGrupoSeleccionados = grupo.every(i => seleccionadosVidrios.has(i.id));
                      const algunoDelGrupoSeleccionado = grupo.some(i => seleccionadosVidrios.has(i.id));
                      const totalCant = grupo.reduce((s, i) => s + Number(i.cantidad), 0);
                      return (
                        <div key={tipo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                          {/* Encabezado del grupo de tipo */}
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 bg-cyan-50 border-b border-cyan-100 cursor-pointer hover:bg-cyan-100 transition"
                            onClick={() => {
                              if (todosDelGrupoSeleccionados) {
                                setSeleccionadosVidrios(prev => { const next = new Set(prev); grupo.forEach(i => next.delete(i.id)); return next; });
                              } else {
                                setSeleccionadosVidrios(prev => { const next = new Set(prev); grupo.forEach(i => next.add(i.id)); return next; });
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded accent-cyan-600 shrink-0"
                              checked={todosDelGrupoSeleccionados}
                              ref={el => { if (el) el.indeterminate = algunoDelGrupoSeleccionado && !todosDelGrupoSeleccionados; }}
                              onChange={() => {}}
                              onClick={e => e.stopPropagation()}
                            />
                            <span className="font-bold text-cyan-800">{tipo}</span>
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              <span className="text-xs font-bold text-cyan-700">
                                Total: {totalCant} und
                              </span>
                              {grupo.length > 1 && (
                                <span className="text-[10px] font-bold text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-full border border-cyan-200">
                                  {grupo.length} ítems
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Filas de items del grupo */}
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                              <tr>
                                <th className="px-4 py-1.5 w-10" />
                                <th className="px-3 py-1.5 text-left">Color</th>
                                <th className="px-3 py-1.5 text-left w-16">Esp.</th>
                                <th className="px-3 py-1.5 text-left">Medidas (mm)</th>
                                <th className="px-3 py-1.5 text-left w-32">Otros</th>
                                <th className="px-3 py-1.5 text-center w-14">Cant.</th>
                                <th className="px-3 py-1.5 text-left w-28">ODP</th>
                                <th className="px-3 py-1.5 text-left">Cliente</th>
                                <th className="px-3 py-1.5 text-left w-40">Asesor</th>
                                <th className="px-3 py-1.5 text-center w-20">Exist.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {grupo.map((item, i) => (
                                <tr
                                  key={item.id}
                                  onClick={() => toggleSeleccionVidrio(item.id)}
                                  className={`cursor-pointer transition ${seleccionadosVidrios.has(item.id) ? 'bg-cyan-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-100'}`}
                                >
                                  <td className="px-4 py-2 w-10" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded accent-cyan-600"
                                      checked={seleccionadosVidrios.has(item.id)}
                                      onChange={() => toggleSeleccionVidrio(item.id)}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-slate-600">{item.color || '—'}</td>
                                  <td className="px-3 py-2 text-slate-600">{item.espesor || '—'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-700">
                                    {item.ancho_mm && item.alto_mm ? `${item.ancho_mm}×${item.alto_mm}` : '—'}
                                  </td>
                                  <td
                                    className="px-3 py-2 text-slate-400 text-[10px] truncate max-w-[120px]"
                                    title={item.otros || ''}
                                  >
                                    {item.otros || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center font-bold text-slate-700">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                                  <td className="px-3 py-2 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={e => { e.stopPropagation(); if (item.ODP?.id) setFichaOdpId(item.ODP.id); }}>{item.ODP?.numero_odp || '—'}</td>
                                  <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">
                                    {item.ODP?.cliente?.nombre_razon_social || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400 text-[10px] truncate max-w-[160px]">
                                    {item.ODP?.asesor?.nombre_completo || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center w-20" onClick={e => e.stopPropagation()}>
                                    <button
                                      title="Marcar como en existencia"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        await toggleEstadoItemVidrio(item.id, item.estado_compra);
                                      }}
                                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition border border-emerald-200"
                                    >
                                      <Package className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}


            {/* ── TAB EXISTENCIA (Perfilería + Vidrios) ── */}
            {tab === 'existencia' && (() => {
              const q = busqueda.toLowerCase();

              // Vidrios en existencia (filtrados)
              const listaVidrios = vidriosExistencia.filter(it =>
                !busqueda ||
                (it.tipo_vidrio || '').toLowerCase().includes(q) ||
                (it.color || '').toLowerCase().includes(q) ||
                it.ODP?.numero_odp?.toLowerCase().includes(q) ||
                it.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
              );
              const gruposVidrios = (() => {
                const map = new Map<string, ODPItemConContexto[]>();
                for (const item of listaVidrios) {
                  const key = item.tipo_vidrio || item.prod || '—';
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(item);
                }
                return map;
              })();

              // Perfilería en existencia (filtrada)
              const listaPerf = perfileriaExistencia.filter(it =>
                !busqueda ||
                (it.codigo || '').toLowerCase().includes(q) ||
                (it.descripcion || '').toLowerCase().includes(q) ||
                it.SAP?.numero_sap?.toLowerCase().includes(q) ||
                it.SAP?.ODP?.numero_odp?.toLowerCase().includes(q) ||
                it.SAP?.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
              );

              if (listaPerf.length === 0 && listaVidrios.length === 0) {
                return (
                  <div className="text-center py-20">
                    <Package className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                    <p className="text-lg font-bold text-slate-500">
                      {busqueda ? 'Sin resultados' : 'No hay ítems seleccionados por existencia'}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    <strong>{listaPerf.length + listaVidrios.length}</strong> ítem(s) cubiertos por existencia (no necesitan orden de compra). Usa el botón de revertir/desmarcar para devolverlos a Pendientes.
                  </div>

                  {/* ───── SECCIÓN PERFILERÍA ───── */}
                  {listaPerf.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Perfilería</h3>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">{listaPerf.length}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
                        <table className="w-full text-xs min-w-[700px]">
                          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-3 py-1.5 text-left w-24">Código</th>
                              <th className="px-3 py-1.5 text-left">Descripción</th>
                              <th className="px-3 py-1.5 text-left w-24">Dimensión</th>
                              <th className="px-3 py-1.5 text-center w-14">Cant.</th>
                              <th className="px-3 py-1.5 text-left w-44">Exist.</th>
                              <th className="px-3 py-1.5 text-left w-24">SAP</th>
                              <th className="px-3 py-1.5 text-left w-24">ODP</th>
                              <th className="px-3 py-1.5 text-left">Cliente</th>
                              <th className="px-3 py-1.5 text-center w-24">Revertir</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {listaPerf.map((item, i) => (
                              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                                <td className="px-3 py-2 font-mono font-bold text-blue-700">{item.codigo || '—'}</td>
                                <td className="px-3 py-2 text-slate-700">{item.descripcion || '—'}</td>
                                <td className="px-3 py-2 text-slate-500">{item.dimension || '—'}</td>
                                <td className="px-3 py-2 text-center font-bold text-slate-700">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                                <td className="px-3 py-2 text-emerald-700 text-[10px] truncate max-w-[180px]" title={item.exist_perf || ''}>{item.exist_perf || '—'}</td>
                                <td className="px-3 py-2 font-bold text-indigo-600">{item.SAP?.numero_sap || '—'}</td>
                                <td className="px-3 py-2 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => item.SAP?.ODP?.id && setFichaOdpId(item.SAP.ODP.id)}>{item.SAP?.ODP?.numero_odp || '—'}</td>
                                <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">{item.SAP?.ODP?.cliente?.nombre_razon_social || '—'}</td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => revertirPerfileriaExistencia(item.id)}
                                    disabled={revirtiendoExist === item.id}
                                    title="Revertir — devolver a Pendientes"
                                    className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition border border-amber-200 disabled:opacity-50"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ───── SECCIÓN VIDRIOS ───── */}
                  {listaVidrios.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-600" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-wider">Vidrios</h3>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">{listaVidrios.length}</span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                        {Array.from(gruposVidrios.entries()).map(([tipo, grupo], gi) => (
                          <div key={tipo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                            <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                              <span className="font-bold text-emerald-800">{tipo}</span>
                              <span className="ml-auto text-xs font-bold text-emerald-700">
                                {grupo.reduce((s, i) => s + Number(i.cantidad), 0)} und
                              </span>
                            </div>
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                                <tr>
                                  <th className="px-3 py-1.5 text-left">Color</th>
                                  <th className="px-3 py-1.5 text-left w-16">Esp.</th>
                                  <th className="px-3 py-1.5 text-left">Medidas</th>
                                  <th className="px-3 py-1.5 text-left w-32">Otros</th>
                                  <th className="px-3 py-1.5 text-center w-14">Cant.</th>
                                  <th className="px-3 py-1.5 text-left w-28">ODP</th>
                                  <th className="px-3 py-1.5 text-left">Cliente</th>
                                  <th className="px-3 py-1.5 text-center w-24">Desmarcar</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {grupo.map((item, i) => (
                                  <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                                    <td className="px-3 py-2 text-slate-600">{item.color || '—'}</td>
                                    <td className="px-3 py-2 text-slate-600">{item.espesor || '—'}</td>
                                    <td className="px-3 py-2 font-mono text-slate-700">
                                      {item.ancho_mm && item.alto_mm ? `${item.ancho_mm}×${item.alto_mm}` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-slate-400 text-[10px] truncate max-w-[120px]" title={item.otros || ''}>
                                      {item.otros || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-slate-700">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                                    <td className="px-3 py-2 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => item.ODP?.id && setFichaOdpId(item.ODP.id)}>{item.ODP?.numero_odp || '—'}</td>
                                    <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">
                                      {item.ODP?.cliente?.nombre_razon_social || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        onClick={() => desmarcaExistencia(item.id)}
                                        title="Desmarcar — devolver a Vidrios pendientes"
                                        className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition border border-amber-200"
                                      >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

          </motion.div>
        </AnimatePresence>
      )}

      {/* Modal crear ODC sin SAP (consumibles) */}
      {mostrarModalSinSAP && (
        <ODCSinSAPModal
          onClose={() => setMostrarModalSinSAP(false)}
          onRefresh={refresh}
        />
      )}

      {/* Modal crear ODC consolidada */}
      {mostrarModal && seleccionados.size > 0 && (
        <ODCModal
          items={itemsPendientes.filter(i => seleccionados.has(i.id))}
          onClose={() => setMostrarModal(false)}
          onRefresh={refresh}
        />
      )}

      {/* Modal crear ODC de vidrios (multi-ODP, agrupado por tipo_vidrio) */}
      {mostrarModalVidrios && seleccionadosVidrios.size > 0 && (
        <ODCVidriosModal
          items={vidriosFlat.filter(i => seleccionadosVidrios.has(i.id))}
          onClose={() => setMostrarModalVidrios(false)}
          onRefresh={refresh}
        />
      )}

      {/* ── MODAL GESTIONAR EXISTENCIA (Pendientes → Exis. Perf.) ── */}
      <AnimatePresence>
        {gestionItem && (() => {
          const piezas = stockPorCodigo[gestionItem.codigo] || [];
          const seleccionadas = piezas.filter(p => gestionSel.has(p.consecutivo));
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col border border-slate-200"
              >
                <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 shrink-0">
                  <div>
                    <h3 className="text-base font-black text-slate-800">Gestionar existencia — {gestionItem.codigo}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {gestionVista === 'piezas'
                        ? 'Selecciona las piezas de inventario a usar'
                        : 'Indica el material que falta comprar'}
                    </p>
                  </div>
                  <button onClick={cerrarGestion} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Contexto del ítem */}
                <div className="px-6 pt-4 shrink-0">
                  <div className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-4 flex-wrap">
                    <span>
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Dimensión solicitada:</span>{' '}
                      <span className="text-slate-700 font-semibold">{gestionItem.dimension || '—'}</span>
                    </span>
                    <span>
                      <span className="text-slate-400 font-bold uppercase tracking-wider">Cantidad:</span>{' '}
                      <span className="text-slate-700 font-semibold">{gestionItem.cantidad}</span>
                    </span>
                  </div>
                </div>

                {gestionVista === 'piezas' ? (
                  <>
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                      {gestionLoading || !stockPorCodigo[gestionItem.codigo] ? (
                        <div className="flex justify-center py-10">
                          <div className="w-7 h-7 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : piezas.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-10">No hay piezas disponibles en inventario para este código.</p>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            {piezas.length} pieza(s) disponible(s) · {seleccionadas.length} seleccionada(s)
                          </p>
                          <div className="space-y-1.5">
                            {piezas.map(p => {
                              const sel = gestionSel.has(p.consecutivo);
                              return (
                                <label
                                  key={p.consecutivo}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                                    sel ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-emerald-600 shrink-0"
                                    checked={sel}
                                    onChange={e => {
                                      setGestionSel(prev => {
                                        const next = new Set(prev);
                                        e.target.checked ? next.add(p.consecutivo) : next.delete(p.consecutivo);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="text-xs font-bold text-emerald-700 flex-1">
                                    {p.mm != null ? `${Math.round(p.mm)} mm` : 'sin mm'}
                                  </span>
                                  <span className="text-xs text-slate-500">#{p.consecutivo}</span>
                                  {p.ubicacion && <span className="text-[10px] text-slate-400">({p.ubicacion})</span>}
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 px-6 py-4 border-t border-slate-100 shrink-0">
                      <button
                        onClick={handleAsignarExistencia}
                        disabled={gestionGuardando || gestionSel.size === 0}
                        className="w-full py-2.5 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition disabled:opacity-40"
                      >
                        {gestionGuardando ? 'Guardando...' : 'Asignar existencia (cubre todo)'}
                      </button>
                      <button
                        onClick={() => setGestionVista('faltante')}
                        disabled={gestionSel.size === 0}
                        className="w-full py-2.5 font-bold text-amber-700 border border-amber-200 bg-amber-50 rounded-xl hover:bg-amber-100 transition disabled:opacity-40"
                      >
                        Falta material →
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                      <div className="text-xs bg-green-50 border border-green-200 rounded-xl p-3">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">De existencia ({seleccionadas.length}):</span>{' '}
                        <span className="text-green-700 font-semibold">{formatExistPerf(seleccionadas) || '—'}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Cant.</label>
                          <input
                            type="number" min={0} value={faltanteCant}
                            onChange={e => setFaltanteCant(e.target.value)}
                            placeholder="0"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                            Dimensión faltante <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text" value={faltanteDim}
                            onChange={e => setFaltanteDim(e.target.value)}
                            placeholder="Ej: 2-1100 / 1-650 MM"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-amber-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                        Se creará un ítem pendiente con este faltante y el ítem actual saldrá de Pendientes (cubierto por existencia).
                      </p>
                    </div>
                    <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                      <button
                        onClick={() => setGestionVista('piezas')}
                        disabled={gestionGuardando}
                        className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                      >
                        ← Volver
                      </button>
                      <button
                        onClick={handleDividirExistencia}
                        disabled={gestionGuardando || !faltanteDim.trim()}
                        className="flex-1 py-2.5 font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition disabled:opacity-40"
                      >
                        {gestionGuardando ? 'Guardando...' : 'Guardar faltante'}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default ComprasPage;
