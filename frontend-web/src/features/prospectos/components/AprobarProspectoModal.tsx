import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Props {
  prospecto: any;
  onClose: () => void;
  onAprobado: () => void;
}

const AprobarProspectoModal: React.FC<Props> = ({ prospecto, onClose, onAprobado }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tipo_servicio: '',
    descripcion_pedido: prospecto.descripcion || '',
    fecha_entrega: '',
    valor_total: '',
    forma_pago: '',
    observaciones: '',
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const contacto = prospecto.cliente?.nombre_razon_social || prospecto.nombre_contacto || '—';
  const tm = prospecto.tomas_medidas?.[0];

  const handleAprobar = async () => {
    if (!form.fecha_entrega) { toast.error('Ingresa la fecha de entrega estimada'); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/prospectos/${prospecto.id}/aprobar`, {
        ...form,
        valor_total: form.valor_total ? parseFloat(form.valor_total) : 0,
      }, { headers });
      toast.success('Prospecto aprobado — ODP creada');
      onAprobado();
      // Navegar a la ODP recién creada
      if (res.data?.odp?.id) navigate(`/odp`);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al aprobar');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Aprobar Prospecto</h2>
            <p className="text-xs text-slate-500">{prospecto.numero_prospecto} · {contacto}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Info TM si existe */}
          {tm && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-green-700">Toma de medidas asociada: {tm.numero_tm}</p>
                <p className="text-xs text-green-600">Los datos de contacto se precargarán en la ODP</p>
              </div>
            </div>
          )}

          {/* Datos de la ODP a crear */}
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Datos de la ODP</p>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Tipo de servicio</label>
            <input value={form.tipo_servicio} onChange={e => set('tipo_servicio', e.target.value)}
              placeholder="Ej: Instalación ventanas, Fachada vidrio..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Descripción del pedido</label>
            <textarea value={form.descripcion_pedido} onChange={e => set('descripcion_pedido', e.target.value)}
              rows={3} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Fecha entrega <span className="text-red-400">*</span></label>
              <input type="date" value={form.fecha_entrega} onChange={e => set('fecha_entrega', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Valor total</label>
              <input type="number" value={form.valor_total} onChange={e => set('valor_total', e.target.value)}
                placeholder="0" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Forma de pago</label>
            <select value={form.forma_pago} onChange={e => set('forma_pago', e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Seleccionar...</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
              <option value="50_50">50% anticipo / 50% entrega</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)}
              rows={2} placeholder="Observaciones adicionales..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
          <button onClick={handleAprobar} disabled={loading}
            className="flex-1 py-3 font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition disabled:opacity-40 text-sm">
            {loading ? 'Creando ODP...' : '✓ Aprobar y crear ODP'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AprobarProspectoModal;
