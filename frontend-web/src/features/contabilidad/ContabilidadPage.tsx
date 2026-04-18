import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import {
  Calculator, DollarSign, FileCheck, AlertCircle,
  CreditCard, Plus, X, Receipt, Clock, Banknote, TrendingDown,
  Pencil, Trash2, Calendar, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { useDataChangedSocket } from '../../store/useSocketNotifications';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const getToken = () => sessionStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${getToken()}` });
const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtFecha = (f: string | null | undefined) => {
  if (!f) return '—';
  try {
    // Extraer YYYY-MM-DD del string ISO para evitar el offset UTC→Bogotá (UTC-5)
    // que convierte medianoche UTC al día anterior en Colombia.
    const datePart = typeof f === 'string' ? f.substring(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const [y, m, d] = datePart.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
  } catch { return f; }
};

const BANCOS_COLOMBIA = [
  'Bancolombia', 'Nequi', 'Davivienda', 'Banco de Bogotá', 'BBVA', 'Scotiabank Colpatria',
  'Banco Popular', 'Banco de Occidente', 'AV Villas', 'Banco Caja Social', 'Banco Agrario',
  'Citibank', 'Banco Falabella', 'Banco Pichincha', 'Banco Serfinanza', 'Itaú', 'Banco GNB Sudameris',
  'Banco Finandina', 'Banco Mundo Mujer', 'Lulo Bank', 'Movii', 'Rappipay', 'Otro',
];

const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia'];

type Tab = 'estado_caja' | 'pagos' | 'cartera';

const emptyPagoForm = () => ({
  odp_id: '', monto: '', diferencia: '0', metodo_pago: 'Transferencia', banco: '', referencia_pago: '', observaciones: '',
  fecha: new Date().toISOString().split('T')[0],
});

const ContabilidadPage: React.FC = () => {
  const [tab, setTab] = useState<Tab>('estado_caja');

  // ─── ODPs ────────────────────────────────────────────────────────────────
  const [odps, setOdps] = useState<any[]>([]);
  const [loadingOdps, setLoadingOdps] = useState(true);
  const [filterEstadoCaja, setFilterEstadoCaja] = useState('todos');
  const [filterBusqueda, setFilterBusqueda] = useState('');

  // ─── Resumen / pagos ─────────────────────────────────────────────────────
  const [resumen, setResumen] = useState<any>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loadingResumen, setLoadingResumen] = useState(true);

  // ─── Modal nuevo pago ────────────────────────────────────────────────────
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [odpFija, setOdpFija] = useState(false);
  const [pagoForm, setPagoForm] = useState(emptyPagoForm());
  const [submitting, setSubmitting] = useState(false);

  // ─── Modal FE (nueva o edición) ──────────────────────────────────────────
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);
  const [showFeModal, setShowFeModal] = useState(false);
  const [feTarget, setFeTarget] = useState<{ id: number; numero_odp: string } | null>(null);
  const [feForm, setFeForm] = useState({ numero_fe: '', fecha_fe: '' });
  const [submittingFe, setSubmittingFe] = useState(false);

  // ─── Modal editar pago ───────────────────────────────────────────────────
  const [showEditPagoModal, setShowEditPagoModal] = useState(false);
  const [editPagoTarget, setEditPagoTarget] = useState<any>(null);
  const [editPagoForm, setEditPagoForm] = useState({
    monto: '', metodo_pago: 'Transferencia', banco: '', referencia_pago: '', observaciones: '',
    fecha: new Date().toISOString().split('T')[0],
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // ─── Modal editar total ODP ─────────────────────────────────────────────
  const [showEditTotalModal, setShowEditTotalModal] = useState(false);
  const [editTotalTarget, setEditTotalTarget] = useState<any>(null);
  const [newTotal, setNewTotal] = useState('');
  const [submittingTotal, setSubmittingTotal] = useState(false);

  // ─── Modal eliminar pago ─────────────────────────────────────────────────
  const [showDeletePagoModal, setShowDeletePagoModal] = useState(false);
  const [deletePagoTarget, setDeletePagoTarget] = useState<any>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // ─── Ordenamiento tabla Estado Caja ─────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string | null) => {
    if (!key) return;
    if (sortCol === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(key);
      setSortDir('asc');
    }
  };

  // ─── Fetchers ────────────────────────────────────────────────────────────
  const fetchOdps = useCallback(async () => {
    try {
      setLoadingOdps(true);
      const res = await axios.get(`${API}/api/odp`, { headers: headers() });
      if (Array.isArray(res.data)) {
        // Las OA (sin IVA) no aparecen en contabilidad
        setOdps(res.data.filter((o: any) => o.tipo_odp !== 'OA'));
      } else {
        console.error('Respuesta de ODPs no es un array:', res.data);
        setOdps([]);
      }
    } catch (err) { 
      console.error('Error fetching ODPs:', err);
      setOdps([]); 
    } finally { setLoadingOdps(false); }
  }, []);

  const fetchResumen = useCallback(async () => {
    try {
      setLoadingResumen(true);
      const [resumenRes, pagosRes] = await Promise.all([
        axios.get(`${API}/api/contabilidad/resumen`, { headers: headers() }).catch((err) => {
          console.error('Error resumen dashboard:', err);
          return null;
        }),
        axios.get(`${API}/api/contabilidad/pagos`, { headers: headers() }).catch((err) => {
          console.error('Error listado pagos:', err);
          return { data: [] };
        }),
      ]);
      if (resumenRes) setResumen(resumenRes.data);
      setPagos(pagosRes?.data || []);
    } catch (err) {
      console.error('Error en Promise.all de contabilidad:', err);
    } finally { setLoadingResumen(false); }
  }, []);

  useEffect(() => { fetchOdps(); fetchResumen(); }, [fetchOdps, fetchResumen]);
  useDataChangedSocket('contabilidad', () => { fetchOdps(); fetchResumen(); });
  useDataChangedSocket('odp', fetchOdps);

  // ─── Handlers estado caja / facturación ──────────────────────────────────
  const updateCaja = async (id: number, campo: string, valor: string) => {
    try {
      const endpoint = campo === 'estado_caja'
        ? `${API}/api/odp/${id}/caja`
        : `${API}/api/odp/${id}/facturar`;
      await axios.patch(endpoint, { [campo]: valor }, { headers: headers() });
      setOdps(prev => prev.map(o => o.id === id ? { ...o, [campo]: valor } : o));
      toast.success('Estado actualizado');
    } catch { toast.error('Error al actualizar estado'); }
  };

  const abrirFeModal = (odp: any) => {
    setFeTarget({ id: odp.id, numero_odp: odp.numero_odp });
    setFeForm({
      numero_fe: odp.factura_electronica || '',
      fecha_fe: odp.fecha_factura ? odp.fecha_factura.split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setShowFeModal(true);
  };

  const handleFacturacionChange = (odp: any, nuevoEstado: string) => {
    if (nuevoEstado === 'FACTURADA') {
      abrirFeModal(odp);
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
      await axios.patch(`${API}/api/odp/${feTarget.id}/facturar`, {
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
    } catch { toast.error('Error al registrar factura'); } finally { setSubmittingFe(false); }
  };

  // ─── Handler nuevo pago ──────────────────────────────────────────────────
  const handlePagoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoForm.odp_id || !pagoForm.monto || Number(pagoForm.monto) <= 0) {
      toast.error('Selecciona una ODP y un monto válido.'); return;
    }
    if (pagoForm.metodo_pago === 'Transferencia' && !pagoForm.banco) {
      toast.error('Selecciona el banco para transferencias.'); return;
    }
    setSubmitting(true);
    try {
      const payload = {
        odp_id: Number(pagoForm.odp_id),
        monto: Number(pagoForm.monto),
        diferencia: Number(pagoForm.diferencia) || 0,
        metodo_pago: pagoForm.metodo_pago === 'Transferencia' ? pagoForm.banco : pagoForm.metodo_pago,
        referencia_pago: pagoForm.referencia_pago || undefined,
        observaciones: pagoForm.observaciones || undefined,
        fecha: pagoForm.fecha || undefined,
      };
      await axios.post(`${API}/api/contabilidad/pagos`, payload, { headers: headers() });
      toast.success('Pago registrado correctamente');
      setShowPagoModal(false);
      setPagoForm(emptyPagoForm());
      fetchOdps();
      fetchResumen();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al registrar pago');
    } finally { setSubmitting(false); }
  };

  // ─── Handler editar pago ─────────────────────────────────────────────────
  const abrirEditPago = (pago: any) => {
    setEditPagoTarget(pago);
    const esBanco = BANCOS_COLOMBIA.includes(pago.metodo_pago);
    setEditPagoForm({
      monto: String(pago.monto),
      metodo_pago: esBanco ? 'Transferencia' : pago.metodo_pago,
      banco: esBanco ? pago.metodo_pago : '',
      referencia_pago: pago.referencia_pago || '',
      observaciones: pago.observaciones || '',
      fecha: pago.fecha ? new Date(pago.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setShowEditPagoModal(true);
  };

  const handleEditPagoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPagoTarget) return;
    if (!editPagoForm.monto || Number(editPagoForm.monto) <= 0) {
      toast.error('Ingresa un monto válido'); return;
    }
    if (editPagoForm.metodo_pago === 'Transferencia' && !editPagoForm.banco) {
      toast.error('Selecciona el banco'); return;
    }
    setSubmittingEdit(true);
    try {
      const payload = {
        monto: Number(editPagoForm.monto),
        metodo_pago: editPagoForm.metodo_pago === 'Transferencia' ? editPagoForm.banco : editPagoForm.metodo_pago,
        referencia_pago: editPagoForm.referencia_pago || null,
        observaciones: editPagoForm.observaciones || null,
        fecha: editPagoForm.fecha || null,
      };
      await axios.put(`${API}/api/contabilidad/pagos/${editPagoTarget.id}`, payload, { headers: headers() });
      toast.success('Pago actualizado correctamente');
      setShowEditPagoModal(false);
      setEditPagoTarget(null);
      fetchOdps();
      fetchResumen();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al editar pago');
    } finally { setSubmittingEdit(false); }
  };

  // ─── Handler editar total ODP ───────────────────────────────────────────
  const abrirEditTotal = (odp: any) => {
    setEditTotalTarget(odp);
    setNewTotal(String(odp.valor_total || ''));
    setShowEditTotalModal(true);
  };

  const handleEditTotalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTotalTarget || !newTotal || Number(newTotal) < 0) {
      toast.error('Ingresa un monto válido'); return;
    }
    setSubmittingTotal(true);
    try {
      await axios.put(`${API}/api/odp/${editTotalTarget.id}`, {
        valor_total: Number(newTotal),
      }, { headers: headers() });
      toast.success('Monto total actualizado');
      setShowEditTotalModal(false);
      fetchOdps();
    } catch {
      toast.error('Error al actualizar el monto');
    } finally { setSubmittingTotal(false); }
  };

  // ─── Handler eliminar pago ───────────────────────────────────────────────
  const handleDeletePago = async () => {
    if (!deletePagoTarget) return;
    setSubmittingDelete(true);
    try {
      await axios.delete(`${API}/api/contabilidad/pagos/${deletePagoTarget.id}`, { headers: headers() });
      toast.success('Pago eliminado. El estado de la ODP fue recalculado.');
      setShowDeletePagoModal(false);
      setDeletePagoTarget(null);
      fetchOdps();
      fetchResumen();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar pago');
    } finally { setSubmittingDelete(false); }
  };

  // ─── Datos derivados ─────────────────────────────────────────────────────
  // Usa el pendiente almacenado en BD (ya descuenta diferencia/retención).
  // Fallback a valor_total-abono solo si pendiente no está disponible (ODPs antiguas).
  const calcPendiente = (o: any) =>
    o.pendiente != null
      ? Number(o.pendiente)
      : Math.max(0, Number(o.valor_total || 0) - Number(o.abono || 0));

  const diasParaVencer = (o: any): number | null => {
    if (o.estado_caja !== 'CREDITO_APROBADO' || !o.fecha_vencimiento_credito) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const vence = new Date(o.fecha_vencimiento_credito); vence.setHours(0, 0, 0, 0);
    return Math.ceil((vence.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const rowColorCredito = (o: any): string => {
    const dias = diasParaVencer(o);
    if (dias === null) return '';
    if (dias <= 2) return 'bg-rose-50';
    if (dias <= 7) return 'bg-orange-50';
    return '';
  };

  const filtradas = odps.filter(o => {
    if (filterEstadoCaja !== 'todos' && o.estado_caja !== filterEstadoCaja) return false;
    if (filterBusqueda) {
      const q = filterBusqueda.toLowerCase();
      return (
        o.numero_odp?.toLowerCase().includes(q) ||
        o.cliente?.nombre_razon_social?.toLowerCase().includes(q) ||
        o.asesor?.nombre_completo?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sortedFiltradas = useMemo(() => {
    if (!sortCol) return filtradas;
    return [...filtradas].sort((a, b) => {
      let va: any, vb: any;
      switch (sortCol) {
        case 'numero_odp':           va = a.numero_odp || ''; vb = b.numero_odp || ''; break;
        case 'fecha_creacion':       va = a.fecha_creacion || ''; vb = b.fecha_creacion || ''; break;
        case 'cliente':              va = a.cliente?.nombre_razon_social || ''; vb = b.cliente?.nombre_razon_social || ''; break;
        case 'asesor':               va = a.asesor?.nombre_completo || ''; vb = b.asesor?.nombre_completo || ''; break;
        case 'estado_produccion':    va = a.estado_produccion || ''; vb = b.estado_produccion || ''; break;
        case 'factura_electronica':  va = a.factura_electronica || ''; vb = b.factura_electronica || ''; break;
        case 'monto_total':          va = Number(a.valor_total) || 0; vb = Number(b.valor_total) || 0; break;
        case 'abono':                va = Number(a.abono) || 0; vb = Number(b.abono) || 0; break;
        case 'pendiente':            va = calcPendiente(a); vb = calcPendiente(b); break;
        case 'estado_caja':          va = a.estado_caja || ''; vb = b.estado_caja || ''; break;
        case 'estado_facturacion':   va = a.estado_facturacion || ''; vb = b.estado_facturacion || ''; break;
        default: return 0;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtradas, sortCol, sortDir]);

  const odpsPendientes = odps.filter(o => calcPendiente(o) > 0 && o.estado_caja !== 'CANCELADO');
  const carteraDetalle: any[] = resumen?.cartera_detalle || [];

  const totalAbonado = resumen?.total_abonado || fmt(odps.reduce((s, o) => s + (Number(o.abono) || 0), 0));
  const totalPorCobrar = resumen?.total_pendiente || fmt(
    odps.filter(o => o.estado_caja !== 'CANCELADO').reduce((s, o) => s + calcPendiente(o), 0),
  );
  const totalFacturadas = resumen?.total_facturadas ?? odps.filter(o => o.estado_facturacion === 'FACTURADA' || o.factura_electronica).length;
  const pendFactura = resumen?.pendientes_factura ?? odps.filter(o => o.estado_facturacion === 'PENDIENTE' && !o.factura_electronica).length;
  const carteraVencida = resumen?.cartera_vencida || '$0';

  const requiereBancoActual = pagoForm.metodo_pago === 'Transferencia';
  const requiereReciboActual = pagoForm.metodo_pago !== 'Efectivo';
  const requiereBancoEdit = editPagoForm.metodo_pago === 'Transferencia';

  const TABS = [
    { key: 'estado_caja' as Tab, label: 'Estado Caja', icon: <Banknote className="w-4 h-4" />, badge: odps.length },
    { key: 'pagos' as Tab, label: 'Pagos Recientes', icon: <Receipt className="w-4 h-4" />, badge: pagos.length },
    { key: 'cartera' as Tab, label: 'Cartera Vencida', icon: <TrendingDown className="w-4 h-4" />, badge: carteraDetalle.length, badgeColor: carteraDetalle.length > 0 ? 'bg-rose-100 text-rose-700' : undefined },
  ];

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
          onClick={() => { setOdpFija(false); setPagoForm(p => ({ ...p, odp_id: '' })); setShowPagoModal(true); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-md shadow-emerald-200 hover:bg-emerald-700 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> Registrar Pago
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Recaudado',     value: totalAbonado,   icon: <DollarSign className="w-6 h-6" />,   color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Por Cobrar',    value: totalPorCobrar,  icon: <CreditCard className="w-6 h-6" />,   color: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'Cartera Vencida', value: carteraVencida, icon: <TrendingDown className="w-6 h-6" />, color: 'text-orange-700 bg-orange-50 border-orange-200' },
          { label: 'Facturadas',    value: totalFacturadas, icon: <FileCheck className="w-6 h-6" />,    color: 'text-blue-700 bg-blue-50 border-blue-200' },
          { label: 'Sin Factura',   value: pendFactura,     icon: <AlertCircle className="w-6 h-6" />,  color: 'text-amber-700 bg-amber-50 border-amber-200' },
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

      {/* TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all border-b-2 ${
                tab === t.key
                  ? 'border-indigo-500 text-indigo-700 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {t.icon}
              {t.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                tab === t.key ? 'bg-indigo-100 text-indigo-700' : t.badgeColor || 'bg-slate-100 text-slate-600'
              }`}>
                {t.badge}
              </span>
            </button>
          ))}
        </div>

        {/* ── TAB 1: Estado Caja ─────────────────────────────────────────────── */}
        {tab === 'estado_caja' && (
          <div>
            <div className="flex gap-2 flex-wrap items-center px-5 py-3 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Filtrar:</span>
              {['todos', 'PENDIENTE', 'ABONADO', 'CANCELADO', 'CREDITO_APROBADO'].map(f => (
                <button key={f} onClick={() => setFilterEstadoCaja(f)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    filterEstadoCaja === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                  }`}>
                  {f === 'todos' ? 'Todos' : f.replace('_', ' ')}
                </button>
              ))}
              <div className="ml-auto">
                <input
                  type="text"
                  value={filterBusqueda}
                  onChange={e => setFilterBusqueda(e.target.value)}
                  placeholder="Buscar ODP, cliente o asesor..."
                  className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                />
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {([
                      { label: 'ODP',              key: 'numero_odp' },
                      { label: 'Fecha Creación',   key: 'fecha_creacion' },
                      { label: 'Cliente',          key: 'cliente' },
                      { label: 'Asesor',           key: 'asesor' },
                      { label: 'Est. Taller',      key: 'estado_produccion' },
                      { label: 'FE No. / Fecha',   key: 'factura_electronica' },
                      { label: 'Monto Total',      key: 'monto_total' },
                      { label: 'Abonado',          key: 'abono' },
                      { label: 'Pendiente',        key: 'pendiente' },
                      { label: 'Estado Caja',      key: 'estado_caja' },
                      { label: 'Facturación',      key: 'estado_facturacion' },
                      { label: '',                 key: null },
                    ] as { label: string; key: string | null }[]).map(col => (
                      <th
                        key={col.label || 'action'}
                        onClick={() => handleSort(col.key)}
                        className={`text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap select-none ${col.key ? 'cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors' : ''}`}
                      >
                        <div className="flex items-center gap-1">
                          {col.label}
                          {col.key && (
                            sortCol === col.key
                              ? sortDir === 'asc'
                                ? <ChevronUp className="w-3 h-3 text-indigo-500" />
                                : <ChevronDown className="w-3 h-3 text-indigo-500" />
                              : <ChevronsUpDown className="w-3 h-3 text-slate-300" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingOdps ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={12} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                    ))
                  ) : sortedFiltradas.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-12 text-slate-400 font-bold">No hay registros que mostrar.</td></tr>
                  ) : sortedFiltradas.map(odp => (
                    <tr key={odp.id} className={`hover:bg-slate-50 transition-colors ${rowColorCredito(odp)}`}>
                      <td className="px-4 py-4 font-bold text-indigo-700 whitespace-nowrap cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>{odp.numero_odp}</td>
                      <td className="px-4 py-4 text-slate-500 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {fmtFecha(odp.fecha_creacion)}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-800 max-w-[320px] truncate" title={odp.cliente?.nombre_razon_social}>
                        {odp.cliente?.nombre_razon_social || '—'}
                      </td>
                      {/* Asesor */}
                      <td className="px-4 py-4 text-slate-600 text-xs whitespace-nowrap">{odp.asesor?.nombre_completo || '—'}</td>
                      {/* Estado Taller */}
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          odp.estado_produccion === 'ENTREGADA' || odp.estado_produccion === 'INSTALADA' ? 'bg-green-100 text-green-700 border-green-200' :
                          odp.estado_produccion === 'PAUSADA' ? 'bg-rose-100 text-rose-700 border-rose-200' :
                          odp.estado_produccion === 'LISTO_INSTALAR' || odp.estado_produccion === 'PROGRAMADA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {(odp.estado_produccion || '—').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5">
                          {odp.factura_electronica ? (
                            <div>
                              <span className="font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-xs">
                                FE-{odp.factura_electronica}
                              </span>
                              {odp.fecha_factura && (
                                <p className="text-xs text-slate-400 mt-0.5">{fmtFecha(odp.fecha_factura)}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Sin factura</span>
                          )}
                          <button
                            onClick={() => abrirFeModal(odp)}
                            title="Editar factura"
                            className="ml-1 p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {Number(odp.valor_total) > 0 ? fmt(Number(odp.valor_total)) : <span className="text-slate-400 text-xs italic">—</span>}
                          <button onClick={() => abrirEditTotal(odp)} title="Editar monto total"
                            className="p-1 rounded text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition">
                            <Pencil className="w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(odp.abono) || 0)}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {(() => {
                          const pend = calcPendiente(odp);
                          return <span className={`font-bold text-sm ${pend > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(pend)}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        {(() => {
                          const dias = diasParaVencer(odp);
                          const badgeCredito = dias !== null
                            ? dias <= 2 ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : dias <= 7 ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-300';
                          return (
                            <div className="flex flex-col gap-1">
                              <select
                                value={odp.estado_caja}
                                onChange={e => updateCaja(odp.id, 'estado_caja', e.target.value)}
                                className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                                  odp.estado_caja === 'CANCELADO'        ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                  odp.estado_caja === 'ABONADO'          ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                  odp.estado_caja === 'CREDITO_APROBADO' ? badgeCredito :
                                  'bg-amber-100 text-amber-800 border-amber-300'
                                }`}
                              >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="ABONADO">Abonado</option>
                                <option value="CANCELADO">Cancelado</option>
                                <option value="CREDITO_APROBADO">Crédito Aprobado</option>
                              </select>
                              {odp.estado_caja === 'CREDITO_APROBADO' && odp.fecha_vencimiento_credito && (
                                <span className={`text-xs font-semibold ${
                                  dias !== null && dias <= 2 ? 'text-rose-600' :
                                  dias !== null && dias <= 7 ? 'text-orange-600' : 'text-slate-500'
                                }`}>
                                  Vence: {fmtFecha(odp.fecha_vencimiento_credito)}
                                  {dias !== null && dias >= 0 && ` (${dias}d)`}
                                  {dias !== null && dias < 0 && ' ⚠ Vencido'}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4">
                        <select value={odp.estado_facturacion} onChange={e => handleFacturacionChange(odp, e.target.value)}
                          className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                            odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}>
                          <option value="PENDIENTE">Pendiente</option>
                          <option value="FACTURADA">Facturada</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        {odp.estado_caja !== 'CANCELADO' && (
                          <button
                            onClick={() => { setOdpFija(true); setPagoForm(p => ({ ...p, odp_id: String(odp.id), monto: '' })); setShowPagoModal(true); }}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all flex items-center gap-1 whitespace-nowrap"
                          >
                            <Banknote className="w-3.5 h-3.5" /> Registrar Abono
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 2: Pagos Recientes ─────────────────────────────────────────── */}
        {tab === 'pagos' && (
          <div>
            {loadingResumen ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : pagos.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold">No hay pagos registrados</p>
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 390px)', minHeight: '300px' }}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                       {['Fecha', 'ODP', 'Fecha Creación ODP', 'Cliente', 'Asesor', 'Monto', 'Banco / Método', 'Recibo No.', 'Observaciones', 'Registrado por', ''].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.map((pago: any) => (
                      <tr key={pago.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {fmtFecha(pago.fecha)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-xs border border-indigo-100">
                            {pago.odp?.numero_odp || `ODP-${pago.odp_id}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {fmtFecha(pago.odp?.fecha_creacion)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs max-w-[180px] truncate" title={pago.odp?.cliente?.nombre_razon_social}>{pago.odp?.cliente?.nombre_razon_social || '—'}</td>
                        {/* Asesor */}
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{pago.odp?.asesor?.nombre_completo || '—'}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(pago.monto))}</td>
                        <td className="px-4 py-3 text-slate-700 capitalize text-xs">{pago.metodo_pago}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{pago.referencia_pago || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs max-w-[180px] truncate">{pago.observaciones || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{pago.registrador?.nombre_completo || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => abrirEditPago(pago)}
                              title="Editar pago"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setDeletePagoTarget(pago); setShowDeletePagoModal(true); }}
                              title="Eliminar pago"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Cartera Vencida ─────────────────────────────────────────── */}
        {tab === 'cartera' && (
          <div className="p-5">
            {loadingResumen ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : carteraDetalle.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-emerald-600">Sin cartera vencida</p>
                <p className="text-sm mt-1">Todas las cuentas están al día</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-500">{carteraDetalle.length} ODP{carteraDetalle.length !== 1 ? 's' : ''} con saldo vencido</p>
                  <span className="text-base font-extrabold text-rose-600">{carteraVencida}</span>
                </div>
                <div className="space-y-3">
                  {carteraDetalle.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-rose-50 rounded-xl border border-rose-100">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-10 bg-rose-400 rounded-full flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-slate-800">{item.odp}</p>
                          <p className="text-xs text-slate-600 font-medium">{item.cliente}</p>
                          {item.asesor && (
                            <p className="text-xs text-indigo-600 font-semibold">
                              Asesor: {item.asesor}
                            </p>
                          )}
                          {item.fecha_creacion && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> Creada: {fmtFecha(item.fecha_creacion)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-rose-600">{item.pendiente}</p>
                        <p className="text-xs text-rose-400 font-semibold">Vencido hace {item.dias_vencido} días</p>
                        <p className="text-xs text-slate-400 capitalize">{item.tipo_vencimiento === 'credito' ? 'Por crédito vencido' : 'Por fecha entrega'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ MODAL FE ════════════════════════════════════════════════════════ */}
      {showFeModal && feTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" /> Factura Electrónica
              </h2>
              <button onClick={() => { setShowFeModal(false); setFeTarget(null); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFeSubmit} className="p-6 space-y-4">
              <p className="text-sm text-slate-600">ODP: <span className="font-bold text-indigo-700">{feTarget.numero_odp}</span></p>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">FE No. *</label>
                <input value={feForm.numero_fe} onChange={e => setFeForm(p => ({ ...p, numero_fe: e.target.value }))}
                  placeholder="Ej: 2024-001" required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha Factura *</label>
                <input type="date" value={feForm.fecha_fe} onChange={e => setFeForm(p => ({ ...p, fecha_fe: e.target.value }))}
                  required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowFeModal(false); setFeTarget(null); }}
                  className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
                <button type="submit" disabled={submittingFe}
                  className="flex-1 py-2.5 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-200 disabled:opacity-50">
                  {submittingFe ? 'Guardando...' : 'Guardar Factura'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ═══ MODAL REGISTRAR PAGO ════════════════════════════════════════════ */}
      {showPagoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
                Registrar Pago
              </h2>
              <button onClick={() => setShowPagoModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePagoSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">ODP *</label>
                {odpFija ? (
                  <div className="w-full border border-indigo-100 bg-indigo-50/30 rounded-xl px-4 py-3.5 text-[13px] font-bold text-indigo-900 shadow-sm leading-relaxed">
                    {(() => {
                      const o = odps.find(x => String(x.id) === pagoForm.odp_id);
                      return o ? `${o.numero_odp} — ${o.cliente?.nombre_razon_social} — Pendiente: ${fmt(calcPendiente(o))}` : pagoForm.odp_id;
                    })()}
                  </div>
                ) : (
                  <select value={pagoForm.odp_id} onChange={e => setPagoForm(p => ({ ...p, odp_id: e.target.value }))} required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm">
                    <option value="">-- Seleccionar ODP con pendiente --</option>
                    {odpsPendientes.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.numero_odp} — {o.cliente?.nombre_razon_social} — Pendiente: {fmt(calcPendiente(o))}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Monto (COP) *</label>
                  <input type="number" value={pagoForm.monto} onChange={e => setPagoForm(p => ({ ...p, monto: e.target.value }))}
                    placeholder="0" min="1" required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Diferencia (COP)</label>
                  <input type="number" value={pagoForm.diferencia} onChange={e => setPagoForm(p => ({ ...p, diferencia: e.target.value }))}
                    placeholder="0" min="0"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm" />
                  <p className="text-[10px] text-slate-400 mt-1">Descuento adicional (no cuenta en abono estadístico)</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
                <input type="date" value={pagoForm.fecha} onChange={e => setPagoForm(p => ({ ...p, fecha: e.target.value }))}
                  required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Forma de Pago *</label>
                <select value={pagoForm.metodo_pago} onChange={e => setPagoForm(p => ({ ...p, metodo_pago: e.target.value, banco: '' }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm">
                  {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Banco *</label>
                <select value={pagoForm.banco} onChange={e => setPagoForm(p => ({ ...p, banco: e.target.value }))}
                  required={requiereBancoActual} disabled={!requiereBancoActual}
                  className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm ${!requiereBancoActual ? 'bg-slate-50 opacity-50' : ''}`}>
                  <option value="">-- Seleccionar banco --</option>
                  {BANCOS_COLOMBIA.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Recibo No.</label>
                <input value={pagoForm.referencia_pago} onChange={e => setPagoForm(p => ({ ...p, referencia_pago: e.target.value }))}
                  placeholder="Número de recibo o comprobante"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones</label>
                <textarea value={pagoForm.observaciones} onChange={e => setPagoForm(p => ({ ...p, observaciones: e.target.value }))}
                  placeholder="Notas adicionales..." rows={2}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none shadow-sm" />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowPagoModal(false)}
                  className="flex-1 py-3.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
                <button type="submit" disabled={submitting}
                  className="flex-1 py-3.5 font-bold text-white bg-emerald-600 rounded-2xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 disabled:opacity-50">
                  {submitting ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ═══ MODAL EDITAR PAGO ═══════════════════════════════════════════════ */}
      {showEditPagoModal && editPagoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Pencil className="w-5 h-5 text-indigo-600" />
                </div>
                Editar Pago
              </h2>
              <button onClick={() => { setShowEditPagoModal(false); setEditPagoTarget(null); }}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditPagoSubmit} className="p-6 space-y-5">
              <div className="w-full border border-slate-100 bg-slate-50/50 rounded-xl px-4 py-3 text-[13px] font-bold text-slate-700 leading-relaxed shadow-sm">
                ODP: <span className="text-indigo-700">{editPagoTarget.odp?.numero_odp || `ODP-${editPagoTarget.odp_id}`}</span>
                <span className="ml-3 text-slate-400 font-medium">Original: {fmtFecha(editPagoTarget.fecha)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Monto (COP) *</label>
                  <input type="number" value={editPagoForm.monto}
                    onChange={e => setEditPagoForm(p => ({ ...p, monto: e.target.value }))}
                    placeholder="0" min="1" required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
                  <input type="date" value={editPagoForm.fecha}
                    onChange={e => setEditPagoForm(p => ({ ...p, fecha: e.target.value }))}
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Forma de Pago *</label>
                <select value={editPagoForm.metodo_pago}
                  onChange={e => setEditPagoForm(p => ({ ...p, metodo_pago: e.target.value, banco: '' }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm">
                  {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Banco *</label>
                <select value={editPagoForm.banco}
                  onChange={e => setEditPagoForm(p => ({ ...p, banco: e.target.value }))}
                  required={requiereBancoEdit} disabled={!requiereBancoEdit}
                  className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm ${!requiereBancoEdit ? 'bg-slate-50 opacity-50' : ''}`}>
                  <option value="">-- Seleccionar banco --</option>
                  {BANCOS_COLOMBIA.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Recibo No.</label>
                <input value={editPagoForm.referencia_pago}
                  onChange={e => setEditPagoForm(p => ({ ...p, referencia_pago: e.target.value }))}
                  placeholder="Número de recibo o comprobante"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones</label>
                <textarea value={editPagoForm.observaciones}
                  onChange={e => setEditPagoForm(p => ({ ...p, observaciones: e.target.value }))}
                  placeholder="Notas adicionales..." rows={2}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none shadow-sm" />
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => { setShowEditPagoModal(false); setEditPagoTarget(null); }}
                  className="flex-1 py-3.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
                <button type="submit" disabled={submittingEdit}
                  className="flex-1 py-3.5 font-bold text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50">
                  {submittingEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ═══ MODAL EDITAR TOTAL ODP ════════════════════════════════════════ */}
      {showEditTotalModal && editTotalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Calculator className="w-5 h-5 text-indigo-600" />
                </div>
                Modificar Monto ODP
              </h2>
              <button onClick={() => setShowEditTotalModal(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditTotalSubmit} className="p-6 space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">ODP Seleccionada</p>
                <p className="text-sm font-bold text-slate-800">{editTotalTarget.numero_odp} — {editTotalTarget.cliente?.nombre_razon_social}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Nuevo Valor Total (COP) *</label>
                <input type="number" value={newTotal} onChange={e => setNewTotal(e.target.value)} required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
                <p className="text-[10px] text-slate-400 mt-2 italic px-1">Este cambio afectará el cálculo del saldo pendiente de la orden.</p>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowEditTotalModal(false)}
                  className="flex-1 py-3.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
                <button type="submit" disabled={submittingTotal}
                  className="flex-1 py-3.5 font-bold text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 disabled:opacity-50">
                  {submittingTotal ? 'Guardando...' : 'Actualizar Monto'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ═══ MODAL ELIMINAR PAGO ═════════════════════════════════════════════ */}
      {showDeletePagoModal && deletePagoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="p-3 bg-rose-50 rounded-2xl flex-shrink-0">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">¿Eliminar este pago?</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  Pago de <span className="font-bold text-slate-800">{fmt(Number(deletePagoTarget.monto))}</span> en{' '}
                  <span className="font-bold text-indigo-700">{deletePagoTarget.odp?.numero_odp || `ODP-${deletePagoTarget.odp_id}`}</span>.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
              Esta acción es irreversible y el saldo pendiente de la ODP será recalculado automáticamente.
            </p>
            <div className="flex gap-4">
              <button onClick={() => { setShowDeletePagoModal(false); setDeletePagoTarget(null); }}
                className="flex-1 py-3 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                No, cancelar
              </button>
              <button onClick={handleDeletePago} disabled={submittingDelete}
                className="flex-1 py-3 font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition shadow-lg shadow-rose-200 disabled:opacity-50">
                {submittingDelete ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default ContabilidadPage;
