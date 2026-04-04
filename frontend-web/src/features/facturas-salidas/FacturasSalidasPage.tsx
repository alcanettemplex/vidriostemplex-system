import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  FileCheck, Warehouse, Plus, Pencil, Trash2, X, RefreshCw,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const fmtFecha = (f: string | null) => {
  if (!f) return '—';
  try { return format(parseISO(f), 'dd/MM/yyyy', { locale: es }); } catch { return f; }
};

const fmtMoneda = (v: number | null) =>
  v ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) : '—';

type Tab = 'facturadas' | 'con_salida';

interface ODPFacturada {
  id: number;
  numero_odp: string;
  fecha_factura: string | null;
  factura_electronica: string | null;
  valor_total: number | null;
  cliente: { id: number; nombre_razon_social: string };
}

interface SalidaAlmacen {
  id: number;
  numero_sa: string;
  fecha_sa: string;
  creado_en: string;
  creador?: { id: number; nombre_completo: string };
  odp: ODPFacturada;
}

const FacturasSalidasPage: React.FC = () => {
  const user = useSelector((s: any) => s.auth.user);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const puedeEditar = ['admin', 'compras', 'produccion'].includes(user?.rol || '');

  const [tab, setTab] = useState<Tab>('facturadas');
  const [facturadas, setFacturadas] = useState<ODPFacturada[]>([]);
  const [conSalida, setConSalida] = useState<SalidaAlmacen[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal crear/editar SA
  const [modalSA, setModalSA] = useState<{ odp?: ODPFacturada; salida?: SalidaAlmacen } | null>(null);
  const [formSA, setFormSA] = useState({ numero: '', fecha: '' });
  const [savingSA, setSavingSA] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resF, resS] = await Promise.all([
        axios.get(`${API}/api/facturas-salidas/facturadas`, { headers }),
        axios.get(`${API}/api/facturas-salidas/con-salida`, { headers }),
      ]);
      setFacturadas(resF.data);
      setConSalida(resS.data);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const abrirCrear = (odp: ODPFacturada) => {
    setModalSA({ odp });
    setFormSA({ numero: '', fecha: new Date().toISOString().split('T')[0] });
  };

  const abrirEditar = (salida: SalidaAlmacen) => {
    setModalSA({ salida });
    setFormSA({ numero: salida.numero_sa, fecha: salida.fecha_sa });
  };

  const guardarSA = async () => {
    if (!formSA.numero.trim()) { toast.error('Ingresa el número SA'); return; }
    if (!formSA.fecha) { toast.error('Ingresa la fecha'); return; }
    setSavingSA(true);
    try {
      if (modalSA?.salida) {
        // Editar
        await axios.put(`${API}/api/facturas-salidas/salida/${modalSA.salida.id}`,
          { numero_sa: `SA-${formSA.numero}`, fecha_sa: formSA.fecha }, { headers });
        toast.success('Salida actualizada');
      } else {
        // Crear
        await axios.post(`${API}/api/facturas-salidas/${modalSA?.odp?.id}/salida`,
          { numero_sa: `SA-${formSA.numero}`, fecha_sa: formSA.fecha }, { headers });
        toast.success('Salida de almacén registrada');
      }
      setModalSA(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSavingSA(false); }
  };

  const eliminarSA = async (id: number) => {
    if (!window.confirm('¿Eliminar esta salida de almacén? La ODP volverá al tab Facturadas.')) return;
    try {
      await axios.delete(`${API}/api/facturas-salidas/salida/${id}`, { headers });
      toast.success('Salida eliminada');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  };

  const TABS: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'facturadas',  label: 'Facturadas',            icon: FileCheck,  count: facturadas.length },
    { key: 'con_salida',  label: 'Con Salidas de Almacén', icon: Warehouse,  count: conSalida.length },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
            <Warehouse className="w-7 h-7 text-violet-600" />
            Facturas vs Salidas
          </h1>
          <p className="text-slate-500 text-sm mt-1">Control interno de ODPs facturadas y salidas de almacén</p>
        </div>
        <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
            <FileCheck className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pendientes SA</p>
            <p className="text-3xl font-black text-blue-700">{facturadas.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
            <Warehouse className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Con Salida</p>
            <p className="text-3xl font-black text-emerald-700">{conSalida.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                active
                  ? 'border-violet-600 text-violet-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                active ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── TAB FACTURADAS ── */}
          {tab === 'facturadas' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['ODP', 'Cliente', 'Fecha Factura', 'N° Factura Electrónica', 'Valor Total', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {facturadas.length === 0 ? (
                    <tr><td colSpan={puedeEditar ? 6 : 5} className="px-5 py-12 text-center text-slate-400">
                      <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>No hay ODPs facturadas pendientes de salida</p>
                    </td></tr>
                  ) : facturadas.map(odp => (
                    <motion.tr key={odp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-slate-800">{odp.numero_odp}</td>
                      <td className="px-5 py-4 text-slate-700">{odp.cliente?.nombre_razon_social || '—'}</td>
                      <td className="px-5 py-4 text-slate-600">{fmtFecha(odp.fecha_factura)}</td>
                      <td className="px-5 py-4">
                        {odp.factura_electronica
                          ? <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200">{odp.factura_electronica}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{fmtMoneda(odp.valor_total)}</td>
                      {puedeEditar && (
                        <td className="px-5 py-4">
                          <button onClick={() => abrirCrear(odp)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition shadow-sm">
                            <Plus className="w-3.5 h-3.5" /> Registrar SA
                          </button>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB CON SALIDAS ── */}
          {tab === 'con_salida' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['ODP', 'Cliente', 'N° Factura Electrónica', 'Fecha Factura', 'Valor Total', 'N° Salida', 'Fecha SA', 'Registrado por', puedeEditar ? 'Acciones' : ''].filter(Boolean).map(h => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {conSalida.length === 0 ? (
                    <tr><td colSpan={puedeEditar ? 9 : 8} className="px-5 py-12 text-center text-slate-400">
                      <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p>No hay salidas de almacén registradas</p>
                    </td></tr>
                  ) : conSalida.map(s => (
                    <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-slate-800">{s.odp?.numero_odp}</td>
                      <td className="px-5 py-4 text-slate-700">{s.odp?.cliente?.nombre_razon_social || '—'}</td>
                      <td className="px-5 py-4">
                        {s.odp?.factura_electronica
                          ? <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-200">{s.odp.factura_electronica}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{fmtFecha(s.odp?.fecha_factura)}</td>
                      <td className="px-5 py-4 text-slate-600">{fmtMoneda(s.odp?.valor_total)}</td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">{s.numero_sa}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{fmtFecha(s.fecha_sa)}</td>
                      <td className="px-5 py-4 text-slate-500 text-xs">{s.creador?.nombre_completo || '—'}</td>
                      {puedeEditar && (
                        <td className="px-5 py-4">
                          <div className="flex gap-2">
                            <button onClick={() => abrirEditar(s)}
                              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => eliminarSA(s.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MODAL SA ── */}
      {modalSA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {modalSA.salida ? 'Editar Salida de Almacén' : 'Registrar Salida de Almacén'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalSA.odp?.numero_odp || modalSA.salida?.odp?.numero_odp} ·{' '}
                  {modalSA.odp?.cliente?.nombre_razon_social || modalSA.salida?.odp?.cliente?.nombre_razon_social}
                </p>
              </div>
              <button onClick={() => setModalSA(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Número de Salida *</label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                  <span className="px-3 py-2.5 bg-slate-100 text-slate-600 text-sm font-bold border-r border-slate-200 select-none">SA-</span>
                  <input
                    value={formSA.numero}
                    onChange={e => setFormSA(p => ({ ...p, numero: e.target.value }))}
                    placeholder="0001"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Se guardará como: SA-{formSA.numero || 'XXXX'}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha de Salida *</label>
                <input
                  type="date"
                  value={formSA.fecha}
                  onChange={e => setFormSA(p => ({ ...p, fecha: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModalSA(null)}
                className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancelar
              </button>
              <button onClick={guardarSA} disabled={savingSA}
                className="flex-1 py-2.5 font-bold text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition disabled:opacity-40 text-sm">
                {savingSA ? 'Guardando...' : modalSA.salida ? 'Guardar Cambios' : 'Registrar SA'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default FacturasSalidasPage;
