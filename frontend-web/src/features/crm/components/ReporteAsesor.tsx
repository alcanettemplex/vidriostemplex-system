import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertCircle, RefreshCw, ChevronDown, AlertTriangle, CheckCircle2, XCircle, Snowflake, Timer,
  Users, PhoneCall, Target, DollarSign, Route,
} from '../../../components/ui/icons';
import type { IconComponent } from '../../../components/ui/icons';
import { apiGetReporteAsesor } from '../crmService';
import { useAsesoresCRM } from '../hooks/useAsesoresCRM';
import {
  TarjetaKPI, ChartCard, BarraMagnitud, Ayuda, CATEGORICA, tonoEtapa,
} from '../../../components/charts';
import type { TonoKPI } from '../../../components/charts';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

// Etapas activas en orden del proceso → rampa azul (más oscuro = primera etapa). Bolsa común y
// Frío no son avance: van en gris.
const ETAPA_CONFIG: Record<string, { label: string }> = {
  NUEVO:          { label: 'Bolsa Común' },
  ASIGNADO:       { label: 'Asignado' },
  EN_CONTACTO:    { label: 'En Contacto' },
  COTIZANDO:      { label: 'Cotizando' },
  SEGUIMIENTO:    { label: 'Seguimiento' },
  VISITA_TECNICA: { label: 'V. Técnica' },
  FRIO:           { label: 'Frío' },
  APROBADO:       { label: 'Aprobado' },
  PERDIDO:        { label: 'Perdido' },
};
const ORDEN_ETAPAS = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA'];
const colorEtapa = (etapa: string) => {
  const i = ORDEN_ETAPAS.indexOf(etapa);
  return i < 0 ? '#6f7a8c' : tonoEtapa(i, ORDEN_ETAPAS.length);
};

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => <Ayuda texto={text} />;

interface Props { esVistaGlobal: boolean; fecha_desde?: string | null; fecha_hasta?: string | null; }

