import React, { useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Users, Target, Clock, Flame,
  CheckCircle2, XCircle, Phone, BarChart3, Activity, Award
} from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: { value: number; positive: boolean };
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon, color, trend }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title}</span>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
    </div>
    <div>
      <p className="text-3xl font-black text-slate-800 leading-none">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>}
    </div>
    {trend && (
      <div className={`flex items-center gap-1 text-xs font-bold ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
        {trend.positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{trend.positive ? '+' : ''}{trend.value}% vs mes anterior</span>
      </div>
    )}
  </div>
);

interface FunnelBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

const FunnelBar: React.FC<FunnelBarProps> = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-slate-600 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 w-16 justify-end shrink-0">
        <span className="text-xs font-black text-slate-700">{count}</span>
        <span className="text-xs text-slate-400">({pct}%)</span>
      </div>
    </div>
  );
};

// Leads dummy compartidos para el cálculo de métricas
const DUMMY_LEADS = [
  { id: 1, estado_crm: 'NUEVO', segmento: 'Institucional', producto_interes: 'Fachadas', intentos_seguimiento: 0, asesor_id: null, creado_en: '2026-04-01' },
  { id: 2, estado_crm: 'ASIGNADO', segmento: 'Cliente final', producto_interes: 'Cabina de baño', intentos_seguimiento: 1, asesor_id: 1, creado_en: '2026-04-02' },
  { id: 3, estado_crm: 'EN_CONTACTO', segmento: 'Industrial', producto_interes: 'Puerta corrediza', intentos_seguimiento: 2, asesor_id: 1, creado_en: '2026-04-02' },
  { id: 4, estado_crm: 'COTIZANDO', segmento: 'Arquitecto', producto_interes: 'Ventanería', intentos_seguimiento: 0, asesor_id: 2, creado_en: '2026-04-03' },
  { id: 5, estado_crm: 'APROBADO', segmento: 'Cliente final', producto_interes: 'Vidrio templado', intentos_seguimiento: 1, asesor_id: 1, creado_en: '2026-04-03' },
  { id: 6, estado_crm: 'PERDIDO', segmento: 'Industrial', producto_interes: 'Pasamanos', intentos_seguimiento: 3, asesor_id: 2, creado_en: '2026-04-04' },
  { id: 7, estado_crm: 'FRIO', segmento: 'Arquitecto', producto_interes: 'División oficina', intentos_seguimiento: 3, asesor_id: 1, creado_en: '2026-04-04' },
  { id: 8, estado_crm: 'APROBADO', segmento: 'Institucional', producto_interes: 'Fachadas', intentos_seguimiento: 0, asesor_id: 2, creado_en: '2026-04-05' },
  { id: 9, estado_crm: 'COTIZANDO', segmento: 'Cliente final', producto_interes: 'Pérgola', intentos_seguimiento: 1, asesor_id: 1, creado_en: '2026-04-05' },
  { id: 10, estado_crm: 'NUEVO', segmento: 'Intervid', producto_interes: 'Reposición vidrios', intentos_seguimiento: 0, asesor_id: null, creado_en: '2026-04-06' },
];

const ETAPAS = [
  { id: 'NUEVO', label: 'Bolsa Común', color: 'bg-slate-400' },
  { id: 'ASIGNADO', label: 'Asignados', color: 'bg-blue-500' },
  { id: 'EN_CONTACTO', label: 'En Contacto', color: 'bg-purple-500' },
  { id: 'COTIZANDO', label: 'Cotizando', color: 'bg-amber-500' },
  { id: 'VISITA_TECNICA', label: 'V. Técnica', color: 'bg-indigo-500' },
  { id: 'APROBADO', label: 'Aprobados', color: 'bg-emerald-500' },
  { id: 'FRIO', label: 'Enfriados', color: 'bg-gray-400' },
  { id: 'PERDIDO', label: 'Perdidos', color: 'bg-rose-500' },
];

const SEGMENTOS_COLOR: Record<string, string> = {
  'Arquitecto': 'bg-violet-100 text-violet-700',
  'Cliente final': 'bg-blue-100 text-blue-700',
  'Industrial': 'bg-amber-100 text-amber-700',
  'Institucional': 'bg-emerald-100 text-emerald-700',
  'Intervid': 'bg-fuchsia-100 text-fuchsia-700',
};

interface Props {
  /** ID del asesor actual (null = gerencia/admin/asistente, ve todo) */
  asesorId: number | null;
  esVistaGlobal: boolean;
}

const CRMMetrics: React.FC<Props> = ({ asesorId, esVistaGlobal }) => {
  // En producción esto vendrá del Redux store (leads reales de la API)
  // Por ahora usa los DUMMY_LEADS compartidos
  const leads = useMemo(() => {
    if (esVistaGlobal) return DUMMY_LEADS;
    return DUMMY_LEADS.filter(l => l.asesor_id === asesorId);
  }, [asesorId, esVistaGlobal]);

  const total = leads.length;
  const aprobados = leads.filter(l => l.estado_crm === 'APROBADO').length;
  const perdidos = leads.filter(l => l.estado_crm === 'PERDIDO').length;
  const frios = leads.filter(l => l.estado_crm === 'FRIO').length;
  const enProceso = leads.filter(l => !['APROBADO', 'PERDIDO', 'FRIO'].includes(l.estado_crm)).length;
  const tasaConversion = total > 0 ? Math.round((aprobados / total) * 100) : 0;
  const tasaPerdida = total > 0 ? Math.round((perdidos / total) * 100) : 0;
  const alertasSeguimiento = leads.filter(l => l.intentos_seguimiento >= 2).length;

  // Distribución por segmento
  const porSegmento = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { map[l.segmento] = (map[l.segmento] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  // Producto más solicitado
  const productoTop = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach(l => { map[l.producto_interes] = (map[l.producto_interes] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Leads"
          value={total}
          subtitle={esVistaGlobal ? 'Todos los asesores' : 'Mis leads'}
          icon={<Users className="w-4 h-4 text-white" />}
          color="bg-indigo-500"
          trend={{ value: 12, positive: true }}
        />
        <MetricCard
          title="Aprobados"
          value={aprobados}
          subtitle={`${tasaConversion}% de conversión`}
          icon={<CheckCircle2 className="w-4 h-4 text-white" />}
          color="bg-emerald-500"
          trend={{ value: 8, positive: true }}
        />
        <MetricCard
          title="En proceso"
          value={enProceso}
          subtitle="Activos en el embudo"
          icon={<Activity className="w-4 h-4 text-white" />}
          color="bg-amber-500"
        />
        <MetricCard
          title="Alertas 3-Touch"
          value={alertasSeguimiento}
          subtitle="Requieren acción urgente"
          icon={<Flame className="w-4 h-4 text-white" />}
          color="bg-rose-500"
          trend={{ value: alertasSeguimiento, positive: false }}
        />
      </div>

      {/* Segunda fila KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Perdidos"
          value={perdidos}
          subtitle={`${tasaPerdida}% del total`}
          icon={<XCircle className="w-4 h-4 text-white" />}
          color="bg-rose-400"
        />
        <MetricCard
          title="Enfriados"
          value={frios}
          subtitle="3 intentos sin respuesta"
          icon={<Clock className="w-4 h-4 text-white" />}
          color="bg-slate-400"
        />
        <MetricCard
          title="Tasa de cierre"
          value={`${tasaConversion}%`}
          subtitle="Leads → Aprobados"
          icon={<Target className="w-4 h-4 text-white" />}
          color="bg-violet-500"
          trend={{ value: 3, positive: true }}
        />
        <MetricCard
          title="Producto Top"
          value={productoTop}
          subtitle="Más solicitado"
          icon={<Award className="w-4 h-4 text-white" />}
          color="bg-fuchsia-500"
        />
      </div>

      {/* Embudo de ventas + Distribución por Segmento */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Embudo */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-indigo-500" />
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Embudo de Ventas</h3>
          </div>
          <div className="space-y-3">
            {ETAPAS.map(e => (
              <FunnelBar
                key={e.id}
                label={e.label}
                count={leads.filter(l => l.estado_crm === e.id).length}
                total={total}
                color={e.color}
              />
            ))}
          </div>
        </div>

        {/* Distribución por segmento */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Phone className="w-5 h-5 text-violet-500" />
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Por Segmento</h3>
          </div>
          {porSegmento.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Sin datos</div>
          ) : (
            <div className="space-y-3">
              {porSegmento.map(([seg, count]) => (
                <div key={seg} className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${SEGMENTOS_COLOR[seg] || 'bg-slate-100 text-slate-700'}`}>
                    {seg}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="w-28 bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-700"
                        style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-black text-slate-700 w-4">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Banner informativo de vista */}
      {!esVistaGlobal && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center gap-3">
          <Target className="w-5 h-5 text-indigo-500 shrink-0" />
          <p className="text-sm text-indigo-700 font-medium">
            Estás viendo <strong>solo tus métricas personales</strong>. Gerencia tiene visibilidad de todos los asesores.
          </p>
        </div>
      )}
    </div>
  );
};

export default CRMMetrics;
