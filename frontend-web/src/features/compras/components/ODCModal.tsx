import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, ShoppingCart, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export interface SAPItemConContexto {
  id: number;
  item: string;
  codigo: string;
  descripcion: string;
  dimension: string;
  cantidad: number;
  und?: string;
  exist_perf?: string;
  estado_compra: 'pendiente' | 'en_odc' | 'en_existencia';
  SAP: {
    id: number;
    numero_sap: string;
    ODP: {
      id: number;
      numero_odp: string;
      descripcion: string;
      cliente: { id: number; nombre_razon_social: string };
      asesor: { id: number; nombre_completo: string };
    };
  };
}

interface InventarioPerfil {
  id: number;
  consecutivo: number;
  codigo: string;
  mm: number | null;
  ubicacion: string | null;
}

interface Props {
  items: SAPItemConContexto[];
  onClose: () => void;
  onRefresh: () => void;
}

const ODCModal: React.FC<Props> = ({ items, onClose, onRefresh }) => {
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  // Inventario perfilería por código
  const [inventarioPorCodigo, setInventarioPorCodigo] = useState<Record<string, InventarioPerfil[]>>({});
  const [loadingInventario, setLoadingInventario] = useState(false);
  const [codigosPerfileria, setCodigosPerfileria] = useState<Set<string>>(new Set());
  const [existPerfLocal, setExistPerfLocal] = useState<Record<number, string>>({});

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/compras/codigos-perfileria`, { headers })
      .then(r => setCodigosPerfileria(new Set(r.data as string[])))
      .catch(() => {});

    const codigos = Array.from(new Set(items.map(i => i.codigo).filter(Boolean)));
    if (codigos.length === 0) return;

    setLoadingInventario(true);
    Promise.all(
      codigos.map(cod =>
        axios.get(`${API}/api/compras/inventario-perfileria/${encodeURIComponent(cod)}`, { headers })
          .then(r => ({ cod, data: r.data as InventarioPerfil[] }))
          .catch(() => ({ cod, data: [] as InventarioPerfil[] }))
      )
    ).then(results => {
      const map: Record<string, InventarioPerfil[]> = {};
      results.forEach(({ cod, data }) => { map[cod] = data; });
      setInventarioPorCodigo(map);
    }).finally(() => setLoadingInventario(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSeleccionarPerfil = async (itemId: number, codigo: string, perfil: InventarioPerfil) => {
    try {
      const existText = `${perfil.consecutivo} · ${perfil.ubicacion || '—'}`;
      await Promise.all([
        axios.delete(`${API}/api/compras/inventario-perfileria/${perfil.consecutivo}`, { headers }),
        axios.patch(`${API}/api/compras/sap-item/${itemId}/exist-perf`, { exist_perf: existText }, { headers }),
      ]);
      await axios.patch(`${API}/api/compras/sap-item/${itemId}/existencia`, {}, { headers });
      setExistPerfLocal(prev => ({ ...prev, [itemId]: existText }));
      setInventarioPorCodigo(prev => ({
        ...prev,
        [codigo]: (prev[codigo] || []).filter(p => p.consecutivo !== perfil.consecutivo),
      }));
    } catch {
      toast.error('Error al reservar perfil de inventario');
    }
  };

  const renderExisPerf = (item: SAPItemConContexto) => {
    const seleccionado = existPerfLocal[item.id];
    if (seleccionado) {
      return <span className="text-[10px] font-bold text-green-700">{seleccionado}</span>;
    }
    if (!item.codigo || !codigosPerfileria.has(item.codigo)) return <span className="text-slate-400">—</span>;
    const opciones = inventarioPorCodigo[item.codigo] ?? null;
    if (loadingInventario || opciones === null) return <span className="text-slate-400 text-[10px]">…</span>;
    if (opciones.length === 0) return <span className="text-slate-400">—</span>;
    return (
      <select
        className="text-[10px] border border-slate-200 rounded px-1 py-0.5 w-full max-w-[130px] bg-white cursor-pointer"
        defaultValue=""
        onChange={e => {
          if (!e.target.value) return;
          const perfil = opciones.find(p => p.consecutivo === parseInt(e.target.value));
          if (perfil) handleSeleccionarPerfil(item.id, item.codigo, perfil);
        }}
        onClick={e => e.stopPropagation()}
      >
        <option value="">Seleccionar…</option>
        {opciones.map(p => (
          <option key={p.consecutivo} value={p.consecutivo}>
            {p.consecutivo} · {p.ubicacion || '—'} · {p.mm != null ? (Number(p.mm) / 6000).toFixed(2) : '—'}m
          </option>
        ))}
      </select>
    );
  };

  // Agrupar items por código para la vista consolidada
  const gruposPorCodigo = (() => {
    const map = new Map<string, SAPItemConContexto[]>();
    for (const item of items) {
      const key = item.codigo || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  })();

  const handleCrearODC = async () => {
    if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/api/compras/odc`, {
        proveedor,
        notas: notas || null,
        items: items.map(i => ({
          sap_item_id: i.id,
          item: i.item,
          codigo: i.codigo,
          descripcion: i.descripcion,
          cantidad: i.cantidad,
        })),
      }, { headers });

      toast.success('ODC creada exitosamente');
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al crear ODC');
    } finally { setLoading(false); }
  };

  // Calcular cantidad total por código (para la vista consolidada)
  const totalPorCodigo = (grupo: SAPItemConContexto[]) =>
    grupo.reduce((sum, it) => sum + Number(it.cantidad), 0);

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
            <h2 className="text-lg font-bold text-slate-800">Nueva ODC Consolidada</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {items.length} item(s) de {new Set(items.map(i => i.SAP?.id)).size} SAP(s) seleccionados
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Resumen de items agrupados por código */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Items seleccionados — agrupados por código
            </p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {Array.from(gruposPorCodigo.entries()).map(([codigo, grupo], gi) => (
                <div key={codigo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                  {/* Encabezado del grupo */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                    <span className="font-mono font-black text-indigo-700 text-sm">{codigo}</span>
                    <span className="text-xs text-slate-500">—</span>
                    <span className="text-xs text-slate-600 font-medium flex-1 truncate">{grupo[0].descripcion || '—'}</span>
                    <span className="text-xs font-black text-indigo-700 shrink-0">
                      Total: {totalPorCodigo(grupo)} {grupo[0].und || ''}
                    </span>
                    {grupo.length > 1 && (
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
                        {grupo.length} SAPs
                      </span>
                    )}
                  </div>
                  {/* Filas de detalle por SAP de origen */}
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-1.5 text-left w-28">DIMENSIÓN</th>
                        <th className="px-4 py-1.5 text-center w-16">CANT.</th>
                        <th className="px-4 py-1.5 text-left w-28">UND</th>
                        <th className="px-4 py-1.5 text-left w-28">SAP</th>
                        <th className="px-4 py-1.5 text-left w-28">ODP</th>
                        <th className="px-4 py-1.5 text-left">CLIENTE</th>
                        <th className="px-4 py-1.5 text-center w-40">EXIS. PERF.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {grupo.map((item, i) => (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="px-4 py-1.5 text-slate-600">{item.dimension || '—'}</td>
                          <td className="px-4 py-1.5 text-center font-bold text-slate-700">{item.cantidad}</td>
                          <td className="px-4 py-1.5 text-slate-500">{item.und || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-indigo-600">{item.SAP?.numero_sap || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-slate-700">{item.SAP?.ODP?.numero_odp || '—'}</td>
                          <td className="px-4 py-1.5 text-slate-600 truncate max-w-[180px]">{item.SAP?.ODP?.cliente?.nombre_razon_social || '—'}</td>
                          <td className="px-4 py-1.5 text-center">{renderExisPerf(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Campos de la ODC */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                Proveedor <span className="text-red-400">*</span>
              </label>
              <input
                value={proveedor}
                onChange={e => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor..."
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                Notas (opcional)
              </label>
              <input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones..."
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCrearODC}
            disabled={loading || !proveedor.trim()}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
          >
            {loading ? 'Creando...' : `Crear ODC con ${items.length} item(s)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ODCModal;
