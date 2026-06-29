import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X, Ruler } from 'lucide-react';

import API from '../../../services/config';

interface Props {
  prospecto: any;
  onClose: () => void;
  onCreada: () => void;
}

const SolicitarTMModal: React.FC<Props> = ({ prospecto, onClose, onCreada }) => {
  const [form, setForm] = useState({
    direccion: prospecto.direccion || '',
    nombre_contacto: prospecto.nombre_contacto || prospecto.cliente?.nombre_razon_social || '',
    telefono_contacto: prospecto.telefono_contacto || '',
    observaciones: '',
  });
  const [loading, setLoading] = useState(false);
  const token = sessionStorage.getItem('token');
  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const contacto = prospecto.cliente?.nombre_razon_social || prospecto.nombre_contacto || '—';

  const handleSolicitar = async () => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${API}/api/documentos/tm`,
        {
          prospecto_id: prospecto.id,
          direccion: form.direccion,
          nombre_contacto: form.nombre_contacto,
          telefono_contacto: form.telefono_contacto,
          observaciones: form.observaciones,
          medidas_json: [],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${res.data.numero_tm} solicitada — el jefe de producción la programará`);
      onCreada();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al solicitar la visita');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-xl">
              <Ruler className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Solicitar Visita Técnica</h2>
              <p className="text-xs text-slate-500">{prospecto.numero_prospecto} · {contacto}</p>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-xl p-3">
            Se creará una toma de medidas en estado <span className="font-bold text-amber-700">Solicitada</span>.
            El jefe de producción la verá en su panel y le asignará fecha de visita.
          </p>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Dirección del proyecto</label>
            <input
              value={form.direccion}
              onChange={e => set('direccion', e.target.value)}
              placeholder="Dirección donde se realizará la visita..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Contacto en obra</label>
              <input
                value={form.nombre_contacto}
                onChange={e => set('nombre_contacto', e.target.value)}
                placeholder="Nombre..."
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Teléfono</label>
              <input
                value={form.telefono_contacto}
                onChange={e => set('telefono_contacto', e.target.value)}
                placeholder="3001234567"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Observaciones para el técnico</label>
            <textarea
              value={form.observaciones}
              onChange={e => set('observaciones', e.target.value)}
              rows={3}
              placeholder="Acceso al sitio, qué medir, indicaciones especiales..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={handleSolicitar}
            disabled={loading}
            className="flex-1 py-3 font-bold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition disabled:opacity-40 text-sm flex items-center justify-center gap-2"
          >
            <Ruler className="w-4 h-4" />
            {loading ? 'Solicitando...' : 'Solicitar visita'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SolicitarTMModal;
