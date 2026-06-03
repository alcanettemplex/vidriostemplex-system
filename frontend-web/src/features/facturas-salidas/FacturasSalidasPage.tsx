import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import ODPFichaModal from '../odp/components/ODPFichaModal';
import {
  FileCheck, Warehouse, Plus, Pencil, Trash2, X, RefreshCw, Search, Package, AlertTriangle,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const fmtFecha = (f: string | null | undefined) => {
  if (!f) return '—';
  try { return format(parseISO(f), 'dd/MM/yyyy', { locale: es }); } catch { return f; }
};

const fmtMoneda = (v: number | null | undefined) =>
  v ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v) : '—';

const ESTADO_PROD: Record<string, { label: string; cls: string }> = {
  EN_ESPERA:           { label: 'En espera',          cls: 'bg-slate-100 text-slate-600' },
  VISITA_TECNICA:      { label: 'Visita técnica',      cls: 'bg-blue-50 text-blue-700' },
  MEDICION:            { label: 'Medición',            cls: 'bg-cyan-50 text-cyan-700' },
  PEDIDO_PROVEEDOR:    { label: 'Pedido proveedor',    cls: 'bg-amber-50 text-amber-700' },
  ALUMINIO_CORTADO:    { label: 'Aluminio cortado',    cls: 'bg-orange-50 text-orange-700' },
  VIDRIO_RECIBIDO:     { label: 'Vidrio recibido',     cls: 'bg-yellow-50 text-yellow-700' },
  ACCESORIOS_SEPARADOS:{ label: 'Accesorios sep.',     cls: 'bg-lime-50 text-lime-700' },
  LISTO_INSTALAR:      { label: 'Listo instalar',      cls: 'bg-emerald-50 text-emerald-700' },
  PROGRAMADA:          { label: 'Programada',          cls: 'bg-teal-50 text-teal-700' },
  INSTALADA:           { label: 'Instalada',           cls: 'bg-green-50 text-green-700' },
  ENTREGADA:           { label: 'Entregada',           cls: 'bg-violet-50 text-violet-700' },
  PAUSADA:             { label: 'Pausada',             cls: 'bg-rose-50 text-rose-700' },
};

