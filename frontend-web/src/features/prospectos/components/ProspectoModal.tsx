import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { X } from 'lucide-react';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

interface Cliente { id: number; nombre_razon_social: string; }

interface Props {
  prospecto?: any;
  onClose: () => void;
  onSaved: () => void;
}

const ProspectoModal: React.FC<Props> = ({ prospecto, onClose, onSaved }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [useCliente, setUseCliente] = useState(!!prospecto?.cliente_id);
  const [form, setForm] = useState({
    cliente_id: prospecto?.cliente_id || '',
    nombre_contacto: prospecto?.nombre_contacto || '',
    telefono_contacto: prospecto?.telefono_contacto || '',
    email_contacto: prospecto?.email_contacto || '',
    direccion: prospecto?.direccion || '',
    descripcion: prospecto?.descripcion || '',
  });
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    axios.get(`${API}/api/clientes`, { headers }).then(r => setClientes(r.data)).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!useCliente && !form.nombre_contacto.trim()) { toast.error('Ingresa el nombre del contacto'); return; }
    if (!form.descripcion.trim()) { toast.error('Ingresa una descripción del proyecto'); return; }
    setLoading(true);
    try {
      const body = {
        ...form,
        cliente_id: useCliente ? form.cliente_id || null : null,
        nombre_contacto: useCliente ? null : form.nombre_contacto,
      };
      if (prospecto) {
        await axios.put(`${API}/api/prospectos/${prospecto.id}`, body, { headers });
        toast.success('Prospecto actualizado');
      } else {
        await axios.post(`${API}/api/prospectos`, body, { headers });
        toast.success('Prospecto creado');
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{prospecto ? 'Editar Prospecto' : 'Nuevo Prospecto'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Tipo de contacto */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de contacto</p>
            <div className="flex gap-2">
              <button
                onClick={() => setUseCliente(false)}
                className={`flex-1 py-2 text-sm font-bold rounded-xl border transition ${!useCliente ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                Contacto nuevo
              </button>
              <button
                onClick={() => setUseCliente(true)}
                className={`flex-1 py-2 text-sm font-bold rounded-xl border transition ${useCliente ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                Cliente existente
              </button>
            </div>
          </div>

          {/* Datos según tipo */}
          {useCliente ? (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Cliente</label>
              <select value={form.cliente_id} onChange={e => set('cliente_id', e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre_razon_social}</option>)}
              </select>
            </div>
          ) : (
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Nombre contacto <span className="text-red-400">*</span></label>
              <input value={form.nombre_contacto} onChange={e => set('nombre_contacto', e.target.value)}
                placeholder="Nombre completo..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          )}

          {/* Teléfono y email — siempre visibles */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Teléfono</label>
              <input value={form.telefono_contacto} onChange={e => set('telefono_contacto', e.target.value)}
                placeholder="3001234567" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Email</label>
              <input value={form.email_contacto} onChange={e => set('email_contacto', e.target.value)}
                placeholder="correo@ejemplo.com" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Dirección del proyecto</label>
            <input value={form.direccion} onChange={e => set('direccion', e.target.value)}
              placeholder="Dirección..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Descripción del proyecto <span className="text-red-400">*</span></label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={3} placeholder="Describe el proyecto que solicita el cliente..."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-sm">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-3 font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition disabled:opacity-40 text-sm">
            {loading ? 'Guardando...' : prospecto ? 'Guardar cambios' : 'Crear prospecto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProspectoModal;
