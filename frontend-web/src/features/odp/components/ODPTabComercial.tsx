import React, { useState } from 'react';
import { Package, Plus, DollarSign, CheckCircle2, ExternalLink, Images, Camera, Trash2 } from 'lucide-react';
import { Badge, normalizarItemLabel, fmt } from './ODPFichaModal.utils';
import SAPModal from './SAPModal';
import CotizacionCapturas from './CotizacionCapturas';
import API from '../../../services/config';
import axios from 'axios';

const estadoCotColor: Record<string, string> = {
  enviada: 'bg-blue-100 text-blue-700 border-blue-200',
  aprobada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rechazada: 'bg-rose-100 text-rose-700 border-rose-200',
  vencida: 'bg-slate-100 text-slate-600 border-slate-200',
};

const TabComercial: React.FC<{ odp: any; onRefresh: () => void }> = ({ odp, onRefresh }) => {
  const [sapModalOpen, setSapModalOpen] = useState(false);
  const saps = odp.saps || [];
  const cots = odp.cotizaciones || [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-600" /> Solicitudes de Accesorios y Perfilería (SAP)
          </h3>
          {saps.length === 0 ? (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Gestionar SAP
            </button>
          ) : (
            <button
              onClick={() => setSapModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <Package className="w-3.5 h-3.5" /> Ver SAP
            </button>
          )}
        </div>
        {saps.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay SAPs registradas</p>
          </div>
        ) : saps.map((sap: any) => (
          <div key={sap.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-3 shadow-sm">
            <div className="flex justify-between items-center px-5 py-3 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="font-black text-indigo-700 text-lg">{sap.numero_sap}</span>
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{sap.estado}</Badge>
              </div>
              <p className="text-xs text-slate-500">{sap.asesor?.nombre_completo} · {new Date(sap.fecha_creacion).toLocaleDateString('es-CO')}</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="px-3 py-1.5 text-center w-10">ITEM</th>
                  <th className="px-3 py-1.5 w-28">CÓDIGO</th>
                  <th className="px-3 py-1.5">DESCRIPCIÓN</th>
                  <th className="px-3 py-1.5 w-24">DIMENSIÓN</th>
                  <th className="px-3 py-1.5 text-center w-16">CANT.</th>
                  <th className="px-3 py-1.5 w-32">OBSERV.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...(sap.items || [])].sort((a: any, b: any) => {
                  const toIdx = (it: string) => {
                    if (/^[A-Z]$/.test(it)) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(it);
                    const n = parseInt(it, 10);
                    return isNaN(n) ? 9999 : n - 1;
                  };
                  return toIdx(a.item) - toIdx(b.item);
                }).map((item: any, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-3 py-1.5 text-center font-black text-slate-600">{normalizarItemLabel(item.item)}</td>
                    <td className="px-3 py-1.5 font-mono text-blue-700 font-bold">{item.codigo || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-700">{item.descripcion || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">{item.dimension || '—'}</td>
                    <td className="px-3 py-1.5 text-center font-bold">{Number(item.cantidad) % 1 === 0 ? Math.round(Number(item.cantidad)) : item.cantidad}</td>
                    <td className="px-3 py-1.5 text-slate-400 text-[10px] max-w-[120px] truncate" title={item.observacion || ''}>{item.observacion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sap.notas && <p className="px-5 py-2 text-xs text-slate-500 italic border-t border-slate-100">"{sap.notas}"</p>}
          </div>
        ))}
      </div>

      {sapModalOpen && (
        <SAPModal
          odp={odp}
          onClose={() => { setSapModalOpen(false); onRefresh(); }}
        />
      )}

      <CotizacionCapturas odp_id={odp.id} numeroCotizacion={odp.numero_cotizacion || ''} onRefresh={onRefresh} />

      <div>
        <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-600" /> Cotizaciones (COT)
        </h3>
        {cots.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 text-slate-200" />
            <p className="font-bold">No hay cotizaciones registradas</p>
          </div>
        ) : cots.map((cot: any) => (
            <div key={cot.id} className="bg-white border border-slate-200 rounded-2xl p-5 mb-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-black text-blue-700 text-lg">{cot.numero_cot}</span>
                    <Badge className={estadoCotColor[cot.estado] || 'bg-slate-100 text-slate-600 border-slate-200'}>{cot.estado}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{cot.asesor?.nombre_completo} · {new Date(cot.fecha_creacion).toLocaleDateString('es-CO')} · Válida {cot.validez_dias} días</p>
                  {cot.descuento > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      Subtotal: {fmt(cot.subtotal || cot.valor_total)} — Descuento {cot.descuento}% — IVA: {fmt(cot.iva || 0)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-slate-900">{fmt(cot.valor_total)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">TOTAL NETO</p>
                  <p className="text-xs font-bold text-slate-600 mt-0.5">{cot.forma_pago}</p>
                </div>
              </div>
              {cot.notas && <p className="text-xs text-slate-500 italic mt-2 pt-2 border-t border-slate-100">"{cot.notas}"</p>}
            </div>
          ))}
      </div>
    </div>
  );
};

export default TabComercial;
