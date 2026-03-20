import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, Briefcase, Users, TrendingUp } from 'lucide-react';

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const fmtM = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return fmtCOP(n);
};

export const PanelVentas: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[400px] bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-[400px] bg-slate-200 animate-pulse rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Sin datos disponibles.</div>;

  // Calculo de Top Clientes (max value = 100%)
  const maxCliente = data.top_clientes?.length > 0 ? Math.max(...data.top_clientes.map((c: any) => c.total)) : 100;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Wallet className="w-4 h-4" /> Recaudo (Abonos) Mes
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-blue-600">{fmtM(data.total_abonado)}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Briefcase className="w-4 h-4" /> Pendiente Cobro Total
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-rose-600">{fmtM(data.total_pendiente)}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Ticket Promedio
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-slate-800">{fmtCOP(data.ticket_promedio)}</h3>
            {data.ticket_promedio_delta_pct !== undefined && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${data.ticket_promedio_delta_pct > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {data.ticket_promedio_delta_pct > 0 ? '+' : ''}{data.ticket_promedio_delta_pct}%
              </span>
            )}
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${data.odps_sin_facturar > 5 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-sm font-semibold mb-1 ${data.odps_sin_facturar > 5 ? 'text-amber-800' : 'text-slate-500'}`}>
            Por Facturar (Remisiones)
          </p>
          <div className="flex items-end justify-between">
            <h3 className={`text-3xl font-extrabold ${data.odps_sin_facturar > 5 ? 'text-amber-600' : 'text-slate-800'}`}>
              {data.odps_sin_facturar} ODPs
            </h3>
          </div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* TOP CLIENTES */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500"/> Top 5 Clientes (Histórico % Valor)
          </h4>
          <div className="space-y-5 mt-6">
            {data.top_clientes?.map((c: any) => (
              <div key={c.cliente_id}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-bold text-slate-700 w-48 truncate" title={c.nombre}>{c.nombre}</span>
                  <span className="text-sm font-extrabold text-blue-700 bg-blue-50 px-2 rounded">{fmtM(c.total)}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-r h-2">
                  <motion.div 
                    initial={{ width: 0 }} animate={{ width: `${(c.total / maxCliente) * 100}%` }}
                    className="h-2 rounded-r bg-indigo-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-1 tracking-widest uppercase">{c.odps} PEDIDOS ATENDIDOS</p>
              </div>
            ))}
          </div>
        </div>

        {/* CARTERA VENCIDA DETALLE */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-rose-500"/> Alertas de Cartera (Listado)
          </h4>
          <div className="flex-1 overflow-auto max-h-[220px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wide">
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2 text-right">Monto</th>
                  <th className="py-2 px-2 text-center">Días</th>
                  <th className="py-2 px-2 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {data.cartera_vencida_detalle?.map((cv: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2 font-semibold text-slate-800 max-w-[120px] truncate" title={cv.nombre}>{cv.nombre}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-slate-700">{fmtM(cv.monto)}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-rose-600">+{cv.dias_vencido}d</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        cv.riesgo === 'critico' ? 'bg-rose-100 text-rose-700' : 
                        cv.riesgo === 'alerta' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {cv.riesgo}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!data.cartera_vencida_detalle || data.cartera_vencida_detalle.length === 0) && (
                  <tr><td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No hay alertas de cartera vencida</td></tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="pt-4 border-t border-slate-100">
            <div className="flex gap-2">
              {data.cartera_por_antiguedad?.map((cpa: any, i: number) => (
                <div key={i} className="flex-1 bg-slate-50 border border-slate-200 p-2 rounded-lg text-center shadow-sm relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${i===0?'bg-emerald-400':i===1?'bg-amber-400':'bg-rose-500'}`} />
                  <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{cpa.rango}</p>
                  <p className="text-sm font-extrabold text-slate-800">{fmtM(cpa.total)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. ASESORES ─────────────────────────────────────────────── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2 min-w-max">
          <TrendingUp className="w-5 h-5 text-emerald-500"/> Meta vs Real por Asesor (Mes Actual)
        </h4>
        <div className="flex gap-8 min-w-max items-end pb-2">
          {data.meta_vs_real_asesores?.map((as: any) => {
            const pct = Math.min((as.real / as.meta) * 100, 100);
            const colorClass = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-500';
            
            return (
              <div key={as.asesor_id} className="flex flex-col items-center gap-3 w-28">
                <div className="relative h-40 w-16 bg-slate-100 rounded-t-lg border-b-2 border-slate-300 flex items-end overflow-hidden shadow-inner">
                  {/* Etiqueta de la Meta "vacía" de fondo (si se quiere, o usar la altura) */}
                  <motion.div 
                    initial={{ height: 0 }} animate={{ height: `${pct}%` }} 
                    className={`w-full rounded-t-sm ${colorClass}`} 
                  />
                  <div className="absolute top-2 w-full text-center pointer-events-none">
                    <span className="text-[10px] font-black text-slate-300">META</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-slate-800 leading-none mb-1">{as.real}/{as.meta}</p>
                  <p className="text-xs font-bold text-slate-500 leading-tight uppercase line-clamp-2" title={as.nombre}>{as.nombre}</p>
                </div>
              </div>
            );
          })}
          {(!data.meta_vs_real_asesores || data.meta_vs_real_asesores.length === 0) && (
            <p className="text-slate-400 py-10 w-full text-center">No hay asesores comerciales registrados</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default PanelVentas;
