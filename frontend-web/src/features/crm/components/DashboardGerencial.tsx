import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Trophy, AlertTriangle, DollarSign, Target, Users, UserCheck, Activity,
} from '../../../components/ui/icons';
import { toast } from 'react-toastify';
import { apiGetCRMStats } from '../crmService';
import {
  TarjetaKPI, ChartCard, BarraMagnitud, BarraApilada, Medidor, Iniciales, Ayuda,
  CATEGORICA, ESTADO, tonoEtapa, colorPorEntidad,
} from '../../../components/charts';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCOP = (v: number, compact = false) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {})
  }).format(v);

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
// La copia local no mostraba el texto: solo el "?". Ahora es la ayuda común del kit.
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => <Ayuda texto={text} />;

// ─── Origen de negocio ────────────────────────────────────────────────────────
// Los 3 canales suman el total de ODPs del período: es un reparto de un total, así que va en
// barra apilada (antes, donut). Paleta categórica en su orden validado.
const ORIGEN_COLORS = [CATEGORICA[0], CATEGORICA[1], CATEGORICA[2]];

// ─── Resultado del pipeline ───────────────────────────────────────────────────
// Aprobado / activo / frío / perdido SÍ son estados con significado de negocio: llevan el
// semáforo, y siempre con su nombre escrito al lado.
const PIPELINE_COLOR = {
  aprobados: ESTADO.bien,
  activos: CATEGORICA[0],
  frios: '#6f7a8c',
  perdidos: ESTADO.critico,
} as const;

// ─── Card de asesor ───────────────────────────────────────────────────────────
// Etapas activas del lead en orden del proceso → rampa azul (más oscuro = primera etapa).
const ETAPAS_ACTIVAS = ['ASIGNADO', 'EN_CONTACTO', 'COTIZANDO', 'SEGUIMIENTO', 'VISITA_TECNICA', 'FRIO'];
const ETAPA_LABELS: Record<string, string> = {
  NUEVO: 'Nuevo', ASIGNADO: 'Asig.', EN_CONTACTO: 'Contacto',
  COTIZANDO: 'Cotiz.', SEGUIMIENTO: 'Seguim.', VISITA_TECNICA: 'V.Tec.',
  FRIO: 'Frío', APROBADO: 'Apro.', PERDIDO: 'Perd.',
};
// Frío no es una etapa del avance (el cliente dejó de responder): va en gris.
const colorEtapa = (etapa: string) => {
  const i = ETAPAS_ACTIVAS.indexOf(etapa);
  return i < 0 || etapa === 'FRIO' ? '#6f7a8c' : tonoEtapa(i, ETAPAS_ACTIVAS.length - 1);
};

