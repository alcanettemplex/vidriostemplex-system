import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
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
  observacion?: string;
  estado_compra: 'pendiente' | 'en_odc' | 'en_existencia';
  modificado?: boolean;
  datos_anteriores?: { codigo?: string; descripcion?: string; dimension?: string; cantidad?: number; und?: string; observacion?: string } | null;
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

interface Props {
  items: SAPItemConContexto[];
  onClose: () => void;
  onRefresh: () => void;
}

// Nota: la gestión de existencia de perfilería (selección de piezas, "Falta material")
// se realiza ahora desde la pestaña Pendientes. Este modal solo crea la orden con lo
// que se va a COMPRAR; no asigna existencia ni consume inventario.
const ODCModal: React.FC<Props> = ({ items, onClose, onRefresh }) => {
  const [numeroOdc, setNumeroOdc] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  // Copia local editable de los items (para CANT. y UND editables)
  const [localItems, setLocalItems] = useState<SAPItemConContexto[]>(() =>
    items.map(i => ({ ...i }))
  );

  const updateLocalItem = (id: number, field: 'cantidad' | 'und', value: string) => {
    setLocalItems(prev => prev.map(it =>
      it.id !== id ? it : {
        ...it,
        [field]: field === 'cantidad' ? (parseFloat(value) || 0) : value,
      }
    ));
  };

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Agrupar items por código para la vista consolidada
  const gruposPorCodigo = (() => {
    const map = new Map<string, SAPItemConContexto[]>();
    for (const item of localItems) {
      const key = item.codigo || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  })();

  const handleCrearODC = async () => {
    if (!numeroOdc.trim() || !/^\d+$/.test(numeroOdc.trim())) { toast.error('El número de ODC es requerido (solo dígitos)'); return; }
    if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    setLoading(true);
    try {
      await axios.post(`${API}/api/compras/odc`, {
        numero_odc: numeroOdc.trim(),
        proveedor,
        notas: notas || null,
        items: localItems.map(i => ({
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
              {localItems.length} item(s) de {new Set(localItems.map(i => i.SAP?.id)).size} SAP(s) seleccionados
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
                        <th className="px-4 py-1.5 text-left w-36">OBSERV.</th>
                        <th className="px-4 py-1.5 text-left w-28">SAP</th>
                        <th className="px-4 py-1.5 text-left w-28">ODP</th>
                        <th className="px-4 py-1.5 text-left">CLIENTE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {grupo.map((item, i) => (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="px-4 py-1.5 text-slate-600">{item.dimension || '—'}</td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={item.cantidad}
                              onChange={e => updateLocalItem(item.id, 'cantidad', e.target.value)}
                              className="w-16 text-center font-bold text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={item.und || ''}
                              onChange={e => updateLocalItem(item.id, 'und', e.target.value)}
                              placeholder="UND"
                              maxLength={10}
                              className="w-16 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 uppercase"
                            />
                          </td>
                          <td className="px-4 py-1.5 text-slate-400 text-[10px] truncate max-w-[140px]" title={item.observacion || ''}>{item.observacion || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-indigo-600">{item.SAP?.numero_sap || '—'}</td>
                          <td className="px-4 py-1.5 font-bold text-slate-700">{item.SAP?.ODP?.numero_odp || '—'}</td>
                          <td className="px-4 py-1.5 text-slate-600 truncate max-w-[180px]">{item.SAP?.ODP?.cliente?.nombre_razon_social || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Campos de la ODC */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                N° ODC <span className="text-red-400">*</span>
              </label>
              <input
                value={numeroOdc}
                onChange={e => setNumeroOdc(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej: 12345"
                maxLength={20}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
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
            disabled={loading || !proveedor.trim() || !numeroOdc.trim() || localItems.length === 0}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40"
          >
            {loading ? 'Creando...' : `Crear ODC con ${localItems.length} item(s)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ODCModal;
