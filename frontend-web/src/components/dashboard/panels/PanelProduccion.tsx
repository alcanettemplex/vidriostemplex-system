import React from 'react';
import { motion } from 'framer-motion';
import { Wrench, Clock, FileWarning, PlaySquare, FileCheck } from 'lucide-react';
import DonutChart from '../charts/DonutChart';
import BarrasHorizontales from '../charts/BarrasHorizontales';

const fmtDias = (n: number) => `${n.toFixed(1)} d`;

export const PanelProduccion: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-slate-200 animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200 animate-pulse rounded-2xl" />
          <div className="h-80 bg-slate-200 animate-pulse rounded-2xl" />
        </div>
        <div className="h-64 bg-slate-200 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Sin datos disponibles.</div>;

  const chartDataEtapas = data.tiempo_por_etapa?.map((e: any) => ({
    etapa: e.etapa.replace(/_/g, ' '),
    dias: Math.round(e.dias_promedio * 10) / 10
  })) || [];

  const bottleneck = chartDataEtapas.reduce((prev: any, curr: any) => (prev.dias > curr.dias) ? prev : curr, { dias: 0 });

  const donutServicios = data.servicios_distribucion || [];
  const SERVICIO_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Wrench className="w-4 h-4" /> ODPs Taller
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-slate-800">{data.odps_en_taller}</h3>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${data.odps_vencen_esta_semana > 5 ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-sm font-semibold mb-1 flex items-center gap-1 ${data.odps_vencen_esta_semana > 5 ? 'text-rose-800' : 'text-slate-500'}`}>
            <Clock className="w-4 h-4" /> Vencen Sem.
          </p>
          <div className="flex items-end justify-between">
            <h3 className={`text-3xl font-extrabold ${data.odps_vencen_esta_semana > 5 ? 'text-rose-600' : 'text-slate-800'}`}>
              {data.odps_vencen_esta_semana}
            </h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-semibold text-slate-500 flex items-center gap-1">
              <PlaySquare className="w-4 h-4" /> Ciclo Promedio
            </p>
            <span className="text-xs font-bold text-slate-400">Meta: {data.meta_ciclo_dias}d</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <h3 className={`text-3xl font-extrabold ${data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'text-rose-600' : 'text-emerald-600'}`}>
              {fmtDias(data.tiempo_ciclo_promedio_dias)}
            </h3>
            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm ${data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {data.tiempo_ciclo_promedio_dias > data.meta_ciclo_dias ? 'LENTO' : 'ÓPTIMO'}
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1 relative z-10">
            <FileCheck className="w-4 h-4" /> Listas s/ Programar
          </p>
          <div className="flex items-end justify-between relative z-10">
            <h3 className="text-3xl font-extrabold text-amber-600">{data.odps_listas_sin_programar}</h3>
          </div>
          {data.odps_listas_sin_programar > 0 && (
            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100 rounded-bl-full flex items-start justify-end p-2 opacity-50">
              <FileWarning className="w-6 h-6 text-amber-500" />
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Tiempos por Etapa */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500"/> Tiempo Promedio por Etapa
          </h4>
          <div className="flex-1">
            <BarrasHorizontales 
              data={chartDataEtapas} 
              yKey="etapa" 
              barsKey="dias" 
              xFormatter={fmtDias}
            />
          </div>
          {bottleneck.dias > 0 && (
            <div className="mt-4 bg-rose-50 border border-rose-200 p-3 rounded-lg flex items-center gap-3 shadow-inner">
              <FileWarning className="w-5 h-5 text-rose-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-rose-800 uppercase tracking-wide">Cuello de Botella Detectado</p>
                <p className="text-sm text-rose-700 font-medium">La etapa <strong className="font-extrabold">{bottleneck.etapa}</strong> está tomando {bottleneck.dias} días en promedio.</p>
              </div>
            </div>
          )}
        </div>

        {/* Distribución Servicios */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-500"/> ODPs por Servicio
          </h4>
          <div className="flex-1 flex items-center px-2">
            <div className="w-3/5">
              <DonutChart 
                data={donutServicios} 
                nameKey="tipo_servicio" 
                dataKey="cantidad" 
                colors={SERVICIO_COLORS} 
                height={260}
              />
            </div>
            <div className="w-2/5 pl-2 border-l border-slate-100 flex flex-col max-h-[220px] overflow-y-auto pr-1">
              {donutServicios.map((s: any, i: number) => (
                <div key={i} className="flex justify-between items-center bg-slate-50 px-2 py-2 mb-2 rounded border border-slate-100">
                  <div className="flex items-center gap-1.5 truncate max-w-[80px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SERVICIO_COLORS[i % SERVICIO_COLORS.length] }}></span>
                    <span className="text-[10px] font-bold text-slate-600 truncate uppercase mt-0.5" title={s.tipo_servicio}>{s.tipo_servicio}</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-800">{s.cantidad}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ─── 3. ODPs VENCEN ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <h4 className="text-lg font-bold text-slate-800 p-6 pb-4 flex items-center gap-2 border-b border-slate-100">
          <FileWarning className="w-5 h-5 text-rose-500"/> Próximas a Vencer (7 días)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="py-3 px-6"># ODP</th>
                <th className="py-3 px-6">Cliente</th>
                <th className="py-3 px-6">Estado Actual</th>
                <th className="py-3 px-6">Fecha Entrega</th>
                <th className="py-3 px-6 text-center">Días Faltantes</th>
                <th className="py-3 px-6 text-center">Riesgo</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {data.odps_proximas_vencer?.map((odp: any, i: number) => (
                <tr key={i} className={`hover:bg-slate-50 transition ${odp.dias_restantes <= 2 ? 'bg-rose-50/30' : ''}`}>
                  <td className="py-3 px-6 font-mono font-bold text-slate-700">{odp.numero_odp}</td>
                  <td className="py-3 px-6 font-semibold text-slate-800">{odp.cliente}</td>
                  <td className="py-3 px-6">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded">
                      {odp.estado_produccion.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-6 text-slate-600 font-medium">
                    {odp.fecha_entrega ? new Date(odp.fecha_entrega).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className={`py-3 px-6 text-center font-black ${
                    odp.dias_restantes <= 2 ? 'text-rose-600' : 
                    odp.dias_restantes <= 5 ? 'text-amber-600' : 'text-emerald-600'
                  }`}>
                    {odp.dias_restantes}
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      odp.riesgo === 'alto' ? 'bg-rose-100 text-rose-700' : 
                      odp.riesgo === 'medio' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {odp.riesgo}
                    </span>
                  </td>
                </tr>
              ))}
              {(!data.odps_proximas_vencer || data.odps_proximas_vencer.length === 0) && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400 font-medium">No hay ODPs próximas a vencer en los próximos 7 días 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default PanelProduccion;
