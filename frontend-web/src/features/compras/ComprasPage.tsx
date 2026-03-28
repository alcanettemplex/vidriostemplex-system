import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Search, RefreshCw, Clock, Package, CheckCircle2, Truck, ListChecks } from 'lucide-react';
import ODCModal from './components/ODCModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface SAPItem {
  id: number; item: string; codigo: string; descripcion: string;
  dimension: string; cantidad: number; estado_compra: 'pendiente' | 'en_odc' | 'en_existencia';
}

interface SAPPendiente {
  id: number; numero_sap: string; fecha_creacion: string; notas: string;
  asesor: { id: number; nombre_completo: string };
  ODP: {
    id: number; numero_odp: string; descripcion: string; estado_produccion: string;
    cliente: { id: number; nombre_razon_social: string };
    asesor: { id: number; nombre_completo: string };
  };
  items: SAPItem[];
}

interface ODCItem {
  id: number; sap_item_id: number; item: string; codigo: string; descripcion: string; cantidad: number;
}

interface ODC {
  id: number; numero_odc: string; proveedor: string;
  estado: 'pendiente' | 'enviada' | 'recibida';
  notas: string; fecha_creacion: string; fecha_recepcion?: string;
  creador: { id: number; nombre_completo: string };
  items: ODCItem[];
  sap: {
    id: number; numero_sap: string;
    ODP: {
      id: number; numero_odp: string; descripcion: string; estado_produccion: string;
      cliente: { id: number; nombre_razon_social: string };
      asesor: { id: number; nombre_completo: string };
    };
  };
}

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
  pendiente: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  enviada:   { label: 'Enviada',   className: 'bg-blue-100 text-blue-700 border-blue-200' },
  recibida:  { label: 'Recibida',  className: 'bg-green-100 text-green-700 border-green-200' },
};

const TABS = [
  { key: 'pendientes',   label: 'Pendientes',   icon: Clock },
  { key: 'seguimiento',  label: 'Seguimiento',  icon: Truck },
  { key: 'recibidas',    label: 'Recibidas',    icon: CheckCircle2 },
];

// ─── Componente tarjeta ODC (Seguimiento / Recibidas) ───────────────────────

