import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  Crosshair, ArrowLeft, RefreshCw, Gem, Clock3, TrendingDown, Target,
  Calendar, User, DollarSign, PhoneCall, CheckCircle2,
  Timer, UserPlus, Award, Landmark, Percent, Wallet,
} from 'lucide-react';
import KPICard from './components/KPICard';
import LeadRadarPanel from './components/LeadRadarPanel';
import MotivosPerdidaPanel from './components/MotivosPerdidaPanel';
import LineamientoDelDia from './components/LineamientoDelDia';
import BuscadorAvanzadoPanel from './components/BuscadorAvanzadoPanel';
import RankingAsesoresPanel from './components/RankingAsesoresPanel';
import {
  apiGetSupervisionResumen, apiGetSupervisionAltoValor, apiGetSupervisionSeguimiento,
  apiGetSupervisionPrimerContacto, apiGetAdherenciaLineamiento, apiGetRankingAsesores,
} from './supervisionService';
import { apiGetAsesores, apiRegisterLeadSeguimiento } from '../crm/crmService';
import { SupervisionLeadItem, SupervisionResumen, AdherenciaLineamiento, RankingAsesorItem } from './types';

type Tab = 'primer_contacto' | 'seguimiento' | 'alto_valor' | 'lineamiento' | 'motivos' | 'buscador';

const primerDiaMesActual = (): string => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
};

