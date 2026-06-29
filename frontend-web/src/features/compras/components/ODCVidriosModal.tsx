import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { toast } from 'react-toastify';

import API from '../../../services/config';

// Tipo exportado para que ComprasPage y otros consumidores lo importen
export interface ODPItemConContexto {
  id: number;
  odp_id: number;
  tipo_vidrio: string | null;
  prod: string | null;
  color: string | null;
  espesor: string | null;
  ancho_mm: number | null;
  alto_mm: number | null;
  cantidad: number;
  estado_compra: string;
  pedido_pv_id: number | null;
  otros: string | null;
  ODP: {
    id: number;
    numero_odp: string;
    cliente: { id: number; nombre_razon_social: string };
    asesor: { id: number; nombre_completo: string };
  };
}

interface Props {
  items: ODPItemConContexto[];
  onClose: () => void;
  onRefresh: () => void;
}

const ODCVidriosModal: React.FC<Props> = ({ items, onClose, onRefresh }) => {
  const [numeroOdc, setNumeroOdc] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);

  const token = sessionStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Agrupar por tipo_vidrio para mostrar la vista consolidada (igual que en el tab)
  const gruposPorTipo = (() => {
    const map = new Map<string, ODPItemConContexto[]>();
    for (const item of items) {
      const key = item.tipo_vidrio || item.prod || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  })();

  const totalCantidad = items.reduce((s, i) => s + Number(i.cantidad), 0);
  const odpsInvolucradas = new Set(items.map(i => i.ODP?.id)).size;

  const handleCrear = async () => {
    if (!numeroOdc.trim() || !/^\d+$/.test(numeroOdc.trim())) {
      toast.error('El número de ODC es requerido (solo dígitos)');
      return;
    }
    if (!proveedor.trim()) {
      toast.error('Ingresa el proveedor');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/api/compras/vidrios/odc`, {
        numero_odc: numeroOdc.trim(),
        proveedor,
        notas: notas || null,
        odp_item_ids: items.map(i => i.id),
      }, { headers });

      toast.success('ODC de vidrios creada exitosamente');
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-slate-200"
      >
        {/* Header */}
        <div className="flex justify-between items-start px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nueva ODC de Vidrios</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {items.length} ítem(s) · {odpsInvolucradas} ODP(s) · Cantidad total: {totalCantidad}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Resumen agrupado por tipo_vidrio */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Ítems seleccionados — agrupados por tipo de vidrio
            </p>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {Array.from(gruposPorTipo.entries()).map(([tipo, grupo], gi) => (
                <div key={tipo} className={gi > 0 ? 'border-t border-slate-200' : ''}>
                  {/* Encabezado del grupo */}
                  <div className="flex items-center gap-3 px-4 py-2 bg-cyan-50 border-b border-cyan-100">
                    <span className="font-bold text-cyan-800 text-sm">{tipo}</span>
                    <span className="flex-1" />
                    <span className="text-xs font-black text-cyan-700 shrink-0">
                      Total: {grupo.reduce((s, i) => s + Number(i.cantidad), 0)} und
                    </span>
                    {grupo.length > 1 && (
                      <span className="text-[10px] font-bold text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-full border border-cyan-200">
                        {grupo.length} ítems
                      </span>
                    )}
                  </div>

                  {/* Filas del grupo */}
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-1.5 text-left">Color</th>
                        <th className="px-4 py-1.5 text-left w-16">Esp.</th>
                        <th className="px-4 py-1.5 text-left">Medidas (mm)</th>
                        <th className="px-4 py-1.5 text-center w-16">Cant.</th>
                        <th className="px-4 py-1.5 text-left w-28">ODP</th>
                        <th className="px-4 py-1.5 text-left">Cliente</th>
                        <th className="px-4 py-1.5 text-left w-40">Asesor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {grupo.map((item, i) => (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="px-4 py-1.5 text-slate-600">{item.color || '—'}</td>
                          <td className="px-4 py-1.5 text-slate-600">{item.espesor || '—'}</td>
                          <td className="px-4 py-1.5 font-mono text-slate-700">
                            {item.ancho_mm && item.alto_mm ? `${item.ancho_mm}×${item.alto_mm}` : '—'}
                          </td>
                          <td className="px-4 py-1.5 text-center font-bold text-slate-700">{item.cantidad}</td>
                          <td className="px-4 py-1.5 font-bold text-indigo-600">{item.ODP?.numero_odp || '—'}</td>
                          <td className="px-4 py-1.5 text-slate-600 truncate max-w-[180px]">
                            {item.ODP?.cliente?.nombre_razon_social || '—'}
                          </td>
                          <td className="px-4 py-1.5 text-slate-400 text-[10px] truncate max-w-[160px]">
                            {item.ODP?.asesor?.nombre_completo || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>

          {/* Campos ODC */}
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
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
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
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
            onClick={handleCrear}
            disabled={loading || !proveedor.trim() || !numeroOdc.trim()}
            className="flex-1 py-3 font-bold text-white bg-cyan-600 rounded-xl hover:bg-cyan-700 transition disabled:opacity-40"
          >
            {loading ? 'Creando...' : `Crear ODC con ${items.length} ítem(s)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ODCVidriosModal;