const ODCCard: React.FC<{ odc: ODC; onActualizar: () => void }> = ({ odc, onActualizar }) => {
  const [editandoEstado, setEditandoEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState(odc.estado);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');
  const odp = odc.sap?.ODP;
  const estadoProd = odp?.estado_produccion || '';
  const est = ODC_ESTADO_STYLE[odc.estado];

  const handleGuardarEstado = async () => {
    setLoading(true);
    try {
      await axios.put(`${API}/api/compras/odc/${odc.id}`,
        { estado: nuevoEstado },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onActualizar();
      setEditandoEstado(false);
    } catch { } finally { setLoading(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
            <span className="font-black text-indigo-700 text-base">{odc.numero_odc}</span>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${est.className}`}>{est.label}</span>
            {estadoProd && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_PROD_COLOR[estadoProd] || 'bg-slate-100 text-slate-600'}`}>
                {estadoProd.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700">{odp?.cliente?.nombre_razon_social}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
            <span>ODP: <span className="font-bold text-slate-700">{odp?.numero_odp}</span></span>
            <span>SAP: <span className="font-bold text-slate-700">{odc.sap?.numero_sap}</span></span>
            <span>Proveedor: <span className="font-bold text-slate-700">{odc.proveedor}</span></span>
            <span>Creada: <span className="font-bold text-slate-700">{new Date(odc.fecha_creacion).toLocaleDateString('es-CO')}</span></span>
            {odc.fecha_recepcion && (
              <span>Recibida: <span className="font-bold text-green-700">{new Date(odc.fecha_recepcion).toLocaleDateString('es-CO')}</span></span>
            )}
          </div>
          {odc.notas && <p className="text-xs text-slate-400 italic mt-1">"{odc.notas}"</p>}
        </div>
        <div className="ml-4 shrink-0">
          {editandoEstado ? (
            <div className="flex items-center gap-2">
              <select
                value={nuevoEstado}
                onChange={e => setNuevoEstado(e.target.value as any)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value="pendiente">Pendiente</option>
                <option value="enviada">Enviada</option>
                <option value="recibida">Recibida</option>
              </select>
              <button onClick={handleGuardarEstado} disabled={loading}
                className="text-xs font-bold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {loading ? '...' : 'OK'}
              </button>
              <button onClick={() => setEditandoEstado(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
            </div>
          ) : (
            <button onClick={() => setEditandoEstado(true)}
              className="text-xs font-bold px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition">
              Cambiar estado
            </button>
          )}
        </div>
      </div>

      {/* Items de la ODC */}
      <div className="border-t border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left w-10">ITEM</th>
              <th className="px-4 py-2 text-left w-28">CÓDIGO</th>
              <th className="px-4 py-2 text-left">DESCRIPCIÓN</th>
              <th className="px-4 py-2 text-center w-16">CANT.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {odc.items.map((it, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                <td className="px-4 py-1.5 font-black text-slate-600">{it.item}</td>
                <td className="px-4 py-1.5 font-mono text-blue-700 font-bold">{it.codigo || '—'}</td>
                <td className="px-4 py-1.5 text-slate-700">{it.descripcion || '—'}</td>
                <td className="px-4 py-1.5 text-center font-bold text-slate-600">{it.cantidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Componente principal ────────────────────────────────────────────────────

const ComprasPage: React.FC = () => {
  const [tab, setTab] = useState<'pendientes' | 'seguimiento' | 'recibidas'>('pendientes');
  const [sapsPendientes, setSapsPendientes] = useState<SAPPendiente[]>([]);
  const [odcsSeguimiento, setOdcsSeguimiento] = useState<ODC[]>([]);
  const [odcsRecibidas, setOdcsRecibidas] = useState<ODC[]>([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [sapSeleccionada, setSapSeleccionada] = useState<SAPPendiente | null>(null);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchTab = useCallback(async (t: string) => {
    setLoading(true);
    try {
      if (t === 'pendientes') {
        const res = await axios.get(`${API}/api/compras/panel`, { headers });
        setSapsPendientes(res.data);
      } else if (t === 'seguimiento') {
        const res = await axios.get(`${API}/api/compras/seguimiento`, { headers });
        setOdcsSeguimiento(res.data);
      } else {
        const res = await axios.get(`${API}/api/compras/recibidas`, { headers });
        setOdcsRecibidas(res.data);
      }
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTab(tab); setBusqueda(''); }, [tab, fetchTab]);

  const refresh = () => fetchTab(tab);

  // Filtros por búsqueda
  const filtrarSaps = (list: SAPPendiente[]) => {
    const q = busqueda.toLowerCase();
    return list.filter(s =>
      s.numero_sap.toLowerCase().includes(q) ||
      s.ODP?.numero_odp?.toLowerCase().includes(q) ||
      s.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
    );
  };

  const filtrarOdcs = (list: ODC[]) => {
    const q = busqueda.toLowerCase();
    return list.filter(o =>
      o.numero_odc.toLowerCase().includes(q) ||
      o.proveedor.toLowerCase().includes(q) ||
      o.sap?.ODP?.numero_odp?.toLowerCase().includes(q) ||
      o.sap?.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q)
    );
  };

  const getResumen = (items: SAPItem[]) => ({
    total: items.length,
    pendientes: items.filter(i => i.estado_compra === 'pendiente').length,
    enOdc: items.filter(i => i.estado_compra === 'en_odc').length,
    enExistencia: items.filter(i => i.estado_compra === 'en_existencia').length,
  });

  const countBadge = (t: string) => {
    if (t === 'pendientes') return sapsPendientes.length;
    if (t === 'seguimiento') return odcsSeguimiento.length;
    return odcsRecibidas.length;
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
          placeholder={tab === 'pendientes' ? 'Buscar SAP, ODP o cliente...' : 'Buscar ODC, proveedor, ODP o cliente...'}
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
              const lista = filtrarSaps(sapsPendientes);
              return lista.length === 0 ? (
                <div className="text-center py-20">
                  <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-3" />
                  <p className="text-lg font-bold text-slate-500">
                    {busqueda ? 'Sin resultados' : 'No hay SAPs con materiales pendientes'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {lista.map(sap => {
                    const { total, pendientes, enOdc, enExistencia } = getResumen(sap.items);
                    const pct = total > 0 ? Math.round(((total - pendientes) / total) * 100) : 0;
                    const estadoProd = sap.ODP?.estado_produccion || '';
                    return (
                      <div key={sap.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden">
                        <div className="flex items-start justify-between p-5">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <span className="font-black text-indigo-700 text-base">{sap.numero_sap}</span>
                              <span className="text-slate-300">·</span>
                              <span className="font-bold text-slate-700">{sap.ODP?.numero_odp}</span>
                              {estadoProd && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_PROD_COLOR[estadoProd] || 'bg-slate-100 text-slate-600'}`}>
                                  {estadoProd.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-slate-700 mb-1">{sap.ODP?.cliente?.nombre_razon_social}</p>
                            {sap.ODP?.descripcion && <p className="text-xs text-slate-500 truncate max-w-lg mb-2">{sap.ODP.descripcion}</p>}
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span>Asesor: <span className="font-bold text-slate-700">{sap.ODP?.asesor?.nombre_completo}</span></span>
                              <span>SAP: <span className="font-bold text-slate-700">{new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</span></span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3 ml-4 shrink-0">
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {pendientes > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> {pendientes} pend.</span>}
                              {enOdc > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"><ShoppingCart className="w-3 h-3" /> {enOdc} en ODC</span>}
                              {enExistencia > 0 && <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><Package className="w-3 h-3" /> {enExistencia} exist.</span>}
                            </div>
                            <div className="flex items-center gap-2 w-40">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0">{pct}%</span>
                            </div>
                            <button onClick={() => setSapSeleccionada(sap)}
                              className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm">
                              Gestionar →
                            </button>
                          </div>
                        </div>
                        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                          <div className="flex flex-wrap gap-1.5">
                            {sap.items.map(item => (
                              <span key={item.id} title={item.descripcion}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${item.estado_compra === 'pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' : item.estado_compra === 'en_odc' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                {item.item} · {item.codigo || item.descripcion?.substring(0, 12)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                  {lista.map(odc => <ODCCard key={odc.id} odc={odc} onActualizar={refresh} />)}
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
                  {lista.map(odc => <ODCCard key={odc.id} odc={odc} onActualizar={refresh} />)}
                </div>
              );
            })()}

          </motion.div>
        </AnimatePresence>
      )}

      {/* Modal */}
      {sapSeleccionada && (
        <ODCModal
          sap={sapSeleccionada as any}
          odp={sapSeleccionada.ODP}
          onClose={() => setSapSeleccionada(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
};

export default ComprasPage;
