import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Banknote, X, Plus, Pencil, Trash2, Clock } from 'lucide-react';
import AbonoFormModal from './AbonoFormModal';
import ConfirmarEliminarAbonoModal from './ConfirmarEliminarAbonoModal';
import { fmt, fmtFecha, calcPendiente } from './contabilidad.utils';

interface Props {
  /** ODP con sus pagos ya cargados (los trae GET /api/odp/:id). */
  odp: any;
  onClose: () => void;
  /** Se dispara tras registrar, editar o eliminar un abono. Opcional: en la ficha de la
   *  ODP el refresco llega por el evento socket odp_patch, que recarga la ODP completa. */
  onChanged?: () => void;
  /** Habilita el alta de nuevos abonos (falso si la caja ya está CANCELADA). */
  puedeRegistrar?: boolean;
}

/**
 * Listado de abonos de una ODP con su CRUD, para usarse desde la ficha de la ODP.
 * Es el equivalente acotado de la tab "Pagos Recientes" de Contabilidad: mismos
 * endpoints y mismos modales, filtrado a una sola ODP.
 */
const AbonosODPModal: React.FC<Props> = ({ odp, onClose, onChanged, puedeRegistrar = true }) => {
  const [nuevoAbono, setNuevoAbono] = useState(false);
  const [pagoEnEdicion, setPagoEnEdicion] = useState<any | null>(null);
  const [pagoAEliminar, setPagoAEliminar] = useState<any | null>(null);

  const pagos: any[] = odp?.pagos || [];
  const abonado = Number(odp?.abono) || 0;
  const pendiente = calcPendiente(odp);

  return (
    <>
      <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 max-h-[90vh] flex flex-col">

          <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <Banknote className="w-5 h-5 text-emerald-600" />
              </div>
              Abonos · <span className="text-indigo-700">{odp?.numero_odp}</span>
            </h2>
            <div className="flex items-center gap-2">
              {puedeRegistrar && (
                <button onClick={() => setNuevoAbono(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition shadow-sm">
                  <Plus className="w-3.5 h-3.5" /> Registrar Abono
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {pagos.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-bold">Esta ODP no tiene abonos registrados</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    {['Fecha', 'Monto', 'Banco / Método', 'Recibo No.', 'Observaciones', 'Registrado por', ''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagos.map((pago: any) => (
                    <tr key={pago.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {fmtFecha(pago.fecha)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">{fmt(Number(pago.monto) || 0)}</td>
                      <td className="px-4 py-3 text-slate-700 capitalize text-xs">{pago.metodo_pago}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{pago.referencia_pago || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[180px] truncate" title={pago.observaciones || ''}>{pago.observaciones || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">{pago.registrador?.nombre_completo || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setPagoEnEdicion(pago)} title="Editar pago"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setPagoAEliminar(pago)} title="Eliminar pago"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-6 px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
            <div className="text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Valor Total</p>
              <p className="text-sm font-black text-slate-700">{fmt(Number(odp?.valor_total) || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Abonado</p>
              <p className="text-sm font-black text-emerald-700">{fmt(abonado)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Pendiente</p>
              <p className={`text-sm font-black ${pendiente > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{fmt(pendiente)}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {nuevoAbono && (
        <AbonoFormModal
          odpFija={odp}
          onClose={() => setNuevoAbono(false)}
          onSaved={onChanged}
        />
      )}

      {pagoEnEdicion && (
        <AbonoFormModal
          pago={{ ...pagoEnEdicion, odp: { numero_odp: odp?.numero_odp }, odp_id: odp?.id }}
          onClose={() => setPagoEnEdicion(null)}
          onSaved={onChanged}
        />
      )}

      {pagoAEliminar && (
        <ConfirmarEliminarAbonoModal
          pago={pagoAEliminar}
          numeroOdp={odp?.numero_odp}
          onClose={() => setPagoAEliminar(null)}
          onDeleted={onChanged}
        />
      )}
    </>
  );
};

export default AbonosODPModal;
