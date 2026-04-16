import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, FileCheck } from 'lucide-react';

interface SeleccionarTipoODPModalProps {
  onConfirm: (tipo: 'ODP' | 'OA') => void;
  onCancel: () => void;
}

const SeleccionarTipoODPModal: React.FC<SeleccionarTipoODPModalProps> = ({ onConfirm, onCancel }) => {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-800">Tipo de Orden</h2>
            <button onClick={onCancel} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-sm font-semibold text-slate-600">¿Qué tipo de orden vas a crear?</p>

            <div className="grid grid-cols-2 gap-3">
              {/* ODP normal */}
              <button
                onClick={() => onConfirm('ODP')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-slate-200 text-slate-600
                  hover:border-blue-400 hover:bg-blue-50/60 hover:text-blue-700 transition font-semibold text-sm"
              >
                <FileText className="w-7 h-7" />
                <span>ODP</span>
                <span className="text-[10px] font-normal text-slate-400 text-center leading-tight">
                  Incluye IVA · Factura electrónica
                </span>
              </button>

              {/* OA — sin IVA */}
              <button
                onClick={() => onConfirm('OA')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-slate-200 text-slate-600
                  hover:border-indigo-400 hover:bg-indigo-50/60 hover:text-indigo-700 transition font-semibold text-sm"
              >
                <FileCheck className="w-7 h-7" />
                <span>ODP sin IVA (OA)</span>
                <span className="text-[10px] font-normal text-slate-400 text-center leading-tight">
                  Sin IVA · Sin factura electrónica
                </span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancelar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default SeleccionarTipoODPModal;
