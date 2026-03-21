import React from 'react';
import { motion } from 'framer-motion';

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmtCOP(n);
};

export const PanelVentas: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-20 bg-white border border-slate-200 animate-pulse rounded" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="h-60 bg-white border border-slate-200 animate-pulse rounded" />
          <div className="h-60 bg-white border border-slate-200 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-[12px] text-slate-500">Sin datos operativos.</div>;

  const maxCliente = data.top_clientes?.length > 0 ? Math.max(...data.top_clientes.map((c: any) => c.total)) : 100;

  return (
    <div className="space-y-4">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Recaudo (Abonos) Mes</div>
          <div className="text-[20px] font-medium text-blue-600">{fmtM(data.total_abonado)}</div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Pendiente Cobro Total</div>
          <div className="text-[20px] font-medium text-rose-600">{fmtM(data.total_pendiente)}</div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Ticket Promedio</div>
          <div className="text-[20px] font-medium text-slate-800">{fmtM(data.ticket_promedio)}</div>
          {data.ticket_promedio_delta_pct !== undefined && (
            <div className={`mt-0.5 ${data.ticket_promedio_delta_pct > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {data.ticket_promedio_delta_pct > 0 ? '+' : ''}{data.ticket_promedio_delta_pct}%
            </div>
          )}
        </div>

        <div className={`p-3 rounded border text-[11px] ${data.odps_sin_facturar > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className={`mb-1 ${data.odps_sin_facturar > 5 ? 'text-amber-800' : 'text-slate-500'}`}>Por Facturar (Remisiones)</div>
          <div className={`text-[20px] font-medium ${data.odps_sin_facturar > 5 ? 'text-amber-600' : 'text-slate-800'}`}>
            {data.odps_sin_facturar} ODPs
          </div>
        </div>
      </div>

      {/* ─── 2. GRUPO MEDIO ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        
        {/* TOP CLIENTES */}
        <div className="bg-white p-3 border border-slate-200 rounded">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3">Top 5 Clientes (Histórico)</div>
          <div className="space-y-3 mt-4">
            {data.top_clientes?.map((c: any) => (
              <div key={c.cliente_id} className="text-[11px]">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-slate-700 w-48 truncate" title={c.nombre}>{c.nombre}</span>
                  <span className="font-medium text-blue-700">{fmtM(c.total)}</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${(c.total / maxCliente) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{c.odps} pedidos</div>
              </div>
            ))}
          </div>
        </div>

        {/* CARTERA VENCIDA DETALLE */}
        <div className="bg-white p-3 border border-slate-200 rounded flex flex-col">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">Alertas de Cartera</div>
          <div className="flex-1 overflow-auto max-h-[180px] border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                  <th className="py-1.5 px-2 font-medium">Cliente</th>
                  <th className="py-1.5 px-2 text-right font-medium">Monto</th>
                  <th className="py-1.5 px-2 text-center font-medium">Días</th>
                  <th className="py-1.5 px-2 text-center font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="text-[11px] divide-y divide-slate-100">
                {data.cartera_vencida_detalle?.map((cv: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2 text-slate-800 max-w-[120px] truncate" title={cv.nombre}>{cv.nombre}</td>
                    <td className="py-1.5 px-2 text-right text-slate-700">{fmtM(cv.monto)}</td>
                    <td className="py-1.5 px-2 text-center text-rose-600">+{cv.dias_vencido}d</td>
                    <td className="py-1.5 px-2 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${
                        cv.riesgo === 'critico' ? 'bg-rose-50 text-rose-700' : 
                        cv.riesgo === 'alerta' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}>
                        {cv.riesgo}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!data.cartera_vencida_detalle || data.cartera_vencida_detalle.length === 0) && (
                  <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin alertas de cartera</td></tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="pt-2 mt-2 border-t border-slate-100">
            <div className="flex gap-2">
              {data.cartera_por_antiguedad?.map((cpa: any, i: number) => (
                <div key={i} className="flex-1 bg-slate-50 p-1.5 rounded text-center relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${i===0?'bg-emerald-400':i===1?'bg-amber-400':'bg-rose-500'}`} />
                  <div className="text-[9px] text-slate-400 uppercase tracking-wide">{cpa.rango}</div>
                  <div className="text-[11px] font-medium text-slate-800">{fmtM(cpa.total)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. ASESORES ─────────────────────────────────────────────── */}
      <div className="bg-white p-3 border border-slate-200 rounded">
        <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-4">Meta vs Real por Asesor (Mes)</div>
        <div className="space-y-3">
          {data.meta_vs_real_asesores?.map((as: any) => {
            const pct = Math.min((as.real / as.meta) * 100, 100);
            const colorClass = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-500';
            
            return (
              <div key={as.asesor_id} className="text-[11px]">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-700 w-32 truncate">{as.nombre}</span>
                  <span className="text-slate-800 font-medium">{as.real} / {as.meta}</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative">
                   <div 
                    className={`h-full ${colorClass} rounded-full`} 
                    style={{ width: `${pct}%` }} 
                  />
                  <div className="absolute top-0 bottom-0 border-l border-slate-300" style={{ left: '100%' }}></div>
                </div>
              </div>
            );
          })}
          {(!data.meta_vs_real_asesores || data.meta_vs_real_asesores.length === 0) && (
            <div className="text-slate-400 py-4 text-center text-[11px]">No hay asesores comerciales registrados</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PanelVentas;
