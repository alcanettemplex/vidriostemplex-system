import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Trash2 } from 'lucide-react';
import API from '../../../services/config';
import { headers, fmt } from './contabilidad.utils';

interface Props {
  pago: any;
  onClose: () => void;
  /** Se dispara tras eliminar correctamente. El consumidor decide qué refresca.
   *  Opcional: desde la ficha de la ODP el refresco llega por el evento socket odp_patch. */
  onDeleted?: () => void;
  /** Número de ODP a mostrar cuando el pago no trae la relación (caso ficha ODP). */
  numeroOdp?: string;
}

/**
 * Confirmación de borrado de un abono. El backend recalcula el financiero de la ODP
 * (abono, pendiente y estado_caja) dentro de la misma transacción.
 * Endpoint: DELETE /contabilidad/pagos/:id
 */
const ConfirmarEliminarAbonoModal: React.FC<Props> = ({ pago, onClose, onDeleted, numeroOdp }) => {
  const [submitting, setSubmitting] = useState(false);
  const etiquetaOdp = pago.odp?.numero_odp || numeroOdp || `ODP-${pago.odp_id}`;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await axios.delete(`${API}/api/contabilidad/pagos/${pago.id}`, { headers: headers() });
      toast.success('Pago eliminado. El estado de la ODP fue recalculado.');
      onDeleted?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Error al eliminar pago');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-rose-50 rounded-2xl flex-shrink-0">
            <Trash2 className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg">¿Eliminar este pago?</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Pago de <span className="font-bold text-slate-800">{fmt(Number(pago.monto))}</span> en{' '}
              <span className="font-bold text-indigo-700">{etiquetaOdp}</span>.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
          Esta acción es irreversible y el saldo pendiente de la ODP será recalculado automáticamente.
        </p>
        <div className="flex gap-4">
          <button onClick={onClose}
            className="flex-1 py-3 font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            No, cancelar
          </button>
          <button onClick={handleDelete} disabled={submitting}
            className="flex-1 py-3 font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition shadow-lg shadow-rose-200 disabled:opacity-50">
            {submitting ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ConfirmarEliminarAbonoModal;
