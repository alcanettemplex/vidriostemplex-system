import React from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, FileCheck, Target, Award, Camera, Briefcase } from 'lucide-react';
import BarrasHorizontales from '../charts/BarrasHorizontales';

const fmtDias = (n: number) => `${n.toFixed(1)} d`;

export const PanelEquipo: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
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
      </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Sin datos disponibles.</div>;

  const rankingVentas = data.ranking_asesores?.map((r: any) => ({
    nombre: r.nombre.split(' ')[0], // Solo el primer nombre para espacio
    cerradas: r.odps_cerradas_mes,
    dias: Math.round(r.tiempo_promedio_cierre_dias * 10) / 10
  })) || [];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <UserPlus className="w-4 h-4" /> Asesores Activos
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-blue-600">{data.total_asesores}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Users className="w-4 h-4" /> Instaladores Activos
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-indigo-600">{data.total_instaladores}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <p className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <Target className="w-4 h-4" /> ODPs Promedio / Asesor
          </p>
          <div className="flex items-end justify-between">
            <h3 className="text-3xl font-extrabold text-slate-800">{data.odps_por_asesor_promedio}</h3>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between ${data.eficiencia_taller_pct < 80 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-center mb-1">
            <p className={`text-sm font-semibold flex items-center gap-1 ${data.eficiencia_taller_pct < 80 ? 'text-amber-800' : 'text-slate-500'}`}>
              <FileCheck className="w-4 h-4" /> Eficiencia Taller %
            </p>
          </div>
          <div className="flex items-end justify-between">
            <h3 className={`text-3xl font-extrabold ${data.eficiencia_taller_pct < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {data.eficiencia_taller_pct}%
            </h3>
            {data.eficiencia_taller_pct >= 90 && (
              <span className="text-[10px] uppercase font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-sm">XCELENTE</span>
            )}
            {data.eficiencia_taller_pct < 80 && (
              <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-sm">MEJORAR</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Ranking Asesores */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-500"/> Ranking Comercial (ODPs Cerradas)
          </h4>
          <div className="flex-1 min-h-[160px]">
            <BarrasHorizontales 
              data={rankingVentas.sort((a: any, b: any) => b.cerradas - a.cerradas)} 
              yKey="nombre" 
              barsKey="cerradas" 
            />
          </div>
          <div className="border-t border-slate-100 pt-4 pb-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Velocidad de Cierre Promedio (Días)</p>
            <div className="flex gap-2">
              {rankingVentas.sort((a: any, b: any) => a.dias - b.dias).slice(0, 4).map((r: any, i: number) => (
                <div key={i} className="flex-1 bg-slate-50 p-2 text-center rounded-lg shadow-sm border border-slate-200">
                  <p className="font-semibold text-xs text-slate-700 truncate">{r.nombre}</p>
                  <p className={`font-black text-sm ${r.dias < 12 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtDias(r.dias)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Carga Instaladores */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-emerald-500"/> Avance Instaladores vs Evidencias
          </h4>
          <div className="flex-1 space-y-5 overflow-y-auto pr-2 max-h-[300px]">
            {data.carga_instaladores?.map((inst: any, idx: number) => {
              const completado = inst.instalaciones_mes > 0 ? (inst.con_evidencia / inst.instalaciones_mes) * 100 : 0;
              return (
                <div key={idx} className="relative pb-2 border-b border-slate-100 last:border-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-bold text-slate-700 flex items-center gap-1.5" title={inst.nombre}>
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      {inst.nombre.split(' ')[0]} {inst.nombre.split(' ')[1] ? inst.nombre.split(' ')[1][0] + '.' : ''}
                    </span>
                    <span className="text-xs font-bold bg-slate-100 px-2 rounded border border-slate-200 text-slate-600">
                      {inst.instalaciones_mes} Tareas
                    </span>
                  </div>
                  
                  {/* Barras Apiladas / Comparativas Manual */}
                  <div className="mt-2 w-full bg-slate-100 rounded-sm h-3 flex overflow-hidden">
                    {/* Visual: barra total gris y sobre ella la verde de evidencia */}
                    <div 
                      className={`h-3 rounded-sm ${completado === 100 ? 'bg-emerald-500' : completado > 50 ? 'bg-amber-400' : 'bg-rose-500'}`} 
                      style={{ width: `${Math.max(completado, 0)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mt-1 pb-1">
                    <span>{inst.con_evidencia} Evidencias</span>
                    <span>{inst.sin_evidencia > 0 ? `${inst.sin_evidencia} Sin Evidencia` : '100% Ok'}</span>
                  </div>
                  
                  {inst.sin_evidencia > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded w-max mt-1">
                      <Camera className="w-3 h-3" /> Faltan {inst.sin_evidencia} reportes
                    </div>
                  )}
                </div>
              );
            })}
            {(!data.carga_instaladores || data.carga_instaladores.length === 0) && (
              <p className="text-slate-400 py-10 w-full text-center font-medium">No hay instalaciones registradas / instaladores activos.</p>
            )}
          </div>
        </div>

      </div>

    </motion.div>
  );
};

export default PanelEquipo;
