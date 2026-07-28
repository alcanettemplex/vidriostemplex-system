import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { FileCheck, X, Plus, Trash2 } from 'lucide-react';
import API from '../../../services/config';
import { headers, fmt, fmtFecha, formatMiles, parseMiles } from './contabilidad.utils';

interface Props {
  /** ODP objetivo. Requiere: id, numero_odp, valor_total, factura_electronica,
   *  fecha_factura, monto_factura_principal, facturas_adicionales. */
  odp: any;
  onClose: () => void;
  /** Se dispara al guardar la FE principal, con los campos ya persistidos. */
  onSaved?: (patch: {
    id: number;
    estado_facturacion: string;
    factura_electronica: string;
    fecha_factura: string;
    monto_factura_principal: number;
  }) => void;
  /** Se dispara al agregar o eliminar una factura adicional. */
  onAdicionalesChange?: (odpId: number, facturas: any[]) => void;
}

/**
 * Modal de facturación electrónica de una ODP: FE principal (número, fecha, monto),
 * contador de saldo por facturar y CRUD de las FE adicionales (2ª y 3ª).
 *
 * Extraído de ContabilidadPage para reutilizarse desde la ficha de la ODP.
 * Endpoints: PATCH /odp/:id/facturar · POST|DELETE /odp/:id/facturas-adicionales
 */
