import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, AlertTriangle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { apiGetStatsProspectos } from '../crmService';
import { IconLeads, IconTarget, IconCheck, IconClock, IconBarChart } from './CRMIcons';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface Props { esVistaGlobal: boolean; mes?: number; anio?: number; }

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative group inline-flex ml-1.5 flex-shrink-0">
    <button
      type="button"
      className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-black flex items-center justify-center hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
    >?</button>
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-[11px] rounded-xl p-3 shadow-xl z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none leading-snug">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
    </div>
  </div>
);

// ─── Paso del embudo ──────────────────────────────────────────────────────────
const EmbudoStep: React.FC<{
  label: string; value: number; total: number;
  color: string; isLast?: boolean; tooltip?: string;
}> = ({ label, value, total, color, isLast, tooltip }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const width = total > 0 ? `${Math.max((value / total) * 100, 8)}%` : '8%';
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center">
            <span className="text-xs font-bold text-slate-600">{label}</span>
            {tooltip && <InfoTooltip text={tooltip} />}
          </div>
          <span className="text-xs font-black text-slate-700">{value} <span className="text-slate-400 font-normal">({pct}%)</span></span>
        </div>
        <div className="h-6 bg-slate-100 rounded-lg overflow-hidden relative">
          <div className={`h-full ${color} rounded-lg transition-all duration-700 flex items-center px-2`} style={{ width }}>
            {pct > 12 && <span className="text-[10px] font-black text-white">{value}</span>}
          </div>
          {pct <= 12 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">{value}</span>
          )}
        </div>
      </div>
      {!isLast && <span className="text-slate-300 font-black text-lg flex-shrink-0">→</span>}
    </div>
  );
};

