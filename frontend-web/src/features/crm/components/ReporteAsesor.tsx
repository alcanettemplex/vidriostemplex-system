import React, { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { AlertCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { toast } from 'react-toastify';
import { apiGetReporteAsesor, apiGetAsesores } from '../crmService';
import { IconDollar, IconTarget, IconLeads, IconClock, IconCheck, IconBarChart, IconActivity } from './CRMIcons';

const fmtCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0, notation: 'compact' }).format(v);

const ETAPA_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NUEVO:          { label: 'Bolsa Común',  color: 'bg-slate-400',   bg: 'bg-slate-50' },
  ASIGNADO:       { label: 'Asignado',     color: 'bg-blue-500',    bg: 'bg-blue-50' },
  EN_CONTACTO:    { label: 'En Contacto',  color: 'bg-violet-500',  bg: 'bg-violet-50' },
  COTIZANDO:      { label: 'Cotizando',    color: 'bg-amber-500',   bg: 'bg-amber-50' },
  VISITA_TECNICA: { label: 'V. Técnica',   color: 'bg-indigo-500',  bg: 'bg-indigo-50' },
  FRIO:           { label: 'Frío',         color: 'bg-sky-400',     bg: 'bg-sky-50' },
  APROBADO:       { label: 'Aprobado',     color: 'bg-emerald-500', bg: 'bg-emerald-50' },
  PERDIDO:        { label: 'Perdido',      color: 'bg-rose-500',    bg: 'bg-rose-50' },
};

