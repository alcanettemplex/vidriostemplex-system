import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, AlertTriangle, Send, CheckCircle } from 'lucide-react';

interface ReportarProblemaFormProps {
  odp: any;
  onClose: () => void;
  onSuccess: () => void;
}

const ReportarProblemaForm: React.FC<ReportarProblemaFormProps> = ({ odp, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    odp_id: odp.id,
    tipo_error: 'ERROR_INTERNO',
    area_error: '',
    causa: '',
    responsable: '',
    efecto: '',
    producto_error_descripcion: '',
    producto_error_cantidad: 1,
    producto_solucion_descripcion: '',
    producto_solucion_cantidad: 1,
    observaciones: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('token');
      
      await axios.post(`${API}/api/no-conformidad`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error al crear reporte:', error);
      alert('Error al enviar el reporte. Verifique los campos.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-black text-slate-800">¡Reporte Enviado!</h3>
        <p className="text-slate-500 mt-2">La no conformidad ha sido registrada exitosamente.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-500" /> REPORTAR NO CONFORMIDAD
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Tipo de Error</label>
            <select 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-indigo-500"
              value={formData.tipo_error}
              onChange={e => setFormData({ ...formData, tipo_error: e.target.value })}
            >
              <option value="ERROR_INTERNO">Error Interno</option>
              <option value="DANO_PLANTA">Daño en Planta</option>
              <option value="REPROCESO">Reproceso</option>
              <option value="QUEJA">Queja de Cliente</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Área del Error</label>
            <input 
              type="text" required
              placeholder="Ej: Producción, Corte, Transporte..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              value={formData.area_error}
              onChange={e => setFormData({ ...formData, area_error: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Causa del Problema</label>
          <textarea required
            rows={2}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
            value={formData.causa}
            onChange={e => setFormData({ ...formData, causa: e.target.value })}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Responsable Causa</label>
            <input 
              type="text" required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              value={formData.responsable}
              onChange={e => setFormData({ ...formData, responsable: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Efecto / Impacto</label>
            <input 
              type="text" required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              value={formData.efecto}
              onChange={e => setFormData({ ...formData, efecto: e.target.value })}
            />
          </div>
        </div>

        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <h4 className="text-[10px] font-black uppercase text-amber-600 mb-3 tracking-widest">Detalle de Producto</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-slate-500">CON REQUERIMIENTO (EL ERROR)</label>
              <input type="text" placeholder="Descripción producto afectado" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                value={formData.producto_error_descripcion} onChange={e => setFormData({ ...formData, producto_error_descripcion: e.target.value })} />
              <input type="number" placeholder="Can." className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                value={formData.producto_error_cantidad} onChange={e => setFormData({ ...formData, producto_error_cantidad: parseInt(e.target.value) })} />
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-slate-500">SOLUCIÓN (LO NUEVO)</label>
              <input type="text" placeholder="Descripción producto solución" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                value={formData.producto_solucion_descripcion} onChange={e => setFormData({ ...formData, producto_solucion_descripcion: e.target.value })} />
              <input type="number" placeholder="Can." className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                value={formData.producto_solucion_cantidad} onChange={e => setFormData({ ...formData, producto_solucion_cantidad: parseInt(e.target.value) })} />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Observaciones Finales</label>
          <textarea 
            rows={2}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
            value={formData.observaciones}
            onChange={e => setFormData({ ...formData, observaciones: e.target.value })}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">
            CANCELAR
          </button>
          <button type="submit" disabled={loading}
            className="flex-[2] px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2">
            {loading ? 'ENVIANDO...' : <><Send className="w-4 h-4" /> ENVIAR REPORTE</>}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReportarProblemaForm;
