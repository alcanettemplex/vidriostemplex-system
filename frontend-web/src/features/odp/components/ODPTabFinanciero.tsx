import React from 'react';
import { InfoRow, Badge, cajaColor, fmt } from './ODPFichaModal.utils';
import { CreditCard, ExternalLink, AlertCircle, CheckCircle2, TrendingUp } from 'lucide-react';

const TabFinanciero: React.FC<{ odp: any }> = ({ odp }) => {
  const valorTotal = Number(odp.valor_total) || 0;
  const abono = Number(odp.abono) || 0;
  const pendiente = Number(odp.pendiente) || 0;
  const pctCobrado = valorTotal > 0 ? Math.min(100, (abono / valorTotal) * 100) : (abono > 0 ? 100 : 0);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Valor Total ODP', value: fmt(valorTotal), color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'Abonado', value: fmt(abono), color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Por Cobrar', value: fmt(pendiente), color: pendiente > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'Estado Caja', value: odp.estado_caja?.replace(/_/g, ' '), color: cajaColor[odp.estado_caja] || 'bg-slate-100' },
        ].map((k, i) => (
          <div key={i} className={`border rounded-2xl p-5 ${k.color}`}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-70 mb-1">{k.label}</p>
            <p className="text-xl font-black leading-none">{k.value}</p>
          </div>
        ))}
      </div>

      {valorTotal > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Progreso de Cobro</p>
            <p className="text-sm font-black text-slate-700">{pctCobrado.toFixed(0)}%</p>
          </div>
          <div className="bg-slate-100 rounded-full h-3">
            <div className={`h-3 rounded-full transition-all duration-700 ${pctCobrado === 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${pctCobrado}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 font-bold">
            <span>$0</span><span>{fmt(valorTotal)}</span>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><CreditCard className="w-3.5 h-3.5" />Facturación Electrónica</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Estado Facturación" value={<Badge className={odp.estado_facturacion === 'FACTURADA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>{odp.estado_facturacion}</Badge>} />
          <InfoRow label="N° Factura Electrónica" value={odp.factura_electronica ? <span className="font-mono font-bold text-emerald-700">#{odp.factura_electronica}</span> : <span className="text-slate-400 text-xs italic">No emitida</span>} />
          <InfoRow label="Forma de Pago ODP" value={odp.forma_pago} />
          {odp.autorizacion_especial_despacho && <InfoRow label="Autorización Especial" value={<Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertCircle className="w-3 h-3" />Sí</Badge>} />}
          {odp.facturas_adicionales?.length > 0 && (
            <div className="col-span-2">
              <InfoRow label="Facturas Adicionales" value={
                <div className="flex flex-wrap gap-1.5">
                  {odp.facturas_adicionales.map((f: any) => (
                    <span key={f.id} className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-xs">
                      #{f.numero_fe}
                    </span>
                  ))}
                </div>
              } />
            </div>
          )}
        </div>
        {odp.url_documento_factura && (
          <a href={odp.url_documento_factura} target="_blank" rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-800 transition">
            <ExternalLink className="w-4 h-4" /> Ver Documento de Factura
          </a>
        )}
      </div>
    </div>
  );
};

export default TabFinanciero;
