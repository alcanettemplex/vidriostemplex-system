import React, { useEffect, useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, AlertTriangle, CheckCircle2, Clock, TrendingUp, Users, Target, Timer } from '../../../components/ui/icons';
import type { IconComponent } from '../../../components/ui/icons';
import { apiGetStatsProspectos } from '../crmService';
import { TarjetaKPI, ChartCard, Medidor, Iniciales, Ayuda, tonoEtapa, colorPorEntidad } from '../../../components/charts';
import type { TonoKPI } from '../../../components/charts';

interface Props { esVistaGlobal: boolean; fecha_desde?: string | null; fecha_hasta?: string | null; asesor_id?: number; }

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => <Ayuda texto={text} />;

// ─── Paso del embudo ──────────────────────────────────────────────────────────
// Rampa azul por etapa (más oscuro = boca del embudo). El valor va en tinta, fuera de la
// barra: dentro de una barra corta el número se recortaba.
const EmbudoStep: React.FC<{
  label: string; value: number; total: number;
  color: string; tooltip?: string;
}> = ({ label, value, total, color, tooltip }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center">
          <span className="text-[12px] font-semibold text-slate-900">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        <span className="text-[12px] text-slate-900 font-semibold tabular-nums">{value} <span className="text-slate-700 font-normal">({pct}%)</span></span>
      </div>
      <Medidor pct={total > 0 ? (value / total) * 100 : 0} color={color} alto={10} />
    </div>
  );
};

