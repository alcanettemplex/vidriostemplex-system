import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { apiUpdateLeadStatus } from '../crmService';

const MOTIVOS_PERDIDA = [
  'Precio muy alto',
  'Eligió a la competencia',
  'No tenía presupuesto',
  'Proyecto cancelado',
  'No respondió (ghosting total)',
  'No era el producto correcto',
  'Lead duplicado',
  'Otro motivo',
];

interface Props {
  leadId: number;
  leadNombre: string;
  onClose: () => void;
  onConfirm: (leadActualizado: any) => void;
}

const MotivoPerdidaModal: React.FC<Props> = ({ leadId, leadNombre, onClose, onConfirm }) => {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) {
      toast.warning('Debes seleccionar o escribir un motivo de pérdida.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiUpdateLeadStatus(leadId, 'PERDIDO', motivo);
      toast.error(`Lead "${leadNombre}" marcado como Perdido.`);
      onConfirm(data);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al marcar como perdido.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-rose-50 border-b border-rose-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h2 className="font-black text-slate-800 text-base">Motivo de Pérdida</h2>
              <p className="text-xs text-slate-500">Requerido para auditoría interna</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Lead</p>
            <p className="font-bold text-slate-800">{leadNombre}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">Motivo Oficial *</label>
            <select
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-medium text-slate-700 focus:outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-200 transition-all"
            >
              <option value="">Selecciona un motivo...</option>
              {MOTIVOS_PERDIDA.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || !motivo}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : 'Confirmar Pérdida'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MotivoPerdidaModal;
