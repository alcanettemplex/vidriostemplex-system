import React from 'react';
import { motion } from 'framer-motion';
import DonutChart from '../charts/DonutChart';
import BarrasHorizontales from '../charts/BarrasHorizontales';

const fmtDias = (n: number) => `${n.toFixed(1)} d`;

export const PanelProduccion: React.FC<{ data: any, isLoading: boolean, onViewOdp?: (id: number) => void }> = ({ data, isLoading, onViewOdp }) => {
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

  const chartDataEtapas = data.tiempo_por_etapa?.map((e: any) => ({
    etapa: e.etapa.replace(/_/g, ' '),
    dias: Math.round(e.dias_promedio * 10) / 10
  })) || [];

  const bottleneck = chartDataEtapas.reduce((prev: any, curr: any) => (prev.dias > curr.dias) ? prev : curr, { dias: 0 });

  const donutServicios = data.servicios_distribucion || [];
  const SERVICIO_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

  return (
    <div className="space-y-4">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">ODPs Taller</div>
          <div className="text-[20px] font-medium text-slate-800">{data.odps_en_taller}</div>
        </div>

        <div className={`p-3 rounded border text-[11px] ${data.odps_vencen_esta_semana > 5 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <div className={`mb-1 ${data.odps_vencen_esta_semana > 5 ? 'text-rose-800' : 'text-slate-500'}`}>Vencen Sem.</div>
          <div className={`text-[20px] font-medium ${data.odps_vencen_esta_semana > 5 ? 'text-rose-600' : 'text-slate-800'}`}>
            {data.odps_vencen_esta_semana}
          </div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1 flex justify-between">
            <span>Ciclo Promedio</span>
            <span>Meta: {data.meta_ciclo_dias}d</span>
          </div>
          <div className={`text-[20px] font-medium ${data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'text-rose-600' : 'text-emerald-600'}`}>
            {fmtDias(data.tiempo_ciclo_promedio_dias)}
          </div>
          <div className={`mt-0.5 ${data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'text-rose-600' : 'text-emerald-600'}`}>
            {data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'LENTO' : 'ÓPTIMO'}
          </div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Listas s/ Programar</div>
          <div className="text-[20px] font-medium text-amber-600">{data.odps_listas_sin_programar}</div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        
        {/* Tiempos por Etapa */}
        <div className="bg-white p-3 border border-slate-200 rounded flex flex-col">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">Tiempo Promedio por Etapa</div>
          <div className="flex-1 min-h-[160px]">
            <BarrasHorizontales 
              data={chartDataEtapas} 
              yKey="etapa" 
              barsKey="dias" 
              xFormatter={fmtDias}
            />
          </div>
          {bottleneck.dias > 0 && (
            <div className="mt-3 bg-rose-50 border border-rose-100 p-2 rounded text-[11px] text-rose-700">
              <span className="font-bold flex items-center gap-1.5 uppercase mb-0.5">⚠️ Cuello de Botella</span>
              La etapa <strong>{bottleneck.etapa}</strong> está tomando {bottleneck.dias} días en promedio.
            </div>
          )}
        </div>

        {/* Distribución Servicios */}
        <div className="bg-white p-3 border border-slate-200 rounded flex flex-col">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">ODPs por Servicio</div>
          <div className="flex-1 flex items-center gap-5">
            <div className="w-[140px] h-[140px] shrink-0">
              <DonutChart 
                data={donutServicios} 
                nameKey="tipo_servicio" 
                dataKey="cantidad" 
                colors={SERVICIO_COLORS} 
              />
            </div>
            <div className="flex-1 pl-2 border-l border-slate-100 flex flex-col max-h-[180px] overflow-y-auto">
              {donutServicios.map((s: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-slate-50 px-2 py-1.5 mb-1.5 rounded text-[11px] border border-slate-100">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }}></span>
                    <span className="text-slate-600 uppercase" title={s.tipo_servicio}>{s.tipo_servicio}</span>
                  </div>
                  <span className="font-medium text-slate-800">{s.cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. ODPs VENCEN ──────────────────────────────────────────── */}
      <div className="bg-white rounded border border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100 text-[12px] font-medium text-slate-500 uppercase tracking-wider">
          Próximas a Vencer (7 días)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                <th className="py-1.5 px-3 font-medium"># ODP</th>
                <th className="py-1.5 px-3 font-medium">Cliente</th>
                <th className="py-1.5 px-3 font-medium">Estado</th>
                <th className="py-1.5 px-3 font-medium">Fecha Entrega</th>
                <th className="py-1.5 px-3 font-medium text-center">Faltan</th>
                <th className="py-1.5 px-3 font-medium text-center">Riesgo</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-slate-100">
              {data.odps_proximas_vencer?.map((odp: any, i: number) => (
                <tr 
                  key={i} 
                  onClick={() => onViewOdp && onViewOdp(odp.odp_id)}
                  className={`cursor-pointer hover:bg-slate-50 transition ${odp.dias_restantes <= 2 ? 'bg-rose-50/50' : ''}`}
                >
                  <td className="py-1.5 px-3 font-medium text-slate-700">{odp.numero_odp}</td>
                  <td className="py-1.5 px-3 text-slate-800">{odp.cliente}</td>
                  <td className="py-1.5 px-3">
                    <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded">
                      {odp.estado_produccion.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-slate-600">
                    {odp.fecha_entrega ? new Date(odp.fecha_entrega).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className={`py-1.5 px-3 text-center font-medium ${
                    odp.dias_restantes <= 2 ? 'text-rose-600' : 
                    odp.dias_restantes <= 5 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {odp.dias_restantes} d
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${
                      odp.riesgo === 'alto' ? 'bg-rose-50 text-rose-700' : 
                      odp.riesgo === 'medio' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {odp.riesgo}
                    </span>
                  </td>
                </tr>
              ))}
              {(!data.odps_proximas_vencer || data.odps_proximas_vencer.length === 0) && (
                <tr><td colSpan={6} className="py-4 text-center text-[11px] text-slate-400">No hay ODPs próximas a vencer en los próximos 7 días</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PanelProduccion;
