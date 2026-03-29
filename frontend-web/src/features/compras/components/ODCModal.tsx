import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, AlertCircle, Package, ShoppingCart, CheckCircle2, Clock, Edit3, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface SAPItem {
  id: number;
  item: string;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  estado_compra: 'pendiente' | 'en_odc' | 'en_existencia';
}

interface ODCItemData {
  id: number;
  sap_item_id: number;
  item: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
}

interface ODC {
  id: number;
  numero_odc: string;
  proveedor: string;
  estado: 'pendiente' | 'en_transito' | 'recibido' | 'problema';
  notas: string;
  fecha_creacion: string;
  creador: { id: number; nombre_completo: string };
  items: ODCItemData[];
}

interface SAPConODCs {
  id: number;
  numero_sap: string;
  notas: string;
  fecha_creacion: string;
  asesor: { id: number; nombre_completo: string };
  items: SAPItem[];
  ordenes_compra: ODC[];
}

interface Props {
  sap: SAPConODCs;
  odp: any;
  onClose: () => void;
  onRefresh: () => void;
}

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  en_transito: { label: 'En tránsito', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  recibido:    { label: 'Recibido',    className: 'bg-green-100 text-green-700 border-green-200' },
  problema:    { label: 'Problema',    className: 'bg-red-100 text-red-700 border-red-200' },
};

const ITEM_ESTADO: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  pendiente:     { icon: <Clock className="w-3.5 h-3.5" />,       label: 'Pendiente',     className: 'text-amber-600 bg-amber-50 border-amber-200' },
  en_odc:        { icon: <ShoppingCart className="w-3.5 h-3.5" />, label: 'En ODC',        className: 'text-blue-600 bg-blue-50 border-blue-200' },
  en_existencia: { icon: <Package className="w-3.5 h-3.5" />,      label: 'En existencia', className: 'text-green-600 bg-green-50 border-green-200' },
};