const BadgeEstado = ({ estado }: { estado: string }) => {
  const e = ESTADO_PROD[estado] ?? { label: estado, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${e.cls}`}>{e.label}</span>;
};

type Tab = 'facturadas' | 'oa' | 'nc' | 'con_salida';
type SubTabConSalida = 'odps' | 'oa';

const TIPO_ERROR_NC: Record<string, { label: string; cls: string }> = {
  ERROR_INTERNO: { label: 'Error interno',  cls: 'bg-red-50 text-red-700 border border-red-200' },
  DANO_PLANTA:   { label: 'Daño en planta', cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
  REPROCESO:     { label: 'Reproceso',      cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  QUEJA:         { label: 'Queja',          cls: 'bg-purple-50 text-purple-700 border border-purple-200' },
};

interface ODPFacturada {
  id: number;
  numero_odp: string;
  fecha_factura: string | null;
  factura_electronica: string | null;
  valor_total: number | null;
  estado_caja: string | null;
  cliente: { id: number; nombre_razon_social: string };
}

interface OAPendiente {
  id: number;
  numero_odp: string;
  estado_produccion: string;
  fecha_creacion: string | null;
  cliente: { id: number; nombre_razon_social: string };
}

interface ODPNoConformidad {
  id: number;
  numero_odp: string;
  estado_produccion: string;
  fecha_creacion: string | null;
  cliente: { id: number; nombre_razon_social: string };
  odp_padre: { id: number; numero_odp: string } | null;
  no_conformidad_origen: { tipo_error: string } | null;
}

interface SalidaAlmacen {
  id: number;
  numero_sa: string;
  fecha_sa: string;
  creado_en: string;
  creador?: { id: number; nombre_completo: string };
  odp: {
    id: number;
    numero_odp: string;
    fecha_factura?: string | null;
    factura_electronica?: string | null;
    valor_total?: number | null;
    estado_produccion?: string;
    fecha_creacion?: string | null;
    cliente: { id: number; nombre_razon_social: string };
  };
}

interface ModalSAState {
  odp?: ODPFacturada | OAPendiente | ODPNoConformidad;
  salida?: SalidaAlmacen;
  esOA: boolean;
}

const FacturasSalidasPage: React.FC = () => {
  const user = useSelector((s: any) => s.auth.user);
  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const puedeEditar = ['admin', 'compras', 'produccion'].includes(user?.rol || '');

  const [tab, setTab] = useState<Tab>('facturadas');
  const [subTabConSalida, setSubTabConSalida] = useState<SubTabConSalida>('odps');

  const [facturadas, setFacturadas]     = useState<ODPFacturada[]>([]);
  const [oaPendientes, setOAPendientes] = useState<OAPendiente[]>([]);
  const [conSalida, setConSalida]       = useState<SalidaAlmacen[]>([]);
  const [conSalidaOA, setConSalidaOA]   = useState<SalidaAlmacen[]>([]);
  const [odpsNc, setOdpsNc]             = useState<ODPNoConformidad[]>([]);

  const hoy = new Date();
  const [filtroMes, setFiltroMes]   = useState(hoy.getMonth() + 1);
  const [filtroAnio, setFiltroAnio] = useState(hoy.getFullYear());
  const [loading, setLoading]       = useState(true);

  const [busquedaFacturadas,   setBusquedaFacturadas]   = useState('');
  const [busquedaOA,           setBusquedaOA]           = useState('');
  const [busquedaNc,           setBusquedaNc]           = useState('');
  const [busquedaConSalida,    setBusquedaConSalida]    = useState('');
  const [busquedaConSalidaOA,  setBusquedaConSalidaOA]  = useState('');
  const [filtroCajaFacturadas, setFiltroCajaFacturadas] = useState('');

  const [modalSA,    setModalSA]    = useState<ModalSAState | null>(null);
  const [fichaOdpId, setFichaOdpId] = useState<number | null>(null);
  const [formSA,     setFormSA]     = useState({ numero: '', fecha: '' });
  const [savingSA,   setSavingSA]   = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [resF, resS, resOA, resSalidaOA, resNc] = await Promise.all([
        axios.get(`${API}/api/facturas-salidas/facturadas`,  { headers }),
        axios.get(`${API}/api/facturas-salidas/con-salida`,  { headers }),
        axios.get(`${API}/api/facturas-salidas/oa-pendientes`, { headers }),
        axios.get(`${API}/api/facturas-salidas/con-salida-oa`, { headers }),
        axios.get(`${API}/api/facturas-salidas/nc`, { headers }),
      ]);
      setFacturadas(resF.data);
      setConSalida(resS.data);
      setOAPendientes(resOA.data);
      setConSalidaOA(resSalidaOA.data);
      setOdpsNc(resNc.data);
    } catch { toast.error('Error al cargar datos'); }
    finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { cargar(); }, [cargar]);

  const abrirCrearODP = (odp: ODPFacturada) => {
    setModalSA({ odp, esOA: false });
    setFormSA({ numero: '', fecha: hoy.toISOString().split('T')[0] });
  };

  const abrirCrearOA = (oa: OAPendiente) => {
    setModalSA({ odp: oa as any, esOA: true });
    setFormSA({ numero: '', fecha: hoy.toISOString().split('T')[0] });
  };

  const abrirCrearNc = (nc: ODPNoConformidad) => {
    setModalSA({ odp: nc, esOA: false });
    setFormSA({ numero: '', fecha: hoy.toISOString().split('T')[0] });
  };

  const abrirEditar = (salida: SalidaAlmacen, esOA: boolean) => {
    setModalSA({ salida, esOA });
    const prefijo = esOA ? 'SFV-' : 'SA-';
    const numero  = salida.numero_sa.startsWith(prefijo)
      ? salida.numero_sa.slice(prefijo.length)
      : salida.numero_sa;
    setFormSA({ numero, fecha: salida.fecha_sa });
  };

  const guardarSA = async () => {
    if (!formSA.numero.trim()) { toast.error('Ingresa el número'); return; }
    if (!formSA.fecha)         { toast.error('Ingresa la fecha'); return; }
    setSavingSA(true);
    const prefijo  = modalSA?.esOA ? 'SFV-' : 'SA-';
    const numero_sa = `${prefijo}${formSA.numero}`;
    try {
      if (modalSA?.salida) {
        await axios.put(`${API}/api/facturas-salidas/salida/${modalSA.salida.id}`,
          { numero_sa, fecha_sa: formSA.fecha }, { headers });
        toast.success('Salida actualizada');
      } else {
        await axios.post(`${API}/api/facturas-salidas/${modalSA?.odp?.id}/salida`,
          { numero_sa, fecha_sa: formSA.fecha }, { headers });
        toast.success(modalSA?.esOA ? 'Salida SFV registrada' : 'Salida de almacén registrada');
      }
      setModalSA(null);
      cargar();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setSavingSA(false); }
  };

  const eliminarSA = async (id: number, esOA: boolean) => {
    const msg = esOA
      ? '¿Eliminar esta salida SFV? La OA volverá al tab OA.'
      : '¿Eliminar esta salida de almacén? La ODP volverá al tab Facturadas.';
    if (!window.confirm(msg)) return;
    try {
      await axios.delete(`${API}/api/facturas-salidas/salida/${id}`, { headers });
      toast.success('Salida eliminada');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  };

  const mesCorrecto = (fecha: string | null | undefined) => {
    if (!fecha) return true;
    try {
      const d = parseISO(fecha);
      return d.getMonth() + 1 === filtroMes && d.getFullYear() === filtroAnio;
    } catch { return true; }
  };

  const facturadasFiltradas = facturadas.filter(o => {
    if (!mesCorrecto(o.fecha_factura)) return false;
    if (filtroCajaFacturadas && o.estado_caja !== filtroCajaFacturadas) return false;
    if (busquedaFacturadas) {
      const q = busquedaFacturadas.toLowerCase();
      return (
        o.numero_odp.toLowerCase().includes(q) ||
        (o.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
        (o.factura_electronica || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const oaFiltradas = oaPendientes.filter(oa => {
    if (!mesCorrecto(oa.fecha_creacion)) return false;
    if (busquedaOA) {
      const q = busquedaOA.toLowerCase();
      return (
        oa.numero_odp.toLowerCase().includes(q) ||
        (oa.cliente?.nombre_razon_social || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const conSalidaFiltradas = conSalida.filter(s => {
    if (!mesCorrecto(s.fecha_sa)) return false;
    if (busquedaConSalida) {
      const q = busquedaConSalida.toLowerCase();
      return (
        (s.odp?.numero_odp || '').toLowerCase().includes(q) ||
        (s.odp?.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
        (s.odp?.factura_electronica || '').toLowerCase().includes(q) ||
        (s.numero_sa || '').toLowerCase().includes(q) ||
        (s.creador?.nombre_completo || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const ncFiltradas = odpsNc.filter(nc => {
    if (!mesCorrecto(nc.fecha_creacion)) return false;
    if (busquedaNc) {
      const q = busquedaNc.toLowerCase();
      return (
        nc.numero_odp.toLowerCase().includes(q) ||
        (nc.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
        (nc.odp_padre?.numero_odp || '').toLowerCase().includes(q) ||
        (nc.no_conformidad_origen?.tipo_error || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const conSalidaOAFiltradas = conSalidaOA.filter(s => {
    if (!mesCorrecto(s.fecha_sa)) return false;
    if (busquedaConSalidaOA) {
      const q = busquedaConSalidaOA.toLowerCase();
      return (
        (s.odp?.numero_odp || '').toLowerCase().includes(q) ||
        (s.odp?.cliente?.nombre_razon_social || '').toLowerCase().includes(q) ||
        (s.numero_sa || '').toLowerCase().includes(q) ||
        (s.creador?.nombre_completo || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const anios = Array.from({ length: 4 }, (_, i) => hoy.getFullYear() - i);

  const TABS: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: 'facturadas', label: 'Facturadas',             icon: FileCheck,      count: facturadasFiltradas.length },
    { key: 'oa',         label: 'OA',                     icon: Package,        count: oaFiltradas.length },
    { key: 'nc',         label: 'No Conformidades',       icon: AlertTriangle,  count: ncFiltradas.length },
    { key: 'con_salida', label: 'Con Salidas de Almacén', icon: Warehouse,      count: conSalidaFiltradas.length + conSalidaOAFiltradas.length },
  ];

  const prefijo = modalSA?.esOA ? 'SFV-' : 'SA-';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
            <Warehouse className="w-7 h-7 text-violet-600" />
            Facturas vs Salidas
          </h1>
          <p className="text-slate-500 text-sm mt-1">Control de ODPs facturadas, OA y salidas de almacén</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filtroMes} onChange={e => setFiltroMes(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={filtroAnio} onChange={e => setFiltroAnio(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={cargar} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <FileCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pendientes SA</p>
            <p className="text-2xl font-black text-blue-700">{facturadas.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0">
            <Package className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">OA sin SFV</p>
            <p className="text-2xl font-black text-indigo-700">{oaPendientes.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
            <Warehouse className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Con Salida</p>
            <p className="text-2xl font-black text-emerald-700">{conSalida.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center shrink-0">
            <Warehouse className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">SA de OA</p>
            <p className="text-2xl font-black text-violet-700">{conSalidaOA.length}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">NC sin SA</p>
            <p className="text-2xl font-black text-rose-700">{odpsNc.length}</p>
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                active ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
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
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={busquedaFacturadas} onChange={e => setBusquedaFacturadas(e.target.value)}
                    placeholder="Buscar ODP, cliente, factura..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                </div>
                <select value={filtroCajaFacturadas} onChange={e => setFiltroCajaFacturadas(e.target.value)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                  <option value="">Estado caja: Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="ABONADO">Abonado</option>
                  <option value="CANCELADO">Cancelado</option>
                  <option value="CREDITO_APROBADO">Crédito aprobado</option>
                </select>
                {(busquedaFacturadas || filtroCajaFacturadas) && (
                  <button onClick={() => { setBusquedaFacturadas(''); setFiltroCajaFacturadas(''); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['ODP', 'Cliente', 'Fecha Factura', 'N° Factura Electrónica', 'Valor Total', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facturadasFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 6 : 5} className="px-5 py-12 text-center text-slate-400">
                        <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay ODPs facturadas para el período seleccionado</p>
                      </td></tr>
                    ) : facturadasFiltradas.map(odp => (
                      <motion.tr key={odp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => setFichaOdpId(odp.id)}>{odp.numero_odp}</td>
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
                            <button onClick={() => abrirCrearODP(odp)}
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
            </div>
          )}

          {/* ── TAB OA ── */}
          {tab === 'oa' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={busquedaOA} onChange={e => setBusquedaOA(e.target.value)}
                    placeholder="Buscar OA, cliente..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                </div>
                {busquedaOA && (
                  <button onClick={() => setBusquedaOA('')}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['OA', 'Cliente', 'Estado Producción', 'Fecha Creación', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {oaFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 5 : 4} className="px-5 py-12 text-center text-slate-400">
                        <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay OA pendientes de salida para el período seleccionado</p>
                      </td></tr>
                    ) : oaFiltradas.map(oa => (
                      <motion.tr key={oa.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 font-mono font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => setFichaOdpId(oa.id)}>{oa.numero_odp}</td>
                        <td className="px-5 py-4 text-slate-700">{oa.cliente?.nombre_razon_social || '—'}</td>
                        <td className="px-5 py-4"><BadgeEstado estado={oa.estado_produccion} /></td>
                        <td className="px-5 py-4 text-slate-600">{fmtFecha(oa.fecha_creacion)}</td>
                        {puedeEditar && (
                          <td className="px-5 py-4">
                            <button onClick={() => abrirCrearOA(oa)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition shadow-sm">
                              <Plus className="w-3.5 h-3.5" /> Registrar SFV
                            </button>
                          </td>
                        )}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB NC ── */}
          {tab === 'nc' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-slate-50/50">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={busquedaNc} onChange={e => setBusquedaNc(e.target.value)}
                    placeholder="Buscar ODP, ODP padre, cliente, tipo error..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white" />
                </div>
                {busquedaNc && (
                  <button onClick={() => setBusquedaNc('')}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition bg-white">
                    <X className="w-3.5 h-3.5" /> Limpiar
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['ODP Reproceso', 'ODP Padre', 'Cliente', 'Estado', 'Tipo Error', puedeEditar ? 'Acción' : ''].filter(Boolean).map(h => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ncFiltradas.length === 0 ? (
                      <tr><td colSpan={puedeEditar ? 6 : 5} className="px-5 py-12 text-center text-slate-400">
                        <AlertTriangle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>No hay No Conformidades pendientes de salida para el período seleccionado</p>
                      </td></tr>
                    ) : ncFiltradas.map(nc => {
                      const tipoErr = nc.no_conformidad_origen?.tipo_error;
                      const chip = tipoErr ? (TIPO_ERROR_NC[tipoErr] ?? { label: tipoErr, cls: 'bg-slate-100 text-slate-600 border border-slate-200' }) : null;
                      return (
                        <motion.tr key={nc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4 font-mono font-bold text-rose-700 cursor-pointer hover:underline" onClick={() => setFichaOdpId(nc.id)}>{nc.numero_odp}</td>
                          <td className="px-5 py-4">
                            {nc.odp_padre
                              ? <span className="font-mono text-indigo-700 cursor-pointer hover:underline" onClick={() => setFichaOdpId(nc.odp_padre!.id)}>{nc.odp_padre.numero_odp}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-5 py-4 text-slate-700">{nc.cliente?.nombre_razon_social || '—'}</td>
                          <td className="px-5 py-4"><BadgeEstado estado={nc.estado_produccion} /></td>
                          <td className="px-5 py-4">
                            {chip
                              ? <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${chip.cls}`}>{chip.label}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          {puedeEditar && (
                            <td className="px-5 py-4">
                              <button onClick={() => abrirCrearNc(nc)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition shadow-sm">
                                <Plus className="w-3.5 h-3.5" /> Registrar SA
                              </button>
                            </td>
                          )}
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── TAB CON SALIDAS ── */}
          {tab === 'con_salida' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Subtabs */}
              <div className="flex gap-1 px-4 pt-3 border-b border-slate-100 bg-slate-50/50">
                {([
                  { key: 'odps', label: 'ODPs', count: conSalidaFiltradas.length },
                  { key: 'oa',   label: 'SA de OA', count: conSalidaOAFiltradas.length },
                ] as { key: SubTabConSalida; label: string; count: number }[]).map(st => (
                  <button key={st.key} onClick={() => setSubTabConSalida(st.key)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${
                      subTabConSalida === st.key
                        ? 'border-violet-600 text-violet-700 bg-white'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}>
                    {st.label}
                    <span className={`px-1.5 py-0.5 rounded-full font-bold text-[10px] ${
                      subTabConSalida === st.key ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'
                    }`}>{st.count}</span>
                  </button>
                ))}
              </div>

              {/* Subtab: ODPs */}
              {subTabConSalida === 'odps' && (
                <>
                  <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={busquedaConSalida} onChange={e => setBusquedaConSalida(e.target.value)}
                        placeholder="Buscar ODP, cliente, factura, SA, registrado por..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    {busquedaConSalida && (
                      <button onClick={() => setBusquedaConSalida('')}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition bg-white">
                        <X className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['ODP', 'Cliente', 'N° Factura Electrónica', 'Fecha Factura', 'Valor Total', 'N° Salida', 'Fecha SA', 'Registrado por', puedeEditar ? 'Acciones' : ''].filter(Boolean).map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conSalidaFiltradas.length === 0 ? (
                          <tr><td colSpan={puedeEditar ? 9 : 8} className="px-5 py-12 text-center text-slate-400">
                            <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>No hay salidas de almacén para el período seleccionado</p>
                          </td></tr>
                        ) : conSalidaFiltradas.map(s => (
                          <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => s.odp?.id && setFichaOdpId(s.odp.id)}>{s.odp?.numero_odp}</td>
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
                                  <button onClick={() => abrirEditar(s, false)}
                                    className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => eliminarSA(s.id, false)}
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
                </>
              )}

              {/* Subtab: SA de OA */}
              {subTabConSalida === 'oa' && (
                <>
                  <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-48">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={busquedaConSalidaOA} onChange={e => setBusquedaConSalidaOA(e.target.value)}
                        placeholder="Buscar OA, cliente, SFV, registrado por..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white" />
                    </div>
                    {busquedaConSalidaOA && (
                      <button onClick={() => setBusquedaConSalidaOA('')}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition bg-white">
                        <X className="w-3.5 h-3.5" /> Limpiar
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['OA', 'Cliente', 'Estado Producción', 'N° SFV', 'Fecha SA', 'Registrado por', puedeEditar ? 'Acciones' : ''].filter(Boolean).map(h => (
                            <th key={h} className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {conSalidaOAFiltradas.length === 0 ? (
                          <tr><td colSpan={puedeEditar ? 7 : 6} className="px-5 py-12 text-center text-slate-400">
                            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p>No hay salidas SFV de OA para el período seleccionado</p>
                          </td></tr>
                        ) : conSalidaOAFiltradas.map(s => (
                          <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-bold text-indigo-700 cursor-pointer hover:underline" onClick={() => s.odp?.id && setFichaOdpId(s.odp.id)}>{s.odp?.numero_odp}</td>
                            <td className="px-5 py-4 text-slate-700">{s.odp?.cliente?.nombre_razon_social || '—'}</td>
                            <td className="px-5 py-4">{s.odp?.estado_produccion ? <BadgeEstado estado={s.odp.estado_produccion} /> : '—'}</td>
                            <td className="px-5 py-4">
                              <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">{s.numero_sa}</span>
                            </td>
                            <td className="px-5 py-4 text-slate-600">{fmtFecha(s.fecha_sa)}</td>
                            <td className="px-5 py-4 text-slate-500 text-xs">{s.creador?.nombre_completo || '—'}</td>
                            {puedeEditar && (
                              <td className="px-5 py-4">
                                <div className="flex gap-2">
                                  <button onClick={() => abrirEditar(s, true)}
                                    className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => eliminarSA(s.id, true)}
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
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* ── MODAL SA / SFV ── */}
      {modalSA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  {modalSA.salida
                    ? (modalSA.esOA ? 'Editar Salida SFV' : 'Editar Salida de Almacén')
                    : (modalSA.esOA ? 'Registrar Salida SFV' : 'Registrar Salida de Almacén')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalSA.odp?.numero_odp || modalSA.salida?.odp?.numero_odp} ·{' '}
                  {(modalSA.odp as any)?.cliente?.nombre_razon_social || modalSA.salida?.odp?.cliente?.nombre_razon_social}
                </p>
              </div>
              <button onClick={() => setModalSA(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">
                  Número de Salida *
                </label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-violet-500">
                  <span className="px-3 py-2.5 bg-slate-100 text-slate-600 text-sm font-bold border-r border-slate-200 select-none">
                    {prefijo}
                  </span>
                  <input
                    value={formSA.numero}
                    onChange={e => setFormSA(p => ({ ...p, numero: e.target.value }))}
                    placeholder="0001"
                    className="flex-1 px-3 py-2.5 text-sm focus:outline-none"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Se guardará como: {prefijo}{formSA.numero || 'XXXX'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha de Salida *</label>
                <input type="date" value={formSA.fecha} onChange={e => setFormSA(p => ({ ...p, fecha: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setModalSA(null)}
                className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
                Cancelar
              </button>
              <button onClick={guardarSA} disabled={savingSA}
                className="flex-1 py-2.5 font-bold text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition disabled:opacity-40 text-sm">
                {savingSA ? 'Guardando...' : modalSA.salida ? 'Guardar Cambios' : (modalSA.esOA ? 'Registrar SFV' : 'Registrar SA')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {fichaOdpId && <ODPFichaModal odpId={fichaOdpId} onClose={() => setFichaOdpId(null)} />}
    </div>
  );
};

export default FacturasSalidasPage;
