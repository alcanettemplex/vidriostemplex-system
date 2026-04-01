import React from 'react';
import { motion } from 'framer-motion';
import { Users, FileCheck, Truck, Clock, CheckCircle2, AlertCircle, Timer, Navigation } from 'lucide-react';
import BarrasHorizontales from '../charts/BarrasHorizontales';

const fmtDias = (n: number) => `${n.toFixed(1)} d`;
const fmtMin = (n: number | null) => n == null ? '—' : n < 60 ? `${n}min` : `${Math.floor(n / 60)}h ${Math.round(n % 60)}m`;

export const PanelEquipo: React.FC<{ data: any, isLoading: boolean }> = ({ data, isLoading }) => {
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

  const rankingVentas = data.ranking_asesores?.map((r: any) => ({
    nombre: r.nombre.split(' ')[0], 
    cerradas: r.odps_cerradas_mes,
    dias: Math.round(r.tiempo_promedio_cierre_dias * 10) / 10
  })) || [];

  return (
    <div className="space-y-4">
      
      {/* ─── 1. KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Asesores Activos</div>
          <div className="text-[20px] font-medium text-blue-600">{data.total_asesores}</div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">Instaladores Activos</div>
          <div className="text-[20px] font-medium text-indigo-600">{data.total_instaladores}</div>
        </div>

        <div className="bg-white p-3 border border-slate-200 rounded text-[11px]">
          <div className="text-slate-500 mb-1">ODPs Promedio / Asesor</div>
          <div className="text-[20px] font-medium text-slate-800">{data.odps_por_asesor_promedio}</div>
        </div>

        <div className={`p-3 rounded border text-[11px] ${data.eficiencia_taller_pct < 80 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <div className={`mb-1 ${data.eficiencia_taller_pct < 80 ? 'text-amber-800' : 'text-slate-500'}`}>Eficiencia Taller %</div>
          <div className="flex justify-between items-end">
             <div className={`text-[20px] font-medium ${data.eficiencia_taller_pct < 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {data.eficiencia_taller_pct}%
             </div>
             {data.eficiencia_taller_pct >= 90 && (
              <span className="text-[9px] uppercase font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">EXCELENTE</span>
             )}
             {data.eficiencia_taller_pct < 80 && (
              <span className="text-[9px] uppercase font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">MEJORAR</span>
             )}
          </div>
        </div>
      </div>

      {/* ─── 2. CHARTS PRIMCIPAL ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        
        {/* Ranking Asesores */}
        <div className="bg-white p-3 border border-slate-200 rounded flex flex-col">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-2">Ranking Comercial (ODPs Cerradas)</div>
          <div className="flex-1 min-h-[160px]">
            <BarrasHorizontales 
              data={rankingVentas.sort((a: any, b: any) => b.cerradas - a.cerradas)} 
              yKey="nombre" 
              barsKey="cerradas" 
            />
          </div>
          <div className="border-t border-slate-100 pt-3 pb-1 mt-1">
            <div className="text-[9px] font-medium uppercase tracking-wider text-slate-400 mb-2">Velocidad Promedio de Cierre</div>
            <div className="flex gap-2">
              {rankingVentas.sort((a: any, b: any) => a.dias - b.dias).slice(0, 4).map((r: any, i: number) => (
                <div key={i} className="flex-1 bg-slate-50 py-1.5 text-center rounded border border-slate-100">
                  <div className="text-[10px] text-slate-600 truncate px-1">{r.nombre}</div>
                  <div className={`font-bold text-[12px] ${r.dias < 12 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtDias(r.dias)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Carga Instaladores */}
        <div className="bg-white p-3 border border-slate-200 rounded flex flex-col">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3">Avance Instaladores vs Evidencias</div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 max-h-[260px]">
            {data.carga_instaladores?.map((inst: any, idx: number) => {
              const completado = inst.instalaciones_mes > 0 ? (inst.con_evidencia / inst.instalaciones_mes) * 100 : 0;
              return (
                <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <div className="font-medium text-slate-700 flex items-center gap-1.5" title={inst.nombre}>
                      <Users className="w-3 h-3 text-slate-400" />
                      {inst.nombre.split(' ')[0]} {inst.nombre.split(' ')[1] ? inst.nombre.split(' ')[1][0] + '.' : ''}
                    </div>
                    <div className="font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 flex gap-2">
                      <span>{inst.instalaciones_mes} asignadas</span>
                      <span className="text-slate-300">|</span>
                      <span>{inst.con_evidencia} ok</span>
                    </div>
                  </div>
                  
                  <div className="mt-1.5 w-full bg-slate-100 h-1.5 flex overflow-hidden">
                    <div 
                      className={`h-full ${completado === 100 ? 'bg-emerald-500' : completado > 50 ? 'bg-amber-400' : 'bg-rose-500'}`} 
                      style={{ width: `${Math.max(completado, 0)}%` }}
                    />
                  </div>
                  
                  {inst.sin_evidencia > 0 && (
                    <div className="flex items-center gap-1 text-[9px] text-rose-600 font-medium bg-rose-50 px-1.5 py-0.5 rounded w-max mt-1.5 uppercase tracking-wide">
                      Faltan {inst.sin_evidencia} reporte(s)
                    </div>
                  )}
                </div>
              );
            })}
            {(!data.carga_instaladores || data.carga_instaladores.length === 0) && (
              <div className="text-slate-400 py-6 w-full text-center text-[11px]">No hay instalaciones registradas activas.</div>
            )}
          </div>
        </div>

      </div>

      {/* ─── PROPUESTA C: ESTADO ACTUAL DEL DÍA ─────────────────────────── */}
      {(() => {
        const hoy = data.operaciones_hoy;
        if (!hoy) return null;
        const odps = hoy.odps || {};
        const totalHoy = Number(odps.pendientes || 0) + Number(odps.en_curso || 0) + Number(odps.completadas || 0);
        return (
          <div className="bg-white border border-slate-200 rounded p-3">
            <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" /> Operaciones Hoy
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-slate-50 rounded p-2 text-center border border-slate-100">
                <div className="text-[18px] font-bold text-slate-600">{odps.pendientes ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Pendientes</div>
              </div>
              <div className="bg-amber-50 rounded p-2 text-center border border-amber-100">
                <div className="text-[18px] font-bold text-amber-600">{odps.en_curso ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider text-amber-500">En Curso</div>
              </div>
              <div className="bg-emerald-50 rounded p-2 text-center border border-emerald-100">
                <div className="text-[18px] font-bold text-emerald-600">{odps.completadas ?? 0}</div>
                <div className="text-[9px] uppercase tracking-wider text-emerald-500">Completadas</div>
              </div>
            </div>
            {totalHoy > 0 && (
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex mb-3">
                <div className="bg-slate-300 h-full" style={{ width: `${(Number(odps.pendientes || 0) / totalHoy) * 100}%` }} />
                <div className="bg-amber-400 h-full" style={{ width: `${(Number(odps.en_curso || 0) / totalHoy) * 100}%` }} />
                <div className="bg-emerald-500 h-full" style={{ width: `${(Number(odps.completadas || 0) / totalHoy) * 100}%` }} />
              </div>
            )}
            {hoy.rutas_activas?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rutas en curso</div>
                {hoy.rutas_activas.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded px-2.5 py-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      <Truck className="w-3.5 h-3.5 text-amber-500" />
                      {r.vehiculo} · {r.conductor}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      <span>{r.stops_completadas}/{r.stops_total}</span>
                      {r.stops_en_curso > 0 && <span className="text-amber-500 font-bold">{r.stops_en_curso} instalando</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(!hoy.rutas_activas || hoy.rutas_activas.length === 0) && (
              <div className="text-[11px] text-slate-400 text-center py-2">Sin rutas activas en este momento</div>
            )}
          </div>
        );
      })()}

      {/* ─── PROPUESTA A: RENDIMIENTO INSTALADORES ───────────────────────── */}
      {data.rendimiento_instaladores?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-indigo-500" /> Rendimiento Instaladores (mes)
          </div>
          <div className="space-y-2">
            {data.rendimiento_instaladores.map((inst: any, i: number) => {
              const min = inst.avg_minutos_instalacion != null ? Number(inst.avg_minutos_instalacion) : null;
              const rapido = min != null && min < 60;
              return (
                <div key={i} className="flex items-center gap-3 text-[11px]">
                  <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 font-medium text-slate-700 truncate">{inst.nombre?.split(' ').slice(0, 2).join(' ')}</div>
                  <div className="flex items-center gap-3 text-slate-500">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">{inst.instalaciones_mes} ODPs</span>
                    <span className={`px-1.5 py-0.5 rounded font-bold flex items-center gap-1 ${rapido ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      <Clock className="w-2.5 h-2.5" /> {fmtMin(min)}
                    </span>
                    {Number(inst.completadas_hoy) > 0 && (
                      <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">{inst.completadas_hoy} hoy</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── PROPUESTA B: ANÁLISIS CONDUCTORES ───────────────────────────── */}
      {data.analisis_conductores?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded p-3">
          <div className="text-[12px] font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-indigo-500" /> Análisis Conductores (mes)
          </div>
          <div className="space-y-3">
            {data.analisis_conductores.map((c: any, i: number) => {
              const puntualidad = c.avg_horas_puntualidad != null ? Number(c.avg_horas_puntualidad) : null;
              const puntual = puntualidad != null && puntualidad <= 0;
              return (
                <div key={i} className="border border-slate-100 rounded p-2.5 text-[11px]">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-slate-400" />
                      {c.nombre?.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-bold">{c.rutas_mes} rutas</span>
                      <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{c.rutas_completadas} ok</span>
                    </div>
                  </div>
                  <div className="flex gap-3 text-slate-500">
                    <span className="flex items-center gap-1">
                      <Timer className="w-3 h-3" /> Duración prom: <strong className="text-slate-700">{fmtMin(c.avg_minutos_ruta != null ? Number(c.avg_minutos_ruta) : null)}</strong>
                    </span>
                    {puntualidad != null && (
                      <span className={`flex items-center gap-1 font-medium ${puntual ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {puntual ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {puntual ? `${Math.abs(puntualidad).toFixed(1)}h antes` : `${puntualidad.toFixed(1)}h tarde`}
                      </span>
                    )}
                    {puntualidad == null && <span className="text-slate-400 italic">Sin datos de puntualidad</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};

export default PanelEquipo;
