import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface ItemLibre {
  descripcion: string;
  codigo: string;
  cantidad: number;
  und: string;
}

const itemVacio = (): ItemLibre => ({ descripcion: '', codigo: '', cantidad: 1, und: '' });

interface Props {
  onClose: () => void;
  onRefresh: () => void;
}

const ODCSinSAPModal: React.FC<Props> = ({ onClose, onRefresh }) => {
  const [numeroOdc, setNumeroOdc] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemLibre[]>([itemVacio()]);
  const [loading, setLoading] = useState(false);

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const updateItem = (idx: number, field: keyof ItemLibre, value: string | number) => {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [field]: value }));
  };

  const agregarItem = () => setItems(prev => [...prev, itemVacio()]);
  const quitarItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleCrear = async () => {
    if (!numeroOdc.trim() || !/^\d+$/.test(numeroOdc.trim())) {
      toast.error('El número de ODC es requerido (solo dígitos)');
      return;
    }
    if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
    const itemsValidos = items.filter(i => i.descripcion.trim());
    if (itemsValidos.length === 0) { toast.error('Agrega al menos un ítem con descripción'); return; }

    setLoading(true);
    try {
      await axios.post(`${API}/api/compras/odc-sin-sap`, {
        numero_odc: numeroOdc.trim(),
        proveedor: proveedor.trim(),
        notas: notas || null,
        items: itemsValidos.map(i => ({
          descripcion: i.descripcion.trim(),
          codigo: i.codigo.trim() || null,
          cantidad: Number(i.cantidad) || 1,
          und: i.und.trim() || null,
        })),
      }, { headers });
      toast.success('ODC sin SAP creada exitosamente');
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al crear ODC');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nueva ODC sin SAP</h2>
            <p className="text-xs text-slate-500 mt-0.5">Consumibles: tornillos, silicona, cintas, etc.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Datos generales */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">N° ODC <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Solo dígitos"
                value={numeroOdc}
                onChange={e => setNumeroOdc(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Proveedor <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="Nombre del proveedor"
                value={proveedor}
                onChange={e => setProveedor(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Notas</label>
            <textarea
              rows={2}
              placeholder="Observaciones opcionales..."
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          {/* Ítems */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ítems</p>
              <button
                onClick={agregarItem}
                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ítem
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Descripción *</th>
                    <th className="px-3 py-2 text-left w-28">Código</th>
                    <th className="px-3 py-2 text-center w-20">Cant.</th>
                    <th className="px-3 py-2 text-left w-20">Und.</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={item.descripcion}
                          onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                          placeholder="Descripción del ítem"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={item.codigo}
                          onChange={e => updateItem(idx, 'codigo', e.target.value)}
                          placeholder="—"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={e => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 1)}
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-center font-bold focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={item.und}
                          onChange={e => updateItem(idx, 'und', e.target.value)}
                          placeholder="und"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {items.length > 1 && (
                          <button
                            onClick={() => quitarItem(idx)}
                            className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 shrink-0 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleCrear}
            disabled={loading}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Creando…' : 'Crear ODC sin SAP'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ODCSinSAPModal;