interface KPIProps { label: string; value: string; sub?: string; icon: React.ReactNode; border: string; bg: string; }
const KPI: React.FC<KPIProps> = ({ label, value, sub, icon, border, bg }) => (
  <div className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm border-l-4 ${border} flex flex-col gap-1.5`}>
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
    </div>
    <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
    {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
  </div>
);

interface Props { esVistaGlobal: boolean; mes?: number; anio?: number; }

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ReporteAsesor: React.FC<Props> = ({ esVistaGlobal, mes, anio }) => {
  const user = useSelector((state: any) => state.auth.user);
  const [reporte, setReporte] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asesores, setAsesores] = useState<any[]>([]);
  const [asesorSeleccionado, setAsesorSeleccionado] = useState<number | undefined>(undefined);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const periodoLabel = mes && anio ? `${MONTH_NAMES[mes - 1]} ${anio}` : 'Acumulado';

  const cargarAsesores = useCallback(async () => {
    if (!esVistaGlobal) return;
    try {
      const { data } = await apiGetAsesores();
      const filtrados = (data || []).filter((u: any) =>
        ['asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'].includes(u.rol)
      );
      setAsesores(filtrados);
    } catch { /* silencioso */ }
  }, [esVistaGlobal]);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await apiGetReporteAsesor(mes, anio, asesorSeleccionado);
      setReporte(data);
    } catch {
      setError('No se pudo cargar el reporte.');
    } finally {
      setLoading(false);
    }
  }, [mes, anio, asesorSeleccionado]);

  useEffect(() => { cargarAsesores(); }, [cargarAsesores]);
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
      <p className="text-slate-600 text-sm font-semibold">{error || 'Sin datos'}</p>
      <button onClick={cargar} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold">Reintentar</button>
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

  return (
    <div className="space-y-5 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-800">Reporte de Actividad</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {asesor} — {periodoLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de asesor (solo admin/gerencia) */}
          {esVistaGlobal && asesores.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm min-w-[160px] justify-between"
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
                    className="w-full text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Vista Global (todos)
                  </button>
                  {asesores.map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => { setAsesorSeleccionado(a.id); setDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 truncate"
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
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Leads Asignados" value={String(leads_asignados)}
          sub={`${leads_activos} activos`}
          icon={<IconLeads size={16} className="text-violet-600" />}
          border="border-l-violet-500" bg="bg-violet-50" />
        <KPI label="Contactos" value={String(contactos_realizados)}
          sub={`${seguimientos} seguimientos`}
          icon={<IconActivity size={16} className="text-blue-600" />}
          border="border-l-blue-500" bg="bg-blue-50" />
        <KPI label="Tasa de Conversión" value={`${tasa_conversion}%`}
          sub={`${leads_aprobados} aprobados`}
          icon={<IconTarget size={16} className="text-emerald-600" />}
          border="border-l-emerald-500" bg="bg-emerald-50" />
        <KPI label="Monto Gestionado" value={fmtCOP(monto_gestionado)}
          sub={`${cambios_estado} movimientos`}
          icon={<IconDollar size={16} className="text-indigo-600" />}
          border="border-l-indigo-500" bg="bg-indigo-50" />
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Aprobados', val: leads_aprobados, desc: 'Leads cerrados como ganados en el periodo', color: 'bg-emerald-50 border-emerald-100', txt: 'text-emerald-700' },
          { label: 'Perdidos',  val: leads_perdidos,  desc: 'Leads cerrados sin conversión en el periodo', color: 'bg-rose-50 border-rose-100',       txt: 'text-rose-600'    },
          { label: 'Frío',      val: (leads_por_etapa as any)['FRIO'] || 0, desc: 'Leads pausados por baja probabilidad de cierre', color: 'bg-sky-50 border-sky-100', txt: 'text-sky-600' },
          { label: 'T° 1ª Respuesta', val: `${tiempo_prom_primera_respuesta_h}h`, desc: 'Horas promedio hasta el primer contacto con el lead',
            color: tiempo_prom_primera_respuesta_h > 4 ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100',
            txt: tiempo_prom_primera_respuesta_h > 4 ? 'text-rose-600' : 'text-amber-600' },
        ].map(k => (
          <div key={k.label} className={`${k.color} border rounded-xl p-4 flex items-center gap-3`}>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">{k.label}</p>
              <p className={`text-xl font-black ${k.txt}`}>{k.val}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-snug">{k.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Embudo personal + Resultados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Embudo activo (cuello de botella) */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <IconBarChart size={16} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">Embudo Personal</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Leads activos por etapa</p>
            </div>
            {etapa_cuello && (
              <span className="ml-auto text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                ⚠ Cuello: {ETAPA_CONFIG[etapa_cuello]?.label || etapa_cuello}
              </span>
            )}
          </div>
          {etapasActivas.length === 0 ? (
            <p className="text-center text-slate-300 text-sm py-6">Sin leads activos</p>
          ) : (
            <div className="space-y-3">
              {etapasActivas.map(([etapa, count]) => {
                const cfg = ETAPA_CONFIG[etapa] || { label: etapa, color: 'bg-slate-400', bg: 'bg-slate-50' };
                const pct = (count / maxEtapa) * 100;
                const esCuello = etapa === etapa_cuello;
                return (
                  <div key={etapa} className={`rounded-xl p-3 border ${esCuello ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100 ' + cfg.bg}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-700">{cfg.label}</span>
                      <span className={`text-xs font-black ${esCuello ? 'text-amber-600' : 'text-slate-600'}`}>{count} leads</span>
                    </div>
                    <div className="h-2 bg-white rounded-full overflow-hidden border border-slate-100">
                      <div
                        className={`h-full rounded-full ${cfg.color} transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Resultados (aprobados/perdidos/fríos) */}
          {etapasResultado.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-3 gap-3 text-center">
              {etapasResultado.map(([etapa, count]) => {
                const cfg = ETAPA_CONFIG[etapa];
                return (
                  <div key={etapa}>
                    <p className="text-lg font-black text-slate-800">{count}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{cfg?.label || etapa}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Motivos de pérdida + Actividad */}
        <div className="space-y-4">
          {/* Motivos de pérdida */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
                <IconTarget size={16} className="text-rose-500" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">Razones de Pérdida</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Motivos registrados al cerrar un lead como PERDIDO en el periodo</p>
              </div>
            </div>
            {motivosList.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-1">🎯</p>
                <p className="text-sm font-bold text-slate-400">Sin pérdidas en este periodo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {motivosList.map((m, i) => {
                  const total = motivosList.reduce((s, x) => s + x.count, 0) || 1;
                  const pct = Math.round((m.count / total) * 100);
                  const colors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-slate-400'];
                  return (
                    <div key={m.motivo}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-bold text-slate-600 flex-1 mr-2 truncate">{m.motivo}</span>
                        <span className="text-[10px] font-black text-slate-500 whitespace-nowrap">{m.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[i % colors.length]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumen actividad */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <IconCheck size={16} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">Actividad Total</h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Resumen de todas las interacciones registradas por el asesor en el periodo</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Contactos', val: contactos_realizados, icon: '📞' },
                { label: 'Seguimientos', val: seguimientos, icon: '🔄' },
                { label: 'Movimientos', val: cambios_estado, icon: '↔️' },
                { label: 'T° Respuesta', val: `${tiempo_prom_primera_respuesta_h}h`, icon: '⏱' },
              ].map(item => (
                <div key={item.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-lg font-black text-slate-800 mt-0.5">{item.val}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReporteAsesor;