const hoyISO = (): string => new Date().toISOString().split('T')[0];

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const SupervisionCRMPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('primer_contacto');
  const [fechaDesde, setFechaDesde] = useState(primerDiaMesActual());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [asesorId, setAsesorId] = useState<number | undefined>(undefined);
  const [montoMin, setMontoMin] = useState<number>(10000000);
  const [asesores, setAsesores] = useState<any[]>([]);

  const [resumen, setResumen] = useState<SupervisionResumen | null>(null);
  const [altoValor, setAltoValor] = useState<SupervisionLeadItem[]>([]);
  const [seguimiento, setSeguimiento] = useState<SupervisionLeadItem[]>([]);
  const [primerContacto, setPrimerContacto] = useState<SupervisionLeadItem[]>([]);
  const [adherencia, setAdherencia] = useState<AdherenciaLineamiento | null>(null);
  const [ranking, setRanking] = useState<RankingAsesorItem[]>([]);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [loadingAltoValor, setLoadingAltoValor] = useState(false);
  const [loadingSeguimiento, setLoadingSeguimiento] = useState(false);
  const [loadingPrimerContacto, setLoadingPrimerContacto] = useState(false);
  const [loadingAdherencia, setLoadingAdherencia] = useState(false);
  const [loadingRanking, setLoadingRanking] = useState(false);

  const filtros = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, asesor_id: asesorId };

  const cargarResumen = useCallback(async () => {
    setLoadingResumen(true);
    try {
      const { data } = await apiGetSupervisionResumen(filtros);
      setResumen(data);
    } catch {
      toast.error('No se pudo cargar el resumen de supervisión.');
    } finally {
      setLoadingResumen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, asesorId]);

  const cargarAltoValor = useCallback(async () => {
    setLoadingAltoValor(true);
    try {
      const { data } = await apiGetSupervisionAltoValor(filtros, montoMin);
      setAltoValor(data.leads);
    } catch {
      toast.error('No se pudo cargar el radar de alto valor.');
    } finally {
      setLoadingAltoValor(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, asesorId, montoMin]);

  const cargarSeguimiento = useCallback(async () => {
    setLoadingSeguimiento(true);
    try {
      const { data } = await apiGetSupervisionSeguimiento(filtros);
      setSeguimiento(data.leads);
    } catch {
      toast.error('No se pudo cargar la cola de seguimiento.');
    } finally {
      setLoadingSeguimiento(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, asesorId]);

  const cargarPrimerContacto = useCallback(async () => {
    setLoadingPrimerContacto(true);
    try {
      const { data } = await apiGetSupervisionPrimerContacto(filtros);
      setPrimerContacto(data.leads);
    } catch {
      toast.error('No se pudo cargar la cola de primer contacto.');
    } finally {
      setLoadingPrimerContacto(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, asesorId]);

  const cargarAdherencia = useCallback(async () => {
    setLoadingAdherencia(true);
    try {
      const { data } = await apiGetAdherenciaLineamiento(filtros);
      setAdherencia(data);
    } catch {
      setAdherencia(null);
    } finally {
      setLoadingAdherencia(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta, asesorId]);

  const cargarRanking = useCallback(async () => {
    setLoadingRanking(true);
    try {
      const { data } = await apiGetRankingAsesores({ fecha_desde: fechaDesde, fecha_hasta: fechaHasta });
      setRanking(data.ranking);
    } catch {
      toast.error('No se pudo cargar el ranking de asesores.');
    } finally {
      setLoadingRanking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta]);

  const cargarTodo = useCallback(() => {
    cargarResumen();
    cargarAltoValor();
    cargarSeguimiento();
    cargarPrimerContacto();
    cargarAdherencia();
    cargarRanking();
  }, [cargarResumen, cargarAltoValor, cargarSeguimiento, cargarPrimerContacto, cargarAdherencia, cargarRanking]);

  useEffect(() => { cargarTodo(); }, [cargarTodo]);

  useEffect(() => {
    apiGetAsesores().then(({ data }) => {
      const filtrados = (data || []).filter((u: any) =>
        ['asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'].includes(u.rol)
      );
      setAsesores(filtrados);
    }).catch(() => {});
  }, []);

  const handleRegistrarIntento = async (leadId: number) => {
    try {
      await apiRegisterLeadSeguimiento(leadId);
      toast.success('Intento registrado.');
      cargarSeguimiento();
    } catch {
      toast.error('No se pudo registrar el intento.');
    }
  };

  const totalAltoValorMonto = altoValor.reduce((s, l) => s + l.monto_proyectado_cotizacion, 0);
  const seguimientoCriticos = seguimiento.filter(l => l.dias_en_etapa >= 7).length;
  const primerContactoUrgentes = primerContacto.filter(l => l.accion_sugerida.prioridad === 'alta').length;
  const motivoPrincipal = resumen?.motivos_perdida?.[0];
  const totalPerdidos = resumen?.motivos_perdida?.reduce((s, m) => s + m.total, 0) || 0;
  const pctMotivoPrincipal = motivoPrincipal && totalPerdidos > 0
    ? Math.round((motivoPrincipal.total / totalPerdidos) * 100) : 0;

  return (
    <div className="min-h-screen bg-apple-bg font-apple">
      {/* ── Barra superior ── */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-apple-hairline px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-apple-blue flex items-center justify-center shrink-0">
              <Crosshair className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-apple-text font-bold text-sm leading-tight">Supervisión CRM</p>
              <p className="text-apple-text-secondary text-[11px] font-medium">Centro de control comercial</p>
            </div>
          </div>

          {/* Navegación segmentada — estilo iOS */}
          <nav className="hidden md:flex items-center gap-0.5 bg-apple-gray rounded-xl p-1">
            {([
              { key: 'primer_contacto', label: 'Primer Contacto' },
              { key: 'seguimiento', label: 'Cola Seguimiento' },
              { key: 'alto_valor', label: 'Alto Valor' },
              { key: 'lineamiento', label: 'Lineamiento del Día' },
              { key: 'motivos', label: 'Motivos de Pérdida' },
              { key: 'buscador', label: 'Buscador Avanzado' },
            ] as { key: Tab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`relative px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === t.key ? 'text-apple-text' : 'text-apple-text-secondary hover:text-apple-text'
                }`}
              >
                {activeTab === t.key && (
                  <motion.span
                    layoutId="supervisionSegmentedActive"
                    className="absolute inset-0 bg-white rounded-lg shadow-sm"
                    transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={cargarTodo}
              className="w-9 h-9 rounded-full bg-apple-gray hover:bg-apple-hairline flex items-center justify-center text-apple-text-secondary transition-colors"
              title="Recargar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-apple-gray hover:bg-apple-hairline text-apple-text text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Salir
            </Link>
          </div>
        </div>

        {/* Nav segmentada — mobile */}
        <nav className="flex md:hidden items-center gap-0.5 bg-apple-gray rounded-xl p-1 mt-3 max-w-[1400px] mx-auto">
          {([
            { key: 'primer_contacto', label: 'Contacto' },
            { key: 'seguimiento', label: 'Seguimiento' },
            { key: 'alto_valor', label: 'Alto Valor' },
            { key: 'lineamiento', label: 'Lineamiento' },
            { key: 'motivos', label: 'Pérdidas' },
            { key: 'buscador', label: 'Buscador' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                activeTab === t.key ? 'text-apple-text' : 'text-apple-text-secondary'
              }`}
            >
              {activeTab === t.key && (
                <motion.span
                  layoutId="supervisionSegmentedActiveMobile"
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
          <KPICard
            label="Conversión actual"
            value={loadingResumen ? '—' : `${resumen?.tasa_conversion_actual ?? 0}%`}
            icon={Target}
            accent="blue"
            description="Porcentaje de leads del período que terminaron como venta ganada (APROBADO) sobre el total de leads trabajados. Mide la efectividad global del equipo comercial convirtiendo contactos en clientes."
            progress={{ current: resumen?.tasa_conversion_actual ?? 0, target: resumen?.meta_conversion ?? 20, unit: '%' }}
          />
          <KPICard
            label="Sin primer contacto"
            value={loadingPrimerContacto ? '—' : String(primerContacto.length)}
            sublabel={loadingPrimerContacto ? undefined : `${primerContactoUrgentes} urgente${primerContactoUrgentes !== 1 ? 's' : ''}`}
            icon={PhoneCall}
            accent="blue"
            description="Leads ya asignados a un asesor que todavía no han sido contactados. Alerta sobre leads muriendo en el olvido antes de siquiera intentarlo."
          />
          <KPICard
            label="Alto valor sin ODP"
            value={loadingAltoValor ? '—' : String(altoValor.length)}
            sublabel={loadingAltoValor ? undefined : `${fmtCOP(totalAltoValorMonto)} en juego`}
            icon={Gem}
            accent="purple"
            description="Leads con cotización proyectada alta que siguen en pipeline activo pero aún no se han convertido en ODP. Señala oportunidades grandes en riesgo de perderse por falta de seguimiento."
          />
          <KPICard
            label="Estancados en seguimiento"
            value={loadingSeguimiento ? '—' : String(seguimiento.length)}
            sublabel={loadingSeguimiento ? undefined : `${seguimientoCriticos} crítico${seguimientoCriticos !== 1 ? 's' : ''} (≥7d)`}
            icon={Clock3}
            accent="orange"
            description="Leads en etapa SEGUIMIENTO que llevan tiempo sin avanzar. 'Crítico' marca los que llevan 7 días o más sin resolverse, riesgo alto de enfriarse."
          />
          <KPICard
            label="Cumplimiento lineamiento"
            value={loadingAdherencia ? '—' : `${adherencia?.pct_adherencia ?? 0}%`}
            sublabel={loadingAdherencia ? undefined : `${adherencia?.cumplidos ?? 0}/${adherencia?.total_items ?? 0} acciones`}
            icon={CheckCircle2}
            accent="green"
            description="Porcentaje de tareas asignadas en el Lineamiento del Día (coaching diario a asesores) que fueron marcadas como cumplidas. Mide si los asesores ejecutan las instrucciones de supervisión, no solo el resultado de ventas."
          />
          <KPICard
            label="Motivo principal de pérdida"
            value={loadingResumen ? '—' : (motivoPrincipal ? `${pctMotivoPrincipal}%` : '—')}
            sublabel={loadingResumen ? undefined : (motivoPrincipal?.motivo || 'Sin pérdidas en el período')}
            icon={TrendingDown}
            accent="red"
            description="La causa más repetida entre los leads marcados como PERDIDO en el período, y qué porcentaje del total de pérdidas representa. Ayuda a enfocar el problema raíz de las ventas perdidas."
          />
        </div>

        {/* ── KPIs financieros y comerciales complementarios ── */}
        <div>
          <p className="text-xs font-semibold text-apple-text-tertiary uppercase tracking-widest mb-3">Indicadores Financieros y Comerciales</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
            <KPICard
              label="Ciclo de venta promedio"
              value={loadingResumen ? '—' : (resumen?.ciclo_venta_promedio_dias != null ? `${resumen.ciclo_venta_promedio_dias}d` : '—')}
              icon={Timer}
              accent="blue"
              description="Días promedio que tarda un lead en pasar de 'asignado a un asesor' a 'aprobado como venta'. Mide la velocidad del proceso comercial."
            />
            <KPICard
              label="Leads nuevos del período"
              value={loadingResumen ? '—' : String(resumen?.leads_nuevos_periodo ?? 0)}
              sublabel={loadingResumen ? undefined : `${(resumen?.leads_nuevos_delta_pct ?? 0) >= 0 ? '+' : ''}${resumen?.leads_nuevos_delta_pct ?? 0}% vs período anterior`}
              icon={UserPlus}
              accent="purple"
              description="Leads nuevos que entraron al pipeline en el rango de fechas, comparado contra el mismo tamaño de período inmediatamente anterior. Mide el flujo de entrada, no la calidad de cierre."
            />
            <KPICard
              label="Meta ODPs cerradas"
              value={loadingResumen ? '—' : String(resumen?.odps_cerradas_real ?? 0)}
              icon={Award}
              accent="orange"
              description="Ventas (ODP) cerradas en el período frente a la meta esperada (meta individual por asesor × asesores con al menos un cierre). Mide cumplimiento de cuota en volumen de negocios, no en dinero."
              progress={{ current: resumen?.odps_cerradas_real ?? 0, target: resumen?.meta_odps_cerradas ?? 12 }}
            />
            <KPICard
              label="Facturación vs meta"
              value={loadingResumen ? '—' : fmtCOP(resumen?.facturacion_periodo ?? 0)}
              sublabel={loadingResumen ? undefined : `Meta: ${fmtCOP(resumen?.meta_facturacion_periodo ?? 120000000)} · ${Math.min(100, Math.round(((resumen?.facturacion_periodo ?? 0) / (resumen?.meta_facturacion_periodo || 1)) * 100))}% alcanzado`}
              icon={Landmark}
              accent="green"
              description="Valor total de las ODP creadas en el período (sin garantías) comparado contra la meta mensual de facturación configurada. KPI de ingresos objetivo vs. real."
            />
            <KPICard
              label="% ODPs facturadas"
              value={loadingResumen ? '—' : `${resumen?.pct_odps_facturadas ?? 0}%`}
              icon={Percent}
              accent="blue"
              description="De todas las ODP creadas en el período, qué porcentaje ya pasó a estado FACTURADA. Mide qué tan rápido se está facturando lo vendido."
            />
            <KPICard
              label="Pendiente de cobro"
              value={loadingResumen ? '—' : fmtCOP(resumen?.monto_pendiente_cobro_total ?? 0)}
              icon={Wallet}
              accent="red"
              description="Cartera viva actual (no filtrada por fecha): suma de lo que los clientes aún deben sobre ODP no canceladas y no-garantía."
            />
          </div>
        </div>

        {/* ── Ranking de asesores ── */}
        <RankingAsesoresPanel ranking={ranking} loading={loadingRanking} disabled={!!asesorId} />

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-apple">
          <div className="flex items-center gap-2 pr-3 border-r border-apple-hairline">
            <Calendar className="w-4 h-4 text-apple-text-tertiary" />
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              className="text-xs font-semibold text-apple-text outline-none bg-transparent"
            />
            <span className="text-apple-text-tertiary">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              className="text-xs font-semibold text-apple-text outline-none bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2 pr-3 border-r border-apple-hairline">
            <User className="w-4 h-4 text-apple-text-tertiary" />
            <select
              value={asesorId ?? ''}
              onChange={e => setAsesorId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="text-xs font-semibold text-apple-text outline-none bg-transparent cursor-pointer"
            >
              <option value="">Todos los asesores</option>
              {asesores.map(a => (
                <option key={a.id} value={a.id}>{a.nombre_completo}</option>
              ))}
            </select>
          </div>

          {activeTab === 'alto_valor' && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-apple-text-tertiary" />
              <span className="text-xs font-semibold text-apple-text-secondary">Monto mínimo</span>
              <input
                type="number"
                step={1000000}
                value={montoMin}
                onChange={e => setMontoMin(parseFloat(e.target.value) || 0)}
                className="text-xs font-semibold text-apple-text outline-none bg-transparent w-28"
              />
            </div>
          )}
        </div>

        {/* ── Contenido activo ── */}
        {activeTab === 'primer_contacto' && (
          <LeadRadarPanel
            leads={primerContacto}
            loading={loadingPrimerContacto}
            emptyLabel="No hay leads asignados sin contactar en este período/filtro."
          />
        )}
        {activeTab === 'seguimiento' && (
          <LeadRadarPanel
            leads={seguimiento}
            loading={loadingSeguimiento}
            emptyLabel="No hay leads estancados en Seguimiento en este período/filtro."
            onRegistrarIntento={handleRegistrarIntento}
          />
        )}
        {activeTab === 'alto_valor' && (
          <LeadRadarPanel
            leads={altoValor}
            loading={loadingAltoValor}
            emptyLabel="No hay leads de alto valor sin ODP en este período/filtro."
          />
        )}
        {activeTab === 'lineamiento' && (
          <LineamientoDelDia
            asesorId={asesorId}
            asesorNombre={asesores.find(a => a.id === asesorId)?.nombre_completo}
          />
        )}
        {activeTab === 'motivos' && (
          <MotivosPerdidaPanel motivos={resumen?.motivos_perdida || []} loading={loadingResumen} />
        )}
        {activeTab === 'buscador' && (
          <BuscadorAvanzadoPanel fechaDesde={fechaDesde} fechaHasta={fechaHasta} asesorId={asesorId} />
        )}
      </div>
    </div>
  );
};

export default SupervisionCRMPage;
