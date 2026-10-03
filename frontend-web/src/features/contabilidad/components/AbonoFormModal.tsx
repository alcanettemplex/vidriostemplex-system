import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { DollarSign, Pencil, X, Search } from '../../../components/ui/icons';
import API from '../../../services/config';
import {
  headers, fmt, fmtFecha, formatMiles, parseMiles, calcPendiente, coincideODP,
  BANCOS_COLOMBIA, METODOS_PAGO,
} from './contabilidad.utils';

const MAX_OPCIONES = 50;

/**
 * Selector de ODP con búsqueda (por ODP, cliente, NIT, asesor o FE). Reemplaza al
 * <select> nativo, que obligaba a recorrer a ojo ~80 ODPs con pendiente.
 * Teclado: ↑/↓ para moverse, Enter para elegir, Esc para cerrar la lista.
 */
const SelectorODP: React.FC<{
  odps: any[];
  seleccionadaId: string;
  onSeleccionar: (id: string) => void;
}> = ({ odps, seleccionadaId, onSeleccionar }) => {
  const [termino, setTermino] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [resaltada, setResaltada] = useState(0);

  const seleccionada = odps.find(o => String(o.id) === seleccionadaId);
  const coincidencias = useMemo(() => odps.filter(o => coincideODP(o, termino)), [odps, termino]);
  const visibles = coincidencias.slice(0, MAX_OPCIONES);

  const elegir = (o: any) => {
    onSeleccionar(String(o.id));
    setTermino('');
    setAbierta(false);
  };

  if (seleccionada) {
    return (
      <div className="flex items-center justify-between gap-3 w-full border border-emerald-200 bg-emerald-50/40 rounded-xl px-4 py-3 text-[13px] text-slate-900 shadow-sm">
        <span className="min-w-0">
          <span className="font-bold text-emerald-800">{seleccionada.numero_odp}</span>
          {' — '}{seleccionada.cliente?.nombre_razon_social || '—'}
          <span className="block text-xs text-slate-700">Pendiente: {fmt(calcPendiente(seleccionada))}</span>
        </span>
        <button type="button" onClick={() => { onSeleccionar(''); setAbierta(true); }}
          className="text-xs font-semibold text-indigo-700 hover:underline whitespace-nowrap">Cambiar</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      <input
        type="text"
        value={termino}
        autoFocus
        onChange={e => { setTermino(e.target.value); setAbierta(true); setResaltada(0); }}
        onFocus={() => setAbierta(true)}
        onBlur={() => setTimeout(() => setAbierta(false), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAbierta(true); setResaltada(i => Math.min(i + 1, visibles.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setResaltada(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') {
            // Enter elige la ODP resaltada en vez de enviar el formulario sin ODP.
            e.preventDefault();
            if (abierta && visibles[resaltada]) elegir(visibles[resaltada]);
          } else if (e.key === 'Escape' && abierta) { e.stopPropagation(); setAbierta(false); }
        }}
        placeholder="Buscar ODP con pendiente: número, cliente, NIT o asesor…"
        aria-label="Buscar ODP con pendiente"
        className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
      />
      {abierta && (
        <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
          {visibles.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-700">
              {odps.length === 0
                ? 'No hay ODPs con saldo pendiente.'
                : `Ninguna ODP con saldo pendiente coincide con “${termino.trim()}”.`}
            </li>
          ) : visibles.map((o, i) => (
            <li key={o.id}>
              <button type="button"
                onMouseDown={e => { e.preventDefault(); elegir(o); }}
                onMouseEnter={() => setResaltada(i)}
                className={`w-full text-left px-4 py-2 text-[13px] ${i === resaltada ? 'bg-emerald-50' : 'bg-white'}`}>
                <span className="font-bold text-slate-900">{o.numero_odp}</span>
                {' — '}{o.cliente?.nombre_razon_social || '—'}
                <span className="block text-xs text-slate-700">
                  {o.cliente?.numero_documento && <>NIT {o.cliente.numero_documento} · </>}
                  Pendiente: <span className="font-semibold text-rose-700">{fmt(calcPendiente(o))}</span>
                </span>
              </button>
            </li>
          ))}
          {coincidencias.length > MAX_OPCIONES && (
            <li className="px-4 py-2 text-xs text-slate-600 italic">
              Mostrando {MAX_OPCIONES} de {coincidencias.length}: escribe más para afinar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

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
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${esEdicion ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
              {esEdicion
                ? <Pencil className="w-5 h-5 text-indigo-600" />
                : <DollarSign className="w-5 h-5 text-emerald-600" />}
            </div>
            {esEdicion ? 'Editar Pago' : 'Registrar Pago'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {esEdicion ? (
            <div className="w-full border border-slate-100 bg-slate-50/50 rounded-xl px-4 py-3 text-[13px] text-slate-800 leading-relaxed shadow-sm">
              ODP: <span className="font-bold text-indigo-700">{pago.odp?.numero_odp || `ODP-${pago.odp_id}`}</span>
              <span className="ml-3 text-slate-700">Original: {fmtFecha(pago.fecha)}</span>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">ODP *</label>
              {odpFija ? (
                <div className="w-full border border-indigo-100 bg-indigo-50/30 rounded-xl px-4 py-3.5 text-[13px] font-bold text-indigo-900 shadow-sm leading-relaxed">
                  {`${odpFija.numero_odp} — ${odpFija.cliente?.nombre_razon_social || ''} — Pendiente: ${fmt(calcPendiente(odpFija))}`}
                </div>
              ) : (
                <SelectorODP
                  odps={odpsDisponibles || []}
                  seleccionadaId={form.odp_id}
                  onSeleccionar={id => setForm(p => ({ ...p, odp_id: id }))}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Monto (COP) *</label>
              <input type="text" inputMode="numeric" value={form.monto}
                onChange={e => setForm(p => ({ ...p, monto: formatMiles(e.target.value) }))}
                placeholder="0" required
                className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
            </div>
            {esEdicion ? (
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
                <input type="date" value={form.fecha}
                  onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} required
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm" />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Diferencia (COP)</label>
                <input type="text" inputMode="numeric" value={form.diferencia}
                  onChange={e => setForm(p => ({ ...p, diferencia: formatMiles(e.target.value) }))}
                  placeholder="0"
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm" />
                <p className="text-[11px] text-slate-600 mt-1">Descuento adicional (no cuenta en abono estadístico)</p>
              </div>
            )}
          </div>

          {!esEdicion && (
            <div>
              <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Fecha Pago *</label>
              <input type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))}
                required
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Forma de Pago *</label>
            <select value={form.metodo_pago} onChange={e => setForm(p => ({ ...p, metodo_pago: e.target.value, banco: '' }))}
              className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`}>
              {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Banco *</label>
            <select value={form.banco} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))}
              required={requiereBanco} disabled={!requiereBanco}
              className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'} ${!requiereBanco ? 'bg-slate-50 opacity-50' : ''}`}>
              <option value="">-- Seleccionar banco --</option>
              {BANCOS_COLOMBIA.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Recibo No.</label>
            <input value={form.referencia_pago} onChange={e => setForm(p => ({ ...p, referencia_pago: e.target.value }))}
              placeholder="Número de recibo o comprobante"
              className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-1.5 uppercase tracking-wider">Observaciones</label>
            <textarea value={form.observaciones} onChange={e => setForm(p => ({ ...p, observaciones: e.target.value }))}
              placeholder="Notas adicionales..." rows={2}
              className={`w-full border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 resize-none shadow-sm ${esEdicion ? 'focus:ring-indigo-500' : 'focus:ring-emerald-500'}`} />
          </div>

          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 py-3.5 font-semibold text-slate-800 bg-white border border-slate-300 rounded-2xl hover:bg-slate-50 transition shadow-sm">Cancelar</button>
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