const FacturaElectronicaModal: React.FC<Props> = ({ odp, onClose, onSaved, onAdicionalesChange }) => {
  const odpId: number = odp.id;
  const valorTotal = Number(odp.valor_total) || 0;
  // Si la ODP ya tenía FE al abrir, se habilita la sección de facturas adicionales.
  const [yaFacturada] = useState<boolean>(!!odp.factura_electronica);

  const [feForm, setFeForm] = useState({
    numero_fe: odp.factura_electronica || '',
    fecha_fe: odp.fecha_factura ? String(odp.fecha_factura).split('T')[0] : new Date().toISOString().split('T')[0],
    // Monto de la FE principal: precargado con lo ya facturado o, si es nueva, el valor_total.
    monto: formatMiles(Math.round(Number(odp.monto_factura_principal != null ? odp.monto_factura_principal : valorTotal))),
  });
  const [feAdicionales, setFeAdicionales] = useState<any[]>(odp.facturas_adicionales || []);
  const [nuevaAdic, setNuevaAdic] = useState({ numero_fe: '', fecha_fe: '', monto: '' });
  const [addingAdic, setAddingAdic] = useState(false);
  const [submittingFe, setSubmittingFe] = useState(false);

  const handleAddAdicional = async () => {
    if (!nuevaAdic.numero_fe.trim()) { toast.error('Ingresa el número de la factura adicional'); return; }
    const montoAdic = parseMiles(nuevaAdic.monto);
    if (!montoAdic || montoAdic <= 0) { toast.error('Ingresa el monto de la factura adicional'); return; }
    setAddingAdic(true);
    try {
      const res = await axios.post(`${API}/api/odp/${odpId}/facturas-adicionales`, {
        numero_fe: nuevaAdic.numero_fe.trim(),
        monto: montoAdic,
        ...(nuevaAdic.fecha_fe ? { fecha_factura: nuevaAdic.fecha_fe } : {}),
      }, { headers: headers() });
      const nuevaLista = [...feAdicionales, res.data];
      setFeAdicionales(nuevaLista);
      onAdicionalesChange?.(odpId, nuevaLista);
      setNuevaAdic({ numero_fe: '', fecha_fe: '', monto: '' });
      toast.success('Factura adicional agregada');
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al agregar la factura'); }
    finally { setAddingAdic(false); }
  };

  const handleDeleteAdicional = async (facturaId: number) => {
    try {
      await axios.delete(`${API}/api/odp/${odpId}/facturas-adicionales/${facturaId}`, { headers: headers() });
      const nuevaLista = feAdicionales.filter(f => f.id !== facturaId);
      setFeAdicionales(nuevaLista);
      onAdicionalesChange?.(odpId, nuevaLista);
      toast.success('Factura adicional eliminada');
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al eliminar'); }
  };

  const handleFeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feForm.numero_fe.trim()) { toast.error('Ingresa el número de factura electrónica'); return; }
    if (!feForm.fecha_fe) { toast.error('Ingresa la fecha de la factura'); return; }
    const montoFe = parseMiles(feForm.monto);
    if (!montoFe || montoFe <= 0) { toast.error('Ingresa un monto de factura válido'); return; }
    setSubmittingFe(true);
    try {
      await axios.patch(`${API}/api/odp/${odpId}/facturar`, {
        estado_facturacion: 'FACTURADA',
        factura_electronica: feForm.numero_fe.trim(),
        fecha_factura: feForm.fecha_fe,
        monto_factura: montoFe,
      }, { headers: headers() });
      onSaved?.({
        id: odpId,
        estado_facturacion: 'FACTURADA',
        factura_electronica: feForm.numero_fe.trim(),
        fecha_factura: feForm.fecha_fe,
        monto_factura_principal: montoFe,
      });
      toast.success('Factura registrada correctamente');
      onClose();
    } catch (e: any) { toast.error(e.response?.data?.error || 'Error al registrar factura'); }
    finally { setSubmittingFe(false); }
  };

  const sumAdicionales = feAdicionales.reduce((s: number, f: any) => s + (Number(f.monto) || 0), 0);
  const saldoRestante = valorTotal - parseMiles(feForm.monto) - sumAdicionales;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-emerald-600" /> Factura Electrónica
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleFeSubmit} className="p-6 space-y-4">
          <p className="text-sm text-slate-600">ODP: <span className="font-bold text-indigo-700">{odp.numero_odp}</span></p>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">FE No. *</label>
            <input value={feForm.numero_fe} onChange={e => setFeForm(p => ({ ...p, numero_fe: e.target.value }))}
              placeholder="Ej: 2024-001" required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Fecha Factura *</label>
            <input type="date" value={feForm.fecha_fe} onChange={e => setFeForm(p => ({ ...p, fecha_fe: e.target.value }))}
              required className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase">Monto facturado *</label>
            <input type="text" inputMode="numeric" value={feForm.monto}
              onChange={e => setFeForm(p => ({ ...p, monto: formatMiles(e.target.value) }))} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <p className="text-[11px] text-slate-500 mt-1">Valor total de la ODP: <span className="font-semibold">{fmt(valorTotal)}</span></p>
          </div>

          {/* Contador de saldo restante por facturar (valor_total − principal − adicionales) */}
          <div className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between border ${saldoRestante < -0.01 ? 'bg-rose-50 border-rose-200 text-rose-700' : saldoRestante > 0.01 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            <span className="font-semibold uppercase text-[11px] tracking-wide">Saldo por facturar</span>
            <span className="font-bold">{fmt(saldoRestante)}</span>
          </div>

          {/* Facturas electrónicas adicionales (solo si la ODP ya tiene FE principal) */}
          {yaFacturada && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-600 uppercase">Facturas adicionales</label>
                <span className="text-[10px] text-slate-400">{feAdicionales.length}/2 · máx. 3 FE por ODP</span>
              </div>

              {feAdicionales.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {feAdicionales.map((f: any) => (
                    <div key={f.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold text-emerald-700">FE-{f.numero_fe}</span>
                        {f.fecha_factura && <span className="text-[11px] text-slate-400">{fmtFecha(f.fecha_factura)}</span>}
                        <span className="text-[11px] font-semibold text-slate-600">{fmt(Number(f.monto) || 0)}</span>
                      </div>
                      <button type="button" onClick={() => handleDeleteAdicional(f.id)}
                        title="Eliminar factura adicional"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {feAdicionales.length < 2 ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[110px]">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase">FE No.</label>
                    <input value={nuevaAdic.numero_fe} onChange={e => setNuevaAdic(p => ({ ...p, numero_fe: e.target.value }))}
                      placeholder="Ej: 2024-002"
                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="w-28">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase">Fecha</label>
                    <input type="date" value={nuevaAdic.fecha_fe} onChange={e => setNuevaAdic(p => ({ ...p, fecha_fe: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div className="w-24">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase">Monto</label>
                    <input type="text" inputMode="numeric" value={nuevaAdic.monto}
                      onChange={e => setNuevaAdic(p => ({ ...p, monto: formatMiles(e.target.value) }))} placeholder="0"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <button type="button" onClick={handleAddAdicional} disabled={addingAdic}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition disabled:opacity-50">
                    <Plus className="w-3.5 h-3.5" /> Agregar
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Límite alcanzado (3 facturas en total).</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">Cancelar</button>
            <button type="submit" disabled={submittingFe}
              className="flex-1 py-2.5 font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-200 disabled:opacity-50">
              {submittingFe ? 'Guardando...' : 'Guardar Factura'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default FacturaElectronicaModal;
