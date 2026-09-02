import React, { useState } from 'react';
import { PackageCheck, AlertTriangle } from 'lucide-react';

/**
 * Confirmación del cierre administrativo de una instalación que quedó sin cerrar.
 *
 * A diferencia del cierre normal —que hace el instalador con foto y firma del receptor—
 * este camino no deja evidencia. El motivo obligatorio es su única trazabilidad: queda
 * en `historial_estados_odp` junto al usuario que cerró. Por eso el backend rechaza
 * cualquier motivo de menos de 5 caracteres, y aquí se valida igual antes de enviar.
 */
const CerrarAtascadaModal: React.FC<{
  numeroOdp: string;
  cliente?: string | null;
  guardando?: boolean;
  onCancelar: () => void;
  onConfirmar: (motivo: string) => void;
}> = ({ numeroOdp, cliente, guardando = false, onCancelar, onConfirmar }) => {
  const [motivo, setMotivo] = useState('');
  const valido = motivo.trim().length >= 5;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <PackageCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-800 text-sm">Marcar como entregada</p>
            <p className="text-xs text-slate-400 truncate">{numeroOdp}{cliente ? ` — ${cliente}` : ''}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <span>
            Cierre administrativo <b>sin evidencia fotográfica</b>. Úsalo solo si la instalación
            realmente se realizó y el instalador no la registró en la app.
          </span>
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
            Motivo del cierre *
          </label>
          <textarea
            rows={3}
            autoFocus
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. Instalada el 12/06, el instalador no cerró en la app. Confirmado con el cliente."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
          />
          <p className="text-[10px] text-slate-400 mt-1">
            Queda registrado en el historial de la ODP con tu usuario.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            disabled={guardando}
            className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-xl hover:bg-slate-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => valido && onConfirmar(motivo.trim())}
            disabled={!valido || guardando}
            className="flex-1 py-2.5 bg-emerald-600 text-white font-semibold text-sm rounded-xl hover:bg-emerald-700 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CerrarAtascadaModal;
