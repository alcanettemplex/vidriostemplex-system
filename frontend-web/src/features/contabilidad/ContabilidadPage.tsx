import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Calculator, DollarSign, FileCheck, AlertCircle, TrendingUp, CreditCard } from 'lucide-react';

const ContabilidadPage: React.FC = () => {
  const [odps, setOdps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEstadoCaja, setFilterEstadoCaja] = useState('todos');

  const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API}/api/odp`, { headers: { Authorization: `Bearer ${token}` } });
      setOdps(res.data);
    } catch {
      // Fallback demo
      setOdps([
        { id: 1, numero_odp: 'ODP-2026-001', cliente: { nombre_razon_social: 'Constructora Apex' }, abono: 800, pendiente: 400, estado_caja: 'ABONADO', estado_facturacion: 'FACTURADA', factura_electronica: '000890', fecha_creacion: '2026-03-01' },
        { id: 2, numero_odp: 'ODP-2026-002', cliente: { nombre_razon_social: 'Hotel Marina' }, abono: 0, pendiente: 1500, estado_caja: 'PENDIENTE', estado_facturacion: 'PENDIENTE', factura_electronica: null, fecha_creacion: '2026-03-05' },
        { id: 3, numero_odp: 'ODP-2026-003', cliente: { nombre_razon_social: 'Edificio Central' }, abono: 2000, pendiente: 0, estado_caja: 'CANCELADO', estado_facturacion: 'FACTURADA', factura_electronica: '000891', fecha_creacion: '2026-02-20' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const updateCaja = async (id: number, campo: string, valor: string) => {
    try {
      await axios.put(`${API}/api/odp/${id}`, { [campo]: valor }, { headers: { Authorization: `Bearer ${token}` } });
      setOdps(prev => prev.map(o => o.id === id ? { ...o, [campo]: valor } : o));
    } catch {
      setOdps(prev => prev.map(o => o.id === id ? { ...o, [campo]: valor } : o));
    }
  };

  const filtradas = filterEstadoCaja === 'todos' ? odps : odps.filter(o => o.estado_caja === filterEstadoCaja);

  // KPIs financieros
  const totalAbonado = odps.reduce((s, o) => s + (Number(o.abono) || 0), 0);
  const totalPorCobrar = odps.reduce((s, o) => s + (Number(o.pendiente) || 0), 0);
  const totalFacturadas = odps.filter(o => o.estado_facturacion === 'FACTURADA').length;
  const totalPendFactura = odps.filter(o => o.estado_facturacion === 'PENDIENTE').length;

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <Calculator className="w-8 h-8 text-indigo-600" />
          Contabilidad y Finanzas
        </h1>
        <p className="text-slate-500 font-medium mt-1">Control de facturación, caja y cuentas por cobrar</p>
      </div>

      {/* KPIs Financieros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Recaudado', value: fmt(totalAbonado), icon: <DollarSign className="w-6 h-6" />, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Por Cobrar', value: fmt(totalPorCobrar), icon: <CreditCard className="w-6 h-6" />, color: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'ODPs Facturadas', value: totalFacturadas, icon: <FileCheck className="w-6 h-6" />, color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Sin Factura', value: totalPendFactura, icon: <AlertCircle className="w-6 h-6" />, color: 'text-amber-700 bg-amber-50 border-amber-200' },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className={`border rounded-2xl p-5 flex items-center gap-4 ${kpi.color}`}>
            <div className="p-2 bg-white/60 rounded-xl">{kpi.icon}</div>
            <div>
              <p className="text-2xl font-extrabold leading-none">{kpi.value}</p>
              <p className="text-xs font-bold mt-1 opacity-75">{kpi.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Estado Caja:</span>
        {['todos', 'PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO'].map(f => (
          <button key={f} onClick={() => setFilterEstadoCaja(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filterEstadoCaja === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
            {f === 'todos' ? 'Todos' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['ODP', 'Cliente', 'Factura Elect.', 'Abonado', 'Pendiente', 'Estado Caja', 'Facturación'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                ))
              ) : filtradas.map(odp => (
                <tr key={odp.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4 font-bold text-indigo-700">{odp.numero_odp}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800 max-w-[180px] truncate">{odp.cliente?.nombre_razon_social}</td>
                  <td className="px-5 py-4">
                    {odp.factura_electronica
                      ? <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">N° {odp.factura_electronica}</span>
                      : <span className="text-slate-400 text-xs italic">Sin factura</span>}
                  </td>
                  <td className="px-5 py-4 font-bold text-emerald-700">{fmt(Number(odp.abono) || 0)}</td>
                  <td className="px-5 py-4">
                    <span className={`font-bold text-sm ${Number(odp.pendiente) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {fmt(Number(odp.pendiente) || 0)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <select value={odp.estado_caja} onChange={e => updateCaja(odp.id, 'estado_caja', e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        odp.estado_caja === 'CANCELADO' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        odp.estado_caja === 'ABONADO' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                        odp.estado_caja === 'CREDITO_APROBADO' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                        'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="ABONADO">Abonado</option>
                      <option value="CANCELADO">Cancelado</option>
                      <option value="CREDITO_APROBADO">Crédito Aprobado</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <select value={odp.estado_facturacion} onChange={e => updateCaja(odp.id, 'estado_facturacion', e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="FACTURADA">Facturada</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ContabilidadPage;