const AsesorCard: React.FC<{
  idx: number; id: number | string; nombre: string; total: number;
  aprobados: number; perdidos: number; tasa: number; monto: number;
  porEstado?: Record<string, number>; etapaCuello?: string | null;
}> = ({ idx, id, nombre, total, aprobados, perdidos, tasa, monto, porEstado, etapaCuello }) => {
  const etapasActivas = porEstado
    ? Object.entries(porEstado)
      .filter(([e, c]) => c > 0 && !['APROBADO', 'PERDIDO', 'NUEVO'].includes(e))
      .sort(([a], [b]) => ETAPAS_ACTIVAS.indexOf(a) - ETAPAS_ACTIVAS.indexOf(b))
    : [];
  const tono = tasa >= 30 ? 'text-emerald-700' : tasa >= 15 ? 'text-amber-700' : 'text-rose-700';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-card-hover transition-shadow duration-200">
      <div className="flex items-center gap-3">
        <span className={`w-5 shrink-0 text-center text-[12px] font-bold tabular-nums ${idx < 3 ? 'text-templex-700' : 'text-slate-700'}`}>{idx + 1}</span>
        <Iniciales nombre={nombre} tamano={40} color={colorPorEntidad(id)} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{nombre}</p>
          <p className="text-[12px] text-slate-700 mt-0.5">{total} leads gestionados</p>
          <div className="mt-2 flex items-center gap-2">
            <Medidor pct={tasa} alto={6} className="flex-1" />
            <span className={`text-[12px] font-bold tabular-nums ${tono}`}>{tasa}% conv.</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <p className="text-sm font-semibold text-slate-900 tabular-nums">{fmtCOP(monto, true)}</p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-emerald-700" title="Aprobados">
              <CheckCircle2 className="w-3.5 h-3.5" />{aprobados}
            </span>
            <span className="flex items-center gap-0.5 text-[12px] font-semibold text-rose-700" title="Perdidos">
              <XCircle className="w-3.5 h-3.5" />{perdidos}
            </span>
          </div>
        </div>
      </div>

      {/* Barra segmentada por etapa */}
      {etapasActivas.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-[12px] font-semibold text-slate-900 mb-1.5">Leads activos por etapa</p>
          <BarraApilada alto={8} conLeyenda={false} segmentos={etapasActivas.map(([etapa, count]) => ({
            clave: etapa, label: ETAPA_LABELS[etapa] || etapa, valor: count, color: colorEtapa(etapa),
          }))} />
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
              {etapasActivas.map(([etapa, count]) => (
                <span key={etapa} className="flex items-center gap-1 text-[12px] text-slate-800">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: colorEtapa(etapa) }} />
                  {ETAPA_LABELS[etapa]}: <span className="font-semibold tabular-nums">{count}</span>
                </span>
              ))}
            </div>
            {etapaCuello && (
              <span className="flex items-center gap-1 text-[12px] font-semibold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-full ring-1 ring-amber-200 whitespace-nowrap" title="Etapa donde más se acumulan sus leads">
                <AlertTriangle className="w-3 h-3" /> {ETAPA_LABELS[etapaCuello] || etapaCuello}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
interface Props { esVistaGlobal: boolean; fecha_desde?: string | null; fecha_hasta?: string | null; asesor_id?: number; }

const DashboardGerencial: React.FC<Props> = ({ esVistaGlobal, fecha_desde, fecha_hasta, asesor_id }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try { const { data } = await apiGetCRMStats(fecha_desde || undefined, fecha_hasta || undefined, asesor_id); setStats(data); }
    catch { toast.error('No se pudieron cargar las estadísticas.'); }
    finally { setLoading(false); }
  }, [fecha_desde, fecha_hasta, asesor_id]);

  useEffect(() => { fetchStats(); }, [fetchStats, esVistaGlobal]);

  const periodoLabel = (fecha_desde && fecha_hasta) ? `${fecha_desde} → ${fecha_hasta}` : 'Acumulado';

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-2xl animate-pulse border border-slate-100" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-slate-100" />
        ))}
      </div>
      <div className="h-72 bg-white rounded-2xl animate-pulse border border-slate-100" />
    </div>
  );

  if (!stats) return null;

  const {
    total = 0, monto_total_proyectado = 0, tasa_conversion = 0,
    nuevos_clientes = 0, nuevos_prospectos = 0, nuevos_crm = 0, clientes_recurrentes = 0,
    monto_nuevos_crm = 0, monto_nuevos_clientes: monto_nuevos_prospectos = 0, monto_clientes_recurrentes = 0,
    leads_con_odp = 0, leads_aprobados_sin_odp = 0,
    monto_real_aprobados = 0,
    tiempo_promedio_cierre_dias = 0,
    stats_por_asesor = [], por_estado = {}
  } = stats;

  const aprobados = (por_estado as any)['APROBADO']       || 0;
  const perdidos  = (por_estado as any)['PERDIDO']        || 0;
  const frios     = (por_estado as any)['FRIO']           || 0;
  const nuevo     = (por_estado as any)['NUEVO']          || 0;
  const activos   = total - aprobados - perdidos - frios - nuevo;

  // Opción D: leads trabajando activamente ahora
  const leadsEnGestion = (
    ((por_estado as any)['EN_CONTACTO']    || 0) +
    ((por_estado as any)['COTIZANDO']      || 0) +
    ((por_estado as any)['SEGUIMIENTO']    || 0) +
    ((por_estado as any)['VISITA_TECNICA'] || 0)
  );

  const pctAprobados = total > 0 ? (aprobados / total) * 100 : 0;
  const pctFrios     = total > 0 ? (frios     / total) * 100 : 0;
  const pctPerdidos  = total > 0 ? (perdidos  / total) * 100 : 0;
  const pctActivos   = total > 0 ? (activos   / total) * 100 : 0;

  // Origen de negocio: los 3 canales suman el total de ODPs del período.
  const totalOrigen = nuevos_crm + nuevos_prospectos + clientes_recurrentes;
  const origenItems = [
    { label: 'Vía CRM (Leads)', count: nuevos_crm, monto: monto_nuevos_crm },
    { label: 'Prospectos directos', count: nuevos_prospectos, monto: monto_nuevos_prospectos },
    { label: 'Clientes recurrentes', count: clientes_recurrentes, monto: monto_clientes_recurrentes },
  ].map((o, i) => ({
    ...o,
    color: ORIGEN_COLORS[i % ORIGEN_COLORS.length],
    pct: totalOrigen > 0 ? Math.round((o.count / totalOrigen) * 100) : 0,
  }));

  // La lista llega ordenada por conversión: el primero es el top de conversión. El de mayor
  // pipeline se busca aparte — antes se mostraba el monto del primero bajo ese título.
  const topConversion = stats_por_asesor[0];
  const mayorPipeline = (stats_por_asesor as any[]).reduce(
    (max, a) => (!max || (a.monto_gestionado || 0) > (max.monto_gestionado || 0) ? a : max), null as any);

  return (
    <div className="space-y-4 pb-10">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Dashboard Gerencial</h2>
          <p className="text-xs text-slate-700 flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            Período: {periodoLabel} — vista consolidada del equipo comercial
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>

      {/* ── KPIs principales ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaKPI densa indice={0} rotulo="Venta Proyectada" icono={DollarSign} tono="indigo"
          cifra={fmtCOP(monto_total_proyectado, true)}
          descripcion={`Suma de cotizaciones proyectadas de los ${total} leads del período`}
          ayuda="Suma total del campo 'monto proyectado de cotización' de todos los leads del período. Representa el techo teórico de ingresos si todos los leads activos cerraran. Incluye leads en cualquier etapa, no solo aprobados." />
        <TarjetaKPI densa indice={1} rotulo="Éxito Comercial" icono={Target} tono="emerald"
          cifra={`${tasa_conversion}%`}
          descripcion="Incluye leads del CRM, prospectos directos y clientes recurrentes del período"
          ayuda="Porcentaje de negocio cerrado sobre el total de oportunidades del período: leads del CRM, prospectos gestionados directo y clientes recurrentes. Verde ≥30%, ámbar ≥15%, rojo <15%. Una tasa saludable para este sector es superior al 20%.">
          <div className="mt-3">
            <Medidor pct={tasa_conversion} alto={6}
              color={tasa_conversion >= 30 ? ESTADO.bien : tasa_conversion >= 15 ? ESTADO.atencion : ESTADO.critico} />
          </div>
        </TarjetaKPI>
        <TarjetaKPI densa indice={2} rotulo="Leads Ingresados" icono={Users} tono="violet"
          cifra={String(total)}
          descripcion="Total de leads del período seleccionado"
          ayuda="Cantidad total de leads del período: incluye los que siguen activos en el pipeline (sin importar cuándo entraron) más los que se cerraron —aprobados, perdidos o enfriados— durante el período. Es el volumen bruto de oportunidades gestionadas." />
        <TarjetaKPI densa indice={3} rotulo="Clientes Nuevos" icono={UserCheck} tono="blue"
          cifra={String(nuevos_clientes + nuevos_prospectos)}
          descripcion={`CRM: ${nuevos_clientes} · Prospectos: ${nuevos_prospectos} · Recurrentes: ${clientes_recurrentes}`}
          ayuda={`Suma de clientes nuevos captados por dos vías: leads CRM aprobados (${nuevos_clientes}) y prospectos directos convertidos a ODP sin origen en el CRM (${nuevos_prospectos}). Un negocio que nació como lead se acredita a la vía CRM aunque haya usado visita técnica, para no contarlo dos veces. No incluye clientes recurrentes que ya existían en el sistema.`} />
      </div>

      {/* ── KPIs secundarios ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaKPI densa indice={4} rotulo="Venta Real Aprobados" icono={CheckCircle2} tono="emerald"
          cifra={fmtCOP(monto_real_aprobados, true)}
          descripcion={`Monto confirmado de los ${aprobados} leads aprobados`}
          ayuda="Suma del campo 'monto real de venta' de todos los leads que cerraron como APROBADO. A diferencia de la Venta Proyectada, este valor refleja el ingreso confirmado y actualizado por el asesor al momento del cierre." />
        <TarjetaKPI densa indice={5} rotulo="En Gestión Activa" icono={Activity} tono="slate"
          cifra={String(leadsEnGestion)}
          descripcion={`Contacto: ${(por_estado as any)['EN_CONTACTO'] || 0} · Cotizando: ${(por_estado as any)['COTIZANDO'] || 0} · Seguim.: ${(por_estado as any)['SEGUIMIENTO'] || 0} · V.Técnica: ${(por_estado as any)['VISITA_TECNICA'] || 0}`}
          ayuda="Leads que el equipo está trabajando activamente ahora mismo: En Contacto, Cotizando, Seguimiento y Visita Técnica. Excluye leads sin asignar, fríos, perdidos y aprobados. Es el 'trabajo en curso' real del equipo." />
        <TarjetaKPI densa indice={6} rotulo="Leads Perdidos" icono={XCircle} tono="rose"
          cifra={String(perdidos)}
          descripcion="Oportunidades cerradas sin conversión"
          ayuda="Leads cerrados como PERDIDO en el período. El asesor debe registrar un motivo oficial al marcarlos así. Revisar la tab Métricas → Razones de Pérdida para ver el detalle de por qué se pierden los negocios." />
        <TarjetaKPI densa indice={7} rotulo="Días Prom. Cierre" icono={Clock} tono="amber"
          cifra={tiempo_promedio_cierre_dias > 0 ? `${tiempo_promedio_cierre_dias} días` : 'N/A'}
          descripcion="Desde creación hasta aprobación del lead"
          ayuda="Promedio de días transcurridos desde que se crea el lead hasta que se cierra como APROBADO. Solo se calcula sobre los leads que tienen fecha de cierre registrada. Un número bajo indica un ciclo de venta eficiente." />
      </div>

      {/* ── Origen de negocio + Leads→ODP ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ChartCard indice={8} className="md:col-span-2"
          titulo={<span className="inline-flex items-center">Origen de negocio del período<InfoTooltip text="Clasifica los negocios del período en tres categorías: Nuevos captados por CRM (leads aprobados), Nuevos por Prospectos formales (con visita técnica convertidos a ODP), y Recurrentes (ODPs de clientes existentes sin prospecto previo). Muestra de dónde viene el volumen de trabajo." /></span>}
          descripcion="Distribución entre CRM, prospectos formales y clientes recurrentes">
          {(nuevos_clientes + nuevos_prospectos + clientes_recurrentes) === 0 ? (
            <p className="text-sm text-slate-800 text-center py-2">Sin actividad registrada en este período</p>
          ) : (
            <BarraApilada alto={14} segmentos={[
              { clave: 'crm', label: 'Nuevos vía CRM', valor: nuevos_clientes, color: ORIGEN_COLORS[0] },
              { clave: 'prospectos', label: 'Nuevos vía Prospectos', valor: nuevos_prospectos, color: ORIGEN_COLORS[1] },
              { clave: 'recurrentes', label: 'Recurrentes (directos)', valor: clientes_recurrentes, color: ORIGEN_COLORS[2] },
            ]} />
          )}
        </ChartCard>

        <ChartCard indice={9}
          titulo={<span className="inline-flex items-center">Leads → ODP<InfoTooltip text="Cuántos leads aprobados ya tienen una Orden de Producción vinculada. Un lead aprobado sin ODP significa que el negocio se cerró comercialmente pero aún no se generó la ODP en el sistema productivo. Esa brecha requiere seguimiento." /></span>}
          descripcion="Leads aprobados convertidos a Orden de Producción">
          <div className="flex items-end gap-2">
            <p className="text-[36px] font-extrabold text-slate-900 leading-none [font-variant-numeric:normal]">{leads_con_odp}</p>
            <p className="text-sm text-slate-700 mb-1">vinculados</p>
          </div>
          {leads_aprobados_sin_odp > 0 ? (
            <p className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 ring-1 ring-amber-200 rounded-xl text-[12px] text-amber-800 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              {leads_aprobados_sin_odp} aprobado{leads_aprobados_sin_odp > 1 ? 's' : ''} sin ODP
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl text-[12px] text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Todos vinculados
            </p>
          )}
        </ChartCard>
      </div>

      {/* ── Estado del Pipeline + Origen por canal ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ChartCard indice={10} className="md:col-span-2"
          titulo={<span className="inline-flex items-center">Estado del pipeline<InfoTooltip text="Muestra cómo se distribuyen los leads del período entre sus cuatro posibles resultados: Aprobados (ganados), En Frío (sin respuesta tras 3 intentos), Perdidos (descartados con motivo) y Activos (en proceso, sin contar leads NUEVO sin asignar). El porcentaje es sobre el total del período." /></span>}
          descripcion={<>Resultado de los <span className="font-semibold text-slate-900 tabular-nums">{total}</span> leads del período</>}>
          <div className="space-y-2.5">
            {[
              { label: 'Aprobados', n: aprobados, pct: pctAprobados, color: PIPELINE_COLOR.aprobados },
              { label: 'Activos en proceso', n: activos, pct: pctActivos, color: PIPELINE_COLOR.activos },
              { label: 'En frío', n: frios, pct: pctFrios, color: PIPELINE_COLOR.frios },
              { label: 'Perdidos', n: perdidos, pct: pctPerdidos, color: PIPELINE_COLOR.perdidos },
            ].map((r, i) => (
              <BarraMagnitud key={r.label} indice={i} anchoLabel="w-36" label={r.label}
                valor={r.pct} max={100} color={r.color} cifra={r.n} cifraSecundaria={`${r.pct.toFixed(1)}%`} />
            ))}
          </div>

          {/* Desglose de etapas activas */}
          <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              { label: 'En Contacto', val: (por_estado as any)['EN_CONTACTO']    || 0, tooltip: 'Leads en proceso de primer contacto con el cliente' },
              { label: 'Cotizando',   val: (por_estado as any)['COTIZANDO']      || 0, tooltip: 'Leads en etapa de cotización activa' },
              { label: 'Seguimiento', val: (por_estado as any)['SEGUIMIENTO']    || 0, tooltip: 'Leads con cotización enviada en seguimiento activo' },
              { label: 'V. Técnicas', val: (por_estado as any)['VISITA_TECNICA'] || 0, tooltip: 'Leads con visita técnica programada o en curso' },
            ].map(s => (
              <div key={s.label}>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{s.val}</p>
                <div className="flex items-center justify-center">
                  <p className="text-[12px] text-slate-900 font-semibold">{s.label}</p>
                  <InfoTooltip text={s.tooltip} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard indice={11}
          titulo={<span className="inline-flex items-center">Origen por canal<InfoTooltip text="De dónde nacieron los negocios (ODPs) del período: leads que llegaron por el CRM, prospectos gestionados directo por un asesor, o clientes recurrentes que ya existían. Las 3 vías suman el 100% del negocio del período — mismos datos que 'Clientes Nuevos vs Recurrentes'." /></span>}
          descripcion={<>Composición de las <span className="font-semibold text-slate-900 tabular-nums">{totalOrigen}</span> ODPs del período</>}>
          {totalOrigen === 0 ? (
            <p className="text-sm text-slate-800 text-center py-2">Sin ODPs en este período</p>
          ) : (
            <BarraApilada alto={14} segmentos={origenItems.map((o, i) => ({
              clave: String(i), label: o.label, valor: o.count, color: o.color,
              cifra: `${o.count} · ${fmtCOP(o.monto, true)}`,
            }))} />
          )}
        </ChartCard>
      </div>

      {/* ── Líderes del Período ── */}
      {stats_por_asesor.length > 0 && (
        <ChartCard indice={12}
          titulo={<span className="inline-flex items-center"><Trophy weight="duotone" className="w-5 h-5 text-amber-600 mr-2" />Líderes del período<InfoTooltip text="Ranking de asesores ordenado por tasa de conversión (leads aprobados ÷ total leads asignados). El monto gestionado es la suma de cotizaciones proyectadas de todos sus leads. La barra segmentada muestra cómo están distribuidos sus leads activos entre etapas. Verde ≥30%, ámbar ≥15%, rojo <15%." /></span>}
          descripcion={`${periodoLabel} — ranking por tasa de conversión`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {stats_por_asesor.slice(0, 6).map((a: any, i: number) => (
              <AsesorCard
                key={a.id} idx={i} id={a.id} nombre={a.nombre} total={a.total}
                aprobados={a.aprobados} perdidos={a.perdidos}
                tasa={a.tasa_conversion} monto={a.monto_gestionado}
                porEstado={a.por_estado} etapaCuello={a.etapa_cuello}
              />
            ))}
          </div>

          {/* Resumen: mejor conversión y mayor pipeline (pueden ser personas distintas) */}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center">
                <p className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">Top Conversión</p>
                <InfoTooltip text="Asesor con la mayor tasa de conversión en el período (aprobados ÷ total leads)." />
              </div>
              <p className="text-sm font-bold text-slate-900 truncate mt-1">{topConversion?.nombre || '—'}</p>
              <p className="text-[12px] text-slate-800 mt-0.5 tabular-nums">{topConversion?.tasa_conversion || 0}% conversión</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center">
                <p className="text-[12px] font-semibold text-slate-900 uppercase tracking-wide">Mayor Pipeline</p>
                <InfoTooltip text="Monto proyectado acumulado del asesor con más volumen gestionado en el período." />
              </div>
              <p className="text-sm font-bold text-slate-900 truncate mt-1">{mayorPipeline?.nombre || '—'}</p>
              <p className="text-[12px] text-slate-800 mt-0.5 tabular-nums">
                {fmtCOP(mayorPipeline?.monto_gestionado || 0, true)} · {mayorPipeline?.aprobados || 0} aprobados
              </p>
            </div>
          </div>
        </ChartCard>
      )}

      {stats_por_asesor.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-12 text-center">
          <Trophy className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-700 text-sm">Sin asesores con actividad en este período</p>
          <p className="text-slate-800 text-xs mt-1">Selecciona un período con actividad registrada</p>
        </div>
      )}
    </div>
  );
};

export default DashboardGerencial;
