import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { DollarSign, Pencil, X } from 'lucide-react';
import API from '../../../services/config';
import {
  headers, fmt, fmtFecha, formatMiles, parseMiles, calcPendiente,
  BANCOS_COLOMBIA, METODOS_PAGO,
} from './contabilidad.utils';

interface Props {
  /** Si viene, el modal opera en modo EDICIÓN sobre ese pago. */
  pago?: any | null;
  /** ODP objetivo en modo creación cuando ya se sabe cuál es (no se muestra el select). */
  odpFija?: any | null;
  /** Lista de ODPs con pendiente, para el select en modo creación sin ODP fija. */
  odpsDisponibles?: any[];
  onClose: () => void;
  /** Se dispara tras crear o editar correctamente. El consumidor decide qué refresca.
   *  Opcional: desde la ficha de la ODP el refresco llega por el evento socket odp_patch. */
  onSaved?: () => void;
}

/**
 * Modal de abono: registra un pago nuevo o edita uno existente.
 *
 * Extraído de ContabilidadPage (donde vivían dos modales casi idénticos) para
 * reutilizarse desde la ficha de la ODP.
 * Endpoints: POST /contabilidad/pagos · PUT /contabilidad/pagos/:id
 */
const AbonoFormModal: React.FC<Props> = ({ pago, odpFija, odpsDisponibles, onClose, onSaved }) => {
  const esEdicion = !!pago;
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(() => {
    if (pago) {
      // En BD el método guardado es el banco cuando fue transferencia; se revierte al abrir.
      const esBanco = BANCOS_COLOMBIA.includes(pago.metodo_pago);
      return {
        odp_id: String(pago.odp_id ?? ''),
        monto: formatMiles(Math.round(Number(pago.monto) || 0)),
        diferencia: '0',
        metodo_pago: esBanco ? 'Transferencia' : pago.metodo_pago,
        banco: esBanco ? pago.metodo_pago : '',
        referencia_pago: pago.referencia_pago || '',
        observaciones: pago.observaciones || '',
        fecha: pago.fecha ? new Date(pago.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      };
    }
    return {
      odp_id: odpFija ? String(odpFija.id) : '',
      monto: '',
      diferencia: '0',
      metodo_pago: 'Transferencia',
      banco: '',
      referencia_pago: '',
      observaciones: '',
      fecha: new Date().toISOString().split('T')[0],
    };
  });

  const requiereBanco = form.metodo_pago === 'Transferencia';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!esEdicion && !form.odp_id) { toast.error('Selecciona una ODP y un monto válido.'); return; }
    if (!form.monto || parseMiles(form.monto) <= 0) {
      toast.error(esEdicion ? 'Ingresa un monto válido' : 'Selecciona una ODP y un monto válido.'); return;
    }
    if (requiereBanco && !form.banco) {
      toast.error(esEdicion ? 'Selecciona el banco' : 'Selecciona el banco para transferencias.'); return;
    }
    setSubmitting(true);
    try {
      const metodo = requiereBanco ? form.banco : form.metodo_pago;
      if (esEdicion) {
        await axios.put(`${API}/api/contabilidad/pagos/${pago.id}`, {
          monto: parseMiles(form.monto),
          metodo_pago: metodo,
          referencia_pago: form.referencia_pago || null,
          observaciones: form.observaciones || null,
          fecha: form.fecha || null,
        }, { headers: headers() });
        toast.success('Pago actualizado correctamente');
      } else {
        await axios.post(`${API}/api/contabilidad/pagos`, {
          odp_id: Number(form.odp_id),
          monto: parseMiles(form.monto),
          diferencia: parseMiles(form.diferencia) || 0,
          metodo_pago: metodo,
          referencia_pago: form.referencia_pago || undefined,
          observaciones: form.observaciones || undefined,
          fecha: form.fecha || undefined,
        }, { headers: headers() });
        toast.success('Pago registrado correctamente');
      }
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || (esEdicion ? 'Error al editar pago' : 'Error al registrar pago'));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${esEdicion ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
              {esEdicion
                ? <Pencil className="w-5 h-5 text-indigo-600" />
                : <DollarSign className="w-5 h-5 text-emerald-600" />}
            </div>
            {esEdicion ? 'Editar Pago' : 'Registrar Pago'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {esEdicion ? (
            <div className="w-full border border-slate-100 bg-slate-50/50 rounded-xl px-4 py-3 text-[13px] font-bold text-slate-700 leading-relaxed shadow-sm">
              ODP: <span className="text-indigo-700">{pago.odp?.numero_odp || `ODP-${pago.odp_id}`}</span>
              <span className="ml-3 text-slate-400 font-medium">Original: {fmtFecha(pago.fecha)}</span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">ODP *</label>
              {odpFija ? (
                <div className="w-full border border-indigo-100 bg-indigo-50/30 rounded-xl px-4 py-3.5 text-[13px] font-bold text-indigo-900 shadow-sm leading-relaxed">
                  {`${odpFija.numero_odp} — ${odpFija.cliente?.nombre_razon_social || ''} — Pendiente: ${fmt(calcPendiente(odpFija))}`}
                </div>
              ) : (
                <select value={form.odp_id} onChange={e => setForm(p => ({ ...p, odp_id: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm">
                  <option value="">-- Seleccionar ODP con pendiente --</option>
                  {(odpsDisponibles || []).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_odp} — {o.cliente?.nombre_razon_social} — Pendiente: {fmt(calcPendiente(o))}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Monto (COP) *</label>
              <input type="text" inputMode="numeric" value={form.monto}
                onChange={e => setForm(p => ({ ...p, monto: formatMiles(e.target.value) }))}
                placeholder="0" required
                className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
            </div>
            {esEdicion ? (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
                <input type="date" value={form.fecha}
                  onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Diferencia (COP)</label>
                <input type="text" inputMode="numeric" value={form.diferencia}
                  onChange={e => setForm(p => ({ ...p, diferencia: formatMiles(e.target.value) }))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm" />
                <p className="text-[10px] text-slate-400 mt-1">Descuento adicional (no cuenta en abono estadístico)</p>
              </div>
            )}
          </div>

          {!esEdicion && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
              <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                required
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Forma de Pago *</label>
            <select value={form.metodo_pago} onChange={e => setForm(p => ({ ...p, metodo_pago: e.target.value, banco: '' }))}
              className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`}>
              {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Banco *</label>
            <select value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))}
              required={requiereBanco} disabled={!requiereBanco}
              className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'} ${!requiereBanco ? 'bg-slate-50 opacity-50' : ''}`}>
              <option value="">-- Seleccionar banco --</option>
              {BANCOS_COLOMBIA.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Recibo No.</label>
            <input value={form.referencia_pago} onChange={e => setForm(p => ({ ...p, referencia_pago: e.target.value }))}
              placeholder="Número de recibo o comprobante"
              className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))}
              placeholder="Notas adicionales..." rows={2}
              className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 py-3.5 font-bold text-slate-600 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
            <button type="submit" disabled={submitting}
              className={`flex-1 py-3.5 font-bold text-white rounded-2xl transition shadow-lg disabled:opacity-50 ${esEdicion ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}>
              {submitting ? 'Guardando...' : esEdicion ? 'Guardar Cambios' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AbonoFormModal;