const ProspectosStats: React.FC<Props> = ({ esVistaGlobal, mes, anio }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodoLabel = mes && anio ? `${MONTH_NAMES[mes - 1]} ${anio}` : 'Acumulado';

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await apiGetStatsProspectos(mes, anio);
      setStats(data);
    } catch {
      setError('No se pudo cargar la información de prospectos.');
    } finally {
      setLoading(false);
    }
  }, [mes, anio]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
        ))}
      </div>
      <div className="h-64 bg-white rounded-2xl animate-pulse border border-slate-100" />
    </div>
  );

  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-600 text-sm font-semibold">{error || 'Sin datos'}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold">Reintentar</button>
    </div>
  );

  const {
    total = 0, activos = 0, aprobados = 0, no_aprobados = 0,
    tasa_conversion = 0, tiempo_prom_aprobacion_dias = 0,
    con_tm = 0, sin_tm = 0, sin_actividad_7d = 0,
    por_asesor = [], embudo = {},
  } = stats;

  const hayAlertas = sin_tm > 0 || sin_actividad_7d > 0;

  const KPIS = [
    {
      label: 'Total Prospectos',
      value: String(total),
      sub: periodoLabel,
      icon: <IconLeads size={16} className="text-violet-600" />,
      border: 'border-l-violet-500', bg: 'bg-violet-50',
      tooltip: 'Cantidad total de prospectos registrados en el período. Un prospecto es un proyecto concreto con alta probabilidad de convertirse en ODP, distinto de un lead CRM: ya existe un contexto de proyecto definido (cliente, producto, ubicación).',
    },
    {
      label: 'Activos (en gestión)',
      value: String(activos),
      sub: `${no_aprobados} no aprobados`,
      icon: <IconClock size={16} className="text-amber-600" />,
      border: 'border-l-amber-500', bg: 'bg-amber-50',
      tooltip: 'Prospectos que siguen en proceso: tienen asesor asignado y no han sido cerrados. Los "no aprobados" son prospectos que el cliente rechazó o no prosperaron, pero que también se cerraron en el período.',
    },
    {
      label: 'Tasa Conversión',
      value: `${tasa_conversion}%`,
      sub: `${aprobados} aprobados`,
      icon: <IconTarget size={16} className="text-emerald-600" />,
      border: 'border-l-emerald-500', bg: 'bg-emerald-50',
      tooltip: 'Porcentaje de prospectos del período que culminaron como APROBADO. Verde ≥30% (excelente), amarillo ≥15% (aceptable), rojo <15% (requiere revisión). Una tasa alta indica buena calificación inicial de los proyectos.',
    },
    {
      label: 'T° Prom. Aprobación',
      value: `${tiempo_prom_aprobacion_dias}d`,
      sub: 'creación → aprobación',
      icon: <IconCheck size={16} className="text-indigo-600" />,
      border: 'border-l-indigo-500', bg: 'bg-indigo-50',
      tooltip: 'Días promedio entre la creación del prospecto y su aprobación formal. Solo se calcula sobre los que tienen fecha de aprobación registrada. Cuanto menor, más ágil es el ciclo de cierre de proyectos.',
    },
  ];

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-800">Prospectos</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Pipeline de proyectos — {periodoLabel}</p>
        </div>
        <button
          onClick={cargar}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Alertas */}
      {hayAlertas && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center">
              <p className="text-sm font-black text-amber-800">Requieren atención</p>
              <InfoTooltip text="Prospectos que necesitan acción inmediata: sin Toma de Medidas programada (no pueden avanzar a ODP) o sin ningún movimiento en los últimos 7 días (riesgo de que el cliente se enfríe)." />
            </div>
            <div className="flex flex-wrap gap-3">
              {sin_tm > 0 && (
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                  {sin_tm} prospecto{sin_tm > 1 ? 's' : ''} activo{sin_tm > 1 ? 's' : ''} sin Toma de Medidas
                </span>
              )}
              {sin_actividad_7d > 0 && (
                <span className="text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200">
                  {sin_actividad_7d} sin actividad en +7 días
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPIS.map(k => (
          <div key={k.label} className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm border-l-4 ${k.border} flex flex-col gap-1.5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.label}</span>
                <InfoTooltip text={k.tooltip} />
              </div>
              <div className={`w-8 h-8 rounded-xl ${k.bg} flex items-center justify-center`}>{k.icon}</div>
            </div>
            <p className="text-2xl font-black text-slate-800 leading-none">{k.value}</p>
            <p className="text-[11px] text-slate-400 font-medium">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Embudo + Por Asesor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Embudo visual */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <IconBarChart size={16} className="text-indigo-600" />
            </div>
            <div className="flex items-center">
              <div>
                <h3 className="font-black text-slate-800 text-sm">Embudo Prospecto → ODP</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Flujo completo de conversión</p>
              </div>
              <InfoTooltip text="Muestra cuántos prospectos superan cada etapa del proceso. Los porcentajes son sobre el total de prospectos creados. Una caída brusca entre etapas señala el punto de fricción más crítico en el ciclo de proyectos." />
            </div>
          </div>
          <div className="space-y-4">
            <EmbudoStep
              label="Prospectos Creados" value={embudo.creados || 0} total={embudo.creados || 1} color="bg-violet-500"
              tooltip="Total de prospectos registrados en el período. Es la boca del embudo: el volumen bruto de proyectos captados."
            />
            <EmbudoStep
              label="Con Toma de Medidas" value={embudo.con_tm || 0} total={embudo.creados || 1} color="bg-indigo-500"
              tooltip="Prospectos que ya tienen al menos una visita técnica (TM) programada o realizada. Sin TM no se puede generar una ODP."
            />
            <EmbudoStep
              label="Aprobados" value={embudo.aprobados || 0} total={embudo.creados || 1} color="bg-emerald-500"
              tooltip="Prospectos que el cliente o jefe de producción aprobó formalmente. Están listos para convertirse en Orden de Producción."
            />
            <EmbudoStep
              label="Convertidos a ODP" value={embudo.convertidos_odp || 0} total={embudo.creados || 1} color="bg-teal-500" isLast
              tooltip="Prospectos aprobados cuya aprobación ya generó una Orden de Producción vinculada en el sistema productivo. Es el resultado final del embudo."
            />
          </div>

          {/* Mini resumen bajo el embudo */}
          <div className="mt-5 pt-4 border-t border-slate-50 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-black text-slate-800">{con_tm}</p>
              <div className="flex items-center justify-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Con TM</p>
                <InfoTooltip text="Prospectos activos que ya tienen Toma de Medidas programada o realizada. Pueden avanzar a ODP." />
              </div>
            </div>
            <div>
              <p className={`text-lg font-black ${sin_tm > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{sin_tm}</p>
              <div className="flex items-center justify-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Sin TM</p>
                <InfoTooltip text="Prospectos activos sin Toma de Medidas. No pueden avanzar a ODP hasta que se programe una visita técnica. Requieren atención inmediata." />
              </div>
            </div>
            <div>
              <p className={`text-lg font-black ${sin_actividad_7d > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{sin_actividad_7d}</p>
              <div className="flex items-center justify-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase">+7d sin act.</p>
                <InfoTooltip text="Prospectos sin ningún movimiento (cambio de estado, nota o TM) en los últimos 7 días. Riesgo de que el proyecto se enfríe o el cliente pierda interés." />
              </div>
            </div>
          </div>
        </div>

        {/* Por asesor */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-center">
              <div>
                <h3 className="font-black text-slate-800 text-sm">Ranking por Asesor</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Tasa de aprobación y volumen por asesor</p>
              </div>
              <InfoTooltip text="Asesores ordenados por tasa de aprobación de prospectos (aprobados ÷ total gestionados). La barra de progreso refleja visualmente la tasa. Verde ≥30%, naranja ≥15%, rojo <15%." />
            </div>
          </div>
          {por_asesor.length === 0 ? (
            <p className="text-center text-slate-300 text-sm py-6">Sin datos de asesores</p>
          ) : (
            <div className="space-y-3">
              {(por_asesor as any[]).slice(0, 8).map((a: any, i: number) => {
                const initials = a.nombre.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                const avColors = ['from-indigo-400 to-violet-500','from-emerald-400 to-teal-500','from-amber-400 to-orange-500','from-rose-400 to-pink-500','from-blue-400 to-cyan-500'];
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                return (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${avColors[i % avColors.length]} flex items-center justify-center font-black text-white text-xs flex-shrink-0 shadow-sm`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {medal && <span className="text-xs">{medal}</span>}
                        <p className="text-sm font-bold text-slate-800 truncate">{a.nombre}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${a.tasa}%` }} />
                        </div>
                        <span className={`text-[10px] font-black ${a.tasa >= 30 ? 'text-emerald-600' : a.tasa >= 15 ? 'text-amber-500' : 'text-rose-500'}`}>{a.tasa}%</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-black text-slate-700">{a.total} total</p>
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <span className="text-[10px] font-bold text-emerald-600">{a.aprobados}✓</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Estado general */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="mb-4 flex items-center">
          <div>
            <h3 className="font-black text-slate-800 text-sm">Estado General de Prospectos</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">Distribución de todos los prospectos según su resultado en el sistema</p>
          </div>
          <InfoTooltip text="Resumen del estado actual de todos los prospectos del período. 'En Gestión' son los que siguen activos, 'Aprobados' los que el cliente aceptó, 'No Aprobados' los rechazados, y 'Con ODP' los que ya generaron una Orden de Producción." />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'En Gestión', val: activos,
              icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 border-amber-100',
              tooltip: 'Prospectos activos que tienen un asesor trabajando en ellos y no han sido cerrados aún.',
            },
            {
              label: 'Aprobados', val: aprobados,
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 border-emerald-100',
              tooltip: 'Prospectos que el cliente aprobó. Están listos para convertirse en ODP si aún no la tienen vinculada.',
            },
            {
              label: 'No Aprobados', val: no_aprobados,
              icon: <AlertCircle className="w-5 h-5 text-rose-400" />, bg: 'bg-rose-50 border-rose-100',
              tooltip: 'Prospectos cerrados sin aprobación: el cliente rechazó la propuesta o el proyecto no prosperó.',
            },
            {
              label: 'Con ODP', val: embudo.convertidos_odp || 0,
              icon: <CheckCircle2 className="w-5 h-5 text-indigo-500" />, bg: 'bg-indigo-50 border-indigo-100',
              tooltip: 'Prospectos aprobados que ya tienen una Orden de Producción vinculada en el sistema productivo. Es el resultado final exitoso.',
            },
          ].map(item => (
            <div key={item.label} className={`${item.bg} border rounded-xl p-4 flex items-center gap-3`}>
              {item.icon}
              <div>
                <p className="text-xl font-black text-slate-800">{item.val}</p>
                <div className="flex items-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{item.label}</p>
                  <InfoTooltip text={item.tooltip} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ProspectosStats;
