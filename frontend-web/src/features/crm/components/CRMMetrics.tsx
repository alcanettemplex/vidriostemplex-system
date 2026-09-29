import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, DollarSign, Percent } from '../../../components/ui/icons';
import { apiGetCRMStats } from '../crmService';
import {
  TarjetaKPI, ChartCard, BarraMagnitud, BarraApilada, Medidor, Ayuda, CATEGORICA, tonoEtapa,
} from '../../../components/charts';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtCOP = (v: number, compact = false) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {})
  }).format(v);

const fmtDelta = (
  curr: number, prev: number, esMoneda = false
): { label: string; positivo: boolean } | null => {
  if (prev === null || prev === undefined) return null;
  const diff = curr - prev;
  if (diff === 0) return null;
  const abs = esMoneda ? fmtCOP(Math.abs(diff), true) : `${Math.abs(diff)}%`;
  return { label: `${diff > 0 ? '+' : '−'}${abs}`, positivo: diff > 0 };
};

// ─── InfoTooltip ──────────────────────────────────────────────────────────────
const InfoTooltip: React.FC<{ text: string }> = ({ text }) => <Ayuda texto={text} />;

// ─── Tasa de conversión como etiqueta ─────────────────────────────────────────
// Umbral de negocio: ≥20% es saludable para el sector (ver ayuda de la tarjeta de conversión).
const PildoraConversion: React.FC<{ pct: number }> = ({ pct }) => (
  <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold tabular-nums whitespace-nowrap ring-1 ${
    pct >= 20 ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : pct > 0 ? 'bg-amber-50 text-amber-800 ring-amber-200'
        : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
    {pct}% conv.
  </span>
);

// ─── Config embudo ────────────────────────────────────────────────────────────
// Etapas en orden del proceso: se pintan con la rampa azul (más oscuro = entrada del embudo).
const ETAPAS_CONFIG = [
  { id: 'ASIGNADO',       label: 'Asignados' },
  { id: 'EN_CONTACTO',    label: 'En Contacto' },
  { id: 'COTIZANDO',      label: 'Cotizando' },
  { id: 'SEGUIMIENTO',    label: 'Seguimiento' },
  { id: 'VISITA_TECNICA', label: 'Visita Técnica' },
  { id: 'APROBADO',       label: 'Aprobados' },
];

// ─── Modal: Leads Aprobados sin ODP ──────────────────────────────────────────
interface LeadSinODP {
  id: number; nombre: string; telefono: string; monto: number;
  asesor_nombre: string; asesor_id: number | null; dias_desde_aprobacion: number | null;
}

const fmtCOPModal = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const LeadsSinODPModal: React.FC<{ leads: LeadSinODP[]; onClose: () => void }> = ({ leads, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,0.5)' }}>
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-200">
        <div>
          <h3 className="font-semibold text-slate-900 text-base">Leads Aprobados sin ODP</h3>
          <p className="text-xs text-slate-700 mt-0.5">
            {leads.length} lead{leads.length !== 1 ? 's' : ''} aprobado{leads.length !== 1 ? 's' : ''} que aún no tienen una Orden de Producción vinculada.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors text-sm font-semibold"
        >✕</button>
      </div>

      {/* Tabla */}
      <div className="overflow-y-auto flex-1 p-4">
        {leads.length === 0 ? (
          <p className="text-center text-slate-700 py-10 text-sm">Sin leads en esta condición</p>
        ) : (
          <div className="space-y-2">
            {/* Encabezado de columnas */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5">
              <span className="col-span-4 text-[11px] font-semibold text-slate-900 uppercase tracking-widest">Cliente / Lead</span>
              <span className="col-span-3 text-[11px] font-semibold text-slate-900 uppercase tracking-widest">Asesor</span>
              <span className="col-span-2 text-[11px] font-semibold text-slate-900 uppercase tracking-widest text-right">Monto proy.</span>
              <span className="col-span-3 text-[11px] font-semibold text-slate-900 uppercase tracking-widest text-right">Días aprobado</span>
            </div>
            {leads.map(l => {
              const diasUrgente = l.dias_desde_aprobacion !== null && l.dias_desde_aprobacion >= 7;
              return (
                <div key={l.id} className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded-lg border transition-colors ${diasUrgente ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                  {/* Nombre + teléfono */}
                  <div className="col-span-4">
                    <p className="text-xs font-bold text-slate-900 truncate">{l.nombre}</p>
                    <p className="text-xs text-slate-700">{l.telefono}</p>
                  </div>
                  {/* Asesor */}
                  <div className="col-span-3">
                    <p className="text-xs text-slate-800 truncate">{l.asesor_nombre}</p>
                  </div>
                  {/* Monto */}
                  <div className="col-span-2 text-right">
                    <p className="text-xs text-slate-700">{fmtCOPModal(l.monto)}</p>
                  </div>
                  {/* Días */}
                  <div className="col-span-3 text-right">
                    {l.dias_desde_aprobacion !== null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${diasUrgente ? 'bg-rose-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                        {l.dias_desde_aprobacion}d
                      </span>
                    ) : (
                      <span className="text-xs text-slate-800">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 flex items-center justify-between">
        <p className="text-xs text-slate-700">
          🔴 Rojo = aprobado hace 7+ días sin ODP. Requiere acción urgente.
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-medium hover:bg-slate-700 transition-colors"
        >Cerrar</button>
      </div>
    </div>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props { asesorId?: number; esVistaGlobal?: boolean; fecha_desde?: string | null; fecha_hasta?: string | null; asesor_id?: number; }

// ═════════════════════════════════════════════════════════════════════════════
const CRMMetrics: React.FC<Props> = ({ esVistaGlobal, fecha_desde, fecha_hasta, asesor_id }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinOdpModal, setSinOdpModal] = useState(false);

  const cargar = async () => {
    setLoading(true); setError(null);
    try { const { data } = await apiGetCRMStats(fecha_desde || undefined, fecha_hasta || undefined, asesor_id); setStats(data); }
    catch { setError('No se pudieron cargar las métricas.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, [fecha_desde, fecha_hasta, esVistaGlobal, asesor_id]); // eslint-disable-line

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 bg-white rounded-xl animate-pulse border border-slate-200" />
        ))}
      </div>
    </div>
  );

  if (error || !stats) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <AlertCircle className="w-12 h-12 text-rose-300" />
      <p className="text-slate-800 text-sm font-medium">{error}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-templex-600 hover:bg-templex-700 text-white rounded-lg text-sm font-medium transition-colors">
        Reintentar
      </button>
    </div>
  );

  const {
    total = 0, monto_real_aprobados = 0,
    tasa_conversion = 0, ticket_promedio_proyectado = 0,
    por_estado = {}, por_motivo_perdida = {}, por_producto = {},
    por_fuente = {}, por_segmento = {},
    nuevos_prospectos = 0, nuevos_crm = 0, clientes_recurrentes = 0,
    monto_nuevos_clientes = 0, monto_nuevos_crm = 0, monto_clientes_recurrentes = 0,
    negocios_por_fuente = [],
    vs_anterior = null,
    leads_aprobados_sin_odp = 0,
    leads_aprobados_sin_odp_detalle = [],
  } = stats;

  // "Nuevos" agrupa las dos vías de captación de clientes nuevos: prospectos formales
  // directos (sin CRM) + negocios originados en un lead del CRM. Así la tarjeta vuelve a
  // cuadrar con el total de ODPs del período (nuevos + recurrentes = total).
  const nuevos_clientes = nuevos_prospectos + nuevos_crm;
  const monto_nuevos_total = monto_nuevos_clientes + monto_nuevos_crm;

  // Listas derivadas
  const fuentesList   = Object.entries(por_fuente).map(([f, c]) => ({ fuente: f, count: c as number })).sort((a, b) => b.count - a.count);
  const negociosFuenteList = (negocios_por_fuente as { fuente: string; count: number; monto: number }[]).slice().sort((a, b) => b.count - a.count);
  const negociosFuenteTotal = negociosFuenteList.reduce((acc, f) => acc + f.count, 0);
  const negociosFuenteMontoTotal = negociosFuenteList.reduce((acc, f) => acc + (f.monto || 0), 0);
  const motivosList   = Object.entries(por_motivo_perdida).map(([m, c]) => ({ motivo: m, count: c as number })).sort((a, b) => b.count - a.count);
  const productosList = Object.entries(por_producto).map(([p, d]: [string, any]) => ({
    producto: p, count: d.total,
    rate: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0,
    monto: d.monto,
  })).sort((a, b) => b.monto - a.monto);
  const segmentosList = Object.entries(por_segmento).map(([s, d]: [string, any]) => ({
    segmento: s, total: d.total, aprobados: d.aprobados, monto: d.monto,
    conv: d.total > 0 ? Math.round((d.aprobados / d.total) * 100) : 0,
  }));

  // Participación: los 5 productos con más leads, en % sobre la suma de esos 5.
  const top5Productos = [...productosList].sort((a, b) => b.count - a.count).slice(0, 5);
  const sumaTop5      = top5Productos.reduce((acc, p) => acc + p.count, 0) || 1;
  const participacion = top5Productos.map(p => ({
    label: p.producto || 'Sin Definir', count: p.count, pct: Math.round((p.count / sumaTop5) * 100),
  }));
  const totalPerdidos = motivosList.reduce((acc, m) => acc + m.count, 0) || 1;
  const embudo     = ETAPAS_CONFIG.map(e => ({ ...e, count: (por_estado as any)[e.id] || 0 }));
  const topEtapa   = Math.max(...embudo.map(e => e.count), 1);

  // Deltas reales vs período anterior
  const deltaConversion = vs_anterior ? fmtDelta(tasa_conversion, vs_anterior.tasa_conversion) : null;
  const deltaTicket     = vs_anterior ? fmtDelta(ticket_promedio_proyectado, vs_anterior.ticket_promedio_proyectado, true) : null;
  const deltaMontoReal  = vs_anterior ? fmtDelta(monto_real_aprobados, vs_anterior.monto_real_aprobados, true) : null;

  return (
    <div className="space-y-5 pb-10">

      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 tracking-tight">Análisis de Métricas</h2>
        <p className="text-xs text-slate-700 mt-0.5">
          Monitoreo de eficiencia comercial y gestión CRM del período seleccionado.
          {vs_anterior !== null && <span className="ml-1 text-slate-900 font-semibold">Los deltas (↑↓) comparan vs el mes anterior.</span>}
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TarjetaKPI densa indice={0} rotulo="Tasa de Conversión" icono={Percent} tono="emerald"
          cifra={`${tasa_conversion}%`}
          delta={deltaConversion ? { texto: deltaConversion.label, positivo: deltaConversion.positivo, contexto: 'vs mes ant.' } : null}
          ayuda="Porcentaje de leads que llegaron a estado APROBADO sobre el total del período. Una tasa saludable para este sector es superior al 20%. Si baja, revisar etapas con acumulación."
          descripcion="Leads Aprobados ÷ Total de leads del período." />
        <TarjetaKPI densa indice={1} rotulo="Aprobados sin ODP" icono={AlertCircle} tono="rose"
          cifra={String(leads_aprobados_sin_odp)}
          cifraClassName={leads_aprobados_sin_odp > 0 ? 'text-rose-700' : 'text-slate-900'}
          ayuda="Leads con estado APROBADO que todavía no tienen una Orden de Producción generada. El negocio se cerró comercialmente pero aún no arrancó en el sistema productivo. Haz clic para ver el detalle."
          descripcion="Haz clic para ver el detalle y gestionar."
          onClick={() => setSinOdpModal(true)} />
        <TarjetaKPI densa indice={2} rotulo="Ticket Promedio" icono={DollarSign} tono="violet"
          cifra={fmtCOP(ticket_promedio_proyectado, true)}
          delta={deltaTicket ? { texto: deltaTicket.label, positivo: deltaTicket.positivo, contexto: 'vs mes ant.' } : null}
          ayuda="Valor promedio del monto proyectado de cotización por lead. Si baja, puede indicar que están llegando leads de menor volumen o que las cotizaciones no se están actualizando en el sistema."
          descripcion="Suma de montos proyectados ÷ Total de leads." />
        <TarjetaKPI densa indice={3} rotulo="Monto Real Aprobados" icono={CheckCircle2} tono="blue"
          cifra={fmtCOP(monto_real_aprobados, true)}
          delta={deltaMontoReal ? { texto: deltaMontoReal.label, positivo: deltaMontoReal.positivo, contexto: 'vs mes ant.' } : null}
          ayuda="Suma del monto real confirmado de todos los leads cerrados como APROBADO. Refleja los ingresos efectivamente captados por el equipo comercial en este período."
          descripcion="Suma de monto_real de leads en estado Aprobado." />
      </div>

      {/* ── Participación por Producto ── */}
      <ChartCard indice={4}
        titulo={<span className="inline-flex items-center">Participación por Producto<InfoTooltip text="Distribución de leads según el tipo de producto de interés registrado, ordenada de mayor a menor participación. No indica conversión, sino volumen de interés." /></span>}
        descripcion="Los 5 productos con más leads del período">
        {participacion.length > 0 ? (
          <div className="space-y-2.5">
            {participacion.map((p, i) => (
              <BarraMagnitud key={p.label} indice={i} anchoLabel="w-36" label={p.label}
                valor={p.count} max={participacion[0].count} color={CATEGORICA[0]}
                cifra={p.count} cifraSecundaria={`${p.pct}%`} />
            ))}
          </div>
        ) : <p className="text-center text-slate-700 text-sm py-8">Sin datos de productos</p>}
      </ChartCard>

      {/* ── Embudo + Fuentes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard indice={5}
          titulo={<span className="inline-flex items-center">Embudo de Conversión<InfoTooltip text="Cuántos leads activos hay en cada etapa del proceso comercial (excluye leads sin respuesta). La barra más ancha es la etapa con más volumen. Si Cotizando o En Contacto superan ampliamente a Aprobados, hay un cuello de botella que revisar." /></span>}
          descripcion={<>{embudo.reduce((s, e) => s + e.count, 0)} leads en etapas activas, de {total} totales en el período</>}>
          <div className="space-y-2.5">
            {embudo.map((e, i) => (
              <BarraMagnitud key={e.id} indice={i} anchoLabel="w-28" label={e.label}
                valor={e.count} max={topEtapa} color={tonoEtapa(i, embudo.length)} />
            ))}
          </div>
        </ChartCard>

        <ChartCard indice={6}
          titulo={<span className="inline-flex items-center">Distribución por Fuente<InfoTooltip text="Canal de origen de cada lead registrado (WhatsApp, referido, Instagram, presencial, etc.). Muestra qué canal trae más volumen y ayuda a decidir dónde enfocar esfuerzos de captación o inversión publicitaria." /></span>}
          descripcion={`Canal de origen de los ${total} leads del período`}>
          <div className="space-y-2.5">
            {fuentesList.map((f, i) => (
              <BarraMagnitud key={f.fuente} indice={i} anchoLabel="w-28" label={f.fuente}
                valor={f.count} max={fuentesList[0]?.count || 1} color={CATEGORICA[0]}
                cifraSecundaria={`${total > 0 ? Math.round((f.count / total) * 100) : 0}%`} />
            ))}
            {fuentesList.length === 0 && (
              <p className="text-center text-slate-700 text-sm py-6">Sin fuentes registradas</p>
            )}
          </div>
        </ChartCard>
      </div>

      {/* ── Conversión por Producto + Segmentos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard indice={7}
          titulo={<span className="inline-flex items-center">Conversión por Producto<InfoTooltip text="Ranking de productos ordenado por monto proyectado acumulado. La barra interna muestra la frecuencia del producto (leads sobre el total). La etiqueta de porcentaje es la tasa de conversión: verde ≥20%, ámbar 1-19%, gris 0%." /></span>}
          descripcion="Top 7 por monto proyectado. La barra es la frecuencia; la etiqueta, la tasa de conversión">
          <div className="space-y-1">
            {productosList.slice(0, 7).map((p, idx) => (
              <div key={p.producto} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="w-5 text-[12px] font-bold text-slate-700 tabular-nums flex-shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-slate-900 truncate">{p.producto || 'Sin Definir'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Medidor pct={total > 0 ? (p.count / total) * 100 : 0} alto={6} className="flex-1" />
                    <span className="text-[12px] text-slate-700 tabular-nums whitespace-nowrap">{p.count} leads</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <PildoraConversion pct={p.rate} />
                  <span className="text-[12px] font-semibold text-slate-900 w-16 text-right tabular-nums">{fmtCOP(p.monto, true)}</span>
                </div>
              </div>
            ))}
            {productosList.length === 0 && (
              <p className="text-center text-slate-700 text-sm py-6">Sin datos de productos</p>
            )}
          </div>
        </ChartCard>

        <ChartCard indice={8}
          titulo={<span className="inline-flex items-center">Distribución por Segmento<InfoTooltip text="Leads y monto proyectado agrupados por el perfil del cliente (arquitecto, industrial, etc.). La etiqueta de la derecha es la tasa de conversión de ese segmento: verde ≥20%, ámbar 1-19%. Identifica qué tipo de cliente convierte mejor." /></span>}
          descripcion="Leads, monto proyectado y tasa de conversión por perfil de cliente">
          <div className="divide-y divide-slate-100">
            {segmentosList.map(s => (
              <div key={s.segmento} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-slate-900 truncate">{s.segmento}</p>
                  <p className="text-[12px] text-slate-700 tabular-nums">{s.total} leads · {fmtCOP(s.monto, true)} proy.</p>
                </div>
                <PildoraConversion pct={s.conv} />
              </div>
            ))}
            {segmentosList.length === 0 && (
              <p className="text-center text-slate-700 text-sm py-6">Sin segmentos registrados</p>
            )}
          </div>
        </ChartCard>
      </div>

      {/* ── Nuevos vs Recurrentes + Razones de Pérdida ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ChartCard indice={9}
          titulo={<span className="inline-flex items-center">Clientes Nuevos vs Recurrentes<InfoTooltip text="'Nuevos' = ODPs del período de clientes nuevos captados por cualquier vía (leads del CRM o prospectos formales). 'Recurrentes' = ODPs de clientes que ya existían y volvieron a comprar. La suma cuadra con el total de ODPs del período." /></span>}
          descripcion="ODPs del período según si el cliente es nuevo o ya había comprado">
          {(nuevos_clientes + clientes_recurrentes) === 0 ? (
            <p className="text-center text-slate-700 text-sm py-8">Sin conversiones en este período</p>
          ) : (
            <div className="space-y-4">
              <BarraApilada alto={14} conLeyenda={false} segmentos={[
                { clave: 'nuevos', label: 'Nuevos', valor: nuevos_clientes, color: CATEGORICA[0] },
                { clave: 'recurrentes', label: 'Recurrentes', valor: clientes_recurrentes, color: CATEGORICA[1] },
              ]} />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'Nuevos', n: nuevos_clientes, m: monto_nuevos_total, c: CATEGORICA[0], d: 'Clientes nuevos (CRM + prospectos)' },
                  { k: 'Recurrentes', n: clientes_recurrentes, m: monto_clientes_recurrentes, c: CATEGORICA[1], d: 'Clientes que ya existían' },
                ].map(x => (
                  <div key={x.k} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900 uppercase tracking-wide">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.c }} />{x.k}
                    </p>
                    <p className="text-[28px] font-extrabold text-slate-900 mt-1 leading-none [font-variant-numeric:normal]">{x.n}</p>
                    <p className="text-[12px] text-slate-700 mt-1.5">
                      {Math.round((x.n / (nuevos_clientes + clientes_recurrentes)) * 100)}% del total
                    </p>
                    {x.m > 0 && <p className="text-[12px] font-semibold text-slate-900 tabular-nums mt-0.5">{fmtCOP(x.m, true)}</p>}
                    <p className="text-[12px] text-slate-700 mt-1">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard indice={10}
          titulo={<span className="inline-flex items-center">Razones de Pérdida<InfoTooltip text="Motivos registrados cuando un lead pasa a estado PERDIDO. El asesor debe seleccionar un motivo oficial al cerrar el lead. Identificar los motivos más frecuentes permite ajustar el discurso comercial y reducir fugas." /></span>}
          descripcion={`${(por_estado as any)['PERDIDO'] || 0} leads perdidos en el período`}>
          {motivosList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <CheckCircle2 weight="duotone" className="w-9 h-9 text-emerald-600" />
              <p className="text-sm text-slate-900 font-semibold">Sin pérdidas registradas</p>
              <p className="text-[12px] text-slate-700">Ningún lead pasó a Perdido en el período.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {motivosList.map((m, i) => (
                <BarraMagnitud key={m.motivo} indice={i} anchoLabel="w-40" label={m.motivo}
                  valor={m.count} max={motivosList[0].count} color={CATEGORICA[0]}
                  cifraSecundaria={`${Math.round((m.count / totalPerdidos) * 100)}%`} />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Negocios por Fuente (ODPs del período según la fuente del cliente) ── */}
      <ChartCard indice={11}
        titulo={<span className="inline-flex items-center">Negocios por Fuente<InfoTooltip text="Los negocios (ODPs) del período repartidos según el canal por el que llegó el cliente (WhatsApp, Facebook, Instagram, etc.). El total coincide con el de 'Clientes Nuevos vs Recurrentes'. Los negocios cuyo cliente aún no tiene fuente registrada aparecen como 'Sin especificar'." /></span>}
        descripcion={<>Total: <span className="font-semibold text-slate-900 tabular-nums">{negociosFuenteTotal}</span> negocios · <span className="font-semibold text-slate-900 tabular-nums">{fmtCOP(negociosFuenteMontoTotal, true)}</span></>}>
        <div className="space-y-2.5">
          {negociosFuenteList.map((f, i) => (
            <BarraMagnitud key={f.fuente} indice={i} anchoLabel="w-28" label={f.fuente}
              valor={f.count} max={negociosFuenteList[0]?.count || 1} color={CATEGORICA[0]}
              cifra={`${f.count} · ${fmtCOP(f.monto || 0, true)}`}
              cifraSecundaria={`${negociosFuenteTotal > 0 ? Math.round((f.count / negociosFuenteTotal) * 100) : 0}%`} />
          ))}
          {negociosFuenteList.length === 0 && (
            <p className="text-center text-slate-700 text-sm py-6">Sin negocios en este período</p>
          )}
        </div>
      </ChartCard>

      {/* ── Modal Leads Aprobados sin ODP ── */}
      {sinOdpModal && (
        <LeadsSinODPModal
          leads={leads_aprobados_sin_odp_detalle as LeadSinODP[]}
          onClose={() => setSinOdpModal(false)}
        />
      )}
    </div>
  );
};

export default CRMMetrics;
