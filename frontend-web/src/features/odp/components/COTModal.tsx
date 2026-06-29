import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { X, Plus, Printer, FileText, DollarSign, ExternalLink } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import API from '../../../services/config';

interface COT {
  id: number;
  numero_cot: string;
  odp_id: number | null;
  cliente_id: number;
  valor_total: number;
  subtotal: number;
  descuento: number;
  base_gravable: number;
  iva: number;
  total_vidrio: number;
  total_acabados: number;
  total_gastos_instalacion: number;
  forma_pago: string;
  validez_dias: number;
  notas: string;
  estado: string;
  fecha_creacion: string;
  asesor?: { nombre_completo: string };
  cliente?: { nombre_razon_social: string };
}

interface Props { odp: any; onClose: () => void; }

const estadoColor: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  enviada: 'bg-blue-100 text-blue-700',
  aprobada: 'bg-emerald-100 text-emerald-700',
  rechazada: 'bg-rose-100 text-rose-700',
  vencida: 'bg-amber-100 text-amber-700',
  convertida: 'bg-purple-100 text-purple-700',
};

const COTModal: React.FC<Props> = ({ odp, onClose }) => {
  const navigate = useNavigate();
  const [cots, setCots] = useState<COT[]>([]);
  const [mode, setMode] = useState<'list' | 'view'>('list');
  const [selected, setSelected] = useState<COT | null>(null);

  const token = sessionStorage.getItem('token');

  useEffect(() => { fetchCOTs(); }, []);

  const fetchCOTs = async () => {
    try {
      const res = await axios.get(`${API}/api/documentos/cotizacion/odp/${odp.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setCots(res.data);
    } catch { setCots([]); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-slate-200">

        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl"><DollarSign className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">COT — Cotizaciones</h2>
              <p className="text-xs text-slate-500">{odp.numero_odp} · {odp.cliente?.nombre_razon_social}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {mode === 'list' && (
              <button onClick={() => { onClose(); navigate('/cotizaciones'); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition shadow-sm">
                <ExternalLink className="w-4 h-4" /> Gestionar en Cotizaciones
              </button>
            )}
            {mode === 'view' && (
              <button onClick={() => setMode('list')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                ← Volver
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* LISTADO */}
          {mode === 'list' && (
            <div className="p-6 space-y-4">
              {cots.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                  <p className="font-bold text-lg">Sin cotizaciones</p>
                  <p className="text-sm">Registra la cotización enviada al cliente para esta ODP.</p>
                </div>
              ) : cots.map(cot => (
                <div key={cot.id} className="border border-slate-200 rounded-xl p-5 hover:border-blue-200 transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-black text-blue-700 text-xl tracking-tight">{cot.numero_cot}</span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${estadoColor[cot.estado] || 'bg-slate-100'}`}>
                          {cot.estado.charAt(0).toUpperCase() + cot.estado.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">Asesor: {cot.asesor?.nombre_completo} · {new Date(cot.fecha_creacion).toLocaleDateString('es-CO')} · Válida por {cot.validez_dias} días</p>
                      <div className="flex gap-6 mt-3 flex-wrap">
                        {cot.total_vidrio > 0 && <div><p className="text-xs text-slate-400 font-bold uppercase">Vidrios</p><p className="text-base font-bold text-slate-700">{fmt(cot.total_vidrio)}</p></div>}
                        {cot.total_acabados > 0 && <div><p className="text-xs text-slate-400 font-bold uppercase">Acabados</p><p className="text-base font-bold text-slate-700">{fmt(cot.total_acabados)}</p></div>}
                        {cot.total_gastos_instalacion > 0 && <div><p className="text-xs text-slate-400 font-bold uppercase">Gastos Inst.</p><p className="text-base font-bold text-slate-700">{fmt(cot.total_gastos_instalacion)}</p></div>}
                        {cot.descuento > 0 && <div><p className="text-xs text-slate-400 font-bold uppercase">Descuento ({cot.descuento}%)</p><p className="text-base font-bold text-rose-600">-{fmt(cot.subtotal - cot.base_gravable)}</p></div>}
                        <div><p className="text-xs text-slate-400 font-bold uppercase">Total Neto</p><p className="text-2xl font-black text-emerald-700">{fmt(cot.valor_total)}</p></div>
                        <div><p className="text-xs text-slate-400 font-bold uppercase">Forma Pago</p><p className="text-base font-bold text-slate-700">{cot.forma_pago}</p></div>
                      </div>
                    </div>
                    <button onClick={() => { setSelected(cot); setMode('view'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-blue-200 text-blue-700 bg-white rounded-lg hover:bg-blue-50 transition">
                      <Printer className="w-3.5 h-3.5" /> Imprimir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VISTA IMPRIMIBLE */}
          {mode === 'view' && selected && (
            <div className="p-0">
              <div className="flex gap-3 p-4 border-b border-slate-100 print:hidden">
                <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-blue-700 border border-blue-200 rounded-xl bg-blue-50 hover:bg-blue-100 transition">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
              </div>

              <div id="cot-print-area" className="p-8 text-black text-sm font-sans">
                <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
                  <div>
                    <h1 className="text-3xl font-black uppercase tracking-widest">Vidrios Templex</h1>
                    <p className="text-sm font-bold text-gray-600 uppercase mt-1">Cotización Formal</p>
                  </div>
                  <div className="text-right border-l-4 border-black pl-6">
                    <div className="bg-black text-white px-4 py-2 mb-2 text-center">
                      <p className="text-xs font-bold uppercase">N° Cotización</p>
                      <p className="text-2xl font-black">{selected.numero_cot}</p>
                    </div>
                    <p className="text-xs font-bold">Fecha: {new Date(selected.fecha_creacion).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    <p className="text-xs font-bold">Válida por: {selected.validez_dias} días</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div className="border border-black p-4">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-3">Para:</p>
                    <p className="font-black text-lg">{odp.cliente?.nombre_razon_social}</p>
                    <p className="text-xs text-gray-600 mt-1">ODP Ref: {odp.numero_odp}</p>
                    {odp.direccion_instalacion && <p className="text-xs mt-1">{odp.direccion_instalacion}</p>}
                  </div>
                  <div className="border border-black p-4">
                    <p className="font-bold text-xs uppercase border-b border-gray-300 pb-1 mb-3">De parte de:</p>
                    <p className="font-bold">Asesor: {selected.asesor?.nombre_completo}</p>
                    <p className="text-xs mt-1">Forma de Pago: <strong>{selected.forma_pago}</strong></p>
                    {odp.descripcion_pedido && <p className="text-xs mt-2 text-gray-600">"{odp.descripcion_pedido}"</p>}
                  </div>
                </div>

                {/* Tabla de items de la ODP */}
                {odp.items && odp.items.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-bold bg-black text-white px-3 py-1.5 mb-0 uppercase text-xs tracking-wider">Descripción de la Oferta</h3>
                    <table className="w-full border-collapse border border-black text-xs">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border border-black p-1.5 text-left">#</th>
                          <th className="border border-black p-1.5 text-left">Descripción</th>
                          <th className="border border-black p-1.5 text-center">Cant.</th>
                          <th className="border border-black p-1.5">Tipo</th>
                          <th className="border border-black p-1.5 text-center">Ancho</th>
                          <th className="border border-black p-1.5 text-center">Alto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {odp.items.map((item: any, i: number) => (
                          <tr key={i}><td className="border border-black p-1.5 text-center font-bold">{i+1}</td>
                            <td className="border border-black p-1.5">{item.item || item.tipo_vidrio}</td>
                            <td className="border border-black p-1.5 text-center">{item.cantidad}</td>
                            <td className="border border-black p-1.5">{item.tipo_vidrio}</td>
                            <td className="border border-black p-1.5 text-center">{item.ancho_mm}mm</td>
                            <td className="border border-black p-1.5 text-center">{item.alto_mm}mm</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Resumen Financiero */}
                <div className="flex justify-end mb-6">
                  <div className="w-80">
                    <table className="w-full border-collapse border border-black text-sm">
                      <tbody>
                        {selected.total_vidrio > 0 && <tr><td className="border border-black p-2 font-bold">Total Vidrios</td><td className="border border-black p-2 text-right">{fmt(selected.total_vidrio)}</td></tr>}
                        {selected.total_acabados > 0 && <tr><td className="border border-black p-2 font-bold">Total Acabados</td><td className="border border-black p-2 text-right">{fmt(selected.total_acabados)}</td></tr>}
                        {selected.total_gastos_instalacion > 0 && <tr><td className="border border-black p-2 font-bold">Total Gastos Instalación</td><td className="border border-black p-2 text-right">{fmt(selected.total_gastos_instalacion)}</td></tr>}
                        <tr className="bg-gray-50"><td className="border border-black p-2 font-bold">Subtotal</td><td className="border border-black p-2 text-right">{fmt(selected.subtotal || selected.valor_total)}</td></tr>
                        {selected.descuento > 0 && <tr><td className="border border-black p-2 font-bold">Descuento ({selected.descuento}%)</td><td className="border border-black p-2 text-right text-rose-600">- {fmt((selected.subtotal || selected.valor_total) * selected.descuento / 100)}</td></tr>}
                        {selected.descuento > 0 && <tr><td className="border border-black p-2 font-bold">Base Gravable</td><td className="border border-black p-2 text-right">{fmt(selected.base_gravable || selected.valor_total)}</td></tr>}
                        <tr><td className="border border-black p-2 font-bold">IVA (19%)</td><td className="border border-black p-2 text-right">{fmt(selected.iva || 0)}</td></tr>
                        <tr className="bg-black text-white"><td className="border border-black p-3 font-black text-base uppercase">TOTAL NETO</td><td className="border border-black p-3 text-right font-black text-base">{fmt(selected.valor_total)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {selected.notas && (
                  <div className="border border-black p-4 mb-6">
                    <p className="font-bold text-xs uppercase mb-2">Notas y Condiciones:</p>
                    <p className="text-xs">{selected.notas}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-8 mt-10">
                  {['Asesor Comercial', 'Cliente / Aprobado por'].map(label => (
                    <div key={label} className="text-center text-xs">
                      <div className="border-t-2 border-black pt-2 mt-12"><p className="font-bold uppercase tracking-wider">{label}</p></div>
                    </div>
                  ))}
                </div>

                <div className="border-t-2 border-black pt-3 mt-8 flex justify-between text-[10px] text-gray-500">
                  <span>Vidrios Templex — Sistema Integral</span>
                  <span>{selected.numero_cot} · ODP {odp.numero_odp}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #cot-print-area, #cot-print-area * { visibility: visible; }
          #cot-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 15px; }
          @page { margin: 1cm; size: portrait; }
        }
      ` }} />
    </div>
  );
};

export default COTModal;
