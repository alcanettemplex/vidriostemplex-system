import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Crosshair, ArrowLeft, RefreshCw, Gem, Clock3, TrendingDown, Target,
  Calendar, User, DollarSign,
} from 'lucide-react';
import KPICard from './components/KPICard';
import LeadRadarPanel from './components/LeadRadarPanel';
import MotivosPerdidaPanel from './components/MotivosPerdidaPanel';
import { apiGetSupervisionResumen, apiGetSupervisionAltoValor, apiGetSupervisionSeguimiento } from './supervisionService';
import { apiGetAsesores, apiRegisterLeadSeguimiento } from '../crm/crmService';
import { SupervisionLeadItem, SupervisionResumen } from './types';

type Tab = 'alto_valor' | 'seguimiento' | 'motivos';

const primerDiaMesActual = (): string => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
};

const hoyISO = (): string => new Date().toISOString().split('T')[0];

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const SupervisionCRMPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('alto_valor');
  const [fechaDesde, setFechaDesde] = useState(primerDiaMesActual());
  const [fechaHasta, setFechaHasta] = useState(hoyISO());
  const [asesorId, setAsesorId] = useState<number | undefined>(undefined);
  const [montoMin, setMontoMin] = useState<number>(10000000);
  const [asesores, setAsesores] = useState<any[]>([]);

  const [resumen, setResumen] = useState<SupervisionResumen | null>(null);
  const [altoValor, setAltoValor] = useState<SupervisionLeadItem[]>([]);
  const [seguimiento, setSeguimiento] = useState<SupervisionLeadItem[]>([]);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [loadingAltoValor, setLoadingAltoValor] = useState(false);
  const [loadingSeguimiento, setLoadingSeguimiento] = useState(false);

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

  const cargarTodo = useCallback(() => {
    cargarResumen();
    cargarAltoValor();
    cargarSeguimiento();
  }, [cargarResumen, cargarAltoValor, cargarSeguimiento]);

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
  const motivoPrincipal = resumen?.motivos_perdida?.[0];
  const totalPerdidos = resumen?.motivos_perdida?.reduce((s, m) => s + m.total, 0) || 0;
  const pctMotivoPrincipal = motivoPrincipal && totalPerdidos > 0
    ? Math.round((motivoPrincipal.total / totalPerdidos) * 100) : 0;

  return (
    <div
      className="min-h-screen"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", backgroundColor: '#F6F5FC' }}
    >
      {/* ── Barra superior ── */}
      <header className="bg-[#12102A] px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0">
              <Crosshair className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-extrabold text-sm leading-tight">Supervisión CRM</p>
              <p className="text-slate-400 text-[11px] font-medium">Centro de control comercial</p>
            </div>
          </div>

          {/* Navegación en píldora */}
          <nav className="hidden md:flex items-center gap-1 bg-white/5 rounded-2xl p-1">
            {([
              { key: 'alto_valor', label: 'Alto Valor' },
              { key: 'seguimiento', label: 'Cola Seguimiento' },
              { key: 'motivos', label: 'Motivos de Pérdida' },
            ] as { key: Tab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === t.key ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={cargarTodo}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              title="Recargar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Salir
            </Link>
          </div>
        </div>

        {/* Nav en píldora — mobile */}
        <nav className="flex md:hidden items-center gap-1 bg-white/5 rounded-2xl p-1 mt-3 max-w-[1400px] mx-auto">
          {([
            { key: 'alto_valor', label: 'Alto Valor' },
            { key: 'seguimiento', label: 'Seguimiento' },
            { key: 'motivos', label: 'Pérdidas' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                activeTab === t.key ? 'bg-white text-slate-900' : 'text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <KPICard
            label="Conversión actual"
            value={loadingResumen ? '—' : `${resumen?.tasa_conversion_actual ?? 0}%`}
            icon={Target}
            accent="indigo"
            progress={{ current: resumen?.tasa_conversion_actual ?? 0, target: resumen?.meta_conversion ?? 20, unit: '%' }}
          />
          <KPICard
            label="Alto valor sin ODP"
            value={loadingAltoValor ? '—' : String(altoValor.length)}
            sublabel={loadingAltoValor ? undefined : `${fmtCOP(totalAltoValorMonto)} en juego`}
            icon={Gem}
            accent="violet"
          />
          <KPICard
            label="Estancados en seguimiento"
            value={loadingSeguimiento ? '—' : String(seguimiento.length)}
            sublabel={loadingSeguimiento ? undefined : `${seguimientoCriticos} crítico${seguimientoCriticos !== 1 ? 's' : ''} (≥7d)`}
            icon={Clock3}
            accent="amber"
          />
          <KPICard
            label="Motivo principal de pérdida"
            value={loadingResumen ? '—' : (motivoPrincipal ? `${pctMotivoPrincipal}%` : '—')}
            sublabel={loadingResumen ? undefined : (motivoPrincipal?.motivo || 'Sin pérdidas en el período')}
            icon={TrendingDown}
            accent="rose"
          />
        </div>

        {/* ── Filtros ── */}
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              className="text-xs font-bold text-slate-600 outline-none bg-transparent"
            />
            <span className="text-slate-300">→</span>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              className="text-xs font-bold text-slate-600 outline-none bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2 pr-3 border-r border-slate-100">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={asesorId ?? ''}
              onChange={e => setAsesorId(e.target.value ? parseInt(e.target.value) : undefined)}
              className="text-xs font-bold text-slate-600 outline-none bg-transparent cursor-pointer"
            >
              <option value="">Todos los asesores</option>
              {asesores.map(a => (
                <option key={a.id} value={a.id}>{a.nombre_completo}</option>
              ))}
            </select>
          </div>

          {activeTab === 'alto_valor' && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-400">Monto mínimo</span>
              <input
                type="number"
                step={1000000}
                value={montoMin}
                onChange={e => setMontoMin(parseFloat(e.target.value) || 0)}
                className="text-xs font-bold text-slate-600 outline-none bg-transparent w-28"
              />
            </div>
          )}
        </div>

        {/* ── Contenido activo ── */}
        {activeTab === 'alto_valor' && (
          <LeadRadarPanel
            leads={altoValor}
            loading={loadingAltoValor}
            emptyLabel="No hay leads de alto valor sin ODP en este período/filtro."
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
        {activeTab === 'motivos' && (
          <MotivosPerdidaPanel motivos={resumen?.motivos_perdida || []} loading={loadingResumen} />
        )}
      </div>
    </div>
  );
};

export default SupervisionCRMPage;
