import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, RefreshCw, Clock, Package, CheckCircle2, Truck, ListChecks, Eye, Edit3, Trash2, AlertCircle, X, Layers, Plus, Printer } from 'lucide-react';
import ODCModal, { SAPItemConContexto } from './components/ODCModal';
import ODCVidriosModal, { ODPItemConContexto } from './components/ODCVidriosModal';
import PrintableODC from './components/PrintableODC';
import ODPFichaModal from '../odp/components/ODPFichaModal';

import { useDataChangedSocket } from '../../store/useSocketNotifications';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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
  sap_item?: {
    dimension?: string;
    und?: string;
    observacion?: string;
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
}

// Helper: extrae ODPs únicas de una ODC (multi-SAP o legacy)
const getODPsDeODC = (odc: ODC): Array<{ numero_odp: string; cliente: string }> => {
  const map = new Map<string, string>();
  for (const it of odc.items) {
    const odp = it.sap_item?.SAP?.ODP;
    if (odp?.numero_odp) map.set(odp.numero_odp, odp.cliente?.nombre_razon_social || '');
  }
  // fallback a sap header (ODCs antiguas)
  if (map.size === 0 && odc.sap?.ODP) {
    map.set(odc.sap.ODP.numero_odp, odc.sap.ODP.cliente?.nombre_razon_social || '');
  }
  return Array.from(map.entries()).map(([numero_odp, cliente]) => ({ numero_odp, cliente }));
};

// ─── Constantes UI ──────────────────────────────────────────────────────────

