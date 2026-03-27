import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Calculator, DollarSign, FileCheck, AlertCircle,
  CreditCard, Plus, X, Receipt, Clock, Banknote, TrendingDown
} from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const getToken = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${getToken()}` });
const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const BANCOS_COLOMBIA = [
  'Bancolombia', 'Nequi', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Scotiabank Colpatria',
  'Banco Popular', 'Banco de Occidente', 'AV Villas', 'Banco Caja Social', 'Banco Agrario',
  'Citibank', 'Banco Falabella', 'Banco Pichincha', 'Banco Serfinanza', 'Itaú', 'Banco GNB Sudameris',
  'Banco Finandina', 'Banco Mundo Mujer', 'Lulo Bank', 'Movii', 'Rappipay', 'Otro',
];

const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Nequi', 'Consignación'];

const ContabilidadPage: React.FC = () => {
  // ─── Estado: tabla ODPs ─────────────────────────────────────────────
  const [odps, setOdps] = useState<any[]>([]);
  const [loadingOdps, setLoadingOdps] = useState(true);
  const [filterEstadoCaja, setFilterEstadoCaja] = useState('todos');

  // ─── Estado: resumen financiero y pagos ──────────────────────────────
  const [resumen, setResumen] = useState<any>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loadingResumen, setLoadingResumen] = useState(true);

  // ─── Estado: modal de pago ──────────────────────────────────────────
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [pagoForm, setPagoForm] = useState({
    odp_id: '',
    monto: '',
    metodo_pago: 'Transferencia',
    banco: '',
    referencia_pago: '',
    observaciones: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // ─── Estado: modal FE ───────────────────────────────────────────────
  const [showFeModal, setShowFeModal] = useState(false);
  const [feTarget, setFeTarget] = useState<{ id: number; numero_odp: string } | null>(null);
  const [feForm, setFeForm] = useState({ numero_fe: '', fecha_fe: '' });
  const [submittingFe, setSubmittingFe] = useState(false);

  // ─── Fetchers ───────────────────────────────────────────────────────
  const fetchOdps = useCallback(async () => {
    try {
      setLoadingOdps(true);
      const res = await axios.get(`${API}/api/odp`, { headers: headers() });
      setOdps(res.data);
    } catch {
      setOdps([]);
    } finally {
      setLoadingOdps(false);
    }
  }, []);

  const fetchResumen = useCallback(async () => {
    try {
      setLoadingResumen(true);
      const [resumenRes, pagosRes] = await Promise.all([
        axios.get(`${API}/api/contabilidad/resumen`, { headers: headers() }).catch(() => null),
        axios.get(`${API}/api/contabilidad/pagos`, { headers: headers() }).catch(() => ({ data: [] })),
      ]);
      if (resumenRes) setResumen(resumenRes.data);
      setPagos(pagosRes?.data || []);
    } catch {
      /* silenciar si no hay acceso */
    } finally {
      setLoadingResumen(false);
    }
  }, []);

  useEffect(() => {
    fetchOdps();
    fetchResumen();
  }, [fetchOdps, fetchResumen]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const updateCaja = async (id: number, campo: string, valor: string) => {
    try {
      await axios.put(`${API}/api/odp/${id}`, { [campo]: valor }, { headers: headers() });
      setOdps(prev => prev.map(o => o.id === id ? { ...o, [campo]: valor } : o));
      toast.success('Estado actualizado');
    } catch {
      toast.error('Error al actualizar estado');
    }
  };

  const handleFacturacionChange = (odp: any, nuevoEstado: string) => {
    if (nuevoEstado === 'FACTURADA') {
      setFeTarget({ id: odp.id, numero_odp: odp.numero_odp });
      setFeForm({ numero_fe: odp.factura_electronica || '', fecha_fe: odp.fecha_factura ? odp.fecha_factura.split('T')[0] : new Date().toISOString().split('T')[0] });
      setShowFeModal(true);
    } else {
      updateCaja(odp.id, 'estado_facturacion', nuevoEstado);
    }
  };

  const handleFeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feTarget) return;
    if (!feForm.numero_fe.trim()) { toast.error('Ingresa el número de factura electrónica'); return; }
    if (!feForm.fecha_fe) { toast.error('Ingresa la fecha de la factura'); return; }
    setSubmittingFe(true);
    try {
      await axios.put(`${API}/api/odp/${feTarget.id}`, {
        estado_facturacion: 'FACTURADA',
        factura_electronica: feForm.numero_fe.trim(),
        fecha_factura: feForm.fecha_fe,
      }, { headers: headers() });
      setOdps(prev => prev.map(o => o.id === feTarget.id
        ? { ...o, estado_facturacion: 'FACTURADA', factura_electronica: feForm.numero_fe.trim(), fecha_factura: feForm.fecha_fe }
        : o));
      toast.success('Factura registrada correctamente');
      setShowFeModal(false);
      setFeTarget(null);
    } catch {
      toast.error('Error al registrar factura');
    } finally {
      setSubmittingFe(false);
    }
  };

  const handlePagoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoForm.odp_id || !pagoForm.monto || Number(pagoForm.monto) <= 0) {
      toast.error('Selecciona una ODP y un monto válido.');
      return;
    }
    const requiereBanco = ['Transferencia', 'Nequi', 'Consignación'].includes(pagoForm.metodo_pago);
    if (requiereBanco && !pagoForm.banco) {
      toast.error('Selecciona el banco para este método de pago.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        odp_id: Number(pagoForm.odp_id),
        monto: Number(pagoForm.monto),
        metodo_pago: pagoForm.metodo_pago,
        referencia_pago: pagoForm.referencia_pago || undefined,
        observaciones: pagoForm.banco
          ? `Banco: ${pagoForm.banco}${pagoForm.observaciones ? ' — ' + pagoForm.observaciones : ''}`
          : pagoForm.observaciones || undefined,
      };
      await axios.post(`${API}/api/contabilidad/pagos`, payload, { headers: headers() });
      toast.success('Pago registrado correctamente');
      setShowPagoModal(false);
      setPagoForm({ odp_id: '', monto: '', metodo_pago: 'Transferencia', banco: '', referencia_pago: '', observaciones: '' });
      fetchOdps();
      fetchResumen();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar pago');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Datos derivados ────────────────────────────────────────────────
  const filtradas = filterEstadoCaja === 'todos' ? odps : odps.filter(o => o.estado_caja === filterEstadoCaja);
  const odpsPendientes = odps.filter(o => Number(o.pendiente) > 0);

  // KPIs: usar resumen del API si disponible, sino calcular del frontend
  const totalAbonado = resumen?.total_abonado || fmt(odps.reduce((s, o) => s + (Number(o.abono) || 0), 0));
  const totalPorCobrar = resumen?.total_pendiente || fmt(odps.reduce((s, o) => s + (Number(o.pendiente) || 0), 0));
  const totalFacturadas = resumen?.total_facturadas ?? odps.filter(o => o.estado_facturacion === 'FACTURADA').length;
  const pendFactura = resumen?.pendientes_factura ?? odps.filter(o => o.estado_facturacion === 'PENDIENTE').length;
  const carteraVencida = resumen?.cartera_vencida || '$0';

  const requiereBancoActual = ['Transferencia', 'Nequi', 'Consignación'].includes(pagoForm.metodo_pago);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Calculator className="w-8 h-8 text-indigo-600" />
            Contabilidad y Finanzas
          </h1>
          <p className="text-slate-500 font-medium mt-1">Control de facturación, caja, pagos y cuentas por cobrar</p>
        </div>
        <button
          onClick={() => setShowPagoModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> Registrar Pago
        </button>
      </div>

      {/* KPIs FINANCIEROS */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Recaudado', value: totalAbonado, icon: <DollarSign className="w-6 h-6" />, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Por Cobrar', value: totalPorCobrar, icon: <CreditCard className="w-6 h-6" />, color: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'Cartera Vencida', value: carteraVencida, icon: <TrendingDown className="w-6 h-6" />, color: 'text-orange-700 bg-orange-50 border-orange-200' },
          { label: 'Facturadas', value: totalFacturadas, icon: <FileCheck className="w-6 h-6" />, color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Sin Factura', value: pendFactura, icon: <AlertCircle className="w-6 h-6" />, color: 'text-amber-700 bg-amber-50 border-amber-200' },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className={`border rounded-2xl p-5 flex items-center gap-4 ${kpi.color}`}>
            <div className="p-2 bg-white/60 rounded-xl">{kpi.icon}</div>
            <div>
              <p className="text-2xl font-extrabold leading-none">{kpi.value}</p>
              <p className="text-xs font-bold mt-1 opacity-75">{kpi.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* PAGOS RECIENTES */}
      {pagos.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Pagos Recientes</h2>
            <span className="ml-auto text-xs font-bold text-slate-400">{pagos.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Fecha', 'ODP', 'Monto', 'Método', 'Recibo No.', 'Registrado por'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagos.slice(0, 10).map((pago: any) => (
                  <tr key={pago.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(pago.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-100">
                        {pago.odp?.numero_odp || `ODP-${pago.odp_id}`}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-bold text-emerald-700">{fmt(Number(pago.monto))}</td>
                    <td className="px-5 py-3 text-slate-700 capitalize">{pago.metodo_pago}</td>
                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{pago.referencia_pago || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{pago.registrador?.nombre_completo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* FILTROS ESTADO CAJA */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Estado Caja:</span>
        {['todos', 'PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO'].map(f => (
          <button key={f} onClick={() => setFilterEstadoCaja(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${filterEstadoCaja === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
            {f === 'todos' ? 'Todos' : f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* TABLA DE ODPs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['ODP', 'Cliente', 'FE No. / Fecha', 'Monto Total', 'Abonado', 'Pendiente', 'Estado Caja', 'Facturación', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingOdps ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                ))
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-slate-400 font-bold">No hay registros que mostrar.</td></tr>
              ) : filtradas.map(odp => (
                <tr key={odp.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4 font-bold text-indigo-700">{odp.numero_odp}</td>
                  <td className="px-5 py-4 font-semibold text-slate-800 max-w-[180px] truncate">{odp.cliente?.nombre_razon_social}</td>
                  <td className="px-5 py-4">
                    {odp.factura_electronica ? (
                      <div>
                        <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-xs">
                          FE-{odp.factura_electronica}
                        </span>
                        {odp.fecha_factura && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(odp.fecha_factura).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Sin factura</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-700">{Number(odp.valor_total) > 0 ? fmt(Number(odp.valor_total)) : <span className="text-slate-400 text-xs italic">—</span>}</td>
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
                    <select value={odp.estado_facturacion} onChange={e => handleFacturacionChange(odp, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="FACTURADA">Facturada</option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => { setPagoForm(p => ({ ...p, odp_id: String(odp.id), monto: '' })); setShowPagoModal(true); }}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all flex items-center gap-1"
                    >
                      <Banknote className="w-3.5 h-3.5" /> Registrar Abono
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CARTERA VENCIDA */}
      {resumen?.cartera_detalle?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="border-t-4 border-t-rose-500 p-5 bg-white shadow-sm rounded-b-2xl border border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-rose-500" />
            Cartera Vencida
            <span className="ml-auto text-sm font-bold text-rose-600">{resumen.cartera_vencida}</span>
          </h3>
          <div className="space-y-3">
            {resumen.cartera_detalle.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border-l-2 border-rose-300">
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.odp}</p>
                  <p className="text-xs text-slate-500">{item.cliente}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-rose-600">{item.pendiente}</p>
                  <p className="text-xs text-slate-400">Vencido {item.dias_vencido} días</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* MODAL FACTURA ELECTRÓNICA */}
      {showFeModal && feTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" /> Registrar Factura Electrónica
              </h2>
              <button onClick={() => { setShowFeModal(false); setFeTarget(null); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFeSubmit} className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                ODP: <span className="font-bold text-indigo-700">{feTarget.numero_odp}</span>
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">FE No. *</label>
                <input
                  value={feForm.numero_fe}
                  onChange={e => setFeForm(p => ({ ...p, numero_fe: e.target.value }))}
                  placeholder="Ej: FE-2024-001"
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha Factura *</label>
                <input
                  type="date"
                  value={feForm.fecha_fe}
                  onChange={e => setFeForm(p => ({ ...p, fecha_fe: e.target.value }))}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowFeModal(false); setFeTarget(null); }}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={submittingFe}
                  className="flex-1 py-2.5 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  {submittingFe ? 'Guardando...' : 'Confirmar Facturada'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL REGISTRAR PAGO */}
      {showPagoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" /> Registrar Pago
              </h2>
              <button onClick={() => setShowPagoModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePagoSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">ODP *</label>
                <select value={pagoForm.odp_id} onChange={e => setPagoForm(p => ({ ...p, odp_id: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">-- Seleccionar ODP con pendiente --</option>
                  {odpsPendientes.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.numero_odp} — {o.cliente?.nombre_razon_social} — Pendiente: {fmt(Number(o.pendiente))}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Monto (COP) *</label>
                  <input type="number" value={pagoForm.monto} onChange={e => setPagoForm(p => ({ ...p, monto: e.target.value }))}
                    placeholder="0" min="1" required
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Forma de Pago *</label>
                  <select value={pagoForm.metodo_pago} onChange={e => setPagoForm(p => ({ ...p, metodo_pago: e.target.value, banco: '' }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {requiereBancoActual && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Banco *</label>
                  <select value={pagoForm.banco} onChange={e => setPagoForm(p => ({ ...p, banco: e.target.value }))}
                    required={requiereBancoActual}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">-- Seleccionar banco --</option>
                    {BANCOS_COLOMBIA.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Recibo No.</label>
                <input value={pagoForm.referencia_pago} onChange={e => setPagoForm(p => ({ ...p, referencia_pago: e.target.value }))}
                  placeholder="Número de recibo o comprobante"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Observaciones</label>
                <textarea value={pagoForm.observaciones} onChange={e => setPagoForm(p => ({ ...p, observaciones: e.target.value }))}
                  placeholder="Notas adicionales del pago..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPagoModal(false)}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2.5 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? 'Registrando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ContabilidadPage;