const ODCModal: React.FC<Props> = ({ sap: sapInicial, odp, onClose, onRefresh }) => {
  const [sap, setSap] = useState<SAPConODCs>(sapInicial);
  const [modo, setModo] = useState<'ver' | 'crear' | 'editar'>('ver');

  // Estados modo crear
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');

  // Estados modo editar
  const [editandoODC, setEditandoODC] = useState<ODC | null>(null);
  const [editProveedor, setEditProveedor] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [editEstado, setEditEstado] = useState('');

  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const recargar = async () => {
    try {
      const res = await axios.get(`${API}/api/compras/sap/${sap.id}`, { headers });
      setSap(res.data);
    } catch {
      toast.error('Error al recargar SAP');
    }
  };

  const itemsPendientes = sap.items.filter(i => i.estado_compra === 'pendiente');

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExistencia = async (item: SAPItem) => {
    try {
      await axios.patch(`${API}/api/compras/sap-item/${item.id}/existencia`, {}, { headers });
      await recargar();
      onRefresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al actualizar item');
    }
  };

  const handleCrearODC = async () => {
    if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    if (seleccionados.size === 0) { toast.error('Selecciona al menos un item'); return; }
    setLoading(true);
    try {
      const itemsSeleccionados = sap.items
        .filter(i => seleccionados.has(i.id))
        .map(i => ({
          sap_item_id: i.id,
          item: i.item,
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
        }));

      await axios.post(`${API}/api/compras/odc`, {
        sap_id: sap.id,
        odp_id: odp.id,
        proveedor,
        notas,
        items: itemsSeleccionados,
      }, { headers });

      toast.success('ODC creada exitosamente');
      setModo('ver');
      setSeleccionados(new Set());
      setProveedor('');
      setNotas('');
      await recargar();
      onRefresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al crear ODC');
    } finally { setLoading(false); }
  };

  const handleEliminarODC = async (id: number) => {
    try {
      await axios.delete(`${API}/api/compras/odc/${id}`, { headers });
      toast.success('ODC eliminada');
      setDeletingId(null);
      await recargar();
      onRefresh();
    } catch {
      toast.error('Error al eliminar ODC');
    }
  };

  const handleEditarODC = async () => {
    if (!editandoODC) return;
    if (!editProveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    setLoading(true);
    try {
      await axios.put(
        `${API}/api/compras/odc/${editandoODC.id}`,
        { proveedor: editProveedor, notas: editNotas, estado: editEstado },
        { headers }
      );
      toast.success('ODC actualizada');
      setModo('ver');
      setEditandoODC(null);
      await recargar();
      onRefresh();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al actualizar ODC');
    } finally { setLoading(false); }
  };

  const abrirEditar = (odc: ODC) => {
    setEditandoODC(odc);
    setEditProveedor(odc.proveedor);
    setEditNotas(odc.notas || '');
    setEditEstado(odc.estado);
    setModo('editar');
  };

  const volverAVer = () => {
    setModo('ver');
    setSeleccionados(new Set());
    setEditandoODC(null);
  };

  const totalItems = sap.items.length;
  const gestionados = sap.items.filter(i => i.estado_compra !== 'pendiente').length;
  const pct = totalItems > 0 ? Math.round((gestionados / totalItems) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-slate-800">
                {modo === 'editar' && editandoODC
                  ? `Editar ODC — ${editandoODC.numero_odc}`
                  : `Gestión de Compras — ${sap.numero_sap}`}
              </h2>
              {modo === 'ver' && (
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${pct === 100 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                  {pct === 100 ? 'Completado' : 'Pendiente'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
            {/* Barra de progreso — solo en modo ver */}
            {modo === 'ver' && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-500">{gestionados}/{totalItems} items gestionados</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {modo === 'ver' && itemsPendientes.length > 0 && (
              <button
                onClick={() => setModo('crear')}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nueva ODC
              </button>
            )}
            {(modo === 'crear' || modo === 'editar') && (
              <button
                onClick={volverAVer}
                className="px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition"
              >
                ← Volver
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── MODO VER ── */}
          {modo === 'ver' && (
            <div className="p-6 space-y-6">

              {/* Todos los items con su estado */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Items de la SAP</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-700 text-white text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">ITEM</th>
                        <th className="px-3 py-2 w-28">CÓDIGO</th>
                        <th className="px-3 py-2">DESCRIPCIÓN</th>
                        <th className="px-3 py-2 w-24 text-center">EXIS. PERF.</th>
                        <th className="px-3 py-2 w-20 text-center">CANT.</th>
                        <th className="px-3 py-2 w-36 text-center">ESTADO</th>
                        <th className="px-3 py-2 w-28 text-center">ACCIONES</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sap.items.map((item, i) => {
                        const est = ITEM_ESTADO[item.estado_compra];
                        return (
                          <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2 text-center font-black text-slate-600">{item.item}</td>
                            <td className="px-3 py-2 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{item.descripcion || '—'}</td>
                            <td className="px-3 py-2 text-center text-slate-400">—</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-600">{item.cantidad}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${est.className}`}>
                                {est.icon}{est.label}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {item.estado_compra !== 'en_odc' && (
                                <button
                                  onClick={() => toggleExistencia(item)}
                                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition ${item.estado_compra === 'en_existencia' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                                >
                                  {item.estado_compra === 'en_existencia' ? '✓ En existencia' : 'Marcar existencia'}
                                </button>
                              )}
                              {item.estado_compra === 'en_odc' && (
                                <span className="text-[10px] text-slate-400">Asignado a ODC</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ODCs existentes */}
              {sap.ordenes_compra && sap.ordenes_compra.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Órdenes de Compra creadas</p>
                  <div className="space-y-3">
                    {sap.ordenes_compra.map(odc => (
                      <div key={odc.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="font-black text-indigo-700 text-base">{odc.numero_odc}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ESTADO_BADGE[odc.estado]?.className}`}>
                              {ESTADO_BADGE[odc.estado]?.label}
                            </span>
                            <span className="text-xs text-slate-400">
                              {odc.proveedor} · {odc.creador?.nombre_completo} · {new Date(odc.fecha_creacion).toLocaleDateString('es-CO')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {/* Editar */}
                            <button
                              onClick={() => abrirEditar(odc)}
                              title="Editar ODC"
                              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Editar
                            </button>
                            {/* Eliminar */}
                            <button
                              onClick={() => setDeletingId(odc.id)}
                              title="Eliminar ODC"
                              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 border border-slate-200 text-slate-400 rounded-lg hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                          </div>
                        </div>
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-slate-100">
                            {odc.items.map((it, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="px-3 py-1.5 font-black text-slate-600 w-10">{it.item}</td>
                                <td className="px-3 py-1.5 font-mono text-blue-700 font-bold w-28">{it.codigo || '—'}</td>
                                <td className="px-3 py-1.5 text-slate-700">{it.descripcion || '—'}</td>
                                <td className="px-3 py-1.5 text-center font-bold text-slate-600 w-16">{it.cantidad}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {odc.notas && <p className="px-5 py-2 text-xs text-slate-500 italic border-t border-slate-100">"{odc.notas}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sap.ordenes_compra?.length === 0 && itemsPendientes.length === 0 && (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                  <p className="font-bold text-green-700">Todos los items están gestionados</p>
                </div>
              )}
            </div>
          )}

          {/* ── MODO CREAR ODC ── */}
          {modo === 'crear' && (
            <div className="p-6 space-y-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Selecciona los items a incluir en esta ODC
              </p>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-700 text-white text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={seleccionados.size === itemsPendientes.length && itemsPendientes.length > 0}
                          onChange={e => {
                            if (e.target.checked) setSeleccionados(new Set(itemsPendientes.map(i => i.id)));
                            else setSeleccionados(new Set());
                          }}
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2 w-10">ITEM</th>
                      <th className="px-3 py-2 w-28">CÓDIGO</th>
                      <th className="px-3 py-2">DESCRIPCIÓN</th>
                      <th className="px-3 py-2 w-24 text-center">EXIS. PERF.</th>
                      <th className="px-3 py-2 w-20 text-center">CANT.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsPendientes.map((item, i) => (
                      <tr
                        key={item.id}
                        onClick={() => toggleSeleccion(item.id)}
                        className={`cursor-pointer transition ${seleccionados.has(item.id) ? 'bg-indigo-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}
                      >
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={seleccionados.has(item.id)}
                            onChange={() => toggleSeleccion(item.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 font-black text-slate-600">{item.item}</td>
                        <td className="px-3 py-2 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{item.descripcion || '—'}</td>
                        <td className="px-3 py-2 text-center text-slate-400">—</td>
                        <td className="px-3 py-2 text-center font-bold text-slate-600">{item.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {seleccionados.size > 0 && (
                <p className="text-xs text-indigo-600 font-bold">{seleccionados.size} item(s) seleccionado(s)</p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Proveedor <span className="text-red-400">*</span></label>
                  <input
                    value={proveedor}
                    onChange={e => setProveedor(e.target.value)}
                    placeholder="Nombre del proveedor..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Notas (opcional)</label>
                  <input
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    placeholder="Observaciones..."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={volverAVer} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button
                  onClick={handleCrearODC}
                  disabled={loading || seleccionados.size === 0 || !proveedor.trim()}
                  className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
                >
                  {loading ? 'Creando...' : `Crear ODC con ${seleccionados.size} item(s)`}
                </button>
              </div>
            </div>
          )}

          {/* ── MODO EDITAR ODC ── */}
          {modo === 'editar' && editandoODC && (
            <div className="p-6 space-y-5">

              {/* Campos editables */}
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="max-w-xs">
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Estado</label>
                <select
                  value={editEstado}
                  onChange={e => setEditEstado(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="en_transito">En tránsito</option>
                  <option value="recibido">Recibido</option>
                  <option value="problema">Problema</option>
                </select>
              </div>

              {/* Items de la ODC (solo lectura) */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Items de esta ODC (no editables)</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-700 text-white text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">ITEM</th>
                        <th className="px-3 py-2 w-28">CÓDIGO</th>
                        <th className="px-3 py-2">DESCRIPCIÓN</th>
                        <th className="px-3 py-2 w-24 text-center">EXIS. PERF.</th>
                        <th className="px-3 py-2 w-20 text-center">CANT.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editandoODC.items.map((it, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-3 py-2 text-center font-black text-slate-600">{it.item}</td>
                          <td className="px-3 py-2 font-mono text-blue-700 font-bold">{it.codigo || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{it.descripcion || '—'}</td>
                          <td className="px-3 py-2 text-center text-slate-400">—</td>
                          <td className="px-3 py-2 text-center font-bold text-slate-600">{it.cantidad}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-100">
                <button onClick={volverAVer} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button
                  onClick={handleEditarODC}
                  disabled={loading || !editProveedor.trim()}
                  className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
                >
                  {loading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Confirmar eliminar ODC */}
      <AnimatePresence>
        {deletingId !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center"
            >
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 mb-2">¿Eliminar esta ODC?</h3>
              <p className="text-sm text-slate-500 mb-5">Los items vuelven a estado pendiente.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletingId(null)} className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button onClick={() => handleEliminarODC(deletingId!)} className="flex-1 py-2.5 font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition">Sí, eliminar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ODCModal;