const ReporteAsesor: React.FC<Props> = ({ esVistaGlobal, fecha_desde, fecha_hasta }) => {
  const [reporte, setReporte] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const asesores = useAsesoresCRM(esVistaGlobal);
  const [asesorSeleccionado, setAsesorSeleccionado] = useState<number | undefined>(undefined);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const periodoLabel = (fecha_desde && fecha_hasta) ? `${fecha_desde} → ${fecha_hasta}` : 'Acumulado';

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await apiGetReporteAsesor(fecha_desde || undefined, fecha_hasta || undefined, asesorSeleccionado);
      setReporte(data);
    } catch {
      setError('No se pudo cargar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [fecha_desde, fecha_hasta, asesorSeleccionado]);

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

  if (error || !reporte) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-900 text-sm font-semibold">{error || 'Sin datos'}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-templex-600 hover:bg-templex-700 text-white rounded-xl text-sm font-bold">Reintentar</button>
    </div>
  );

  const {
    asesor, leads_asignados = 0, contactos_realizados = 0, seguimientos = 0,
    cambios_estado = 0, tiempo_prom_primera_respuesta_h = 0,
    leads_por_etapa = {}, etapa_cuello, leads_aprobados = 0,
    leads_perdidos = 0, leads_activos = 0, tasa_conversion = 0,
    motivos_perdida = {}, monto_gestionado = 0,
  } = reporte;

  const etapasActivas = Object.entries(leads_por_etapa as Record<string, number>)
    .filter(([e, c]) => c > 0 && !['APROBADO', 'PERDIDO'].includes(e))
    .sort(([, a], [, b]) => b - a);

  const etapasResultado = Object.entries(leads_por_etapa as Record<string, number>)
    .filter(([e, c]) => c > 0 && ['APROBADO', 'PERDIDO', 'FRIO'].includes(e));

  const motivosList = Object.entries(motivos_perdida as Record<string, number>)
    .map(([m, c]) => ({ motivo: m, count: c }))
    .sort((a, b) => b.count - a.count);

  const maxEtapa = Math.max(...etapasActivas.map(([, c]) => c), 1);
  const totalMotivos = motivosList.reduce((acc, m) => acc + m.count, 0) || 1;

  const KPIS_SECUNDARIOS = [
    {
      label: 'Aprobados', val: leads_aprobados,
      desc: 'Leads cerrados como ganados en el período',
      icono: CheckCircle2 as IconComponent, tono: 'emerald' as TonoKPI, txt: 'text-emerald-700',
      tooltip: 'Leads cerrados exitosamente como APROBADO. Es la métrica de resultado más importante del asesor: refleja cuántos negocios reales generó en el período.',
    },
    {
      label: 'Perdidos', val: leads_perdidos,
      desc: 'Leads cerrados sin conversión en el período',
      icono: XCircle as IconComponent, tono: 'rose' as TonoKPI, txt: 'text-rose-700',
      tooltip: 'Leads cerrados como PERDIDO con motivo registrado. Ver la sección "Razones de Pérdida" para entender qué está fallando en el proceso.',
    },
    {
      label: 'Frío', val: (leads_por_etapa as any)['FRIO'] || 0,
      desc: 'Leads pausados por baja probabilidad de cierre',
      icono: Snowflake as IconComponent, tono: 'slate' as TonoKPI, txt: 'text-slate-900',
      tooltip: 'Leads marcados como FRÍO: el cliente dejó de responder tras múltiples intentos. No están descartados definitivamente, pueden reactivarse si el cliente vuelve a tomar contacto.',
    },
    {
      label: 'T° 1ª Respuesta',
      val: `${tiempo_prom_primera_respuesta_h}h`,
      desc: 'Horas promedio hasta el primer contacto con el lead',
      icono: Timer as IconComponent, tono: (tiempo_prom_primera_respuesta_h > 4 ? 'rose' : 'amber') as TonoKPI,
      txt: tiempo_prom_primera_respuesta_h > 4 ? 'text-rose-700' : 'text-amber-700',
      tooltip: 'Horas promedio entre que se asigna el lead al asesor y su primer intento de contacto registrado. Más de 4 horas (rojo) indica demora en atender nuevas oportunidades. Lo ideal es contactar en menos de 2 horas.',
    },
  ];

  const ACTIVIDAD_ITEMS = [
    {
      label: 'Contactos', val: contactos_realizados, Icono: PhoneCall as IconComponent,
      tooltip: 'Intentos de contacto con el cliente registrados en el período. Cada llamada, mensaje o reunión anotada en el sistema cuenta aquí.',
    },
    {
      label: 'Seguimientos', val: seguimientos, Icono: RefreshCw as IconComponent,
      tooltip: 'Intentos de seguimiento adicionales tras el primer contacto. Cada toque de "seguimiento" que el asesor registra en el lead suma a este contador.',
    },
    {
      label: 'Movimientos', val: cambios_estado, Icono: Route as IconComponent,
      tooltip: 'Cambios de etapa realizados por el asesor durante el período (ej: Asignado→En Contacto, Cotizando→Aprobado). Refleja la actividad de avance en el pipeline.',
    },
    {
      label: 'T° Respuesta', val: `${tiempo_prom_primera_respuesta_h}h`, Icono: Timer as IconComponent,
      tooltip: 'Tiempo promedio en horas desde la asignación del lead hasta el primer contacto registrado. Mide la agilidad de respuesta del asesor ante nuevas oportunidades.',
    },
  ];

  return (
    <div className="space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Reporte de Actividad</h2>
          <p className="text-xs text-slate-700 mt-0.5">
            {asesor} — {periodoLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {esVistaGlobal && asesores.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 hover:bg-slate-50 shadow-sm min-w-[160px] justify-between"
              >
                <span className="truncate">
                  {asesorSeleccionado
                    ? asesores.find(a => a.id === asesorSeleccionado)?.nombre_completo || 'Asesor'
                    : 'Vista Global'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[200px]">
                  <button
                    onClick={() => { setAsesorSeleccionado(undefined); setDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-slate-50"
                  >
                    Vista Global (todos)
                  </button>
                  {asesores.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => { setAsesorSeleccionado(a.id); setDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-slate-50 truncate"
                    >
                      {a.nombre_completo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={cargar}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaKPI densa indice={0} rotulo="Leads Asignados" icono={Users} tono="violet"
          cifra={String(leads_asignados)} descripcion={`${leads_activos} activos`}
          ayuda="Total de leads que el asesor tiene o tuvo asignados en el período. Incluye todos los estados: activos, aprobados, perdidos y fríos. Es el volumen total de trabajo gestionado." />
        <TarjetaKPI densa indice={1} rotulo="Contactos" icono={PhoneCall} tono="blue"
          cifra={String(contactos_realizados)} descripcion={`${seguimientos} seguimientos`}
          ayuda="Número de intentos de contacto registrados por el asesor. Los seguimientos son interacciones adicionales después del primer contacto (recordatorios, actualizaciones, re-consultas)." />
        <TarjetaKPI densa indice={2} rotulo="Tasa de Conversión" icono={Target} tono="emerald"
          cifra={`${tasa_conversion}%`} descripcion={`${leads_aprobados} aprobados`}
          cifraClassName={tasa_conversion >= 30 ? 'text-emerald-700' : tasa_conversion >= 15 ? 'text-amber-700' : 'text-rose-700'}
          ayuda="Porcentaje de los leads del asesor que cerraron como APROBADO. Verde ≥30%, ámbar ≥15%, rojo <15%. Comparar con el promedio del equipo para evaluar rendimiento relativo." />
        <TarjetaKPI densa indice={3} rotulo="Monto Gestionado" icono={DollarSign} tono="indigo"
          cifra={fmtCOP(monto_gestionado)} descripcion={`${cambios_estado} movimientos`}
          ayuda="Suma de las cotizaciones proyectadas de todos los leads asignados al asesor. Refleja el valor total del pipeline que está gestionando, sin importar si ya cerraron o no." />
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIS_SECUNDARIOS.map((k, i) => (
          <TarjetaKPI key={k.label} densa indice={4 + i} rotulo={k.label} icono={k.icono} tono={k.tono}
            cifra={String(k.val)} cifraClassName={k.txt} descripcion={k.desc} ayuda={k.tooltip} />
        ))}
      </div>

      {/* Embudo personal + Resultados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Embudo activo (cuello de botella) */}
        <ChartCard indice={8}
          titulo={<span className="inline-flex items-center">Embudo Personal<InfoTooltip text="Distribución de los leads activos del asesor entre las etapas del pipeline. El cuello de botella es la etapa con mayor acumulación relativa, indicando dónde se están estancando los leads." /></span>}
          descripcion="Leads activos por etapa, de mayor a menor"
          acciones={etapa_cuello ? (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-amber-800 bg-amber-50 px-2 py-1 rounded-full ring-1 ring-amber-200">
              <AlertTriangle className="w-3.5 h-3.5" /> Cuello: {ETAPA_CONFIG[etapa_cuello]?.label || etapa_cuello}
            </span>
          ) : undefined}>
          {etapasActivas.length === 0 ? (
            <p className="text-center text-slate-700 text-sm py-6">Sin leads activos</p>
          ) : (
            <div className="space-y-1.5">
              {etapasActivas.map(([etapa, count], i) => {
                const esCuello = etapa === etapa_cuello;
                return (
                  <div key={etapa} className={`rounded-xl px-2 py-1.5 ${esCuello ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}>
                    <BarraMagnitud indice={i} anchoLabel="w-28"
                      label={<span className="inline-flex items-center gap-1">{esCuello && <AlertTriangle className="w-3 h-3 text-amber-700" />}{ETAPA_CONFIG[etapa]?.label || etapa}</span>}
                      valor={count} max={maxEtapa} color={colorEtapa(etapa)} cifra={`${count} leads`} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Resultados (aprobados/perdidos/fríos) */}
          {etapasResultado.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center mb-2">
                <p className="text-[12px] font-semibold text-slate-900">Resultados del período</p>
                <InfoTooltip text="Leads cerrados en el período distribuidos por resultado: Aprobado (ganados), Perdido (descartados con motivo), Frío (sin respuesta del cliente)." />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {etapasResultado.map(([etapa, count]) => (
                  <div key={etapa}>
                    <p className="text-lg font-bold text-slate-900 tabular-nums">{count}</p>
                    <p className="text-[12px] text-slate-900 font-semibold">{ETAPA_CONFIG[etapa]?.label || etapa}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        {/* Motivos de pérdida + Actividad */}
        <div className="space-y-3">
          <ChartCard indice={9}
            titulo={<span className="inline-flex items-center">Razones de Pérdida<InfoTooltip text="Motivos que el asesor registró al cerrar leads como PERDIDO en el período. Cada barra es proporcional al motivo más frecuente. Identificar los motivos más frecuentes permite ajustar la estrategia de ventas." /></span>}
            descripcion="Motivos registrados al cerrar un lead como PERDIDO">
            {motivosList.length === 0 ? (
              <div className="flex flex-col items-center py-4 gap-1.5">
                <CheckCircle2 weight="duotone" className="w-8 h-8 text-emerald-600" />
                <p className="text-sm text-slate-900 font-semibold">Sin pérdidas en este período</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {motivosList.map((m, i) => (
                  <BarraMagnitud key={m.motivo} indice={i} anchoLabel="w-40" label={m.motivo}
                    valor={m.count} max={motivosList[0].count} color={CATEGORICA[0]}
                    cifraSecundaria={`${Math.round((m.count / totalMotivos) * 100)}%`} />
                ))}
              </div>
            )}
          </ChartCard>

          <ChartCard indice={10}
            titulo={<span className="inline-flex items-center">Actividad Total<InfoTooltip text="Resumen cuantitativo de toda la actividad del asesor: contactos intentados, seguimientos realizados, cambios de etapa y velocidad de respuesta. Refleja el nivel de intensidad de trabajo, independientemente de los resultados." /></span>}
            descripcion="Todas las interacciones registradas en el período">
            <div className="grid grid-cols-2 gap-3">
              {ACTIVIDAD_ITEMS.map(item => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-center">
                  <item.Icono weight="duotone" className="w-5 h-5 text-slate-700 mx-auto" />
                  <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{item.val}</p>
                  <div className="flex items-center justify-center">
                    <p className="text-[12px] font-semibold text-slate-900">{item.label}</p>
                    <InfoTooltip text={item.tooltip} />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
};

export default ReporteAsesor;