const ProspectosStats: React.FC<Props> = ({ esVistaGlobal, fecha_desde, fecha_hasta, asesor_id }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodoLabel = (fecha_desde && fecha_hasta) ? `${fecha_desde} → ${fecha_hasta}` : 'Acumulado';

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await apiGetStatsProspectos(fecha_desde || undefined, fecha_hasta || undefined, asesor_id);
      setStats(data);
    } catch {
      setError('No se pudo cargar la información de prospectos.');
    } finally {
      setLoading(false);
    }
  }, [fecha_desde, fecha_hasta, asesor_id]);

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
      <p className="text-slate-900 text-sm font-semibold">{error || 'Sin datos'}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-templex-600 hover:bg-templex-700 text-white rounded-xl text-sm font-bold">Reintentar</button>
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
      icono: Users as IconComponent, tono: 'violet' as TonoKPI,
      tooltip: 'Cantidad total de prospectos registrados en el período. Un prospecto es un proyecto concreto con alta probabilidad de convertirse en ODP, distinto de un lead CRM: ya existe un contexto de proyecto definido (cliente, producto, ubicación).',
    },
    {
      label: 'Activos (en gestión)',
      value: String(activos),
      sub: `${no_aprobados} no aprobados`,
      icono: Clock as IconComponent, tono: 'amber' as TonoKPI,
      tooltip: 'Prospectos que siguen en proceso: tienen asesor asignado y no han sido cerrados. Los "no aprobados" son prospectos que el cliente rechazó o no prosperaron, pero que también se cerraron en el período.',
    },
    {
      label: 'Tasa Conversión',
      value: `${tasa_conversion}%`,
      sub: `${aprobados} aprobados`,
      icono: Target as IconComponent, tono: 'emerald' as TonoKPI,
      tooltip: 'Porcentaje de prospectos del período que culminaron como APROBADO. Verde ≥30% (excelente), amarillo ≥15% (aceptable), rojo <15% (requiere revisión). Una tasa alta indica buena calificación inicial de los proyectos.',
    },
    {
      label: 'T° Prom. Aprobación',
      value: `${tiempo_prom_aprobacion_dias}d`,
      sub: 'creación → aprobación',
      icono: Timer as IconComponent, tono: 'blue' as TonoKPI,
      tooltip: 'Días promedio entre la creación del prospecto y su aprobación formal. Solo se calcula sobre los que tienen fecha de aprobación registrada. Cuanto menor, más ágil es el ciclo de cierre de proyectos.',
    },
  ];

  return (
    <div className="space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Prospectos</h2>
          <p className="text-xs text-slate-700 mt-0.5">Pipeline de proyectos — {periodoLabel}</p>
        </div>
        <button
          onClick={cargar}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* Alertas */}
      {hayAlertas && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <div className="flex items-center">
              <p className="text-sm font-bold text-amber-800">Requieren atención</p>
              <InfoTooltip text="Prospectos que necesitan acción inmediata: sin Toma de Medidas programada (no pueden avanzar a ODP) o sin ningún movimiento en los últimos 7 días (riesgo de que el cliente se enfríe)." />
            </div>
            <div className="flex flex-wrap gap-3">
              {sin_tm > 0 && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                  {sin_tm} prospecto{sin_tm > 1 ? 's' : ''} activo{sin_tm > 1 ? 's' : ''} sin Toma de Medidas
                </span>
              )}
              {sin_actividad_7d > 0 && (
                <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200">
                  {sin_actividad_7d} sin actividad en +7 días
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIS.map((k, i) => (
          <TarjetaKPI key={k.label} densa indice={i} rotulo={k.label} icono={k.icono} tono={k.tono}
            cifra={k.value} descripcion={k.sub} ayuda={k.tooltip} />
        ))}
      </div>

      {/* Embudo + Por Asesor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Embudo visual */}
        <ChartCard indice={4}
          titulo={<span className="inline-flex items-center">Embudo Prospecto → ODP<InfoTooltip text="Muestra cuántos prospectos superan cada etapa del proceso. Los porcentajes son sobre el total de prospectos creados. Una caída brusca entre etapas señala el punto de fricción más crítico en el ciclo de proyectos." /></span>}
          descripcion="Flujo completo de conversión; el % es sobre los prospectos creados">
          <div className="space-y-4">
            <EmbudoStep
              label="Prospectos Creados" value={embudo.creados || 0} total={embudo.creados || 1} color={tonoEtapa(0, 4)}
              tooltip="Total de prospectos registrados en el período. Es la boca del embudo: el volumen bruto de proyectos captados."
            />
            <EmbudoStep
              label="Con Toma de Medidas" value={embudo.con_tm || 0} total={embudo.creados || 1} color={tonoEtapa(1, 4)}
              tooltip="Prospectos que ya tienen al menos una visita técnica (TM) programada o realizada. Sin TM no se puede generar una ODP."
            />
            <EmbudoStep
              label="Aprobados" value={embudo.aprobados || 0} total={embudo.creados || 1} color={tonoEtapa(2, 4)}
              tooltip="Prospectos que el cliente o jefe de producción aprobó formalmente. Están listos para convertirse en Orden de Producción."
            />
            <EmbudoStep
              label="Convertidos a ODP" value={embudo.convertidos_odp || 0} total={embudo.creados || 1} color={tonoEtapa(3, 4)}
              tooltip="Prospectos aprobados cuya aprobación ya generó una Orden de Producción vinculada en el sistema productivo. Es el resultado final del embudo."
            />
          </div>

          {/* Mini resumen bajo el embudo */}
          <div className="mt-5 pt-4 border-t border-slate-50 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-slate-900">{con_tm}</p>
              <div className="flex items-center justify-center">
                <p className="text-[11px] text-slate-900 font-semibold uppercase">Con TM</p>
                <InfoTooltip text="Prospectos activos que ya tienen Toma de Medidas programada o realizada. Pueden avanzar a ODP." />
              </div>
            </div>
            <div>
              <p className={`text-lg font-bold ${sin_tm > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{sin_tm}</p>
              <div className="flex items-center justify-center">
                <p className="text-[11px] text-slate-900 font-semibold uppercase">Sin TM</p>
                <InfoTooltip text="Prospectos activos sin Toma de Medidas. No pueden avanzar a ODP hasta que se programe una visita técnica. Requieren atención inmediata." />
              </div>
            </div>
            <div>
              <p className={`text-lg font-bold ${sin_actividad_7d > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{sin_actividad_7d}</p>
              <div className="flex items-center justify-center">
                <p className="text-[11px] text-slate-900 font-semibold uppercase">+7d sin act.</p>
                <InfoTooltip text="Prospectos sin ningún movimiento (cambio de estado, nota o TM) en los últimos 7 días. Riesgo de que el proyecto se enfríe o el cliente pierda interés." />
              </div>
            </div>
          </div>
        </ChartCard>

        {/* Por asesor */}
        <ChartCard indice={5}
          titulo={<span className="inline-flex items-center"><TrendingUp className="w-4 h-4 text-slate-700 mr-2" />Ranking por Asesor<InfoTooltip text="Asesores ordenados por tasa de aprobación de prospectos (aprobados ÷ total gestionados). La barra de progreso refleja visualmente la tasa. Verde ≥30%, ámbar ≥15%, rojo <15%." /></span>}
          descripcion="Tasa de aprobación y volumen por asesor">
          {por_asesor.length === 0 ? (
            <p className="text-center text-slate-700 text-sm py-6">Sin datos de asesores</p>
          ) : (
            <div className="space-y-3">
              {(por_asesor as any[]).slice(0, 8).map((a: any, i: number) => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                  <span className={`w-5 shrink-0 text-center text-[12px] font-bold tabular-nums ${i < 3 ? 'text-templex-700' : 'text-slate-700'}`}>{i + 1}</span>
                  <Iniciales nombre={a.nombre} tamano={34} color={colorPorEntidad(a.id ?? a.nombre)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.nombre}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Medidor pct={a.tasa} alto={6} className="flex-1" />
                      <span className={`text-[12px] font-bold tabular-nums ${a.tasa >= 30 ? 'text-emerald-700' : a.tasa >= 15 ? 'text-amber-700' : 'text-rose-700'}`}>{a.tasa}%</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[12px] text-slate-700 tabular-nums">{a.total} total</p>
                    <p className="flex items-center gap-1 justify-end mt-0.5 text-[12px] font-semibold text-emerald-700 tabular-nums">
                      <CheckCircle2 className="w-3.5 h-3.5" />{a.aprobados}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Estado general */}
      <ChartCard indice={6}
        titulo={<span className="inline-flex items-center">Estado General de Prospectos<InfoTooltip text="Resumen del estado actual de todos los prospectos del período. 'En Gestión' son los que siguen activos, 'Aprobados' los que el cliente aceptó, 'No Aprobados' los rechazados, y 'Con ODP' los que ya generaron una Orden de Producción." /></span>}
        descripcion="Distribución de todos los prospectos según su resultado en el sistema">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'En Gestión', val: activos,
              icon: <Clock className="w-5 h-5 text-amber-700" />, bg: 'bg-white border-slate-200',
              tooltip: 'Prospectos activos que tienen un asesor trabajando en ellos y no han sido cerrados aún.',
            },
            {
              label: 'Aprobados', val: aprobados,
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-700" />, bg: 'bg-white border-slate-200',
              tooltip: 'Prospectos que el cliente aprobó. Están listos para convertirse en ODP si aún no la tienen vinculada.',
            },
            {
              label: 'No Aprobados', val: no_aprobados,
              icon: <AlertCircle className="w-5 h-5 text-rose-700" />, bg: 'bg-white border-slate-200',
              tooltip: 'Prospectos cerrados sin aprobación: el cliente rechazó la propuesta o el proyecto no prosperó.',
            },
            {
              label: 'Con ODP', val: embudo.convertidos_odp || 0,
              icon: <CheckCircle2 className="w-5 h-5 text-templex-700" />, bg: 'bg-white border-slate-200',
              tooltip: 'Prospectos aprobados que ya tienen una Orden de Producción vinculada en el sistema productivo. Es el resultado final exitoso.',
            },
          ].map(item => (
            <div key={item.label} className={`${item.bg} border rounded-xl p-4 flex items-center gap-3`}>
              {item.icon}
              <div>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{item.val}</p>
                <div className="flex items-center">
                  <p className="text-[12px] font-semibold text-slate-900">{item.label}</p>
                  <InfoTooltip text={item.tooltip} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
};

export default ProspectosStats;
