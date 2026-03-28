import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ShoppingCart, Search, RefreshCw, Clock, Package, CheckCircle2 } from 'lucide-react';
import ODCModal from './components/ODCModal';

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

interface SAPPendiente {
  id: number;
  numero_sap: string;
  fecha_creacion: string;
  notas: string;
  asesor: { id: number; nombre_completo: string };
  ODP: {
    id: number;
    numero_odp: string;
    descripcion: string;
    estado_produccion: string;
    cliente: { id: number; nombre_razon_social: string };
    asesor: { id: number; nombre_completo: string };
  };
  items: SAPItem[];
}

const ESTADO_PROD_COLOR: Record<string, string> = {
  EN_ESPERA:            'bg-slate-100 text-slate-600',
  MEDICION:             'bg-yellow-100 text-yellow-700',
  PEDIDO_PROVEEDOR:     'bg-orange-100 text-orange-700',
  ALUMINIO_CORTADO:     'bg-blue-100 text-blue-700',
  VIDRIO_RECIBIDO:      'bg-cyan-100 text-cyan-700',
  ACCESORIOS_SEPARADOS: 'bg-indigo-100 text-indigo-700',
  LISTO_INSTALAR:       'bg-green-100 text-green-700',
  PROGRAMADA:           'bg-violet-100 text-violet-700',
  INSTALADA:            'bg-emerald-100 text-emerald-700',
  ENTREGADA:            'bg-teal-100 text-teal-700',
  PAUSADA:              'bg-red-100 text-red-700',
};

const ComprasPage: React.FC = () => {
  const [saps, setSaps] = useState<SAPPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [sapSeleccionada, setSapSeleccionada] = useState<SAPPendiente | null>(null);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchPanel = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/api/compras/panel`, { headers });
      setSaps(res.data);
    } catch {
      setSaps([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPanel(); }, [fetchPanel]);

  const sapsFiltradas = saps.filter(s => {
    const q = busqueda.toLowerCase();
    return (
      s.numero_sap.toLowerCase().includes(q) ||
      s.ODP?.numero_odp?.toLowerCase().includes(q) ||
      s.ODP?.cliente?.nombre_razon_social?.toLowerCase().includes(q) ||
      s.ODP?.asesor?.nombre_completo?.toLowerCase().includes(q)
    );
  });

  const getResumen = (items: SAPItem[]) => ({
    total: items.length,
    pendientes: items.filter(i => i.estado_compra === 'pendiente').length,
    enOdc: items.filter(i => i.estado_compra === 'en_odc').length,
    enExistencia: items.filter(i => i.estado_compra === 'en_existencia').length,
  });

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
            <p className="text-sm text-slate-500">SAPs con materiales pendientes de gestionar</p>
          </div>
        </div>
        <button
          onClick={fetchPanel}
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition shadow-sm"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por SAP, ODP, cliente o asesor..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
        />
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sapsFiltradas.length === 0 ? (
        <div className="text-center py-20">
          <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-slate-500">
            {busqueda ? 'Sin resultados para la búsqueda' : 'No hay SAPs con materiales pendientes'}
          </p>
          {!busqueda && (
            <p className="text-sm text-slate-400 mt-1">Todos los materiales están gestionados o no hay SAPs creadas.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {sapsFiltradas.map(sap => {
            const { total, pendientes, enOdc, enExistencia } = getResumen(sap.items);
            const pct = total > 0 ? Math.round(((total - pendientes) / total) * 100) : 0;
            const estadoProd = sap.ODP?.estado_produccion || '';

            return (
              <motion.div
                key={sap.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden"
              >
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
                    <p className="text-sm font-semibold text-slate-700 mb-1">
                      {sap.ODP?.cliente?.nombre_razon_social}
                    </p>
                    {sap.ODP?.descripcion && (
                      <p className="text-xs text-slate-500 truncate max-w-lg mb-2">{sap.ODP.descripcion}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Asesor: <span className="font-bold text-slate-700">{sap.ODP?.asesor?.nombre_completo}</span></span>
                      <span>SAP: <span className="font-bold text-slate-700">{new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</span></span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 ml-4 shrink-0">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {pendientes > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> {pendientes} pendiente{pendientes > 1 ? 's' : ''}
                        </span>
                      )}
                      {enOdc > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          <ShoppingCart className="w-3 h-3" /> {enOdc} en ODC
                        </span>
                      )}
                      {enExistencia > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          <Package className="w-3 h-3" /> {enExistencia} existencia
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 w-40">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{pct}%</span>
                    </div>
                    <button
                      onClick={() => setSapSeleccionada(sap)}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm"
                    >
                      Gestionar →
                    </button>
                  </div>
                </div>

                {/* Chips de items */}
                <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                  <div className="flex flex-wrap gap-1.5">
                    {sap.items.map(item => (
                      <span
                        key={item.id}
                        title={item.descripcion}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          item.estado_compra === 'pendiente'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : item.estado_compra === 'en_odc'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-green-50 text-green-700 border-green-200'
                        }`}
                      >
                        {item.item} · {item.codigo || item.descripcion?.substring(0, 12)}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {sapSeleccionada && (
        <ODCModal
          sap={sapSeleccionada as any}
          odp={sapSeleccionada.ODP}
          onClose={() => setSapSeleccionada(null)}
          onRefresh={fetchPanel}
        />
      )}
    </div>
  );
};

export default ComprasPage;