const ESTADO_PROD_COLOR: Record<string, string> = {
  EN_ESPERA: 'bg-slate-100 text-slate-600', MEDICION: 'bg-yellow-100 text-yellow-700',
  PEDIDO_PROVEEDOR: 'bg-orange-100 text-orange-700', ALUMINIO_CORTADO: 'bg-blue-100 text-blue-700',
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

// ─── Componente tarjeta ODC (Seguimiento / Recibidas) ───────────────────────

const ODCCard: React.FC<{ odc: ODC; onActualizar: () => void; onEstadoCambiado?: (nuevoEstado: string) => void; onFichaOdp?: (id: number) => void }> = ({ odc, onActualizar, onEstadoCambiado, onFichaOdp }) => {
  const [loading, setLoading] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editProveedor, setEditProveedor] = useState(odc.proveedor);
  const [editNotas, setEditNotas] = useState(odc.notas || '');
  const [editEstado, setEditEstado] = useState<string>(odc.estado);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRecibirModal, setShowRecibirModal] = useState(false);
  const [itemsSeleccionados, setItemsSeleccionados] = useState<Set<number>>(new Set());
  const [recibiendoItems, setRecibiendoItems] = useState(false);

  const token = localStorage.getItem('token');
  const odpsInfo = getODPsDeODC(odc);
  const isMultiODP = odpsInfo.length > 1;
  // legacy compat
  const odp = odc.sap?.ODP;
  const estadoProd = odp?.estado_produccion || '';
  const est = ODC_ESTADO_STYLE[odc.estado] || ODC_ESTADO_STYLE['pendiente'];

  const handleGuardarEdicion = async () => {
    // Si el usuario seleccionó "Recibido" y la ODC no está recibida → abrir modal de items
    if (editEstado === 'recibido' && odc.estado !== 'recibido') {
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
      // Pre-seleccionar items no recibidos
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
      const todosRecibidos = odc.items.every(it => it.recibido || itemsSeleccionados.has(it.id));
      if (todosRecibidos && onEstadoCambiado) {
        onEstadoCambiado('recibido');
      } else {
        onActualizar();
      }
    } catch (e: any) {
      console.error('Error al recibir items:', e?.response?.data || e?.message);
    } finally { setRecibiendoItems(false); }
  };

  const handleEliminar = async () => {
    try {
      await axios.delete(`${API}/api/compras/odc/${odc.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onActualizar();
    } catch (err) { console.error('Error en operación de compras:', err); }
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
                  {odc.sap?.numero_sap && <span>SAP: <span className="font-bold text-slate-700">{odc.sap.numero_sap}</span></span>}
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
            <button
              onClick={() => {
                setEditProveedor(odc.proveedor);
                setEditNotas(odc.notas || '');
                setEditEstado(odc.estado);
                setEditando(true);
              }}
              title="Editar ODC"
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition"
            >
              <Edit3 className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Eliminar ODC"
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar
            </button>
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
                return (
                  <tr key={i} className={it.recibido ? 'bg-green-50/40' : hayItemsParciales && pendiente ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                    <td className="px-4 py-1.5 font-mono text-blue-700 font-bold">{it.codigo || '—'}</td>
                    <td className="px-4 py-1.5 text-slate-700">{it.descripcion || '—'}</td>
                    <td className="px-4 py-1.5 text-center font-bold text-slate-600">{Number(it.cantidad) % 1 === 0 ? Math.round(Number(it.cantidad)) : it.cantidad}</td>
                    <td className="px-4 py-1.5 text-slate-500">{it.sap_item?.dimension || '—'}</td>
                    <td className="px-4 py-1.5 text-slate-400 text-[10px] max-w-[140px] truncate" title={it.sap_item?.observacion || ''}>{it.sap_item?.observacion || '—'}</td>
                    <td className="px-4 py-1.5 text-indigo-600 font-bold">{it.sap_item?.SAP?.numero_sap || odc.sap?.numero_sap || '—'}</td>
                    <td className="px-4 py-1.5 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => { const id = it.sap_item?.SAP?.ODP?.id || odc.sap?.ODP?.id; if (id) onFichaOdp?.(id); }}>{it.sap_item?.SAP?.ODP?.numero_odp || odc.sap?.ODP?.numero_odp || '—'}</td>
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
                        <p className="font-semibold text-slate-700 mt-0.5">{odc.sap?.numero_sap || '—'}</p>
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
                          return (
                            <tr key={i} className={it.recibido ? 'bg-green-50/60' : hayItemsParciales && pendiente ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-3 py-2 font-mono text-blue-700 font-bold">{it.codigo || '—'}</td>
                              <td className="px-3 py-2 text-slate-700">{it.descripcion || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold text-slate-600">{Number(it.cantidad) % 1 === 0 ? Math.round(Number(it.cantidad)) : it.cantidad}</td>
                              <td className="px-3 py-2 text-slate-500">{it.sap_item?.dimension || '—'}</td>
                              <td className="px-3 py-2 text-slate-400 text-[10px] max-w-[140px] truncate" title={it.sap_item?.observacion || ''}>{it.sap_item?.observacion || '—'}</td>
                              <td className="px-3 py-2 text-indigo-600 font-bold">{it.sap_item?.SAP?.numero_sap || odc.sap?.numero_sap || '—'}</td>
                              <td className="px-3 py-2 font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => { const id = it.sap_item?.SAP?.ODP?.id || odc.sap?.ODP?.id; if (id) onFichaOdp?.(id); }}>{it.sap_item?.SAP?.ODP?.numero_odp || odc.sap?.ODP?.numero_odp || '—'}</td>
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
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200"
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-800">Editar ODC — {odc.numero_odc}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Modifica proveedor, notas o estado</p>
                </div>
                <button onClick={() => setEditando(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
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

              <div className="flex gap-3 px-6 pb-6">
                <button
                  onClick={() => setEditando(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarEdicion}
                  disabled={loading || !editProveedor.trim()}
                  className="flex-1 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
                >
                  {loading ? 'Guardando...' : editEstado === 'recibido' && odc.estado !== 'recibido' ? 'Siguiente →' : 'Guardar cambios'}
                </button>
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

      {/* ── MODAL CONFIRMAR ELIMINAR ── */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center border border-slate-200"
            >
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 mb-2">¿Eliminar {odc.numero_odc}?</h3>
              <p className="text-sm text-slate-500 mb-5">Los items del SAP vuelven a estado pendiente. Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEliminar}
                  className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition"
                >
                  Sí, eliminar
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
  const [odcsSeguimiento, setOdcsSeguimiento] = useState<ODC[]>([]);
  const [odcsRecibidas, setOdcsRecibidas] = useState<ODC[]>([]);
  const [vidriosFlat, setVidriosFlat] = useState<ODPItemConContexto[]>([]);
  const [seleccionadosVidrios, setSeleccionadosVidrios] = useState<Set<number>>(new Set());
  const [mostrarModalVidrios, setMostrarModalVidrios] = useState(false);
  const [vidriosExistencia, setVidriosExistencia] = useState<ODPItemConContexto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');


  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchTab = useCallback(async (t: string) => {
    setLoading(true);
    try {
      if (t === 'pendientes') {
        const res = await axios.get(`${API}/api/compras/panel`, { headers });
        setItemsPendientes(res.data);
        setSeleccionados(new Set());
      } else if (t === 'seguimiento') {
        const res = await axios.get(`${API}/api/compras/seguimiento`, { headers });
        setOdcsSeguimiento(res.data);
      } else if (t === 'vidrios') {
        const res = await axios.get(`${API}/api/compras/vidrios/panel`, { headers });
        setVidriosFlat(res.data);
        setSeleccionadosVidrios(new Set());
      } else if (t === 'existencia') {
        const res = await axios.get(`${API}/api/compras/vidrios/existencia`, { headers });
        setVidriosExistencia(res.data);
      } else {
        const res = await axios.get(`${API}/api/compras/recibidas`, { headers });
        setOdcsRecibidas(res.data);
      }
    } catch (err) { console.error('Error en operación de compras:', err); } finally { setLoading(false); }
  }, []);

  // Cargar conteos de todos los tabs al montar para mostrar badges
  useEffect(() => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    axios.get(`${API}/api/compras/panel`, { headers: h }).then(r => setItemsPendientes(r.data)).catch(err => console.error('Error cargando datos de compras:', err));
    axios.get(`${API}/api/compras/seguimiento`, { headers: h }).then(r => setOdcsSeguimiento(r.data)).catch(err => console.error('Error cargando datos de compras:', err));
    axios.get(`${API}/api/compras/recibidas`, { headers: h }).then(r => setOdcsRecibidas(r.data)).catch(err => console.error('Error cargando datos de compras:', err));
    axios.get(`${API}/api/compras/vidrios/panel`, { headers: h }).then(r => setVidriosFlat(r.data)).catch(err => console.error('Error cargando datos de compras:', err));
    axios.get(`${API}/api/compras/vidrios/existencia`, { headers: h }).then(r => setVidriosExistencia(r.data)).catch(err => console.error('Error cargando existencia:', err));
  }, []);

  useEffect(() => { fetchTab(tab); setBusqueda(''); }, [tab, fetchTab]);

  const refresh = () => fetchTab(tab);

  useDataChangedSocket('compras', refresh);

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
    if (t === 'existencia') return vidriosExistencia.length;
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

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-5 w-fit shadow-sm">
        {TABS.map(t => {
          const Icon = t.icon;
          const count = countBadge(t.key);
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${tab === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {count > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
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

              return listaFiltrada.length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">
                    {busqueda ? 'Sin resultados' : 'No hay items pendientes de gestionar'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Barra de acciones */}
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
                    <button
                      onClick={() => setMostrarModal(true)}
                      disabled={seleccionados.size === 0}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" /> Crear ODC ({seleccionados.size})
                    </button>
                  </div>

                  {/* Tabla de items agrupada por código */}
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
                                <th className="px-3 py-1.5 text-left w-40">Asesor</th>
                                <th className="px-3 py-1.5 text-center w-16">Exist.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {grupo.map((item, i) => (
                                <tr
                                  key={item.id}
                                  onClick={() => toggleSeleccion(item.id)}
                                  className={`cursor-pointer transition ${seleccionados.has(item.id) ? 'bg-indigo-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-100'}`}
                                >
                                  <td className="px-4 py-2 w-10" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded accent-indigo-600"
                                      checked={seleccionados.has(item.id)}
                                      onChange={() => toggleSeleccion(item.id)}
                                    />
                                  </td>
                                  <td className="px-3 py-2 w-24 text-slate-500">{item.dimension || '—'}</td>
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
              const lista = filtrarOdcs(odcsRecibidas);
              return lista.length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle2 className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">{busqueda ? 'Sin resultados' : 'No hay ODCs recibidas aún'}</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {lista.map(odc => <ODCCard key={odc.id} odc={odc} onActualizar={refresh} onFichaOdp={setFichaOdpId} />)}
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


            {/* ── TAB EXISTENCIA ── */}
            {tab === 'existencia' && (() => {
              const q = busqueda.toLowerCase();
              const lista = vidriosExistencia.filter(it =>
                !busqueda ||
                (it.tipo_vidrio || '').toLowerCase().includes(q) ||
                (it.color || '').toLowerCase().includes(q) ||
                it.ODP?.numero_odp?.toLowerCase().includes(q) ||
                it.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
              );

              // Agrupar por tipo_vidrio
              const grupos = (() => {
                const map = new Map<string, ODPItemConContexto[]>();
                for (const item of lista) {
                  const key = item.tipo_vidrio || item.prod || '—';
                  if (!map.has(key)) map.set(key, []);
                  map.get(key)!.push(item);
                }
                return map;
              })();

              return lista.length === 0 ? (
                <div className="text-center py-20">
                  <Package className="w-16 h-16 text-slate-200 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">
                    {busqueda ? 'Sin resultados' : 'No hay ítems seleccionados por existencia'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                    <strong>{lista.length}</strong> ítem(s) marcados como "en existencia" (no necesitan orden de compra). Usa el botón de desmarcar para devolverlos a Vidrios pendientes.
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                    {Array.from(grupos.entries()).map(([tipo, grupo], gi) => (
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
              );
            })()}

          </motion.div>
        </AnimatePresence>
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

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default ComprasPage;
