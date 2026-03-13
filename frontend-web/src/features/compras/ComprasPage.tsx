import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, FileText, CheckCircle2, Clock, Package, AlertTriangle, X } from 'lucide-react';
import { toast } from 'react-toastify';

interface OrdenCompra {
  id: number;
  odp_id: number;
  numero_odp: string;
  proveedor: string;
  odc: string;
  monto: number;
  estado: string;
  fecha_entrega: string;
  descripcion: string;
}

const estadoConfig: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  'pendiente': { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Pendiente', icon: <Clock className="w-3.5 h-3.5" /> },
  'en_transito': { color: 'bg-blue-100 text-blue-800 border-blue-200', label: 'En Tránsito', icon: <Package className="w-3.5 h-3.5" /> },
  'recibido': { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'Recibido', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  'problema': { color: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Problema', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

const ComprasPage: React.FC = () => {
  const [odps, setOdps] = useState<any[]>([]);
  const [compras, setCompras] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterEstado, setFilterEstado] = useState('todos');
  const [form, setForm] = useState({
    odp_id: '',
    proveedor: '',
    odc: '',
    monto: '',
    descripcion: '',
    estado: 'pendiente',
    fecha_entrega: '',
  });

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [odpsRes, comprasRes] = await Promise.all([
        axios.get(`${API}/api/odp`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/api/compras`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
      ]);
      // Solo ODPs activas (sin entregar)
      setOdps(odpsRes.data.filter((o: any) => !['INSTALADA', 'ENTREGADA'].includes(o.estado_produccion)));
      setCompras(comprasRes.data);
    } catch (e) {
      toast.error('Error al cargar datos de compras');
      setCompras([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.odp_id || !form.proveedor || !form.odc) {
      toast.error('Completa los campos obligatorios.');
      return;
    }
    try {
      await axios.post(`${API}/api/compras`, form, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Orden de compra registrada');
      setShowForm(false);
      setForm({ odp_id: '', proveedor: '', odc: '', monto: '', descripcion: '', estado: 'pendiente', fecha_entrega: '' });
      fetchData();
    } catch {
      toast.error('Error al registrar la orden de compra');
    }
  };

  const filtradas = filterEstado === 'todos' ? compras : compras.filter(c => c.estado === filterEstado);
  const totalPendiente = compras.filter(c => c.estado === 'pendiente').length;
  const totalTransito = compras.filter(c => c.estado === 'en_transito').length;
  const totalRecibido = compras.filter(c => c.estado === 'recibido').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-indigo-600" />
            Módulo de Compras
          </h1>
          <p className="text-slate-500 font-medium mt-1">Gestión de proveedores y órdenes de compra por ODP</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> Nueva Compra
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendientes', count: totalPendiente, color: 'bg-amber-50 border-amber-200 text-amber-800' },
          { label: 'En Tránsito', count: totalTransito, color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Recibidas', count: totalRecibido, color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className={`border rounded-2xl p-5 text-center ${kpi.color}`}>
            <p className="text-4xl font-black">{kpi.count}</p>
            <p className="text-sm font-bold mt-1">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap">
        {['todos', 'pendiente', 'en_transito', 'recibido', 'problema'].map(f => (
          <button key={f} onClick={() => setFilterEstado(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold border transition-all capitalize ${filterEstado === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
            {f === 'todos' ? 'Todas' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['ODP', 'Descripción', 'Proveedor', 'ODC', 'Monto', 'Fecha Entrega', 'Estado'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                ))
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400 font-bold">No hay órdenes de compra para mostrar.</td></tr>
              ) : filtradas.map(c => {
                const cfg = estadoConfig[c.estado] || estadoConfig['pendiente'];
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4"><span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-100">{c.numero_odp}</span></td>
                    <td className="px-5 py-4 text-slate-700 max-w-[200px] truncate">{c.descripcion}</td>
                    <td className="px-5 py-4 font-semibold text-slate-800">{c.proveedor}</td>
                    <td className="px-5 py-4 font-mono text-slate-700 font-bold">{c.odc}</td>
                    <td className="px-5 py-4 font-bold text-slate-800">${Number(c.monto).toLocaleString('es-CO')}</td>
                    <td className="px-5 py-4 text-slate-600">{c.fecha_entrega ? new Date(c.fecha_entrega + 'T00:00:00').toLocaleDateString('es-CO') : '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA COMPRA */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" /> Registrar Orden de Compra
              </h2>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">ODP Vinculada *</label>
                <select value={form.odp_id} onChange={e => setForm(p => ({ ...p, odp_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">-- Seleccionar ODP --</option>
                  {odps.map(o => <option key={o.id} value={o.id}>{o.numero_odp} — {o.cliente?.nombre_razon_social}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Descripción del Material</label>
                <input value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Ej: Vidrio templado 10mm claro" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Proveedor *</label>
                  <input value={form.proveedor} onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))}
                    placeholder="Nombre del proveedor" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">N° ODC *</label>
                  <input value={form.odc} onChange={e => setForm(p => ({ ...p, odc: e.target.value }))}
                    placeholder="ODC-0001" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Monto ($)</label>
                  <input type="number" value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
                    placeholder="0.00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha Entrega</label>
                  <input type="date" value={form.fecha_entrega} onChange={e => setForm(p => ({ ...p, fecha_entrega: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Estado</label>
                <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="pendiente">Pendiente</option>
                  <option value="en_transito">En Tránsito</option>
                  <option value="recibido">Recibido</option>
                  <option value="problema">Problema</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-md shadow-indigo-200">
                  Registrar Compra
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ComprasPage;
